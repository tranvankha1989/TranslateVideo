import React from "react";

// Màn hình khởi động dùng chung (vòng xoay + phần trăm). Giao diện giống hệt trang chờ của
// electron/boot_splash.cjs và khung tĩnh trong index.html; CSS các lớp boot-* nằm trong index.html.
// Sửa giao diện thì sửa cả 3 nơi.
const SPOKES = Array.from({ length: 12 }, (_, i) => i);

export const BootSplash: React.FC<{ percent: number; text: string }> = ({
  percent,
  text,
}) => (
  <div className="boot-screen">
    <div className="boot-card">
      <div className="boot-spin-wrap">
        <svg
          className="boot-spinner"
          viewBox="0 0 80 80"
          fill="none"
          aria-hidden="true"
        >
          {SPOKES.map((i) => (
            <line
              key={i}
              x1="40"
              y1="4"
              x2="40"
              y2="14"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
              opacity={(1 - i * 0.08).toFixed(2)}
              transform={`rotate(${i * 30} 40 40)`}
            />
          ))}
        </svg>
        <div className="boot-pct">
          {Math.max(0, Math.min(100, Math.round(percent)))}%
        </div>
      </div>
      <h2 className="boot-title">VideoTranslate AI</h2>
      <p className="boot-sub">{text}</p>
    </div>
  </div>
);
