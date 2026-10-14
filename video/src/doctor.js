/** Kiểm tra máy đã cài đủ công cụ chưa: npm run doctor */
import { createRequire } from 'node:module';
import { config } from './config.js';
import { run } from './proc.js';

const require = createRequire(import.meta.url);
let ok = true;

async function check(name, fn, hint) {
  try {
    const info = await fn();
    console.log(`✅ ${name}${info ? ' — ' + info : ''}`);
  } catch (err) {
    ok = false;
    console.log(`❌ ${name}\n   ${String(err.message).split('\n')[0]}\n   → ${hint}`);
  }
}

await check('Node.js >= 22', async () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`Đang dùng ${process.version}`);
  return process.version;
}, 'Cài Node.js 22 LTS trở lên: https://nodejs.org');

await check('ffmpeg', async () => (await run('ffmpeg', ['-version'])).stdout.split('\n')[0],
  'Windows: winget install Gyan.FFmpeg  (rồi mở lại terminal)');

await check('ffprobe', async () => { await run('ffprobe', ['-version']); },
  'Đi kèm ffmpeg; cài ffmpeg là có');

await check(`edge-tts (${config.edgeTtsCmd})`, async () => {
  await run(config.edgeTtsCmd, ['--list-voices'], { timeoutMs: 30_000 });
}, 'pip install edge-tts   (Windows nếu vẫn lỗi: đặt EDGE_TTS_CMD=python -m edge_tts trong .env)');

await check('gsap', async () => { require.resolve('gsap/dist/gsap.min.js'); }, 'npm install');

await check('hyperframes', async () => (await run('npx', ['hyperframes', '--version'], { timeoutMs: 120_000 })).stdout.trim(),
  'npm install  rồi chạy: npx hyperframes doctor');

await check('.env: TELEGRAM_BOT_TOKEN', async () => { if (!config.telegramToken) throw new Error('trống'); }, 'Lấy token từ @BotFather');
await check('.env: GEMINI_API_KEY', async () => { if (!config.geminiKey) throw new Error('trống'); }, 'https://aistudio.google.com/apikey');
await check('.env: ALLOWED_USER_IDS', async () => {
  if (!config.allowedUserIds.length) throw new Error('trống');
  return config.allowedUserIds.join(', ');
}, 'Chạy bot, nhắn /id để lấy ID, điền vào .env');

console.log(ok ? '\nMọi thứ sẵn sàng. Chạy: npm start' : '\nSửa các mục ❌ ở trên rồi chạy lại: npm run doctor');
