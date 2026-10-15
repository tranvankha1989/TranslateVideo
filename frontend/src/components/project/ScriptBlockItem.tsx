import { useState, useRef, useEffect, type ChangeEvent } from "react";
import {
  Play,
  Square,
  Sparkles,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
} from "lucide-react";
import type { ScriptBlock, Voice } from "../../store/useTTSStore";
import { downloadAudioFile } from "../../utils/download";

interface ScriptBlockItemProps {
  block: ScriptBlock;
  index: number;
  total: number;
  voices: Voice[];
  isPlaying?: boolean;
  isHighlighted?: boolean;
  onSeekToThisBlock?: () => void;
  onPlay: () => void;
  onStop: () => void;
  onUpdate: (updated: Partial<ScriptBlock>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertBelow: () => void;
  onRender: () => void;
}

export function ScriptBlockItem({
  block,
  index,
  total,
  voices,
  isPlaying,
  isHighlighted = false,
  onSeekToThisBlock,
  onPlay,
  onStop,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertBelow,
  onRender,
}: ScriptBlockItemProps) {
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea theo nội dung gọn gàng
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(28, textareaRef.current.scrollHeight)}px`;
    }
  }, [block.text]);

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    onUpdate({
      text: newText,
      status: block.status === "ready" ? "idle" : block.status,
    });
  };

  const handleVoiceChange = (voiceId: string) => {
    const v = voices.find((item) => item.id === voiceId);
    onUpdate({
      voiceId,
      voiceName: v ? v.name : "Mặc định",
      status: block.status === "ready" ? "idle" : block.status,
    });
  };

  const isRendering = block.status === "rendering";
  const isReady = block.status === "ready" && !!block.audioUrl;
  const isError = block.status === "error";

  return (
    <div
      id={`studio-block-${block.id}`}
      className={`group relative flex flex-col rounded-xl border transition-all duration-300 p-3 ${
        isPlaying
          ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-primary/40"
          : isHighlighted
            ? "border-primary bg-primary/15 shadow-[0_0_25px_rgba(245,158,11,0.25)] ring-2 ring-primary/60 scale-[1.008]"
            : isRendering
              ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/30"
              : "border-white/5 bg-surface-dim hover:border-white/15 hover:bg-surface-dim/90"
      }`}
    >
      {/* Row 1: Index tag + Text Input + Fast Action Tools */}
      <div className="flex items-start gap-2.5">
        {/* Index badge */}
        <button
          type="button"
          onClick={onSeekToThisBlock}
          disabled={!onSeekToThisBlock}
          title={onSeekToThisBlock ? "Nhấp để nhảy tới câu này trong Audio chính" : undefined}
          className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md font-mono-data text-[12px] font-bold transition-all ${
            isPlaying || isHighlighted
              ? "bg-primary text-black shadow-md scale-105"
              : "bg-surface-variant/80 text-on-surface-variant border border-white/5 hover:border-primary/40 hover:text-primary cursor-pointer"
          }`}
        >
          #{index + 1}
        </button>

        {/* Textarea gọn gàng */}
        <textarea
          ref={textareaRef}
          value={block.text}
          onChange={handleTextChange}
          disabled={isRendering}
          placeholder="Nhập nội dung cho phân đoạn câu này..."
          rows={1}
          className="flex-1 bg-transparent text-sm text-on-surface leading-snug placeholder:text-on-surface-variant/40 focus:outline-none resize-none font-body-md py-0.5 disabled:opacity-60"
        />

        {/* Quick actions (Reorder & Delete) */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={index === 0 || isRendering}
            className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-15 disabled:cursor-not-allowed"
            title="Di chuyển lên"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1 || isRendering}
            className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-15 disabled:cursor-not-allowed"
            title="Di chuyển xuống"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={isRendering}
            className="w-6 h-6 rounded hover:bg-rose-500/20 text-on-surface-variant hover:text-rose-400 flex items-center justify-center transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            title="Xóa phân đoạn này"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row 2: Streamlined Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
        {/* Left: Status & Voice & Timing */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Badge */}
          {isRendering ? (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400 font-mono-data font-medium bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              Đang render...
            </span>
          ) : isReady ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono-data">
              <CheckCircle2 className="w-3 h-3" />
              Sẵn sàng {block.duration ? `(${block.duration.toFixed(1)}s)` : ""}
            </span>
          ) : isError ? (
            <span
              className="flex items-center gap-1 text-[11px] text-rose-400 font-mono-data"
              title={block.error || "Lỗi render"}
            >
              <AlertCircle className="w-3 h-3" />
              Lỗi
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-on-surface-variant/60 font-mono-data">
              <Clock className="w-3 h-3" />
              Chờ render
            </span>
          )}

          {isHighlighted && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono-data font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full border border-primary/30 animate-pulse shadow-sm">
              <span className="material-symbols-outlined text-[13px] animate-bounce">
                volume_up
              </span>
              Đang phát
            </span>
          )}

          <div className="h-3 w-[1px] bg-white/10 hidden sm:block"></div>

          {/* Voice Dropdown gọn */}
          <div className="flex items-center gap-1 bg-surface border border-white/10 rounded-lg px-2 py-1 shadow-sm">
            <span className="material-symbols-outlined text-primary text-[15px]">
              record_voice_over
            </span>
            <select
              value={block.voiceId || ""}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="bg-transparent text-[11px] text-on-surface font-medium focus:outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="" className="bg-surface-dim text-on-surface">
                Mặc định
              </option>
              {voices.map((v) => (
                <option
                  key={v.id}
                  value={v.id}
                  className="bg-surface-dim text-on-surface"
                >
                  {v.name} ({v.gender === "female" ? "Nữ" : "Nam"})
                </option>
              ))}
            </select>
          </div>

          {/* Pause After Control gọn */}
          <div
            className="flex items-center gap-1 bg-surface border border-white/10 rounded-lg px-2 py-1 shadow-sm text-[11px] font-mono-data text-on-surface-variant"
            title="Khoảng lặng nghỉ sau câu này"
          >
            <span>Nghỉ:</span>
            <input
              type="number"
              min="0.0"
              max="5.0"
              step="0.05"
              value={block.pauseAfter}
              onChange={(e) =>
                onUpdate({
                  pauseAfter: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              className="min-w-12 max-w-15 bg-surface-dim text-center text-[11px] text-primary font-bold rounded px-0.5 py-0 border border-white/10 focus:outline-none"
            />
            <span>s</span>
          </div>

          {/* Tốc độ (Speed & Pitch) gọn */}
          <button
            type="button"
            onClick={() => setIsEditingSettings(!isEditingSettings)}
            className={`px-2 py-1 rounded-lg border text-[11px] font-mono-data transition-colors flex items-center gap-1 ${
              isEditingSettings
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-surface border-white/10 text-on-surface-variant hover:text-on-surface"
            }`}
            title="Tùy chỉnh tốc độ và cao độ câu này"
          >
            <span>{block.speed}x</span>
            <span className="text-[10px] opacity-60">
              {block.pitch >= 0 ? `+${block.pitch}` : block.pitch}st
            </span>
          </button>
        </div>

        {/* Right: Render & Play Controls gọn */}
        <div className="flex items-center gap-1.5">
          {isReady && (
            <>
              <button
                type="button"
                onClick={isPlaying ? onStop : onPlay}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-label-caps flex items-center gap-1 transition-all ${
                  isPlaying
                    ? "bg-primary text-black font-semibold shadow-sm"
                    : "bg-surface-variant text-on-surface hover:bg-white/10"
                }`}
                title={isPlaying ? "Dừng nghe" : "Nghe câu này"}
              >
                {isPlaying ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    Dừng
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current text-primary" />
                    Nghe thử
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  block.audioUrl && downloadAudioFile(block.audioUrl)
                }
                className="w-7 h-7 rounded-lg bg-surface hover:bg-white/10 text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors"
                title="Tải audio câu này"
              >
                <Download className="w-3 h-3" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onRender}
            disabled={isRendering || !block.text.trim()}
            className={`px-3 py-1 rounded-lg text-[11px] font-label-caps flex items-center gap-1.5 transition-all shadow-sm ${
              isRendering
                ? "bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium cursor-wait"
                : isReady
                  ? "bg-surface border border-white/10 text-on-surface-variant hover:text-on-surface hover:border-white/20"
                  : "bg-primary text-black font-semibold hover:shadow-md hover:shadow-primary/20"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isRendering ? "Đang xử lý tạo âm thanh câu này..." : isReady ? "Render lại câu này" : "Render câu này"}
          >
            {isRendering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="text-amber-300 font-semibold">Đang tạo...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                {isReady ? "Render lại" : "Render"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Settings (Speed & Pitch) */}
      {isEditingSettings && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-surface rounded-xl border border-white/5 animate-in fade-in duration-150">
          {/* Speed slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-on-surface-variant font-mono-data">
              <span>Tốc độ đọc (Speed)</span>
              <span className="text-primary font-bold">{block.speed}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={block.speed}
              onChange={(e) =>
                onUpdate({
                  speed: parseFloat(e.target.value),
                  status: block.status === "ready" ? "idle" : block.status,
                })
              }
              className="w-full accent-primary h-1.5 bg-surface-dim rounded cursor-pointer"
            />
          </div>

          {/* Pitch slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-on-surface-variant font-mono-data">
              <span>Cao độ (Pitch)</span>
              <span className="text-primary font-bold">
                {block.pitch >= 0 ? `+${block.pitch}` : block.pitch} st
              </span>
            </div>
            <input
              type="range"
              min="-12.0"
              max="12.0"
              step="0.5"
              value={block.pitch}
              onChange={(e) =>
                onUpdate({
                  pitch: parseFloat(e.target.value),
                  status: block.status === "ready" ? "idle" : block.status,
                })
              }
              className="w-full accent-primary h-1.5 bg-surface-dim rounded cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Insert Below Divider Button */}
      <div className="relative h-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 -mb-2.5">
        <button
          onClick={onInsertBelow}
          className="inline-flex items-center gap-1 bg-surface-variant hover:bg-primary hover:text-black text-on-surface-variant text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-white/10 shadow-md transition-all scale-90 hover:scale-100"
          title="Chèn thêm phân đoạn bên dưới"
        >
          <Plus className="w-3 h-3" />
          <span>Chèn đoạn</span>
        </button>
      </div>
    </div>
  );
}
