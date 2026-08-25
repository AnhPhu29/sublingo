import React from 'react';
import { Coins, Check } from 'lucide-react';
import { CostSummary } from '@/lib/types';

interface CostsSectionProps {
  costLoading: boolean;
  costSummary: CostSummary | null;
}

export const CostsSection: React.FC<CostsSectionProps> = ({
  costLoading,
  costSummary
}) => {
  return (
    <section className="main-section" id="costs">
      <div className="section-header" style={{ marginBottom: '1rem' }}>
        <div className="section-header-icon"><Coins size={20} /></div>
        <h2>Hiệu năng & Tài nguyên Local AI</h2>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--accent-mint)', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)', padding: '0.6rem 0.9rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Check size={14} />
        <span>Hệ thống hiện tại đang sử dụng các mô hình AI mã nguồn mở chạy local (cục bộ), không tốn chi phí API.</span>
      </p>

      {costLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem', justifyContent: 'center' }}>
          <div className="spinner" />
          <span style={{ color: 'var(--text-muted)' }}>Đang tính toán số liệu hiệu năng...</span>
        </div>
      )}

      {!costLoading && costSummary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>
                TIỀN TIẾT KIỆM ƯỚC TÍNH
              </div>
              <div className="gold" style={{ fontSize: '2rem', fontWeight: 700 }}>
                ${(costSummary.totalSavedUsd || 0).toFixed(4)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>USD</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>So với việc sử dụng dịch vụ đám mây trả phí</span>
            </div>

            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>
                TỔNG THỜI GIAN XỬ LÝ LOCAL
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>
                {((costSummary.totalDurationSeconds || 0) / 60).toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>phút</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({(costSummary.totalDurationSeconds || 0).toFixed(0)} giây chạy CPU/GPU)</span>
            </div>

            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>
                TỔNG SỐ JOBS ĐÃ XỬ LÝ
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>
                {costSummary.totalJobs} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>jobs</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Số lượng tiến trình hoàn tất thành công</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Hiệu năng theo ngày
              </h3>
              {costSummary.costsByDate.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Chưa có dữ liệu</p>
              ) : (
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem 0' }}>Ngày</th>
                        <th style={{ padding: '0.5rem 0', textAlign: 'center' }}>Thời gian local (giây)</th>
                        <th style={{ padding: '0.5rem 0', textAlign: 'right' }}>Tiết kiệm (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costSummary.costsByDate.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(242,238,230,0.03)' }}>
                          <td style={{ padding: '0.5rem 0', fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                          <td style={{ padding: '0.5rem 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{item.duration}s</td>
                          <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 600, color: 'var(--accent-gold)' }}>
                            ${item.amount.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Tiết kiệm theo loại xử lý
              </h3>
              {costSummary.costsByType.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Chưa có dữ liệu</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {costSummary.costsByType.map((item, idx) => {
                    const typeLabel =
                      item.type === 'translate'
                        ? 'Dịch phụ đề text'
                        : item.type === 'ocr_image'
                        ? 'OCR từ ảnh'
                        : item.type === 'ocr_video'
                        ? 'OCR Video'
                        : item.type === 'stt'
                        ? 'Whisper STT'
                        : item.type === 'dub'
                        ? 'Lồng tiếng'
                        : item.type;
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '0.5rem', background: 'rgba(242,238,230,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ fontWeight: 500 }}>{typeLabel}</span>
                        <span style={{ fontWeight: 600, color: 'var(--accent-mint)' }}>+${item.amount.toFixed(4)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
