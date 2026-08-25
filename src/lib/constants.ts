import { Globe, FileText, Languages, Eye } from 'lucide-react';

export const LANGUAGES = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'zh', label: '中文(简体)', flag: '🇨🇳' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'th', label: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
];

export const SUBTITLE_SAMPLES = [
  { original: 'The world is changed. I feel it in the water.', translated: 'Thế giới đã thay đổi. Tôi cảm nhận được trong dòng nước.', from: 'EN', to: 'VI' },
  { original: 'Thế giới đã thay đổi. Tôi cảm nhận được trong dòng nước.', translated: '世界は変わった。水の中でそれを感じる。', from: 'VI', to: 'JA' },
  { original: '世界は変わった。水の中でそれを感じる。', translated: 'El mundo ha cambiado. Lo siento en el agua.', from: 'JA', to: 'ES' },
  { original: 'El mundo ha cambiado. Lo siento en el agua.', translated: 'Le monde a changé. Je le sens dans l\'eau.', from: 'ES', to: 'FR' },
  { original: 'Le monde a changé. Je le sens dans l\'eau.', translated: 'The world is changed. I feel it in the water.', from: 'FR', to: 'EN' },
];
