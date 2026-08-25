import { NextResponse } from 'next/server';

export const maxDuration = 120; // Hỗ trợ tài liệu PDF dài lên tới 2 phút xử lý

export async function POST(request: Request) {
  try {
    const pythonServiceUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const contentType = request.headers.get('content-type') || '';

    const backendFormData = new FormData();

    if (contentType.includes('multipart/form-data')) {
      const incomingFormData = await request.formData();
      const file = incomingFormData.get('file') as File | null;
      const url = incomingFormData.get('url') as string | null;
      const lang = (incomingFormData.get('lang') as string) || 'vi';

      if (file) {
        // Kiểm tra dung lượng 50MB
        const MAX_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
          return NextResponse.json(
            { success: false, error: 'Dung lượng file PDF vượt quá giới hạn cho phép (tối đa 50MB).' },
            { status: 413 }
          );
        }
        backendFormData.append('file', file, file.name);
      } else if (url && url.trim()) {
        backendFormData.append('url', url.trim());
      } else {
        return NextResponse.json(
          { success: false, error: 'Vui lòng chọn file PDF hoặc nhập link URL.' },
          { status: 400 }
        );
      }

      backendFormData.append('lang', lang);
    } else {
      // JSON body (dán link URL)
      const body = await request.json();
      const { url, lang = 'vi' } = body;

      if (!url || typeof url !== 'string' || !url.trim()) {
        return NextResponse.json(
          { success: false, error: 'Vui lòng cung cấp đường link URL của file PDF.' },
          { status: 400 }
        );
      }

      backendFormData.append('url', url.trim());
      backendFormData.append('lang', lang);
    }

    // Gửi yêu cầu sang Python AI Backend
    const backendRes = await fetch(`${pythonServiceUrl}/reader/extract`, {
      method: 'POST',
      body: backendFormData,
    });

    if (!backendRes.ok) {
      const errorData = await backendRes.json().catch(() => ({}));
      const errorDetail = errorData.detail || errorData.error || `Lỗi từ Python backend (HTTP ${backendRes.status})`;
      return NextResponse.json(
        { success: false, error: errorDetail },
        { status: backendRes.status >= 400 && backendRes.status < 500 ? backendRes.status : 500 }
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Reader Extract API Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Không thể kết nối tới dịch vụ trích xuất PDF/OCR cục bộ.' },
      { status: 500 }
    );
  }
}
