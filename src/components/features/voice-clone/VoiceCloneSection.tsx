"use client";

import React, { useState } from "react";
import {
  Mic,
  Zap,
  Award,
  Lock,
  Plus,
  Play,
  Pause,
  Trash2,
  Volume2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  HelpCircle,
  FileAudio,
} from "lucide-react";
import { useSubLingo } from "@/context/SubLingoContext";
import Link from "next/link";

export const VoiceCloneSection: React.FC = () => {
  const {
    customVoices,
    showToast,
    fetchVoices,
    deleteCustomVoice,
    setShowAddVoiceModal,
  } = useSubLingo();

  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);

  // So sánh demo audio state
  const [activeDemo, setActiveDemo] = useState<"orig" | "fast" | "pro" | null>(null);

  const handlePlayCustomVoice = (voiceId: string, demoUrl: string) => {
    if (playingVoiceId === voiceId) {
      audioPlayer?.pause();
      setAudioPlayer(null);
      setPlayingVoiceId(null);
      return;
    }

    audioPlayer?.pause();
    const a = new Audio(`/api/custom-voices/audio/${voiceId}`);
    a.play().catch(() => showToast("Không thể phát file mẫu nghe thử", "error"));
    setAudioPlayer(a);
    setPlayingVoiceId(voiceId);

    a.onended = () => {
      setPlayingVoiceId(null);
      setAudioPlayer(null);
    };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", paddingBottom: "3rem" }}>
      {/* 1. HEADER SECTION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.4rem 0", color: "var(--text)" }}>
            Nhân bản giọng (Voice Cloning)
          </h1>
          <p style={{ fontSize: "0.88rem", color: "#6B7280", margin: 0, maxWidth: "680px", lineHeight: "1.5" }}>
            Tạo bản sao giọng nói của bạn với chất lượng phòng thu bằng công nghệ AI Zero-Shot. 
            Chọn hình thức tạo giọng phù hợp bên dưới để bắt đầu.
          </p>
        </div>

        <button
          onClick={() => setShowAddVoiceModal(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
            color: "#FFF",
            border: "none",
            borderRadius: "10px",
            padding: "0.65rem 1.25rem",
            fontSize: "0.85rem",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
            transition: "transform 0.15s ease",
          }}
        >
          <Plus size={18} /> Thêm giọng nhân bản mới
        </button>
      </div>

      {/* 2. CHỌN HÌNH THỨC NHÂN BẢN (2 Thẻ Cards giống ảnh mẫu) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {/* Thẻ 1: Nhân bản Nhanh */}
        <div
          style={{
            background: "#FFFFFF",
            border: "1.5px solid #E5E7EB",
            borderRadius: "16px",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "1.25rem",
            boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  background: "#F3F4F6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#111827",
                }}
              >
                <Zap size={22} fill="#111827" />
              </div>
              <span
                style={{
                  background: "#F3F4F6",
                  color: "#374151",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "0.3rem 0.75rem",
                  borderRadius: "20px",
                }}
              >
                Nhanh và dễ
              </span>
            </div>

            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "#111827" }}>
              Nhanh (Zero-Shot AI)
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#6B7280", margin: 0, lineHeight: "1.5" }}>
              Nhân bản giọng nói của bạn chỉ với file ghi âm ngắn 5 - 10 giây audio mẫu. Tốc độ xử lý tức thì.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowAddVoiceModal(true)}
              style={{
                background: "#FACC15",
                color: "#111827",
                border: "none",
                borderRadius: "24px",
                padding: "0.6rem 1.4rem",
                fontSize: "0.85rem",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(250, 204, 21, 0.4)",
              }}
            >
              Bắt đầu ngay
            </button>
          </div>
        </div>

        {/* Thẻ 2: Nhân bản Chuyên nghiệp */}
        <div
          style={{
            background: "#FAF5FF",
            border: "1.5px solid #E9D5FF",
            borderRadius: "16px",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "1.25rem",
            boxShadow: "0 2px 10px rgba(147, 51, 234, 0.05)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  background: "#F3E8FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9333EA",
                }}
              >
                <Award size={22} />
              </div>
              <span
                style={{
                  background: "#F3E8FF",
                  color: "#7E22CE",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "0.3rem 0.75rem",
                  borderRadius: "20px",
                }}
              >
                Chất lượng cao
              </span>
            </div>

            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "#111827" }}>
              Chuyên nghiệp (Studio HQ)
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#6B7280", margin: 0, lineHeight: "1.5" }}>
              Chất lượng giọng nhân bản chân thực nhất. Cần tối thiểu 3-5 phút mẫu ghi âm phòng thu rõ ràng.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#6B7280", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Lock size={14} style={{ color: "#9333EA" }} /> Đã bao gồm trong dự án
            </span>
            <button
              onClick={() => showToast("Tính năng Nhân bản Studio đang sử dụng model VieNeu-TTS v3 Turbo!", "info")}
              style={{
                background: "#FFF",
                color: "#7E22CE",
                border: "1px solid #E9D5FF",
                borderRadius: "24px",
                padding: "0.55rem 1.2rem",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Tìm hiểu thêm
            </button>
          </div>
        </div>
      </div>

      {/* 3. THƯ VIỆN GIỌNG ĐỌC ĐÃ TẠO (Custom Voice Library List) */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          padding: "1.5rem",
          boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "#111827" }}>
              Thư viện giọng nhân bản của bạn ({customVoices.length} giọng)
            </h3>
            <p style={{ fontSize: "0.78rem", color: "#6B7280", margin: "0.25rem 0 0 0" }}>
              Danh sách các mẫu giọng nói AI do bạn tải lên. Bạn có thể sử dụng ngay trong các tính năng TTS & Lồng tiếng.
            </p>
          </div>

          <button
            onClick={fetchVoices}
            style={{
              background: "#F3F4F6",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              padding: "0.4rem 0.8rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              color: "#374151",
            }}
          >
            🔄 Tải lại thư viện
          </button>
        </div>

        {customVoices.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "3rem 1.5rem",
              background: "#F9FAFB",
              border: "2px dashed #E5E7EB",
              borderRadius: "12px",
            }}
          >
            <Mic size={40} style={{ color: "#9CA3AF", marginBottom: "0.75rem" }} />
            <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "#374151" }}>
              Chưa có giọng nhân bản nào
            </h4>
            <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "0 0 1rem 0" }}>
              Hãy bấm nút "Thêm giọng nhân bản mới" ở trên để tải file âm thanh 5s mẫu của bạn.
            </p>
            <button
              onClick={() => setShowAddVoiceModal(true)}
              style={{
                background: "#2563EB",
                color: "#FFF",
                border: "none",
                borderRadius: "8px",
                padding: "0.55rem 1.1rem",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + Thêm giọng ngay
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {customVoices.map((cv: any) => {
              const isPlaying = playingVoiceId === cv.id;
              return (
                <div
                  key={cv.id}
                  style={{
                    background: "#F9FAFB",
                    border: "1px solid #E5E7EB",
                    borderRadius: "12px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
                        color: "#FFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "1rem",
                      }}
                    >
                      {cv.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          margin: 0,
                          color: "#111827",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cv.name}
                      </h4>
                      <span style={{ fontSize: "0.72rem", color: "#6B7280" }}>
                        Khởi tạo: {new Date(cv.createdAt).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                  </div>

                  {cv.refText && (
                    <p
                      style={{
                        fontSize: "0.76rem",
                        color: "#4B5563",
                        background: "#FFF",
                        border: "1px solid #E5E7EB",
                        borderRadius: "6px",
                        padding: "0.4rem 0.6rem",
                        margin: 0,
                        fontStyle: "italic",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      "{cv.refText}"
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", paddingTop: "0.25rem" }}>
                    <button
                      onClick={() => handlePlayCustomVoice(cv.id, cv.refAudioPath)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        background: isPlaying ? "#EFF6FF" : "#FFF",
                        border: isPlaying ? "1px solid #2563EB" : "1px solid #D1D5DB",
                        color: isPlaying ? "#2563EB" : "#374151",
                        borderRadius: "6px",
                        padding: "0.35rem 0.75rem",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                      {isPlaying ? "Đang phát..." : "Nghe thử mẫu"}
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <Link
                        href="/tts"
                        style={{
                          background: "#2563EB",
                          color: "#FFF",
                          borderRadius: "6px",
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        Đọc TTS <ArrowRight size={12} />
                      </Link>

                      <button
                        onClick={() => deleteCustomVoice(cv.id)}
                        style={{
                          background: "#FEF2F2",
                          border: "1px solid #FCA5A5",
                          color: "#EF4444",
                          borderRadius: "6px",
                          padding: "0.35rem 0.5rem",
                          cursor: "pointer",
                        }}
                        title="Xóa giọng nhân bản này"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
