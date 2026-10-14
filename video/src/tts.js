import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { run } from './proc.js';
import { getDuration } from './media.js';

/**
 * Tạo giọng đọc bằng Edge-TTS (miễn phí) và đo thời lượng thật.
 * Văn bản được ghi ra file rồi truyền bằng --file, không bao giờ đi qua shell.
 */
export async function synthesize(text, outMp3) {
  const txtFile = outMp3.replace(/\.mp3$/, '.txt');
  fs.writeFileSync(txtFile, text, 'utf8');

  let lastErr;
  // Edge-TTS đôi khi lỗi mạng tạm thời -> thử lại 3 lần
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await run(config.edgeTtsCmd, [
        '--voice', config.ttsVoice,
        `--rate=${config.ttsRate}`,
        '--file', txtFile,
        '--write-media', outMp3,
      ], { timeoutMs: 60_000 });
      if (fs.existsSync(outMp3) && fs.statSync(outMp3).size > 0) {
        return await getDuration(outMp3);
      }
      throw new Error('edge-tts không tạo ra file âm thanh');
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`TTS thất bại (${path.basename(outMp3)}): ${lastErr.message}`);
}
