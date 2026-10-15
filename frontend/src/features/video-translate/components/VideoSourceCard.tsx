import React, { useRef } from "react";
import {
  FileVideo,
  Upload,
  Film,
  Scissors,
  RotateCcw,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVideoTranslateStore } from "@/store/useVideoTranslateStore";

export interface VideoSourceCardProps {
  formatSrtTime: (seconds: number) => string;
  previewVideoRef: React.RefObject<HTMLVideoElement | null>;
  resultVideoRef: React.RefObject<HTMLVideoElement | null>;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  handleFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  startTimeUnit?: "seconds" | "minutes";
  setStartTimeUnit?: (unit: "seconds" | "minutes") => void;
  endTimeUnit?: "seconds" | "minutes";
  setEndTimeUnit?: (unit: "seconds" | "minutes") => void;
}

export const VideoSourceCard: React.FC<VideoSourceCardProps> = ({
  formatSrtTime,
  previewVideoRef,
  resultVideoRef,
  fileInputRef: externalFileInputRef,
  handleFileChange: externalHandleFileChange,
  startTimeUnit: externalStartTimeUnit,
  setStartTimeUnit: externalSetStartTimeUnit,
  endTimeUnit: externalEndTimeUnit,
  setEndTimeUnit: externalSetEndTimeUnit,
}) => {
  const {
    videoFile,
    videoFileName,
    videoFileSize,
    videoPreviewUrl,
    videoStartTime,
    videoEndTime,
    isProcessing,
    taskId,
    taskStatus,
    setVideoFile,
    setVideoStartTime,
    setVideoEndTime,
    resetVideoTrim,
    resetAll,
  } = useVideoTranslateStore();

  const internalFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = (externalFileInputRef || internalFileInputRef) as React.RefObject<HTMLInputElement>;
  const [internalStartTimeUnit, internalSetStartTimeUnit] = React.useState<"seconds" | "minutes">("seconds");
  const [internalEndTimeUnit, internalSetEndTimeUnit] = React.useState<"seconds" | "minutes">("seconds");

  const startTimeUnit = externalStartTimeUnit !== undefined ? externalStartTimeUnit : internalStartTimeUnit;
  const setStartTimeUnit = externalSetStartTimeUnit || internalSetStartTimeUnit;
  const endTimeUnit = externalEndTimeUnit !== undefined ? externalEndTimeUnit : internalEndTimeUnit;
  const setEndTimeUnit = externalSetEndTimeUnit || internalSetEndTimeUnit;

  const handleFileChange = externalHandleFileChange || ((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("video/")) {
        toast.error("Vui lòng chọn tệp video hợp lệ (.mp4, .mkv, .mov, .webm)");
        return;
      }
      setVideoFile(file);
      toast.success(`Đã chọn video: ${file.name}`);
    }
  });

  return (
    <div className="bg-surface/80 border border-white/10 rounded-3xl p-6 space-y-4 backdrop-blur-xl shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
          <FileVideo className="w-4 h-4 text-primary" />
          1. Chọn Video Cần Dịch
        </h2>
        {(videoFile || videoFileName || taskId) && (
          <button
            type="button"
            onClick={() => {
              resetAll();
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
                fileInputRef.current.click();
              }
            }}
            className="text-xs text-primary hover:underline font-medium cursor-pointer"
          >
            Đổi video khác
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {!videoFile && !videoFileName && !taskId ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-white/20 hover:border-primary/50 transition-all duration-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer group bg-surface-variant/20 hover:bg-surface-variant/40"
        >
          <div className="w-14 h-14 rounded-2xl bg-surface-variant flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">
              Nhấp hoặc kéo thả video vào đây
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              Hỗ trợ MP4, MKV, MOV, WebM (Khuyên dùng video dưới 30 phút)
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 bg-surface-variant/40 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Film className="w-5 h-5 text-primary" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-on-surface truncate">
                  {videoFile?.name || videoFileName || `Tác vụ #${taskId}`}
                </p>
                <p className="text-xs text-on-surface-variant font-mono">
                  {videoFile
                    ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB`
                    : videoFileSize
                    ? `${(videoFileSize / (1024 * 1024)).toFixed(1)} MB`
                    : "Đang lưu trên máy chủ"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetAll();
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-white border border-white/10 transition-colors cursor-pointer"
                title="Làm mới tác vụ để chọn video khác"
              >
                Hủy & Làm mới
              </button>
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border font-medium",
                  isProcessing
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : taskStatus?.status === "completed"
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                )}
              >
                {isProcessing
                  ? "Đang xử lý"
                  : taskStatus?.status === "completed"
                  ? "Đã xong"
                  : "Sẵn sàng"}
              </span>
            </div>
          </div>

          {/* Tùy chọn Cắt đoạn Video cần dịch (Trimming Clip) */}
          {(videoFile || videoPreviewUrl) && !isProcessing && (
            <div className="p-3.5 bg-surface-variant/25 rounded-2xl border border-primary/20 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-on-surface">
                    Cắt đoạn video cần dịch (Tùy chọn)
                  </span>
                  <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">
                    {videoStartTime > 0 || videoEndTime !== null
                      ? "Đang cắt clip"
                      : "Toàn bộ video"}
                  </span>
                </div>
                {(videoStartTime > 0 || videoEndTime !== null) && (
                  <button
                    type="button"
                    onClick={resetVideoTrim}
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Dịch toàn bộ video
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Start time */}
                <div className="space-y-1 bg-black/30 p-2.5 rounded-xl border border-white/5">
                  <label className="text-[11px] text-on-surface-variant flex items-center justify-between">
                    <span className="flex items-center gap-1 text-green-400 font-semibold">
                      <Clock className="w-3 h-3" />
                      Bắt đầu từ:
                    </span>
                    <span className="font-mono text-xs text-primary font-bold">
                      {formatSrtTime(videoStartTime)}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-surface-variant/80 border border-white/10 rounded-lg overflow-hidden focus-within:border-primary/50">
                      <input
                        type="number"
                        min="0"
                        step={startTimeUnit === "seconds" ? "0.5" : "0.1"}
                        value={
                          startTimeUnit === "seconds"
                            ? videoStartTime
                            : videoStartTime === 0
                            ? 0
                            : Number((videoStartTime / 60).toFixed(2))
                        }
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (isNaN(val)) {
                            setVideoStartTime(0);
                          } else if (startTimeUnit === "seconds") {
                            setVideoStartTime(Math.max(0, val));
                          } else {
                            setVideoStartTime(
                              Math.max(0, Math.round(val * 60 * 10) / 10)
                            );
                          }
                        }}
                        className="w-16 bg-transparent px-2 py-1 text-xs text-on-surface font-mono focus:outline-none"
                        placeholder={startTimeUnit === "seconds" ? "0.0s" : "0.0p"}
                      />
                      <select
                        value={startTimeUnit}
                        onChange={(e) =>
                          setStartTimeUnit(
                            e.target.value as "seconds" | "minutes"
                          )
                        }
                        className="bg-black/40 text-[11px] font-bold text-primary px-1.5 py-1 border-l border-white/10 cursor-pointer focus:outline-none"
                        title="Chọn đơn vị thời gian (Giây hoặc Phút)"
                      >
                        <option value="seconds">Giây</option>
                        <option value="minutes">Phút</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const cur =
                          previewVideoRef.current?.currentTime ||
                          resultVideoRef.current?.currentTime ||
                          0;
                        setVideoStartTime(Math.round(cur * 10) / 10);
                        toast.success(
                          `📍 Đã lấy mốc bắt đầu: ${formatSrtTime(cur)}`
                        );
                      }}
                      className="flex-1 py-1.5 px-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="Đặt mốc thời gian hiện tại của video player làm điểm bắt đầu"
                    >
                      <span>📍 Mốc hiện tại</span>
                    </button>
                  </div>
                </div>

                {/* End time */}
                <div className="space-y-1 bg-black/30 p-2.5 rounded-xl border border-white/5">
                  <label className="text-[11px] text-on-surface-variant flex items-center justify-between">
                    <span className="flex items-center gap-1 text-red-400 font-semibold">
                      <Clock className="w-3 h-3" />
                      Kết thúc tại:
                    </span>
                    <span className="font-mono text-xs text-primary font-bold">
                      {videoEndTime !== null
                        ? formatSrtTime(videoEndTime)
                        : "Hết video (Mặc định)"}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-surface-variant/80 border border-white/10 rounded-lg overflow-hidden focus-within:border-primary/50">
                      <input
                        type="number"
                        min="0"
                        step={endTimeUnit === "seconds" ? "0.5" : "0.1"}
                        value={
                          videoEndTime === null
                            ? ""
                            : endTimeUnit === "seconds"
                            ? videoEndTime
                            : Number((videoEndTime / 60).toFixed(2))
                        }
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (isNaN(val) || val <= 0) {
                            setVideoEndTime(null);
                          } else if (endTimeUnit === "seconds") {
                            setVideoEndTime(Math.max(videoStartTime + 0.5, val));
                          } else {
                            setVideoEndTime(
                              Math.max(
                                videoStartTime + 0.5,
                                Math.round(val * 60 * 10) / 10
                              )
                            );
                          }
                        }}
                        className="w-16 bg-transparent px-2 py-1 text-xs text-on-surface font-mono focus:outline-none placeholder:text-white/30"
                        placeholder="Hết"
                      />
                      <select
                        value={endTimeUnit}
                        onChange={(e) =>
                          setEndTimeUnit(
                            e.target.value as "seconds" | "minutes"
                          )
                        }
                        className="bg-black/40 text-[11px] font-bold text-primary px-1.5 py-1 border-l border-white/10 cursor-pointer focus:outline-none"
                        title="Chọn đơn vị thời gian (Giây hoặc Phút)"
                      >
                        <option value="seconds">Giây</option>
                        <option value="minutes">Phút</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const cur =
                          previewVideoRef.current?.currentTime ||
                          resultVideoRef.current?.currentTime ||
                          0;
                        if (cur > videoStartTime) {
                          setVideoEndTime(Math.round(cur * 10) / 10);
                          toast.success(
                            `📍 Đã lấy mốc kết thúc: ${formatSrtTime(cur)}`
                          );
                        } else {
                          toast.error(
                            "Mốc kết thúc phải lớn hơn mốc bắt đầu!"
                          );
                        }
                      }}
                      className="flex-1 py-1.5 px-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="Đặt mốc thời gian hiện tại của video player làm điểm kết thúc"
                    >
                      <span>📍 Mốc hiện tại</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
