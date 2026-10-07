import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  AlertTriangle,
  X,
  Clock,
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
  onDeleteRequest,
}: {
  record: AudioRecord;
  onDeleteRequest: (record: AudioRecord) => void;
}) {
  const navigate = useNavigate();
  const { projects, updateRecordProject, setPendingVoiceForVideo } =
    useTTSStore();
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
            onClick={() => onDeleteRequest(record)}
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
  onDeleteRequest,
}: {
  project: VideoProjectItem;
  onDeleteRequest: (project: VideoProjectItem) => void;
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
                  {project.source_lang?.toUpperCase() || "AUTO"} ➔{" "}
                  {project.target_lang?.toUpperCase() || "VI"}
                </span>
                <span className="text-xs font-mono text-on-surface-variant">
                  #{project.task_id.substring(0, 10)}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-on-surface mt-1">
                {project.video_filename ||
                  `Dự án Dịch Video ${project.task_id.substring(0, 8)}`}
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
              Engine:{" "}
              <strong className="text-on-surface font-mono">
                {project.translation_engine || "Google"}
              </strong>
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-surface-variant border border-white/5 text-on-surface-variant flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-amber-400" />
              Voice:{" "}
              <strong className="text-on-surface font-mono">
                {project.voice_id || "Mặc định"}
              </strong>
            </span>
            {project.video_duration !== undefined &&
              project.video_duration > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-surface-variant border border-white/5 text-on-surface-variant flex items-center gap-1">
                  ⏱️ Thời lượng:{" "}
                  <strong className="text-on-surface font-mono">
                    {formatDuration(project.video_duration)}
                  </strong>
                </span>
              )}
            {project.video_size_mb !== undefined &&
              project.video_size_mb > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-surface-variant border border-white/5 text-on-surface-variant flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-emerald-400" />
                  Dung lượng:{" "}
                  <strong className="text-on-surface font-mono">
                    {project.video_size_mb.toFixed(1)} MB
                  </strong>
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
            onClick={() => onDeleteRequest(project)}
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

  // Tab State: "video" | "audio" (mặc định mở Lịch sử Dịch Video)
  const [activeTab, setActiveTab] = useState<"video" | "audio">("video");

  // Video Projects state
  const [videoProjects, setVideoProjects] = useState<VideoProjectItem[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Cài đặt thời gian lưu trữ dữ liệu (Retention Policy: 3, 7, 14, 30, 60 ngày hoặc 0 = vĩnh viễn)
  const [retentionDays, setRetentionDays] = useState<number>(() => {
    const saved = localStorage.getItem("library_retention_days");
    return saved !== null ? Number(saved) : 7; // Mặc định 7 ngày
  });

  // Modal xác nhận xóa tập trung ở GIỮA MÀN HÌNH (thay thế toast ở dưới đáy màn hình)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "video_single" | "audio_single" | "clear_active_tab";
    videoProject?: VideoProjectItem;
    audioRecord?: AudioRecord;
  } | null>(null);

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
      const res = await fetch(
        "http://localhost:8000/api/video-translate/tasks",
      );
      if (!res.ok) throw new Error("Không thể tải danh sách dự án video");
      const data = await res.json();
      setVideoProjects(data.tasks || []);
    } catch (e: any) {
      console.error("Lỗi fetch video projects:", e);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Tự động dọn dẹp các tệp cũ hơn số ngày lưu trữ
  const runAutoCleanup = useCallback(
    async (days: number, notifyUser: boolean = false) => {
      if (days <= 0) return;
      try {
        let totalFreedMb = 0;
        let deletedVideos = 0;
        let deletedAudios = 0;

        // 1. Dọn dẹp video projects cũ trên backend
        const res = await fetch(
          `http://localhost:8000/api/video-translate/cleanup-expired?days=${days}`,
          { method: "POST" },
        );
        if (res.ok) {
          const data = await res.json();
          totalFreedMb += Number(data.freed_mb || 0);
          deletedVideos += Number(data.deleted_count || 0);
        }

        // 2. Dọn dẹp audio records cũ trong history
        const cutoffTime = Date.now() - days * 86400 * 1000;
        const expiredAudios = history.filter((h) => h.timestamp < cutoffTime);
        if (expiredAudios.length > 0) {
          for (const item of expiredAudios) {
            await removeHistory(item.id);
            deletedAudios++;
          }
        }

        if (deletedVideos > 0 || deletedAudios > 0) {
          fetchVideoProjects();
          toast.success(
            `🧹 Đã tự động dọn dẹp ${deletedVideos} dự án video và ${deletedAudios} bản thu âm cũ hơn ${days} ngày (giải phóng ${totalFreedMb.toFixed(1)} MB)!`,
          );
        } else if (notifyUser) {
          toast.info(`Không có dữ liệu nào cũ hơn ${days} ngày cần dọn dẹp.`);
        }
      } catch (e: any) {
        if (notifyUser) toast.error(`Lỗi khi dọn dẹp tự động: ${e.message}`);
      }
    },
    [history, removeHistory, fetchVideoProjects],
  );

  const handleRetentionDaysChange = (days: number) => {
    setRetentionDays(days);
    localStorage.setItem("library_retention_days", String(days));
    if (days > 0) {
      toast.success(
        `Đã lưu cấu hình: Tự động xóa dữ liệu sau ${days} ngày để giải phóng dung lượng.`,
      );
      runAutoCleanup(days, true);
    } else {
      toast.info("Đã chọn lưu trữ Vĩnh viễn (Không tự xóa).");
    }
  };

  // Tải danh sách dự án video và chạy dọn dẹp định kỳ ngay khi vào trang
  useEffect(() => {
    fetchVideoProjects();
    const savedRetention = localStorage.getItem("library_retention_days");
    const days = savedRetention !== null ? Number(savedRetention) : 7;
    if (days > 0) {
      runAutoCleanup(days, false);
    }
  }, [fetchVideoProjects, runAutoCleanup]);

  // Xác nhận xóa thực tế từ modal ở giữa màn hình
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "video_single" && deleteTarget.videoProject) {
      const taskId = deleteTarget.videoProject.task_id;
      setDeleteTarget(null);
      try {
        const res = await fetch(
          `http://localhost:8000/api/video-translate/tasks/${taskId}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Lỗi khi xóa dự án");
        toast.success("Đã xóa vĩnh viễn dự án video thành công!");
        setVideoProjects((prev) => prev.filter((p) => p.task_id !== taskId));
      } catch (e: any) {
        toast.error(e.message || "Không thể xóa dự án video");
      }
    } else if (
      deleteTarget.type === "audio_single" &&
      deleteTarget.audioRecord
    ) {
      const recordId = deleteTarget.audioRecord.id;
      setDeleteTarget(null);
      try {
        await removeHistory(recordId);
        toast.success("Đã xóa bản thu âm khỏi lịch sử!");
      } catch (e: any) {
        toast.error("Không thể xóa bản thu âm: " + e.message);
      }
    } else if (deleteTarget.type === "clear_active_tab") {
      setDeleteTarget(null);
      await handleExecuteClearActiveTab();
    }
  };

  // Thực hiện Xóa bộ nhớ riêng theo từng tab đang mở
  const handleExecuteClearActiveTab = async () => {
    setIsCleaning(true);
    const toastId = toast.loading(
      activeTab === "video"
        ? "Đang xóa toàn bộ lịch sử video và giải phóng ổ đĩa..."
        : "Đang xóa toàn bộ lịch sử phòng thu và file âm thanh...",
    );

    try {
      let totalFreed = 0;

      if (activeTab === "video") {
        // 1. Xóa toàn bộ dự án video trên backend
        const resVt = await fetch(
          "http://localhost:8000/api/video-translate/tasks",
          { method: "DELETE" },
        );
        if (resVt.ok) {
          const dataVt = await resVt.json();
          totalFreed += Number(dataVt.freed_mb || 0);
        }
        // Dọn thêm cache alignment & captions tạm của video
        const resCleanup = await fetch(
          "http://localhost:8000/api/video-translate/cleanup-cache",
          { method: "POST" },
        );
        if (resCleanup.ok) {
          const dataCleanup = await resCleanup.json();
          totalFreed += Number(dataCleanup.freed_mb || 0);
        }
        setVideoProjects([]);
        toast.success(
          `Đã xóa toàn bộ lịch sử Dịch Video và giải phóng ${totalFreed.toFixed(1)} MB dung lượng!`,
          { id: toastId },
        );
      } else {
        // 2. Xóa toàn bộ bản thu âm phòng thu
        const junkRes = await cleanupJunkFiles(true);
        totalFreed += Number(junkRes.freed_mb || 0);

        // Xóa sạch các item history trong store
        for (const item of history) {
          await removeHistory(item.id);
        }
        toast.success(
          `Đã xóa toàn bộ lịch sử Phòng Thu và giải phóng ${totalFreed.toFixed(1)} MB dung lượng!`,
          { id: toastId },
        );
      }

      fetchVideoProjects();
    } catch (e: any) {
      toast.error(`Lỗi khi xóa bộ nhớ: ${e.message}`, { id: toastId });
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
      {/* Header & Tabs Container */}
      <div className="flex flex-col gap-6 border-b border-white/10 pb-6">
        {/* Hàng 1: Tiêu đề Thư Viện & Nút Xóa Bộ Nhớ Riêng Cho Tab Đang Chọn */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10 shrink-0">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-on-surface">
                Thư Viện Đa Phương Tiện
              </h1>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Quản lý lịch sử dự án dịch thuật video và các bản thu âm giọng
                đọc phòng thu
              </p>
            </div>
          </div>

          {/* Nhóm Cài đặt Lưu trữ & Nút Xóa Bộ Nhớ */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Bộ chọn thời gian lưu trữ dữ liệu (Retention Policy) */}
            <div className="flex items-center gap-2 bg-surface-dim/90 border border-white/10 px-3 py-2 rounded-xl text-xs shadow-xs">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <span className="text-on-surface-variant font-medium hidden sm:inline">
                Lưu trữ tối đa:
              </span>
              <select
                value={retentionDays}
                onChange={(e) =>
                  handleRetentionDaysChange(Number(e.target.value))
                }
                className="bg-surface-variant text-on-surface font-semibold text-xs px-2.5 py-1 rounded-lg border border-white/10 focus:outline-none focus:border-primary cursor-pointer  transition-colors"
                title="Dữ liệu cũ hơn thời gian này sẽ tự động được xóa để giải phóng dung lượng đĩa"
              >
                <option value={3}>3 ngày</option>
                <option value={7}>7 ngày (Khuyên dùng)</option>
                <option value={14}>14 ngày</option>
                <option value={30}>30 ngày</option>
                <option value={60}>60 ngày</option>
                <option value={0}>Vĩnh viễn (Không tự xóa)</option>
              </select>
              {retentionDays > 0 && (
                <button
                  type="button"
                  onClick={() => runAutoCleanup(retentionDays, true)}
                  disabled={isCleaning}
                  className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40"
                  title="Dọn dẹp ngay các tệp cũ hơn thời hạn"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isCleaning ? "animate-spin" : ""}`}
                  />
                  <span className="hidden md:inline">Dọn ngay</span>
                </button>
              )}
            </div>

            {/* Nút Xóa Bộ Nhớ theo Tab đang mở */}
            <button
              type="button"
              onClick={() => setDeleteTarget({ type: "clear_active_tab" })}
              disabled={
                isCleaning ||
                (activeTab === "video"
                  ? videoProjects.length === 0
                  : history.length === 0)
              }
              className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                activeTab === "video"
                  ? "Xóa toàn bộ lịch sử video và giải phóng dung lượng"
                  : "Xóa toàn bộ lịch sử phòng thu và giải phóng dung lượng"
              }
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>
                {activeTab === "video"
                  ? "Xóa Bộ Nhớ Video"
                  : "Xóa Bộ Nhớ Phòng Thu"}
              </span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Vị trí chuyển 2 tính năng (Tab Switcher) đặt ngay dưới tiêu đề Thư Viện */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-surface-dim/80 border border-white/10 rounded-2xl w-full sm:w-auto self-start">
          <button
            type="button"
            onClick={() => setActiveTab("video")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "video"
                ? "bg-primary text-black shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Lịch Sử Dịch Video ({videoProjects.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audio")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "audio"
                ? "bg-primary text-black shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Lịch Sử Phòng Thu ({history.length})</span>
          </button>
        </div>
      </div>

      {/* Tab Content 1: Video Translation Projects */}
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
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingProjects ? "animate-spin text-primary" : ""}`}
                />
                Làm mới
              </button>
            </div>
          </div>

          {isLoadingProjects ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-xs font-medium">
                Đang tải danh sách dự án dịch video...
              </span>
            </div>
          ) : filteredVideoProjects.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant font-mono-data text-mono-data border border-dashed border-white/10 rounded-2xl bg-surface-dim flex flex-col items-center gap-3">
              <Film className="w-10 h-10 text-on-surface-variant/40" />
              <p className="text-sm text-on-surface">
                {searchQuery
                  ? "Không tìm thấy dự án video phù hợp với từ khóa."
                  : "Chưa có dự án dịch video nào được lưu lại."}
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
                  onDeleteRequest={(p) =>
                    setDeleteTarget({ type: "video_single", videoProject: p })
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 2: Audio Records (Phòng thu) */}
      {activeTab === "audio" && (
        <div className="flex flex-col gap-6 animate-fadeIn">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs font-medium text-on-surface-variant">
              Hiển thị các bản thu âm và chuyển văn bản thành giọng nói đã tạo
              từ Voice Studio Pro
            </span>

            <div className="flex items-center gap-3">
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
                    onDeleteRequest={(r) =>
                      setDeleteTarget({ type: "audio_single", audioRecord: r })
                    }
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
                    Trang{" "}
                    <span className="text-primary font-bold">
                      {currentPage}
                    </span>{" "}
                    / {totalPages}
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

      {/* Modal Xác Nhận Xóa Tập Trung Chính Giữa Màn Hình (Portal trực tiếp ra document.body) */}
      {deleteTarget &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] w-screen h-screen flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => !isCleaning && setDeleteTarget(null)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100vw",
              height: "100vh",
              margin: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              className="bg-surface border border-white/10 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 relative animate-in zoom-in-95 duration-200 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => !isCleaning && setDeleteTarget(null)}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-lg font-bold text-on-surface">
                    {deleteTarget.type === "video_single"
                      ? "Xác Nhận Xóa Dự Án Video"
                      : deleteTarget.type === "audio_single"
                        ? "Xác Nhận Xóa Bản Thu Âm"
                        : activeTab === "video"
                          ? "Xác Nhận Xóa Toàn Bộ Lịch Sử Video"
                          : "Xác Nhận Xóa Toàn Bộ Lịch Sử Phòng Thu"}
                  </h3>
                  <div className="text-xs text-on-surface-variant leading-relaxed">
                    {deleteTarget.type === "video_single" && (
                      <>
                        Bạn có chắc chắn muốn xóa vĩnh viễn dự án video{" "}
                        <strong className="text-on-surface font-semibold">
                          "
                          {deleteTarget.videoProject?.video_filename ||
                            deleteTarget.videoProject?.task_id}
                          "
                        </strong>
                        ? Toàn bộ file video thành phẩm MP4, file phụ đề SRT và
                        tài nguyên tạm sẽ bị xóa để giải phóng dung lượng đĩa.
                      </>
                    )}
                    {deleteTarget.type === "audio_single" && (
                      <>
                        Bạn có chắc muốn xóa bản thu âm{" "}
                        <span className="italic text-on-surface font-semibold">
                          "{deleteTarget.audioRecord?.text?.slice(0, 80)}
                          {(deleteTarget.audioRecord?.text?.length || 0) > 80
                            ? "..."
                            : ""}
                          "
                        </span>
                        ? File âm thanh này sẽ bị xóa hoàn toàn khỏi hệ thống.
                      </>
                    )}
                    {deleteTarget.type === "clear_active_tab" &&
                      (activeTab === "video"
                        ? `Bạn có chắc chắn muốn xóa toàn bộ ${videoProjects.length} dự án dịch video và tất cả các file video đã render, file phụ đề để giải phóng dung lượng ổ cứng?`
                        : `Bạn có chắc chắn muốn xóa toàn bộ ${history.length} bản thu âm giọng đọc và các file âm thanh đã lưu để giải phóng dung lượng ổ cứng?`)}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>
                  Hành động này không thể hoàn tác sau khi đã thực hiện.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !isCleaning && setDeleteTarget(null)}
                  disabled={isCleaning}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-semibold border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isCleaning}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCleaning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>
                    {deleteTarget.type === "clear_active_tab"
                      ? activeTab === "video"
                        ? "Xóa Sạch Lịch Sử Video"
                        : "Xóa Sạch Lịch Sử Phòng Thu"
                      : "Xác Nhận Xóa"}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
