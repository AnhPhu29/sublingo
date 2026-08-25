# SubLingo — Dịch Phụ Đề & Lồng Tiếng Local AI (Offline 100%)

SubLingo là hệ thống dịch thuật phụ đề phim, trích xuất chữ tự động (OCR/STT), chỉnh sửa và lồng tiếng (AI Dubbing) hoạt động **hoàn toàn ngoại tuyến (offline)** trên máy tính cá nhân của bạn, sử dụng các mô hình trí tuệ nhân tạo (AI) mã nguồn mở mà không phụ thuộc vào bất kỳ dịch vụ đám mây trả phí nào (như Claude API, Vbee API, OpenAI API).

---

## 🛠️ Kiến trúc hệ thống
Hệ thống bao gồm hai thành phần hoạt động song song:
1. **Frontend (Next.js)**: Giao diện người dùng sang trọng, quản lý lịch sử SQLite và điều phối tiến trình.
2. **Backend (FastAPI Python)**: Chạy local để tải và xử lý các tác vụ AI nặng (Whisper STT, VieNeu-TTS, Ollama Translation).

---

## 📋 Yêu cầu hệ thống & Cài đặt

### 1. Công cụ cơ bản
- **Node.js**: Phiên bản 18 trở lên.
- **Python**: Phiên bản 3.10 hoặc 3.11.
- **FFmpeg & FFprobe**: Bắt buộc cài đặt trên máy và thêm vào biến môi trường hệ thống (`PATH`) để Next.js/Python có thể gọi lệnh xử lý video/audio.

### 2. Cấu hình Tesseract OCR (Trích xuất phụ đề cứng từ Video)
Dự án sử dụng **Tesseract OCR** để quét chữ phụ đề từ khung hình video:
- **Windows**: Tải bộ cài tại [UB Mannheim Tesseract Wiki](https://github.com/UB-Mannheim/tesseract/wiki). Cài vào đường dẫn mặc định `C:\Program Files\Tesseract-OCR\`. Ở phần cài ngôn ngữ bổ sung, tích chọn **Vietnamese** và **English**.
- **macOS**: Chạy `brew install tesseract tesseract-lang`
- **Linux**: Chạy `sudo apt install tesseract-ocr tesseract-ocr-vie tesseract-ocr-eng`

### 3. Cài đặt Ollama (Dành cho Dịch thuật Offline)
Ollama được sử dụng để điều phối mô hình ngôn ngữ lớn (LLM) dịch phụ đề cục bộ:
1. Tải và cài đặt Ollama từ trang chủ [ollama.com](https://ollama.com).
2. Mở Terminal / PowerShell và tải mô hình dịch thuật mặc định:
   ```bash
   ollama pull qwen2.5:7b-instruct-q4_K_M
   ```
   *(Mô hình này nặng khoảng 4.7 GB, có độ chính xác cao và chạy ổn định trên card đồ họa RTX từ 6GB-8GB VRAM trở lên hoặc CPU đa luồng).*
3. Đảm bảo ứng dụng Ollama đang chạy ngầm trên máy tính của bạn.

### 4. Tải các mô hình AI cục bộ khác (Tự động tải lần đầu)
Khi bạn chạy backend lần đầu, hệ thống sẽ tự động tải các mô hình sau từ HuggingFace (có thể mất thời gian tuỳ tốc độ mạng):
- **Whisper Model (STT)**: Mặc định sử dụng bản `small` (khoảng 460MB). Bạn có thể đổi kích thước qua biến môi trường.
- **VieNeu-TTS (Lồng tiếng)**: Mô hình TTS tiếng Việt offline chất lượng cao, tự động lưu vào bộ nhớ cache.

---

## ⚙️ Cấu hình Biến môi trường (.env)

Tạo file `.env` tại thư mục `sublingo-next/` với cấu hình tham khảo:
```env
# URL của sidecar service Python xử lý AI
PYTHON_AI_SERVICE_URL="http://localhost:8000"

# Model Ollama sử dụng để dịch
OLLAMA_MODEL="qwen2.5:7b-instruct-q4_K_M"

# Đường dẫn Tesseract trên Windows
TESSERACT_PATH="C:\Program Files\Tesseract-OCR\tesseract.exe"
```

Tạo file `.env` tại thư mục `backend/` với cấu hình:
```env
# Whisper size: tiny, base, small, medium, large-v3
WHISPER_MODEL_SIZE="small"

# Model Ollama backend gọi
OLLAMA_MODEL="qwen2.5:7b-instruct-q4_K_M"
```

---

## 🚀 Khởi chạy dự án

1. **Khởi tạo dữ liệu SQLite (Next.js)**:
   Di chuyển vào thư mục `sublingo-next/`, chạy lệnh sau để thiết lập database:
   ```bash
   npx prisma db push
   ```

2. **Chạy song song cả Frontend và Backend**:
   Chỉ cần một lệnh duy nhất từ thư mục `sublingo-next/`:
   ```bash
   npm run dev:all
   ```
   Lệnh này sẽ khởi động:
   - Next.js Client tại [http://localhost:3000](http://localhost:3000)
   - Python Backend tại [http://localhost:8000](http://localhost:8000)

---

## 💾 Thống kê hiệu năng & Tiết kiệm
Giao diện tab **Hiệu năng** sẽ hiển thị:
- **Số tiền tiết kiệm ước tính (USD)**: Lũy kế số tiền bạn tiết kiệm được khi chạy Local AI miễn phí thay vì phải trả phí cho dịch vụ cloud (Claude, Vbee...).
- **Tổng thời gian xử lý local**: Theo dõi sát sao thời gian chạy tính toán (giây/phút) của CPU/GPU trên máy của bạn cho từng tác vụ.

---

## ⚠️ Ghi Chú Sử Dụng Có Trách Nhiệm (Voice Cloning)

Vì đây là công nghệ nhân bản giọng nói, hãy tuân thủ nghiêm ngặt quy định:
> "Chỉ nhân bản giọng nói của chính bạn hoặc người đã đồng ý cho phép. Không dùng để giả giọng người khác (đặc biệt người nổi tiếng/công khai) nhằm mục đích lừa đảo, mạo danh, hoặc phát hành công khai mà không có sự cho phép. Tính năng này chỉ dành cho mục đích thử nghiệm/sử dụng cá nhân nội bộ."

