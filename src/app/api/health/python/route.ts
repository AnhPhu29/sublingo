import { NextResponse } from "next/server";
import { jobQueueManager } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const pythonUrl =
    process.env.PYTHON_AI_SERVICE_URL || "http://127.0.0.1:8000";
  const pingTargets = [`${pythonUrl}/health`, `${pythonUrl}/`];

  const isBusy = jobQueueManager.getIsHeavyJobRunning();

  for (const target of pingTargets) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), isBusy ? 2000 : 4000);
    try {
      const res = await fetch(target, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.ok) {
        return NextResponse.json({ ok: true, url: target, busy: isBusy });
      }
    } catch (e) {
      clearTimeout(timer);
    }
  }

  // Nếu bận hoặc dịch vụ đang khởi động lại
  return NextResponse.json(
    {
      ok: false,
      busy: isBusy,
      message: isBusy
        ? "Python AI Service đang bận xử lý dữ liệu"
        : "Python AI Service đang khởi động hoặc chưa sẵn sàng",
    },
    { status: 200 }
  );
}
