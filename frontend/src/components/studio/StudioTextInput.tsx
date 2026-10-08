import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { FileUp, CheckCircle2, UploadCloud } from "lucide-react";
import { NON_VERBAL_SYMBOLS } from "../../constants/studio";
import { parseScriptFile } from "../../utils/scriptImporter";
import type { PauseSettings, PronunciationWord } from "../../store/useTTSStore";

interface StudioTextInputProps {
  text: string;
  onChangeText: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onOpenPauseModal?: () => void;
  onOpenPronunciationModal?: () => void;
  pauseSettings?: PauseSettings;
  pronunciationWords?: PronunciationWord[];
  isLoading: boolean;
  elapsedTime: number;
  generationProgress: { current: number; total: number };
  onClearSession?: () => void;
  blocksCount?: number;
}

export const StudioTextInput: React.FC<StudioTextInputProps> = ({
  text,
  onChangeText,
  textareaRef,
  onOpenPauseModal: _onOpenPauseModal,
  onOpenPronunciationModal: _onOpenPronunciationModal,
  pauseSettings: _pauseSettings,
  pronunciationWords: _pronunciationWords,
  isLoading,
  elapsedTime,
  generationProgress,
  onClearSession,
  blocksCount = 0,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isSavedRecently, setIsSavedRecently] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialCheckDoneRef = useRef(false);

  // ── Khôi phục mốc thời gian lưu gần nhất khi mount ────────────────────────
  useEffect(() => {
    if (initialCheckDoneRef.current) return;
    initialCheckDoneRef.current = true;

    try {
      const savedTimeStr = localStorage.getItem("tts_draft_last_saved");
      if (savedTimeStr) {
        const timeNum = parseInt(savedTimeStr, 10);
        if (!isNaN(timeNum)) {
          const date = new Date(timeNum);
          const formatted = date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          setLastSavedTime(formatted);
        }
      }
    } catch {}
  }, []);

  // ── Tự động lưu bản nháp (Auto-Save Debounce 1.2s) ─────────────────────────
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (!text.trim()) return;

    autoSaveTimerRef.current = setTimeout(() => {
      try {
        const now = Date.now();
        localStorage.setItem("tts_draft_last_saved", now.toString());
        const timeStr = new Date(now).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        setLastSavedTime(timeStr);
        setIsSavedRecently(true);
        setTimeout(() => setIsSavedRecently(false), 2000);
      } catch {}
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [text]);

  const handleManualSaveDraft = () => {
    try {
      const now = Date.now();
      localStorage.setItem("tts_draft_last_saved", now.toString());
      const timeStr = new Date(now).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLastSavedTime(timeStr);
      setIsSavedRecently(true);
      toast.success(`Đã lưu an toàn bản nháp kịch bản (${timeStr})!`);
      setTimeout(() => setIsSavedRecently(false), 2000);
    } catch {
      toast.error("Không thể lưu bản nháp vào bộ nhớ trình duyệt.");
    }
  };

  // ── Xử lý file kịch bản được nạp (.txt, .docx, .md) ──────────────────────
  const handleProcessFile = async (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (!["txt", "docx", "md"].includes(ext)) {
      toast.error(
        `Định dạng .${ext} chưa được hỗ trợ. Vui lòng chọn file .txt, .docx hoặc .md.`,
      );
      return;
    }

    setIsParsingFile(true);
    const toastId = toast.loading(`Đang đọc file kịch bản "${file.name}"...`);

    try {
      const parsed = await parseScriptFile(file);

      // Nếu ô text hiện tại đang có dữ liệu: hỏi người dùng Thay thế hay Nối tiếp
      if (text.trim().length > 0) {
        toast.dismiss(toastId);
        toast(`Nạp thành công "${parsed.filename}" (${parsed.wordCount} từ)`, {
          description:
            "Kịch bản hiện tại đang có nội dung. Bạn muốn Thay thế hay Nối tiếp vào cuối?",
          duration: 8000,
          action: {
            label: "Thay thế kịch bản",
            onClick: () => {
              onChangeText(parsed.text);
              toast.success(
                `Đã thay thế kịch bản bằng nội dung file "${parsed.filename}"`,
              );
            },
          },
          cancel: {
            label: "Nối tiếp vào cuối",
            onClick: () => {
              const updated = text.trim() + "\n\n" + parsed.text;
              onChangeText(updated);
              toast.success(
                `Đã nối thêm ${parsed.wordCount} từ vào cuối kịch bản hiện tại!`,
              );
            },
          },
        });
      } else {
        onChangeText(parsed.text);
        toast.success(
          `Đã nạp thành công kịch bản từ "${parsed.filename}" (${parsed.wordCount} từ • ${parsed.charCount} ký tự)!`,
          { id: toastId },
        );
      }
    } catch (err: any) {
      toast.error(
        `Lỗi nạp file: ${err?.message || "Không thể đọc nội dung file"}`,
        { id: toastId },
      );
    } finally {
      setIsParsingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Sự kiện Drag & Drop ───────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Chỉ tắt dragover khi rời khỏi container cha
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await handleProcessFile(file);
    }
  };

  const handleInsertSymbol = (symbol: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChangeText((text ? text + " " : "") + symbol);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const spacerBefore = before.length > 0 && !before.endsWith(" ") ? " " : "";
    const spacerAfter = after.length > 0 && !after.startsWith(" ") ? " " : " ";
    const newText = before + spacerBefore + symbol + spacerAfter + after;
    onChangeText(newText);
    setTimeout(() => {
      textarea.focus();
      const newPos =
        start + spacerBefore.length + symbol.length + spacerAfter.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <div className="flex flex-col gap-3 2k:gap-4 z-10">
      {/* ── Input Header & Actions ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 2k:w-8 2k:h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[17px] 2k:text-[19px]">
              edit_document
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <label
              htmlFor="script-input"
              className="font-label-caps text-xs 2k:text-sm font-bold uppercase tracking-wider text-on-surface whitespace-nowrap cursor-pointer"
            >
              Văn bản đầu vào
            </label>
            <span className="hidden sm:inline-block text-[11px] text-on-surface-variant/60 truncate">
              • Nhập trực tiếp hoặc kéo thả file
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Nút Làm bài mới (hiển thị khi đang có nội dung kịch bản hoặc phân đoạn) */}
          {onClearSession && (text.trim().length > 0 || blocksCount > 0) && (
            <button
              type="button"
              onClick={onClearSession}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-label-caps bg-surface-dim hover:bg-rose-500/15 text-on-surface-variant hover:text-rose-400 border border-white/10 hover:border-rose-500/30 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap cursor-pointer group"
              title="Làm mới để bắt đầu kịch bản mới"
            >
              <FileUp className="w-3.5 h-3.5 text-rose-400/80" />
              <span>Làm bài mới</span>
            </button>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx,.md"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleProcessFile(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          {/* Nút Nạp Kịch Bản (.txt, .docx, .md) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsingFile}
            className="px-3 py-1.5 rounded-lg text-xs font-label-caps bg-surface-dim hover:bg-primary/20 text-on-surface hover:text-primary border border-white/10 hover:border-primary/30 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0 whitespace-nowrap group cursor-pointer"
            title="Nạp file kịch bản (.txt, .docx, .md) từ máy tính"
          >
            {isParsingFile ? (
              <span className="material-symbols-outlined text-[14px] animate-spin text-primary">
                sync
              </span>
            ) : (
              <FileUp className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="font-medium">Nạp file kịch bản</span>
          </button>
        </div>
      </div>

      {/* ── Non-verbal symbols & Emotion Toolbar ─────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-surface-dim/60 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 text-xs font-label-caps text-on-surface-variant shrink-0">
          <span className="material-symbols-outlined text-[16px] 2k:text-[18px] text-amber-400">
            sentiment_satisfied
          </span>
          <span className="font-semibold text-on-surface-variant text-[11px] 2k:text-xs uppercase tracking-wider whitespace-nowrap">
            Thẻ biểu cảm:
          </span>
        </div>

        {/* Dải nút biểu cảm cảm xúc (vừa vặn, cuộn ngang mượt mà nếu màn hình cực hẹp) */}
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5 min-w-0">
          {NON_VERBAL_SYMBOLS.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleInsertSymbol(s.tag)}
              className="px-2 2k:px-2.5 py-0.5 2k:py-1 rounded-lg text-[11px] 2k:text-xs font-label-caps bg-surface-container/70 hover:bg-primary/20 text-on-surface hover:text-primary border border-white/5 hover:border-primary/30 transition-all flex items-center gap-1 shadow-sm active:scale-95 whitespace-nowrap shrink-0 group cursor-pointer"
              title={`Chèn thẻ ${s.tag} vào vị trí con trỏ`}
            >
              <span className="text-[12px] 2k:text-[13px] group-hover:scale-110 transition-transform">
                {s.emoji}
              </span>
              <span className="font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Textarea Area với Drag & Drop ──────────────────────────────────── */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative w-full rounded-xl 2k:rounded-2xl"
      >
        <textarea
          ref={textareaRef as any}
          id="script-input"
          className={`w-full h-56 2k:h-72 bg-slate-950/45 backdrop-blur-xl border rounded-xl 2k:rounded-2xl p-5 2k:p-6 text-on-surface text-sm 2k:text-base 2k:leading-relaxed focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 transition-all resize-none placeholder:text-on-surface-variant/50 font-body-md shadow-[inset_0_2px_10px_rgba(0,0,0,0.35)] ${
            isDraggingOver
              ? "border-cyan-400 ring-2 ring-cyan-400/40 bg-cyan-500/10"
              : "border-white/10 hover:border-white/20"
          }`}
          placeholder="Nhập nội dung cần chuyển thành giọng nói tại đây... Hoặc kéo thả file kịch bản (.txt, .docx, .md) vào đây để nạp tự động."
          value={text}
          onChange={(e) => onChangeText(e.target.value)}
        ></textarea>

        {/* Drag overlay feedback */}
        {isDraggingOver && (
          <div className="absolute inset-0 rounded-xl 2k:rounded-2xl bg-black/75 backdrop-blur-sm border-2 border-dashed border-primary flex flex-col items-center justify-center gap-2 pointer-events-none animate-in fade-in duration-200 z-20">
            <UploadCloud className="w-10 h-10 text-primary animate-bounce" />
            <p className="text-sm font-label-caps text-primary font-bold">
              Thả file .txt, .docx, .md vào đây để nạp kịch bản
            </p>
            <span className="text-xs text-on-surface-variant/80">
              Hệ thống sẽ tự động bóc tách nội dung văn bản sạch
            </span>
          </div>
        )}
      </div>

      {/* ── Footer Bar: Badges, Auto-Save Status, Char Counter ─────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-secondary/10 px-2.5 2k:px-3 py-1 2k:py-1.5 font-label-caps text-[10px] 2k:text-xs uppercase text-secondary ring-1 ring-inset ring-secondary/20">
            600+ Ngôn ngữ
          </span>
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 2k:px-3 py-1 2k:py-1.5 font-label-caps text-[10px] 2k:text-xs uppercase text-primary ring-1 ring-inset ring-primary/20">
            OmniVoice 24kHz
          </span>

          {/* Auto-save Status Indicator */}
          {text.trim().length > 0 && (
            <button
              type="button"
              onClick={handleManualSaveDraft}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono-data border transition-all cursor-pointer ${
                isSavedRecently
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "bg-white/5 border-white/10 text-on-surface-variant/70 hover:text-on-surface hover:bg-white/10"
              }`}
              title="Bản nháp được lưu tự động trên trình duyệt. Bấm để lưu ngay."
            >
              {isSavedRecently ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 animate-in zoom-in-50" />
                  <span>Đã lưu nháp</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shrink-0" />
                  <span>
                    {lastSavedTime ? `Đã lưu ${lastSavedTime}` : "Đã lưu nháp"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {text.trim().length > 0 && (
            <span className="text-[11px] font-mono-data text-on-surface-variant/60">
              {text.trim().split(/\s+/).filter(Boolean).length} từ
            </span>
          )}
          <span
            className={`font-mono-data text-mono-data text-xs 2k:text-sm ${
              text.length > 4500 ? "text-error" : "text-on-surface-variant"
            }`}
          >
            {text.length} / 5000 chars
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3 mt-2 animate-in fade-in zoom-in-95 bg-primary/5 border border-primary/20 rounded-xl p-4 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
          <div className="flex justify-between items-center">
            <span className="text-sm font-label-caps text-primary flex items-center gap-3">
              <span className="material-symbols-outlined animate-spin text-[20px]">
                progress_activity
              </span>
              {generationProgress.total > 1
                ? `Đang tổng hợp phân đoạn (${generationProgress.current}/${generationProgress.total})...`
                : "Đang xử lý âm thanh..."}
            </span>
            <div className="flex items-center gap-2 bg-surface-dim px-3 py-1.5 rounded-lg border border-primary/20">
              <span className="material-symbols-outlined text-[16px] text-primary">
                timer
              </span>
              <span className="text-sm font-mono-data text-primary">
                {String(Math.floor(elapsedTime / 60)).padStart(2, "0")}:
                {String(elapsedTime % 60).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
