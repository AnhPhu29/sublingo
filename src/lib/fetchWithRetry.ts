export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 5,
  delays: number[] = [2000, 3000, 5000, 5000, 5000],
): Promise<Response> {
  let lastError: any = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await fetch(url, options as any);
      return res;
    } catch (err: any) {
      lastError = err;
      if (i < maxRetries) {
        const delayMs = delays[i] || 3000;
        // Bỏ qua log lần retry đầu tiên (i===0) vì Python hay bận lazy-load model
        // Chỉ cảnh báo từ lần retry thứ 2 trở đi để tránh spam terminal khi khởi động
        if (i >= 1) {
          console.warn(
            `[Fetch Retry ${i + 1}/${maxRetries}] ${err.message}. Retrying in ${delayMs}ms...`,
          );
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  if (
    lastError &&
    (lastError.code === "ECONNREFUSED" ||
      lastError.message?.includes("fetch failed"))
  ) {
    throw new Error(
      `Không kết nối được tới Python AI Service (${url}). ` +
        `Vui lòng kiểm tra Python service đã được khởi động chưa (chạy lệnh 'npm run dev:all' hoặc '.venv\\Scripts\\uvicorn.exe app.main:app --port 8000').`,
    );
  }
  throw lastError;
}
