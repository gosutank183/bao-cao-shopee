/**
 * Sinh index.html chuẩn HyperFrames cho video bán hàng dọc 1080x1920.
 *
 * Bố cục track (thứ tự trong HTML cũng là thứ tự lớp, dưới -> trên):
 *   track 0  nền màu + ảnh sản phẩm (suốt video)
 *   track 4  video người thật từ Pexels, mỗi cảnh một clip (nếu có)
 *   track 5  lớp tối phía dưới để chữ dễ đọc trên video (nếu có)
 *   track 1  các cảnh chữ (nối tiếp nhau theo thời lượng giọng đọc)
 *   track 2  giọng đọc (mỗi cảnh một file mp3)
 *   track 3  thanh tiến trình + nhãn sản phẩm (suốt video)
 *
 * Animation dùng GSAP timeline ở trạng thái paused, đăng ký vào
 * window.__timelines[COMPOSITION_ID] để HyperFrames tua từng khung hình.
 */

export const COMPOSITION_ID = 'shopee-video';

const THEMES = {
  sunset: { bg1: '#ff5a1f', bg2: '#ee2a7b', accent: '#ffe14d', ink: '#1a0b14', card: '#fff7ef' },
  mint:   { bg1: '#00b894', bg2: '#0a7cbf', accent: '#fff36b', ink: '#04211c', card: '#f2fffb' },
  berry:  { bg1: '#7b2ff7', bg2: '#f107a3', accent: '#ffd23f', ink: '#1b0630', card: '#fbf5ff' },
  night:  { bg1: '#141e30', bg2: '#243b55', accent: '#ff7a18', ink: '#0b0f17', card: '#f5f7fb' },
};

const TYPE_LABEL = {
  hook: '',
  benefit: 'ĐIỂM CỘNG',
  proof: 'ĐƯỢC KIỂM CHỨNG',
  price: 'GIÁ HỜI',
  cta: '',
};

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Cỡ chữ headline co theo độ dài để luôn vừa 2-3 dòng. */
function headlineSize(text, compact) {
  const len = [...text].length;
  const max = compact ? 108 : 132;
  const min = compact ? 64 : 76;
  return Math.round(Math.max(min, Math.min(max, max - (len - 10) * 2.6)));
}

function sceneInner(scene, i, hasImage) {
  const h = escapeHtml(scene.headline);
  const sub = escapeHtml(scene.subline);
  const size = headlineSize(scene.headline, hasImage);
  const label = TYPE_LABEL[scene.type];

  if (scene.type === 'price' && scene.price_now) {
    return `
      <div class="tag" id="s${i}-tag">${escapeHtml(label)}</div>
      <div class="price-wrap" id="s${i}-main">
        ${scene.price_old ? `<div class="price-old">${escapeHtml(scene.price_old)}</div>` : ''}
        <div class="price-now">${escapeHtml(scene.price_now)}</div>
      </div>
      ${h ? `<div class="sub" id="s${i}-sub">${h}${sub ? ' · ' + sub : ''}</div>` : ''}`;
  }

  if (scene.type === 'cta') {
    return `
      <div class="headline" id="s${i}-main" style="font-size:${size}px">${h}</div>
      ${sub ? `<div class="sub" id="s${i}-sub">${sub}</div>` : ''}
      <div class="cta-btn" id="s${i}-btn">BẤM GIỎ HÀNG NGAY</div>
      <div class="cta-arrow" id="s${i}-arrow">▼</div>`;
  }

  return `
      ${label ? `<div class="tag" id="s${i}-tag">${escapeHtml(label)}</div>` : ''}
      <div class="headline ${scene.type === 'hook' ? 'hook' : ''}" id="s${i}-main" style="font-size:${size}px"><span>${h}</span></div>
      ${sub ? `<div class="sub" id="s${i}-sub">${sub}</div>` : ''}`;
}

