import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/health', '/api/voices', '/api/custom-voices', '/favicon.ico'];

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

const defaultSessionSecret = process.env.SESSION_SECRET || '68e8055a4efefdae03504fb4d257a8f7c32bf0ad09efd89a7447d6a5214041b6';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Nếu không cài đặt mật khẩu -> Tắt hoàn toàn tính năng đăng nhập và chuyển hướng /login về trang chủ
  const password = process.env.ACCESS_PASSWORD;
  if (!password) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 2. Loại trừ các path công khai và asset tĩnh (bao gồm cả webhooks & health checks)
  const isPublic = PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/') || pathname.startsWith('/_next/')) || pathname.startsWith('/api/webhooks/');
  
  if (isPublic) {
    return NextResponse.next();
  }

  // Helper để trả về phản hồi từ chối phù hợp (Redirect cho trang web, JSON 401 cho API)
  const handleUnauthorized = () => {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete('sublingo_session');
    return res;
  };

  // 3. Kiểm tra session cookie
  const sessionCookie = request.cookies.get('sublingo_session')?.value;
  const secret = process.env.SESSION_SECRET || defaultSessionSecret;

  if (!sessionCookie) {
    return handleUnauthorized();
  }

  try {
    const parts = sessionCookie.split('.');
    if (parts.length !== 2) {
      throw new Error('Invalid cookie format');
    }

    const [msg, sig] = parts;
    const expectedSig = await signHMAC(msg, secret);

    if (sig !== expectedSig) {
      throw new Error('Signature mismatch');
    }

    const expectedMsg = await signHMAC('authenticated', password);
    if (msg !== expectedMsg) {
      throw new Error('Password mismatch');
    }

    return NextResponse.next();
  } catch (err) {
    console.error('Session validation error:', err);
    return handleUnauthorized();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
