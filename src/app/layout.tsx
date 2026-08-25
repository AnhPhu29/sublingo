import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const fraunces = Fraunces({
  variable: '--font-serif',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'SubLingo — Dịch Phụ Đề Bằng AI & Trích Xuất Chữ Từ Ảnh',
  description: 'Công cụ dịch phụ đề chuyên nghiệp bằng AI, hỗ trợ dịch SRT/VTT, trích xuất chữ từ ảnh (OCR), tích hợp từ điển thuật ngữ và xem trước video trực tiếp.',
  keywords: 'dịch phụ đề, AI subtitle translator, OCR phụ đề, dịch SRT, dịch VTT, trích xuất chữ từ ảnh',
  authors: [{ name: 'SubLingo Team' }],
};

import { SubLingoProvider } from '@/context/SubLingoContext';
import { ClientLayout } from '@/components/common/ClientLayout';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <SubLingoProvider>
          <ClientLayout>
            {children}
          </ClientLayout>
        </SubLingoProvider>
      </body>
    </html>
  );
}
