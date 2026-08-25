/**
 * CapCut Desktop UI/UX Design System Tokens & Theme Specs cho SubLingo Studio.
 * 
 * Định nghĩa Layout Boundaries, Resizable Panel Ratios, Color Palettes,
 * Context Menu Specs và Dark/Light Mode Theme Tokens.
 */

export const CAPCUT_THEME = {
  colors: {
    bgApp: '#121214',          // Background ứng dụng chính
    bgSurface: '#1A1A1D',      // Surface khung
    bgPanel: '#202126',        // Panel khung Dock
    bgHeader: '#1A1A1D',       // Nền thanh tiêu đề
    bgTimeline: '#141417',     // Nền thanh Timeline
    bgHover: 'rgba(255,255,255,0.06)',
    bgActive: 'rgba(78,123,255,0.15)',
    border: 'rgba(255,255,255,0.08)',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0AB',
    textMuted: '#60606A',
    primary: '#4E7BFF',        // Primary Blue
    accent: '#00D4FF',         // Neon Cyan Accent
    accentSuccess: '#00E676',
    accentWarning: '#FFB300',
    danger: '#FF4D6D',          // Danger Red
    trackVideo: '#181A20',
    trackAudio: '#121E2C',
    trackSubtitle: '#241B2D',
    waveformBar: '#00D4FF'
  },
  dimensions: {
    headerHeight: 48,          // px
    toolbarWidth: 56,          // px
    timelineMinHeight: 280,    // px
    inspectorMinWidth: 340,    // px
    sidebarWidth: 260          // px
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSizeXs: '11px',
    fontSizeSm: '12px',
    fontSizeMd: '13px',
    fontSizeLg: '15px',
    fontSizeXl: '18px'
  },
  borderRadius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    full: '9999px'
  },
  effects: {
    blur: 'backdrop-filter: blur(20px)',
    shadow: '0 10px 40px rgba(0,0,0,0.45)',
    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)'
  }
};

export interface CapCutLayoutConfig {
  showLeftSidebar: boolean;
  showInspector: boolean;
  showTimeline: boolean;
  leftSidebarWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  activeTab: 'media' | 'text' | 'subtitles' | 'audio' | 'effects' | 'export';
}

export const DEFAULT_LAYOUT_CONFIG: CapCutLayoutConfig = {
  showLeftSidebar: true,
  showInspector: true,
  showTimeline: true,
  leftSidebarWidth: 280,
  inspectorWidth: 340,
  timelineHeight: 280,
  activeTab: 'text'
};
