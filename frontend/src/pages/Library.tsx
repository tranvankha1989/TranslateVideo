import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTTSStore, type AudioRecord } from "../store/useTTSStore";
import { toast } from "sonner";
import { downloadAudioFile } from "../utils/download";
import {
  FolderOpen,
  Volume2,
  Film,
  Download,
  Trash2,
  Play,
  FileText,
  Loader2,
  ExternalLink,
  Calendar,
  HardDrive,
  Search,
  RefreshCw,
  Clapperboard,
  Languages,
} from "lucide-react";

interface VideoProjectItem {
  task_id: string;
  created_at: number;
  source_lang: string;
  target_lang: string;
  translation_engine: string;
  voice_id: string;
  output_resolution?: string;
  has_video: boolean;
  has_srt: boolean;
  has_srt_original: boolean;
  video_url?: string;
  srt_url?: string;
  srt_original_url?: string;
  video_filename?: string;
  video_size_mb?: number;
  video_duration?: number;
}

export function AudioRecordItem({
  record,
  removeHistory,
}: {
  record: AudioRecord;
  removeHistory: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { projects, updateRecordProject, setPendingVoiceForVideo } = useTTSStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleEditVideo = () => {
    setPendingVoiceForVideo(record);
    toast.success("Đã chọn giọng đọc! Đang chuyển sang Video Studio...");
    navigate("/autocaption");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(record.text);
    toast.success("Đã copy văn bản!");
  };

  const isLongText = record.text.length > 120;

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!record.url) return;
    downloadAudioFile(record.url);
  };

  return (
    <div className="p-6 hover:bg-surface-variant/40 transition-colors flex flex-col gap-4">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 flex flex-col gap-3">
          <div className="relative">
            <p
              className={`font-body-md text-on-surface leading-relaxed ${!isExpanded ? "line-clamp-2" : ""}`}
            >
              "{record.text}"
            </p>
            <div className="flex items-center gap-4 mt-2">
              {isLongText && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-[11px] font-label-caps text-primary hover:text-primary/80 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {isExpanded ? "Thu gọn" : "Xem thêm"}
                  <span className="material-symbols-outlined text-[14px]">
                    {isExpanded ? "expand_less" : "expand_more"}
                  </span>
                </button>
              )}
              <button
                onClick={handleCopy}
                className="text-[11px] font-label-caps text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">
                  content_copy
                </span>
                Copy nội dung
              </button>
            </div>
          </div>

          {/* Tham số cấu hình */}
          <div className="flex flex-wrap gap-2 items-center">
            {record.voiceName && (
              <span className="inline-flex items-center gap-1.5 rounded bg-primary/10 px-2 py-1 text-[11px] font-label-caps text-primary border border-primary/20">
                <span className="material-symbols-outlined text-[14px]">
                  record_voice_over
                </span>
                {record.voiceName}
              </span>
            )}
            {record.speed !== undefined && (
              <span className="inline-flex items-center rounded bg-surface-variant px-2 py-1 text-[11px] font-mono-data text-on-surface-variant border border-white/5">
                Speed: {record.speed.toFixed(2)}x
              </span>
            )}
            {record.pitch !== undefined && (
              <span className="inline-flex items-center rounded bg-surface-variant px-2 py-1 text-[11px] font-mono-data text-on-surface-variant border border-white/5">
                Pitch: {record.pitch > 0 ? "+" : ""}
                {record.pitch.toFixed(1)}
              </span>
            )}
            {record.seed !== undefined && (
              <span className="inline-flex items-center rounded bg-surface-variant px-2 py-1 text-[11px] font-mono-data text-on-surface-variant border border-white/5">
                Seed: {record.seed}
              </span>
            )}
            {record.cfg_value !== undefined && (
              <span className="inline-flex items-center rounded bg-surface-variant px-2 py-1 text-[11px] font-mono-data text-on-surface-variant border border-white/5">
                CFG: {record.cfg_value}
              </span>
            )}
          </div>

          <p className="font-mono-data text-mono-data text-on-surface-variant/50 text-xs mt-1">
            ID: {record.id.toUpperCase()} •{" "}
            {new Date(record.timestamp).toLocaleString("vi-VN")}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={record.projectId || ""}
            onChange={(e) => {
              updateRecordProject(record.id, e.target.value || undefined);
              toast.success(
                e.target.value ? "Đã gán vào dự án" : "Đã gỡ khỏi dự án",
              );
            }}
            className="h-10 bg-surface-variant text-on-surface-variant font-label-caps text-xs px-3 rounded-lg border border-white/5 focus:outline-none focus:border-primary cursor-pointer hover:bg-white/10 transition-colors"
          >
            <option value="">-- Thư viện chung --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleEditVideo}
            className="h-10 px-3.5 flex items-center gap-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary hover:text-black font-semibold text-xs border border-primary/30 transition-all shadow-sm group cursor-pointer"
            title="Làm video với giọng đọc này trong Auto Caption Studio"
          >
            <span className="material-symbols-outlined text-[18px] group-hover:rotate-6 transition-transform">
              movie_edit
            </span>
            <span className="font-label-caps">Làm Video</span>
          </button>
          <button
            onClick={handleDownload}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-white/10 hover:text-primary transition-colors cursor-pointer"
            title="Tải xuống"
          >
            <span className="material-symbols-outlined text-[20px]">
              download
            </span>
          </button>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/20 hover:text-error transition-colors cursor-pointer"
            onClick={() => removeHistory(record.id)}
            title="Xóa khỏi lịch sử"
          >
            <span className="material-symbols-outlined text-[20px]">
              delete
            </span>
          </button>
        </div>
      </div>

      <audio
        controls
        src={record.url}
        className="w-full h-10 rounded focus:outline-none"
        style={{ colorScheme: "dark" }}
      />
    </div>
  );
}

