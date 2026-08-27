"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  BookOpen,
  Upload,
  Link as LinkIcon,
  FileText,
  ChevronLeft,
  ChevronRight,
  Search,
  Copy,
  Check,
  Download,
  Sparkles,
  Layers,
  AlertCircle,
  Trash2,
  AlignLeft,
  AlignJustify,
  Play,
  Pause,
  Square,
  FastForward,
  Headphones,
  Indent,
  Library,
  Plus,
  Columns,
  CloudRain,
  Volume2,
  Timer,
  Book,
} from "lucide-react";
import {
  ambientSound,
  AMBIENT_SOUND_OPTIONS,
  AmbientSoundType,
} from "@/lib/ambientSoundGenerator";
import {
  parsePdfFileInBrowser,
  getPageImageFromDb,
  deleteBookImagesFromDb,
} from "@/lib/clientPdfProcessor";

export interface PageData {
  pageNumber: number;
  text: string;
  image?: string;
  imageUrl?: string;
  isOcr: boolean;
  charCount: number;
  wordCount: number;
}

export interface BookDocument {
  docId: string;
  fileName: string;
  totalPages: number;
  ocrPagesCount: number;
  totalCharCount: number;
  totalWordCount: number;
  pages: PageData[];
  lastPageRead: number;
  savedAt: number;
  hasPdfPages?: boolean;
}

interface CustomVoiceItem {
  id: string;
  name: string;
  createdAt: string;
}

const STORAGE_KEY_CURRENT = "sublingo_reader_current";
const STORAGE_KEY_HISTORY = "sublingo_reader_history";
const STORAGE_KEY_PREFS = "sublingo_reader_prefs";

interface ReaderPrefs {
  fontSize: number; // 14 to 32
  fontFamily: "serif" | "sans" | "mono";
  lineHeight: number; // 1.6 to 2.2
  paperTheme: "sepia" | "default" | "dark";
  textAlign: "justify" | "left";
  paragraphIndent: boolean;
}

const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 18,
  fontFamily: "serif",
  lineHeight: 1.85,
  paperTheme: "sepia",
  textAlign: "justify",
  paragraphIndent: true,
};

// Danh sách các mẫu tiêu đề / tên tác giả / số trang footer lặp lại ở cuối/đầu trang PDF
const KNOWN_FOOTER_PATTERNS = [
  /^\s*dale\s+carnegie\s*$/i,
  /^\s*how\s+to\s+win\s+friends\s*(?:&|and)\s*influence\s+people\s*$/i,
  /^\s*đắc\s+nhân\s+tâm\s*$/i,
  /^\s*first\s+news\s*$/i,
  /^\s*trí\s+việt\s*$/i,
  /^\s*nxb\s+.*$/i,
  /^\s*nhà\s+xuất\s+bản\s+.*$/i,
  /^[—\-\s]*\d+[—\-\s]*$/,
  /^(?:Trang\s+)?-?\s*\d+\s*-?$/i,
  /^\d+\s*\/\s*\d+$/,
];

// Hàm xử lý nối các chữ cái bị giãn cách & lọc bỏ header/footer/số trang rác
export function cleanSpacedLettersAndArtifacts(rawText: string): string {
  if (!rawText) return "";

  // 1. Nối các từ bị gạch nối qua dòng (gạch nối ngắt dòng)
  let text = rawText
    .replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");

  // 2. Xử lý các dòng có chữ bị giãn cách nhiều khoảng trắng
  // Ví dụ: "Đ Ắ C  N H Â N  T Â M" -> "ĐẮC NHÂN TÂM"
  text = text.replace(/([^\n]+)/g, (line) => {
    if (/\b\p{L}\s+\p{L}/u.test(line)) {
      const segments = line.split(/\s{2,}/);
      const cleanedSegments = segments.map((seg) => {
        const tokens = seg.trim().split(/\s+/);
        if (tokens.length >= 2 && tokens.every((t) => t.length === 1 || /^\p{L}$/u.test(t))) {
          return tokens.join("");
        }
        return seg;
      });
      return cleanedSegments.join(" ");
    }
    return line;
  });

  // 3. Xử lý các cụm 3 chữ cái đơn lẻ liền kề (ví dụ: "Đ Ắ C N H Â N T Â M" cách đơn)
  text = text.replace(/(?:(?<=\s|^)\p{L}(?:\s+\p{L}){2,}(?=\s|$))/gu, (match) => {
    return match.replace(/\s+/g, "");
  });

  const lines = text.split("\n").map((l) => l.trim());

  // 4. Lọc bỏ các dòng Running Footer ở cuối trang (như DALE CARNEGIE, HOW TO WIN FRIENDS..., số trang)
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last) {
      lines.pop();
      continue;
    }
    const isFooter = KNOWN_FOOTER_PATTERNS.some((pattern) => pattern.test(last));
    if (isFooter) {
      lines.pop();
    } else {
      break;
    }
  }

  // 5. Lọc bỏ các dòng Running Header ở đầu trang
  while (lines.length > 0) {
    const first = lines[0];
    if (!first) {
      lines.shift();
      continue;
    }
    const isHeader = KNOWN_FOOTER_PATTERNS.some((pattern) => pattern.test(first));
    if (isHeader) {
      lines.shift();
    } else {
      break;
    }
  }

  // 6. Lọc các dòng chỉ chứa số trang đứng cô lập trong nội dung
  const filteredLines = lines.filter((l) => {
    if (!l) return true;
    return !KNOWN_FOOTER_PATTERNS.some((p) => p.test(l));
  });

  // 7. Chuẩn hóa khoảng trắng & ngắt câu
  return filteredLines
    .join("\n")
    .replace(/(?<!\n)\n(?!\n)/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// Client-side smart paragraph reflow helper
function reflowBookText(rawText: string): string[] {
  if (!rawText) return [];
  const cleaned = cleanSpacedLettersAndArtifacts(rawText);

  const lines = cleaned
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  // Remove standalone page numbers or footer headers at start or end
  while (lines.length && KNOWN_FOOTER_PATTERNS.some((p) => p.test(lines[0]))) {
    lines.shift();
  }
  while (lines.length && KNOWN_FOOTER_PATTERNS.some((p) => p.test(lines[lines.length - 1]))) {
    lines.pop();
  }

  const paragraphs: string[] = [];
  let currentPara: string[] = [];

  for (const line of lines) {
    if (!line) {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(" "));
        currentPara = [];
      }
      continue;
    }

    if (currentPara.length === 0) {
      currentPara.push(line);
    } else {
      const prevLine = currentPara[currentPara.length - 1];
      const isHeading = line.toUpperCase() === line && line.length < 60;
      const prevIsHeading = prevLine.toUpperCase() === prevLine && prevLine.length < 60;
      const prevEndedSentence = /[\.\!\?\:\;]["'”»]?\s*$/.test(prevLine);
      const isNewSection = /^(?:Chương|Phần|Mục|\d+\.|\-|\+)\s+/i.test(line);

      if (isHeading || prevIsHeading || (prevEndedSentence && (isNewSection || prevLine.length < 45))) {
        paragraphs.push(currentPara.join(" "));
        currentPara = [line];
      } else {
        currentPara.push(line);
      }
    }
  }

  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join(" "));
  }

  // Lọc bỏ đoạn văn nếu trùng với footer/header
  return paragraphs.filter((p) => !KNOWN_FOOTER_PATTERNS.some((pat) => pat.test(p.trim())));
}

// Helper: Lọc trùng danh sách sách theo docId và tên file
function deduplicateBooks(books: BookDocument[]): BookDocument[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: BookDocument[] = [];

  for (const b of books) {
    if (!b || !b.docId) continue;
    const cleanName = (b.fileName || "").toLowerCase().trim();
    if (!seenIds.has(b.docId) && !seenNames.has(cleanName)) {
      seenIds.add(b.docId);
      if (cleanName) seenNames.add(cleanName);
      result.push(b);
    }
  }
  return result;
}

