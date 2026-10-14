# Shopee Video Bot

Gửi mô tả sản phẩm (kèm ảnh nếu có) vào Telegram → nhận lại video bán hàng dọc 9:16.

```
Telegram ─► Gemini (kịch bản JSON) ─► Edge-TTS (giọng Việt, đo thời lượng thật)
        ─► index.html chuẩn HyperFrames + GSAP ─► hyperframes lint ─► render MP4 ─► Telegram
```

## Cài đặt (Windows)

Mở **PowerShell** và chạy lần lượt:

```powershell
winget install OpenJS.NodeJS.LTS      # Node.js 22+
winget install Gyan.FFmpeg            # ffmpeg + ffprobe
winget install Python.Python.3.12     # cho edge-tts
```

Đóng PowerShell, mở lại, rồi vào thư mục dự án:

```powershell
pip install edge-tts
npm install
copy .env.example .env
notepad .env                          # điền TELEGRAM_BOT_TOKEN, GEMINI_API_KEY
npx hyperframes doctor                # kiểm tra Chrome/FFmpeg cho HyperFrames
npm run doctor                        # kiểm tra toàn bộ
```

Lấy ID Telegram của bạn: chạy `npm start`, nhắn `/id` cho bot, điền số đó vào
`ALLOWED_USER_IDS` trong `.env`, rồi khởi động lại bot. Người không có trong danh
sách sẽ bị bot bỏ qua.

## Sử dụng

```powershell
npm start
```

Trong Telegram:
- Gửi đoạn mô tả: tên sản phẩm, công dụng, giá gốc/giá bán, ưu đãi, số đã bán...
- Hoặc gửi **ảnh sản phẩm kèm chú thích** là đoạn mô tả, ảnh sẽ nằm giữa video.
- `/queue` xem hàng đợi.

Bot gửi lại video và lời thoại (để copy làm mô tả bài đăng).

## Chạy tự động hằng ngày

`npm run daily` lấy báo cáo hôm nay từ `REPORT_REPO`, làm video cho `DAILY_COUNT`
sản phẩm đầu bảng và gửi vào Telegram. Mỗi ngày chỉ chạy một lần (thêm `--force` để
làm lại). Lên lịch bằng Antigravity `/schedule`; agent làm theo `AGENTS.md`.

## Thử không cần Telegram

```powershell
npm run make -- --demo --preview      # dựng index.html mẫu, không render
npm run make -- --demo                # render video mẫu (cần edge-tts)
npm run make -- "mô tả sản phẩm..." --image anh.jpg
```

Thư mục làm việc nằm trong `work/`. Muốn xem trước trong trình duyệt:
`cd work\<thư-mục>` rồi `npx hyperframes preview`.

## Tùy chỉnh

| Muốn đổi | Sửa ở đâu |
|---|---|
| Giọng nam/nữ, tốc độ đọc | `TTS_VOICE`, `TTS_RATE` trong `.env` |
| Render nhanh để thử | `RENDER_QUALITY=draft` |
| Phong cách kịch bản | lời nhắc `SYSTEM` trong `src/director.js` |
| Màu, chữ, bố cục, hiệu ứng | `src/template.js` (bảng `THEMES`, CSS, `sceneAnim`) |

## Lưu ý

- Render chạy bằng CPU (Chrome headless + FFmpeg). Video 30 giây thường mất vài phút.
  `RENDER_CONCURRENCY=1` là hợp lý cho laptop.
- Video trên 48MB được tự nén lại vì Telegram Bot API giới hạn 50MB.
- Lần render lỗi giữ lại thư mục trong `work/` để xem `script.json` và `index.html`;
  thư mục cũ hơn 24 giờ tự xóa.
- Nếu `edge-tts` báo không tìm thấy trên Windows, đặt `EDGE_TTS_CMD=python -m edge_tts`.
- Gemini chỉ được dặn dùng thông tin có trong nội dung bạn gửi; vẫn nên xem lại
  lời thoại trước khi đăng.
