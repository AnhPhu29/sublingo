import { NextResponse } from 'next/server';
import { calculateLocalCostSaved, calculateVbeeSttCost, calculateVbeeTtsCost, FRAME_INTERVAL_SECONDS } from '@/lib/pricing';

export async function POST(request: Request) {
  try {
    const {
      durationSeconds,
      mode,
      removeWatermark,
      autoTranslate,
      selectedLangs,
      charCount,
      voiceId,
    } = await request.json();

    const seconds = parseFloat(durationSeconds) || 0;
    const breakdown: Record<string, number> = {};
    let totalCost = 0;

    if (mode === 'dub') {
      // ─── Ước tính chi phí Lồng tiếng (Dubbing) ────────────────────────────
      const chars = parseInt(charCount) || 0;
      if (chars <= 0) {
        return NextResponse.json({
          success: true,
          totalCostUsd: 0,
          breakdown: { message: 'Vui lòng cung cấp file phụ đề để ước tính chi phí' }
        });
      }

      // Lấy credit factor của giọng đọc cụ thể
      const creditFactor = 1.0;

      const ttsCost = calculateVbeeTtsCost(chars, creditFactor);
      breakdown['tts'] = ttsCost;
      totalCost += ttsCost;

      // Claude rút gọn thoại (ước tính 5% số dòng cần rút gọn — chi phí nhỏ)
      const estCondenseInputTokens = Math.ceil(chars * 0.05 / 2.5);
      const estCondenseCost = calculateLocalCostSaved(estCondenseInputTokens, estCondenseInputTokens);
      breakdown['condense_reserve'] = estCondenseCost;
      totalCost += estCondenseCost;

    } else if (mode === 'stt') {
      // ─── Ước tính chi phí Vbee STT ─────────────────────────────────────
      if (seconds <= 0) {
        return NextResponse.json({
          success: true,
          totalCostUsd: 0,
          breakdown: { message: 'Vui lòng cung cấp thời lượng video hợp lệ' }
        });
      }
      const sttCost = calculateVbeeSttCost(seconds);
      breakdown['stt'] = sttCost;
      totalCost += sttCost;

      if (autoTranslate && selectedLangs && selectedLangs.length > 0) {
        breakdown['translate'] = 0;
        // Không cộng thêm chi phí dịch vì Gemini là miễn phí
      }

    } else if (mode === 'ocr') {
      // ─── Ước tính chi phí OCR Video (Gemini API Free Tier = 0) ───────────
      if (seconds <= 0) {
        return NextResponse.json({
          success: true,
          totalCostUsd: 0,
          breakdown: { message: 'Vui lòng cung cấp thời lượng video hợp lệ' }
        });
      }
      breakdown['ocr'] = 0; // Gemini OCR Free Tier = 0

      if (removeWatermark) {
        breakdown['watermark'] = 0; // Gemini Watermark Free Tier = 0
      }

      if (autoTranslate && selectedLangs && selectedLangs.length > 0) {
        breakdown['translate'] = 0; // Gemini Translate Free Tier = 0
      }
    }

    return NextResponse.json({
      success: true,
      totalCostUsd: Number(totalCost.toFixed(6)),
      breakdown
    });
  } catch (err: unknown) {
    console.error('Estimate cost API error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tính toán chi phí ước tính' },
      { status: 500 }
    );
  }
}
