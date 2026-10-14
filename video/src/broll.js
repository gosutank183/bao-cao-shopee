/**
 * Lấy clip người thật miễn phí làm nền cho từng cảnh, rồi dùng ffmpeg
 * cắt/lặp đúng thời lượng cảnh, khung dọc 1080x1920, bỏ tiếng.
 *
 * Nguồn (dùng nguồn nào có key, ưu tiên theo thứ tự):
 *   PEXELS_API_KEY   https://www.pexels.com/api/   (có clip dọc)
 *   PIXABAY_API_KEY  https://pixabay.com/api/docs/ (key hiện ngay sau khi đăng nhập)
 */
import fs from 'node:fs';
import path from 'node:path';
import { run } from './proc.js';

const pexelsKey = () => process.env.PEXELS_API_KEY || '';
const pixabayKey = () => process.env.PIXABAY_API_KEY || '';

export const brollEnabled = () => Boolean(pexelsKey() || pixabayKey());
export const brollSource = () => (pexelsKey() ? 'Pexels' : pixabayKey() ? 'Pixabay' : '');

// Mỗi nguồn trả về danh sách thống nhất: { id, duration, author, file: { link, width, height } }

async function searchPexels(query) {
  const params = new URLSearchParams({ query, orientation: 'portrait', size: 'medium', per_page: '15' });
  for (const base of ['https://api.pexels.com/videos/search', 'https://api.pexels.com/v1/videos/search']) {
    const res = await fetch(`${base}?${params}`, { headers: { Authorization: pexelsKey() } });
    if (res.status === 401 || res.status === 403) throw new Error('PEXELS_API_KEY không hợp lệ');
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    return ((await res.json()).videos || []).map((v) => {
      const files = (v.video_files || []).filter(
        (f) => f.file_type === 'video/mp4' && f.height > f.width && f.height >= 960 && f.height <= 2160
      );
      files.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
      return { id: `px${v.id}`, duration: v.duration, author: v.user?.name || '', file: files[0] };
    }).filter((v) => v.file);
  }
  throw new Error('Pexels: không tìm thấy endpoint');
}

async function searchPixabay(query) {
  const params = new URLSearchParams({
    key: pixabayKey(), q: query.slice(0, 100), video_type: 'film', safesearch: 'true', per_page: '30',
  });
  const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error(`PIXABAY_API_KEY không hợp lệ (${res.status})`);
  }
  if (!res.ok) throw new Error(`Pixabay ${res.status}`);
  const hits = (await res.json()).hits || [];

  const items = hits.map((h) => {
    const sizes = ['large', 'medium', 'small']
      .map((k) => h.videos?.[k])
      .filter((f) => f && f.url && f.width && f.height);
    // Clip dọc: lấy bản cao >= 1280. Clip ngang: lấy bản 4K (large) để cắt dọc vẫn nét,
    // không có 4K thì bản lớn nhất còn lại.
    const portrait = sizes.filter((f) => f.height > f.width && f.height >= 1280)
      .sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920))[0];
    const landscape = sizes.find((f) => f.width >= f.height);
    const f = portrait || landscape;
    return f && {
      id: `pb${h.id}`,
      duration: h.duration,
      author: h.user || '',
      portrait: Boolean(portrait),
      file: { link: f.url, width: f.width, height: f.height },
    };
  }).filter(Boolean);

  // Ưu tiên clip dọc (không phải cắt mất người)
  return [...items.filter((v) => v.portrait), ...items.filter((v) => !v.portrait)];
}

const search = (q) => (pexelsKey() ? searchPexels(q) : searchPixabay(q));

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải clip lỗi ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Gắn clip nền vào từng cảnh (scene.bgVideo). Lỗi ở cảnh nào thì cảnh đó
 * dùng nền màu như cũ, không làm hỏng cả video. Trả về danh sách tác giả.
 */
export async function attachBroll(script, workDir, log = console.log) {
  if (!brollEnabled()) return [];
  script.brollSource = brollSource();
  const used = new Set();
  const credits = new Set();
  const cache = new Map();

  for (const [i, scene] of script.scenes.entries()) {
    const queries = [scene.broll, script.broll_query, 'woman fashion outfit'].filter(Boolean);
    try {
      let chosen;
      for (const q of queries) {
        if (!cache.has(q)) cache.set(q, await search(q));
        const candidates = cache.get(q).filter((v) => !used.has(v.id));
        // Ưu tiên clip đủ dài để không phải lặp
        chosen = candidates.find((v) => v.duration >= scene.duration) || candidates[0];
        if (chosen) break;
      }
      if (!chosen) throw new Error('không tìm thấy clip phù hợp');
      used.add(chosen.id);

      const raw = path.join(workDir, `raw_${i}.mp4`);
      const out = `bg_${i}.mp4`;
      await download(chosen.file.link, raw);
      // Lặp nếu ngắn, phóng/cắt giữa về 1080x1920, đúng thời lượng cảnh, không tiếng
      await run('ffmpeg', [
        '-y', '-stream_loop', '-1', '-i', raw,
        '-t', String(scene.duration),
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        path.join(workDir, out),
      ], { timeoutMs: 300_000 });
      fs.rmSync(raw, { force: true });

      scene.bgVideo = out;
      if (chosen.author) credits.add(chosen.author);
      log(`  🎞️ Cảnh ${i + 1}: ${script.brollSource} ${chosen.id} ${chosen.file.width}x${chosen.file.height} (${scene.broll || script.broll_query})`);
    } catch (err) {
      log(`  ⚠️ Cảnh ${i + 1} không lấy được clip người (${err.message}), dùng nền màu`);
    }
  }
  return [...credits];
}
