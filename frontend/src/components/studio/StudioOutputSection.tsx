import React, { useRef, useState, useMemo } from "react";
import {
  Layers,
  Plus,
  Loader2,
  FolderPlus,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Undo2,
  Redo2,
  Music,
} from "lucide-react";
import { ScriptBlockItem } from "../project/ScriptBlockItem";
import { useTTSStore, type ScriptBlock, type Voice } from "../../store/useTTSStore";
import { globalAudio } from "../../utils/audioCoordinator";
import { toast } from "sonner";

interface StudioOutputSectionProps {
  audioUrl: string | null;
  elapsedTime: number;
  onNavigateToVideo: () => void;
  onDownload: () => void;
  onOpenBgmModal?: () => void;
  studioBlocks: ScriptBlock[];
  voices: Voice[];
  hasModifiedSegments: boolean;
  isUpdatingMaster: boolean;
  onUpdateMasterAudio: () => void;
  onOpenSaveProjectModal: () => void;
  isSegmentsCollapsed: boolean;
  onToggleCollapseSegments: () => void;
  playingStudioBlockId: string | null;
  onPlayBlock: (block: ScriptBlock) => void;
  onStopPlayback: () => void;
  onUpdateBlock: (id: string, updated: Partial<ScriptBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onMoveBlock: (index: number, direction: -1 | 1) => void;
  onInsertBlockBelow: (index: number) => void;
  onAddBlock: () => void;
  onRenderBlock: (id: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const StudioOutputSection: React.FC<StudioOutputSectionProps> = ({
  audioUrl,
  elapsedTime,
  onNavigateToVideo,
  onDownload,
  onOpenBgmModal,
  studioBlocks,
  voices,
  hasModifiedSegments,
  isUpdatingMaster,
  onUpdateMasterAudio,
  onOpenSaveProjectModal,
  isSegmentsCollapsed,
  onToggleCollapseSegments,
  playingStudioBlockId,
  onPlayBlock,
  onStopPlayback,
  onUpdateBlock,
  onDeleteBlock,
  onMoveBlock,
  onInsertBlockBelow,
  onAddBlock,
  onRenderBlock,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const [activePlaybackBlockId, setActivePlaybackBlockId] = useState<string | null>(null);
  const isMasterPlayingRef = useRef(false);
  const syncStatus = useTTSStore((state) => state.syncStatus);
  const isCloudStorage = syncStatus?.mode === "cloud";

  const handleOpenOutputFolder = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/settings/open-output-directory", {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Đang mở thư mục lưu trữ trên máy tính...");
      } else {
        toast.error("Không thể mở thư mục.");
      }
    } catch {
      toast.error("Không thể kết nối đến máy chủ để mở thư mục.");
    }
  };

  // Tính toán timeline cho từng block dựa vào duration và pauseAfter
  const blockTimelines = useMemo(() => {
    let current = 0;
    return studioBlocks.map((b) => {
      const dur = b.duration || 0;
      const pause = typeof b.pauseAfter === "number" ? b.pauseAfter : 0.45;
      const start = current;
      const end = current + dur;
      current = end + pause;
      return { id: b.id, start, end };
    });
  }, [studioBlocks]);

