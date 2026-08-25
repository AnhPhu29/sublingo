import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // 1. Lấy tất cả các job đã hoàn thành để tính toán
    const jobs = await prisma.subtitleJob.findMany({
      where: {
        status: 'done',
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        costUsd: true,
        type: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const totalJobs = jobs.length;
    let totalSavedUsd = 0;
    let totalDurationSeconds = 0;

    const costByDateMap: Record<string, number> = {};
    const costByTypeMap: Record<string, number> = {};
    const durationByDateMap: Record<string, number> = {};

    jobs.forEach((job: any) => {
      // Số tiền tiết kiệm ước tính (lấy từ trường costUsd cũ)
      const saved = job.costUsd || 0;
      totalSavedUsd += saved;

      // Thời gian xử lý local (giây) = updatedAt - createdAt
      const durationMs = job.updatedAt.getTime() - job.createdAt.getTime();
      const durationSec = Math.max(0, durationMs / 1000);
      totalDurationSeconds += durationSec;

      const dateStr = job.createdAt.toISOString().split('T')[0];
      costByDateMap[dateStr] = (costByDateMap[dateStr] || 0) + saved;
      costByTypeMap[job.type] = (costByTypeMap[job.type] || 0) + saved;
      durationByDateMap[dateStr] = (durationByDateMap[dateStr] || 0) + durationSec;
    });

    const costsByDate = Object.entries(costByDateMap).map(([date, amount]) => ({
      date,
      amount: Number(amount.toFixed(6)),
      duration: Number((durationByDateMap[date] || 0).toFixed(1)),
    }));

    const costsByType = Object.entries(costByTypeMap).map(([type, amount]) => ({
      type,
      amount: Number(amount.toFixed(6)),
    }));

    return NextResponse.json({
      success: true,
      totalCostUsd: 0, // Trả về 0 USD chi phí thật
      totalSavedUsd: Number(totalSavedUsd.toFixed(6)),
      totalDurationSeconds: Number(totalDurationSeconds.toFixed(1)),
      totalJobs,
      costsByDate,
      costsByType,
    });
  } catch (err: any) {
    console.error('Get cost summary error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tính toán thống kê hiệu năng và tiết kiệm' },
      { status: 500 }
    );
  }
}
