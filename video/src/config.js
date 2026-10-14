import 'dotenv/config';

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  allowedUserIds: (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  ttsVoice: process.env.TTS_VOICE || 'vi-VN-HoaiMyNeural',
  ttsRate: process.env.TTS_RATE || '+10%',
  edgeTtsCmd: process.env.EDGE_TTS_CMD || 'edge-tts',

  renderQuality: process.env.RENDER_QUALITY || 'standard',
  renderFps: num(process.env.RENDER_FPS, 30),
  renderConcurrency: num(process.env.RENDER_CONCURRENCY, 1),
  maxQueue: num(process.env.MAX_QUEUE, 5),
  keepWorkdir: process.env.KEEP_WORKDIR === 'true',

  // Khoảng nghỉ giữa các cảnh (giây) để giọng đọc không dính liền nhau
  sceneGap: 0.3,
  // Giới hạn gửi file của Telegram Bot API là 50MB, chừa biên an toàn
  telegramMaxBytes: 48 * 1024 * 1024,
  width: 1080,
  height: 1920,
};
