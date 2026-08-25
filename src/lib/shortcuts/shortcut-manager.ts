/**
 * Keyboard Shortcut Manager chuẩn CapCut Desktop cho SubLingo AI Studio.
 * 
 * Hỗ trợ toàn bộ phím tắt thao tác chuyên nghiệp:
 * - Space: Play / Pause
 * - ArrowLeft / ArrowRight: Frame Step (0.1s)
 * - S: Split Subtitle at Playhead
 * - M: Merge Selected Subtitles
 * - Delete / Backspace: Delete Selected Subtitle
 * - Ctrl+C / Ctrl+V: Copy / Paste Subtitle
 * - Ctrl+Z / Ctrl+Y: Undo / Redo
 * - Ctrl+A: Select All
 * - J / K / L: Shuttle Playback (Rewind 2x / Pause / Forward 2x)
 * - Ctrl + Wheel: Timeline Zoom
 * - Shift: Snap Toggle
 */

export interface ShortcutAction {
  id: string;
  name: string;
  keys: string[]; // e.g. ["Control", "z"] hoặc ["Space"]
  description: string;
  category: 'playback' | 'timeline' | 'edit' | 'view';
}

export const CAPCUT_SHORTCUTS: Record<string, ShortcutAction> = {
  PLAY_PAUSE: {
    id: 'PLAY_PAUSE',
    name: 'Phát / Tạm dừng',
    keys: ['Space'],
    description: 'Bật/tắt xem trước video',
    category: 'playback'
  },
  STEP_BACK: {
    id: 'STEP_BACK',
    name: 'Lùi 1 khung hình',
    keys: ['ArrowLeft'],
    description: 'Di chuyển Playhead lùi 0.1 giây',
    category: 'playback'
  },
  STEP_FORWARD: {
    id: 'STEP_FORWARD',
    name: 'Tới 1 khung hình',
    keys: ['ArrowRight'],
    description: 'Di chuyển Playhead tới 0.1 giây',
    category: 'playback'
  },
  SPLIT_SUBTITLE: {
    id: 'SPLIT_SUBTITLE',
    name: 'Cắt câu thoại',
    keys: ['s'],
    description: 'Tách đôi câu thoại tại vị trí Playhead',
    category: 'edit'
  },
  MERGE_SUBTITLE: {
    id: 'MERGE_SUBTITLE',
    name: 'Gộp câu thoại',
    keys: ['m'],
    description: 'Gộp các câu thoại đang chọn',
    category: 'edit'
  },
  DELETE_SUBTITLE: {
    id: 'DELETE_SUBTITLE',
    name: 'Xóa câu thoại',
    keys: ['Delete', 'Backspace'],
    description: 'Xóa các câu thoại đang chọn',
    category: 'edit'
  },
  COPY: {
    id: 'COPY',
    name: 'Sao chép',
    keys: ['Control', 'c'],
    description: 'Sao chép phụ đề đang chọn',
    category: 'edit'
  },
  PASTE: {
    id: 'PASTE',
    name: 'Dán',
    keys: ['Control', 'v'],
    description: 'Dán phụ đề vào vị trí Playhead',
    category: 'edit'
  },
  UNDO: {
    id: 'UNDO',
    name: 'Hoàn tác',
    keys: ['Control', 'z'],
    description: 'Hoàn tác thao tác vừa thực hiện',
    category: 'edit'
  },
  REDO: {
    id: 'REDO',
    name: 'Làm lại',
    keys: ['Control', 'y'],
    description: 'Làm lại thao tác vừa hoàn tác',
    category: 'edit'
  },
  SELECT_ALL: {
    id: 'SELECT_ALL',
    name: 'Chọn tất cả',
    keys: ['Control', 'a'],
    description: 'Chọn toàn bộ danh sách phụ đề',
    category: 'edit'
  },
  SHUTTLE_REWIND: {
    id: 'SHUTTLE_REWIND',
    name: 'Tua lùi (J)',
    keys: ['j'],
    description: 'Tua lùi phát lại với tốc độ 2x',
    category: 'playback'
  },
  SHUTTLE_PAUSE: {
    id: 'SHUTTLE_PAUSE',
    name: 'Dừng (K)',
    keys: ['k'],
    description: 'Tạm dừng phát lại',
    category: 'playback'
  },
  SHUTTLE_FORWARD: {
    id: 'SHUTTLE_FORWARD',
    name: 'Tua tới (L)',
    keys: ['l'],
    description: 'Tua tới phát lại với tốc độ 2x',
    category: 'playback'
  }
};

export class ShortcutManager {
  private static handlers: Map<string, () => void> = new Map();

  static register(actionId: string, handler: () => void) {
    this.handlers.set(actionId, handler);
  }

  static unregister(actionId: string) {
    this.handlers.delete(actionId);
  }

  static handleKeyDown(event: KeyboardEvent): boolean {
    // Không kích hoạt shortcut khi đang gõ text trong Input/Textarea
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return false;
    }

    const key = event.key;
    const ctrl = event.ctrlKey || event.metaKey;

    // Check Ctrl + Key combinations
    if (ctrl) {
      if (key.toLowerCase() === 'z') {
        const handler = this.handlers.get('UNDO');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'y') {
        const handler = this.handlers.get('REDO');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'c') {
        const handler = this.handlers.get('COPY');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'v') {
        const handler = this.handlers.get('PASTE');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'a') {
        const handler = this.handlers.get('SELECT_ALL');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
    } else {
      // Single key combinations
      if (key === ' ') {
        const handler = this.handlers.get('PLAY_PAUSE');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key === 'ArrowLeft') {
        const handler = this.handlers.get('STEP_BACK');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key === 'ArrowRight') {
        const handler = this.handlers.get('STEP_FORWARD');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 's') {
        const handler = this.handlers.get('SPLIT_SUBTITLE');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'm') {
        const handler = this.handlers.get('MERGE_SUBTITLE');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key === 'Delete' || key === 'Backspace') {
        const handler = this.handlers.get('DELETE_SUBTITLE');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'j') {
        const handler = this.handlers.get('SHUTTLE_REWIND');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'k') {
        const handler = this.handlers.get('SHUTTLE_PAUSE');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
      if (key.toLowerCase() === 'l') {
        const handler = this.handlers.get('SHUTTLE_FORWARD');
        if (handler) { event.preventDefault(); handler(); return true; }
      }
    }

    return false;
  }
}
