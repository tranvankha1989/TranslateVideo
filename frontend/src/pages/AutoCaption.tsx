import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { toast } from "sonner";
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  Download,
  Sparkles,
  Type,
  MoveVertical,
  Video,
  Clock,
  Loader2,
  SidebarClose,
  SidebarOpen,
  FileUp,
  FileText,
  Wand2,
  ArrowUp,
  ArrowDown,
  CheckCheck,
  Maximize2,
  Minimize2,
  Palette,
  FolderOpen,
  Check,
  ClipboardPaste,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimelineEditor } from "@/components/caption/TimelineEditor";
import { TranscriptDocEditor } from "@/components/caption/TranscriptDocEditor";
import { LibraryScriptModal } from "@/components/caption/LibraryScriptModal";
import { useTTSStore } from "@/store/useTTSStore";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface CaptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordTiming[];
  customPositionY?: number; // Vị trí dọc riêng cho đoạn này (10% - 90%)
}

export interface StyleConfig {
  font_name: string;
  font_size: number;
  primary_color: string;
  highlight_color: string;
  outline_color: string;
  outline_size: number;
  position_y: number; // Phần trăm từ đỉnh xuống đáy (10% - 90%)
}

const DEFAULT_STYLE: StyleConfig = {
  font_name: "Be Vietnam Pro",
  font_size: 26,
  primary_color: "#FFFFFF",
  highlight_color: "#ec6f09",
  outline_color: "#000000",
  outline_size: 3,
  position_y: 85,
};

const SYSTEM_FONTS = [
  { name: "Be Vietnam Pro", label: "Be Vietnam Pro (Chuẩn tiếng Việt)" },
  { name: "Montserrat", label: "Montserrat (Hiện đại, sang trọng)" },
  { name: "Anton", label: "Anton (Chữ to, Shorts/Reels hot)" },
  { name: "Inter", label: "Inter (Sạch sẽ, tinh tế)" },
  { name: "Roboto", label: "Roboto (Rõ nét, chuẩn mực)" },
  { name: "Lexend", label: "Lexend (Dễ đọc lướt)" },
  { name: "Playfair Display", label: "Playfair Display (Nghệ thuật)" },
  { name: "Arial", label: "Arial Bold (Cơ bản)" },
];

const DRAFT_STORAGE_KEY = "autocaption_latest_draft";

