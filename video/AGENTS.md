# Hướng dẫn cho agent (Antigravity scheduled task)

Dự án này tự làm video bán hàng từ báo cáo xu hướng hằng ngày.

## Nhiệm vụ hằng ngày

1. Mở terminal ở thư mục gốc dự án (thư mục chứa `package.json`).
2. Chạy: `npm run daily`
3. Nếu lệnh kết thúc với "🎉 Xong" hoặc "đã làm video rồi": dừng lại, báo thành công.
4. Nếu lỗi: đọc log, xác định nguyên nhân, sửa, rồi chạy lại `npm run daily -- --force`.
   Thử lại tối đa 2 lần. Sau đó dừng và tóm tắt lỗi.

## Được phép sửa

- Cài thiếu công cụ: `npm install`, `pip install edge-tts`.
- Lỗi `hyperframes lint` trong HTML sinh ra: sửa trong `src/template.js` cho đúng chuẩn
  HyperFrames (dùng skill hyperframes nếu có), giữ nguyên bố cục và màu sắc.
- Lỗi mạng tạm thời (edge-tts, Gemini, Telegram): chờ 1–2 phút rồi chạy lại.

## Không được làm

- Không sửa, in ra hay commit file `.env` và các khóa API.
- Không đổi lời nhắc kịch bản trong `src/director.js`, không đổi repo báo cáo.
- Không tự viết lại toàn bộ dự án hay tự viết HTML video bằng tay thay cho `npm run daily`.
- Không xóa thư mục ngoài `work/`.
- Không gửi tin Telegram ngoài những gì script tự gửi.

## Gỡ lỗi nhanh

- `npm run doctor` kiểm tra Node, ffmpeg, edge-tts, hyperframes, .env.
- Thư mục render lỗi được giữ trong `work/<thời-gian>/` (xem `script.json`, `index.html`).
- Thử render không tốn quota Gemini: `npm run make -- --demo`.
