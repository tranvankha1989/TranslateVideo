import React, { useRef } from "react";
import {
  Palette,
  Type,
  FileUp,
  MoveVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SYSTEM_FONTS, type StyleConfig, type CaptionSegment } from "../types";

interface StyleControlsProps {
  style: StyleConfig;
  setStyle: React.Dispatch<React.SetStateAction<StyleConfig>>;
  customFonts: string[];
  onCustomFontUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  currentSegmentY: number;
  activeSegment: CaptionSegment | null;
  onUpdateSegmentPositionY: (segId: number, posY: number) => void;
  onResetSegmentPosition: (segId: number) => void;
  onApplyPositionToAll: (posY: number) => void;
  withHeader?: boolean;
}

export const StyleControls: React.FC<StyleControlsProps> = ({
  style,
  setStyle,
  customFonts,
  onCustomFontUpload,
  currentSegmentY,
  activeSegment,
  onUpdateSegmentPositionY,
  onResetSegmentPosition,
  onApplyPositionToAll,
  withHeader = true,
}) => {
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col space-y-4 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 flex-1">
      {withHeader && (
        <div className="flex items-center justify-between pb-2 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-on-surface">
              Kiểu dáng Chữ Kinetic
            </h3>
          </div>
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
            Tự động Karaoke
          </span>
        </div>
      )}

      {/* Font Family Selection */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-primary" />
            Font chữ ({SYSTEM_FONTS.length + customFonts.length})
          </label>

          <input
            type="file"
            ref={fontInputRef}
            onChange={onCustomFontUpload}
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
          />
          <button
            onClick={() => fontInputRef.current?.click()}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline font-medium cursor-pointer"
          >
            <FileUp className="w-3 h-3" />
            Tải Font riêng
          </button>
        </div>

        <div className="grid grid-cols-1 gap-1.5 max-h-[170px] overflow-y-auto pr-1">
          {customFonts.map((name) => (
            <button
              key={name}
              onClick={() => setStyle({ ...style, font_name: name })}
              className={cn(
                "p-2 rounded-lg border text-xs text-left transition flex items-center justify-between cursor-pointer",
                style.font_name === name
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-surface-variant/20 border-white/10 text-on-surface hover:bg-surface-variant/40",
              )}
              style={{ fontFamily: name }}
            >
              <span className="truncate">{name}</span>
              <span className="text-[8px] bg-primary/20 text-primary px-1 py-0.5 rounded">
                Custom
              </span>
            </button>
          ))}

          {SYSTEM_FONTS.map((f) => (
            <button
              key={f.name}
              onClick={() => setStyle({ ...style, font_name: f.name })}
              className={cn(
                "p-2 rounded-lg border text-xs text-left transition truncate cursor-pointer",
                style.font_name === f.name
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-surface-variant/20 border-white/10 text-on-surface hover:bg-surface-variant/40",
              )}
              style={{ fontFamily: f.name }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size Slider */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-on-surface-variant">
            Cỡ chữ ({style.font_size}px)
          </span>
        </div>
        <input
          type="range"
          min="16"
          max="60"
          value={style.font_size}
          onChange={(e) =>
            setStyle({
              ...style,
              font_size: Number(e.target.value),
            })
          }
          className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
        />
      </div>

      {/* Y Position Controls */}
      <div className="space-y-2 p-2.5 rounded-xl bg-surface-variant/20 border border-white/10 shrink-0">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-on-surface flex items-center gap-1.5">
            <MoveVertical className="w-3.5 h-3.5 text-primary" />
            Vị trí phụ đề (Y: {currentSegmentY}%)
          </span>
          {activeSegment && (
            <div className="flex items-center gap-1">
              {activeSegment.customPositionY !== undefined ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Đoạn #{activeSegment.id} riêng
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-on-surface-variant">
                  Mặc định chung
                </span>
              )}
            </div>
          )}
        </div>

        <input
          type="range"
          min="10"
          max="90"
          value={currentSegmentY}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (activeSegment) {
              onUpdateSegmentPositionY(activeSegment.id, val);
            } else {
              setStyle({ ...style, position_y: val });
            }
          }}
          className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
        />

        {/* Presets Trên / Giữa / Dưới */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              if (activeSegment) {
                onUpdateSegmentPositionY(activeSegment.id, 15);
              } else {
                setStyle({ ...style, position_y: 15 });
              }
            }}
            className={cn(
              "py-1 px-1.5 rounded-md text-[10px] font-medium border transition text-center flex items-center justify-center gap-1 cursor-pointer",
              currentSegmentY === 15
                ? "bg-primary/20 border-primary text-primary"
                : "bg-surface-variant/30 border-white/5 text-on-surface-variant hover:bg-surface-variant/60",
            )}
            title="Đặt phụ đề ở phía trên video"
          >
            <ArrowUp className="w-2.5 h-2.5" />
            Trên (15%)
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeSegment) {
                onUpdateSegmentPositionY(activeSegment.id, 50);
              } else {
                setStyle({ ...style, position_y: 50 });
              }
            }}
            className={cn(
              "py-1 px-1.5 rounded-md text-[10px] font-medium border transition text-center flex items-center justify-center gap-1 cursor-pointer",
              currentSegmentY === 50
                ? "bg-primary/20 border-primary text-primary"
                : "bg-surface-variant/30 border-white/5 text-on-surface-variant hover:bg-surface-variant/60",
            )}
            title="Đặt phụ đề ở chính giữa video"
          >
            Giữa (50%)
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeSegment) {
                onUpdateSegmentPositionY(activeSegment.id, 85);
              } else {
                setStyle({ ...style, position_y: 85 });
              }
            }}
            className={cn(
              "py-1 px-1.5 rounded-md text-[10px] font-medium border transition text-center flex items-center justify-center gap-1 cursor-pointer",
              currentSegmentY === 85
                ? "bg-primary/20 border-primary text-primary"
                : "bg-surface-variant/30 border-white/5 text-on-surface-variant hover:bg-surface-variant/60",
            )}
            title="Đặt phụ đề ở phía dưới video"
          >
            <ArrowDown className="w-2.5 h-2.5" />
            Dưới (85%)
          </button>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
          {activeSegment && activeSegment.customPositionY !== undefined ? (
            <button
              type="button"
              onClick={() => onResetSegmentPosition(activeSegment.id)}
              className="flex items-center gap-1 text-amber-400/90 hover:text-amber-300 transition cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Khôi phục đoạn này
            </button>
          ) : (
            <span className="text-white/40 text-[9px]">
              Kéo thả trên video để chỉnh
            </span>
          )}

          <button
            type="button"
            onClick={() => onApplyPositionToAll(currentSegmentY)}
            className="flex items-center gap-1 text-primary hover:text-primary-fixed-dim transition ml-auto font-medium cursor-pointer"
            title="Áp dụng vị trí này cho toàn bộ các câu trong video"
          >
            <CheckCheck className="w-2.5 h-2.5" />
            Áp dụng tất cả
          </button>
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-2.5 shrink-0">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Màu chữ gốc
          </label>
          <div className="flex items-center gap-2 p-1.5 bg-surface-variant/30 rounded-lg border border-white/10">
            <input
              type="color"
              value={style.primary_color}
              onChange={(e) =>
                setStyle({
                  ...style,
                  primary_color: e.target.value,
                })
              }
              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
            />
            <span className="text-[11px] font-mono text-on-surface">
              {style.primary_color}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Highlight Karaoke
          </label>
          <div className="flex items-center gap-2 p-1.5 bg-surface-variant/30 rounded-lg border border-white/10">
            <input
              type="color"
              value={style.highlight_color}
              onChange={(e) =>
                setStyle({
                  ...style,
                  highlight_color: e.target.value,
                })
              }
              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
            />
            <span className="text-[11px] font-mono text-on-surface">
              {style.highlight_color}
            </span>
          </div>
        </div>
      </div>

      {/* Outline Color & Size */}
      <div className="space-y-2 shrink-0">
        <div className="flex justify-between items-center text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-on-surface-variant">
            Viền chữ ({style.outline_size}px)
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={style.outline_color}
              onChange={(e) =>
                setStyle({
                  ...style,
                  outline_color: e.target.value,
                })
              }
              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0"
            />
            <span className="font-mono text-[10px] text-on-surface-variant">
              {style.outline_color}
            </span>
          </div>
        </div>
        <input
          type="range"
          min="1"
          max="8"
          value={style.outline_size}
          onChange={(e) =>
            setStyle({
              ...style,
              outline_size: Number(e.target.value),
            })
          }
          className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
        />
      </div>
    </div>
  );
};
