import { NextResponse } from 'next/server';

async function signHMAC(message: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const sessionSecret = process.env.SESSION_SECRET || '68e8055a4efefdae03504fb4d257a8f7c32bf0ad09efd89a7447d6a5214041b6';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const envPassword = process.env.ACCESS_PASSWORD;
    const sessionSecret = process.env.SESSION_SECRET!;

    if (!envPassword) {
      return NextResponse.json({ success: true });
    }

    if (password !== envPassword) {
      return NextResponse.json(
        { success: false, error: 'Sai mật khẩu' },
        { status: 401 }
      );
    }

    // Tạo session token
    const msg = await signHMAC('authenticated', envPassword);
    const sig = await signHMAC(msg, sessionSecret);
    const token = `${msg}.${sig}`;

    const response = NextResponse.json({ success: true });
    
    // Set session cookie
    response.cookies.set({
      name: 'sublingo_session',
      value: token,
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 ngày
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: any) {
    console.error('Auth API error:', err);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi hệ thống' },
      { status: 500 }
    );
  }
}
