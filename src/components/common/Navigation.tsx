import React from 'react';
import {
  Clapperboard, Menu, Home, Subtitles, ScanText, Scissors, Mic, Volume2, History, Coins, Key, Combine
} from 'lucide-react';

interface NavigationProps {
  activeSection: string;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  navigateTo: (section: string) => void;
  onOpenGeminiKeyModal?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeSection,
  mobileMenuOpen,
  setMobileMenuOpen,
  navigateTo,
  onOpenGeminiKeyModal
}) => {
  return (
    <nav className="nav">
      <button className="nav-logo" onClick={() => navigateTo('home')}>
        <Clapperboard size={22} />
        <span>SubLingo</span>
      </button>
      <button className="nav-mobile-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu">
        <Menu size={22} />
      </button>
      <ul className={`nav-links ${mobileMenuOpen ? 'open' : ''}`}>
        {[
          { id: 'home', icon: Home, label: 'Trang chủ' },
          { id: 'ocr', icon: ScanText, label: 'Trích xuất phụ đề' },
          { id: 'tts', icon: Volume2, label: 'Đọc văn bản (TTS)' },
          { id: 'merge', icon: Combine, label: 'Ghép video' },
          { id: 'costs', icon: Coins, label: 'Hiệu năng' },
        ].map((item) => (
          <li key={item.id}>
            <button
              className={`nav-link ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => navigateTo(item.id)}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          </li>
        ))}
        {onOpenGeminiKeyModal && (
          <li>
            <button
              className="nav-link"
              onClick={onOpenGeminiKeyModal}
              style={{ color: 'var(--accent-gold)' }}
              title="Cấu hình & Kiểm tra Gemini API Key"
            >
              <Key size={16} />
              <span>Gemini Key</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
};
