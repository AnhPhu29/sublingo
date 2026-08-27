import { NextResponse } from 'next/server';

export const LOCAL_VOICES = [
  { code: 'ngoc_huyen', name: '🌟 Ngọc Huyền Pro (Nữ Bắc - Diễn cảm Studio) ★', gender: 'female', creditFactor: 1.0 },
  { code: 'hoai_my', name: '⚡ Hoài My (Nữ Bắc - Siêu Tốc AI Chuẩn)', gender: 'female', creditFactor: 1.0 },
  { code: 'nam_minh', name: '⚡ Nam Minh (Nam Bắc - Trầm ấm AI Chuẩn)', gender: 'male', creditFactor: 1.0 },
  { code: 'mai_anh', name: '✨ Mai Anh (Nữ Bắc - Tự nhiên)', gender: 'female', creditFactor: 1.0 },
  { code: 'manh_dung', name: '✨ Mạnh Dũng (Nam Bắc - Mạnh mẽ)', gender: 'male', creditFactor: 1.0 },
  { code: 'huong_giang', name: '✨ Hương Giang (Nữ Trung - Dịu dàng)', gender: 'female', creditFactor: 1.0 },
  { code: 'lan_trinh', name: '✨ Lan Trinh (Nữ Nam - Ngọt ngào)', gender: 'female', creditFactor: 1.0 },
  { code: 'minh_hoang', name: '✨ Minh Hoàng (Nam Nam - Sôi động)', gender: 'male', creditFactor: 1.0 },
];

export async function GET() {
  return NextResponse.json({ success: true, voices: LOCAL_VOICES });
}

