import React from "react";
import {
  Sparkles,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Loader2,
  Play,
  Minus,
  Plus,
  Volume2,
  Trash2,
  Mic,
  FileEdit,
  Brain,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TranslationMemoryModal } from "@/components/translation-memory";
import { useVideoTranslateStore, StudioSegment } from "@/store/useVideoTranslateStore";

export interface StudioSegmentsManagerProps {
  isStudioOpen: boolean;
  setIsStudioOpen: (open: boolean) => void;
  studioRemuxMessage: string | null;
  setStudioRemuxMessage: (msg: string | null) => void;
  studioViewMode: "current" | "all";
  setStudioViewMode: (mode: "current" | "all") => void;
  filteredStudioSegments: StudioSegment[];
  studioSearch: string;
  setStudioSearch: (s: string) => void;
  playingAudioSegId: number | null;
  deletingSegId: number | null;
  fetchStudioSegments: (taskId: string) => void;
  handleSeekToSegment: (seg: StudioSegment) => void;
  handleAdjustSegmentStart: (seg: StudioSegment, delta: number) => void;
  handleSyncSegmentUpdate: (id: number, text: string, start: number, end: number) => void;
  handlePlaySegmentAudio: (id: number, url: string) => void;
  handleOpenAddSegment: (start: number, end: number) => void;
  handleDeleteStudioSegment: (id: number) => void;
  handleRedubSingleSegment: (seg: StudioSegment) => void;
  handlePlaySingleSegmentOnVideo: (seg: StudioSegment) => void;
  transcriptContainerRef: React.RefObject<HTMLDivElement | null>;
  handleToggleSrtEditor: () => void;
  isLoadingSrt: boolean;
  showSrtEditor: boolean;
  handleRedub: (customSrt?: string) => void;
  setShowMemoryModal: (show: boolean) => void;
  memoryCount: number;
  handleSaveSrt: () => void;
  isSavingSrt: boolean;
  srtText: string;
  setSrtText: (text: string) => void;
  showAddSegmentModal: boolean;
  setShowAddSegmentModal: (show: boolean) => void;
  handleSubmitAddSegment: (e: React.FormEvent) => void;
  newSegStart: number;
  setNewSegStart: (val: number) => void;
  newSegEnd: number;
  setNewSegEnd: (val: number) => void;
  newSegText: string;
  setNewSegText: (val: string) => void;
  newSegOriginalText: string;
  setNewSegOriginalText: (val: string) => void;
  newSegVoiceId: string;
  setNewSegVoiceId: (val: string) => void;
  setNewSegEngine: (val: string) => void;
  isAddingSegment: boolean;
  showMemoryModal: boolean;
  fetchMemoryCount: () => void;
  formatSrtTime: (seconds: number) => string;
}

