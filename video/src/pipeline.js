import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { config } from './config.js';
import { writeScript } from './director.js';
import { synthesize } from './tts.js';
import { buildHtml } from './template.js';
import { fitForTelegram } from './media.js';
import { run } from './proc.js';
import { attachBroll, brollEnabled } from './broll.js';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK_ROOT = path.join(ROOT, 'work');

function gsapPath() {
  return require.resolve('gsap/dist/gsap.min.js');
}

/**
 * Chạy toàn bộ pipeline.
 * @param {object} p
 * @param {string} p.text           nội dung thô
 * @param {Buffer} [p.image]        ảnh sản phẩm (tùy chọn)
 * @param {(msg:string)=>any} [p.onStatus]  báo tiến độ
 * @param {object} [p.script]       truyền sẵn kịch bản để bỏ qua bước Gemini
 * @param {boolean} [p.skipRender]  chỉ dựng index.html, không render (để xem trước)
 */
export async function makeVideo({ text, image, onStatus = () => {}, script, skipRender = false }) {
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
  const workDir = path.join(WORK_ROOT, id);
  fs.mkdirSync(workDir, { recursive: true });

  let success = false;
  try {
    // 1. Kịch bản
    if (!script) {
      await onStatus('🧠 Đang viết kịch bản...');
      script = await writeScript(text);
    }
    fs.writeFileSync(path.join(workDir, 'script.json'), JSON.stringify(script, null, 2));

    // 2. Giọng đọc + đo thời lượng thật, xếp mốc thời gian nối tiếp
    await onStatus(`🎙️ Đang thu giọng cho "${script.title}" (${script.scenes.length} cảnh)...`);
    let t = 0;
    for (let i = 0; i < script.scenes.length; i++) {
      const s = script.scenes[i];
      const file = `voice_${i}.mp3`;
      if (!s.audioDuration) s.audioDuration = await synthesize(s.voice_text, path.join(workDir, file));
      s.audioFile = file;
      s.start = Math.round(t * 1000) / 1000;
      // Cảnh cuối giữ thêm 0.8s để người xem kịp thấy nút CTA
      const tail = i === script.scenes.length - 1 ? 0.8 : config.sceneGap;
      s.duration = Math.round((s.audioDuration + tail) * 1000) / 1000;
      t += s.duration;
    }

    // 3. Video người thật làm nền (chỉ khi không có ảnh sản phẩm và có PEXELS_API_KEY)
    let credits = [];
    if (!image && brollEnabled()) {
      await onStatus('🎞️ Đang tìm clip người mẫu trên Pexels...');
      credits = await attachBroll(script, workDir, (m) => console.log(m));
    }

    // 4. Tài nguyên + HTML
    fs.copyFileSync(gsapPath(), path.join(workDir, 'gsap.min.js'));
    let imageFile = null;
    if (image) {
      imageFile = 'product.jpg';
      fs.writeFileSync(path.join(workDir, imageFile), image);
    }
    const html = buildHtml(script, { imageFile, fps: config.renderFps });
    fs.writeFileSync(path.join(workDir, 'index.html'), html);
    fs.writeFileSync(path.join(workDir, 'script.json'), JSON.stringify(script, null, 2));

    if (skipRender) {
      success = true;
      return { workDir, script, duration: t, credits };
    }

    // 4. Kiểm tra lỗi composition trước khi tốn thời gian render
    await onStatus('🔎 Đang kiểm tra composition...');
    try {
      await run('npx', ['hyperframes', 'lint', '.'], { cwd: workDir, timeoutMs: 120_000 });
    } catch (err) {
      throw new Error(`HyperFrames lint báo lỗi:\n${err.message}`);
    }

    // 5. Render
    await onStatus(`🎬 Đang render ${t.toFixed(1)}s video (có thể mất vài phút)...`);
    const out = path.join(workDir, 'final.mp4');
    await run('npx', [
      'hyperframes', 'render',
      '-o', 'final.mp4',
      '-q', config.renderQuality,
      '--fps', String(config.renderFps),
    ], { cwd: workDir, timeoutMs: 30 * 60 * 1000 });
    if (!fs.existsSync(out)) throw new Error('Render xong nhưng không thấy file final.mp4');

    const videoPath = await fitForTelegram(out, config.telegramMaxBytes);
    success = true;
    return { workDir, script, duration: t, videoPath, credits };
  } finally {
    // Khi lỗi luôn giữ thư mục để xem lại; khi thành công thì bot tự dọn sau khi gửi
    if (!success) console.error(`[pipeline] Lỗi, giữ thư mục để kiểm tra: ${workDir}`);
  }
}

/** Xóa các thư mục làm việc (kể cả của lần lỗi) cũ hơn maxAgeHours. */
export function pruneOld(maxAgeHours = 24) {
  if (!fs.existsSync(WORK_ROOT)) return;
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  for (const name of fs.readdirSync(WORK_ROOT)) {
    const p = path.join(WORK_ROOT, name);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
    } catch { /* bỏ qua */ }
  }
}

export function cleanup(workDir) {
  if (config.keepWorkdir || !workDir) return;
  fs.rmSync(workDir, { recursive: true, force: true });
}
