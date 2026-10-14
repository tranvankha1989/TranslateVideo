import React from "react";
import {
  Video,
  MoveVertical,
  RotateCcw,
  CheckCheck,
  Play,
  Pause,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type CaptionSegment, type StyleConfig } from "../types";

interface VideoPlayerPreviewProps {
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  videoAspectRatio: number | null;
  isFullscreen: boolean;
  isPlaying: boolean;
  currentTime: number;
  videoDuration: number;
  activeSegment: CaptionSegment | null;
  activeWordIdx: number;
  currentSegmentY: number;
  style: StyleConfig;
  interactiveDrag?: boolean;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onEnded: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  handleToggleFullscreen: () => void;
  handleCaptionMouseDown?: (e: React.MouseEvent) => void;
  handleResetSegmentPosition?: (segId: number) => void;
  handleApplyPositionToAll?: (posY: number) => void;
}

export const VideoPlayerPreview: React.FC<VideoPlayerPreviewProps> = ({
  videoContainerRef,
  videoRef,
  videoUrl,
  videoAspectRatio,
  isFullscreen,
  isPlaying,
  currentTime,
  videoDuration,
  activeSegment,
  activeWordIdx,
  currentSegmentY,
  style,
  interactiveDrag = false,
  onLoadedMetadata,
  onEnded,
  togglePlay,
  seekTo,
  handleToggleFullscreen,
  handleCaptionMouseDown,
  handleResetSegmentPosition,
  handleApplyPositionToAll,
}) => {
  const displaySegment = activeSegment;

  return (
    <div
      ref={videoContainerRef}
      style={{
        aspectRatio: videoAspectRatio ? `${videoAspectRatio}` : "16 / 9",
      }}
      className={cn(
        "relative w-full max-h-[72vh] 2k:max-h-[80vh] bg-black/95 rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center select-none group",
        isFullscreen && "rounded-none border-0 max-h-screen",
      )}
    >
      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onEnded}
            className="w-full h-full object-contain pointer-events-auto cursor-pointer select-none"
            onClick={togglePlay}
            playsInline
          />

          {/* Kinetic Subtitle Overlay */}
          <div
            onMouseDown={interactiveDrag ? handleCaptionMouseDown : undefined}
            className={cn(
              "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center px-4 py-1",
              interactiveDrag
                ? "pointer-events-auto cursor-move group/caption"
                : "pointer-events-none",
            )}
            style={{
              top: `${currentSegmentY}%`,
            }}
            title={
              interactiveDrag
                ? "Nhấp giữ để kéo vị trí hiển thị chữ lên xuống trên video"
                : undefined
            }
          >
            {/* Badge định vị Y và nút thao tác nhanh */}
            {interactiveDrag && (
              <div className="opacity-0 group-hover/caption:opacity-100 transition-opacity bg-black/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/15 text-[10px] text-white flex items-center gap-1.5 mb-1.5 shadow-lg pointer-events-auto">
                <MoveVertical className="w-3 h-3 text-primary" />
                <span className="font-mono text-white/90">
                  Y: {currentSegmentY}%
                </span>
                {activeSegment?.customPositionY !== undefined ? (
                  <>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium text-[9px] border border-amber-500/30">
                      Đoạn riêng
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeSegment && handleResetSegmentPosition)
                          handleResetSegmentPosition(activeSegment.id);
                      }}
                      className="text-[9px] text-white/60 hover:text-white underline ml-1 cursor-pointer"
                    >
                      Đặt lại
                    </button>
                  </>
                ) : (
                  <span className="text-white/40 text-[9px]">(Chung)</span>
                )}
                {handleApplyPositionToAll && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplyPositionToAll(currentSegmentY);
                    }}
                    className="text-[9px] text-primary hover:text-primary-fixed-dim font-semibold underline ml-1 cursor-pointer flex items-center gap-0.5"
                  >
                    <CheckCheck className="w-2.5 h-2.5" />
                    <span>Áp dụng tất cả</span>
                  </button>
                )}
              </div>
            )}

            {/* Render chữ Kinetic Karaoke */}
            {displaySegment
              ? (() => {
                  const plainText = displaySegment.words
                    .map((w) => w.word.toLowerCase())
                    .join(" ");
                  const charCount = plainText.length;
                  const fitScale =
                    charCount > 25 ? Math.max(0.65, 25 / charCount) : 1;
                  const computedFontSize = Math.round(
                    style.font_size * fitScale,
                  );

                  return (
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "flex flex-nowrap justify-center items-center gap-x-2 text-center max-w-[96%] px-3 py-1.5 rounded-xl bg-black/30 backdrop-blur-[2px] border border-white/10 transition whitespace-nowrap overflow-hidden select-none shadow-lg",
                          interactiveDrag &&
                            "group-hover/caption:border-primary/40",
                        )}
                      >
                        {displaySegment.words.map((w, idx) => {
                          const isCurrent = activeSegment
                            ? idx === activeWordIdx
                            : idx === 0;

                          return (
                            <span
                              key={idx}
                              className={cn(
                                "font-black tracking-wide transition-all duration-150 inline-block shrink-0 select-none",
                                isCurrent
                                  ? "scale-110 drop-shadow-[0_0_15px_rgba(255,255,0,0.8)] z-10"
                                  : "opacity-90",
                              )}
                              style={{
                                fontFamily: style.font_name,
                                fontSize: `${computedFontSize}px`,
                                color: isCurrent
                                  ? style.highlight_color
                                  : style.primary_color,
                                WebkitTextStroke: `${style.outline_size}px ${style.outline_color}`,
                                paintOrder: "stroke fill",
                              }}
                            >
                              {w.word.toLowerCase()}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              : null}
          </div>

          {/* Floating Player Control Bar */}
          <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-30 border border-white/10">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition cursor-pointer"
                title={isPlaying ? "Tạm dừng (Space)" : "Phát video (Space)"}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
              </button>
              <button
                onClick={() => seekTo(0)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface transition cursor-pointer"
                title="Phát lại từ đầu"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono text-on-surface">
                {currentTime.toFixed(1)}s / {videoDuration.toFixed(1)}s
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-on-surface-variant flex items-center gap-1">
                <MoveVertical className="w-3 h-3 text-primary" />
                Y: {currentSegmentY}%
              </span>

              <button
                onClick={handleToggleFullscreen}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1 text-xs cursor-pointer"
                title={
                  isFullscreen
                    ? "Thu nhỏ màn hình (Esc)"
                    : "Phóng to toàn màn hình (Fullscreen)"
                }
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline text-[11px]">
                  {isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
                </span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-variant/40 flex items-center justify-center text-primary/80 border border-white/5">
            <Video className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-on-surface">
              Chưa có video nào được chọn
            </h3>
            <p className="text-sm text-on-surface-variant max-w-sm mt-1">
              Hãy quay lại Bước 1 để tải file video lên hệ thống
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
