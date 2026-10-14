/**
 * Lấy clip người thật miễn phí từ Pexels làm nền cho từng cảnh,
 * rồi dùng ffmpeg cắt/lặp đúng thời lượng cảnh, khung dọc 1080x1920, bỏ tiếng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { run } from './proc.js';

const KEY = () => process.env.PEXELS_API_KEY || '';
const ENDPOINTS = ['https://api.pexels.com/videos/search', 'https://api.pexels.com/v1/videos/search'];

export const brollEnabled = () => Boolean(KEY());

async function search(query) {
  const params = new URLSearchParams({ query, orientation: 'portrait', size: 'medium', per_page: '15' });
  let lastErr;
  for (const base of ENDPOINTS) {
    const res = await fetch(`${base}?${params}`, { headers: { Authorization: KEY() } });
    if (res.ok) return (await res.json()).videos || [];
    lastErr = new Error(`Pexels ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new Error('PEXELS_API_KEY không hợp lệ');
    if (res.status !== 404) break;
  }
  throw lastErr;
}

/** Chọn file dọc có độ cao gần 1920 nhất (không lấy bản 4K cho nhẹ). */
function pickFile(video) {
  const files = (video.video_files || []).filter(
    (f) => f.file_type === 'video/mp4' && f.height > f.width && f.height >= 960 && f.height <= 2160
  );
  files.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
  return files[0];
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải clip lỗi ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Gắn clip nền vào từng cảnh (scene.bgVideo, scene.bgCredit).
 * Lỗi ở cảnh nào thì cảnh đó dùng nền màu như cũ, không làm hỏng cả video.
 */
export async function attachBroll(script, workDir, log = console.log) {
  if (!brollEnabled()) return [];
  const used = new Set();
  const credits = new Set();
  const cache = new Map();

  for (const [i, scene] of script.scenes.entries()) {
    const queries = [scene.broll, script.broll_query, 'woman fashion outfit'].filter(Boolean);
    try {
      let chosen;
      for (const q of queries) {
        if (!cache.has(q)) cache.set(q, await search(q));
        const candidates = cache.get(q).filter((v) => !used.has(v.id) && pickFile(v));
        // Ưu tiên clip đủ dài để không phải lặp
        chosen = candidates.find((v) => v.duration >= scene.duration) || candidates[0];
        if (chosen) break;
      }
      if (!chosen) throw new Error('không tìm thấy clip phù hợp');
      used.add(chosen.id);

      const raw = path.join(workDir, `raw_${i}.mp4`);
      const out = `bg_${i}.mp4`;
      await download(pickFile(chosen).link, raw);
      // Lặp nếu ngắn, phóng/cắt về 1080x1920, đúng thời lượng cảnh, không tiếng
      await run('ffmpeg', [
        '-y', '-stream_loop', '-1', '-i', raw,
        '-t', String(scene.duration),
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        path.join(workDir, out),
      ], { timeoutMs: 180_000 });
      fs.rmSync(raw, { force: true });

      scene.bgVideo = out;
      scene.bgCredit = chosen.user?.name || '';
      if (scene.bgCredit) credits.add(scene.bgCredit);
      log(`  🎞️ Cảnh ${i + 1}: clip Pexels #${chosen.id} (${scene.broll || script.broll_query})`);
    } catch (err) {
      log(`  ⚠️ Cảnh ${i + 1} không lấy được clip người (${err.message}), dùng nền màu`);
    }
  }
  return [...credits];
}
