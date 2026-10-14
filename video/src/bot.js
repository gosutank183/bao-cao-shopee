import fs from 'node:fs';
import { Telegraf } from 'telegraf';
import PQueue from 'p-queue';
import { config } from './config.js';
import { makeVideo, cleanup, pruneOld } from './pipeline.js';

if (!config.telegramToken) {
  console.error('Thiếu TELEGRAM_BOT_TOKEN trong .env');
  process.exit(1);
}

// handlerTimeout: Infinity vì việc render dài hơn 90s mặc định của Telegraf
const bot = new Telegraf(config.telegramToken, { handlerTimeout: Infinity });
const queue = new PQueue({ concurrency: config.renderConcurrency });

const HELP = `Gửi cho mình:
• Một đoạn mô tả sản phẩm (tên, công dụng, giá, ưu đãi...), hoặc
• Một ẢNH sản phẩm kèm chú thích là đoạn mô tả đó.

Mình sẽ viết kịch bản, thu giọng và render video dọc 9:16 rồi gửi lại.
Lệnh: /queue xem hàng đợi · /id xem ID Telegram của bạn`;

// ---- Lệnh không cần quyền ----
bot.command('id', (ctx) => ctx.reply(`ID Telegram của bạn: ${ctx.from.id}`));

// ---- Chỉ người trong whitelist mới dùng được phần còn lại ----
bot.use((ctx, next) => {
  const uid = String(ctx.from?.id ?? '');
  if (config.allowedUserIds.length === 0) {
    if (ctx.message) ctx.reply(`Bot chưa cấu hình ALLOWED_USER_IDS. Thêm ID của bạn (${uid}) vào .env rồi khởi động lại.`);
    return;
  }
  if (!config.allowedUserIds.includes(uid)) return; // im lặng với người lạ
  return next();
});

bot.start((ctx) => ctx.reply(`Xin chào! ${HELP}`));
bot.help((ctx) => ctx.reply(HELP));
bot.command('queue', (ctx) =>
  ctx.reply(`Đang render: ${queue.pending} · Đang chờ: ${queue.size}`)
);

function makeStatus(ctx, messageId) {
  let last = '';
  return async (text) => {
    if (text === last) return;
    last = text;
    try {
      await ctx.telegram.editMessageText(ctx.chat.id, messageId, undefined, text);
    } catch { /* Telegram báo "not modified" hoặc tin đã bị xóa: bỏ qua */ }
  };
}

async function enqueueJob(ctx, text, getImage) {
  if (!text || text.trim().length < 15) {
    return ctx.reply('Nội dung hơi ngắn, bạn gửi mô tả chi tiết hơn nhé (tên, công dụng, giá...).');
  }
  if (queue.size >= config.maxQueue) {
    return ctx.reply(`Hàng đợi đang đầy (${queue.size} video). Thử lại sau ít phút nhé.`);
  }

  const ahead = queue.size + queue.pending;
  const statusMsg = await ctx.reply(
    ahead > 0 ? `⏳ Đã nhận! Bạn đang xếp hàng thứ ${ahead + 1}.` : '⏳ Đã nhận! Bắt đầu xử lý...'
  );
  const onStatus = makeStatus(ctx, statusMsg.message_id);

  // Không await: để Telegraf nhận tin tiếp theo trong lúc render
  queue.add(async () => {
    let result;
    try {
      const image = getImage ? await getImage() : undefined;
      result = await makeVideo({ text, image, onStatus });
      await onStatus('📤 Đang gửi video...');
      await ctx.replyWithVideo(
        { source: fs.createReadStream(result.videoPath) },
        {
          caption: `✅ ${result.script.title}\n⏱️ ${result.duration.toFixed(1)}s`,
          width: config.width,
          height: config.height,
          supports_streaming: true,
        }
      );
      // Gửi kèm lời thoại để tiện copy làm mô tả bài đăng
      const voice = result.script.scenes.map((s) => s.voice_text).join('\n');
      await ctx.reply(`📝 Lời thoại:\n${voice}`);
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      cleanup(result.workDir);
    } catch (err) {
      console.error(err);
      await onStatus(`❌ Lỗi: ${String(err.message).slice(0, 800)}`);
    } finally {
      pruneOld(24);
    }
  });
}

bot.on('text', (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;
  return enqueueJob(ctx, text);
});

bot.on('photo', (ctx) => {
  const caption = ctx.message.caption || '';
  const photos = ctx.message.photo;
  const best = photos[photos.length - 1]; // ảnh độ phân giải cao nhất
  return enqueueJob(ctx, caption, async () => {
    const link = await ctx.telegram.getFileLink(best.file_id);
    const res = await fetch(link.href);
    if (!res.ok) throw new Error(`Không tải được ảnh (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  });
});

bot.catch((err) => console.error('[bot]', err));

pruneOld(24);
bot.launch(() => console.log('🚀 Bot video đang chạy. Nhấn Ctrl+C để dừng.'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
