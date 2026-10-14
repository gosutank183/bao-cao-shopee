/**
 * Chạy pipeline từ dòng lệnh, không cần Telegram (để thử nhanh / debug).
 *
 *   npm run make -- "mô tả sản phẩm..."                 # đầy đủ: Gemini + TTS + render
 *   npm run make -- "mô tả..." --image anh.jpg          # kèm ảnh sản phẩm
 *   npm run make -- --demo                              # kịch bản mẫu, không gọi Gemini
 *   npm run make -- --demo --preview                    # chỉ dựng index.html, không render
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeVideo } from './pipeline.js';
import { normalize } from './director.js';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const text = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--image').join(' ');

const DEMO = normalize({
  title: 'Áo thun cotton form rộng',
  product_name: 'Áo thun cotton 100% form rộng',
  theme: 'sunset',
  scenes: [
    { type: 'hook', voice_text: 'Mặc áo thun mà cứ bí, dính lưng mỗi trưa hè?', headline: 'Áo dính lưng mỗi trưa hè?' },
    { type: 'benefit', voice_text: 'Chiếc này cotton một trăm phần trăm, thấm hút cực nhanh, mặc cả ngày vẫn khô thoáng.', headline: 'Cotton 100% thấm hút', subline: 'Mặc cả ngày vẫn khô thoáng' },
    { type: 'proof', voice_text: 'Đã bán hơn mười nghìn chiếc, đánh giá bốn chấm chín sao.', headline: 'Đã bán 10K+', subline: 'Đánh giá 4.9 sao' },
    { type: 'price', voice_text: 'Giá gốc ba trăm năm mươi nghìn, hôm nay chỉ còn một trăm chín mươi chín nghìn.', headline: 'Chỉ hôm nay', price_now: '199K', price_old: '350K' },
    { type: 'cta', voice_text: 'Bấm vào giỏ hàng bên dưới để chọn size ngay nhé!', headline: 'Chọn size ngay', subline: 'Freeship đơn từ 99K' },
  ],
});

if (!text && !flag('--demo')) {
  console.log('Cách dùng: npm run make -- "mô tả sản phẩm" [--image anh.jpg] [--preview]\n         npm run make -- --demo [--preview]');
  process.exit(1);
}

const imagePath = opt('--image');
const image = imagePath ? fs.readFileSync(path.resolve(imagePath)) : undefined;

try {
  const res = await makeVideo({
    text,
    image,
    script: flag('--demo') ? DEMO : undefined,
    skipRender: flag('--preview'),
    onStatus: (m) => console.log(m),
  });
  console.log(`\nXong! Thư mục: ${res.workDir}`);
  if (res.videoPath) console.log(`Video: ${res.videoPath}`);
  else console.log(`Xem trước: cd "${res.workDir}" && npx hyperframes preview`);
} catch (err) {
  console.error('\n❌', err.message);
  process.exit(1);
}
