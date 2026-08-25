'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clapperboard, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Sai mật khẩu');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-dark)',
      fontFamily: 'var(--font-body)',
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      <div className="login-card" style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '2.5rem 2rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        boxSizing: 'border-box'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
            <Clapperboard size={32} />
            <span>SubLingo</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Hệ thống dịch phụ đề AI dành riêng cho cá nhân
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>
              Mật khẩu truy cập
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="paste-area"
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  fontSize: '0.9rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'rgba(242, 238, 230, 0.02)',
                  color: 'var(--text)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  minHeight: '44px'
                }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '10px', top: '14px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--accent-rose)',
              background: 'rgba(226, 99, 122, 0.05)',
              border: '1px solid rgba(226, 99, 122, 0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem',
              fontSize: '0.8rem',
              marginBottom: '1.5rem'
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', display: 'flex', justifyContent: 'center', gap: '0.5rem', minHeight: '44px', cursor: 'pointer' }}
          >
            {loading ? (
              <div className="spinner" style={{ width: '14px', height: '14px' }} />
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
