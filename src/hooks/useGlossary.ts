import { useState, useCallback } from 'react';
import { GlossaryItem } from '../lib/types';

interface UseGlossaryProps {
  showToast: (msg: string, type?: string) => void;
}

export function useGlossary({ showToast }: UseGlossaryProps) {
  const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
  const [glossInputOriginal, setGlossInputOriginal] = useState('');
  const [glossInputTranslation, setGlossInputTranslation] = useState('');

  const fetchGlossary = useCallback(async () => {
    try {
      const res = await fetch('/api/glossary');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setGlossary(data.data.map((item: any) => ({
            id: item.id,
            term: item.term,
            translation: item.translation
          })));
        }
      }
    } catch (e) {
      console.error('Failed to fetch glossary', e);
    }
  }, []);

  const addGlossaryItem = useCallback(async () => {
    if (!glossInputOriginal.trim() || !glossInputTranslation.trim()) {
      showToast('Thuật ngữ gốc và dịch không được bỏ trống', 'error');
      return;
    }
    if (glossary.length >= 30) {
      showToast('Từ điển tối đa 30 cụm từ', 'error');
      return;
    }

    try {
      const res = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: glossInputOriginal.trim(),
          translation: glossInputTranslation.trim()
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlossary((prev) => [
          { id: data.data.id, term: data.data.term, translation: data.data.translation },
          ...prev
        ]);
        setGlossInputOriginal('');
        setGlossInputTranslation('');
        showToast('Đã thêm vào từ điển', 'success');
      } else {
        showToast(data.error || 'Lỗi thêm cụm từ', 'error');
      }
    } catch (e) {
      showToast('Lỗi kết nối server', 'error');
    }
  }, [glossInputOriginal, glossInputTranslation, glossary.length, showToast]);

  const removeGlossaryItem = useCallback(async (id?: string, index?: number) => {
    if (!id) {
      setGlossary((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    try {
      const res = await fetch(`/api/glossary?id=${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlossary((prev) => prev.filter((item) => item.id !== id));
        showToast('Đã xoá thuật ngữ', 'info');
      } else {
        showToast(data.error || 'Lỗi xóa cụm từ', 'error');
      }
    } catch (e) {
      showToast('Lỗi kết nối server', 'error');
    }
  }, [showToast]);

  return {
    glossary,
    setGlossary,
    glossInputOriginal,
    setGlossInputOriginal,
    glossInputTranslation,
    setGlossInputTranslation,
    fetchGlossary,
    addGlossaryItem,
    removeGlossaryItem
  };
}
