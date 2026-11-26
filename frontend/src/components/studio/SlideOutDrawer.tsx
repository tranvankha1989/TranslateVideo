import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface SlideOutDrawerProps {
  /** Chữ trên tay nắm, ví dụ "Cài đặt mô hình" */
  label: string;
  /** Tên biểu tượng Material Symbols trên tay nắm */
  icon?: string;
  /** Mở mà không thao tác trong khung (và chuột không nằm trên khung) quá thời gian này thì tự trượt vào */
  autoHideMs?: number;
  children: React.ReactNode;
}

// Khung trượt bên phải màn hình: lúc ẩn chỉ chừa tay nắm dọc sát mép phải; bấm tay nắm để trượt ra / vào.
// Hiển thị qua portal vào <body> để vị trí "fixed" không bị khung cha (transform / backdrop-filter) giữ lại.
export const SlideOutDrawer: React.FC<SlideOutDrawerProps> = ({
  label,
  icon = "tune",
  autoHideMs = 8000,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const hovered = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      // Chuột còn nằm trên khung thì chưa ẩn, hẹn lại
      if (hovered.current) {
        scheduleHide();
        return;
      }
      setOpen(false);
    }, autoHideMs);
  }, [autoHideMs]);

  useEffect(() => {
    if (open) scheduleHide();
    else window.clearTimeout(timer.current);
    return () => window.clearTimeout(timer.current);
  }, [open, scheduleHide]);

  // Mỗi lần thao tác trong khung thì tính lại thời gian tự ẩn
  const poke = () => {
    if (open) scheduleHide();
  };

  return createPortal(
    <div
      className={`fixed right-0 top-4 bottom-4 z-40 flex items-center pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
        open ? "translate-x-0" : "translate-x-[calc(100%_-_40px)]"
      }`}
      onMouseEnter={() => {
        hovered.current = true;
      }}
      onMouseLeave={() => {
        hovered.current = false;
        poke();
      }}
      onPointerDown={poke}
      onWheel={poke}
      onInput={poke}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        else poke();
      }}
    >
      {/* Tay nắm: bấm để trượt khung ra / vào */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? `Thu gọn ${label}` : `Mở ${label}`}
        className="pointer-events-auto shrink-0 w-10 py-5 rounded-l-2xl bg-surface-dim/95 hover:bg-surface-variant border border-r-0 border-white/15 shadow-xl flex flex-col items-center gap-2.5 text-primary cursor-pointer transition-colors"
      >
        <span
          className={`material-symbols-outlined text-[20px] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          {open ? "chevron_left" : icon}
        </span>
        <span className="text-xs font-semibold tracking-wide text-on-surface [writing-mode:vertical-rl] rotate-180 select-none">
          {label}
        </span>
      </button>

      {/* Nội dung khung (cuộn được khi dài hơn màn hình) */}
      <div className="vt-drawer-panel pointer-events-auto max-h-full w-[380px] 2k:w-[440px] overflow-y-auto overscroll-contain hide-scrollbar pr-3">
        {children}
      </div>
    </div>,
    document.body,
  );
};
