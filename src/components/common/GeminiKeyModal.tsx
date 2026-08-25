import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, X, ExternalLink } from 'lucide-react';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: string) => void;
}

export const GeminiKeyModal: React.FC<GeminiKeyModalProps> = ({
  isOpen,
  onClose,
  showToast
}) => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fetchKeyStatus = async () => {
    try {
      const res = await fetch('/api/settings/gemini');
      const data = await res.json();
      if (data.success) {
        setHasServerKey(data.hasApiKey);
        setMaskedKey(data.maskedKey);
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchKeyStatus();
      setStatusMessage(null);
      setApiKeyInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = async (saveMode: boolean) => {
    const cleanKey = apiKeyInput.trim().replace(/^["']|["']$/g, '');

    if (!cleanKey) {
      showToast('Vui lòng nhập API Key để kiểm tra', 'error');
      return;
    }

    setLoading(true);
    setStatusMessage({ type: 'info', text: 'Đang kiểm tra kết nối tới máy chủ Google Gemini...' });

    try {
      const res = await fetch('/api/settings/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: cleanKey,
          action: saveMode ? 'save' : 'verify'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatusMessage({
          type: 'success',
          text: data.message || 'API Key hợp lệ và kết nối tới Gemini thành công!'
        });
        showToast(data.message || 'Xác thực thành công!', 'success');
        fetchKeyStatus();
        if (saveMode) {
          setTimeout(() => onClose(), 1200);
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'API Key không hợp lệ.'
        });
        showToast(data.error || 'Lỗi xác thực API Key', 'error');
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Lỗi kết nối máy chủ.'
      });
      showToast('Lỗi kết nối máy chủ', 'error');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-card, #ffffff)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 12px)',
        width: '100%',
        maxWidth: '520px',
        padding: '1.75rem',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
        color: 'var(--text)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Key size={20} className="gold" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Cấu hình & Kiểm tra Gemini API Key</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Current status badge */}
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm, 6px)',
          background: hasServerKey ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          border: `1px solid ${hasServerKey ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            {hasServerKey ? (
              <>
                <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                <span>Trạng thái: <strong>Đã có API Key ({maskedKey})</strong></span>
              </>
            ) : (
              <>
                <AlertCircle size={16} style={{ color: '#ef4444' }} />
                <span>Trạng thái: <strong>Chưa cấu hình API Key</strong></span>
              </>
            )}
          </div>
          <a
            href="https://aistudio.google.com/api-keys"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.78rem', color: 'var(--accent-primary, #2563eb)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none', fontWeight: 600 }}
          >
            Lấy Key miễn phí <ExternalLink size={12} />
          </a>
        </div>

        {/* Input */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text)' }}>
            Nhập Google Gemini API Key:
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              className="paste-area"
              style={{
                width: '100%',
                minHeight: '42px',
                height: '42px',
                padding: '0.5rem 2.5rem 0.5rem 0.85rem',
                marginBottom: 0,
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
              placeholder="Dán mã API Key tại đây (vd: AIzaSy...)"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 0
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Validation Result Feedback Banner */}
        {statusMessage && (
          <div className={`alert ${statusMessage.type === 'success' ? 'alert-info' : statusMessage.type === 'error' ? 'alert-error' : 'alert-info'}`} style={{ fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            {statusMessage.type === 'success' && <CheckCircle2 size={16} className="alert-icon" />}
            {statusMessage.type === 'error' && <AlertCircle size={16} className="alert-icon" />}
            {statusMessage.type === 'info' && <div className="spinner" style={{ width: '14px', height: '14px' }} />}
            <div className="alert-content">{statusMessage.text}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={() => handleVerify(false)}
            style={{ cursor: 'pointer' }}
          >
            {loading ? <div className="spinner" /> : <RefreshCw size={14} />} Kiểm tra thử
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => handleVerify(true)}
            style={{ cursor: 'pointer' }}
          >
            {loading ? <div className="spinner" /> : <CheckCircle2 size={14} />} Lưu API Key
          </button>
        </div>
      </div>
    </div>
  );
};
