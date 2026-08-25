import { NextResponse } from 'next/server';

const LOCAL_VOICES = [
  { code: 'female', name: 'Giọng Nữ (Chuẩn)', gender: 'female', creditFactor: 1.0 },
  { code: 'male', name: 'Giọng Nam (Chuẩn)', gender: 'male', creditFactor: 1.0 },
];

export async function GET() {
  return NextResponse.json({ success: true, voices: LOCAL_VOICES });
}
