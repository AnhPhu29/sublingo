import { NextResponse } from 'next/server';

export const LOCAL_VOICES: any[] = [];

export async function GET() {
  return NextResponse.json({ success: true, voices: [] });
}


