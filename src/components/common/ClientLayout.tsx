"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clapperboard,
  ScanText,
  Subtitles,
  FileText,
  Mic,
  Volume2,
  Sparkles,
  History,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Globe,
  User,
  Key,
  Combine,
  Smartphone,
  BookOpen,
} from "lucide-react";
import { useSubLingo } from "@/context/SubLingoContext";
import { GeminiKeyModal } from "./GeminiKeyModal";

export const ClientLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const {
    uiLang,
    setUiLang,
    theme,
    setTheme,
    isGeminiKeyModalOpen,
    setIsGeminiKeyModalOpen,
    showToast,
  } = useSubLingo();

  // Prefetch all routes in background for 0ms transitions
  useEffect(() => {
    ["/editor", "/convert-ratio", "/tts", "/merge", "/reader"].forEach((path) => {
      router.prefetch(path);
    });
  }, [router]);

  const navigationItems = [
    { href: "/editor", label: uiLang === "vi" ? "Trình soạn thảo Phụ đề & Lồng tiếng AI" : "Subtitle & AI Dubbing Editor", icon: Subtitles },
    { href: "/convert-ratio", label: uiLang === "vi" ? "Biến đổi 16:9 ➔ 9:16 (TikTok/Reels)" : "Convert 16:9 to 9:16", icon: Smartphone },
    { href: "/tts", label: uiLang === "vi" ? "Tạo giọng đọc AI (TTS)" : "Text to Speech (TTS)", icon: Volume2 },
    { href: "/merge", label: uiLang === "vi" ? "Ghép nhiều video" : "Merge Videos", icon: Combine },
    { href: "/reader", label: uiLang === "vi" ? "Đọc sách PDF & Scan OCR" : "PDF Book Reader & OCR", icon: BookOpen },
  ];

  const sidebarWidth = "70px";

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const toggleLanguage = () => {
    setUiLang(uiLang === "vi" ? "en" : "vi");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* 1. Collapsible Sidebar */}
      <aside
        className="sublingo-rail"
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          background: "var(--bg-elevated)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
          overflowX: "hidden",
        }}
      >
        {/* Sidebar Logo */}
        <div
          style={{
            height: "70px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 1.25rem",
            borderBottom: "1px solid var(--border-light)",
            overflow: "hidden",
          }}
        >
          <Clapperboard size={22} style={{ color: "var(--accent-gold)", flexShrink: 0 }} />
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: "0.75rem 0.45rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {navigationItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  color: isActive ? "var(--accent-gold)" : "var(--text-muted)",
                  background: isActive ? "var(--accent-soft)" : "transparent",
                  textDecoration: "none",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: "0.9rem",
                  transition: "all 0.15s ease",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                <item.icon size={18} style={{ flexShrink: 0 }} />
              </Link>
            );
          })}

          {/* Gemini Key Config Link */}
          <button
            onClick={() => setIsGeminiKeyModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.75rem",
              borderRadius: "var(--radius-sm)",
              color: "var(--accent-gold)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.9rem",
              width: "100%",
              textAlign: "left",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
            title={uiLang === "vi" ? "Cấu hình Gemini API Key" : "Configure Gemini API Key"}
          >
            <Key size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <span>Gemini Key</span>}
          </button>
        </nav>

        {/* Sidebar Collapse Toggle Button */}
        <div style={{ padding: "0.75rem", borderTop: "1px solid var(--border-light)" }}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              width: "100%",
              padding: "0.5rem",
              background: "var(--bg-elevated-2)",
              border: "none",
              borderRadius: "var(--radius-xs)",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
              fontWeight: 500,
            }}
            title={uiLang === "vi" ? "Thu gọn" : "Collapse"}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>

      {/* Right Column Content Area */}
      <div
        style={{
          flex: 1,
          marginLeft: sidebarWidth,
          transition: "margin-left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* 2. Top Header */}
        <header
          className="sublingo-topbar"
          style={{
            background: "var(--bg-elevated)",
            borderBottom: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 1.5rem",
            position: "sticky",
            top: 0,
            zIndex: 90,
          }}
        >
          {/* Left: Breadcrumbs or simple status */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            <span style={{ fontSize: "1rem", color: "var(--text)", fontWeight: 700 }}>
              {pathname === "/extract" && (uiLang === "vi" ? "Trích xuất phụ đề" : "Extract Subtitle")}
              {pathname === "/editor" && (uiLang === "vi" ? "Trình soạn thảo" : "Subtitle Editor")}
              {pathname === "/tts" && (uiLang === "vi" ? "Chuyển văn bản thành giọng nói (TTS)" : "Text to Speech")}
              {pathname === "/merge" && (uiLang === "vi" ? "Ghép nối nhiều video" : "Merge Videos")}
              {pathname === "/reader" && (uiLang === "vi" ? "Đọc sách PDF & Scan OCR" : "PDF Book Reader & OCR")}
              {pathname === "/convert-ratio" && (uiLang === "vi" ? "Biến đổi 16:9 ➔ 9:16" : "Convert 16:9 to 9:16")}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {uiLang === "vi"
                ? "Biên dịch và quản lý phụ đề video bằng AI"
                : "Translate and manage video subtitles with AI"}
            </span>
          </div>

          {/* Right Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              style={{
                background: "none",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                padding: "0.5rem",
                borderRadius: "var(--radius-xs)",
              }}
              title={uiLang === "vi" ? "Chuyển sang Tiếng Anh" : "Switch to Vietnamese"}
            >
              <Globe size={16} />
              <span>{uiLang.toUpperCase()}</span>
            </button>

            {/* Dark/Light Theme Switcher */}
            <button
              onClick={toggleTheme}
              style={{
                background: "none",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                padding: "0.5rem",
                display: "flex",
                alignItems: "center",
                borderRadius: "var(--radius-xs)",
              }}
              title={theme === "light" ? "Bật Dark Mode" : "Bật Light Mode"}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            {/* User Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", borderLeft: "1px solid var(--border)", paddingLeft: "1rem" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "var(--bg-elevated-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent-gold)",
                }}
              >
                <User size={16} />
              </div>
              <span style={{ fontSize: "0.85rem", fontWeight: 550 }} className="desktop-only">
                User
              </span>
            </div>
          </div>
        </header>

        {/* 3. Main Page Body */}
        <main className="sublingo-content" style={{ flex: 1, padding: "24px 32px 32px", display: "flex", flexDirection: "column", gap: "2rem" }}>
          {children}
        </main>

        {/* 4. Common Footer */}
        <footer
          style={{
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border)",
            padding: "1.5rem 2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
          }}
        >
          <div>
            <span>© {new Date().getFullYear()} SubLingo. </span>
            <span>{uiLang === "vi" ? "Mọi quyền được bảo lưu." : "All rights reserved."}</span>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
              {uiLang === "vi" ? "Điều khoản" : "Terms"}
            </a>
            <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
              {uiLang === "vi" ? "Bảo mật" : "Privacy"}
            </a>
            <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
              {uiLang === "vi" ? "Liên hệ" : "Contact"}
            </a>
          </div>
        </footer>
      </div>

      {/* Gemini Modal */}
      {isGeminiKeyModalOpen && (
        <GeminiKeyModal
          isOpen={isGeminiKeyModalOpen}
          onClose={() => setIsGeminiKeyModalOpen(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
};
