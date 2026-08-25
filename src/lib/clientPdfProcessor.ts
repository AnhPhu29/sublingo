// Client-side PDF Parser & Canvas Renderer with IndexedDB Storage
// Enables 100% serverless PDF book extraction on Vercel, iPhone, iPad, Chrome, Safari

export interface ClientParsedPage {
  pageNumber: number;
  text: string;
  imageUrl?: string;
  isOcr?: boolean;
}

export interface ClientBookDocument {
  docId: string;
  fileName: string;
  totalPages: number;
  ocrPagesCount: number;
  totalCharCount: number;
  totalWordCount: number;
  pages: ClientParsedPage[];
  hasPdfPages: boolean;
  lastPageRead: number;
  savedAt: number;
}

// ── IndexedDB Database Helper for High-Res Book Page Images ──────────────────
const DB_NAME = 'SubLingoReaderDb';
const DB_VERSION = 1;
const STORE_NAME = 'book_images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePageImageToDb(docId: string, pageNumber: number, dataUrl: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const key = `${docId}_page_${pageNumber}`;
      store.put({ key, docId, pageNumber, dataUrl });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Save page image error:', err);
  }
}

export async function getPageImageFromDb(docId: string, pageNumber: number): Promise<string | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const key = `${docId}_page_${pageNumber}`;
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result?.dataUrl || null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteBookImagesFromDb(docId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.docId === docId) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (err) {
    console.warn('[IndexedDB] Delete book images error:', err);
  }
}

// ── Dynamic PDF.js Loader ───────────────────────────────────────────────────
export async function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(pdfjs);
      } else {
        reject(new Error('PDF.js failed to initialize'));
      }
    };
    script.onerror = () => reject(new Error('Không thể tải thư viện xử lý PDF. Vui lòng kiểm tra kết nối mạng.'));
    document.head.appendChild(script);
  });
}

// ── Client-side PDF Parser & Canvas Page Renderer ───────────────────────────
export async function parsePdfFileInBrowser(
  file: File | Blob,
  fileName: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<ClientBookDocument> {
  onProgress?.('Đang khởi động bộ giải mã PDF trực tiếp trên trình duyệt...', 5);
  const pdfjs = await loadPdfJs();

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.('Đang đọc cấu trúc các trang sách...', 15);
  
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const docId = `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const pages: ClientParsedPage[] = [];
  let totalChars = 0;
  let totalWords = 0;

  for (let i = 1; i <= totalPages; i++) {
    const percent = Math.min(95, Math.round(15 + (i / totalPages) * 80));
    onProgress?.(`Đang phân tích và kết xuất trang ${i} / ${totalPages}...`, percent);

    const page = await pdf.getPage(i);

    // 1. Trích xuất text
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    totalChars += pageText.length;
    totalWords += pageText ? pageText.split(/\s+/).length : 0;

    // 2. Render 1:1 image on canvas with high DPI (scale 1.4)
    let imageUrl = '';
    try {
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        imageUrl = canvas.toDataURL('image/webp', 0.82) || canvas.toDataURL('image/jpeg', 0.82);
        await savePageImageToDb(docId, i, imageUrl);
      }
    } catch (renderErr) {
      console.warn(`Render page ${i} error:`, renderErr);
    }

    pages.push({
      pageNumber: i,
      text: pageText || `[Trang ${i}]`,
      imageUrl: imageUrl || undefined,
      isOcr: false,
    });
  }

  onProgress?.('Hoàn tất trích xuất sách!', 100);

  return {
    docId,
    fileName: fileName || 'Document.pdf',
    totalPages,
    ocrPagesCount: 0,
    totalCharCount: totalChars,
    totalWordCount: totalWords,
    pages,
    hasPdfPages: true,
    lastPageRead: 1,
    savedAt: Date.now(),
  };
}