export default function AutoCaption() {
  // Video & Transcription State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSegId, setSelectedSegId] = useState<number | null>(null);

  // Undo history stack
  const [undoStack, setUndoStack] = useState<CaptionSegment[][]>([]);

  // Inspector Sidebar State (Collapsible)
  const [showInspector, setShowInspector] = useState<boolean>(true);

  // Dynamic Video Aspect Ratio
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);

  // Fullscreen State
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Style State
  const [style, setStyle] = useState<StyleConfig>(DEFAULT_STYLE);
  const [customFonts, setCustomFonts] = useState<string[]>([]);

  // Drag & Drop Y Position State on Preview Canvas
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Reference Script State
  const [referenceScript, setReferenceScript] = useState("");
  const [isAligningScript, setIsAligningScript] = useState(false);
  const [isOptimizingChunks, setIsOptimizingChunks] = useState(false);
  const [showScriptBox, setShowScriptBox] = useState(true);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);

  // Raw Segments Backup
  const [rawSegments, setRawSegments] = useState<CaptionSegment[]>([]);

  // Active Tab: Lời thoại (transcript) | Kiểu dáng chữ (style)
  const [activeTab, setActiveTab] = useState<"transcript" | "style">(
    "transcript",
  );

  // Nạp giọng đọc kịch bản từ Phòng thu / Thư viện (nếu có chuyển giao sang)
  const { pendingVoiceForVideo, setPendingVoiceForVideo } = useTTSStore();

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  // Push snapshot into undo stack before changes
  const pushHistorySnapshot = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-20),
      JSON.parse(JSON.stringify(segments)),
    ]);
  }, [segments]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) {
      toast.info("Không có thao tác nào để hoàn tác.");
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setSegments(previous);
    toast.success("↩️ Đã hoàn tác thao tác phụ đề trước đó!");
  }, [undoStack]);

  // Nhận kịch bản tự động khi chuyển từ trang Studio / Phòng thu
  useEffect(() => {
    if (pendingVoiceForVideo) {
      if (pendingVoiceForVideo.text) {
        setReferenceScript(pendingVoiceForVideo.text);
        setShowScriptBox(true);
        toast.success(
          `✨ Đã nạp kịch bản từ Phòng thu: "${pendingVoiceForVideo.text.slice(0, 45)}...". Hãy chọn video bạn đã edit để tạo phụ đề.`,
          { duration: 6000 },
        );
      }
      setPendingVoiceForVideo(null);
    }
  }, [pendingVoiceForVideo, setPendingVoiceForVideo]);

  // Lắng nghe sự kiện Fullscreen của trình duyệt
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch((err) => {
        console.warn("Lỗi khi mở Fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // 60 FPS RequestAnimationFrame Loop: Video là Master Clock
  useEffect(() => {
    let animId: number;
    const renderLoop = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        setCurrentTime(video.currentTime);
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Tự động lưu bản nháp của phiên làm việc gần nhất vào localStorage
  useEffect(() => {
    if (!sessionId || !videoUrl || segments.length === 0) return;

    const timer = setTimeout(() => {
      try {
        const draft = {
          sessionId,
          filename: videoFile?.name || "video.mp4",
          videoUrl,
          videoDuration,
          segments,
          rawSegments,
          style,
          referenceScript,
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch (err) {
        console.warn("Không thể lưu draft Auto Caption:", err);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    sessionId,
    videoUrl,
    videoDuration,
    segments,
    rawSegments,
    style,
    referenceScript,
    videoFile,
  ]);

  // Tự động khôi phục phiên làm việc gần nhất khi vào trang hoặc F5
  useEffect(() => {
    const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft);
      if (!draft.sessionId) return;

      // Kiểm tra session còn tồn tại trên server không
      fetch(`http://localhost:8000/api/caption/session/${draft.sessionId}/check`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.exists) {
            setSessionId(draft.sessionId);
            setVideoUrl(data.video_url || draft.videoUrl);
            if (draft.videoDuration) setVideoDuration(draft.videoDuration);
            setSegments(draft.segments || []);
            setRawSegments(draft.rawSegments || draft.segments || []);
            if (draft.style) setStyle(draft.style);
            if (draft.referenceScript) setReferenceScript(draft.referenceScript);

            toast.info(
              `✨ Đã khôi phục phiên làm việc gần nhất: "${draft.filename || "Video"}" (${draft.segments?.length || 0} câu phụ đề).`,
              { duration: 5000 },
            );
          } else {
            // Server đã dọn dẹp hoặc session không còn
            localStorage.removeItem(DRAFT_STORAGE_KEY);
          }
        })
        .catch(() => {});
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  // Bắt đầu làm video mới & dọn dẹp sạch phiên cũ
  const handleStartNewSession = async () => {
    const currentId = sessionId;
    setVideoFile(null);
    setVideoUrl(null);
    setVideoDuration(0);
    setSessionId(null);
    setSegments([]);
    setRawSegments([]);
    setUndoStack([]);
    setReferenceScript("");
    setSelectedSegId(null);
    localStorage.removeItem(DRAFT_STORAGE_KEY);

    if (currentId) {
      fetch(`http://localhost:8000/api/caption/session/${currentId}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    toast.success("✨ Đã dọn dẹp phiên cũ, sẵn sàng cho video mới!");
  };

  // Chọn video
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Vui lòng chọn file video hợp lệ (.mp4, .mov, .webm)");
      return;
    }

    if (sessionId) {
      fetch(`http://localhost:8000/api/caption/session/${sessionId}`, {
        method: "DELETE",
      }).catch(() => {});
    }

    setVideoFile(file);
    const localUrl = URL.createObjectURL(file);
    setVideoUrl(localUrl);
    setVideoAspectRatio(null);
    setSegments([]);
    setRawSegments([]);
    setSessionId(null);
    setVideoDuration(0);
    toast.success(`Đã chọn video: ${file.name}`);
  };

  // Tạo phụ đề AI với Whisper + Kịch bản đối chiếu
  const handleTranscribe = async () => {
    if (!videoFile) {
      toast.error("Vui lòng tải lên video trước");
      return;
    }

    setIsTranscribing(true);
    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("language", "vi");
    formData.append("model_size", "base");
    if (referenceScript.trim()) {
      formData.append("reference_script", referenceScript.trim());
    }

    try {
      toast.info("Đang tách âm thanh và nhận diện phụ đề từng từ bằng AI...", {
        duration: 8000,
      });

      const response = await fetch(
        "http://localhost:8000/api/caption/transcribe",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Nhận diện phụ đề thất bại");
      }

      const data = await response.json();
      setSessionId(data.session_id);
      if (data.video_url) {
        setVideoUrl(data.video_url);
      }
      setSegments(data.segments || []);
      setRawSegments(data.segments || []);

      if ((data.segments?.length || 0) === 0) {
        toast.warning(
          "Video không phát hiện thấy âm thanh lời nói rõ ràng. Hãy kiểm tra lại âm lượng video đã xuất.",
          { duration: 6000 },
        );
      } else {
        toast.success(
          `✨ Hoàn tất! Bóc tách được ${data.segments?.length || 0} câu có mốc thời gian chi tiết khớp với kịch bản.`,
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi nhận diện video");
    } finally {
      setIsTranscribing(false);
    }
  };

  // So khớp kịch bản đối chiếu tức thì
  const handleAlignScript = async () => {
    if (!referenceScript.trim()) {
      toast.error("Vui lòng dán kịch bản đối chiếu vào ô nhập");
      return;
    }
    if (!segments.length) {
      toast.error(
        "Chưa có phụ đề để đối chiếu. Hãy bấm 'Tạo Phụ Đề AI' trước.",
      );
      return;
    }

    setIsAligningScript(true);
    try {
      const response = await fetch(
        "http://localhost:8000/api/caption/align-script",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segments,
            reference_script: referenceScript.trim(),
          }),
        },
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Không thể so khớp kịch bản");
      }

      const data = await response.json();
      if (data.segments && data.segments.length > 0) {
        pushHistorySnapshot();
        setSegments(data.segments);
        setRawSegments(data.segments);
        toast.success(
          `✨ Đã chuẩn hóa 100% chính tả theo kịch bản mẫu (${data.segments.length} câu)!`,
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi so khớp kịch bản");
    } finally {
      setIsAligningScript(false);
    }
  };

  // Tự động chia nhỏ câu 4-9 từ chuẩn Shorts/Reels
  const handleOptimizeChunks = async () => {
    if (!segments.length) {
      toast.error("Chưa có phụ đề để chia câu");
      return;
    }

    setIsOptimizingChunks(true);
    try {
      const response = await fetch(
        "http://localhost:8000/api/caption/optimize-chunks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segments,
            max_words: 7,
          }),
        },
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Không thể chia nhỏ câu");
      }

      const data = await response.json();
      pushHistorySnapshot();
      setSegments(data.segments || []);
      toast.success(
        `✨ Đã chia ngắn thành ${data.segments?.length || 0} câu chuẩn Shorts/Reels!`,
      );
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi chia nhỏ câu");
    } finally {
      setIsOptimizingChunks(false);
    }
  };

  // Khôi phục mốc thời gian phụ đề gốc
  const handleRestoreSync = async () => {
    if (rawSegments.length > 0) {
      pushHistorySnapshot();
      setSegments(JSON.parse(JSON.stringify(rawSegments)));
      toast.success(
        "Đã khôi phục mốc thời gian phụ đề gốc, khớp 100% với giọng nói!",
      );
      return;
    }

    if (sessionId) {
      try {
        const res = await fetch(
          `http://localhost:8000/api/caption/session/${sessionId}/restore-raw`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.segments && data.segments.length > 0) {
            pushHistorySnapshot();
            setSegments(data.segments);
            setRawSegments(data.segments);
            toast.success("Đã khôi phục mốc thời gian gốc từ máy chủ!");
            return;
          }
        }
      } catch (e) {
        console.warn("Không thể tải mốc gốc từ backend:", e);
      }
    }

    toast.error("Không tìm thấy bản sao lưu mốc gốc để khôi phục");
  };

  // ─── Nút "Cập Nhật Timeline Caption" (Giải thuật chống lệch mốc sau khi gộp/tách) ───
  const handleUpdateTimeline = useCallback(() => {
    if (!segments.length) {
      toast.info("Chưa có phụ đề để cập nhật timeline.");
      return;
    }

    pushHistorySnapshot();

    // 1. Sắp xếp lại danh sách câu theo thời gian bắt đầu
    const sorted = [...segments].sort((a, b) => a.start - b.start);

    // 2. Chuẩn hóa từng segment và chống đè mốc (overlap)
    const normalized: CaptionSegment[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const seg = { ...sorted[i] };
      const words = seg.words ? [...seg.words] : [];

      // Đảm bảo thời gian bắt đầu < kết thúc tối thiểu 0.3s
      if (seg.end <= seg.start) {
        seg.end = Number(
          (seg.start + Math.max(0.4, (words.length || 1) * 0.25)).toFixed(2),
        );
      }

      // Xử lý đè mốc với câu kế tiếp:
      if (i < sorted.length - 1) {
        const nextSeg = sorted[i + 1];
        if (seg.end > nextSeg.start) {
          const gap = 0.05;
          if (nextSeg.start - seg.start > 0.3) {
            seg.end = Number((nextSeg.start - gap).toFixed(2));
          } else {
            nextSeg.start = Number((seg.end + gap).toFixed(2));
          }
        }
      }

      // Phân bổ lại mốc thời gian chi tiết từng từ (Word-level timestamps) nếu từ bị lệch hoặc thiếu
      const cleanWordsList = seg.text.trim().split(/\s+/).filter(Boolean);
      const segDur = Math.max(0.3, seg.end - seg.start);

      if (words.length !== cleanWordsList.length || words.length === 0) {
        const step = segDur / Math.max(1, cleanWordsList.length);
        seg.words = cleanWordsList.map((w, idx) => ({
          word: w,
          start: Number((seg.start + idx * step).toFixed(2)),
          end: Number((seg.start + (idx + 1) * step).toFixed(2)),
          probability: 0.95,
        }));
      } else {
        const step = segDur / words.length;
        seg.words = words.map((w, idx) => ({
          ...w,
          word: cleanWordsList[idx] || w.word,
          start: Math.max(
            seg.start,
            Math.min(
              Number((seg.start + idx * step).toFixed(2)),
              seg.end - 0.05,
            ),
          ),
          end: Math.max(
            seg.start + 0.05,
            Math.min(
              Number((seg.start + (idx + 1) * step).toFixed(2)),
              seg.end,
            ),
          ),
        }));
      }

      normalized.push(seg);
    }

    setSegments(normalized);
    toast.success(
      "✨ Đã cập nhật và đồng bộ mốc thời gian phụ đề chuẩn xác, chống lệch tiếng!",
    );
  }, [segments, pushHistorySnapshot]);

  // Cắt (Split) câu phụ đề tại kim thời gian Playhead
  const handleSplitAtPlayhead = useCallback(() => {
    const seg = segments.find(
      (s) => currentTime >= s.start - 0.05 && currentTime <= s.end + 0.05,
    );

    if (seg && currentTime > seg.start + 0.15 && currentTime < seg.end - 0.15) {
      pushHistorySnapshot();
      const wordsBefore: WordTiming[] = [];
      const wordsAfter: WordTiming[] = [];

      (seg.words || []).forEach((w) => {
        if (w.end <= currentTime) {
          wordsBefore.push(w);
        } else if (w.start >= currentTime) {
          wordsAfter.push(w);
        } else {
          if (currentTime - w.start >= w.end - currentTime) {
            wordsBefore.push({ ...w, end: Number(currentTime.toFixed(2)) });
          } else {
            wordsAfter.push({ ...w, start: Number(currentTime.toFixed(2)) });
          }
        }
      });

      if (wordsBefore.length === 0 && seg.words && seg.words.length > 1) {
        wordsBefore.push(seg.words[0]);
        wordsAfter.push(...seg.words.slice(1));
      } else if (wordsAfter.length === 0 && seg.words && seg.words.length > 1) {
        wordsBefore.push(...seg.words.slice(0, -1));
        wordsAfter.push(seg.words[seg.words.length - 1]);
      }

      const seg1: CaptionSegment = {
        ...seg,
        end: Number(currentTime.toFixed(2)),
        words: wordsBefore,
        text:
          wordsBefore.map((w) => w.word).join(" ") ||
          seg.text.slice(0, Math.floor(seg.text.length / 2)),
      };

      const seg2: CaptionSegment = {
        ...seg,
        id: Date.now(),
        start: Number(currentTime.toFixed(2)),
        words: wordsAfter,
        text:
          wordsAfter.map((w) => w.word).join(" ") ||
          seg.text.slice(Math.floor(seg.text.length / 2)),
      };

      setSegments((prev) => {
        const next = prev.flatMap((s) =>
          s.id === seg.id ? [seg1, seg2] : [s],
        );
        return next.sort((a, b) => a.start - b.start);
      });

      toast.success(
        `✂️ Đã cắt câu phụ đề thành 2 đoạn tại ${currentTime.toFixed(2)}s!`,
      );
    } else {
      toast.info("Hãy đặt kim đọc (Playhead) vào giữa câu phụ đề để cắt.");
    }
  }, [currentTime, segments, pushHistorySnapshot]);

  // Phím tắt Space (Play/Pause), S (Split), Ctrl+Z (Undo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSplitAtPlayhead, handleUndo]);

  // Nạp font tùy chỉnh
  const handleCustomFontUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["ttf", "otf", "woff2", "woff"].includes(ext || "")) {
      toast.error("Chỉ chấp nhận file font .ttf, .otf, .woff, .woff2");
      return;
    }

    const cleanFontName =
      file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^\w\s-]/g, "")
        .trim() || "CustomFont";

    try {
      const fontUrl = URL.createObjectURL(file);
      const styleEl = document.createElement("style");
      styleEl.textContent = `
        @font-face {
          font-family: "${cleanFontName}";
          src: url("${fontUrl}");
        }
      `;
      document.head.appendChild(styleEl);

      setCustomFonts((prev) =>
        prev.includes(cleanFontName) ? prev : [...prev, cleanFontName],
      );
      setStyle((s) => ({ ...s, font_name: cleanFontName }));
      toast.success(`Đã nạp font tùy chỉnh: ${cleanFontName}`);

      if (sessionId) {
        const formData = new FormData();
        formData.append("font", file);
        formData.append("session_id", sessionId);
        await fetch("http://localhost:8000/api/caption/upload-font", {
          method: "POST",
          body: formData,
        });
      }
    } catch (err: any) {
      toast.error(`Không thể nạp font: ${err.message}`);
    }
  };

  // Video playback controls
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (video.currentTime >= (videoDuration || 0.1) - 0.05) {
        video.currentTime = 0;
        setCurrentTime(0);
      }
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [videoDuration]);

  const seekTo = useCallback((seconds: number) => {
    const clamped = Math.max(0, Number(seconds.toFixed(2)));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  }, []);

  // Xác định câu phụ đề đang hiển thị theo currentTime
  const activeSegment = useMemo(() => {
    return (
      segments.find(
        (s) => currentTime >= s.start - 0.05 && currentTime <= s.end + 0.1,
      ) || null
    );
  }, [segments, currentTime]);

  // Xác định từ đang active trong câu để tạo hiệu ứng Kinetic Karaoke
  const activeWordIdx = useMemo(() => {
    if (
      !activeSegment ||
      !activeSegment.words ||
      activeSegment.words.length === 0
    )
      return -1;
    return activeSegment.words.findIndex(
      (w) => currentTime >= w.start - 0.02 && currentTime <= w.end + 0.05,
    );
  }, [activeSegment, currentTime]);

  // Kéo thả vị trí chữ trực tiếp trên video preview
  const handleCaptionMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingCaption(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingCaption || !videoContainerRef.current) return;
      const rect = videoContainerRef.current.getBoundingClientRect();
      const relativeY = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedY = Math.max(10, Math.min(90, Math.round(relativeY)));

      if (activeSegment) {
        setSegments((prev) =>
          prev.map((s) =>
            s.id === activeSegment.id ? { ...s, customPositionY: clampedY } : s,
          ),
        );
      } else {
        setStyle((s) => ({ ...s, position_y: clampedY }));
      }
    };

    const handleMouseUp = () => {
      if (isDraggingCaption) {
        setIsDraggingCaption(false);
      }
    };

    if (isDraggingCaption) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDraggingCaption, activeSegment]);

  // Đổi vị trí riêng cho 1 đoạn hoặc áp dụng cho tất cả
  const handleUpdateSegmentPositionY = (segId: number, posY: number) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, customPositionY: posY } : s)),
    );
  };

  const handleResetSegmentPosition = (segId: number) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id === segId ? { ...s, customPositionY: undefined } : s,
      ),
    );
    toast.info("Đã đặt lại vị trí phụ đề về mặc định.");
  };

  const handleApplyPositionToAll = (posY: number) => {
    setStyle((prev) => ({ ...prev, position_y: posY }));
    setSegments((prev) => prev.map((s) => ({ ...s, customPositionY: posY })));
    toast.success(
      `Đã đồng bộ vị trí Y: ${posY}% cho toàn bộ các câu trong video!`,
    );
  };

  // Xuất video hoàn chỉnh
  const handleExport = async () => {
    if (!sessionId) {
      toast.error("Vui lòng tải lên video và tạo phụ đề trước");
      return;
    }

    if (segments.length === 0) {
      toast.error("Chưa có phụ đề nào để xuất");
      return;
    }

    setIsExporting(true);
    try {
      toast.info("Đang render video với phụ đề Kinetic chuẩn HD...", {
        duration: 12000,
      });

      const response = await fetch("http://localhost:8000/api/caption/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          segments,
          style_config: {
            ...style,
            preview_height: videoContainerRef.current?.clientHeight || 450,
          },
          has_voiceover: false,
          has_bgm: false,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Xuất video thất bại");
      }

      const data = await response.json();

      // Tự động tải video về máy tính
      try {
        const fileRes = await fetch(data.download_url);
        const blob = await fileRes.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const dl = document.createElement("a");
        dl.href = blobUrl;
        dl.download = data.filename || `captioned_${Date.now()}.mp4`;
        document.body.appendChild(dl);
        dl.click();
        document.body.removeChild(dl);
        window.URL.revokeObjectURL(blobUrl);
        toast.success(
          "✨ Xuất video hoàn tất! File đã được tự động tải về máy.",
        );
      } catch (blobErr) {
        const dl = document.createElement("a");
        dl.href = data.download_url;
        dl.download = data.filename || `captioned_${Date.now()}.mp4`;
        dl.target = "_blank";
        document.body.appendChild(dl);
        dl.click();
        document.body.removeChild(dl);
        toast.success("✨ Xuất video hoàn tất! File đang được tải về.");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xuất video");
    } finally {
      setIsExporting(false);
    }
  };

  const currentSegmentY = activeSegment?.customPositionY ?? style.position_y;

  return (
    <div className="w-full max-w-full px-2 md:px-4 pb-16 space-y-4">
      {/* ─── 1. Header Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-surface/85 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 border border-primary/30 rounded-xl text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl 2k:text-2xl font-bold text-on-surface tracking-tight">
                Auto Kinetic Caption
              </h1>
              <span className="text-[10px] bg-primary/20 border border-primary/40 text-primary px-2 py-0.5 rounded-full font-semibold">
                Shorts / Reels Studio
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              Tạo phụ đề tự động khớp kịch bản, gộp/tách câu & cập nhật timeline
              mượt mà
            </p>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center flex-wrap gap-2.5 w-full lg:w-auto">
          <input
            type="file"
            ref={videoInputRef}
            onChange={handleVideoSelect}
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
          />

          {/* Chọn Video Button */}
          <button
            onClick={() => videoInputRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 hover:border-primary/50 bg-surface-variant/40 hover:bg-surface-variant text-on-surface transition-all text-xs font-medium cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-primary" />
            {videoFile ? "Đổi video (.mp4)" : "Chọn Video (.mp4)"}
          </button>

          {/* Nút Làm Video Mới / Dọn Dẹp Phiên Cũ */}
          {(sessionId || videoUrl || segments.length > 0) && (
            <button
              onClick={handleStartNewSession}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-500/30 hover:border-red-500/60 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition-all cursor-pointer shadow-xs"
              title="Dọn dẹp phiên video này và bắt đầu làm video mới"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">Làm video mới</span>
              <span className="sm:hidden">Làm mới</span>
            </button>
          )}

          {/* Nút Nhập Kịch Bản Mẫu */}
          <button
            onClick={() => setShowScriptBox((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer",
              showScriptBox || referenceScript.trim()
                ? "bg-primary/15 border-primary/40 text-primary shadow-xs"
                : "bg-surface-variant/40 border-white/10 hover:border-white/20 text-on-surface",
            )}
            title="Dán kịch bản đã làm ở Phòng thu để chuẩn hóa chính tả 100%"
          >
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span>
              {referenceScript.trim() ? "Kịch bản (Đã nạp)" : "Dán Kịch bản"}
            </span>
            {referenceScript.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            )}
          </button>

          {/* Nút Mở Thư Viện Import Kịch Bản Nhanh */}
          <button
            type="button"
            onClick={() => {
              setShowScriptBox(true);
              setIsLibraryModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold transition-all cursor-pointer shadow-xs"
            title="Nhập nhanh kịch bản từ các file giọng đọc/video trong Thư viện"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Import từ Thư viện</span>
            <span className="sm:hidden">Thư viện</span>
          </button>

          {/* Nút Tạo Phụ Đề AI */}
          {videoFile && (
            <button
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary font-semibold transition-all shadow-md hover:shadow-primary/20 disabled:opacity-50 text-xs cursor-pointer"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang bóc tách AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tạo Phụ Đề AI</span>
                </>
              )}
            </button>
          )}

          {/* Nút Cập Nhật Timeline Caption */}
          {segments.length > 0 && (
            <button
              onClick={handleUpdateTimeline}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 transition text-xs font-semibold shadow-xs cursor-pointer"
              title="Tính toán và chuẩn hóa mốc thời gian hiển thị sau khi bạn gộp/tách câu"
            >
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cập nhật Timeline</span>
            </button>
          )}

          {/* Nút Toggle Inspector Panel */}
          <button
            onClick={() => setShowInspector(!showInspector)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer",
              showInspector
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-surface-variant/40 border-white/10 text-on-surface hover:bg-surface-variant",
            )}
            title="Ẩn / Hiện thanh công cụ Kiểu dáng & Lời thoại"
          >
            {showInspector ? (
              <SidebarClose className="w-3.5 h-3.5" />
            ) : (
              <SidebarOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {showInspector ? "Thu gọn công cụ" : "Mở công cụ"}
            </span>
          </button>

          {/* Nút Xuất Video */}
          {segments.length > 0 && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang xuất...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất Video</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ─── Kịch Bản Mẫu (Dán kịch bản đối chiếu) ────────────────────────── */}
      {showScriptBox && (
        <div className="bg-surface/90 backdrop-blur-md p-4 rounded-2xl border border-amber-500/30 shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <span>Kịch bản đọc đối chiếu (Chuẩn hóa chính tả 100%)</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                    Whisper AI Precision
                  </span>
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Dán kịch bản hoặc lấy từ Thư viện video/voice đã tạo để hệ
                  thống khớp chính tả từng từ chính xác tuyệt đối.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Nút Import từ Thư viện nổi bật */}
              <button
                type="button"
                onClick={() => setIsLibraryModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-primary/20 hover:from-amber-500/30 hover:via-orange-500/30 hover:to-primary/30 border border-amber-500/50 hover:border-amber-400 text-amber-300 hover:text-white text-xs font-bold shadow-sm transition-all duration-150 cursor-pointer group"
                title="Chọn kịch bản từ các file giọng đọc hoặc video đã làm trong Thư viện"
              >
                <FolderOpen className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>Import Kịch bản từ Thư viện</span>
              </button>

              {segments.length > 0 && (
                <button
                  onClick={handleAlignScript}
                  disabled={isAligningScript || !referenceScript.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-semibold shadow-md transition disabled:opacity-40 cursor-pointer"
                >
                  {isAligningScript ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  Khớp & Sửa chính tả tức thì
                </button>
              )}
            </div>
          </div>

          <textarea
            id="reference_script"
            name="reference_script"
            value={referenceScript}
            onChange={(e) => setReferenceScript(e.target.value)}
            placeholder="Dán toàn bộ kịch bản bạn đã dùng chuyển voice vào đây, hoặc nhấn nút 'Import Kịch bản từ Thư viện' ở trên để nạp tự động..."
            rows={3}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-variant/30 border border-white/10 text-on-surface placeholder:text-on-surface-variant/40 text-sm focus:outline-none focus:border-amber-500/50 resize-y leading-relaxed font-sans"
          />

          {/* Quick Actions & Helper */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-on-surface-variant">
            {!referenceScript.trim() ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-on-surface-variant">
                  💡 Mẹo:
                </span>
                <button
                  type="button"
                  onClick={() => setIsLibraryModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  <FolderOpen className="w-3 h-3 text-amber-400" />
                  <span>Chọn nhanh từ Thư viện</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text.trim()) {
                        setReferenceScript(text);
                        toast.success("Đã dán kịch bản từ Clipboard!");
                      } else {
                        toast.error("Bộ nhớ tạm (Clipboard) đang trống!");
                      }
                    } catch {
                      toast.error(
                        "Vui lòng nhấn Ctrl+V trực tiếp vào ô để dán kịch bản!",
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-variant/40 hover:bg-surface-variant border border-white/10 text-on-surface text-[11px] font-medium transition cursor-pointer"
                >
                  <ClipboardPaste className="w-3 h-3 text-primary" />
                  <span>Dán từ Clipboard</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                  <Check className="w-3.5 h-3.5" /> Đã nạp kịch bản (
                  {referenceScript.length} ký tự •{" "}
                  {referenceScript.trim().split(/\s+/).filter(Boolean).length}{" "}
                  từ)
                </span>
                <button
                  type="button"
                  onClick={() => setIsLibraryModalOpen(true)}
                  className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 text-[11px] cursor-pointer font-medium"
                >
                  <FolderOpen className="w-3 h-3" /> Đổi kịch bản khác
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReferenceScript("");
                    toast.info("Đã xóa kịch bản đối chiếu");
                  }}
                  className="text-red-400/80 hover:text-red-400 hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Xóa kịch bản
                </button>
              </div>
            )}

            <button
              onClick={() => setShowScriptBox(false)}
              className="text-[11px] text-on-surface-variant hover:text-on-surface underline cursor-pointer ml-auto"
            >
              Thu gọn ô này
            </button>
          </div>
        </div>
      )}

      {/* ─── 2. Main Studio Workspace: 2 Columns (Preview SIÊU LỚN & Inspector) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Left Column: Video Live Preview SIÊU LỚN (Ưu tiên không gian tối đa) */}
        <div
          className={cn(
            "flex flex-col transition-all duration-300",
            showInspector
              ? "lg:col-span-8 xl:col-span-8"
              : "lg:col-span-12 xl:col-span-12",
          )}
        >
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
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    const dur = vid.duration || 0;
                    setVideoDuration(dur);
                    if (vid.videoWidth && vid.videoHeight) {
                      setVideoAspectRatio(vid.videoWidth / vid.videoHeight);
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-full object-contain pointer-events-auto cursor-pointer select-none"
                  onClick={togglePlay}
                  playsInline
                />

                {/* ── Kinetic Subtitle Interactive Overlay (Kéo thả vị trí Y trên video) ── */}
                <div
                  onMouseDown={handleCaptionMouseDown}
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center pointer-events-auto cursor-move group/caption px-4 py-1"
                  style={{
                    top: `${currentSegmentY}%`,
                  }}
                  title="Nhấp giữ để kéo vị trí hiển thị chữ lên xuống trên video"
                >
                  {/* Badge định vị Y và nút thao tác nhanh */}
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
                            if (activeSegment)
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
                  </div>

                  {/* Render chữ Kinetic Karaoke - Luôn hiển thị trên 1 hàng duy nhất */}
                  {activeSegment ? (
                    (() => {
                      const plainText = activeSegment.words
                        .map((w) => w.word)
                        .join(" ");
                      const charCount = plainText.length;
                      // Tự động scale font-size vừa vặn 1 hàng nếu câu dài
                      const fitScale =
                        charCount > 25 ? Math.max(0.65, 25 / charCount) : 1;
                      const computedFontSize = Math.round(
                        style.font_size * fitScale,
                      );

                      return (
                        <div className="flex flex-nowrap justify-center items-center gap-x-2 text-center max-w-[96%] px-3 py-1.5 rounded-xl bg-black/30 backdrop-blur-[2px] border border-white/10 group-hover/caption:border-primary/30 transition whitespace-nowrap overflow-hidden select-none shadow-lg">
                          {activeSegment.words.map((w, idx) => {
                            const isCurrent = idx === activeWordIdx;

                            return (
                              <span
                                key={idx}
                                className={cn(
                                  "font-black tracking-wide uppercase transition-all duration-150 inline-block shrink-0 select-none",
                                  isCurrent
                                    ? "scale-110 drop-shadow-[0_0_15px_rgba(255,255,0,0.8)] z-10"
                                    : "opacity-90",
                                )}
                                style={{
                                  fontSize: `${computedFontSize}px`,
                                  color: isCurrent
                                    ? style.highlight_color
                                    : style.primary_color,
                                  WebkitTextStroke: `${style.outline_size}px ${style.outline_color}`,
                                  paintOrder: "stroke fill",
                                }}
                              >
                                {w.word}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-xs text-white/30 italic px-3 py-1 bg-black/40 rounded-full border border-white/5 opacity-0 group-hover/caption:opacity-100 transition">
                      Kéo để định vị vị trí chữ ({style.position_y}%)
                    </div>
                  )}
                </div>

                {/* Floating Player Control Bar */}
                <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-30 border border-white/10">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="p-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition cursor-pointer"
                      title={
                        isPlaying ? "Tạm dừng (Space)" : "Phát video (Space)"
                      }
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

                    {/* Nút Fullscreen Toàn Màn Hình */}
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
                    Nhấn vào nút "Chọn Video (.mp4)" phía trên để nạp video bạn
                    đã dựng hoàn chỉnh từ CapCut / Premiere
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Inspector Panel (Lời thoại & Kiểu dáng) */}
        {showInspector && (
          <div className="lg:col-span-4 flex flex-col transition-all duration-300 h-fit">
            <div className="bg-surface/70 backdrop-blur-md rounded-2xl border border-white/10 p-3.5 flex flex-col h-[520px] lg:h-[760px] 2k:h-[760px] overflow-hidden shadow-xl">
              {/* Tabs Switcher */}
              <div className="flex p-1 bg-surface-variant/40 rounded-xl border border-white/10 text-xs font-medium mb-3 gap-1 shrink-0">
                <button
                  onClick={() => setActiveTab("transcript")}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer",
                    activeTab === "transcript"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Biên tập Lời thoại</span>
                  {segments.length > 0 && (
                    <span className="text-[10px] bg-black/25 px-1.5 py-0.2 rounded-full">
                      {segments.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("style")}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer",
                    activeTab === "style"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Kiểu dáng Chữ</span>
                </button>
              </div>

              {/* Tab 1: Transcript Doc Editor (Gộp câu, Tách câu, Tìm/Thay thế) */}
              {activeTab === "transcript" && (
                <div className="flex-1 overflow-hidden animate-fadeIn">
                  <TranscriptDocEditor
                    segments={segments}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    onSeek={seekTo}
                    onUpdateSegments={(newSegs) => {
                      pushHistorySnapshot();
                      setSegments(newSegs);
                    }}
                    onOptimizeChunks={handleOptimizeChunks}
                    isOptimizingChunks={isOptimizingChunks}
                    onRestoreSync={handleRestoreSync}
                    hasRawSegments={
                      rawSegments.length > 0 || Boolean(sessionId)
                    }
                    onUpdateTimeline={handleUpdateTimeline}
                  />
                </div>
              )}

              {/* Tab 2: Style Controls */}
              {activeTab === "style" && (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/10 text-sm animate-fadeIn">
                  {/* Font Family Selection */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-primary" />
                        Font chữ ({SYSTEM_FONTS.length + customFonts.length})
                      </label>

                      <input
                        type="file"
                        ref={fontInputRef}
                        onChange={handleCustomFontUpload}
                        accept=".ttf,.otf,.woff,.woff2"
                        className="hidden"
                      />
                      <button
                        onClick={() => fontInputRef.current?.click()}
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline font-medium cursor-pointer"
                      >
                        <FileUp className="w-3 h-3" />
                        Tải Font riêng
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 max-h-[170px] overflow-y-auto pr-1">
                      {customFonts.map((name) => (
                        <button
                          key={name}
                          onClick={() =>
                            setStyle({ ...style, font_name: name })
                          }
                          className={cn(
                            "p-2 rounded-lg border text-xs text-left transition flex items-center justify-between cursor-pointer",
                            style.font_name === name
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-surface-variant/20 border-white/10 text-on-surface hover:bg-surface-variant/40",
                          )}
                          style={{ fontFamily: name }}
                        >
                          <span className="truncate">{name}</span>
                          <span className="text-[8px] bg-primary/20 text-primary px-1 py-0.5 rounded">
                            Custom
                          </span>
                        </button>
                      ))}

                      {SYSTEM_FONTS.map((f) => (
                        <button
                          key={f.name}
                          onClick={() =>
                            setStyle({ ...style, font_name: f.name })
                          }
                          className={cn(
                            "p-2 rounded-lg border text-xs text-left transition truncate cursor-pointer",
                            style.font_name === f.name
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-surface-variant/20 border-white/10 text-on-surface hover:bg-surface-variant/40",
                          )}
                          style={{ fontFamily: f.name }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold uppercase tracking-wider text-on-surface-variant">
                        Cỡ chữ ({style.font_size}px)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="60"
                      value={style.font_size}
                      onChange={(e) =>
                        setStyle({
                          ...style,
                          font_size: Number(e.target.value),
                        })
                      }
                      className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  {/* Y Position Controls */}
                  <div className="space-y-2 p-2.5 rounded-xl bg-surface-variant/20 border border-white/10">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold uppercase tracking-wider text-on-surface flex items-center gap-1.5">
                        <MoveVertical className="w-3.5 h-3.5 text-primary" />
                        Vị trí phụ đề (Y: {currentSegmentY}%)
                      </span>
                      {activeSegment && (
                        <div className="flex items-center gap-1">
                          {activeSegment.customPositionY !== undefined ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Đoạn #{activeSegment.id} riêng
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-on-surface-variant">
                              Mặc định chung
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={currentSegmentY}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (activeSegment) {
                          handleUpdateSegmentPositionY(activeSegment.id, val);
                        } else {
                          setStyle({ ...style, position_y: val });
                        }
                      }}
                      className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
                    />

                    {/* Presets Trên / Giữa / Dưới */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (activeSegment) {
                            handleUpdateSegmentPositionY(activeSegment.id, 15);
                          } else {
                            setStyle({ ...style, position_y: 15 });
                          }
                        }}
                        className={cn(
                          "py-1 px-1.5 rounded-md text-[10px] font-medium border transition text-center flex items-center justify-center gap-1 cursor-pointer",
                          currentSegmentY === 15
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-surface-variant/30 border-white/5 text-on-surface-variant hover:bg-surface-variant/60",
                        )}
                        title="Đặt phụ đề ở phía trên video"
                      >
                        <ArrowUp className="w-2.5 h-2.5" />
                        Trên (15%)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (activeSegment) {
                            handleUpdateSegmentPositionY(activeSegment.id, 50);
                          } else {
                            setStyle({ ...style, position_y: 50 });
                          }
                        }}
                        className={cn(
                          "py-1 px-1.5 rounded-md text-[10px] font-medium border transition text-center flex items-center justify-center gap-1 cursor-pointer",
                          currentSegmentY === 50
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-surface-variant/30 border-white/5 text-on-surface-variant hover:bg-surface-variant/60",
                        )}
                        title="Đặt phụ đề ở chính giữa video"
                      >
                        Giữa (50%)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (activeSegment) {
                            handleUpdateSegmentPositionY(activeSegment.id, 85);
                          } else {
                            setStyle({ ...style, position_y: 85 });
                          }
                        }}
                        className={cn(
                          "py-1 px-1.5 rounded-md text-[10px] font-medium border transition text-center flex items-center justify-center gap-1 cursor-pointer",
                          currentSegmentY === 85
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-surface-variant/30 border-white/5 text-on-surface-variant hover:bg-surface-variant/60",
                        )}
                        title="Đặt phụ đề ở phía dưới video"
                      >
                        <ArrowDown className="w-2.5 h-2.5" />
                        Dưới (85%)
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                      {activeSegment &&
                      activeSegment.customPositionY !== undefined ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleResetSegmentPosition(activeSegment.id)
                          }
                          className="flex items-center gap-1 text-amber-400/90 hover:text-amber-300 transition cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Khôi phục đoạn này
                        </button>
                      ) : (
                        <span className="text-white/40 text-[9px]">
                          Kéo thả trên video để chỉnh
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          handleApplyPositionToAll(currentSegmentY)
                        }
                        className="flex items-center gap-1 text-primary hover:text-primary-fixed-dim transition ml-auto font-medium cursor-pointer"
                        title="Áp dụng vị trí này cho toàn bộ các đoạn trong video"
                      >
                        <CheckCheck className="w-2.5 h-2.5" />
                        Áp dụng tất cả
                      </button>
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        Màu chữ gốc
                      </label>
                      <div className="flex items-center gap-2 p-1.5 bg-surface-variant/30 rounded-lg border border-white/10">
                        <input
                          type="color"
                          value={style.primary_color}
                          onChange={(e) =>
                            setStyle({
                              ...style,
                              primary_color: e.target.value,
                            })
                          }
                          className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                        />
                        <span className="text-[11px] font-mono text-on-surface">
                          {style.primary_color}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        Highlight Karaoke
                      </label>
                      <div className="flex items-center gap-2 p-1.5 bg-surface-variant/30 rounded-lg border border-white/10">
                        <input
                          type="color"
                          value={style.highlight_color}
                          onChange={(e) =>
                            setStyle({
                              ...style,
                              highlight_color: e.target.value,
                            })
                          }
                          className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                        />
                        <span className="text-[11px] font-mono text-on-surface">
                          {style.highlight_color}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Outline Color & Size */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-semibold uppercase tracking-wider text-on-surface-variant">
                        Viền chữ ({style.outline_size}px)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={style.outline_color}
                          onChange={(e) =>
                            setStyle({
                              ...style,
                              outline_color: e.target.value,
                            })
                          }
                          className="w-4 h-4 rounded cursor-pointer bg-transparent border-0"
                        />
                        <span className="font-mono text-[10px] text-on-surface-variant">
                          {style.outline_color}
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      value={style.outline_size}
                      onChange={(e) =>
                        setStyle({
                          ...style,
                          outline_size: Number(e.target.value),
                        })
                      }
                      className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── 3. Bottom Caption & Audio Waveform Timeline ───────────────────── */}
      <TimelineEditor
        currentTime={currentTime}
        duration={videoDuration}
        segments={segments}
        videoFile={videoFile}
        videoUrl={videoUrl}
        isPlaying={isPlaying}
        onSeek={seekTo}
        onTogglePlay={togglePlay}
        onUpdateSegments={(newSegs) => {
          pushHistorySnapshot();
          setSegments(newSegs);
        }}
        onSplit={handleSplitAtPlayhead}
        canUndo={undoStack.length > 0}
        onUndo={handleUndo}
        selectedSegmentId={selectedSegId}
        onSelectSegment={setSelectedSegId}
      />

      {/* Modal Import Kịch bản từ Thư viện */}
      <LibraryScriptModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        onSelectScript={(text) => {
          setReferenceScript(text);
          toast.success("✨ Đã nạp kịch bản từ Thư viện thành công!");
        }}
      />
    </div>
  );
}
