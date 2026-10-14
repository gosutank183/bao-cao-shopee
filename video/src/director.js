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
        },
        required: ['type', 'voice_text', 'headline'],
        propertyOrdering: ['type', 'voice_text', 'headline', 'subline', 'price_now', 'price_old'],
      },
    },
  },
  required: ['title', 'product_name', 'theme', 'scenes'],
  propertyOrdering: ['title', 'product_name', 'theme', 'scenes'],
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
- Không hứa hẹn sai sự thật, không nói về công dụng chữa bệnh.`;

const clip = (s, max) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

export async function writeScript(rawText) {
  if (!config.geminiKey) throw new Error('Thiếu GEMINI_API_KEY trong .env');

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: `Nội dung thô:\n"""\n${rawText.slice(0, 6000)}\n"""`,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.8,
    },
  });

  let data;
  try {
    data = JSON.parse(response.text);
  } catch {
    throw new Error('Gemini trả về dữ liệu không phải JSON hợp lệ, thử gửi lại.');
  }
  return normalize(data);
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
    }));

  if (scenes.length < 2) throw new Error('Kịch bản quá ngắn, hãy gửi nội dung chi tiết hơn.');

  return {
    title: clip(data.title || 'Video sản phẩm', 60),
    product_name: clip(data.product_name || data.title || '', 40),
    theme: THEMES.includes(data.theme) ? data.theme : 'sunset',
    scenes,
  };
}
