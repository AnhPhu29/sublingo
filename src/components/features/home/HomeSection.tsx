import React, { useState, useEffect } from 'react';
import { ArrowRight, EyeOff, Sparkles, Globe, FileText, Languages, Eye } from 'lucide-react';
import { LANGUAGES, SUBTITLE_SAMPLES } from '@/lib/constants';

interface HomeSectionProps {
  videoUrl: string;
  activeResultTab: string;
  trackUrls: Record<string, string>;
  videoFile: File | null;
  clearVideo: () => void;
  navigateTo: (section: string) => void;
}

export const HomeSection: React.FC<HomeSectionProps> = ({
  videoUrl,
  activeResultTab,
  trackUrls,
  videoFile,
  clearVideo,
  navigateTo
}) => {
  const [currentSubIdx, setCurrentSubIdx] = useState(0);
  const [subFading, setSubFading] = useState(false);
  const [timecode, setTimecode] = useState('00:00:00:00');
  const [showTranslation, setShowTranslation] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let frame = 0;
    const tcInterval = setInterval(() => {
      frame++;
      const totalFrames = frame;
      const ff = totalFrames % 24;
      const totalSec = Math.floor(totalFrames / 24);
      const ss = totalSec % 60;
      const mm = Math.floor(totalSec / 60) % 60;
      const hh = Math.floor(totalSec / 3600);
      setTimecode(
        `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`
      );
    }, 1000 / 24);

    const initialTimeout = setTimeout(() => {
      setShowTranslation(true);
    }, 800);

    const subInterval = setInterval(() => {
      setSubFading(true);
      setShowTranslation(false);
      setTimeout(() => {
        setCurrentSubIdx((prev) => (prev + 1) % SUBTITLE_SAMPLES.length);
        setSubFading(false);
        setTimeout(() => {
          setShowTranslation(true);
        }, 800);
      }, 400);
    }, 3000);

    return () => {
      clearInterval(tcInterval);
      clearInterval(subInterval);
      clearTimeout(initialTimeout);
    };
  }, []);

  const currentSample = SUBTITLE_SAMPLES[currentSubIdx];

  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <h1>
          Dịch phụ đề phim,<br />
          <span className="gold">chính xác từng khoảnh khắc</span>
        </h1>
        <p className="hero-desc">
          AI dịch toàn bộ file phụ đề .SRT / .VTT sang hơn 12 ngôn ngữ, giữ nguyên timestamp và định dạng.
          Trích xuất chữ từ ảnh chụp màn hình. Lưu trữ dữ liệu bảo mật và theo dõi chi phí API.
        </p>

        <div className="cinema-screen">
          <div className="cinema-viewport">
            <div className="cinema-vignette" />
            
            {videoUrl ? (
              <video
                key={`${videoUrl}_${activeResultTab}`}
                src={videoUrl}
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 5 }}
              >
                {activeResultTab && trackUrls[activeResultTab] && (
                  <track
                    src={trackUrls[activeResultTab]}
                    kind="subtitles"
                    srcLang={activeResultTab}
                    label={LANGUAGES.find((l) => l.code === activeResultTab)?.label}
                    default
                  />
                )}
              </video>
            ) : (
              <div className={`subtitle-bar ${subFading ? 'fading' : ''}`}>
                <div className="subtitle-original-preview">
                  {currentSample.original}
                </div>
                <div className={`subtitle-translated-preview ${showTranslation ? 'visible' : ''}`}>
                  {currentSample.translated}
                </div>
                <div className="lang-badge">
                  {currentSample.from} <ArrowRight size={10} /> {currentSample.to}
                </div>
              </div>
            )}
          </div>
          
          {videoUrl ? (
            <div className="timecode-bar" style={{ justifyContent: 'space-between', padding: '0.5rem 1rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Đang phát video xem thử ({videoFile?.name})
              </span>
              <button className="btn btn-sm btn-danger" onClick={clearVideo} style={{ padding: '0.2rem 0.6rem' }}>
                <EyeOff size={12} /> Tắt xem thử
              </button>
            </div>
          ) : (
            <div className="timecode-bar">
              <div className="timecode-dot" />
              <span className="timecode">{timecode}</span>
            </div>
          )}
        </div>

        <button className="btn-cta" onClick={() => {
          navigateTo('editor');
        }}>
          <Sparkles size={18} />
          Bắt đầu ngay
        </button>
      </section>

      {/* Steps Section */}
      <section className="steps-section">
        <h2 className="section-title">Quy trình 3 bước</h2>
        <div className="steps-grid">
          {[
            { num: '01', title: 'Tải file phụ đề', desc: 'Kéo-thả file .SRT hoặc .VTT, hoặc dán nội dung trực tiếp vào ô nhập liệu.' },
            { num: '02', title: 'Chọn ngôn ngữ đích', desc: 'Chọn một hoặc nhiều ngôn ngữ cần dịch. AI tự nhận diện ngôn ngữ gốc.' },
            { num: '03', title: 'Tải bản dịch', desc: 'Xem trước bản dịch song song, tải xuống từng file đã dịch theo đúng định dạng gốc.' },
          ].map((step) => (
            <div className="step-card" key={step.num}>
              <div className="step-number">{step.num}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-sep" />
        <h2 className="section-title">Tính năng nổi bật</h2>
        <div className="features-grid">
          {[
            { icon: Globe, title: 'Đa ngôn ngữ', desc: 'Hỗ trợ 12+ ngôn ngữ, dịch đồng thời nhiều ngôn ngữ cùng lúc' },
            { icon: FileText, title: 'Giữ định dạng', desc: 'Timestamp, số thứ tự, thẻ HTML giữ nguyên 100%' },
            { icon: Languages, title: 'Ngữ cảnh xuyên suốt', desc: 'AI đọc toàn bộ file trước khi dịch, nhất quán tên riêng và giọng văn' },
            { icon: Eye, title: 'OCR từ ảnh', desc: 'Không cần gõ lại — chụp màn hình để trích xuất phụ đề ngay lập tức' },
          ].map((f, i) => (
            <div className="feature-card" key={i}>
              <div className="feature-icon"><f.icon size={22} /></div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer Section */}
      <footer className="footer" style={{ textAlign: 'center', padding: '2rem', marginTop: '4rem', color: 'var(--text-muted)', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)' }}>
        <p>© 2026 SubLingo — Dự án dịch thuật phụ đề phim offline local.</p>
        <p style={{ marginTop: '0.5rem' }}>Mã nguồn mở chạy local 100% bảo mật và tiết kiệm chi phí.</p>
      </footer>
    </>
  );
};
