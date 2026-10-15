import React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  FileCode,
} from "lucide-react";
import { type CaptionSegment, type StyleConfig } from "../types";

interface CaptionStepExportProps {
  onGoToStep: (step: 1 | 2 | 3) => void;
  renderVideoPlayer: (interactiveDrag: boolean) => React.ReactNode;
  videoFile: File | null;
  videoDuration: number;
  segments: CaptionSegment[];
  style: StyleConfig;
  handleExport: () => void;
  isExporting: boolean;
  handleDownloadSrt: () => void;
  handleDownloadVtt: () => void;
  onSwitchTabInEditor: (tab: "transcript" | "style") => void;
}

export const CaptionStepExport: React.FC<CaptionStepExportProps> = ({
  onGoToStep,
  renderVideoPlayer,
  videoFile,
  videoDuration,
  segments,
  style,
  handleExport,
  isExporting,
  handleDownloadSrt,
  handleDownloadVtt,
  onSwitchTabInEditor,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Sub-Nav Action Bar cho Bước 3 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/70 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 shadow-md">
        <button
          onClick={() => onGoToStep(2)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-surface-variant/40 hover:bg-surface-variant text-on-surface text-xs font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại: Biên tập & Kiểu dáng</span>
        </button>

        <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          Sẵn sàng xuất video hoàn chỉnh
        </span>
      </div>

      {/* Grid 2 Cột: Video Player Preview & Export Hub Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-7 flex flex-col">
          {renderVideoPlayer(false)}
        </div>

        <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-4">
          <div className="bg-surface/80 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-on-surface">
                  Trung Tâm Xuất Thành Phẩm
                </h3>
              </div>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                Chuẩn HD
              </span>
            </div>

            {/* Video & Subtitle Specs Summary Table */}
            <div className="p-3 rounded-xl bg-surface-variant/30 border border-white/10 space-y-2 text-xs">
              <div className="flex justify-between text-on-surface-variant">
                <span>Tên video:</span>
                <strong className="text-on-surface truncate max-w-[200px]">
                  {videoFile?.name || "video.mp4"}
                </strong>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Thời lượng:</span>
                <strong className="text-on-surface">
                  {videoDuration.toFixed(1)}s
                </strong>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Số lượng câu phụ đề:</span>
                <strong className="text-primary">
                  {segments.length} đoạn câu
                </strong>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Font chữ & Cỡ:</span>
                <strong className="text-on-surface">
                  {style.font_name} • {style.font_size}px
                </strong>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Vị trí hiển thị:</span>
                <strong className="text-on-surface">
                  Y: {style.position_y}%
                </strong>
              </div>
            </div>

            {/* Primary Action: Xuất Video MP4 Hardsub */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg hover:shadow-emerald-500/25 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang render phụ đề vào video...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>🎬 Xuất Video MP4 (Hardsub HD)</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-on-surface-variant text-center">
                Video được ghép phụ đề Kinetic Karaoke sắc nét, tải trực tiếp về
                máy tính.
              </p>
            </div>

            {/* Secondary Actions: Tải file phụ đề rời .SRT & .VTT */}
            <div className="pt-3 border-t border-white/5 space-y-2">
              <h4 className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-primary" />
                <span>Tải file phụ đề rời (Cho Premiere, CapCut, YouTube)</span>
              </h4>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadSrt}
                  className="py-2.5 px-3 rounded-xl bg-surface-variant/40 hover:bg-surface-variant border border-white/10 hover:border-white/20 text-on-surface text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tải file .SRT</span>
                </button>

                <button
                  onClick={handleDownloadVtt}
                  className="py-2.5 px-3 rounded-xl bg-surface-variant/40 hover:bg-surface-variant border border-white/10 hover:border-white/20 text-on-surface text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Tải file .VTT</span>
                </button>
              </div>
            </div>

            {/* Quick Navigation Links */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-on-surface-variant">
              <span>Cần điều chỉnh thêm?</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSwitchTabInEditor("transcript")}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Sửa lời thoại
                </button>
                <span>•</span>
                <button
                  onClick={() => onSwitchTabInEditor("style")}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Đổi kiểu dáng
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