export function StudioSegmentsManager({
  isStudioOpen,
  setIsStudioOpen,
  studioRemuxMessage,
  setStudioRemuxMessage,
  studioViewMode,
  setStudioViewMode,
  filteredStudioSegments,
  studioSearch,
  setStudioSearch,
  playingAudioSegId,
  deletingSegId,
  fetchStudioSegments,
  handleSeekToSegment,
  handleAdjustSegmentStart,
  handleSyncSegmentUpdate,
  handlePlaySegmentAudio,
  handleOpenAddSegment,
  handleDeleteStudioSegment,
  handleRedubSingleSegment,
  handlePlaySingleSegmentOnVideo,
  transcriptContainerRef,
  handleToggleSrtEditor,
  isLoadingSrt,
  showSrtEditor,
  handleRedub,
  setShowMemoryModal,
  memoryCount,
  handleSaveSrt,
  isSavingSrt,
  srtText,
  setSrtText,
  showAddSegmentModal,
  setShowAddSegmentModal,
  handleSubmitAddSegment,
  newSegStart,
  setNewSegStart,
  newSegEnd,
  setNewSegEnd,
  newSegText,
  setNewSegText,
  newSegOriginalText,
  setNewSegOriginalText,
  newSegVoiceId,
  setNewSegVoiceId,
  setNewSegEngine,
  isAddingSegment,
  showMemoryModal,
  fetchMemoryCount,
  formatSrtTime,
}: StudioSegmentsManagerProps) {
  const {
    taskStatus,
    studioSegments,
    activeStudioSegmentId,
    isLoadingStudioSegments,
    updateStudioSegmentText,
    isRedubbing,
    isProcessing,
    voices,
  } = useVideoTranslateStore();

  return (
    <div className="rounded-3xl bg-surface/90 border border-white/10 shadow-xl overflow-hidden transition-all duration-300">
      {/* Studio Header - Dạng Sổ Xuống (Accordion Collapsible) */}
      <div
        onClick={() => setIsStudioOpen(!isStudioOpen)}
        className="p-4 flex items-center justify-between flex-wrap gap-2 cursor-pointer select-none bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-b border-white/5"
      >
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-primary/20 text-primary">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span>Xem Lại & Chỉnh Sửa Lời Thoại</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-mono">
                {studioSegments.length > 0 ? `${studioSegments.length} câu` : "Thời gian thực"}
              </span>
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              {isStudioOpen
                ? "💡 Đang mở bảng chỉnh sửa câu thoại theo vị trí video phát"
                : "👉 Nhấp vào đây để sổ bảng xem lại & sửa câu thoại"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant font-medium">
            {isStudioOpen ? "Thu gọn" : "Mở chỉnh sửa"}
          </span>
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-on-surface-variant">
            {isStudioOpen ? (
              <ChevronUp className="w-4 h-4 text-primary" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>
      </div>

      {/* Nội dung bên trong khi xổ ra */}
      <div className={cn("curtain-collapse", isStudioOpen && "curtain-expanded")}>
        <div className="curtain-inner">
          <div className="p-4 space-y-4">
            {/* Status Banner */}
            {studioRemuxMessage && (
              <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs flex items-center justify-between">
                <span>{studioRemuxMessage}</span>
                <button
                  type="button"
                  onClick={() => setStudioRemuxMessage(null)}
                  className="text-green-400 hover:text-white text-xs font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Header điều khiển: Chuyển chế độ xem & Nạp lại */}
            <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
              <div className="flex items-center p-1 bg-surface-variant/40 rounded-xl border border-white/5 gap-1">
                <button
                  type="button"
                  onClick={() => setStudioViewMode("current")}
                  className={cn(
                    "py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                    studioViewMode === "current"
                      ? "bg-primary text-black shadow-sm font-bold"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                  )}
                >
                  <span>🎯 Câu tại vị trí video đang phát</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudioViewMode("all")}
                  className={cn(
                    "py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                    studioViewMode === "all"
                      ? "bg-primary text-black shadow-sm font-bold"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                  )}
                >
                  <span>📋 Xem tất cả ({filteredStudioSegments.length})</span>
                </button>
              </div>

              {taskStatus?.task_id && (
                <button
                  type="button"
                  onClick={() => fetchStudioSegments(taskStatus.task_id)}
                  disabled={isLoadingStudioSegments}
                  className="px-3 py-1.5 rounded-xl bg-surface-variant/60 hover:bg-surface-variant text-on-surface text-xs flex items-center gap-1.5 border border-white/10 cursor-pointer shrink-0 disabled:opacity-50"
                  title="Tải lại danh sách câu thoại"
                >
                  {isLoadingStudioSegments ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5 text-primary" />
                  )}
                  <span>Nạp lại</span>
                </button>
              )}
            </div>

            {/* Nạp dữ liệu hoặc thông báo rỗng */}
            {isLoadingStudioSegments && studioSegments.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Đang nạp dữ liệu timeline studio...</span>
              </div>
            ) : studioSegments.length === 0 ? (
              <div className="py-6 text-center text-xs text-on-surface-variant">
                Chưa có dữ liệu câu thoại cho video này.
              </div>
            ) : studioViewMode === "current" ? (
              /* CHẾ ĐỘ 1: Chỉ hiển thị câu thoại tại vị trí video đang phát */
              (() => {
                const currentActiveSeg =
                  filteredStudioSegments.find((s) => s.id === activeStudioSegmentId) ||
                  filteredStudioSegments[0] ||
                  null;
                const currentActiveIndex = currentActiveSeg
                  ? filteredStudioSegments.findIndex((s) => s.id === currentActiveSeg.id)
                  : -1;

                if (!currentActiveSeg) {
                  return (
                    <div className="py-6 text-center text-xs text-on-surface-variant">
                      Không tìm thấy câu thoại phù hợp.
                    </div>
                  );
                }

                const isPlayingAudio = playingAudioSegId === currentActiveSeg.id;

                return (
                  <div className="space-y-3">
                    {/* Thanh điều hướng câu thoại với nút < và > */}
                    <div className="bg-surface-variant/30 border border-white/10 rounded-2xl p-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={currentActiveIndex <= 0}
                        onClick={() => {
                          if (currentActiveIndex > 0) {
                            const prevSeg = filteredStudioSegments[currentActiveIndex - 1];
                            handleSeekToSegment(prevSeg);
                          }
                        }}
                        title={
                          currentActiveIndex <= 0
                            ? "Đang ở câu thoại đầu tiên"
                            : `Xem câu trước (#${filteredStudioSegments[currentActiveIndex - 1]?.id})`
                        }
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 border cursor-pointer",
                          currentActiveIndex <= 0
                            ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
                            : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
                        )}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>

                      <div className="flex items-center gap-2 text-center min-w-0">
                        <span className="text-xs font-bold text-primary font-mono px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                          Câu #{currentActiveSeg.id} ({currentActiveIndex + 1}/{filteredStudioSegments.length})
                        </span>
                        <span className="text-[11px] font-mono text-on-surface-variant hidden sm:inline">
                          [{formatSrtTime(currentActiveSeg.start)} ➔ {formatSrtTime(currentActiveSeg.end)}]
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={
                          currentActiveIndex >= filteredStudioSegments.length - 1 ||
                          currentActiveIndex === -1
                        }
                        onClick={() => {
                          if (currentActiveIndex < filteredStudioSegments.length - 1) {
                            const nextSeg = filteredStudioSegments[currentActiveIndex + 1];
                            handleSeekToSegment(nextSeg);
                          }
                        }}
                        title={
                          currentActiveIndex >= filteredStudioSegments.length - 1
                            ? "Đang ở câu thoại cuối cùng"
                            : `Xem câu tiếp theo (#${filteredStudioSegments[currentActiveIndex + 1]?.id})`
                        }
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 border cursor-pointer",
                          currentActiveIndex >= filteredStudioSegments.length - 1 ||
                          currentActiveIndex === -1
                            ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
                            : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
                        )}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Thẻ chỉnh sửa chi tiết câu thoại hiện tại */}
                    <div key={`studio-active-seg-${currentActiveSeg.id}`} className="p-4 rounded-2xl border border-primary/30 bg-surface-variant/40 space-y-3 shadow-lg step-transition">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSeekToSegment(currentActiveSeg)}
                            className="text-xs font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer font-bold px-2 py-1 rounded-lg bg-primary/10 border border-primary/20"
                            title="Tua video đến mốc này và phát"
                          >
                            <Play className="w-3 h-3 text-primary fill-primary" />
                            <span>
                              {formatSrtTime(currentActiveSeg.start)} ➔ {formatSrtTime(currentActiveSeg.end)}
                            </span>
                          </button>
                          {currentActiveSeg.audio_duration ? (
                            <span className="text-[11px] text-on-surface-variant/70 font-mono">
                              ({currentActiveSeg.audio_duration.toFixed(1)}s)
                            </span>
                          ) : null}
                        </div>

                        {/* Tinh chỉnh mốc thời gian bắt đầu */}
                        <div className="flex items-center gap-1 bg-black/40 px-2.5 py-1 rounded-lg border border-white/10">
                          <span className="text-[11px] text-on-surface-variant font-medium">Bắt đầu:</span>
                          <button
                            type="button"
                            onClick={() => handleAdjustSegmentStart(currentActiveSeg, -0.1)}
                            className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                            title="Lùi mốc bắt đầu 0.1 giây"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="font-mono text-xs text-primary font-bold px-1">
                            {currentActiveSeg.start.toFixed(1)}s
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustSegmentStart(currentActiveSeg, +0.1)}
                            className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                            title="Tiến mốc bắt đầu 0.1 giây"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>

                      {currentActiveSeg.original_text && (
                        <div className="text-xs font-mono text-amber-300/80 bg-black/40 px-3 py-1.5 rounded-xl border border-amber-500/10">
                          <span className="text-amber-400 font-medium">Gốc: </span>
                          {currentActiveSeg.original_text}
                        </div>
                      )}

                      {/* Textarea Sửa Văn Bản */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-medium text-on-surface-variant flex items-center justify-between">
                          <span>Nội dung câu thoại tiếng Việt:</span>
                          <span className="text-[10px] text-primary">Tự động đồng bộ</span>
                        </label>
                        <textarea
                          value={currentActiveSeg.text}
                          onChange={(e) => updateStudioSegmentText(currentActiveSeg.id, e.target.value)}
                          onBlur={() =>
                            handleSyncSegmentUpdate(
                              currentActiveSeg.id,
                              currentActiveSeg.text,
                              currentActiveSeg.start,
                              currentActiveSeg.end
                            )
                          }
                          rows={3}
                          className="w-full text-xs bg-black/60 border border-white/10 rounded-xl p-3 text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed font-sans"
                          placeholder="Nhập hoặc chỉnh sửa câu thoại tiếng Việt..."
                        />
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                        <div className="flex items-center gap-1.5">
                          {currentActiveSeg.audio_url && (
                            <button
                              type="button"
                              onClick={() => handlePlaySegmentAudio(currentActiveSeg.id, currentActiveSeg.audio_url!)}
                              className={cn(
                                "px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer",
                                isPlayingAudio
                                  ? "bg-primary text-black border-primary font-bold animate-pulse"
                                  : "bg-white/5 hover:bg-white/10 text-on-surface border-white/10"
                              )}
                            >
                              <Volume2 className="w-3.5 h-3.5 text-primary" />
                              <span>{isPlayingAudio ? "Đang phát..." : "Nghe thử"}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              handleOpenAddSegment(
                                currentActiveSeg.end,
                                Math.round((currentActiveSeg.end + 2.5) * 10) / 10
                              )
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                            title="Chèn câu thoại ngay sau câu này"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Chèn</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteStudioSegment(currentActiveSeg.id)}
                            disabled={deletingSegId === currentActiveSeg.id}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                            title="Xóa câu này khỏi video"
                          >
                            {deletingSegId === currentActiveSeg.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            <span>Xóa</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRedubSingleSegment(currentActiveSeg)}
                          disabled={currentActiveSeg.isRedubbing}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-primary/30 to-amber-500/30 hover:from-primary/40 hover:to-amber-500/40 text-primary border border-primary/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                          title="Tạo giọng mới cho câu này và cập nhật vào video"
                        >
                          {currentActiveSeg.isRedubbing ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                              <span>Đang thu...</span>
                            </>
                          ) : (
                            <>
                              <Mic className="w-3.5 h-3.5 text-primary" />
                              <span>⚡ Nạp Lại Lời Thoại Này</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              /* CHẾ ĐỘ 2: Xem toàn bộ danh sách câu thoại dạng cuộn */
              <div className="space-y-3">
                <input
                  type="text"
                  value={studioSearch}
                  onChange={(e) => setStudioSearch(e.target.value)}
                  placeholder="🔍 Tìm kiếm nhanh câu thoại..."
                  className="w-full text-xs bg-surface-variant/40 border border-white/10 rounded-xl px-3 py-2 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
                />

                <div ref={transcriptContainerRef as React.RefObject<HTMLDivElement>} className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {filteredStudioSegments.map((seg) => {
                    const isActive = activeStudioSegmentId === seg.id;
                    const isPlayingAudio = playingAudioSegId === seg.id;
                    return (
                      <div
                        key={seg.id}
                        id={`studio-seg-${seg.id}`}
                        onClick={() => handlePlaySingleSegmentOnVideo(seg)}
                        className={cn(
                          "p-3 rounded-2xl border transition-all duration-200 space-y-2 cursor-pointer group",
                          isActive
                            ? "bg-primary/10 border-primary shadow-md shadow-primary/15 ring-1 ring-primary/40"
                            : "bg-surface-variant/25 border-white/5 hover:border-primary/40 hover:bg-surface-variant/40"
                        )}
                        title="Nhấp vào đây để phát riêng đoạn video này và tự động dừng khi kết thúc"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span
                              className={cn(
                                "text-[10px] font-mono font-bold px-2 py-0.5 rounded-md",
                                isActive ? "bg-primary text-black" : "bg-white/10 text-on-surface-variant"
                              )}
                            >
                              #{seg.id}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSeekToSegment(seg)}
                              className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                              title="Tua video đến mốc này và tiếp tục phát"
                            >
                              <Play className="w-3 h-3 text-primary fill-primary" />
                              <span>
                                {formatSrtTime(seg.start)} ➔ {formatSrtTime(seg.end)}
                              </span>
                            </button>
                            {seg.audio_duration ? (
                              <span className="text-[10px] text-on-surface-variant/70 font-mono">
                                ({seg.audio_duration.toFixed(1)}s)
                              </span>
                            ) : null}
                          </div>

                          {/* Tinh chỉnh thời gian bắt đầu câu thoại (±0.1s) */}
                          <div
                            className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-white/10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[10px] text-on-surface-variant font-medium">Bắt đầu:</span>
                            <button
                              type="button"
                              onClick={() => handleAdjustSegmentStart(seg, -0.1)}
                              className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                              title="Lùi mốc bắt đầu 0.1 giây"
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                            <span className="font-mono text-[11px] text-primary font-bold px-1">
                              {seg.start.toFixed(1)}s
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdjustSegmentStart(seg, +0.1)}
                              className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                              title="Tiến mốc bắt đầu 0.1 giây"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {seg.audio_url && (
                              <button
                                type="button"
                                onClick={() => handlePlaySegmentAudio(seg.id, seg.audio_url!)}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 border transition-all cursor-pointer",
                                  isPlayingAudio
                                    ? "bg-primary text-black border-primary animate-pulse font-bold"
                                    : "bg-white/5 hover:bg-white/10 text-on-surface border-white/10"
                                )}
                                title="Nghe thử file âm thanh lồng tiếng riêng của câu này"
                              >
                                <Volume2 className="w-3 h-3 text-primary" />
                                <span>{isPlayingAudio ? "Đang phát..." : "Nghe thử"}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRedubSingleSegment(seg)}
                              disabled={seg.isRedubbing}
                              className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                              title="Chỉ thu lại duy nhất câu này bằng giọng đọc AI"
                            >
                              {seg.isRedubbing ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                  <span>Đang thu...</span>
                                </>
                              ) : (
                                <>
                                  <Mic className="w-3 h-3 text-primary" />
                                  <span>Thu lại</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleOpenAddSegment(seg.end, Math.round((seg.end + 2.5) * 10) / 10)
                              }
                              className="px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                              title="Chèn thêm một câu thoại ngay sau câu này"
                            >
                              <Plus className="w-3 h-3 text-primary" />
                              <span>+ Chèn</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteStudioSegment(seg.id)}
                              disabled={deletingSegId === seg.id}
                              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                              title="Xóa câu này khỏi video"
                            >
                              {deletingSegId === seg.id ? (
                                <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                              ) : (
                                <Trash2 className="w-3 h-3 text-rose-400" />
                              )}
                              <span>Xóa</span>
                            </button>
                          </div>
                        </div>

                        {seg.original_text && (
                          <div className="text-[11px] font-mono text-amber-300/80 bg-black/30 px-2.5 py-1 rounded-lg border border-amber-500/10">
                            <span className="text-amber-400 font-medium">Gốc: </span>
                            {seg.original_text}
                          </div>
                        )}

                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={seg.text}
                            onChange={(e) => updateStudioSegmentText(seg.id, e.target.value)}
                            onBlur={() => handleSyncSegmentUpdate(seg.id, seg.text, seg.start, seg.end)}
                            rows={2}
                            className="w-full text-xs bg-black/60 border border-white/10 rounded-xl p-2.5 text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed font-sans"
                            placeholder="Nhập câu thoại tiếng Việt..."
                          />
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-[10px] text-on-surface-variant/70">
                              💡 Sửa văn bản xong bấm nút bên phải để nạp lại câu này
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRedubSingleSegment(seg)}
                              disabled={seg.isRedubbing}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary/30 to-amber-500/30 hover:from-primary/40 hover:to-amber-500/40 text-primary border border-primary/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                            >
                              {seg.isRedubbing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                  <span>Đang nạp...</span>
                                </>
                              ) : (
                                <>
                                  <Mic className="w-3.5 h-3.5 text-primary" />
                                  <span>⚡ Nạp Lại Lời Thoại Này</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Phân vùng Chỉnh sửa phụ đề SRT & Lồng tiếng lại */}
            <div className="p-3.5 rounded-2xl bg-surface-variant/30 border border-primary/20 space-y-2.5 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                  <FileEdit className="w-3.5 h-3.5 text-primary" />
                  Chỉnh sửa phụ đề & Lồng tiếng lại toàn bộ:
                </span>
                <button
                  type="button"
                  onClick={handleToggleSrtEditor}
                  disabled={isLoadingSrt}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium disabled:opacity-50"
                >
                  {isLoadingSrt ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Đang tải phụ đề...</span>
                    </>
                  ) : showSrtEditor ? (
                    "Đóng trình sửa Web"
                  ) : (
                    "Sửa trực tiếp trên Web"
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleRedub()}
                disabled={isRedubbing || isProcessing}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-black text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                title="Lồng tiếng và render lại video theo nội dung file SRT đã sửa"
              >
                {isRedubbing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>Lồng tiếng lại theo SRT đã sửa</span>
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowMemoryModal(true)}
                  className="py-1.5 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-purple-500/10"
                  title="Xem và quản lý các bài học AI đã tự động ghi nhớ từ các lần bạn sửa phụ đề"
                >
                  <Brain className="w-3.5 h-3.5 text-purple-400" />
                  <span>Bộ nhớ tự học của AI ({memoryCount} bài học)</span>
                </button>

                <span className="text-[11px] text-on-surface-variant/70 italic hidden sm:inline">
                  Tự động học khi bạn lưu bản sửa
                </span>
              </div>

              <p className="text-[11px] text-on-surface-variant/80">
                💡 <b>Quy trình sửa từ ngữ:</b> Bấm <i>"Sửa trực tiếp trên Web"</i> ➔ Sửa câu từ / thuật ngữ ➔ Bấm <i>"Lưu & Lồng tiếng ngay"</i>.
              </p>

              {/* Trình soạn thảo SRT trực tiếp */}
              {showSrtEditor && (
                <div className="pt-2 border-t border-white/10 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-on-surface-variant font-medium">
                      Nội dung file phụ đề (.SRT):
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={handleSaveSrt}
                        disabled={isSavingSrt}
                        className="px-2.5 py-1 rounded-lg bg-surface-variant hover:bg-white/10 text-on-surface text-[11px] flex items-center gap-1 border border-white/10 cursor-pointer font-medium"
                      >
                        {isSavingSrt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 text-green-400" />}
                        Lưu phụ đề
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRedub(srtText)}
                        disabled={isRedubbing || isProcessing}
                        className="px-2.5 py-1 rounded-lg bg-primary text-black text-[11px] flex items-center gap-1 font-bold cursor-pointer hover:opacity-90"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Lưu & Lồng tiếng ngay
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={srtText}
                    onChange={(e) => setSrtText(e.target.value)}
                    rows={8}
                    className="w-full text-xs font-mono bg-black/60 border border-white/10 rounded-xl p-3 text-on-surface focus:outline-none focus:border-primary/50 resize-y"
                    placeholder="Đang tải nội dung file phụ đề SRT..."
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Chèn Thêm Câu Thoại Mới (Add Segment Modal) */}
      {showAddSegmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface border-2 border-primary/40 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-primary/20 text-primary">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Chèn Thêm Câu Thoại Mới</h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Tạo câu lồng tiếng và phụ đề mới tại mốc thời gian chỉ định
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSegmentModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitAddSegment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                    <span>Bắt đầu (giây):</span>
                    <span className="font-mono text-primary text-[11px]">{formatSrtTime(newSegStart)}</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newSegStart}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setNewSegStart(val);
                      if (val >= newSegEnd) {
                        setNewSegEnd(Math.round((val + 2.0) * 10) / 10);
                      }
                    }}
                    className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                    <span>Kết thúc (giây):</span>
                    <span className="font-mono text-primary text-[11px]">{formatSrtTime(newSegEnd)}</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={newSegStart + 0.1}
                    value={newSegEnd}
                    onChange={(e) => setNewSegEnd(parseFloat(e.target.value) || 0)}
                    className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                  <span className="text-on-surface font-semibold">Lời thoại dịch (tạo âm thanh & phụ đề):</span>
                  <span className="text-[10px] text-primary">{newSegText.length} ký tự</span>
                </label>
                <textarea
                  value={newSegText}
                  onChange={(e) => setNewSegText(e.target.value)}
                  rows={3}
                  placeholder="Nhập nội dung câu thoại bạn muốn thuyết minh vào đây..."
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface-variant">
                  Câu gốc (tùy chọn):
                </label>
                <input
                  type="text"
                  value={newSegOriginalText}
                  onChange={(e) => setNewSegOriginalText(e.target.value)}
                  placeholder="Ví dụ: 原文句子..."
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface-variant">
                  Giọng đọc tổng hợp câu này:
                </label>
                <select
                  value={newSegVoiceId}
                  onChange={(e) => {
                    setNewSegVoiceId(e.target.value);
                    const v = voices.find((item) => item.id === e.target.value);
                    if (v) setNewSegEngine(v.engine);
                  }}
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender}) - {v.engine}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddSegmentModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant text-xs font-semibold cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAddingSegment || !newSegText.trim()}
                  className="px-5 py-2 rounded-xl bg-primary text-black text-xs font-bold flex items-center gap-1.5 hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isAddingSegment ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Đang tạo giọng đọc...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-black" />
                      <span>Xác Nhận & Nạp Câu Thoại</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal quản lý Bộ nhớ tự học của AI */}
      <TranslationMemoryModal
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
        onMemoryChanged={fetchMemoryCount}
      />
    </div>
  );
}
