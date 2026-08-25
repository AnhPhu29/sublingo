import { useState, useCallback } from 'react';

interface UseCustomVoicesProps {
  showToast: (msg: string, type?: string) => void;
  setConfirmDialog: (config: any) => void;
  dubVoiceId: string;
  setDubVoiceId: (id: string) => void;
}

export function useCustomVoices({
  showToast,
  setConfirmDialog,
  dubVoiceId,
  setDubVoiceId
}: UseCustomVoicesProps) {
  const [customVoices, setCustomVoices] = useState<any[]>([]);
  const [vbeeVoices, setVbeeVoices] = useState<any[]>([]);
  const [vbeeVoicesLoading, setVbeeVoicesLoading] = useState(false);
  
  const [showAddVoiceModal, setShowAddVoiceModal] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceText, setNewVoiceText] = useState('');
  const [newVoiceAudio, setNewVoiceAudio] = useState<File | null>(null);
  const [isAddingVoice, setIsAddingVoice] = useState(false);

  const fetchVoices = useCallback(async () => {
    setVbeeVoicesLoading(true);
    try {
      const res = await fetch('/api/voices');
      const ctVal = res.headers.get('content-type') || '';
      const data = (res.ok && ctVal.includes('application/json')) ? await res.json() : null;
      
      const customRes = await fetch('/api/custom-voices');
      const customCtVal = customRes.headers.get('content-type') || '';
      const customData = (customRes.ok && customCtVal.includes('application/json')) ? await customRes.json() : null;
      
      let allVoices: any[] = [];
      if (data && data.success && Array.isArray(data.voices)) {
        allVoices = [...data.voices];
      }
      
      if (customData && customData.success && Array.isArray(customData.voices)) {
        setCustomVoices(customData.voices);
        const formattedCustom = customData.voices.map((cv: any) => ({
          code: cv.id,
          name: `🌟 [Giọng tùy chỉnh] ${cv.name}`,
          gender: 'cloned',
          creditFactor: 1.0,
          isCustom: true,
          demoUrl: `/api/custom-voices/audio/${cv.id}`
        }));
        allVoices = [...allVoices, ...formattedCustom];
      }
      
      setVbeeVoices(allVoices);
      if (allVoices.length > 0) {
        if (!dubVoiceId || !allVoices.some(v => v.code === dubVoiceId)) {
          setDubVoiceId(allVoices[0].code);
        }
      }
    } catch (e) {
      console.error('Failed to fetch voices:', e);
    } finally {
      setVbeeVoicesLoading(false);
    }
  }, [dubVoiceId, setDubVoiceId]);

  const deleteCustomVoice = useCallback((id: string) => {
    setConfirmDialog({
      title: 'Xóa giọng tùy chỉnh',
      message: 'Bạn có chắc chắn muốn xóa giọng đọc này? File audio mẫu trên đĩa cũng sẽ bị xóa.',
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/custom-voices/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast('Đã xóa giọng đọc tùy chỉnh thành công', 'success');
            fetchVoices();
          } else {
            showToast(data.error || 'Lỗi khi xóa giọng đọc', 'error');
          }
        } catch (e) {
          showToast('Lỗi kết nối server', 'error');
        }
        setConfirmDialog(null);
      }
    });
  }, [fetchVoices, setConfirmDialog, showToast]);

  const addCustomVoice = useCallback(async () => {
    if (!newVoiceName.trim()) {
      showToast('Vui lòng nhập tên hiển thị giọng nói', 'error');
      return;
    }
    if (!newVoiceText.trim()) {
      showToast('Vui lòng nhập transcript khớp với audio mẫu', 'error');
      return;
    }
    if (!newVoiceAudio) {
      showToast('Vui lòng chọn file audio mẫu (3-5 giây)', 'error');
      return;
    }

    setIsAddingVoice(true);
    const fd = new FormData();
    fd.append('name', newVoiceName.trim());
    fd.append('refText', newVoiceText.trim());
    fd.append('audio', newVoiceAudio);

    try {
      const res = await fetch('/api/custom-voices', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Thêm giọng nói tùy chỉnh thành công', 'success');
        setNewVoiceName('');
        setNewVoiceText('');
        setNewVoiceAudio(null);
        setShowAddVoiceModal(false);
        fetchVoices();
      } else {
        showToast(data.error || 'Lỗi khi thêm giọng nói', 'error');
      }
    } catch (e) {
      showToast('Lỗi kết nối server', 'error');
    } finally {
      setIsAddingVoice(false);
    }
  }, [newVoiceName, newVoiceText, newVoiceAudio, fetchVoices, showToast]);

  return {
    customVoices,
    vbeeVoices,
    vbeeVoicesLoading,
    showAddVoiceModal,
    setShowAddVoiceModal,
    newVoiceName,
    setNewVoiceName,
    newVoiceText,
    setNewVoiceText,
    newVoiceAudio,
    setNewVoiceAudio,
    isAddingVoice,
    fetchVoices,
    deleteCustomVoice,
    addCustomVoice
  };
}