  const handleTimeUpdate = (currentTime: number) => {
    if (!isMasterPlayingRef.current) return;
    const active = blockTimelines.find((t, i) => {
      const nextStart = blockTimelines[i + 1]?.start ?? t.end + 10;
      return currentTime >= t.start && currentTime < nextStart;
    });

    const newId = active ? active.id : null;
    if (newId !== activePlaybackBlockId) {
      setActivePlaybackBlockId(newId);
      if (newId) {
        const el = document.getElementById(`studio-block-${newId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }
  };

  const handleSeekMaster = (blockIndex: number) => {
    if (!masterAudioRef.current || !blockTimelines[blockIndex]) return;
    const targetStart = blockTimelines[blockIndex].start;
    masterAudioRef.current.currentTime = targetStart;
    if (masterAudioRef.current.paused) {
      masterAudioRef.current.play().catch(() => {});
    }
  };

  if (!audioUrl && studioBlocks.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 mt-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
      {/* Trình phát Audio Tổng thể */}
      {audioUrl && (
        <div className="flex flex-col gap-4 bg-primary/5 p-5 2k:p-6 rounded-2xl border border-primary/20 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                headphones
              </span>
              Âm thanh đầu ra (Bản hoàn chỉnh)
            </span>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-surface-dim px-2.5 py-1 rounded-lg border border-white/10 text-on-surface-variant font-mono-data text-[10px]">
                <span className="material-symbols-outlined text-[14px]">
                  timer
                </span>
                {String(Math.floor(elapsedTime / 60)).padStart(2, "0")}:
                {String(elapsedTime % 60).padStart(2, "0")}
              </div>
              <button
                type="button"
                onClick={onNavigateToVideo}
                className="px-3.5 py-1.5 bg-primary/20 hover:bg-primary hover:text-black text-primary border border-primary/40 rounded-lg font-label-caps text-xs transition-all shadow-sm flex items-center gap-1.5 font-semibold group"
                title="Chuyển sang làm video với giọng đọc này trong Auto Caption Studio"
              >
                <span className="material-symbols-outlined text-[16px] group-hover:rotate-6 transition-transform">
                  movie_edit
                </span>
                LÀM VIDEO NGAY
              </button>
              {onOpenBgmModal && (
                <button
                  type="button"
                  onClick={onOpenBgmModal}
                  className="px-3.5 py-1.5 bg-indigo-500/15 hover:bg-indigo-500 hover:text-white text-indigo-300 border border-indigo-500/40 rounded-lg font-label-caps text-xs transition-all shadow-sm flex items-center gap-1.5 font-semibold group"
                  title="Lồng nhạc nền và tự động giảm âm lượng khi nói (DSP Sidechain Auto-Ducking)"
                >
                  <Music className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white transition-colors" />
                  LỒNG NHẠC NỀN (BGM)
                </button>
              )}
              {isCloudStorage ? (
                <button
                  type="button"
                  onClick={onDownload}
                  className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface border border-white/10 rounded-lg font-label-caps text-xs transition-colors shadow-sm flex items-center gap-2 font-medium cursor-pointer"
                  title="Tải file âm thanh về máy từ Cloud Storage"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    download
                  </span>
                  TẢI VỀ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenOutputFolder}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface border border-white/10 rounded-lg font-label-caps text-xs transition-colors shadow-sm flex items-center gap-1.5 font-medium cursor-pointer"
                  title="Mở thư mục lưu trữ file audio trên máy tính"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    folder_open
                  </span>
                  MỞ THƯ MỤC
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <audio
              ref={masterAudioRef}
              src={audioUrl}
              controls
              className="w-full h-10 outline-none"
              style={{ colorScheme: "dark" }}
              onPlay={() => {
                isMasterPlayingRef.current = true;
                if (masterAudioRef.current) {
                  globalAudio.play(masterAudioRef.current);
                }
              }}
              onPause={() => {
                isMasterPlayingRef.current = false;
              }}
              onEnded={() => {
                isMasterPlayingRef.current = false;
                setActivePlaybackBlockId(null);
              }}
              onTimeUpdate={(e) => {
                handleTimeUpdate(e.currentTarget.currentTime);
              }}
              onError={() => {
                console.warn("File âm thanh chính không khả dụng hoặc đã hết hạn.");
              }}
            ></audio>
          </div>
        </div>
      )}

      {/* Danh sách phân đoạn câu */}
      {studioBlocks.length > 0 && (
        <div className="flex flex-col gap-4 p-5 rounded-2xl bg-surface-dim/60 border border-white/10 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-label-caps text-xs text-on-surface font-semibold">
                    Chi tiết phân đoạn câu
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-data font-bold bg-primary/15 text-primary border border-primary/20">
                    {studioBlocks.length} câu
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant/70">
                  Nghe thấy câu nào chưa vừa ý? Bạn có thể chỉnh sửa và render lại riêng câu đó bên dưới.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Nút cập nhật lại Audio chính khi có câu vừa được render lại */}
              {hasModifiedSegments && (
                <button
                  type="button"
                  onClick={onUpdateMasterAudio}
                  disabled={isUpdatingMaster}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-black font-semibold text-xs font-label-caps flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse hover:brightness-110 transition-all"
                  title="Ghép lại các câu và cập nhật vào file âm thanh chính ở trên"
                >
                  {isUpdatingMaster ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  ⚡ CẬP NHẬT AUDIO CHÍNH
                </button>
              )}

              {/* Nút Undo / Redo cho phân đoạn câu */}
              {(onUndo || onRedo) && (
                <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5">
                  {onUndo && (
                    <button
                      type="button"
                      onClick={onUndo}
                      disabled={!canUndo}
                      className={`p-1.5 rounded-md transition-colors ${
                        canUndo
                          ? "text-on-surface-variant hover:text-on-surface hover:bg-white/10 cursor-pointer"
                          : "text-on-surface-variant/30 cursor-not-allowed"
                      }`}
                      title="Hoàn tác (Ctrl+Z)"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onRedo && (
                    <button
                      type="button"
                      onClick={onRedo}
                      disabled={!canRedo}
                      className={`p-1.5 rounded-md transition-colors ${
                        canRedo
                          ? "text-on-surface-variant hover:text-on-surface hover:bg-white/10 cursor-pointer"
                          : "text-on-surface-variant/30 cursor-not-allowed"
                      }`}
                      title="Làm lại (Ctrl+Y)"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={onOpenSaveProjectModal}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface border border-white/10 text-xs font-label-caps flex items-center gap-1.5 transition-all"
                title="Lưu các phân đoạn này vào một Dự án trong Thư viện"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Lưu vào Dự án
              </button>

              <button
                type="button"
                onClick={onToggleCollapseSegments}
                className="p-1.5 rounded-lg hover:bg-white/10 text-on-surface-variant transition-colors"
                title={isSegmentsCollapsed ? "Mở rộng danh sách" : "Thu gọn danh sách"}
              >
                {isSegmentsCollapsed ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Danh sách các câu cuộn gọn gàng (vùng hiển thị tối đa ~10 câu) */}
          {!isSegmentsCollapsed && (
            <div className="flex flex-col gap-2">
              <div className="max-h-[760px] overflow-y-auto pr-1 flex flex-col gap-2">
                {studioBlocks.map((block, idx) => (
                  <ScriptBlockItem
                    key={block.id}
                    block={block}
                    index={idx}
                    total={studioBlocks.length}
                    voices={voices}
                    isPlaying={playingStudioBlockId === block.id}
                    isHighlighted={activePlaybackBlockId === block.id}
                    onSeekToThisBlock={audioUrl ? () => handleSeekMaster(idx) : undefined}
                    onPlay={() => {
                      if (masterAudioRef.current && !masterAudioRef.current.paused) {
                        masterAudioRef.current.pause();
                      }
                      onPlayBlock(block);
                    }}
                    onStop={onStopPlayback}
                    onUpdate={(updated) => onUpdateBlock(block.id, updated)}
                    onDelete={() => onDeleteBlock(block.id)}
                    onMoveUp={() => onMoveBlock(idx, -1)}
                    onMoveDown={() => onMoveBlock(idx, 1)}
                    onInsertBelow={() => onInsertBlockBelow(idx)}
                    onRender={() => onRenderBlock(block.id)}
                  />
                ))}

                <button
                  type="button"
                  onClick={onAddBlock}
                  className="py-2.5 px-3 rounded-lg border border-dashed border-white/10 hover:border-primary/40 bg-white/5 hover:bg-primary/5 text-on-surface-variant hover:text-primary transition-all flex items-center justify-center gap-1.5 text-xs font-label-caps group shadow-inner mt-1"
                >
                  <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                  Thêm câu mới (+1)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