function sceneAnim(scene, i, start, dur) {
  const t = r3(start);
  const out = r3(start + dur - 0.22);
  const lines = [];
  const has = (id) => `document.getElementById('${id}')`;

  lines.push(`if (${has(`s${i}-tag`)}) tl.from('#s${i}-tag', { y: -40, opacity: 0, duration: 0.35, ease: 'power2.out' }, ${t});`);

  if (scene.type === 'price') {
    lines.push(`tl.from('#s${i}-main', { scale: 0.3, rotation: -8, opacity: 0, duration: 0.55, ease: 'back.out(2.2)' }, ${r3(t + 0.08)});`);
    lines.push(`if (document.querySelector('#s${i}-main .price-old')) tl.from('#s${i}-main .price-old', { x: -60, opacity: 0, duration: 0.35 }, ${r3(t + 0.35)});`);
  } else if (scene.type === 'hook') {
    lines.push(`tl.from('#s${i}-main', { scale: 1.6, opacity: 0, duration: 0.45, ease: 'expo.out' }, ${t});`);
    lines.push(`tl.fromTo('#s${i}-main span', { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', duration: 0.35, ease: 'power2.out' }, ${t});`);
  } else {
    lines.push(`tl.from('#s${i}-main', { y: 90, opacity: 0, duration: 0.5, ease: 'back.out(1.6)' }, ${r3(t + 0.05)});`);
  }

  lines.push(`if (${has(`s${i}-sub`)}) tl.from('#s${i}-sub', { y: 40, opacity: 0, duration: 0.4, ease: 'power2.out' }, ${r3(t + 0.28)});`);

  if (scene.type === 'cta') {
    const pulses = Math.max(1, Math.floor((dur - 0.6) / 0.5));
    lines.push(`tl.from('#s${i}-btn', { scale: 0, opacity: 0, duration: 0.45, ease: 'back.out(2.5)' }, ${r3(t + 0.3)});`);
    lines.push(`tl.to('#s${i}-btn', { scale: 1.08, duration: 0.25, yoyo: true, repeat: ${pulses * 2 - 1}, ease: 'sine.inOut' }, ${r3(t + 0.8)});`);
    lines.push(`tl.fromTo('#s${i}-arrow', { y: -10 }, { y: 18, duration: 0.3, yoyo: true, repeat: ${pulses * 2 - 1}, ease: 'sine.inOut' }, ${r3(t + 0.8)});`);
  } else {
    // Mờ dần trước khi chuyển cảnh (cảnh cuối CTA giữ nguyên tới hết)
    lines.push(`tl.to('#s${i} .scene-inner', { opacity: 0, y: -30, duration: 0.2, ease: 'power1.in' }, ${out});`);
  }
  return lines.join('\n    ');
}

/**
 * @param {object} script  kết quả từ director.normalize, mỗi scene đã có
 *                         .start, .duration (khung hình) và .audioDuration, .audioFile
 * @param {object} opts    { imageFile?: string, fps?: number }
 */