function VideoProjectCard({
  project,
  onDelete,
}: {
  project: VideoProjectItem;
  onDelete: (taskId: string) => void;
}) {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const fullVideoUrl = project.video_url
    ? `http://localhost:8000${project.video_url}`
    : undefined;

  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleDownloadVideo = () => {
    if (!project.task_id) return;
    const downloadUrl = `http://localhost:8000/api/video-translate/download/${project.task_id}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `translated_${project.task_id}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Đang tải video thành phẩm về máy...");
  };

  const handleDownloadSrt = () => {
    if (!project.task_id) return;
    const downloadUrl = `http://localhost:8000/api/video-translate/download-srt/${project.task_id}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `subtitles_${project.task_id}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Đang tải file phụ đề SRT về máy...");
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-surface/90 border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row gap-5 hover:border-primary/40 transition-all shadow-lg backdrop-blur-md group">
      {/* Video Preview Box */}
      <div className="relative w-full md:w-64 aspect-video rounded-xl overflow-hidden bg-black/80 shrink-0 border border-white/10 shadow-inner flex items-center justify-center">
        {fullVideoUrl ? (
          <>
            <video
              ref={videoRef}
              src={fullVideoUrl}
              className="w-full h-full object-cover"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              controls
            />
            {!isPlaying && (
              <button
                type="button"
                onClick={handleTogglePlay}
                className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-primary/90 text-black flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-110 transition-transform cursor-pointer pointer-events-auto"
                title="Phát xem thử"
              >
                <Play className="w-5 h-5 fill-black ml-0.5" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-on-surface-variant/60">
            <Film className="w-8 h-8" />
            <span className="text-[11px]">Chưa kết xuất video</span>
          </div>
        )}

        {/* Resolution Badge */}
        {project.output_resolution && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 border border-white/20 text-[10px] font-mono font-bold text-primary backdrop-blur-sm">
            {project.output_resolution.toUpperCase()}
          </span>
        )}
      </div>

      {/* Info & Details */}
      <div className="flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold font-mono">
                  {project.source_lang?.toUpperCase() || "AUTO"} ➔ {project.target_lang?.toUpperCase() || "VI"}
                </span>
                <span className="text-xs font-mono text-on-surface-variant">
                  #{project.task_id.substring(0, 10)}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-on-surface mt-1">
                {project.video_filename || `Dự án Dịch Video ${project.task_id.substring(0, 8)}`}
              </h3>
            </div>

            {/* Date */}
            <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant/70 font-mono">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(project.created_at * 1000).toLocaleString("vi-VN")}
            </div>
          </div>

          {/* Badges / Metrics */}
          <div className="flex flex-wrap gap-2 text-[11px] pt-1">
            <span className="px-2 py-0.5 rounded-lg bg-surface-variant border border-white/5 text-on-surface-variant flex items-center gap-1">
              <Languages className="w-3 h-3 text-cyan-400" />
              Engine: <strong className="text-on-surface font-mono">{project.translation_engine || "Google"}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-surface-variant border border-white/5 text-on-surface-variant flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-amber-400" />
              Voice: <strong className="text-on-surface font-mono">{project.voice_id || "Mặc định"}</strong>
            </span>
            {project.video_duration !== undefined && project.video_duration > 0 && (
              <span className="px-2 py-0.5 rounded-lg bg-surface-variant border border-white/5 text-on-surface-variant flex items-center gap-1">
                ⏱️ Thời lượng: <strong className="text-on-surface font-mono">{formatDuration(project.video_duration)}</strong>
              </span>
            )}
            {project.video_size_mb !== undefined && project.video_size_mb > 0 && (
              <span className="px-2 py-0.5 rounded-lg bg-surface-variant border border-white/5 text-on-surface-variant flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-emerald-400" />
                Dung lượng: <strong className="text-on-surface font-mono">{project.video_size_mb.toFixed(1)} MB</strong>
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5 flex-wrap">
          <div className="flex items-center gap-2">
            {project.has_video && (
              <button
                type="button"
                onClick={handleDownloadVideo}
                className="px-3.5 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="Tải video thành phẩm MP4"
              >
                <Download className="w-3.5 h-3.5" />
                Tải MP4
              </button>
            )}

            {project.has_srt && (
              <button
                type="button"
                onClick={handleDownloadSrt}
                className="px-3.5 py-1.5 rounded-xl bg-surface-variant hover:bg-white/10 text-on-surface border border-white/10 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title="Tải file phụ đề Subtitle SRT"
              >
                <FileText className="w-3.5 h-3.5 text-secondary" />
                Tải SRT
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                navigate(`/video-translate?taskId=${project.task_id}`);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Mở dự án trong màn hình Dịch Video"
            >
              <ExternalLink className="w-3.5 h-3.5 text-primary" />
              Mở Dịch Video
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDelete(project.task_id)}
            className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 border border-transparent hover:border-error/20 transition-all cursor-pointer"
            title="Xóa vĩnh viễn dự án này"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Library() {
  const { history, removeHistory, cleanupJunkFiles } = useTTSStore();

  // Tab State: "audio" | "video"
  const [activeTab, setActiveTab] = useState<"audio" | "video">("audio");

  // Video Projects state
  const [videoProjects, setVideoProjects] = useState<VideoProjectItem[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Phân trang Audio
  const [currentPage, setCurrentPage] = useState(1);
  const [isCleaning, setIsCleaning] = useState(false);
  const itemsPerPage = 5;

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = history.slice(startIndex, startIndex + itemsPerPage);

  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages);
  }

  // Fetch Video Projects
  const fetchVideoProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch("http://localhost:8000/api/video-translate/tasks");
      if (!res.ok) throw new Error("Không thể tải danh sách dự án video");
      const data = await res.json();
      setVideoProjects(data.tasks || []);
    } catch (e: any) {
      console.error("Lỗi fetch video projects:", e);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "video") {
      fetchVideoProjects();
    }
  }, [activeTab, fetchVideoProjects]);

  const handleDeleteVideoProject = (taskId: string) => {
    toast("Bạn có chắc chắn muốn xóa toàn bộ file của dự án này?", {
      action: {
        label: "Xác nhận xóa",
        onClick: async () => {
          try {
            const res = await fetch(`http://localhost:8000/api/video-translate/tasks/${taskId}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error("Lỗi khi xóa dự án");
            toast.success("Đã xóa dự án video thành công!");
            setVideoProjects((prev) => prev.filter((p) => p.task_id !== taskId));
          } catch (e: any) {
            toast.error(e.message || "Không thể xóa dự án video");
          }
        },
      },
    });
  };

  const handleCleanJunk = async () => {
    setIsCleaning(true);
    const toastId = toast.loading("Đang quét và dọn dẹp các file âm thanh rác...");
    try {
      const res = await cleanupJunkFiles(true);
      if (res.deleted_count > 0) {
        toast.success(`Đã dọn dẹp ${res.deleted_count} file rác, giải phóng ${res.freed_mb} MB bộ nhớ!`, {
          id: toastId,
        });
      } else {
        toast.success("Hệ thống sạch sẽ! Không có file rác mồ côi nào.", { id: toastId });
      }
    } catch (e: any) {
      toast.error(`Lỗi dọn dẹp: ${e.message}`, { id: toastId });
    } finally {
      setIsCleaning(false);
    }
  };

  const filteredVideoProjects = videoProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.task_id.toLowerCase().includes(q) ||
      p.source_lang?.toLowerCase().includes(q) ||
      p.target_lang?.toLowerCase().includes(q) ||
      p.voice_id?.toLowerCase().includes(q) ||
      p.translation_engine?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="glass-card rounded-3xl w-full max-w-[1600px] 2k:max-w-[2000px] mx-auto p-6 md:p-8 2k:p-10 flex flex-col gap-8 shadow-2xl backdrop-blur-2xl border border-white/10">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-on-surface">
              Thư Viện Đa Phương Tiện
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Quản lý lịch sử giọng đọc TTS và các dự án dịch thuật lồng tiếng video
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1.5 bg-surface-dim/80 border border-white/10 rounded-2xl self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("audio")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "audio"
                ? "bg-primary text-black shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Lịch sử Giọng đọc ({history.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("video")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "video"
                ? "bg-primary text-black shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Dự án Dịch Video ({videoProjects.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Content 1: Audio Records */}
      {activeTab === "audio" && (
        <div className="flex flex-col gap-6 animate-fadeIn">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs font-medium text-on-surface-variant">
              Hiển thị các bản thu âm và chuyển văn bản thành giọng nói đã tạo
            </span>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCleanJunk}
                disabled={isCleaning}
                className="flex items-center gap-1.5 bg-surface-variant hover:bg-white/10 text-on-surface border border-white/10 px-3.5 py-2 rounded-xl font-label-caps text-xs transition-all shadow-sm cursor-pointer"
                title="Quét và xóa các file audio tạm/mồ côi trong thư mục outputs/ không còn được lưu"
              >
                <span className={`material-symbols-outlined text-[16px] ${isCleaning ? "animate-spin" : "text-amber-400"}`}>
                  {isCleaning ? "sync" : "mop"}
                </span>
                Dọn dẹp rác
              </button>
              <div className="bg-surface-variant px-3.5 py-1.5 rounded-xl text-xs font-mono-data text-on-surface-variant border border-white/5">
                {history.length} mục
              </div>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant font-mono-data text-mono-data border border-dashed border-white/10 rounded-2xl bg-surface-dim">
              Thư viện trống. Hãy tạo một đoạn âm thanh mới ở Phòng thu.
            </div>
          ) : (
            <>
              <div className="divide-y divide-white/5 border border-white/5 rounded-2xl bg-surface-dim overflow-hidden shadow-inner">
                {currentItems.map((record) => (
                  <AudioRecordItem
                    key={record.id}
                    record={record}
                    removeHistory={removeHistory}
                  />
                ))}
              </div>

              {/* Thanh điều hướng phân trang */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center bg-surface-dim p-4 rounded-2xl border border-white/5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-label-caps text-xs transition-colors cursor-pointer ${
                      currentPage === 1
                        ? "text-on-surface-variant/30 cursor-not-allowed"
                        : "text-on-surface-variant hover:text-primary hover:bg-primary/10"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      chevron_left
                    </span>
                    Trang trước
                  </button>
                  <div className="font-mono-data text-xs text-on-surface-variant">
                    Trang <span className="text-primary font-bold">{currentPage}</span> /{" "}
                    {totalPages}
                  </div>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-label-caps text-xs transition-colors cursor-pointer ${
                      currentPage === totalPages
                        ? "text-on-surface-variant/30 cursor-not-allowed"
                        : "text-on-surface-variant hover:text-primary hover:bg-primary/10"
                    }`}
                  >
                    Trang sau
                    <span className="material-symbols-outlined text-[16px]">
                      chevron_right
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab Content 2: Video Translation Projects */}
      {activeTab === "video" && (
        <div className="flex flex-col gap-6 animate-fadeIn">
          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm dự án theo ID, ngôn ngữ, giọng..."
                className="w-full pl-10 pr-4 py-2 bg-surface-dim border border-white/10 rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={fetchVideoProjects}
                disabled={isLoadingProjects}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-variant hover:bg-white/10 text-on-surface border border-white/10 text-xs font-semibold transition-all cursor-pointer"
                title="Làm mới danh sách dự án"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProjects ? "animate-spin text-primary" : ""}`} />
                Làm mới
              </button>
            </div>
          </div>

          {isLoadingProjects ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-xs font-medium">Đang tải danh sách dự án dịch video...</span>
            </div>
          ) : filteredVideoProjects.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant font-mono-data text-mono-data border border-dashed border-white/10 rounded-2xl bg-surface-dim flex flex-col items-center gap-3">
              <Film className="w-10 h-10 text-on-surface-variant/40" />
              <p className="text-sm text-on-surface">
                {searchQuery ? "Không tìm thấy dự án video phù hợp với từ khóa." : "Chưa có dự án dịch video nào được lưu lại."}
              </p>
              {!searchQuery && (
                <button
                  type="button"
                  onClick={() => window.location.assign("/video-translate")}
                  className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-black font-bold text-xs flex items-center gap-2 shadow-lg shadow-primary/20 hover:opacity-90 cursor-pointer"
                >
                  <Clapperboard className="w-4 h-4" />
                  Bắt Đầu Dịch Video Mới
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredVideoProjects.map((project) => (
                <VideoProjectCard
                  key={project.task_id}
                  project={project}
                  onDelete={handleDeleteVideoProject}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

