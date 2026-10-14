import fs from 'node:fs';
import { run } from './proc.js';

/** Thời lượng chính xác (giây) của file âm thanh/video, đo bằng ffprobe. */
export async function getDuration(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Không đo được thời lượng: ${file}`);
  return Math.round(d * 1000) / 1000;
}

/**
 * Nếu video vượt giới hạn Telegram thì nén lại bằng ffmpeg.
 * Trả về đường dẫn file cuối cùng để gửi.
 */
export async function fitForTelegram(input, maxBytes) {
  const size = fs.statSync(input).size;
  if (size <= maxBytes) return input;

  const duration = await getDuration(input);
  // Bitrate video mục tiêu (kbps), chừa 128kbps cho âm thanh và 5% biên
  const videoKbps = Math.max(500, Math.floor(((maxBytes * 8) / duration / 1000) * 0.95 - 128));
  const output = input.replace(/\.mp4$/, '_tg.mp4');
  await run('ffmpeg', [
    '-y', '-i', input,
    '-c:v', 'libx264', '-preset', 'medium',
    '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    output,
  ]);
  return output;
}