export const ReaderSection: React.FC = () => {
  // Input states
  const [inputTab, setInputTab] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState<string>("");
  const [ocrLang, setOcrLang] = useState<string>("vi");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Processing state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active book & reading state
  const [mainTab, setMainTab] = useState<"reader" | "library" | "upload">("reader");
  const [librarySearchQuery, setLibrarySearchQuery] = useState<string>("");
  const [currentBook, setCurrentBook] = useState<BookDocument | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"reflow" | "pdf">("pdf");
  const [pdfZoom, setPdfZoom] = useState<number>(100);

  // Preferences
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);

  // History state (All Books in personal bookshelf)
  const [historyList, setHistoryList] = useState<BookDocument[]>([]);

  // ── TTS Audio Reading States & Refs ────────────────────────────────────────
  const [customVoices, setCustomVoices] = useState<CustomVoiceItem[]>([]);
  const [ttsVoiceId, setTtsVoiceId] = useState<string>("edge_hoaimy");
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);
  const [autoNextPage, setAutoNextPage] = useState<boolean>(true);
  const [isTtsLoading, setIsTtsLoading] = useState<boolean>(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState<boolean>(false);
  const [readingPageNum, setReadingPageNum] = useState<number | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsDuration, setTtsDuration] = useState<number>(0);
  const [ttsCurrentTime, setTtsCurrentTime] = useState<number>(0);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerContentRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Refs to avoid stale React closures during automatic page-turn chains
  const autoNextPageRef = useRef<boolean>(true);
  const isAutoPlayingChainRef = useRef<boolean>(false);
  const isInternalPageTurnRef = useRef<boolean>(false);
  const currentBookRef = useRef<BookDocument | null>(null);
  const currentPageRef = useRef<number>(1);
  const ttsVoiceIdRef = useRef<string>("edge_hoaimy");
  const ttsSpeedRef = useRef<number>(1.0);

  // In-memory audio blob cache: key = "page:{pageNum}:{voiceId}:{speed}" → Blob URL
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const prefetchingRef = useRef<Set<string>>(new Set()); // track in-flight prefetch requests

  // ── 4 TÍNH NĂNG NÂNG CẤP ĐỈNH CAO: AMBIENT, SPREAD, SLEEP TIMER, 3D FLIP ──
  const [pageSpreadMode, setPageSpreadMode] = useState<"single" | "double">("single");
  const [ambientType, setAmbientType] = useState<AmbientSoundType>("none");
  const [ambientVolume, setAmbientVolume] = useState<number>(0.35);
  const [isAmbientMenuOpen, setIsAmbientMenuOpen] = useState<boolean>(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number>(0);
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState<number | null>(null);
  const [isSleepMenuOpen, setIsSleepMenuOpen] = useState<boolean>(false);
  const [is3dFlipping, setIs3dFlipping] = useState<"next" | "prev" | null>(null);
  const [failedPageImages, setFailedPageImages] = useState<Record<string, boolean>>({});
  const [loadedDbImages, setLoadedDbImages] = useState<Record<string, string>>({});
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setFailedPageImages({});
    setLoadedDbImages({});
  }, [currentBook?.docId]);

  useEffect(() => {
    if (!currentBook) return;
    const key = `${currentBook.docId}_${currentPage}`;
    if (!loadedDbImages[key]) {
      getPageImageFromDb(currentBook.docId, currentPage).then((img) => {
        if (img) {
          setLoadedDbImages((prev) => ({ ...prev, [key]: img }));
        }
      });
    }
  }, [currentBook?.docId, currentPage]);

  useEffect(() => {
    autoNextPageRef.current = autoNextPage;
  }, [autoNextPage]);

  useEffect(() => {
    currentBookRef.current = currentBook;
  }, [currentBook]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    ttsVoiceIdRef.current = ttsVoiceId;
  }, [ttsVoiceId]);

  useEffect(() => {
    ttsSpeedRef.current = ttsSpeed;
  }, [ttsSpeed]);

  // 1. Load preferences, history, and custom voices on mount with Multi-Tier Progress Recovery
  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem(STORAGE_KEY_PREFS);
      if (savedPrefs) {
        setPrefs((prev) => ({ ...prev, ...JSON.parse(savedPrefs) }));
      }

      const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
      let books: BookDocument[] = [];
      if (savedHistory) {
        try {
          books = deduplicateBooks(JSON.parse(savedHistory));
          setHistoryList(books);
        } catch {}
      }

      const savedCurrent = localStorage.getItem(STORAGE_KEY_CURRENT);
      let initialBookLoaded: BookDocument | null = null;

      if (savedCurrent) {
        try {
          const book: BookDocument = JSON.parse(savedCurrent);
          if (book && book.docId && book.pages && book.pages.length > 0) {
            initialBookLoaded = book;
            const customBookPage = localStorage.getItem(`sublingo_book_progress_${book.docId}`);
            const globalLastPage = localStorage.getItem("sublingo_last_active_page");
            const targetPage = (customBookPage ? parseInt(customBookPage) : 0) || (globalLastPage ? parseInt(globalLastPage) : 0) || book.lastPageRead || 1;
            
            const cleanPage = Math.max(1, Math.min(book.totalPages || book.pages.length, targetPage));
            setCurrentBook(book);
            currentBookRef.current = book;
            setCurrentPage(cleanPage);
            currentPageRef.current = cleanPage;
            setMainTab("reader");
          }
        } catch {}
      } else if (books.length > 0) {
        setMainTab("library");
      } else {
        setMainTab("reader");
      }

      // Tự động đồng bộ cuốn sách Đắc Nhân Tâm vào Tủ Sách mà KHÔNG ghi đè tiến trình đọc của người dùng
      fetch("/dac_nhan_tam_book.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((sampleBook: BookDocument | null) => {
          if (sampleBook) {
            const customSampleProgress = localStorage.getItem(`sublingo_book_progress_${sampleBook.docId}`);
            const sampleSavedPage = customSampleProgress ? parseInt(customSampleProgress) : 0;

            setHistoryList((prev) => {
              const existingInHistory = prev.find(
                (b) =>
                  b.docId === sampleBook.docId ||
                  b.fileName.toLowerCase().trim() === sampleBook.fileName.toLowerCase().trim()
              );
              const preservedPage = sampleSavedPage || existingInHistory?.lastPageRead || 1;
              const mergedSample: BookDocument = {
                ...sampleBook,
                lastPageRead: preservedPage,
              };

              const withoutSample = prev.filter(
                (b) =>
                  b.docId !== sampleBook.docId &&
                  b.fileName.toLowerCase().trim() !== sampleBook.fileName.toLowerCase().trim()
              );
              const updated = deduplicateBooks([mergedSample, ...withoutSample]).slice(0, 30);
              try {
                localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
              } catch {}
              return updated;
            });

            // Chỉ mở mẫu nếu hiện tại hoàn toàn chưa có sách nào
            if (!initialBookLoaded) {
              const pageToOpen = sampleSavedPage || 1;
              const cleanSample = { ...sampleBook, lastPageRead: pageToOpen };
              setCurrentBook(cleanSample);
              currentBookRef.current = cleanSample;
              setCurrentPage(pageToOpen);
              currentPageRef.current = pageToOpen;
              setMainTab("reader");
              try {
                localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(cleanSample));
                localStorage.setItem(`sublingo_book_progress_${sampleBook.docId}`, String(pageToOpen));
                localStorage.setItem("sublingo_last_active_page", String(pageToOpen));
              } catch {}
            }
          }
        })
        .catch(() => {});
    } catch (e) {
      console.error("Failed to load reader storage:", e);
    }

    // Load custom voices list
    fetch("/api/custom-voices")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.voices) && data.voices.length > 0) {
          setCustomVoices(data.voices);
        }
      })
      .catch((err) => console.warn("Failed to load custom voices:", err));

    // Nạp sẵn mô hình AI VieNeu-TTS vào RAM (Warm-up)
    fetch("/api/voices").catch(() => {});

    // Hook bắt sự kiện đóng tab/rời trang để luôn lưu lại trang đang nghe/đọc
    const handleBeforeUnload = () => {
      const b = currentBookRef.current;
      const p = currentPageRef.current;
      if (b && b.docId && p) {
        try {
          localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify({ ...b, lastPageRead: p, savedAt: Date.now() }));
          localStorage.setItem(`sublingo_book_progress_${b.docId}`, String(p));
          localStorage.setItem("sublingo_last_active_book_id", b.docId);
          localStorage.setItem("sublingo_last_active_page", String(p));
        } catch {}
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, []);

  // Save prefs on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
    } catch (e) {
      console.error("Failed to save prefs:", e);
    }
  }, [prefs]);

  // Save reading progress on page change (Instant Multi-tier storage)
  useEffect(() => {
    currentPageRef.current = currentPage;
    if (!currentBook || !currentBook.docId) return;

    const updatedBook: BookDocument = {
      ...currentBook,
      lastPageRead: currentPage,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(updatedBook));
      localStorage.setItem(`sublingo_book_progress_${currentBook.docId}`, String(currentPage));
      localStorage.setItem("sublingo_last_active_book_id", currentBook.docId);
      localStorage.setItem("sublingo_last_active_page", String(currentPage));

      // Update in history list
      setHistoryList((prev) => {
        const filtered = prev.filter(
          (b) =>
            b.docId !== updatedBook.docId &&
            b.fileName.toLowerCase().trim() !== updatedBook.fileName.toLowerCase().trim()
        );
        const next = deduplicateBooks([updatedBook, ...filtered]).slice(0, 30);
        try {
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (e) {
      console.error("Failed to save reading progress:", e);
    }

    // Scroll to top of page content on page switch
    if (readerContentRef.current) {
      readerContentRef.current.scrollTop = 0;
    }

    // If page turn was triggered automatically by TTS, don't stop audio!
    if (isInternalPageTurnRef.current) {
      isInternalPageTurnRef.current = false;
      return;
    }

    // Otherwise, it was a manual user action, so stop continuous playback
    isAutoPlayingChainRef.current = false;
    stopTts();
  }, [currentPage, currentBook?.docId]);

  // Handle Keyboard navigation
  useEffect(() => {
    if (!currentBook) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToNextPage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentBook, currentPage]);

  // Kích hoạt hiệu ứng lật trang 3D vật lý
  const trigger3dPageFlip = (direction: "next" | "prev", newPage: number, callback?: () => void) => {
    setIs3dFlipping(direction);
    setTimeout(() => {
      setCurrentPage(newPage);
      if (callback) callback();
    }, 280);
    setTimeout(() => {
      setIs3dFlipping(null);
    }, 580);
  };

  const goToPrevPage = () => {
    const step = (!isMobileScreen && pageSpreadMode === "double") ? 2 : 1;
    const prevPage = Math.max(1, currentPage - step);
    if (prevPage === currentPage) return;
    if (isTtsPlaying) {
      isInternalPageTurnRef.current = true;
      trigger3dPageFlip("prev", prevPage, () => {
        playPageAudio(prevPage);
      });
    } else {
      trigger3dPageFlip("prev", prevPage);
    }
  };

  const goToNextPage = () => {
    if (!currentBook) return;
    const step = (!isMobileScreen && pageSpreadMode === "double") ? 2 : 1;
    const nextPage = Math.min(currentBook.totalPages, currentPage + step);
    if (nextPage === currentPage) return;
    if (isTtsPlaying) {
      isInternalPageTurnRef.current = true;
      trigger3dPageFlip("next", nextPage, () => {
        playPageAudio(nextPage);
      });
    } else {
      trigger3dPageFlip("next", nextPage);
    }
  };

  // ── Touch Gesture Swiping for Mobile & Tablet (Lướt ngón tay sang trái/phải để lật trang) ──
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0) {
        goToNextPage();
      } else {
        goToPrevPage();
      }
    }
  };

  // ── Sleep Timer: Đếm ngược & Tự động dừng audio khi hết giờ ───────────────
  useEffect(() => {
    if (sleepTimerRemainingSec === null) return;
    if (sleepTimerRemainingSec <= 0) {
      stopTts();
      if (ambientSound) ambientSound.stop();
      setAmbientType("none");
      setSleepTimerRemainingSec(null);
      setSleepTimerMinutes(0);
      return;
    }

    const timerId = setInterval(() => {
      setSleepTimerRemainingSec((sec) => {
        if (sec === null || sec <= 1) return 0;
        // Mờ dần âm lượng (Fade-out) trong 15 giây cuối cùng
        if (sec <= 15 && audioRef.current) {
          audioRef.current.volume = Math.max(0, sec / 15);
        }
        return sec - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [sleepTimerRemainingSec]);

  const handleSetSleepTimer = (minutes: number) => {
    setSleepTimerMinutes(minutes);
    setIsSleepMenuOpen(false);
    if (minutes <= 0) {
      setSleepTimerRemainingSec(null);
      if (audioRef.current) audioRef.current.volume = 1;
    } else {
      setSleepTimerRemainingSec(minutes * 60);
      if (audioRef.current) audioRef.current.volume = 1;
    }
  };

  const formatSleepTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── Ambient Soundscapes Handlers ───────────────────────────────────────────
  const handleSelectAmbientSound = (type: AmbientSoundType) => {
    setAmbientType(type);
    if (ambientSound) {
      ambientSound.play(type);
    }
  };

  const handleChangeAmbientVolume = (vol: number) => {
    setAmbientVolume(vol);
    if (ambientSound) {
      ambientSound.setVolume(vol);
    }
  };

  // Get current page object and reflowed paragraphs
  const activePageData = useMemo(() => {
    return currentBook?.pages.find((p) => p.pageNumber === currentPage) || null;
  }, [currentBook, currentPage]);

  const activeParagraphs = useMemo(() => {
    if (!activePageData?.text) return [];
    return reflowBookText(activePageData.text);
  }, [activePageData?.text]);

  // Smooth word-level highlight animation frame (60fps)
  useEffect(() => {
    let animId: number;
    const updateTime = () => {
      if (audioRef.current && isTtsPlaying) {
        setTtsCurrentTime(audioRef.current.currentTime || 0);
        animId = requestAnimationFrame(updateTime);
      }
    };
    if (isTtsPlaying) {
      animId = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isTtsPlaying]);

  // ── High-Precision Phonetic & Punctuation Word Timings ──────────────────────
  // Tự động phân bổ mốc thời gian start / end cho từng từ dựa trên:
  // 1. Độ dài âm tiết thực tế của từ tiếng Việt
  // 2. Độ dừng nghỉ tự nhiên của giọng đọc AI tại các dấu phẩy, chấm, hỏi, than
  // 3. Độ dừng nghỉ khi chuyển đoạn văn
  const pageWordTimings = useMemo(() => {
    if (activeParagraphs.length === 0 || ttsDuration <= 0) return [];

    interface WordTimingItem {
      globalIdx: number;
      word: string;
      start: number;
      end: number;
    }

    const items: { globalIdx: number; word: string; weight: number }[] = [];
    let gIdx = 0;

    activeParagraphs.forEach((para, pIdx) => {
      const tokens = para.trim().split(/\s+/).filter(Boolean);
      tokens.forEach((w, wIdx) => {
        const isLastInPara = wIdx === tokens.length - 1;
        const cleanW = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        const charLen = cleanW ? cleanW.length : w.length;

        // Trọng số cơ bản theo độ dài âm tiết
        let weight = Math.max(1.0, charLen * 0.28);

        // Trọng số khoảng lặng khi gặp dấu ngắt câu (dấu phẩy, chấm, hỏi, than)
        if (/[,;:\-–—]$/.test(w)) {
          weight += 1.3;
        } else if (/[.!?…]$/.test(w)) {
          weight += 2.2;
        }

        // Trọng số khoảng nghỉ giữa các đoạn văn
        if (isLastInPara) {
          weight += 2.8;
        }

        items.push({
          globalIdx: gIdx++,
          word: w,
          weight,
        });
      });
    });

    const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);
    if (totalWeight <= 0) return [];

    let currentSec = 0;
    const result: WordTimingItem[] = [];

    items.forEach((it) => {
      const durSec = (it.weight / totalWeight) * ttsDuration;
      result.push({
        globalIdx: it.globalIdx,
        word: it.word,
        start: currentSec,
        end: currentSec + durSec,
      });
      currentSec += durSec;
    });

    return result;
  }, [activeParagraphs, ttsDuration]);

  // Vị trí từ đơn lẻ (1 chữ duy nhất) đang được phát âm thanh đồng bộ 60fps
  const activeWordGlobalIdx = useMemo(() => {
    if (!isTtsPlaying || readingPageNum !== currentPage || ttsDuration <= 0 || pageWordTimings.length === 0) {
      return -1;
    }

    const cur = ttsCurrentTime;
    const found = pageWordTimings.find((item) => cur >= item.start && cur < item.end);
    if (found) return found.globalIdx;

    if (cur >= pageWordTimings[pageWordTimings.length - 1].start) {
      return pageWordTimings.length - 1;
    }

    return 0;
  }, [isTtsPlaying, readingPageNum, currentPage, ttsDuration, pageWordTimings, ttsCurrentTime]);

  // Tự động cuộn trang mượt mà theo từ đang đọc (Auto-Scroll)
  useEffect(() => {
    if (!isTtsPlaying || activeWordGlobalIdx < 0) return;
    const el = document.getElementById(`reader-word-${activeWordGlobalIdx}`);
    if (el && readerContentRef.current) {
      const container = readerContentRef.current;
      const elRect = el.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();

      if (elRect.bottom > contRect.bottom - 60 || elRect.top < contRect.top + 60) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeWordGlobalIdx, isTtsPlaying]);

  // ── TTS Audio Reading Engine (với Pre-fetch Pipeline) ─────────────────────

  // Helper: Tạo cache key cho 1 trang
  const makeCacheKey = (pageNum: number) =>
    `page:${pageNum}:${ttsVoiceIdRef.current}:${ttsSpeedRef.current}`;

  // Helper: Fetch audio cho 1 trang và lưu vào memory cache, trả về blob URL
  const fetchPageAudioBlob = async (pageNum: number): Promise<string | null> => {
    const book = currentBookRef.current;
    if (!book) return null;

    const page = book.pages.find((p) => p.pageNumber === pageNum);
    if (!page || !page.text || !page.text.trim()) return null;

    const cacheKey = makeCacheKey(pageNum);

    // Đã có trong memory cache → trả về ngay
    if (audioCacheRef.current.has(cacheKey)) {
      return audioCacheRef.current.get(cacheKey)!;
    }

    const res = await fetch("/api/reader/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: cleanSpacedLettersAndArtifacts(page.text),
        voiceId: ttsVoiceIdRef.current,
        speed: ttsSpeedRef.current,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Không thể tạo giọng đọc cho trang ${pageNum}.`);
    }

    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    // Lưu vào memory cache
    audioCacheRef.current.set(cacheKey, audioUrl);

    return audioUrl;
  };

  // Helper: Pre-fetch ngầm N trang kế tiếp (không block UI, chạy song song)
  const prefetchAhead = (fromPage: number, count: number = 3) => {
    const book = currentBookRef.current;
    if (!book) return;

    for (let i = 1; i <= count; i++) {
      const targetPage = fromPage + i;
      if (targetPage > book.totalPages) break;

      const cacheKey = makeCacheKey(targetPage);

      // Đã có trong cache hoặc đang fetch → bỏ qua
      if (audioCacheRef.current.has(cacheKey) || prefetchingRef.current.has(cacheKey)) continue;

      const page = book.pages.find((p) => p.pageNumber === targetPage);
      if (!page || !page.text || !page.text.trim()) continue;

      // Đánh dấu đang prefetch
      prefetchingRef.current.add(cacheKey);

      fetchPageAudioBlob(targetPage)
        .then(() => {
          console.log(`[Prefetch] Trang ${targetPage} đã nạp xong vào cache ✓`);
        })
        .catch((err) => {
          console.warn(`[Prefetch] Lỗi nạp trang ${targetPage}:`, err);
        })
        .finally(() => {
          prefetchingRef.current.delete(cacheKey);
        });
    }
  };

  const stopTts = () => {
    isAutoPlayingChainRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsTtsPlaying(false);
    setIsTtsLoading(false);
    setReadingPageNum(null);
    setTtsCurrentTime(0);
  };

  const playPageAudio = async (targetPageNum: number) => {
    const book = currentBookRef.current;
    if (!book) return;

    const page = book.pages.find((p) => p.pageNumber === targetPageNum);

    // Nếu trang trống, tự động bỏ qua sang trang kế tiếp
    if (!page || !page.text || !page.text.trim()) {
      if (autoNextPageRef.current && isAutoPlayingChainRef.current && targetPageNum < book.totalPages) {
        const nextTarget = targetPageNum + 1;
        isInternalPageTurnRef.current = true;
        setCurrentPage(nextTarget);
        setTimeout(() => playPageAudio(nextTarget), 100);
        return;
      }
      stopTts();
      return;
    }

    setTtsError(null);
    setReadingPageNum(targetPageNum);
    isAutoPlayingChainRef.current = true;

    // Kiểm tra memory cache trước
    const cacheKey = makeCacheKey(targetPageNum);
    const cachedUrl = audioCacheRef.current.get(cacheKey);

    if (!cachedUrl) {
      setIsTtsLoading(true);
    }

    try {
      // 1. Thử fetch từ API
      const audioUrl = cachedUrl || (await fetchPageAudioBlob(targetPageNum));
      if (audioUrl) {
        setTtsAudioUrl(audioUrl);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        audio.src = audioUrl;

        audio.onloadedmetadata = () => {
          setTtsDuration(audio.duration || 0);
        };

        audio.ontimeupdate = () => {
          setTtsCurrentTime(audio.currentTime || 0);
        };

        audio.onended = () => {
          setTtsCurrentTime(0);

          const currentActiveBook = currentBookRef.current;
          const total = currentActiveBook?.totalPages || 0;
          const shouldContinue =
            autoNextPageRef.current && isAutoPlayingChainRef.current && targetPageNum < total;

          if (shouldContinue) {
            const nextTarget = targetPageNum + 1;
            isInternalPageTurnRef.current = true;
            setCurrentPage(nextTarget);
            playPageAudio(nextTarget);
          } else {
            setIsTtsPlaying(false);
            isAutoPlayingChainRef.current = false;
            setReadingPageNum(null);
          }
        };

        audio.onerror = () => {
          setIsTtsPlaying(false);
          setIsTtsLoading(false);
          isAutoPlayingChainRef.current = false;
          setTtsError("Lỗi phát âm thanh. Vui lòng thử lại.");
        };

        await audio.play();
        setIsTtsPlaying(true);
        setIsTtsLoading(false);

        prefetchAhead(targetPageNum, 3);
        return;
      }
    } catch (err: any) {
      console.warn("TTS API fetch fallback to Web Speech Synthesis:", err);
    }

    // 2. 🔥 Web Speech Synthesis Fallback (Chạy trực tiếp trên trình duyệt 100% không cần server)
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const textToSpeak = cleanSpacedLettersAndArtifacts(page.text);
        if (!textToSpeak.trim()) {
          setIsTtsPlaying(false);
          setIsTtsLoading(false);
          return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = "vi-VN";
        utterance.rate = Number(ttsSpeedRef.current) || 1.0;

        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find((v) => v.lang === "vi-VN" || v.lang.startsWith("vi"));
        if (viVoice) {
          utterance.voice = viVoice;
        }

        utterance.onstart = () => {
          setIsTtsPlaying(true);
          setIsTtsLoading(false);
        };

        utterance.onend = () => {
          const currentActiveBook = currentBookRef.current;
          const total = currentActiveBook?.totalPages || 0;
          const shouldContinue =
            autoNextPageRef.current && isAutoPlayingChainRef.current && targetPageNum < total;

          if (shouldContinue) {
            const nextTarget = targetPageNum + 1;
            isInternalPageTurnRef.current = true;
            setCurrentPage(nextTarget);
            playPageAudio(nextTarget);
          } else {
            setIsTtsPlaying(false);
            isAutoPlayingChainRef.current = false;
            setReadingPageNum(null);
          }
        };

        utterance.onerror = (e) => {
          console.warn("SpeechSynthesis error:", e);
          setIsTtsPlaying(false);
          setIsTtsLoading(false);
          isAutoPlayingChainRef.current = false;
        };

        window.speechSynthesis.speak(utterance);
        setIsTtsPlaying(true);
        setIsTtsLoading(false);
        return;
      } catch (synthErr) {
        console.error("Speech synthesis failed:", synthErr);
      }
    }

    setIsTtsPlaying(false);
    setIsTtsLoading(false);
    isAutoPlayingChainRef.current = false;
    setTtsError("Không thể phát âm thanh trên thiết bị này.");
  };

  const handleTogglePlay = () => {
    if (isTtsPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsTtsPlaying(false);
    } else {
      isAutoPlayingChainRef.current = true;
      playPageAudio(currentPage);
    }
  };

  const handleStopTts = () => {
    stopTts();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setTtsCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage("Vui lòng chỉ chọn file có định dạng .PDF");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("Dung lượng file PDF vượt quá 50MB. Vui lòng chọn file nhỏ hơn.");
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage("Vui lòng chỉ kéo thả file có định dạng .PDF");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("Dung lượng file PDF vượt quá 50MB.");
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
  };

  // Process Document
  const handleStartExtraction = async () => {
    setErrorMessage(null);

    if (inputTab === "file" && !selectedFile) {
      setErrorMessage("Vui lòng chọn hoặc kéo thả file PDF trước khi bắt đầu.");
      return;
    }

    if (inputTab === "url" && (!urlInput || !urlInput.trim())) {
      setErrorMessage("Vui lòng nhập đường link URL của file PDF.");
      return;
    }

    setIsLoading(true);
    setLoadingStage("Đang chuẩn bị bộ giải mã PDF...");

    try {
      let parsedBook: BookDocument | null = null;

      // 1. 🔥 ƯU TIÊN TRÍCH XUẤT TRỰC TIẾP TRÊN TRÌNH DUYỆT (Tạo ảnh Canvas 1:1 + Text)
      if (inputTab === "file" && selectedFile) {
        try {
          const clientBook = await parsePdfFileInBrowser(
            selectedFile,
            selectedFile.name,
            (stage, percent) => {
              setLoadingStage(`${stage} (${percent}%)`);
            }
          );
          parsedBook = clientBook as BookDocument;
        } catch (clientErr) {
          console.warn("Client PDF.js parsing fallback to API:", clientErr);
        }
      }

      // 2. Nếu là Link URL hoặc Client trích xuất cần fallback API
      if (!parsedBook) {
        const formData = new FormData();
        formData.append("lang", ocrLang);

        if (inputTab === "file" && selectedFile) {
          formData.append("file", selectedFile, selectedFile.name);
          setLoadingStage(`Đang tải lên file "${selectedFile.name}"...`);
        } else {
          formData.append("url", urlInput.trim());
          setLoadingStage("Đang tải file PDF từ link URL...");
        }

        const res = await fetch("/api/reader/extract", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Không thể trích xuất nội dung từ file PDF.");
        }

        parsedBook = {
          docId: data.docId || `doc_${Date.now()}`,
          fileName: data.fileName || (selectedFile ? selectedFile.name : "Online_Book.pdf"),
          totalPages: data.totalPages || data.pages.length,
          ocrPagesCount: data.ocrPagesCount || 0,
          totalCharCount: data.totalCharCount || 0,
          totalWordCount: data.totalWordCount || 0,
          pages: data.pages || [],
          hasPdfPages: data.hasPdfPages ?? true,
          lastPageRead: 1,
          savedAt: Date.now(),
        };
      }

      const newBook = parsedBook;

      // Lưu trữ phiên bản nhẹ vào localStorage (loại bỏ base64 ảnh nặng để không tràn dung lượng)
      const storageBook: BookDocument = {
        ...newBook,
        pages: newBook.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
          charCount: p.charCount || p.text.length,
          wordCount: p.wordCount || (p.text ? p.text.split(/\s+/).length : 0),
          isOcr: p.isOcr || false,
        })),
      };

      setCurrentBook(newBook);
      currentBookRef.current = newBook;
      setCurrentPage(1);
      setViewMode("pdf");
      setSelectedFile(null);
      setUrlInput("");
      setMainTab("reader");

      // Save to storage
      try {
        localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(storageBook));
      } catch {}

      setHistoryList((prev) => {
        const filtered = prev.filter(
          (b) =>
            b.docId !== newBook.docId &&
            b.fileName.toLowerCase().trim() !== newBook.fileName.toLowerCase().trim()
        );
        const next = deduplicateBooks([storageBook, ...filtered]).slice(0, 30);
        try {
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (err: any) {
      console.error("PDF Extraction error:", err);
      setErrorMessage(err.message || "Đã xảy ra lỗi trong quá trình xử lý file PDF.");
    } finally {
      setIsLoading(false);
      setLoadingStage("");
    }
  };

  // Switch book selection with multi-tier progress recovery
  const handleSelectBook = (book: BookDocument) => {
    stopTts();
    const customProgress = localStorage.getItem(`sublingo_book_progress_${book.docId}`);
    const targetPage = (customProgress ? parseInt(customProgress) : 0) || book.lastPageRead || 1;
    const cleanPage = Math.max(1, Math.min(book.totalPages || (book.pages ? book.pages.length : 1), targetPage));
    const updatedBook = { ...book, lastPageRead: cleanPage };

    setCurrentBook(updatedBook);
    currentBookRef.current = updatedBook;
    setCurrentPage(cleanPage);
    currentPageRef.current = cleanPage;
    setViewMode("pdf");
    setMainTab("reader");

    try {
      localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(updatedBook));
      localStorage.setItem(`sublingo_book_progress_${book.docId}`, String(cleanPage));
      localStorage.setItem("sublingo_last_active_book_id", book.docId);
      localStorage.setItem("sublingo_last_active_page", String(cleanPage));
    } catch {}
  };

  // Delete book from library
  const handleDeleteBook = (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    deleteBookImagesFromDb(docId);
    setHistoryList((prev) => {
      const next = prev.filter((b) => b.docId !== docId);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
      return next;
    });

    if (currentBook?.docId === docId) {
      stopTts();
      setCurrentBook(null);
      currentBookRef.current = null;
      localStorage.removeItem(STORAGE_KEY_CURRENT);
      setMainTab("library");
    }
  };

  // Copy current page text
  const handleCopyPageText = () => {
    if (!activeParagraphs.length) return;
    const textToCopy = activeParagraphs.join("\n\n");
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Download all text as .txt
  const handleDownloadFullBook = () => {
    if (!currentBook) return;

    const fullContent = currentBook.pages
      .map((p) => {
        const reflowed = reflowBookText(p.text).join("\n\n");
        return `=== TRANG ${p.pageNumber} ===\n\n${reflowed}`;
      })
      .join("\n\n\n");

    const blob = new Blob([fullContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentBook.fileName.replace(/\.pdf$/i, "")}_extracted.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered books in library shelf (Đảm bảo lọc sạch trùng lặp)
  const filteredLibraryBooks = useMemo(() => {
    const unique = deduplicateBooks(historyList);
    if (!librarySearchQuery.trim()) return unique;
    const q = librarySearchQuery.toLowerCase();
    return unique.filter((b) => (b.fileName || "").toLowerCase().includes(q));
  }, [historyList, librarySearchQuery]);

  // Filtered pages in sidebar
  const filteredPages = useMemo(() => {
    if (!currentBook) return [];
    if (!searchQuery.trim()) return currentBook.pages;
    const q = searchQuery.toLowerCase();
    return currentBook.pages.filter(
      (p) => p.pageNumber.toString() === q || p.text.toLowerCase().includes(q)
    );
  }, [currentBook, searchQuery]);

  // Paper Theme Styling (Đảm bảo màu chuẩn sách giấy, độ tương phản cao, êm dịu mắt)
  const getThemeStyles = () => {
    switch (prefs.paperTheme) {
      case "sepia":
        return {
          paperBg: "#faf4e8",
          paperText: "#2d241e",
          paperBorder: "#e8dac6",
          outerCanvasBg: "#efe6d5",
          headerColor: "#7a6352",
          dividerColor: "rgba(122, 99, 82, 0.2)",
          shadow: "0 10px 30px -5px rgba(80, 50, 20, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)",
        };
      case "dark":
        return {
          paperBg: "#171a23",
          paperText: "#e2e8f0",
          paperBorder: "#272e3d",
          outerCanvasBg: "#0f1118",
          headerColor: "#8892b0",
          dividerColor: "rgba(255, 255, 255, 0.08)",
          shadow: "0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)",
        };
      default:
        return {
          paperBg: "#ffffff",
          paperText: "#1e293b",
          paperBorder: "#e2e8f0",
          outerCanvasBg: "#f1f5f9",
          headerColor: "#64748b",
          dividerColor: "rgba(0, 0, 0, 0.08)",
          shadow: "0 10px 30px -5px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
        };
    }
  };

  const themeStyle = getThemeStyles();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ── TOP NAV BAR (TAB SWITCHER: ĐANG ĐỌC / TỦ SÁCH / THÊM SÁCH) ──────── */}
      <div
        className="reader-top-tab-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "0.85rem 1.25rem",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "var(--accent-soft)",
              color: "var(--accent-gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BookOpen size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text)" }}>
              Trình Đọc Sách & Tạo Giọng Đọc AI (TTS)
            </h2>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
              Tủ sách đa năng • Nạp giọng đọc 100% tiếng Việt • Tự động lật trang
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div
          className="tab-btn-group"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            background: "var(--bg-elevated-2)",
            padding: "4px",
            borderRadius: "var(--radius-xs)",
            flexWrap: "wrap",
            width: isMobileScreen ? "100%" : "auto",
          }}
        >
          {currentBook && (
            <button
              type="button"
              onClick={() => setMainTab("reader")}
              style={{
                padding: "0.45rem 0.65rem",
                borderRadius: "var(--radius-xs)",
                border: "none",
                background: mainTab === "reader" ? "var(--accent-gold)" : "transparent",
                color: mainTab === "reader" ? "#FFFFFF" : "var(--text)",
                fontWeight: 700,
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
                flex: isMobileScreen ? "1 1 auto" : "initial",
                minWidth: "90px",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              <BookOpen size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                Đang đọc: {currentBook.fileName.replace(/\.pdf$/i, "").slice(0, 14)}...
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMainTab("library")}
            style={{
              padding: "0.45rem 0.65rem",
              borderRadius: "var(--radius-xs)",
              border: "none",
              background: mainTab === "library" ? "var(--accent-gold)" : "transparent",
              color: mainTab === "library" ? "#FFFFFF" : "var(--text)",
              fontWeight: 700,
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              flex: isMobileScreen ? "1 1 auto" : "initial",
              whiteSpace: "nowrap",
            }}
          >
            <Library size={14} style={{ flexShrink: 0 }} />
            <span>Tủ Sách ({historyList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab("upload")}
            style={{
              padding: "0.45rem 0.65rem",
              borderRadius: "var(--radius-xs)",
              border: "none",
              background: mainTab === "upload" ? "var(--accent-gold)" : "transparent",
              color: mainTab === "upload" ? "#FFFFFF" : "var(--text)",
              fontWeight: 700,
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              flex: isMobileScreen ? "1 1 auto" : "initial",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} style={{ flexShrink: 0 }} />
            <span>Thêm Sách</span>
          </button>
        </div>
      </div>

      {/* ── 1. GIAO DIỆN TỦ SÁCH CỦA TÔI (BOOKSHELF / LIBRARY) ──────────────── */}
      {mainTab === "library" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Header Bar of Bookshelf */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
              background: "var(--card)",
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Library size={20} style={{ color: "var(--accent-gold)" }} />
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text)" }}>
                Tủ Sách Của Tôi ({historyList.length} cuốn sách)
              </h3>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {/* Search Box */}
              <div style={{ position: "relative", minWidth: "250px" }}>
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="Tìm kiếm sách trong tủ..."
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.75rem 0.45rem 2.2rem",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text)",
                    fontSize: "0.82rem",
                    outline: "none",
                  }}
                />
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: "0.7rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setMainTab("upload")}
                style={{
                  padding: "0.5rem 1rem",
                  background: "var(--accent-gold)",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  cursor: "pointer",
                }}
              >
                <Plus size={15} />
                Thêm Sách Mới
              </button>
            </div>
          </div>

          {/* Bookshelf Grid */}
          <div
            className="reader-library-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {filteredLibraryBooks.map((item, idx) => {
              const isCurrent = currentBook?.docId === item.docId;
              const progressPercent = Math.min(
                100,
                Math.round(((item.lastPageRead || 1) / item.totalPages) * 100)
              );

              return (
                <div
                  key={`book_${item.docId}_${idx}`}
                  style={{
                    background: "var(--card)",
                    border: isCurrent ? "2px solid var(--accent-gold)" : "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "1rem",
                    boxShadow: "var(--shadow-card)",
                    position: "relative",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isCurrent && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-10px",
                        right: "14px",
                        background: "var(--accent-gold)",
                        color: "#FFFFFF",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "2px 10px",
                        borderRadius: "12px",
                        boxShadow: "0 2px 6px rgba(37,99,235,0.4)",
                      }}
                    >
                      Đang đọc dở
                    </div>
                  )}

                  <div>
                    {/* Top Row: Icon & Delete Button */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "12px",
                          background: "var(--accent-soft)",
                          color: "var(--accent-gold)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <BookOpen size={22} />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteBook(item.docId, e)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "6px",
                          borderRadius: "4px",
                        }}
                        title="Xóa sách này khỏi tủ"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Book Title */}
                    <h4
                      style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: "var(--text)",
                        margin: "0.85rem 0 0.4rem 0",
                        lineHeight: 1.35,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                      title={item.fileName}
                    >
                      {item.fileName.replace(/\.pdf$/i, "")}
                    </h4>

                    {/* Meta info */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        fontSize: "0.76rem",
                        color: "var(--text-muted)",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <span>📄 {item.totalPages} trang</span>
                      <span>•</span>
                      <span>📝 ~{item.totalWordCount.toLocaleString()} từ</span>
                      {item.ocrPagesCount > 0 && (
                        <>
                          <span>•</span>
                          <span style={{ color: "#b45309", fontWeight: 650 }}>🔍 AI OCR ({item.ocrPagesCount} tr)</span>
                        </>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        background: "var(--bg-elevated-2)",
                        borderRadius: "4px",
                        height: "6px",
                        overflow: "hidden",
                        margin: "0.5rem 0 0.25rem 0",
                      }}
                    >
                      <div
                        style={{
                          background: "var(--accent-gold)",
                          height: "100%",
                          width: `${progressPercent}%`,
                          transition: "width 0.2s ease",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      <span>Trang {item.lastPageRead || 1} / {item.totalPages}</span>
                      <span>{progressPercent}%</span>
                    </div>
                  </div>

                  {/* Read Button */}
                  <button
                    type="button"
                    onClick={() => handleSelectBook(item)}
                    style={{
                      width: "100%",
                      padding: "0.65rem",
                      background: isCurrent ? "var(--accent-gold)" : "var(--bg-elevated-2)",
                      color: isCurrent ? "#FFFFFF" : "var(--text)",
                      border: isCurrent ? "none" : "1px solid var(--border)",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.45rem",
                      transition: "all 0.15s ease",
                      boxShadow: isCurrent ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
                    }}
                  >
                    <BookOpen size={16} />
                    {isCurrent ? "Tiếp Tục Đọc Sách Này" : "Đọc Sách Này"}
                  </button>
                </div>
              );
            })}

            {/* Quick Add Card */}
            <div
              onClick={() => setMainTab("upload")}
              style={{
                border: "2px dashed var(--border)",
                borderRadius: "var(--radius)",
                padding: "2rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "0.75rem",
                cursor: "pointer",
                background: "var(--card)",
                transition: "all 0.15s ease",
                minHeight: "220px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "var(--accent-soft)",
                  color: "var(--accent-gold)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={24} />
              </div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text)" }}>
                Thêm Sách Mới Vào Tủ
              </h4>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
                Tải lên file PDF hoặc trích xuất từ link URL
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. GIAO DIỆN THÊM SÁCH MỚI (UPLOAD / NHẬP LINK) ────────────────── */}
      {mainTab === "upload" && (
        <div style={{ maxWidth: "860px", margin: "0 auto", width: "100%" }}>
          {/* Card Upload / Nhập link */}
          <div
            style={{
              background: "var(--card)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
              overflow: "hidden",
              padding: "2rem",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "var(--accent-soft)",
                  color: "var(--accent-gold)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1rem",
                }}
              >
                <Plus size={28} />
              </div>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0, color: "var(--text)" }}>
                Thêm Sách & Tài Liệu Mới Vào Tủ Sách
              </h2>
              <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                Trích xuất văn bản sách chuẩn từng đoạn văn (Paragraph Reflow), tự động AI OCR trang scan và lồng tiếng đọc sách AI mượt mà.
              </p>
            </div>

            {/* Input Method Tabs */}
            <div
              style={{
                display: "flex",
                background: "var(--bg-elevated-2)",
                borderRadius: "var(--radius-sm)",
                padding: "4px",
                gap: "4px",
                marginBottom: "1.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setInputTab("file");
                  setErrorMessage(null);
                }}
                style={{
                  flex: 1,
                  padding: "0.65rem",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  background: inputTab === "file" ? "var(--bg-elevated)" : "transparent",
                  color: inputTab === "file" ? "var(--accent-gold)" : "var(--text-muted)",
                  fontWeight: inputTab === "file" ? 650 : 500,
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  boxShadow: inputTab === "file" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <Upload size={16} />
                Tải file PDF từ máy
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputTab("url");
                  setErrorMessage(null);
                }}
                style={{
                  flex: 1,
                  padding: "0.65rem",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  background: inputTab === "url" ? "var(--bg-elevated)" : "transparent",
                  color: inputTab === "url" ? "var(--accent-gold)" : "var(--text-muted)",
                  fontWeight: inputTab === "url" ? 650 : 500,
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  boxShadow: inputTab === "url" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <LinkIcon size={16} />
                Dán đường link URL
              </button>
            </div>

            {/* Tab 1: Upload File Area */}
            {inputTab === "file" && (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,application/pdf"
                  style={{ display: "none" }}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  style={{
                    border: isDragOver
                      ? "2px dashed var(--accent-gold)"
                      : "2px dashed var(--border)",
                    background: isDragOver ? "var(--accent-soft)" : "var(--bg-elevated-2)",
                    borderRadius: "var(--radius)",
                    padding: "2.5rem 1.5rem",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      background: "var(--bg-elevated)",
                      color: "var(--accent-gold)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "0.75rem",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    }}
                  >
                    <Upload size={22} />
                  </div>
                  {selectedFile ? (
                    <div>
                      <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>
                        {selectedFile.name}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Nhấp để đổi file khác
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)" }}>
                        Nhấp để chọn file PDF hoặc kéo thả file vào đây
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                        Hỗ trợ file PDF scan hoặc văn bản (Dung lượng tối đa 50MB)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: URL Input Area */}
            {inputTab === "url" && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.5rem",
                    color: "var(--text)",
                  }}
                >
                  Đường dẫn trực tiếp tới file PDF (URL):
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="https://example.com/books/sample-document.pdf"
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem 0.75rem 2.5rem",
                      background: "var(--bg-elevated-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text)",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  />
                  <LinkIcon
                    size={16}
                    style={{
                      position: "absolute",
                      left: "0.85rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                    }}
                  />
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                  * Link phải tải được trực tiếp file PDF (dung lượng tối đa 50MB, timeout 30 giây).
                </p>
              </div>
            )}

            {/* Language Selection & Start Button */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                marginTop: "1.5rem",
                paddingTop: "1.25rem",
                borderTop: "1px solid var(--border-light)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Ngôn ngữ nhận diện OCR:
                </span>
                <select
                  value={ocrLang}
                  onChange={(e) => setOcrLang(e.target.value)}
                  style={{
                    padding: "0.4rem 0.75rem",
                    borderRadius: "var(--radius-xs)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    outline: "none",
                  }}
                >
                  <option value="vi">Tiếng Việt (Chuẩn)</option>
                  <option value="en">Tiếng Anh (English)</option>
                  <option value="ch">Tiếng Trung (中文)</option>
                  <option value="japan">Tiếng Nhật (日本語)</option>
                  <option value="korean">Tiếng Hàn (한국어)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleStartExtraction}
                disabled={isLoading}
                style={{
                  padding: "0.75rem 1.75rem",
                  background: "var(--accent-gold)",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)",
                  opacity: isLoading ? 0.7 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                {isLoading ? (
                  <>
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid #FFFFFF",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    Đang xử lý PDF...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Trích xuất & Thêm vào tủ sách
                  </>
                )}
              </button>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "0.85rem 1rem",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "var(--radius-sm)",
                  color: "#ef4444",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Loading Status Progress */}
            {isLoading && (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1.25rem",
                  background: "var(--accent-soft)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--accent-gold-dim)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      border: "2.5px solid var(--accent-gold)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-gold)" }}>
                    {loadingStage}
                  </span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
                  Hệ thống đang nối đoạn văn tự nhiên (Paragraph Reflow) và chạy AI OCR cho các trang scan...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3. GIAO DIỆN ĐỌC SÁCH CHÍNH (READER VIEW) ─────────────────────── */}
      {mainTab === "reader" && currentBook && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            className="reader-controls-bar"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: isMobileScreen ? "0.65rem 0.75rem" : "0.75rem 1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.6rem",
              boxShadow: "var(--shadow-card)",
              width: "100%",
            }}
          >
            {/* Left: Book Title & Sidebar toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", width: isMobileScreen ? "100%" : "auto" }}>
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  padding: "0.4rem 0.65rem",
                  background: sidebarOpen ? "var(--accent-soft)" : "var(--bg-elevated-2)",
                  color: sidebarOpen ? "var(--accent-gold)" : "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Layers size={15} />
                <span>Mục lục ({currentBook.totalPages} tr)</span>
              </button>

              {/* Quick Book Switcher Dropdown */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flex: isMobileScreen ? "1 1 100%" : "initial", minWidth: 0 }}>
                <select
                  value={currentBook.docId}
                  onChange={(e) => {
                    const selected = historyList.find((b) => b.docId === e.target.value);
                    if (selected) handleSelectBook(selected);
                  }}
                  style={{
                    padding: "0.4rem 0.5rem",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    outline: "none",
                    width: isMobileScreen ? "100%" : "auto",
                    maxWidth: isMobileScreen ? "100%" : "220px",
                    cursor: "pointer",
                    textOverflow: "ellipsis",
                  }}
                  title="Chuyển nhanh sang cuốn sách khác trong tủ sách"
                >
                  {deduplicateBooks(historyList).map((b, idx) => (
                    <option key={`opt_${b.docId}_${idx}`} value={b.docId}>
                      📚 {b.fileName.replace(/\.pdf$/i, "")} ({b.totalPages} tr)
                    </option>
                  ))}
                </select>

                {activePageData?.isOcr ? (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 6px",
                      background: "rgba(234, 179, 8, 0.15)",
                      color: "#b45309",
                      borderRadius: "4px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    🔍 OCR
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 6px",
                      background: "rgba(34, 197, 94, 0.15)",
                      color: "#15803d",
                      borderRadius: "4px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    ⚡ Text
                  </span>
                )}
              </div>
            </div>

            {/* Right: Reading Typography & Appearance Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", width: isMobileScreen ? "100%" : "auto" }}>
              {/* Chỉ hiển thị các tùy chỉnh Font/Màu giấy khi ở chế độ Dàn chữ (Reflow) */}
              {viewMode === "reflow" && (
                <>
                  {/* Font Size Adjusters */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "var(--bg-elevated-2)",
                      borderRadius: "var(--radius-xs)",
                      border: "1px solid var(--border)",
                      padding: "2px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.max(14, p.fontSize - 2) }))}
                      style={{
                        padding: "0.3rem 0.5rem",
                        background: "none",
                        border: "none",
                        color: "var(--text)",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      title="Giảm cỡ chữ"
                    >
                      A-
                    </button>
                    <span style={{ fontSize: "0.75rem", fontWeight: 650, padding: "0 0.25rem", color: "var(--text)" }}>
                      {prefs.fontSize}px
                    </span>
                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.min(32, p.fontSize + 2) }))}
                      style={{
                        padding: "0.3rem 0.5rem",
                        background: "none",
                        border: "none",
                        color: "var(--text)",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      title="Tăng cỡ chữ"
                    >
                      A+
                    </button>
                  </div>

                  {/* Theme Switcher (Màu nền giấy sách) */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      background: "var(--bg-elevated-2)",
                      padding: "2px 4px",
                      borderRadius: "var(--radius-xs)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, paperTheme: "sepia" }))}
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: "#f4ecd8",
                        border: prefs.paperTheme === "sepia" ? "2px solid var(--accent-gold)" : "1px solid #d4c5a9",
                        cursor: "pointer",
                      }}
                      title="Màu Giấy Ngả Vàng Cổ Điển"
                    />
                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, paperTheme: "default" }))}
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: "#ffffff",
                        border: prefs.paperTheme === "default" ? "2px solid var(--accent-gold)" : "1px solid #cbd5e1",
                        cursor: "pointer",
                      }}
                      title="Màu Giấy Trắng Hiện Đại"
                    />
                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, paperTheme: "dark" }))}
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: "#1e293b",
                        border: prefs.paperTheme === "dark" ? "2px solid var(--accent-gold)" : "1px solid #475569",
                        cursor: "pointer",
                      }}
                      title="Màu Nền Tối Ban Đêm"
                    />
                  </div>
                </>
              )}

              {/* Copy Page Text */}
              <button
                type="button"
                onClick={handleCopyPageText}
                style={{
                  padding: "0.35rem 0.55rem",
                  background: isCopied ? "rgba(34, 197, 94, 0.15)" : "var(--bg-elevated-2)",
                  color: isCopied ? "#15803d" : "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  flex: isMobileScreen ? "1 1 auto" : "initial",
                  justifyContent: "center",
                }}
                title="Sao chép văn bản trang này"
              >
                {isCopied ? <Check size={13} /> : <Copy size={13} />}
                <span>{isCopied ? "Đã chép" : "Chép"}</span>
              </button>

              {/* Download Text */}
              <button
                type="button"
                onClick={handleDownloadFullBook}
                style={{
                  padding: "0.35rem 0.55rem",
                  background: "var(--bg-elevated-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  flex: isMobileScreen ? "1 1 auto" : "initial",
                  justifyContent: "center",
                }}
                title="Tải toàn bộ văn bản (.txt)"
              >
                <Download size={13} />
                <span>Xuất .txt</span>
              </button>

              {/* Spread Mode Toggle: 1 Trang vs 2 Trang (Chỉ trên máy tính / màn hình rộng) */}
              {!isMobileScreen && (
                <div
                  className="desktop-only"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--bg-elevated-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    padding: "2px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPageSpreadMode("single")}
                    style={{
                      padding: "0.3rem 0.6rem",
                      background: pageSpreadMode === "single" ? "var(--accent-gold)" : "transparent",
                      color: pageSpreadMode === "single" ? "#fff" : "var(--text-muted)",
                      border: "none",
                      borderRadius: "3px",
                      fontSize: "0.78rem",
                      fontWeight: pageSpreadMode === "single" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                    title="Chế độ xem 1 trang"
                  >
                    <FileText size={13} />
                    1 Trang
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageSpreadMode("double")}
                    style={{
                      padding: "0.3rem 0.6rem",
                      background: pageSpreadMode === "double" ? "var(--accent-gold)" : "transparent",
                      color: pageSpreadMode === "double" ? "#fff" : "var(--text-muted)",
                      border: "none",
                      borderRadius: "3px",
                      fontSize: "0.78rem",
                      fontWeight: pageSpreadMode === "double" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                    title="Chế độ xem 2 trang mở rộng như sách thật"
                  >
                    <Columns size={13} />
                    2 Trang
                  </button>
                </div>
              )}

              {/* View Mode Toggle: Reflow vs PDF */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--bg-elevated-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-xs)",
                  padding: "2px",
                  flex: isMobileScreen ? "1 1 auto" : "initial",
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode("pdf")}
                  style={{
                    padding: "0.3rem 0.55rem",
                    background: viewMode === "pdf" ? "var(--accent-gold)" : "transparent",
                    color: viewMode === "pdf" ? "#fff" : "var(--text-muted)",
                    border: "none",
                    borderRadius: "3px",
                    fontSize: "0.78rem",
                    fontWeight: viewMode === "pdf" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.25rem",
                    transition: "all 0.15s ease",
                    flex: isMobileScreen ? "1" : "initial",
                  }}
                  title="Chế độ xem bản in gốc PDF 1:1 từng chi tiết"
                >
                  <FileText size={13} />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("reflow")}
                  style={{
                    padding: "0.3rem 0.55rem",
                    background: viewMode === "reflow" ? "var(--accent-gold)" : "transparent",
                    color: viewMode === "reflow" ? "#fff" : "var(--text-muted)",
                    border: "none",
                    borderRadius: "3px",
                    fontSize: "0.78rem",
                    fontWeight: viewMode === "reflow" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.25rem",
                    transition: "all 0.15s ease",
                    flex: isMobileScreen ? "1" : "initial",
                  }}
                  title="Chế độ dàn chữ E-book dễ đọc & tô màu từng chữ"
                >
                  <BookOpen size={13} />
                  <span>Dàn chữ</span>
                </button>
              </div>

              {/* PDF Zoom Controls when in PDF Mode */}
              {viewMode === "pdf" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.2rem",
                    background: "var(--bg-elevated-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    padding: "2px 6px",
                    flex: isMobileScreen ? "1 1 auto" : "initial",
                    justifyContent: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPdfZoom((z) => Math.max(70, z - 15))}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text)",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "0.2rem 0.35rem",
                    }}
                    title="Thu nhỏ"
                  >
                    -
                  </button>
                  <span style={{ fontSize: "0.75rem", fontWeight: 650, color: "var(--text)", minWidth: "36px", textAlign: "center" }}>
                    {pdfZoom}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setPdfZoom((z) => Math.min(160, z + 15))}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text)",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "0.2rem 0.35rem",
                    }}
                    title="Phóng to"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── TTS AUDIO BOOK PLAYER CONTROL BAR ─────────────────────────── */}
          <div
            className="reader-tts-bar"
            style={{
              background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(2,132,199,0.08))",
              border: "1px solid rgba(37,99,235,0.25)",
              borderRadius: "var(--radius-sm)",
              padding: isMobileScreen ? "0.65rem 0.75rem" : "0.85rem 1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexDirection: isMobileScreen ? "column" : "row",
              gap: "0.75rem",
              width: "100%",
            }}
          >
            {/* Left: Play/Pause Button & Voice Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", width: isMobileScreen ? "100%" : "auto" }}>
              <button
                type="button"
                onClick={handleTogglePlay}
                disabled={isTtsLoading || activeParagraphs.length === 0}
                style={{
                  padding: "0.55rem 1.1rem",
                  background: isTtsPlaying ? "#ef4444" : "var(--accent-gold)",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.45rem",
                  cursor: isTtsLoading || activeParagraphs.length === 0 ? "not-allowed" : "pointer",
                  boxShadow: isTtsPlaying ? "0 2px 10px rgba(239,68,68,0.3)" : "0 2px 10px rgba(37,99,235,0.3)",
                  opacity: isTtsLoading || activeParagraphs.length === 0 ? 0.6 : 1,
                  transition: "all 0.15s ease",
                  width: isMobileScreen ? "100%" : "auto",
                }}
              >
                {isTtsLoading ? (
                  <>
                    <div
                      style={{
                        width: "14px",
                        height: "14px",
                        border: "2px solid #FFFFFF",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <span>Đang nạp âm thanh...</span>
                  </>
                ) : isTtsPlaying ? (
                  <>
                    <Pause size={16} />
                    <span>Tạm dừng Audio</span>
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    <span>Đọc Audio (Tự động lật trang)</span>
                  </>
                )}
              </button>

              {/* Stop Button */}
              {(isTtsPlaying || ttsAudioUrl) && (
                <button
                  type="button"
                  onClick={handleStopTts}
                  style={{
                    padding: "0.45rem 0.65rem",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    cursor: "pointer",
                  }}
                  title="Dừng phát Audio"
                >
                  <Square size={13} />
                  <span>Dừng</span>
                </button>
              )}

              {/* Voice Selector: Giọng Nhân Bản Thật vs Giọng Trình Duyệt */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flex: isMobileScreen ? "1 1 100%" : "initial", minWidth: 0 }}>
                <Headphones size={15} style={{ color: "var(--accent-gold)", flexShrink: 0 }} />
                <select
                  value={ttsVoiceId}
                  onChange={(e) => {
                    setTtsVoiceId(e.target.value);
                    ttsVoiceIdRef.current = e.target.value;
                    stopTts();
                  }}
                  style={{
                    padding: "0.4rem 0.65rem",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    outline: "none",
                    width: isMobileScreen ? "100%" : "auto",
                    maxWidth: isMobileScreen ? "100%" : "260px",
                    textOverflow: "ellipsis",
                  }}
                  title="Chọn giọng đọc audio"
                >
                  <option value="ngoc_huyen">🌟 Ngọc Huyền Pro (Nữ Bắc - Diễn cảm Studio) ★</option>
                  <option value="edge_hoaimy">⚡ Hoài My (Nữ Bắc - Siêu Tốc AI Chuẩn)</option>
                  <option value="edge_namminh">⚡ Nam Minh (Nam Bắc - Trầm ấm AI Chuẩn)</option>
                  <option value="mai_anh">✨ Mai Anh (Nữ Bắc - Tự nhiên)</option>
                  <option value="manh_dung">✨ Mạnh Dũng (Nam Bắc - Mạnh mẽ)</option>
                  {customVoices.map((cv) => (
                    <option key={cv.id} value={cv.id}>
                      ✨ {cv.name} (Giọng Nhân Bản AI)
                    </option>
                  ))}
                </select>
              </div>

              {/* Speed Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flex: isMobileScreen ? "1 1 auto" : "initial" }}>
                <FastForward size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <select
                  value={ttsSpeed.toString()}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setTtsSpeed(val);
                    ttsSpeedRef.current = val;
                    stopTts();
                  }}
                  style={{
                    padding: "0.4rem 0.55rem",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text)",
                    fontSize: "0.8rem",
                    fontWeight: 650,
                    outline: "none",
                    cursor: "pointer",
                    width: isMobileScreen ? "100%" : "auto",
                  }}
                  title="Chọn tốc độ đọc"
                >
                  <option value="1">1.0x (Chuẩn) ★</option>
                  <option value="0.7">0.7x (Rất chậm)</option>
                  <option value="0.8">0.8x (Chậm)</option>
                  <option value="0.9">0.9x (Vừa phải)</option>
                  <option value="1.15">1.15x (Nhanh)</option>
                  <option value="1.3">1.3x (Rất nhanh)</option>
                  <option value="1.5">1.5x (Cực nhanh)</option>
                </select>
              </div>

              {/* Live Status Pill when playing */}
              {isTtsPlaying && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.3rem 0.65rem",
                    background: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    borderRadius: "12px",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    color: "#16a34a",
                    width: isMobileScreen ? "100%" : "auto",
                    justifyContent: isMobileScreen ? "center" : "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: "#22c55e",
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                  <span>Đang đọc trang {readingPageNum || currentPage}</span>
                </div>
              )}
            </div>

            {/* Right: Ambient Sound, Sleep Timer, Audio Scrubber, Download Button & Auto Next Page Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", width: isMobileScreen ? "100%" : "auto" }}>
              {/* 🎧 Ambient Background Music Menu */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAmbientMenuOpen(!isAmbientMenuOpen);
                    setIsSleepMenuOpen(false);
                  }}
                  style={{
                    padding: "0.4rem 0.7rem",
                    background: ambientType !== "none" ? "rgba(34, 197, 94, 0.15)" : "var(--bg-elevated)",
                    color: ambientType !== "none" ? "#16a34a" : "var(--text)",
                    border: ambientType !== "none" ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    cursor: "pointer",
                  }}
                  title="Nhạc nền thư giãn Web Audio (Mưa, Sóng biển, Lò sưởi, Cafe, Piano Lofi)"
                >
                  <CloudRain size={14} style={{ color: ambientType !== "none" ? "#16a34a" : "var(--accent-gold)" }} />
                  {ambientType === "none" ? "Nhạc nền" : AMBIENT_SOUND_OPTIONS.find((s) => s.id === ambientType)?.name || "Nhạc nền"}
                </button>

                {isAmbientMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 8px)",
                      right: 0,
                      zIndex: 100,
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      boxShadow: "0 12px 35px rgba(0,0,0,0.2)",
                      padding: "0.85rem",
                      width: "270px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "0.4rem" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)" }}>
                        🎧 Âm thanh nền thư giãn
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Web Audio</span>
                    </div>

                    {/* Volume slider */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                      <Volume2 size={14} style={{ color: "var(--text-muted)" }} />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={ambientVolume}
                        onChange={(e) => handleChangeAmbientVolume(parseFloat(e.target.value))}
                        style={{ flex: 1, cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)", minWidth: "32px", textAlign: "right" }}>
                        {Math.round(ambientVolume * 100)}%
                      </span>
                    </div>

                    {/* Sound Options List */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      {AMBIENT_SOUND_OPTIONS.map((opt) => {
                        const isSelected = ambientType === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleSelectAmbientSound(opt.id);
                            }}
                            style={{
                              padding: "0.45rem 0.6rem",
                              background: isSelected ? "var(--accent-soft)" : "transparent",
                              border: isSelected ? "1px solid var(--accent-gold)" : "1px solid transparent",
                              borderRadius: "var(--radius-xs)",
                              color: isSelected ? "var(--accent-gold)" : "var(--text)",
                              fontSize: "0.78rem",
                              fontWeight: isSelected ? 700 : 500,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.1s ease",
                            }}
                          >
                            <span>
                              {opt.icon} {opt.name}
                            </span>
                            {isSelected && <Check size={13} style={{ color: "var(--accent-gold)" }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ⏳ Sleep Timer Menu */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsSleepMenuOpen(!isSleepMenuOpen);
                    setIsAmbientMenuOpen(false);
                  }}
                  style={{
                    padding: "0.4rem 0.7rem",
                    background: sleepTimerRemainingSec !== null ? "rgba(234, 179, 8, 0.15)" : "var(--bg-elevated)",
                    color: sleepTimerRemainingSec !== null ? "#b45309" : "var(--text)",
                    border: sleepTimerRemainingSec !== null ? "1px solid rgba(234, 179, 8, 0.4)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    cursor: "pointer",
                  }}
                  title="Hẹn giờ tự động dừng đọc sách trước khi ngủ"
                >
                  <Timer size={14} style={{ color: sleepTimerRemainingSec !== null ? "#b45309" : "var(--accent-gold)" }} />
                  {sleepTimerRemainingSec !== null ? `⏳ ${formatSleepTimer(sleepTimerRemainingSec)}` : "Hẹn giờ"}
                </button>

                {isSleepMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 8px)",
                      right: 0,
                      zIndex: 100,
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      boxShadow: "0 12px 35px rgba(0,0,0,0.2)",
                      padding: "0.85rem",
                      width: "210px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", borderBottom: "1px solid var(--border)", paddingBottom: "0.4rem" }}>
                      ⏳ Hẹn giờ tắt sách
                    </div>

                    {[
                      { val: 0, label: "Tắt hẹn giờ" },
                      { val: 15, label: "15 phút" },
                      { val: 30, label: "30 phút" },
                      { val: 45, label: "45 phút" },
                      { val: 60, label: "60 phút" },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => handleSetSleepTimer(item.val)}
                        style={{
                          padding: "0.45rem 0.6rem",
                          background: sleepTimerMinutes === item.val ? "var(--accent-soft)" : "transparent",
                          border: sleepTimerMinutes === item.val ? "1px solid var(--accent-gold)" : "1px solid transparent",
                          borderRadius: "var(--radius-xs)",
                          color: sleepTimerMinutes === item.val ? "var(--accent-gold)" : "var(--text)",
                          fontSize: "0.78rem",
                          fontWeight: sleepTimerMinutes === item.val ? 700 : 500,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span>{item.label}</span>
                        {sleepTimerMinutes === item.val && <Check size={13} style={{ color: "var(--accent-gold)" }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Audio Scrubber */}
              {ttsDuration > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    {formatTime(ttsCurrentTime)} / {formatTime(ttsDuration)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={ttsDuration}
                    step={0.1}
                    value={ttsCurrentTime}
                    onChange={handleSeek}
                    style={{ width: "100px", cursor: "pointer" }}
                  />
                </div>
              )}

              {/* Download Page Audio Button */}
              {ttsAudioUrl && (
                <a
                  href={ttsAudioUrl}
                  download={`${currentBook.fileName.replace(/\.pdf$/i, "")}_trang_${currentPage}.wav`}
                  style={{
                    padding: "0.35rem 0.6rem",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.76rem",
                    fontWeight: 650,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                  title="Tải file âm thanh trang này (.wav)"
                >
                  <Download size={13} />
                  Tải Audio
                </a>
              )}

              {/* Auto Next Page Checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={autoNextPage}
                  onChange={(e) => setAutoNextPage(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Tự động sang trang
              </label>
            </div>
          </div>

          {/* TTS Error Banner if any */}
          {ttsError && (
            <div
              style={{
                padding: "0.65rem 1rem",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "var(--radius-xs)",
                color: "#ef4444",
                fontSize: "0.82rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{ttsError}</span>
            </div>
          )}

          {/* Main Book Canvas & Drawer Layout */}
          <div style={{ display: "flex", gap: "1rem", position: "relative", minHeight: "720px" }}>
            {/* Sidebar / Drawer (Mục lục các trang) */}
            {sidebarOpen && (
              <div
                style={{
                  width: "280px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow-card)",
                  display: "flex",
                  flexDirection: "column",
                  flexShrink: 0,
                  maxHeight: "780px",
                  overflow: "hidden",
                }}
              >
                {/* Search Box in Pages */}
                <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-light)" }}>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm số trang hoặc từ khóa..."
                      style={{
                        width: "100%",
                        padding: "0.45rem 0.75rem 0.45rem 2rem",
                        background: "var(--bg-elevated-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--text)",
                        fontSize: "0.8rem",
                        outline: "none",
                      }}
                    />
                    <Search
                      size={14}
                      style={{
                        position: "absolute",
                        left: "0.6rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                      }}
                    />
                  </div>
                </div>

                {/* Page List Items */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
                  {filteredPages.map((page) => {
                    const isCurrent = page.pageNumber === currentPage;
                    const snippet = reflowBookText(page.text)[0] || "(Trang trống)";
                    return (
                      <div
                        key={page.pageNumber}
                        onClick={() => setCurrentPage(page.pageNumber)}
                        style={{
                          padding: "0.65rem 0.75rem",
                          borderRadius: "var(--radius-xs)",
                          background: isCurrent ? "var(--accent-soft)" : "transparent",
                          border: isCurrent ? "1px solid var(--accent-gold)" : "1px solid transparent",
                          color: isCurrent ? "var(--accent-gold)" : "var(--text)",
                          cursor: "pointer",
                          marginBottom: "4px",
                          transition: "all 0.1s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                            Trang {page.pageNumber}
                          </span>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            {page.wordCount} từ {page.isOcr && "• OCR"}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {snippet}
                        </p>
                      </div>
                    );
                  })}
                  {filteredPages.length === 0 && (
                    <div style={{ padding: "1.5rem", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Không tìm thấy trang khớp với "{searchQuery}"
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── AUTHENTIC BOOK PAPER CANVAS ─────────────────────────────── */}
            <div
              className="reader-paper-canvas"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{
                flex: 1,
                background: themeStyle.outerCanvasBg,
                padding: "1.5rem 1rem",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                overflow: "hidden",
                touchAction: "pan-y pinch-zoom",
              }}
            >
              {/* CSS Keyframes cho hiệu ứng lật trang 3D vật lý */}
              <style>{`
                @keyframes flipNext3D {
                  0% {
                    transform: perspective(2200px) rotateY(0deg);
                    opacity: 1;
                  }
                  40% {
                    transform: perspective(2200px) rotateY(-16deg) scale(0.98);
                    opacity: 0.9;
                    box-shadow: -20px 20px 45px rgba(0, 0, 0, 0.25);
                  }
                  100% {
                    transform: perspective(2200px) rotateY(0deg);
                    opacity: 1;
                  }
                }
                @keyframes flipPrev3D {
                  0% {
                    transform: perspective(2200px) rotateY(0deg);
                    opacity: 1;
                  }
                  40% {
                    transform: perspective(2200px) rotateY(16deg) scale(0.98);
                    opacity: 0.9;
                    box-shadow: 20px 20px 45px rgba(0, 0, 0, 0.25);
                  }
                  100% {
                    transform: perspective(2200px) rotateY(0deg);
                    opacity: 1;
                  }
                }
              `}</style>

              {/* The Actual Book Page Sheet */}
              {viewMode === "pdf" ? (
                /* CHẾ ĐỘ BẢN GỐC PDF 1:1: HỖ TRỢ 1 TRANG HOẶC 2 TRANG MỞ RỘNG CHO TẤT CẢ CÁC SÁCH */
                pageSpreadMode === "double" && currentPage > 1 ? (
                  /* ── CHẾ ĐỘ 2 TRANG SONG SONG (TWO-PAGE SPREAD) ── */
                  (() => {
                    const leftPageNum = currentPage % 2 === 0 ? currentPage : currentPage - 1;
                    const rightPageNum = leftPageNum + 1;
                    const hasRightPage = rightPageNum <= currentBook.totalPages;

                    const getPageSrc = (pNum: number) => {
                      const pData = currentBook.pages.find((p) => p.pageNumber === pNum);
                      if (pData?.image) return pData.image;
                      if (pData?.imageUrl) return pData.imageUrl;
                      const dbKey = `${currentBook.docId}_${pNum}`;
                      if (loadedDbImages[dbKey]) return loadedDbImages[dbKey];
                      if (currentBook.docId === "doc_dac_nhan_tam_full") return `/books/dac_nhan_tam/page_${pNum}.webp`;
                      return `/books/${currentBook.docId}/page_${pNum}.webp`;
                    };

                    return (
                      <div
                        ref={readerContentRef}
                        style={{
                          maxWidth: `${Math.round(1180 * (pdfZoom / 100))}px`,
                          width: "100%",
                          display: "flex",
                          alignItems: "stretch",
                          justifyContent: "center",
                          position: "relative",
                          transition: "max-width 0.2s ease",
                          animation:
                            is3dFlipping === "next"
                              ? "flipNext3D 0.55s ease-in-out"
                              : is3dFlipping === "prev"
                              ? "flipPrev3D 0.55s ease-in-out"
                              : "none",
                        }}
                      >
                        {/* Trang Trái (Left Page) */}
                        <div
                          style={{
                            flex: 1,
                            position: "relative",
                            borderTopLeftRadius: "6px",
                            borderBottomLeftRadius: "6px",
                            overflow: "hidden",
                            boxShadow: "-8px 14px 35px rgba(0,0,0,0.18), inset -16px 0 20px -8px rgba(0,0,0,0.15)",
                            border: "1px solid rgba(0,0,0,0.12)",
                            borderRight: "none",
                            background: "#ffffff",
                          }}
                        >
                          {isTtsPlaying && readingPageNum === leftPageNum && (
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                height: "4px",
                                background: "linear-gradient(90deg, #3b82f6, #0284c7)",
                                zIndex: 10,
                              }}
                            />
                          )}
                          <img
                            src={getPageSrc(leftPageNum)}
                            alt={`Trang ${leftPageNum}`}
                            style={{ width: "100%", height: "auto", display: "block" }}
                            onError={() => {
                              setFailedPageImages((prev) => ({ ...prev, [`${currentBook.docId}_${leftPageNum}`]: true }));
                            }}
                          />
                        </div>

                        {/* Gáy Sách 3D ở giữa (Center Book Spine Crease) */}
                        <div
                          style={{
                            width: "12px",
                            background: "linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.04) 50%, rgba(0,0,0,0.18) 100%)",
                            boxShadow: "inset 0 0 6px rgba(0,0,0,0.2)",
                            zIndex: 5,
                            flexShrink: 0,
                          }}
                        />

                        {/* Trang Phải (Right Page) */}
                        <div
                          style={{
                            flex: 1,
                            position: "relative",
                            borderTopRightRadius: "6px",
                            borderBottomRightRadius: "6px",
                            overflow: "hidden",
                            boxShadow: "8px 14px 35px rgba(0,0,0,0.18), inset 16px 0 20px -8px rgba(0,0,0,0.15)",
                            border: "1px solid rgba(0,0,0,0.12)",
                            borderLeft: "none",
                            background: "#ffffff",
                          }}
                        >
                          {isTtsPlaying && readingPageNum === rightPageNum && (
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                height: "4px",
                                background: "linear-gradient(90deg, #0284c7, #3b82f6)",
                                zIndex: 10,
                              }}
                            />
                          )}
                          {hasRightPage ? (
                            <img
                              src={getPageSrc(rightPageNum)}
                              alt={`Trang ${rightPageNum}`}
                              style={{ width: "100%", height: "auto", display: "block" }}
                              onError={() => {
                                setFailedPageImages((prev) => ({ ...prev, [`${currentBook.docId}_${rightPageNum}`]: true }));
                              }}
                            />
                          ) : (
                            <div style={{ padding: "4rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                              (Hết sách)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* ── CHẾ ĐỘ 1 TRANG (SINGLE PAGE) ── */
                  (() => {
                    const getPageSrc = (pNum: number) => {
                      const pData = currentBook.pages.find((p) => p.pageNumber === pNum);
                      if (pData?.image) return pData.image;
                      if (pData?.imageUrl) return pData.imageUrl;
                      const dbKey = `${currentBook.docId}_${pNum}`;
                      if (loadedDbImages[dbKey]) return loadedDbImages[dbKey];
                      if (currentBook.docId === "doc_dac_nhan_tam_full") return `/books/dac_nhan_tam/page_${pNum}.webp`;
                      return `/books/${currentBook.docId}/page_${pNum}.webp`;
                    };

                    const isCurrentPageFailed = Boolean(failedPageImages[`${currentBook.docId}_${currentPage}`]);

                    return (
                      <div
                        ref={readerContentRef}
                        style={{
                          maxWidth: `${Math.round(760 * (pdfZoom / 100))}px`,
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          position: "relative",
                          transition: "max-width 0.2s ease",
                          animation:
                            is3dFlipping === "next"
                              ? "flipNext3D 0.55s ease-in-out"
                              : is3dFlipping === "prev"
                              ? "flipPrev3D 0.55s ease-in-out"
                              : "none",
                        }}
                      >
                        {/* Subtle playing indicator bar on top of the PDF sheet */}
                        {isTtsPlaying && (
                          <div
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              height: "4px",
                              background: "linear-gradient(90deg, #3b82f6, #0284c7, #3b82f6)",
                              borderTopLeftRadius: "6px",
                              borderTopRightRadius: "6px",
                              zIndex: 10,
                            }}
                          />
                        )}

                        {isCurrentPageFailed ? (
                          /* Hiển thị thông báo thân thiện thuần React khi sách cũ chưa có ảnh */
                          <div
                            style={{
                              width: "100%",
                              padding: "3.5rem 2rem",
                              textAlign: "center",
                              background: "#ffffff",
                              borderRadius: "8px",
                              boxShadow: "0 14px 40px rgba(0,0,0,0.12)",
                              border: "1px solid rgba(0,0,0,0.1)",
                            }}
                          >
                            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📄</div>
                            <h4 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>
                              Cuốn sách này chưa có bản in ảnh gốc
                            </h4>
                            <p style={{ fontSize: "0.85rem", color: "#64748b", maxWidth: "460px", margin: "0 auto 1.5rem auto", lineHeight: 1.6 }}>
                              Do cuốn sách này được thêm vào từ trước khi hệ thống cập nhật bộ tạo ảnh 1:1.<br />
                              Bạn có thể <b>Tải lại file PDF</b> để tự động kết xuất ảnh 1:1, hoặc bấm <b>Chuyển sang Dàn chữ</b> để đọc ngay.
                            </p>
                            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                              <button
                                type="button"
                                onClick={() => setViewMode("reflow")}
                                style={{
                                  padding: "0.6rem 1.25rem",
                                  background: "var(--accent-gold)",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "var(--radius-xs)",
                                  fontWeight: 700,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                              >
                                📖 Chuyển sang Dàn chữ
                              </button>
                            </div>
                          </div>
                        ) : currentPage === 1 ? (
                          /* Trang bìa 1 */
                          <div
                            style={{
                              position: "relative",
                              borderRadius: "8px",
                              overflow: "hidden",
                              boxShadow: "0 16px 45px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.12)",
                              border: "1px solid rgba(0,0,0,0.15)",
                              width: "100%",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              background: "#fff",
                            }}
                          >
                            <img
                              src={getPageSrc(1)}
                              alt={`Bìa sách ${currentBook.fileName}`}
                              style={{
                                width: "100%",
                                height: "auto",
                                display: "block",
                              }}
                              onError={() => {
                                setFailedPageImages((prev) => ({ ...prev, [`${currentBook.docId}_1`]: true }));
                              }}
                            />
                          </div>
                        ) : (
                          /* Trang PDF 2 đến hết: Vừa khít 100% viền ngoài, bóng đổ chân thực */
                          <div
                            style={{
                              width: "100%",
                              borderRadius: "6px",
                              overflow: "hidden",
                              boxShadow: "0 14px 40px rgba(0,0,0,0.15), 0 2px 10px rgba(0,0,0,0.06)",
                              border: "1px solid rgba(0,0,0,0.1)",
                              background: "#ffffff",
                            }}
                          >
                            <img
                              src={getPageSrc(currentPage)}
                              alt={`Trang ${currentPage}`}
                              style={{
                                width: "100%",
                                height: "auto",
                                display: "block",
                              }}
                              onError={() => {
                                setFailedPageImages((prev) => ({ ...prev, [`${currentBook.docId}_${currentPage}`]: true }));
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()
                )
              ) : (
                /* CHẾ ĐỘ DÀN CHỮ REFLOW: HIỂN THỊ KHUNG GIẤY VÀ CÁC THÔNG SỐ TÙY BIẾN */
                <div
                  className="reader-paper-sheet"
                  style={{
                    maxWidth: "760px",
                    width: "100%",
                    minHeight: "780px",
                    background: themeStyle.paperBg,
                    color: themeStyle.paperText,
                    border: `1px solid ${themeStyle.paperBorder}`,
                    borderRadius: "6px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "2.75rem 3.5rem",
                    transition: "all 0.2s ease",
                    position: "relative",
                    animation:
                      is3dFlipping === "next"
                        ? "flipNext3D 0.55s ease-in-out"
                        : is3dFlipping === "prev"
                        ? "flipPrev3D 0.55s ease-in-out"
                        : "none",
                  }}
                >
                  {/* Playing subtle glow on page border */}
                  {isTtsPlaying && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: "3px",
                        background: "linear-gradient(90deg, #3b82f6, #0284c7, #3b82f6)",
                        borderTopLeftRadius: "8px",
                        borderTopRightRadius: "8px",
                      }}
                    />
                  )}

                  {/* Top Book Header inside Paper */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingBottom: "0.85rem",
                      borderBottom: `1px solid ${themeStyle.dividerColor}`,
                      fontSize: "0.78rem",
                      color: themeStyle.headerColor,
                      letterSpacing: "0.04em",
                      fontFamily: "var(--font-sans), sans-serif",
                    }}
                  >
                    <span style={{ fontStyle: "italic", maxWidth: "350px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {currentBook.fileName.replace(/\.pdf$/i, "")}
                    </span>
                    <span style={{ fontWeight: 650 }}>
                      Trang {currentPage} / {currentBook.totalPages}
                    </span>
                  </div>

                  {/* Main Book Reading Text Body */}
                  <div
                    ref={readerContentRef}
                    style={{
                      flex: 1,
                      padding: "2rem 0",
                      overflowY: "auto",
                      fontSize: `${prefs.fontSize}px`,
                      lineHeight: prefs.lineHeight,
                      fontFamily:
                        prefs.fontFamily === "serif"
                          ? "var(--font-serif), Georgia, Cambria, 'Times New Roman', serif"
                          : prefs.fontFamily === "mono"
                          ? "var(--font-mono), monospace"
                          : "var(--font-sans), sans-serif",
                      letterSpacing: "0.01em",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "flex-start",
                    }}
                  >
                    {activeParagraphs.length > 0 ? (
                      <div style={{ width: "100%" }}>
                        {activeParagraphs.map((para, pIdx) => {
                          const isHeading = para.toUpperCase() === para && para.length < 60;
                          const words = para.trim().split(/\s+/).filter(Boolean);

                          // Tính chỉ số từ bắt đầu của đoạn này trong toàn trang
                          let startWordIdx = 0;
                          for (let i = 0; i < pIdx; i++) {
                            startWordIdx += activeParagraphs[i].trim().split(/\s+/).filter(Boolean).length;
                          }

                          const renderedWords = words.map((word, wIdx) => {
                            const currentGlobalIdx = startWordIdx + wIdx;
                            const isCurrentWord = currentGlobalIdx === activeWordGlobalIdx;

                            return (
                              <span
                                key={wIdx}
                                id={`reader-word-${currentGlobalIdx}`}
                                style={
                                  isCurrentWord
                                    ? {
                                        backgroundColor: prefs.paperTheme === "dark" ? "#854d0e" : "#fef08a",
                                        color: prefs.paperTheme === "dark" ? "#fef08a" : "#713f12",
                                        borderRadius: "3px",
                                        padding: "0 2px",
                                        fontWeight: 750,
                                        boxShadow: "0 0 6px rgba(234, 179, 8, 0.45)",
                                        transition: "background-color 0.05s ease, color 0.05s ease",
                                      }
                                    : {
                                        transition: "background-color 0.05s ease, color 0.05s ease",
                                      }
                                }
                              >
                                {word}
                                {wIdx < words.length - 1 ? " " : ""}
                              </span>
                            );
                          });

                          if (isHeading) {
                            return (
                              <h3
                                key={pIdx}
                                style={{
                                  fontSize: "1.2em",
                                  fontWeight: 700,
                                  textAlign: "center",
                                  margin: "1.75rem 0 1.25rem 0",
                                  letterSpacing: "0.06em",
                                  lineHeight: 1.4,
                                  color: themeStyle.paperText,
                                }}
                              >
                                {renderedWords}
                              </h3>
                            );
                          }
                          return (
                            <p
                              key={pIdx}
                              style={{
                                textAlign: prefs.textAlign,
                                textIndent: prefs.paragraphIndent ? "2em" : "0",
                                marginBottom: "1.35rem",
                                wordBreak: "break-word",
                                hyphens: "auto",
                                color: themeStyle.paperText,
                                lineHeight: prefs.lineHeight,
                              }}
                            >
                              {renderedWords}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "5rem 1rem", opacity: 0.5, fontSize: "0.95rem" }}>
                        (Trang này không có văn bản hoặc là trang trắng)
                      </div>
                    )}
                  </div>

                  {/* Bottom Paper Footer with Page Number */}
                  <div
                    style={{
                      paddingTop: "0.85rem",
                      borderTop: `1px solid ${themeStyle.dividerColor}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.82rem",
                      color: themeStyle.headerColor,
                      fontFamily: "var(--font-sans), sans-serif",
                      fontWeight: 650,
                    }}
                  >
                    — {currentPage} —
                  </div>
                </div>
              )}

              {/* Bottom Pagination & Navigation Controls */}
              <div
                className="reader-pagination-bar"
                style={{
                  maxWidth: "800px",
                  width: "100%",
                  marginTop: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                {/* Previous Button */}
                <button
                  type="button"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1}
                  style={{
                    padding: "0.5rem 1.1rem",
                    background: currentPage <= 1 ? "rgba(0,0,0,0.05)" : "var(--accent-gold)",
                    color: currentPage <= 1 ? "var(--text-muted)" : "#FFFFFF",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    opacity: currentPage <= 1 ? 0.5 : 1,
                  }}
                >
                  <ChevronLeft size={16} />
                  Trang trước
                </button>

                {/* Page Jump Slider / Input */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <input
                    type="range"
                    min={1}
                    max={currentBook.totalPages}
                    value={currentPage}
                    onChange={(e) => setCurrentPage(parseInt(e.target.value))}
                    style={{ width: "160px", cursor: "pointer" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <input
                      type="number"
                      min={1}
                      max={currentBook.totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (val >= 1 && val <= currentBook.totalPages) {
                          setCurrentPage(val);
                        }
                      }}
                      style={{
                        width: "55px",
                        padding: "0.25rem 0.4rem",
                        textAlign: "center",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--text)",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>
                      / {currentBook.totalPages}
                    </span>
                  </div>
                </div>

                {/* Next Button */}
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage >= currentBook.totalPages}
                  style={{
                    padding: "0.5rem 1.1rem",
                    background: currentPage >= currentBook.totalPages ? "rgba(0,0,0,0.05)" : "var(--accent-gold)",
                    color: currentPage >= currentBook.totalPages ? "var(--text-muted)" : "#FFFFFF",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: currentPage >= currentBook.totalPages ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    opacity: currentPage >= currentBook.totalPages ? 0.5 : 1,
                  }}
                >
                  Trang sau
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
