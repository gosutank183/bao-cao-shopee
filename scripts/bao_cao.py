"""Tạo báo cáo thời trang hằng ngày bằng Gemini (miễn phí) và gửi Telegram.

Chạy trong GitHub Actions. Cần 3 biến môi trường:
GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

REPO_URL = "https://github.com/gosutank183/bao-cao-shopee/blob/main/bao-cao"
MODELS = [m.strip() for m in os.environ.get(
    "GEMINI_MODELS", "gemini-3.8-flash,gemini-3.6-flash,gemini-2.5-flash").split(",") if m.strip()]

# Các từ khóa tìm tin (Google News, 7 ngày gần nhất, tiếng Việt)
QUERIES = [
    "thời trang bán chạy Shopee",
    "TikTok Shop thời trang",
    "xu hướng thời trang giới trẻ",
    "thời trang thu đông",
    "Metric thương mại điện tử",
    "Shopee sale 11.11 OR 12.12",
    "không khí lạnh miền Bắc",
    "phối đồ hot trend TikTok",
]

now = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
DATE_ISO = now.strftime("%Y-%m-%d")
DATE_VN = now.strftime("%d/%m/%Y")


def http(url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def lay_tin():
    items, seen = [], set()
    for q in QUERIES:
        url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(q + " when:7d")
               + "&hl=vi&gl=VN&ceid=VN:vi")
        try:
            root = ET.fromstring(http(url))
        except Exception as e:  # bỏ qua từ khóa lỗi
            print("Lỗi RSS:", q, e, file=sys.stderr)
            continue
        for it in list(root.iter("item"))[:8]:
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            if not title or title in seen:
                continue
            seen.add(title)
            pub = it.findtext("pubDate") or ""
            try:
                pub = parsedate_to_datetime(pub).astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).strftime("%d/%m/%Y")
            except Exception:
                pass
            desc = re.sub(r"<[^>]+>", " ", it.findtext("description") or "")
            desc = re.sub(r"\s+", " ", desc).strip()[:300]
            items.append({"tieu_de": title, "link": link, "ngay": pub, "tom_tat": desc, "tu_khoa": q})
    return items


PROMPT = """Bạn là trợ lý nghiên cứu sản phẩm cho một người làm affiliate Shopee ở Việt Nam, ngách thời trang, chuyên làm video bán hàng ngắn. Hôm nay là {date} (giờ Việt Nam).

Dưới đây là danh sách tin tức 7 ngày gần nhất (JSON). CHỈ dùng thông tin trong danh sách này; không bịa số liệu doanh số; số liệu ước tính phải ghi rõ là ước tính; không trích nguyên văn quá 15 từ, hãy diễn đạt lại. Nếu tin không đủ để khẳng định món nào "bán chạy", hãy nói rõ là dựa trên xu hướng.

TIN TỨC:
{news}

Trả về JSON với đúng 2 trường:
"bao_cao": báo cáo Markdown tiếng Việt gồm: tiêu đề "# Báo cáo thời trang hot – {date}"; Top 5–10 sản phẩm/kiểu dáng thời trang đáng làm video, mỗi món gồm tên/kiểu, vì sao đang hot (dẫn nguồn bằng link Markdown lấy từ danh sách), mức giá phổ biến nếu tin có nêu, 1 gợi ý hook video ngắn; mục xu hướng/từ khóa đang lên; mục sự kiện sale/mùa vụ sắp tới; cuối cùng mục "## Nguồn:" liệt kê dạng [Tiêu đề](URL) các tin đã dùng.
"telegram": VĂN BẢN THUẦN (không Markdown, không dùng ký tự * _ ` [ ]), tối đa 3.300 ký tự. Dòng đầu: "📊 Báo cáo thời trang hot – {date}". Sau đó Top sản phẩm đánh số 1., 2., ... mỗi món 2–3 dòng (tên + lý do ngắn + hook video), rồi 2–3 dòng xu hướng/sự kiện sắp tới. KHÔNG thêm dòng link ở cuối."""


def goi_gemini(prompt):
    key = os.environ["GEMINI_API_KEY"]
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.6},
    }).encode()
    last = None
    for model in MODELS:
        for attempt in range(3):
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                raw = http(url, body, {"Content-Type": "application/json", "x-goog-api-key": key}, timeout=180)
                data = json.loads(raw)
                text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
                text = re.sub(r"^```(?:json)?|```$", "", text.strip()).strip()
                out = json.loads(text)
                print("Đã dùng model:", model)
                return out
            except Exception as e:
                last = e
                detail = e.read().decode()[:300] if hasattr(e, "read") else ""
                print(f"Lỗi {model} lần {attempt + 1}: {e} {detail}", file=sys.stderr)
                time.sleep(15)
    raise SystemExit(f"Gemini lỗi: {last}")


def lam_sach_telegram(t):
    t = re.sub(r"[*_`\[\]]", "", t).strip()
    dong_dau = f"📊 Báo cáo thời trang hot – {DATE_VN}"
    if not t.startswith("📊"):
        t = dong_dau + "\n\n" + t
    t = t[:3300].rstrip()
    return t + f"\n\nBáo cáo đầy đủ: {REPO_URL}/{DATE_ISO}.md"


def gui_telegram(text):
    token, chat = os.environ["TELEGRAM_BOT_TOKEN"], os.environ["TELEGRAM_CHAT_ID"]
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "disable_web_page_preview": "true"}).encode()
    http(f"https://api.telegram.org/bot{token}/sendMessage", data)


def main():
    tin = lay_tin()
    print("Số tin lấy được:", len(tin))
    if len(tin) < 3:
        gui_telegram(f"⚠️ Báo cáo {DATE_VN}: không lấy được tin tức hôm nay, chưa tạo báo cáo.")
        raise SystemExit("Quá ít tin")
    out = goi_gemini(PROMPT.format(date=DATE_VN, news=json.dumps(tin, ensure_ascii=False)))
    bao_cao = out["bao_cao"].strip() + "\n\n_Báo cáo tạo tự động bằng Gemini từ tin tức Google News._\n"
    telegram = lam_sach_telegram(out["telegram"])
    os.makedirs("bao-cao", exist_ok=True)
    with open(f"bao-cao/{DATE_ISO}.md", "w", encoding="utf-8") as f:
        f.write(bao_cao)
    with open("telegram.txt", "w", encoding="utf-8") as f:
        f.write(telegram + "\n")
    print("Đã ghi báo cáo", DATE_ISO)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "gui":
        with open("telegram.txt", encoding="utf-8") as f:
            gui_telegram(f.read())
    else:
        main()
