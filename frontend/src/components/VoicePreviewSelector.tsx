import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Square,
  ChevronDown,
  Sparkles,
  Mic,
  Globe,
  Loader2,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type VoiceOption } from "@/store/useVideoTranslateStore";
import { API_BASE_URL } from "@/constants/api";

interface VoicePreviewSelectorProps {
  voices: VoiceOption[];
  selectedVoice: string;
  onSelectVoice: (voiceId: string, engine: string) => void;
  className?: string;
}

export const VoicePreviewSelector: React.FC<VoicePreviewSelectorProps> = ({
  voices,
  selectedVoice,
  onSelectVoice,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hoverTimerRef = useRef<any>(null);

  // Khởi tạo đối tượng Audio một lần duy nhất
  useEffect(() => {
    const audio = new Audio();
    audio.onended = () => {
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
    };
    audio.onerror = () => {
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
    };
    audio.oncanplay = () => {
      setLoadingVoiceId(null);
    };
    audioRef.current = audio;

    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        handleStopAudio();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Dừng phát âm thanh
  const handleStopAudio = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingVoiceId(null);
    setLoadingVoiceId(null);
  };

  // Phát audio nghe thử của một giọng đọc
  const handlePlayPreview = async (v: VoiceOption, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Nếu đang phát chính giọng này thì dừng
    if (playingVoiceId === v.id) {
      handleStopAudio();
      return;
    }

    handleStopAudio();
    setLoadingVoiceId(v.id);
    setPlayingVoiceId(v.id);

    try {
      let previewUrl = v.preview_url || v.url;
      if (!previewUrl) {
        if (v.engine === "omnivoice") {
          const vKey = v.voice_key || v.id.replace("omnivoice:", "");
          previewUrl = v.type === "preset" ? `/presets/${vKey}.wav` : `/presets/custom/${vKey}.wav`;
        } else {
          previewUrl = `/api/dubbing/preview-voice?voice_id=${encodeURIComponent(v.id)}&lang=${encodeURIComponent(v.lang || "vi")}`;
        }
      }

      // Chuẩn hóa đường dẫn đầy đủ nếu là đường dẫn tương đối
      let fullUrl = previewUrl;
      if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
        fullUrl = `${API_BASE_URL}${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
      }

      if (audioRef.current) {
        audioRef.current.src = fullUrl;
        audioRef.current.load();
        await audioRef.current.play();
      }
    } catch (err) {
      console.error("Lỗi phát audio preview giọng đọc:", err);
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
    }
  };

  // Rê chuột tự động phát thử (Hover-to-Play) với độ trễ 200ms
  const handleMouseEnterVoice = (v: VoiceOption) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      handlePlayPreview(v);
    }, 200);
  };

  const currentVoiceObj = voices.find((v) => v.id === selectedVoice);
  const studioVoices = voices.filter((v) => v.engine === "omnivoice");
  const edgeVoices = voices.filter((v) => v.engine !== "omnivoice");

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Selector Trigger Bar (Toàn chiều rộng, không nút ngoài) */}
      <button
        type="button"
        onClick={() => {
          if (isOpen) handleStopAudio();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-all text-left cursor-pointer",
          isOpen
            ? "bg-surface-variant/90 border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/30 text-on-surface"
            : "bg-surface-variant/60 hover:bg-surface-variant/80 border-white/10 text-on-surface hover:border-white/20"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          {currentVoiceObj?.engine === "omnivoice" ? (
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 border border-cyan-500/30">
              <Globe className="w-3.5 h-3.5" />
            </div>
          )}

          <div className="flex flex-col min-w-0">
            <span className="font-medium truncate text-sm text-zinc-100">
              {currentVoiceObj?.name || "Chọn giọng đọc lồng tiếng..."}
            </span>
            <span className="text-[10px] text-on-surface-variant flex items-center gap-1.5">
              {currentVoiceObj?.engine === "omnivoice" ? (
                <span className="text-amber-400 font-semibold">🎙️ Giọng Phòng Thu / Clone</span>
              ) : (
                <span className="text-cyan-400 font-semibold">🌐 Edge-TTS ({currentVoiceObj?.gender || "AI"})</span>
              )}
              {currentVoiceObj?.lang && <span>• {currentVoiceObj.lang.toUpperCase()}</span>}
            </span>
          </div>
        </div>

        <ChevronDown
          className={cn(
            "w-4 h-4 text-on-surface-variant transition-transform shrink-0",
            isOpen && "-rotate-180 text-primary"
          )}
        />
      </button>

      {/* Dropdown Sổ Lên Trên (bottom-full mb-2) với hiệu ứng kính mờ cực sâu (Ultra Frosted Glass - Blur 50px) */}
      {isOpen && (
        <div
          style={{
            backgroundColor: "rgba(14, 16, 24, 0.78)",
            backdropFilter: "blur(50px) saturate(200%)",
            WebkitBackdropFilter: "blur(50px) saturate(200%)",
          }}
          className="absolute left-0 right-0 bottom-full mb-2 z-50 border border-white/15 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] ring-1 ring-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[260px] flex flex-col"
        >
          {/* Header hướng dẫn */}
          <div
            style={{
              backgroundColor: "rgba(10, 11, 16, 0.6)",
              backdropFilter: "blur(30px)",
              WebkitBackdropFilter: "blur(30px)",
            }}
            className="px-3.5 py-1.5 border-b border-white/10 flex items-center justify-between text-xs text-on-surface-variant shrink-0"
          >
            <span className="font-semibold text-zinc-200">Chọn Giọng Đọc ({voices.length} giọng)</span>
            <span className="text-[10px] text-amber-400 flex items-center gap-1 font-medium">
              <Volume2 className="w-3 h-3 animate-pulse text-amber-400" />
              Rê chuột để tự động nghe thử
            </span>
          </div>

          {/* List Content cuộn mượt mà */}
          <div
            className="overflow-y-auto p-1.5 space-y-2.5 divide-y divide-white/5"
            onMouseLeave={handleStopAudio}
          >
            {/* 1. Nhóm Giọng Phòng Thu Studio */}
            {studioVoices.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Mic className="w-3 h-3" />
                  <span>Giọng Phòng Thu (Studio / AI Cloned)</span>
                </div>
                {studioVoices.map((v) => {
                  const isSelected = v.id === selectedVoice;
                  const isPlaying = playingVoiceId === v.id;
                  const isLoading = loadingVoiceId === v.id;

                  return (
                    <div
                      key={v.id}
                      onMouseEnter={() => handleMouseEnterVoice(v)}
                      onClick={() => {
                        handleStopAudio();
                        onSelectVoice(v.id, v.engine);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "group flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer border",
                        isSelected
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-200 font-medium"
                          : "hover:bg-white/5 border-transparent text-zinc-200"
                      )}
                    >
                      {/* Nút Play / Loa âm thanh ở BÊN TRÁI */}
                      <button
                        type="button"
                        onClick={(e) => handlePlayPreview(v, e)}
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center transition-all shrink-0 border cursor-pointer",
                          isPlaying
                            ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/30 font-bold scale-105"
                            : "bg-zinc-800/80 hover:bg-amber-500/20 text-amber-400 border-zinc-700/60 group-hover:border-amber-500/40"
                        )}
                        title={isPlaying ? "Dừng" : "Phát thử"}
                      >
                        {isLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isPlaying ? (
                          <Square className="w-2.5 h-2.5 fill-current" />
                        ) : (
                          <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Thông tin giọng đọc */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate font-medium text-xs leading-tight">{v.name}</span>
                        <span className="text-[10px] text-zinc-400 leading-tight">
                          {v.type === "preset" ? "Mẫu chuẩn phòng thu" : "Giọng Clone cá nhân"}
                        </span>
                      </div>

                      {/* Badge nếu đang chọn */}
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-semibold shrink-0">
                          Đang chọn
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. Nhóm Giọng Edge-TTS */}
            {edgeVoices.length > 0 && (
              <div className="space-y-0.5 pt-1.5">
                <div className="px-2 py-1 text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3 h-3" />
                  <span>Giọng Đọc Chuẩn Edge-TTS</span>
                </div>
                {edgeVoices.map((v) => {
                  const isSelected = v.id === selectedVoice;
                  const isPlaying = playingVoiceId === v.id;
                  const isLoading = loadingVoiceId === v.id;

                  return (
                    <div
                      key={v.id}
                      onMouseEnter={() => handleMouseEnterVoice(v)}
                      onClick={() => {
                        handleStopAudio();
                        onSelectVoice(v.id, v.engine);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "group flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer border",
                        isSelected
                          ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200 font-medium"
                          : "hover:bg-white/5 border-transparent text-zinc-200"
                      )}
                    >
                      {/* Nút Play / Loa âm thanh ở BÊN TRÁI */}
                      <button
                        type="button"
                        onClick={(e) => handlePlayPreview(v, e)}
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center transition-all shrink-0 border cursor-pointer",
                          isPlaying
                            ? "bg-cyan-500 text-zinc-950 border-cyan-400 shadow-md shadow-cyan-500/30 font-bold scale-105"
                            : "bg-zinc-800/80 hover:bg-cyan-500/20 text-cyan-400 border-zinc-700/60 group-hover:border-cyan-500/40"
                        )}
                        title={isPlaying ? "Dừng" : "Phát thử"}
                      >
                        {isLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isPlaying ? (
                          <Square className="w-2.5 h-2.5 fill-current" />
                        ) : (
                          <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                        )}
                      </button>

                      {/* Thông tin giọng đọc */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate font-medium text-xs leading-tight">{v.name}</span>
                        <span className="text-[10px] text-zinc-400 leading-tight">
                          {v.gender} • {v.lang?.toUpperCase()}
                        </span>
                      </div>

                      {/* Badge nếu đang chọn */}
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-semibold shrink-0">
                          Đang chọn
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
