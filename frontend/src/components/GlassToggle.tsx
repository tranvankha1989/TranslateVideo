import { useState } from "react";
import { cn } from "@/lib/utils";

// Giao diện trong suốt (kính mờ): chỉ có khi vỏ Electron bật nền acrylic (User-Agent có "VTGlass", Windows 11 22H2+).
// Tắt = thêm lớp vt-glass-off vào <html> (index.css bỏ các quy tắc trong suốt), nhớ trong localStorage;
// index.html đọc lại trước khi vẽ nên mở app không bị chớp kính mờ.
const GLASS_OFF_KEY = "vt_glass_off";
const glassAvailable = (() => {
  try {
    return navigator.userAgent.indexOf("VTGlass") >= 0;
  } catch {
    return false;
  }
})();

// Công tắc gạt bật/tắt giao diện trong suốt (không chữ, chỉ có chú thích khi rê chuột)
export function GlassToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(
    () => !document.documentElement.classList.contains("vt-glass-off"),
  );
  if (!glassAvailable) return null;
  const toggle = () => {
    const next = !on;
    document.documentElement.classList.toggle("vt-glass-off", !next);
    try {
      if (next) localStorage.removeItem(GLASS_OFF_KEY);
      else localStorage.setItem(GLASS_OFF_KEY, "1");
    } catch {}
    setOn(next);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Giao diện trong suốt"
      title={on ? "Tắt giao diện trong suốt" : "Bật giao diện trong suốt"}
      onClick={toggle}
      className={cn(
        "relative shrink-0 w-10 h-[22px] rounded-full border transition-colors duration-200 cursor-pointer",
        on
          ? "bg-primary/70 border-primary/60"
          : "bg-white/10 border-white/15 hover:bg-white/15",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow transition-all duration-200",
          on ? "left-[20px]" : "left-[2px]",
        )}
      />
    </button>
  );
}
