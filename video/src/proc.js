import { spawn } from 'node:child_process';

/**
 * Chạy một chương trình với tham số dạng MẢNG (không qua shell),
 * nên nội dung người dùng gửi không thể chèn lệnh vào máy.
 * cmd có thể là "edge-tts" hoặc "python -m edge_tts" (tự tách phần đầu).
 */
export function run(cmd, args = [], { cwd, timeoutMs = 15 * 60 * 1000 } = {}) {
  const [bin, ...pre] = cmd.trim().split(/\s+/);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...pre, ...args], {
      cwd,
      shell: false,
      windowsHide: true,
      // npx trên Windows là file .cmd, cần shell để gọi; tham số vẫn do ta kiểm soát
      ...(process.platform === 'win32' && /^(npx|npm)$/i.test(bin) ? { shell: true } : {}),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} quá thời gian ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Không chạy được "${bin}": ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} thoát với mã ${code}\n${(stderr || stdout).slice(-1500)}`));
    });
  });
}
