"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clapperboard,
  Subtitles,
  Volume2,
  ChevronRight,
  Sun,
  Moon,
  Globe,
  User,
  Key,
  Combine,
  Smartphone,
  BookOpen,
  Menu,
  X,
} from "lucide-react";
import { useSubLingo } from "@/context/SubLingoContext";
import { GeminiKeyModal } from "./GeminiKeyModal";

export const ClientLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const {
    uiLang,
    setUiLang,
    theme,
    setTheme,
    isGeminiKeyModalOpen,
    setIsGeminiKeyModalOpen,
    showToast,
  } = useSubLingo();

  // Check mobile screen size on mount & resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prefetch all routes in background for 0ms transitions
  useEffect(() => {
    ["/editor", "/convert-ratio", "/tts", "/merge", "/reader"].forEach((path) => {
      router.prefetch(path);
    });
  }, [router]);

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const navigationItems = [
    {
      href: "/reader",
      label: uiLang === "vi" ? "Đọc sách 3D & Audio AI" : "3D Book Reader & Audio AI",
      shortLabel: "Đọc Sách",
      icon: BookOpen,
      isPrimary: true,
    },
    {
      href: "/editor",
      label: uiLang === "vi" ? "Trình soạn thảo Phụ đề (Local)" : "Subtitle Editor (Local)",
      shortLabel: "Soạn thảo",
      icon: Subtitles,
    },
    {
      href: "/tts",
      label: uiLang === "vi" ? "Tạo giọng đọc AI (Local)" : "Text to Speech (Local)",
      shortLabel: "Giọng AI",
      icon: Volume2,
    },
    {
      href: "/convert-ratio",
      label: uiLang === "vi" ? "Biến đổi 16:9 ➔ 9:16 (Local)" : "Convert 16:9 to 9:16",
      shortLabel: "9:16 Reel",
      icon: Smartphone,
    },
    {
      href: "/merge",
      label: uiLang === "vi" ? "Ghép nhiều video (Local)" : "Merge Videos (Local)",
      shortLabel: "Ghép Video",
      icon: Combine,
    },
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
      {/* 1. Desktop Sidebar Rail */}
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

      {/* 2. Mobile Offcanvas Navigation Drawer */}
      {isMobileMenuOpen && (
        <>
          <div className="mobile-drawer-overlay" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="mobile-drawer">
            <div
              style={{
                height: "60px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 1.25rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Clapperboard size={22} style={{ color: "var(--accent-gold)" }} />
                <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>SubLingo AI</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  padding: "0.4rem",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <nav style={{ flex: 1, padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {navigationItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "var(--radius-sm)",
                      color: isActive ? "var(--accent-gold)" : "var(--text)",
                      background: isActive ? "var(--accent-soft)" : "transparent",
                      textDecoration: "none",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: "0.95rem",
                    }}
                  >
                    <item.icon size={18} style={{ flexShrink: 0 }} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsGeminiKeyModalOpen(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--accent-gold)",
                    background: "var(--accent-soft)",
                    border: "none",
                    width: "100%",
                    fontWeight: 650,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  <Key size={18} style={{ flexShrink: 0 }} />
                  <span>Cấu hình Gemini API Key</span>
                </button>
              </div>
            </nav>
          </div>
        </>
      )}

      {/* 3. Right Column Content Area */}
      <div
        className="sublingo-layout-content"
        style={{
          flex: 1,
          marginLeft: isMobile ? "0px" : sidebarWidth,
          width: isMobile ? "100%" : `calc(100% - ${sidebarWidth})`,
          maxWidth: "100vw",
          transition: "margin-left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflowX: "hidden",
        }}
      >
        {/* Top Header */}
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
          {/* Left: Mobile Hamburger & Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="mobile-only"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                padding: "0.4rem",
                cursor: "pointer",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Mở menu"
            >
              <Menu size={22} />
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: 0 }}>
              <span
                style={{
                  fontSize: "0.95rem",
                  color: "var(--text)",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {(pathname === "/" || pathname === "/reader") && (uiLang === "vi" ? "SubLingo Reader • Đọc Sách 3D & Audio AI" : "SubLingo Reader • 3D Book & Audio AI")}
                {pathname === "/editor" && (uiLang === "vi" ? "Trình soạn thảo Phụ đề (Local)" : "Subtitle Editor (Local)")}
                {pathname === "/tts" && (uiLang === "vi" ? "Tạo giọng đọc AI (Local)" : "Text to Speech (Local)")}
                {pathname === "/merge" && (uiLang === "vi" ? "Ghép nối video (Local)" : "Merge Videos (Local)")}
                {pathname === "/convert-ratio" && (uiLang === "vi" ? "Biến đổi 16:9 ➔ 9:16 (Local)" : "Convert 16:9 to 9:16 (Local)")}
                {pathname === "/extract" && (uiLang === "vi" ? "Trích xuất phụ đề" : "Extract Subtitle")}
              </span>
              <span
                className="desktop-only"
                style={{ fontSize: "0.78rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {(pathname === "/" || pathname === "/reader")
                  ? (uiLang === "vi" ? "Đọc sách PDF, lật trang 3D, nghe giọng đọc Ngọc Huyền Pro & Hoài My" : "PDF Book reading, 3D flip, Ngoc Huyen Pro & Hoai My Audio AI")
                  : (uiLang === "vi" ? "Công cụ xử lý Studio Media trên máy tính" : "Local Studio Media Processing Tools")}
              </span>
            </div>
          </div>

          {/* Right Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
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
                gap: "0.3rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                padding: "0.4rem",
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
                padding: "0.4rem",
                display: "flex",
                alignItems: "center",
                borderRadius: "var(--radius-xs)",
              }}
              title={theme === "light" ? "Bật Dark Mode" : "Bật Light Mode"}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            {/* User Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", borderLeft: "1px solid var(--border)", paddingLeft: "0.75rem" }}>
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: "var(--bg-elevated-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent-gold)",
                }}
              >
                <User size={15} />
              </div>
              <span style={{ fontSize: "0.85rem", fontWeight: 550 }} className="desktop-only">
                User
              </span>
            </div>
          </div>
        </header>

        {/* Main Page Body */}
        <main className="sublingo-content" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </main>

        {/* Common Footer */}
        <footer
          style={{
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
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
          </div>
        </footer>
      </div>

      {/* 4. Mobile Quick Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        {navigationItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-tab ${isActive ? "active" : ""}`}
            >
              <item.icon size={20} />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

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

