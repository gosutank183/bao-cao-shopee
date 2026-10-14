/**
 * Chạy hằng ngày (Antigravity /schedule gọi lệnh này):
 *   npm run daily              # làm video cho báo cáo hôm nay
 *   npm run daily -- --force   # làm lại dù hôm nay đã làm rồi
 *   npm run daily -- --date 2026-10-14
 *
 * Luồng: lấy báo cáo từ GitHub -> tách từng sản phẩm -> Gemini viết kịch bản
 *        -> Edge-TTS -> HyperFrames render -> gửi video vào Telegram.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Telegram } from 'telegraf';
import { config } from './config.js';
import { makeVideo, cleanup, pruneOld, ROOT } from './pipeline.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

const REPO = process.env.REPORT_REPO || 'gosutank183/bao-cao-shopee';
const BRANCH = process.env.REPORT_BRANCH || 'main';
const COUNT = Number(process.env.DAILY_COUNT || 1);
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || config.allowedUserIds[0];

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD */
function todayVN() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

async function fetchReport(date) {
  // Trên GitHub Actions repo đã được checkout sẵn -> đọc file trực tiếp,
  // tránh việc raw.githubusercontent.com trả bản cache cũ vài phút sau khi push
  if (process.env.REPORT_LOCAL_DIR) {
    const local = path.resolve(process.env.REPORT_LOCAL_DIR, `${date}.md`);
    if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
    console.log(`Không thấy ${local}, chuyển sang tải từ GitHub...`);
  }
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/bao-cao/${date}.md`;
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  // Báo cáo có thể đẩy lên trễ vài phút -> thử lại tối đa 6 lần, mỗi lần cách 5 phút
  for (let i = 1; i <= 6; i++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.text();
    if (res.status !== 404) throw new Error(`Không tải được báo cáo (${res.status}): ${url}`);
    console.log(`Chưa có báo cáo ${date}, thử lại sau 5 phút (${i}/6)...`);
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
  }
  throw new Error(`Không tìm thấy báo cáo ngày ${date} sau 30 phút: ${url}`);
}

/** Tách các mục "1. **Tên sản phẩm**" ... trong phần Top sản phẩm. */
export function parseProducts(md) {
  const blocks = md.split(/\n(?=\d+\.\s+\*\*)/).slice(1);
  return blocks
    .map((b) => {
      const name = (b.match(/^\d+\.\s+\*\*(.+?)\*\*/) || [])[1];
      // Cắt tới hết mục (trước dòng --- hoặc heading kế tiếp), bỏ link và dấu markdown
      const body = b.split(/\n(?:---|#{1,6}\s)/)[0]
        .replace(/\(?\[([^\]]+)\]\([^)]+\)\)?/g, '$1')
        .replace(/\*\*/g, '')
        .trim();
      return name ? { name: name.trim(), text: body } : null;
    })
    .filter(Boolean);
}

async function main() {
  if (!config.telegramToken || !CHAT_ID) {
    throw new Error('Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID/ALLOWED_USER_IDS trong .env');
  }
  const tg = new Telegram(config.telegramToken);
  const date = dateArg || todayVN();

  const doneFile = path.join(ROOT, 'work', `daily-done-${date}.json`);
  if (!force && fs.existsSync(doneFile)) {
    console.log(`Hôm nay (${date}) đã làm video rồi. Dùng --force để làm lại.`);
    return;
  }

  console.log(`📥 Lấy báo cáo ${REPO} ngày ${date}...`);
  const md = await fetchReport(date);
  const products = parseProducts(md).slice(0, COUNT);
  if (!products.length) throw new Error('Không tách được sản phẩm nào trong báo cáo (định dạng báo cáo có thể đã đổi).');

  const done = [];
  const failed = [];
  for (const [i, p] of products.entries()) {
    console.log(`\n▶ [${i + 1}/${products.length}] ${p.name}`);
    const text = `Sản phẩm: ${p.name}\n${p.text}\n\nLưu ý: đây là sản phẩm theo xu hướng, giá là khoảng tham khảo ("chỉ từ..."), không có số liệu đã bán nên không được nói số đã bán hay số sao đánh giá.`;
    try {
      const res = await makeVideo({ text, onStatus: (m) => console.log('  ' + m) });
      await tg.sendVideo(CHAT_ID, { source: fs.createReadStream(res.videoPath) }, {
        caption: `🎬 ${date} · #${i + 1} ${p.name}\n⏱️ ${res.duration.toFixed(1)}s`,
        width: config.width,
        height: config.height,
        supports_streaming: true,
      });
      await tg.sendMessage(CHAT_ID, `📝 Lời thoại #${i + 1}:\n${res.script.scenes.map((s) => s.voice_text).join('\n')}`);
      cleanup(res.workDir);
      done.push(p.name);
      console.log('  ✅ Đã gửi vào Telegram');
    } catch (err) {
      console.error(`  ❌ ${err.message}`);
      failed.push(`${p.name}: ${String(err.message).split('\n')[0]}`);
    }
  }

  if (done.length) {
    fs.mkdirSync(path.dirname(doneFile), { recursive: true });
    fs.writeFileSync(doneFile, JSON.stringify({ date, done, failed }, null, 2));
  }
  if (failed.length) {
    await tg.sendMessage(CHAT_ID, `⚠️ Video ngày ${date}: lỗi ${failed.length}/${products.length}\n${failed.join('\n')}`).catch(() => {});
    throw new Error(`${failed.length} video lỗi`);
  }
  console.log(`\n🎉 Xong ${done.length} video cho ngày ${date}.`);
}

pruneOld(48);
main().catch((err) => {
  console.error('\nDAILY FAILED:', err.message);
  process.exit(1);
});
