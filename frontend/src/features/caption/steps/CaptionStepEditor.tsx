import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  MoveVertical,
  FileText,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type CaptionSegment } from "../types";
import { TranscriptDocEditor } from "@/components/caption/TranscriptDocEditor";
import { TimelineEditor } from "@/components/caption/TimelineEditor";

interface CaptionStepEditorProps {
  onGoToStep: (step: 1 | 3) => void;
  segments: CaptionSegment[];
  currentSegmentY: number;
  renderVideoPlayer: (interactiveDrag: boolean) => React.ReactNode;
  editorTab: "transcript" | "style";
  setEditorTab: (tab: "transcript" | "style") => void;
  currentTime: number;
  isPlaying: boolean;
  seekTo: (seconds: number) => void;
  onUpdateSegments: (newSegs: CaptionSegment[]) => void;
  onOptimizeChunks: () => void;
  isOptimizingChunks: boolean;
  onRestoreSync: () => void;
  hasRawSegments: boolean;
  onUpdateTimeline: () => void;
  renderStyleControls: () => React.ReactNode;
  videoDuration: number;
  videoFile: File | null;
  videoUrl: string | null;
  togglePlay: () => void;
  handleSplitAtPlayhead: () => void;
  canUndo: boolean;
  onUndo: () => void;
  selectedSegId: number | null;
  setSelectedSegId: (id: number | null) => void;
}

export const CaptionStepEditor: React.FC<CaptionStepEditorProps> = ({
  onGoToStep,
  segments,
  currentSegmentY,
  renderVideoPlayer,
  editorTab,
  setEditorTab,
  currentTime,
  isPlaying,
  seekTo,
  onUpdateSegments,
  onOptimizeChunks,
  isOptimizingChunks,
  onRestoreSync,
  hasRawSegments,
  onUpdateTimeline,
  renderStyleControls,
  videoDuration,
  videoFile,
  videoUrl,
  togglePlay,
  handleSplitAtPlayhead,
  canUndo,
  onUndo,
  selectedSegId,
  setSelectedSegId,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Sub-Nav Action Bar cho Bước 2 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/70 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 shadow-md">
        <button
          onClick={() => onGoToStep(1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-surface-variant/40 hover:bg-surface-variant text-on-surface text-xs font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại: Nạp Video</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant font-medium">
            Đang có{" "}
            <strong className="text-primary font-bold">{segments.length}</strong>{" "}
            đoạn câu
            <span className="text-white/40 ml-1.5 hidden sm:inline">
              • Kéo trực tiếp phụ đề trên video để chỉnh vị trí Y ({currentSegmentY}%)
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onGoToStep(3)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary text-xs font-semibold shadow-md transition cursor-pointer"
          >
            <span>Tiếp tục: Xem trước & Xuất Video</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid 2 Cột: Video Player with Interactive Drag & Unified Tab Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        <div className="lg:col-span-7 xl:col-span-7 flex flex-col">
          {renderVideoPlayer(true)}
          <div className="mt-2 px-3 py-1.5 rounded-xl bg-surface-variant/20 border border-white/5 text-[11px] text-on-surface-variant flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MoveVertical className="w-3.5 h-3.5 text-primary" />
              Kéo thả phụ đề trên màn hình video để chỉnh vị trí Y nhanh chóng (
              {currentSegmentY}%)
            </span>
            <span className="text-white/40 hidden sm:inline">
              Tự động căn lề chuẩn
            </span>
          </div>
        </div>

        <div className="lg:col-span-5 xl:col-span-5 flex flex-col h-[520px] lg:h-[760px] 2k:h-[760px] bg-surface/70 backdrop-blur-md rounded-2xl border border-white/10 p-3.5 shadow-xl overflow-hidden">
          {/* Tab Switcher Header */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface-variant/40 rounded-xl border border-white/10 mb-3 shrink-0">
            <button
              type="button"
              onClick={() => setEditorTab("transcript")}
              className={cn(
                "py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer",
                editorTab === "transcript"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5",
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Biên tập Lời thoại ({segments.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab("style")}
              className={cn(
                "py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer",
                editorTab === "style"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5",
              )}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Kiểu dáng & Vị trí Y</span>
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {editorTab === "transcript" ? (
              <TranscriptDocEditor
                segments={segments}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onSeek={seekTo}
                onUpdateSegments={onUpdateSegments}
                onOptimizeChunks={onOptimizeChunks}
                isOptimizingChunks={isOptimizingChunks}
                onRestoreSync={onRestoreSync}
                hasRawSegments={hasRawSegments}
                onUpdateTimeline={onUpdateTimeline}
              />
            ) : (
              renderStyleControls()
            )}
          </div>
        </div>
      </div>

      {/* Bottom Waveform Timeline Editor */}
      <TimelineEditor
        currentTime={currentTime}
        duration={videoDuration}
        segments={segments}
        videoFile={videoFile}
        videoUrl={videoUrl}
        isPlaying={isPlaying}
        onSeek={seekTo}
        onTogglePlay={togglePlay}
        onUpdateSegments={onUpdateSegments}
        onSplit={handleSplitAtPlayhead}
        canUndo={canUndo}
        onUndo={onUndo}
        selectedSegmentId={selectedSegId}
        onSelectSegment={setSelectedSegId}
      />
    </div>
  );
};