export function buildHtml(script, { imageFile = null, fps = 30 } = {}) {
  const theme = THEMES[script.theme] || THEMES.sunset;
  const total = r3(script.scenes.reduce((m, s) => Math.max(m, s.start + s.duration), 0));
  const hasImage = Boolean(imageFile);
  // Ảnh sản phẩm được ưu tiên; không có ảnh thì dùng video người (nếu tìm được)
  const hasVideo = !hasImage && script.scenes.some((s) => s.bgVideo);
  const layout = hasImage ? 'with-image' : hasVideo ? 'with-video' : '';

  const videoClips = !hasVideo ? '' : script.scenes
    .filter((s) => s.bgVideo)
    .map((s) => `
    <video id="v${script.scenes.indexOf(s)}" class="clip bgv" src="${escapeHtml(s.bgVideo)}" muted playsinline
      data-start="${r3(s.start)}" data-duration="${r3(s.duration)}" data-track-index="4"></video>`)
    .join('');

  const sceneClips = script.scenes
    .map(
      (s, i) => `
    <section id="s${i}" class="clip scene ${layout} type-${s.type}"
      data-start="${r3(s.start)}" data-duration="${r3(s.duration)}" data-track-index="1">
      <div class="scene-inner">${sceneInner(s, i, Boolean(layout))}
      </div>
    </section>`
    )
    .join('');

  const audioClips = script.scenes
    .map(
      (s, i) => `
    <audio id="a${i}" class="clip" src="${escapeHtml(s.audioFile)}"
      data-start="${r3(s.start)}" data-duration="${r3(s.audioDuration)}" data-track-index="2" data-volume="1"></audio>`
    )
    .join('');

  const anims = script.scenes
    .map((s, i) => sceneAnim(s, i, s.start, s.duration))
    .join('\n    ');

  // Video nền: hiện mờ dần vào + zoom chậm cho có chuyển động
  const videoAnims = !hasVideo ? '' : script.scenes
    .map((s, i) => !s.bgVideo ? '' :
      `tl.fromTo('#v${i}', { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1.12, duration: 0.25 }, ${r3(s.start)});
    tl.to('#v${i}', { scale: 1, duration: ${r3(s.duration)}, ease: 'none' }, ${r3(s.start)});`)
    .filter(Boolean)
    .join('\n    ');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${1080}, height=${1920}">
<title>${escapeHtml(script.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;700;800;900&display=block" rel="stylesheet">
<style>
  :root {
    --bg1: ${theme.bg1}; --bg2: ${theme.bg2}; --accent: ${theme.accent};
    --ink: ${theme.ink}; --card: ${theme.card};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--ink); }
  body { font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; color: #fff; }
  #stage { position: relative; width: 1080px; height: 1920px; overflow: hidden; }

  /* ---- track 0: nền ---- */
  #bg { position: absolute; inset: 0; background: linear-gradient(160deg, var(--bg1) 0%, var(--bg2) 100%); }
  .blob { position: absolute; border-radius: 50%; filter: blur(40px); opacity: .45; }
  #blob1 { width: 720px; height: 720px; left: -220px; top: -160px; background: var(--accent); }
  #blob2 { width: 640px; height: 640px; right: -240px; bottom: 120px; background: #ffffff; opacity: .18; }
  #product { position: absolute; left: 90px; right: 90px; top: 250px; height: 900px;
    border-radius: 56px; overflow: hidden; background: var(--card);
    box-shadow: 0 40px 90px rgba(0,0,0,.35); }
  #product img { width: 100%; height: 100%; object-fit: contain; transform-origin: 50% 50%; }

  /* ---- track 4/5: video người + lớp tối ---- */
  .bgv { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; transform-origin: 50% 40%; }
  #shade { position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 42%, rgba(0,0,0,.55) 62%, rgba(0,0,0,.85) 100%); }
  #credit { position: absolute; right: 40px; bottom: 34px; font-size: 22px; font-weight: 500; color: rgba(255,255,255,.6); }

  /* ---- track 1: cảnh ---- */
  .scene { position: absolute; inset: 0; }
  .scene-inner { position: absolute; left: 70px; right: 70px; top: 0; bottom: 0;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    text-align: center; gap: 34px; }
  .scene.with-image .scene-inner { top: 1190px; bottom: 140px; justify-content: flex-start; gap: 22px; }
  .scene.with-video .scene-inner { top: 1080px; bottom: 170px; justify-content: center; gap: 26px; }
  .scene.with-video .headline { text-shadow: 0 6px 24px rgba(0,0,0,.7); }
  .scene.with-video .sub { text-shadow: 0 3px 14px rgba(0,0,0,.8); }
  .headline { font-weight: 900; line-height: 1.08; letter-spacing: -1px; text-transform: uppercase;
    text-shadow: 0 8px 30px rgba(0,0,0,.25); text-wrap: balance; }
  .headline.hook span { background-image: linear-gradient(var(--accent), var(--accent));
    background-repeat: no-repeat; background-position: 0 50%; background-size: 100% 100%;
    color: var(--ink); text-shadow: none; padding: 4px 18px; line-height: 1.22; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .sub { font-size: 50px; font-weight: 600; line-height: 1.3; color: rgba(255,255,255,.95); text-wrap: balance; }
  .scene.with-image .sub { font-size: 44px; }
  .tag { font-size: 38px; font-weight: 800; letter-spacing: 4px; color: var(--ink);
    background: var(--accent); padding: 12px 30px; border-radius: 999px; }
  .price-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px;
    background: var(--accent); color: var(--ink); padding: 34px 70px 40px; border-radius: 40px;
    box-shadow: 0 24px 60px rgba(0,0,0,.3); transform: rotate(-3deg); }
  .price-old { font-size: 56px; font-weight: 700; text-decoration: line-through; opacity: .6; }
  .price-now { font-size: 190px; font-weight: 900; line-height: 1; letter-spacing: -4px; }
  .scene.with-image .price-now, .scene.with-video .price-now { font-size: 150px; }
  .cta-btn { font-size: 58px; font-weight: 900; color: var(--ink); background: var(--accent);
    padding: 34px 64px; border-radius: 999px; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
  .cta-arrow { font-size: 70px; color: var(--accent); line-height: 1; }

  /* ---- track 3: lớp phủ ---- */
  #overlay { position: absolute; inset: 0; pointer-events: none; }
  #progress { position: absolute; left: 60px; right: 60px; top: 70px; height: 12px;
    border-radius: 99px; background: rgba(255,255,255,.28); overflow: hidden; }
  #progress-fill { width: 100%; height: 100%; background: var(--accent); transform-origin: 0 50%; }
  #chip { position: absolute; left: 60px; top: 112px; font-size: 34px; font-weight: 700;
    background: rgba(0,0,0,.28); padding: 12px 26px; border-radius: 999px; max-width: 960px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
</head>
<body>
  <div id="stage" data-composition-id="${COMPOSITION_ID}" data-start="0"
       data-width="1080" data-height="1920" data-fps="${fps}">

    <div id="bg" class="clip" data-start="0" data-duration="${total}" data-track-index="0">
      <div id="blob1" class="blob"></div>
      <div id="blob2" class="blob"></div>
      ${hasImage ? `<div id="product"><img id="product-img" src="${escapeHtml(imageFile)}" alt=""></div>` : ''}
    </div>
${videoClips}
${hasVideo ? `
    <div id="shade" class="clip" data-start="0" data-duration="${total}" data-track-index="5"></div>` : ''}
${sceneClips}
${audioClips}

    <div id="overlay" class="clip" data-start="0" data-duration="${total}" data-track-index="3">
      <div id="progress"><div id="progress-fill"></div></div>
      ${script.product_name ? `<div id="chip">${escapeHtml(script.product_name)}</div>` : ''}
      ${hasVideo ? `<div id="credit">Video: ${escapeHtml(script.brollSource || 'Pexels')}</div>` : ''}
    </div>
  </div>

<script src="gsap.min.js"></script>
<script>
  const tl = gsap.timeline({ paused: true });
  window.__timelines = window.__timelines || {};
  window.__timelines['${COMPOSITION_ID}'] = tl;

  // Nền: đốm màu trôi nhẹ, ảnh sản phẩm zoom chậm (Ken Burns), thanh tiến trình
  tl.fromTo('#blob1', { x: 0, y: 0 }, { x: 160, y: 220, duration: ${total}, ease: 'sine.inOut' }, 0);
  tl.fromTo('#blob2', { x: 0, y: 0 }, { x: -140, y: -260, duration: ${total}, ease: 'sine.inOut' }, 0);
  tl.fromTo('#progress-fill', { scaleX: 0 }, { scaleX: 1, duration: ${total}, ease: 'none' }, 0);
  if (document.getElementById('product')) {
    tl.from('#product', { y: 120, opacity: 0, duration: 0.6, ease: 'back.out(1.4)' }, 0);
    tl.fromTo('#product-img', { scale: 1 }, { scale: 1.12, duration: ${total}, ease: 'none' }, 0);
  }

  ${videoAnims}

  // Từng cảnh
  ${anims}
</script>
</body>
</html>
`;
}
