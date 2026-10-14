import React from "react";
import {
  Video,
  Upload,
  Sparkles,
  FileText,
  FolderOpen,
  ClipboardPaste,
  Trash2,
  Sliders,
  Loader2,
  Wand2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type CaptionSegment } from "../types";

interface CaptionStepUploadProps {
  videoFile: File | null;
  videoUrl: string | null;
  videoDuration: number;
  isDraggingFile: boolean;
  setIsDraggingFile: (val: boolean) => void;
  videoInputRef: React.RefObject<HTMLInputElement | null>;
  handleProcessVideoFile: (file: File) => void;
  referenceScript: string;
  setReferenceScript: (val: string) => void;
  setIsLibraryModalOpen: (val: boolean) => void;
  whisperLanguage: string;
  setWhisperLanguage: (val: string) => void;
  whisperModel: "medium" | "small" | "base";
  setWhisperModel: (val: "medium" | "small" | "base") => void;
  handleTranscribe: () => void;
  isTranscribing: boolean;
  segments: CaptionSegment[];
  handleAlignScript: () => void;
  isAligningScript: boolean;
  onGoToNextStep: () => void;
}

export const CaptionStepUpload: React.FC<CaptionStepUploadProps> = ({
  videoFile,
  videoUrl,
  videoDuration,
  isDraggingFile,
  setIsDraggingFile,
  videoInputRef,
  handleProcessVideoFile,
  referenceScript,
  setReferenceScript,
  setIsLibraryModalOpen,
  whisperLanguage,
  setWhisperLanguage,
  whisperModel,
  setWhisperModel,
  handleTranscribe,
  isTranscribing,
  segments,
  handleAlignScript,
  isAligningScript,
  onGoToNextStep,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start animate-fadeIn">
      {/* Cột Trái: Chọn Video Dropzone & Preview */}
      <div className="lg:col-span-5 flex flex-col gap-3">
        <div className="bg-surface/80 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Video className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-on-surface">
                1. Chọn Video (.mp4 / .mov / .webm)
              </h2>
            </div>
            <p className="text-xs text-on-surface-variant">
              Video đã edit từ CapCut/Premiere có giọng đọc rõ ràng
            </p>
          </div>

          {videoFile ? (
            <div className="p-4 rounded-xl bg-surface-variant/30 border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/20 text-primary border border-primary/30">
                  <Video className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-on-surface truncate">
                    {videoFile.name}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                    {videoDuration > 0 && ` • ${videoDuration.toFixed(1)}s`}
                  </p>
                </div>
              </div>

              {videoUrl && (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 border border-white/10">
                  <video
                    src={videoUrl}
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                  />
                </div>
              )}

              <button
                onClick={() => videoInputRef.current?.click()}
                className="w-full py-2 rounded-lg bg-surface-variant/60 hover:bg-surface-variant border border-white/10 text-xs font-semibold text-on-surface transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Upload className="w-3.5 h-3.5 text-primary" />
                <span>Chọn video khác</span>
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleProcessVideoFile(file);
              }}
              onClick={() => videoInputRef.current?.click()}
              className={cn(
                "min-h-[220px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition cursor-pointer group",
                isDraggingFile
                  ? "border-primary bg-primary/10 scale-[1.01]"
                  : "border-white/15 hover:border-primary/50 bg-surface-variant/20 hover:bg-surface-variant/30",
              )}
            >
              <div className="p-3.5 rounded-2xl bg-primary/15 text-primary mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-on-surface">
                Kéo thả video vào đây hoặc nhấp để chọn
              </h3>
              <p className="text-xs text-on-surface-variant max-w-xs mt-1">
                Định dạng hỗ trợ: MP4, MOV, WEBM (Khuyên dùng video dọc 9:16)
              </p>
            </div>
          )}

          <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-[11px] text-on-surface-variant flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              Hệ thống sử dụng Whisper AI bóc tách giọng nói từng từ (word-level
              timestamps) và tự động chống câu cụt/vụn.
            </span>
          </div>
        </div>
      </div>

      {/* Cột Phải: Kịch Bản Đối Chiếu & Cấu Hình Whisper AI */}
      <div className="lg:col-span-7 flex flex-col gap-3">
        <div className="bg-surface/80 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-on-surface">
                  2. Kịch bản đọc đối chiếu (Khuyên dùng)
                </h2>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                  Chính xác 100%
                </span>
              </div>

              {/* Actions Kịch bản */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsLibraryModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  <FolderOpen className="w-3 h-3 text-amber-400" />
                  <span>Import từ Thư viện</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text.trim()) {
                        setReferenceScript(text);
                        toast.success("Đã dán kịch bản từ Clipboard!");
                      } else {
                        toast.error("Bộ nhớ tạm (Clipboard) đang trống!");
                      }
                    } catch {
                      toast.error(
                        "Vui lòng nhấn Ctrl+V trực tiếp vào ô để dán!",
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-variant/40 hover:bg-surface-variant border border-white/10 text-on-surface text-[11px] font-medium transition cursor-pointer"
                >
                  <ClipboardPaste className="w-3 h-3 text-primary" />
                  <span>Dán Clipboard</span>
                </button>

                {referenceScript.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setReferenceScript("");
                      toast.info("Đã xóa kịch bản đối chiếu");
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-red-400/80 hover:text-red-400 text-[11px] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-on-surface-variant">
              Dán kịch bản bạn đã dùng để lồng tiếng để AI so khớp chính tả 100%
              chuẩn xác từng từ
            </p>
          </div>

          <div className="space-y-1">
            <textarea
              id="reference_script"
              name="reference_script"
              value={referenceScript}
              onChange={(e) => setReferenceScript(e.target.value)}
              placeholder="Dán toàn bộ kịch bản vào đây, hoặc nhấn nút 'Import từ Thư viện' ở góc trên để nạp kịch bản tự động..."
              rows={5}
              className="w-full min-h-[140px] max-h-[220px] px-3.5 py-2.5 rounded-xl bg-surface-variant/30 border border-white/10 text-on-surface placeholder:text-on-surface-variant/40 text-xs focus:outline-none focus:border-amber-500/50 resize-y leading-relaxed font-sans"
            />
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant px-1">
              <span>
                {referenceScript.trim() ? (
                  <strong className="text-emerald-400">
                    ✓ Đã có {referenceScript.length} ký tự •{" "}
                    {
                      referenceScript.trim().split(/\s+/).filter(Boolean)
                        .length
                    }{" "}
                    từ
                  </strong>
                ) : (
                  "Không bắt buộc (nếu để trống, Whisper AI sẽ tự nhận diện âm thanh gốc)"
                )}
              </span>
            </div>
          </div>

          {/* Cấu hình Whisper AI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-surface-variant/20 border border-white/10">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                <Sliders className="w-3 h-3 text-primary" />
                <span>Ngôn ngữ âm thanh</span>
              </label>
              <select
                value={whisperLanguage}
                onChange={(e) => setWhisperLanguage(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-variant/40 border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary/50"
              >
                <option value="vi" className="bg-surface-variant text-on-surface">
                  Tiếng Việt (Khuyên dùng)
                </option>
                <option value="en" className="bg-surface-variant text-on-surface">
                  Tiếng Anh (English)
                </option>
                <option value="auto" className="bg-surface-variant text-on-surface">
                  Tự động nhận diện (Auto detect)
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" />
                <span>Mô hình Whisper AI</span>
              </label>
              <select
                value={whisperModel}
                onChange={(e) => setWhisperModel(e.target.value as any)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-variant/40 border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary/50"
              >
                <option value="medium" className="bg-surface-variant text-on-surface">
                  Medium (Chuyên sâu)
                </option>
                <option value="base" className="bg-surface-variant text-on-surface">
                  Base (Nhanh 2x, khuyên dùng)
                </option>
                <option value="small" className="bg-surface-variant text-on-surface">
                  Small (Chuẩn xác cao hơn)
                </option>
              </select>
            </div>
          </div>

          {/* Action Buttons Step 1 */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleTranscribe}
              disabled={!videoFile || isTranscribing}
              className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-on-primary font-bold transition-all shadow-lg hover:shadow-primary/25 disabled:opacity-50 text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang bóc tách âm thanh & nhận diện AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Bắt đầu Tạo Phụ Đề</span>
                </>
              )}
            </button>

            {segments.length > 0 && referenceScript.trim() && (
              <button
                type="button"
                onClick={handleAlignScript}
                disabled={isAligningScript}
                className="w-full sm:w-auto py-3 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 font-semibold transition text-xs cursor-pointer flex items-center justify-center gap-1.5"
                title="Khớp lại chính tả từ kịch bản đối chiếu"
              >
                {isAligningScript ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>Khớp chính tả</span>
              </button>
            )}

            {segments.length > 0 && (
              <button
                onClick={onGoToNextStep}
                className="w-full sm:w-auto py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Tiếp tục: Biên tập & Kiểu dáng</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
