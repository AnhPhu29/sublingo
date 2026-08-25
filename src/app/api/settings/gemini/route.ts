import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

function getEnvFilePath(): string {
  return path.join(process.cwd(), '.env');
}

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const hasApiKey = apiKey.trim().length > 0;
    const maskedKey = hasApiKey
      ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
      : '';
    const model = process.env.GEMINI_MODEL || 'gemini-3-flash';

    return NextResponse.json({
      success: true,
      hasApiKey,
      maskedKey,
      model
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Lỗi kiểm tra API key' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { apiKey, action } = await request.json();

    if (!apiKey || apiKey.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Vui lòng nhập API Key hợp lệ' },
        { status: 400 }
      );
    }

    const trimmedKey = apiKey.trim().replace(/^["']|["']$/g, '');

    // Bước 1: Kiểm tra tính hợp lệ của API Key thông qua ListModels
    const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`;
    let listRes: Response;
    try {
      listRes = await fetch(listModelsUrl);
    } catch (netErr: any) {
      return NextResponse.json(
        {
          success: false,
          error: 'Không thể kết nối tới máy chủ Google API. Vui lòng kiểm tra lại kết nối mạng Internet.'
        },
        { status: 500 }
      );
    }

    const listText = await listRes.text();

    if (!listRes.ok) {
      let friendlyError = 'API Key không hợp lệ hoặc bị từ chối truy cập.';

      if (listText.includes('API_KEY_INVALID') || listText.includes('API key not valid')) {
        friendlyError = '❌ Mã Gemini API Key không đúng hoặc sai ký tự. Vui lòng tạo/copy lại mã key chuẩn tại: aistudio.google.com/api-keys';
      } else if (listText.includes('RESOURCE_EXHAUSTED') || listRes.status === 429) {
        friendlyError = '⚠️ API Key hợp lệ nhưng đã vượt quá hạn ngạch sử dụng trong ngày (Quota Exceeded).';
      } else if (listText.includes('SERVICE_DISABLED') || listText.includes('has not been used')) {
        friendlyError = '⚠️ API Key này chưa bật dịch vụ Generative Language API. Vui lòng vào aistudio.google.com/api-keys để tạo key mới.';
      } else if (listText.includes('IP_REFERRER_BLOCKED') || listText.includes('PERMISSION_DENIED')) {
        friendlyError = '⚠️ API Key bị cài đặt giới hạn IP/Domain trong Google Cloud Console.';
      }

      return NextResponse.json(
        { success: false, error: friendlyError, detail: listText },
        { status: 400 }
      );
    }

    // Lấy danh sách mô hình khả dụng từ phản hồi của Google
    let availableModels: string[] = [];
    try {
      const parsed = JSON.parse(listText);
      availableModels = (parsed.models || [])
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''))
        .filter((name: string) => {
          const lower = name.toLowerCase();
          return (lower.startsWith('gemini-') || lower.includes('flash') || lower.includes('pro')) &&
            !lower.includes('gemma') &&
            !lower.includes('embedding') &&
            !lower.includes('imagen') &&
            !lower.includes('veo') &&
            !lower.includes('tts') &&
            !lower.includes('computer-use');
        });
    } catch (_) {}

    // Chọn mô hình ưu tiên: gemini-2.0-flash -> gemini-1.5-flash -> gemini-2.5-flash -> mô hình đầu tiên
    const preferredModel = availableModels.find(m => m === 'gemini-2.0-flash')
      || availableModels.find(m => m === 'gemini-1.5-flash')
      || availableModels.find(m => m === 'gemini-2.5-flash')
      || availableModels.find(m => m.includes('flash'))
      || availableModels[0]
      || 'gemini-2.0-flash';

    // Bước 2: Thử gửi yêu cầu generateContent nhỏ để xác định model tương thích nhất
    let selectedModel = preferredModel;
    let pingSuccess = false;
    let pingText = '';
    let isQuotaExceeded = false;

    for (const m of availableModels.length > 0 ? availableModels : [preferredModel]) {
      const pingUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${trimmedKey}`;
      try {
        const pingRes = await fetch(pingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }]
          })
        });

        if (pingRes.ok) {
          selectedModel = m;
          pingSuccess = true;
          break;
        } else {
          pingText = await pingRes.text();
          if (pingText.includes('RESOURCE_EXHAUSTED') || pingRes.status === 429) {
            isQuotaExceeded = true;
            selectedModel = m;
          }
        }
      } catch (e: any) {
        pingText = e.message;
      }
    }

    if (!pingSuccess && !isQuotaExceeded) {
      let pingError = 'Khóa API không hỗ trợ tạo nội dung (generateContent).';
      if (pingText.includes('is not found') || pingText.includes('not supported')) {
        pingError = '⚠️ API Key này lấy từ Google Cloud Console khác dự án AI Studio. Vui lòng tạo API Key trực tiếp tại trang aistudio.google.com/api-keys.';
      }

      return NextResponse.json(
        { success: false, error: pingError, detail: pingText },
        { status: 400 }
      );
    }

    // Bước 3: Lưu vào process.env và cập nhật file .env
    if (action === 'save') {
      process.env.GEMINI_API_KEY = trimmedKey;
      process.env.GEMINI_MODEL = selectedModel;

      const envPath = getEnvFilePath();
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf-8');
        if (content.includes('GEMINI_API_KEY=')) {
          content = content.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY="${trimmedKey}"`);
        } else {
          content += `\nGEMINI_API_KEY="${trimmedKey}"\n`;
        }

        if (content.includes('GEMINI_MODEL=')) {
          content = content.replace(/GEMINI_MODEL=.*/g, `GEMINI_MODEL="${selectedModel}"`);
        } else {
          content += `\nGEMINI_MODEL="${selectedModel}"\n`;
        }

        fs.writeFileSync(envPath, content, 'utf-8');
      }
    }

    const maskedKey = `${trimmedKey.slice(0, 6)}...${trimmedKey.slice(-4)}`;
    const successMsg = isQuotaExceeded
      ? `✅ API Key hợp lệ! (Lưu ý: Tài khoản đang tạm đạt giới hạn Quota Free Tier của Google, hệ thống sẽ tự động chờ retry khi gửi tác vụ).`
      : action === 'save'
        ? `Xác thực và lưu Gemini API Key thành công! (Mô hình chọn: ${selectedModel})`
        : `Xác thực Gemini API Key hợp lệ! (Mô hình chọn: ${selectedModel})`;

    return NextResponse.json({
      success: true,
      message: successMsg,
      maskedKey,
      model: selectedModel,
      isQuotaExceeded
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Lỗi hệ thống khi kiểm tra API key' },
      { status: 500 }
    );
  }
}
