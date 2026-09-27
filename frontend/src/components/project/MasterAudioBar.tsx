import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  Download,
  FileText,
  Sparkles,
  Video,
  CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { downloadAudioFile } from "../../utils/download";
import { useTTSStore } from "../../store/useTTSStore";
import { toast } from "sonner";

interface MasterAudioBarProps {
  audioUrl: string;
  srtUrl?: string;
  duration?: number;
  projectName: string;
}

export function MasterAudioBar({
  audioUrl,
  srtUrl,
  duration,
  projectName,
}: MasterAudioBarProps) {
  const navigate = useNavigate();
  const { setPendingVoiceForVideo } = useTTSStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSendToAutoCaption = () => {
    // Gán vào state pendingVoiceForVideo và chuyển trang AutoCaption
    setPendingVoiceForVideo({
      id: Math.random().toString(36).substring(2, 9),
      text: `Dự án: ${projectName}`,
      url: audioUrl,
      timestamp: Date.now(),
    });
    toast.success("Đã chuyển âm thanh sang Auto Caption!");
    navigate("/autocaption");
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-primary/30 bg-surface/90 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-primary/10 rounded-bl-full blur-2xl pointer-events-none"></div>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex flex-col gap-4">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-primary shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-label-caps text-sm font-bold text-on-surface flex items-center gap-2">
                <span>File Âm thanh Master Hoàn chỉnh</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono-data border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Đã ghép nối
                </span>
              </h4>
              <p className="text-xs text-on-surface-variant">
                Đã đồng bộ toàn bộ các phân đoạn kịch bản và khoảng lặng chính xác
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tải MP3 */}
            <button
              type="button"
              onClick={() =>
                downloadAudioFile(audioUrl, `${projectName || "master_audio"}.mp3`)
              }
              className="px-3.5 py-1.5 rounded-xl bg-primary text-black font-semibold text-xs font-label-caps hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              Tải Audio Master (.mp3)
            </button>

            {/* Tải SRT nếu có */}
            {srtUrl && (
              <button
                type="button"
                onClick={() =>
                  downloadAudioFile(srtUrl, `${projectName || "subtitles"}.srt`)
                }
                className="px-3.5 py-1.5 rounded-xl bg-surface-variant hover:bg-white/10 text-on-surface text-xs font-label-caps border border-white/10 transition-colors flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-primary" />
                Tải Phụ đề (.srt)
              </button>
            )}

            {/* Chuyển sang Auto Caption */}
            <button
              type="button"
              onClick={handleSendToAutoCaption}
              className="px-3.5 py-1.5 rounded-xl bg-surface-variant hover:bg-white/10 text-on-surface text-xs font-label-caps border border-white/10 transition-colors flex items-center gap-1.5"
              title="Tự động nhận diện giọng nói và tạo phụ đề video từ file Master này"
            >
              <Video className="w-4 h-4 text-emerald-400" />
              Tạo Video Auto Caption
            </button>
          </div>
        </div>

        {/* Audio Player Controls */}
        <div className="flex items-center gap-4">
          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-11 h-11 rounded-xl bg-primary text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shrink-0"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Time & Seekbar */}
          <div className="flex-1 flex flex-col gap-1">
            <input
              type="range"
              min="0"
              max={totalDuration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-primary h-2 bg-surface-dim rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono-data text-on-surface-variant">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(totalDuration)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
