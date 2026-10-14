import { GoogleGenAI, Type } from '@google/genai';
import { config } from './config.js';

const ai = new GoogleGenAI({ apiKey: config.geminiKey });

export const SCENE_TYPES = ['hook', 'benefit', 'proof', 'price', 'cta'];
export const THEMES = ['sunset', 'mint', 'berry', 'night'];

// Gemini trả JSON đúng khuôn này (structured output), không cần cắt ```json
const schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Tên video ngắn gọn, dưới 8 từ' },
    product_name: { type: Type.STRING, description: 'Tên sản phẩm ngắn, dưới 6 từ' },
    theme: { type: Type.STRING, enum: THEMES, description: 'Tông màu hợp với sản phẩm' },
    broll_query: { type: Type.STRING, description: 'Từ khóa TIẾNG ANH 3-6 từ tìm video người mẫu mặc/dùng sản phẩm, vd "young woman wearing striped sweater"' },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: SCENE_TYPES },
          voice_text: { type: Type.STRING, description: 'Câu thoại đọc thành tiếng, 1-2 câu, tối đa 30 từ' },
          headline: { type: Type.STRING, description: 'Chữ to trên màn hình, tối đa 6 từ' },
          subline: { type: Type.STRING, description: 'Chữ phụ, tối đa 12 từ, có thể rỗng' },
          price_now: { type: Type.STRING, description: 'Chỉ cho cảnh price, ví dụ "199K". Rỗng nếu không có' },
          price_old: { type: Type.STRING, description: 'Giá gốc nếu có, ví dụ "350K". Rỗng nếu không có' },
          broll: { type: Type.STRING, description: 'Từ khóa TIẾNG ANH 3-6 từ tìm video nền có NGƯỜI cho cảnh này' },
        },
        required: ['type', 'voice_text', 'headline'],
        propertyOrdering: ['type', 'voice_text', 'headline', 'subline', 'price_now', 'price_old', 'broll'],
      },
    },
  },
  required: ['title', 'product_name', 'theme', 'broll_query', 'scenes'],
  propertyOrdering: ['title', 'product_name', 'theme', 'broll_query', 'scenes'],
};

const SYSTEM = `Bạn là đạo diễn video bán hàng ngắn dạng dọc (TikTok/Reels/Shopee Video) cho người làm Shopee affiliate ở Việt Nam.
Biến nội dung thô thành kịch bản 3-7 cảnh, tổng thời lượng đọc khoảng 20-40 giây.
Quy tắc:
- Cảnh đầu luôn là "hook": gây tò mò hoặc chạm nỗi đau trong 1 câu ngắn.
- Giữa là "benefit" (lợi ích cụ thể, không chung chung) và có thể "proof" (số liệu, đánh giá, đã bán) - CHỈ dùng thông tin có trong nội dung gốc, không bịa số liệu.
- Nếu nội dung gốc có giá thì thêm 1 cảnh "price"; không có giá thì bỏ cảnh này.
- Cảnh cuối là "cta": kêu gọi bấm link/giỏ hàng.
- voice_text viết như người nói, tự nhiên, tiếng Việt có dấu, không emoji, không ký hiệu lạ, số viết sao cho đọc tự nhiên.
- headline là cụm từ khóa đắt nhất của cảnh, rất ngắn.
- Không hứa hẹn sai sự thật, không nói về công dụng chữa bệnh.
- broll và broll_query là từ khóa TIẾNG ANH để tìm video người thật trên Pexels: luôn có người (woman/man/couple/girl), mô tả trang phục và hành động cụ thể, ví dụ "woman in pink outfit walking street", "girl trying on jeans in mirror", "couple in matching hoodies laughing". Mỗi cảnh một cảnh quay khác nhau để video không lặp. Không dùng tên thương hiệu, không dùng tiếng Việt.`;

const clip = (s, max) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/**
 * Gọi Gemini có dự phòng: thử lần lượt các model trong GEMINI_MODELS
 * (mặc định giống script báo cáo), model không tồn tại (404) thì bỏ qua,
 * quá tải (429/5xx) thì chờ rồi thử lại nhiều vòng.
 */
export async function writeScript(rawText) {
  if (!config.geminiKey) throw new Error('Thiếu GEMINI_API_KEY');

  const models = (process.env.GEMINI_MODELS || `gemini-flash-latest,${config.geminiModel}`)
    .split(',').map((m) => m.trim()).filter(Boolean)
    .filter((m, i, a) => a.indexOf(m) === i);
  const skip = new Set();
  const errors = [];
  const waits = [0, 60, 180]; // giây chờ trước mỗi vòng

  for (const [round, wait] of waits.entries()) {
    if (wait) {
      console.log(`  Gemini quá tải, chờ ${wait}s rồi thử vòng ${round + 1}...`);
      await sleep(wait);
    }
    for (const model of models) {
      if (skip.has(model)) continue;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: `Nội dung thô:\n"""\n${rawText.slice(0, 6000)}\n"""`,
          config: {
            systemInstruction: SYSTEM,
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.8,
          },
        });
        const data = JSON.parse(String(response.text || '').replace(/^```(?:json)?|```$/g, '').trim());
        console.log(`  Đã dùng model ${model}`);
        return normalize(data);
      } catch (err) {
        const status = err?.status ?? err?.code;
        const msg = `${model} vòng ${round + 1}: ${status ?? ''} ${String(err?.message || err).slice(0, 200)}`;
        errors.push(msg);
        console.error('  ' + msg);
        if ([400, 401, 403].includes(status)) throw new Error(`Khóa Gemini không hợp lệ hoặc yêu cầu sai: ${msg}`);
        if (status === 404) skip.add(model);
        else await sleep(10);
      }
    }
    if (skip.size === models.length) break;
  }
  throw new Error(`Gemini lỗi sau nhiều lần thử. ${errors.slice(-3).join(' | ')}`);
}

/** Kiểm tra và làm sạch kịch bản để template không bao giờ vỡ. */
export function normalize(data) {
  const scenes = (Array.isArray(data?.scenes) ? data.scenes : [])
    .filter((s) => s && String(s.voice_text || '').trim())
    .slice(0, 7)
    .map((s) => ({
      type: SCENE_TYPES.includes(s.type) ? s.type : 'benefit',
      voice_text: clip(s.voice_text, 220),
      headline: clip(s.headline || s.voice_text, 48),
      subline: clip(s.subline, 90),
      price_now: clip(s.price_now, 14),
      price_old: clip(s.price_old, 14),
      broll: clip(s.broll, 80),
    }));

  if (scenes.length < 2) throw new Error('Kịch bản quá ngắn, hãy gửi nội dung chi tiết hơn.');

  return {
    title: clip(data.title || 'Video sản phẩm', 60),
    product_name: clip(data.product_name || data.title || '', 40),
    theme: THEMES.includes(data.theme) ? data.theme : 'sunset',
    broll_query: clip(data.broll_query, 80),
    scenes,
  };
}
