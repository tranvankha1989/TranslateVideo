import React from "react";
import {
  Play,
  Minimize2,
  Maximize2,
  FileVideo,
  Download,
  FolderOpen,
  PauseCircle,
  Upload,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants/api";
import { useVideoTranslateStore } from "@/store/useVideoTranslateStore";
import { PIPELINE_STEPS, STEP_LABELS } from "../types";

export interface VideoPlayerOutputProps {
  isExpandedPlayer: boolean;
  setIsExpandedPlayer: (expanded: boolean) => void;
  resultVideoRef: React.RefObject<HTMLVideoElement | null>;
  previewVideoRef: React.RefObject<HTMLVideoElement | null>;
  handleVideoTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  currentLiveSubtitle: string | null;
  handleDownloadFile: (taskId: string, type: "video" | "audio" | "srt", filename: string) => void;
  handleOpenFolder: () => void;
  isOpeningFolder: boolean;
  formatTimer: (seconds: number) => string;
  handleDownloadOriginalSrt: () => void;
  studioNode?: React.ReactNode;
}

export function VideoPlayerOutput({
  isExpandedPlayer,
  setIsExpandedPlayer,
  resultVideoRef,
  previewVideoRef,
  handleVideoTimeUpdate,
  currentLiveSubtitle,
  handleDownloadFile,
  handleOpenFolder,
  isOpeningFolder,
  formatTimer,
  handleDownloadOriginalSrt,
  studioNode,
}: VideoPlayerOutputProps) {
  const {
    taskStatus,
    taskId,
    isProcessing,
    videoFile,
    videoPreviewUrl,
    subtitleMode,
    subtitlePosition,
    subtitleFontSize,
    elapsedSeconds,
    geminiModel,
  } = useVideoTranslateStore();

  return (
    <div className={cn(isExpandedPlayer ? "lg:col-span-12" : "lg:col-span-5", "space-y-6 transition-all duration-300")}>
      {/* Card Video Player Preview */}
      <div className="bg-surface/80 border border-white/10 rounded-3xl p-5 space-y-4 backdrop-blur-xl shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            {taskStatus?.status === "completed" ? "Video Thành Phẩm" : "Xem Trước Video"}
          </h2>
          <div className="flex items-center gap-2">
            {taskStatus?.status === "completed" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold flex items-center gap-1">
                  ⏱️ {taskStatus.elapsed_str || formatTimer(elapsedSeconds)}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-medium">
                  Hoàn tất 100%
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsExpandedPlayer(!isExpandedPlayer)}
              className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-medium flex items-center gap-1.5 border border-white/10 transition-colors cursor-pointer"
              title={isExpandedPlayer ? "Thu nhỏ về giao diện chia đôi" : "Mở rộng khung xem Video (Theater Mode)"}
            >
              {isExpandedPlayer ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-primary" />
                  <span>Thu gọn</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-primary" />
                  <span>Rạp chiếu</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/90 border border-white/10 flex items-center justify-center group shadow-2xl">
          {taskStatus?.status === "completed" && taskStatus?.task_id ? (
            <>
              <video
                ref={resultVideoRef as React.RefObject<HTMLVideoElement>}
                key={`result-${taskStatus.task_id}-${taskStatus.status}-${taskStatus.elapsed_time || ""}`}
                src={`${API_BASE_URL}/api/video-translate/stream/${taskStatus.task_id}?t=${taskStatus.elapsed_time || Date.now()}`}
                controls
                playsInline
                autoPlay
                onTimeUpdate={handleVideoTimeUpdate}
                className="w-full h-full object-contain"
              />
              {subtitleMode !== "none" && subtitleMode !== "off" && subtitleMode !== "no_sub" && currentLiveSubtitle && (
                <div
                  className={cn(
                    "absolute left-4 right-4 flex justify-center pointer-events-none animate-fadeIn transition-all duration-200",
                    subtitlePosition === "top"
                      ? "top-8"
                      : subtitlePosition === "middle"
                      ? "top-1/2 -translate-y-1/2"
                      : "bottom-12"
                  )}
                >
                  <div
                    style={{ fontSize: `${subtitleFontSize}px` }}
                    className="px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 text-white font-bold text-center shadow-2xl tracking-wide max-w-[90%] drop-shadow-md"
                  >
                    {currentLiveSubtitle}
                  </div>
                </div>
              )}
            </>
          ) : videoPreviewUrl ? (
            <video
              ref={previewVideoRef as React.RefObject<HTMLVideoElement>}
              key={`preview-${videoPreviewUrl}`}
              src={videoPreviewUrl}
              controls
              playsInline
              className="w-full h-full object-contain"
              onError={() => {
                toast.warning(
                  "Trình duyệt không thể giải mã trực tiếp định dạng video này (có thể do codec MKV/HEVC). Bạn vẫn có thể bấm 'Bắt Đầu Dịch' để hệ thống xử lý bình thường!"
                );
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-on-surface-variant">
              <FileVideo className="w-10 h-10 opacity-30" />
              <p className="text-xs">Chưa có video được chọn</p>
            </div>
          )}
        </div>

        {/* Nút thao tác hoàn tất & Studio Segments */}
        {taskStatus?.status === "completed" && taskStatus?.task_id && (
          <div className="space-y-4 pt-2 animate-fadeIn">
            {/* 1. Hàng nút tải về & Mở thư mục */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  handleDownloadFile(
                    taskStatus.task_id,
                    "video",
                    `${(videoFile?.name || (taskStatus as any)?.video_filename || "Video").replace(/\.[^/.]+$/, "")} Translate buy KhaTran.mp4`
                  )
                }
                className="py-3 px-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-95 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-green-500/20 cursor-pointer"
              >
                <Download className="w-4 h-4 text-black shrink-0" />
                <span>Tải Video (MP4)</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFolder}
                disabled={isOpeningFolder}
                className="py-3 px-2 rounded-xl bg-surface-variant/80 hover:bg-surface-variant text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
                title="Mở thư mục chứa file MP4 trên máy tính (Windows Explorer)"
              >
                {isOpeningFolder ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                ) : (
                  <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                )}
                <span>📁 Mở Thư Mục</span>
              </button>
            </div>

            {/* 2. Studio Xem Lại & Thuyết Minh Thời Gian Thực */}
            {studioNode}
          </div>
        )}
      </div>

      {/* Card Trạng Thái Tạm Dừng: Chờ Nạp Phụ Đề Dịch */}
      {taskStatus?.status === "waiting_manual_translation" && !isProcessing && (
        <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-3xl p-6 space-y-4 backdrop-blur-xl shadow-xl animate-fadeIn">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
                <PauseCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Đang Tạm Dừng: Chờ Nạp Bản Dịch</h3>
                <p className="text-[11px] text-amber-300/80">
                  {taskStatus.progress || 40}% • Đã tạo {taskStatus.total_segments || 0} câu thoại gốc
                </p>
              </div>
            </div>
            <span className="text-lg font-bold font-mono text-amber-400 bg-amber-500/20 px-3 py-1 rounded-xl border border-amber-500/30">
              {taskStatus.progress || 40}%
            </span>
          </div>

          <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/10">
            <div
              className="bg-gradient-to-r from-amber-500 to-orange-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${taskStatus.progress || 40}%` }}
            />
          </div>

          <div className="p-3.5 bg-black/50 border border-amber-500/20 rounded-2xl text-xs space-y-2.5">
            <p className="text-on-surface leading-relaxed">
              {taskStatus.message || "Đã xuất xong file phụ đề gốc. Vui lòng dịch phụ đề và nạp lại ở Bước 3 bên trái để hoàn tất."}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadOriginalSrt}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Phụ Đề Gốc (.SRT)</span>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            👉 <b>Bước tiếp theo:</b> Nạp file <code>.srt</code> đã dịch ở <b>Bước 3</b> và bấm <b>🎬 3. Tiếp Tục Lồng Tiếng & Render Video</b> ở Bước 4 để xuất video thành phẩm.
          </p>
        </div>
      )}

      {/* Card Tiến Trình Chi Tiết khi đang chạy */}
      {isProcessing && taskStatus && (() => {
        const currentStepKey = taskStatus.current_step || "extracting";
        const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.key === currentStepKey);
        const activeStepIdx = currentStepIndex !== -1 ? currentStepIndex : (taskStatus.progress && taskStatus.progress >= 85 ? 5 : 0);

        const curProg = taskStatus.progress || 0;
        let remainingSeconds: number | null = null;
        if (curProg >= 8 && elapsedSeconds >= 3 && curProg < 100) {
          const totalEstSec = (elapsedSeconds / curProg) * 100;
          remainingSeconds = Math.max(1, Math.round(totalEstSec - elapsedSeconds));
        }

        return (
          <div className="bg-surface/90 border-2 border-primary/40 rounded-3xl p-6 space-y-5 backdrop-blur-xl shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                {taskStatus.task_id === "uploading" ? (
                  <>
                    <div className="w-9 h-9 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
                      <Upload className="w-5 h-5 animate-bounce" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-on-surface">Đang Tải Video Lên Máy Chủ</h3>
                      <p className="text-[11px] text-on-surface-variant">Chuẩn bị không gian xử lý dữ liệu</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30 relative">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                        <span>Tiến Trình Xử Lý AI Khép Kín</span>
                        {taskId && <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">#{taskId}</span>}
                      </h3>
                      <p className="text-[11px] text-on-surface-variant">Đang chạy các mô hình AI trực tiếp theo thời gian thực</p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-2xl font-black text-primary font-mono tracking-tight">
                    {taskStatus.progress}%
                  </span>
                </div>
              </div>
            </div>

            {/* Multi-Step Visual Pipeline Stepper */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {PIPELINE_STEPS.map((step, idx) => {
                const isDone = curProg >= step.maxProg || idx < activeStepIdx;
                const isCurrent = idx === activeStepIdx && curProg < step.maxProg;

                return (
                  <div
                    key={step.key}
                    className={cn(
                      "relative p-2.5 rounded-2xl border transition-all flex flex-col justify-between gap-1.5 overflow-hidden",
                      isCurrent
                        ? "bg-primary/15 border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                        : isDone
                        ? "bg-green-500/10 border-green-500/30 text-green-300"
                        : "bg-surface-variant/20 border-white/5 opacity-50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40">
                        {idx + 1}/6
                      </span>
                      <span className="text-xs">
                        {isDone ? "✅" : isCurrent ? "⚡" : step.icon}
                      </span>
                    </div>

                    <p className={cn(
                      "text-[11px] font-semibold leading-tight line-clamp-2",
                      isCurrent ? "text-primary" : isDone ? "text-green-300" : "text-on-surface-variant"
                    )}>
                      {step.label}
                    </p>

                    {isCurrent && (
                      <div className="w-full bg-primary/30 h-1 rounded-full overflow-hidden mt-1">
                        <div className="bg-primary h-full rounded-full animate-pulse w-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden p-0.5 border border-white/10">
                <div
                  className="bg-gradient-to-r from-primary via-amber-400 to-primary h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                  style={{ width: `${taskStatus.progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[move-stripe_1s_linear_infinite]" />
                </div>
              </div>
            </div>

            {/* Sub-Step Message Banner */}
            <div className="p-3 bg-black/50 border border-primary/30 rounded-2xl flex items-start gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-1 animate-ping" />
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-semibold text-on-surface leading-relaxed break-words">
                  {taskStatus.message || "Đang xử lý dữ liệu..."}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-on-surface-variant font-mono">
                    Giai đoạn: <b>{STEP_LABELS[currentStepKey]?.label || currentStepKey}</b>
                  </span>
                </div>
              </div>
            </div>

            {/* Real-time Statistics Badges Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                <span className="text-[10px] text-on-surface-variant">⏱️ Thời gian đã chạy</span>
                <span className="text-xs font-bold text-on-surface font-mono mt-0.5">
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                <span className="text-[10px] text-on-surface-variant">⏳ Ước tính còn lại</span>
                <span className="text-xs font-bold text-amber-400 font-mono mt-0.5">
                  {remainingSeconds ? `~${formatTimer(remainingSeconds)}` : "Đang tính..."}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                <span className="text-[10px] text-on-surface-variant">🎙️ Tổng câu thoại</span>
                <span className="text-xs font-bold text-primary font-mono mt-0.5">
                  {taskStatus.total_segments ? `${taskStatus.total_segments} câu` : "Đang đếm..."}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                <span className="text-[10px] text-on-surface-variant">🤖 Mô hình AI</span>
                <span className="text-xs font-bold text-on-surface truncate mt-0.5" title={geminiModel}>
                  {geminiModel ? geminiModel.replace("gemini-", "").replace("gemma-", "gemma-") : "Edge-TTS"}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
