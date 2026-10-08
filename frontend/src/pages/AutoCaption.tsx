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
  Loader2,
  FileUp,
  FileText,
  Wand2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CheckCheck,
  Maximize2,
  Minimize2,
  Palette,
  FolderOpen,
  Check,
  ClipboardPaste,
  Trash2,
  Sliders,
  FileCode,
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

const STEPS = [
  {
    id: 1 as const,
    title: "1. Nạp Video & Kịch bản",
    desc: "Tải file & bóc tách AI",
    icon: Upload,
  },
  {
    id: 2 as const,
    title: "2. Biên tập & Kiểu dáng",
    desc: "Chỉnh từ, timeline, font & vị trí Y",
    icon: FileText,
  },
  {
    id: 3 as const,
    title: "3. Xem trước & Xuất Video",
    desc: "Render video MP4 & tải SRT/VTT",
    icon: Download,
  },
];

export default function AutoCaption() {
  // Stepper Workflow Step: 1 | 2 | 3
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [editorTab, setEditorTab] = useState<"transcript" | "style">(
    "transcript",
  );

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

  // File Drag-and-drop state on Step 1
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Whisper model & language configuration
  const [whisperModel, setWhisperModel] = useState<"medium" | "small" | "base">(
    "medium",
  );
  const [whisperLanguage, setWhisperLanguage] = useState<string>("vi");

  // Undo history stack
  const [undoStack, setUndoStack] = useState<CaptionSegment[][]>([]);

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
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);

  // Raw Segments Backup
  const [rawSegments, setRawSegments] = useState<CaptionSegment[]>([]);

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
      fetch(
        `http://localhost:8000/api/caption/session/${draft.sessionId}/check`,
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.exists) {
            setSessionId(draft.sessionId);
            setVideoUrl(data.video_url || draft.videoUrl);
            if (draft.videoDuration) setVideoDuration(draft.videoDuration);
            setSegments(draft.segments || []);
            setRawSegments(draft.rawSegments || draft.segments || []);
            if (draft.style) setStyle(draft.style);
            if (draft.referenceScript)
              setReferenceScript(draft.referenceScript);
            if (draft.segments && draft.segments.length > 0) {
              setCurrentStep(2);
            }

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
    setCurrentStep(1);
    localStorage.removeItem(DRAFT_STORAGE_KEY);

    if (currentId) {
      fetch(`http://localhost:8000/api/caption/session/${currentId}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    toast.success("✨ Đã dọn dẹp phiên cũ, sẵn sàng cho video mới!");
  };

  // Xử lý nạp file video (dùng chung cho input chọn file và drag-drop)
  const handleProcessVideoFile = (file: File) => {
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
    setCurrentStep(1);
    toast.success(`Đã chọn video: ${file.name}`);
  };

  // Chọn video qua input dialog
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleProcessVideoFile(file);
    e.target.value = "";
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
    formData.append("language", whisperLanguage);
    formData.append("model_size", whisperModel);
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
      const cleanSegs = normalizeSegmentsToLowercase(data.segments || []);
      setSegments(cleanSegs);
      setRawSegments(cleanSegs);

      if (cleanSegs.length === 0) {
        toast.warning(
          "Video không phát hiện thấy âm thanh lời nói rõ ràng. Hãy kiểm tra lại âm lượng video đã xuất.",
          { duration: 6000 },
        );
      } else {
        setCurrentStep(2);
        toast.success(
          `✨ Hoàn tất! Bóc tách được ${cleanSegs.length} câu có mốc thời gian chi tiết khớp với kịch bản.`,
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi nhận diện video");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Helper chuẩn hóa toàn bộ câu và từ thành chữ thường
  const normalizeSegmentsToLowercase = (
    list: CaptionSegment[],
  ): CaptionSegment[] => {
    return (list || []).map((seg) => ({
      ...seg,
      text: seg.text ? seg.text.toLowerCase() : "",
      words: (seg.words || []).map((w) => ({
        ...w,
        word: w.word ? w.word.toLowerCase() : "",
      })),
    }));
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
            reference_script: referenceScript.trim().toLowerCase(),
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
        const cleanSegs = normalizeSegmentsToLowercase(data.segments);
        setSegments(cleanSegs);
        setRawSegments(cleanSegs);
        toast.success(
          `✨ Đã chuẩn hóa 100% chính tả theo kịch bản mẫu (${cleanSegs.length} câu)!`,
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
      const cleanSegs = normalizeSegmentsToLowercase(data.segments || []);
      setSegments(cleanSegs);
      toast.success(
        `✨ Đã chia ngắn thành ${cleanSegs.length} câu chuẩn Shorts/Reels!`,
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
      setSegments(
        normalizeSegmentsToLowercase(JSON.parse(JSON.stringify(rawSegments))),
      );
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
            const cleanSegs = normalizeSegmentsToLowercase(data.segments);
            setSegments(cleanSegs);
            setRawSegments(cleanSegs);
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
        if (selectedSegId) {
          setSegments((prev) =>
            prev.map((s) =>
              s.id === selectedSegId ? { ...s, customPositionY: clampedY } : s,
            ),
          );
        }
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
  }, [isDraggingCaption, activeSegment, selectedSegId]);

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
          segments: normalizeSegmentsToLowercase(segments),
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

  const currentSegmentY =
    activeSegment?.customPositionY ??
    (selectedSegId
      ? (segments.find((s) => s.id === selectedSegId)?.customPositionY ??
        style.position_y)
      : style.position_y);

  // ─── Format mốc thời gian phụ đề .SRT và .VTT ────────────────────────────
  const formatTimestampSrt = (seconds: number) => {
    const pad = (n: number, z = 2) => String(Math.floor(n)).padStart(z, "0");
    const hrs = pad(seconds / 3600);
    const mins = pad((seconds % 3600) / 60);
    const secs = pad(seconds % 60);
    const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, "0");
    return `${hrs}:${mins}:${secs},${ms}`;
  };

  const formatTimestampVtt = (seconds: number) => {
    const pad = (n: number, z = 2) => String(Math.floor(n)).padStart(z, "0");
    const hrs = pad(seconds / 3600);
    const mins = pad((seconds % 3600) / 60);
    const secs = pad(seconds % 60);
    const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, "0");
    return `${hrs}:${mins}:${secs}.${ms}`;
  };

  const handleDownloadSrt = () => {
    if (!segments.length) {
      toast.error("Chưa có phụ đề để tải về");
      return;
    }
    const srtContent = segments
      .map((seg, idx) => {
        return `${idx + 1}\n${formatTimestampSrt(seg.start)} --> ${formatTimestampSrt(seg.end)}\n${seg.text.toLowerCase()}\n`;
      })
      .join("\n");

    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${videoFile?.name?.replace(/\.[^/.]+$/, "") || "subtitles"}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✨ Đã tải file phụ đề .SRT thành công!");
  };

  const handleDownloadVtt = () => {
    if (!segments.length) {
      toast.error("Chưa có phụ đề để tải về");
      return;
    }
    let vttContent = "WEBVTT\n\n";
    vttContent += segments
      .map((seg, idx) => {
        return `${idx + 1}\n${formatTimestampVtt(seg.start)} --> ${formatTimestampVtt(seg.end)}\n${seg.text.toLowerCase()}\n`;
      })
      .join("\n");

    const blob = new Blob([vttContent], { type: "text/vtt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${videoFile?.name?.replace(/\.[^/.]+$/, "") || "subtitles"}.vtt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✨ Đã tải file phụ đề .VTT thành công!");
  };

  // ─── Reusable Video Player với Kinetic Subtitle Overlay ──────────────────
  const renderVideoPlayer = (interactiveDrag = false) => {
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
              onLoadedMetadata={(e) => {
                const vid = e.currentTarget;
                const dur = vid.duration || 0;
                setVideoDuration(dur);
                if (vid.videoWidth && vid.videoHeight) {
                  setVideoAspectRatio(vid.videoWidth / vid.videoHeight);
                }
                if (currentTime > 0) {
                  vid.currentTime = currentTime;
                }
              }}
              onEnded={() => setIsPlaying(false)}
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
              {/* Badge định vị Y và nút thao tác nhanh (Chỉ hiển thị khi interactiveDrag) */}
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

  // ─── Component Bảng Điều Khiển Kiểu Dáng Chữ ──────────────────────────────
  const renderStyleControlsContent = (withHeader = true) => {
    return (
      <div className="flex flex-col space-y-4 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 flex-1">
        {withHeader && (
          <div className="flex items-center justify-between pb-2 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-on-surface">
                Kiểu dáng Chữ Kinetic
              </h3>
            </div>
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
              Tự động Karaoke
            </span>
          </div>
        )}

        {/* Font Family Selection */}
        <div className="space-y-1.5 shrink-0">
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
                onClick={() => setStyle({ ...style, font_name: name })}
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
                onClick={() => setStyle({ ...style, font_name: f.name })}
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
        <div className="space-y-1.5 shrink-0">
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
        <div className="space-y-2 p-2.5 rounded-xl bg-surface-variant/20 border border-white/10 shrink-0">
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
            {activeSegment && activeSegment.customPositionY !== undefined ? (
              <button
                type="button"
                onClick={() => handleResetSegmentPosition(activeSegment.id)}
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
              onClick={() => handleApplyPositionToAll(currentSegmentY)}
              className="flex items-center gap-1 text-primary hover:text-primary-fixed-dim transition ml-auto font-medium cursor-pointer"
              title="Áp dụng vị trí này cho toàn bộ các câu trong video"
            >
              <CheckCheck className="w-2.5 h-2.5" />
              Áp dụng tất cả
            </button>
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-2.5 shrink-0">
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
        <div className="space-y-2 shrink-0">
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
    );
  };

  return (
    <div className="w-full max-w-full px-2 md:px-4 pb-16 space-y-4">
      <input
        type="file"
        ref={videoInputRef}
        onChange={handleVideoSelect}
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
      />

      {/* ─── 1. Header Toolbar Tinh Gọn ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-surface/85 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-white/10 shadow-xl">
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
              Tạo phụ đề tự động theo quy trình 3 bước tinh gọn, tự động đồng bộ
              mốc thời gian
            </p>
          </div>
        </div>

        {/* Global Action Header: Đổi video & Làm video mới */}
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          {videoFile && (
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 hover:border-primary/50 bg-surface-variant/40 hover:bg-surface-variant text-on-surface transition text-xs font-medium cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-primary" />
              <span>Đổi video</span>
            </button>
          )}

          {(sessionId || videoUrl || segments.length > 0) && (
            <button
              onClick={handleStartNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 hover:border-red-500/60 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition cursor-pointer"
              title="Dọn dẹp phiên hiện tại và bắt đầu làm video mới"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-400" />
              <span>Làm video mới</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. Stepper Progress Bar (Thanh điều hướng 3 giai đoạn) ──────────── */}
      <div className="bg-surface/75 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-lg">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const isAccessible = step.id === 1 || segments.length > 0;
            const StepIcon = step.icon;

            return (
              <button
                key={step.id}
                disabled={!isAccessible}
                onClick={() => {
                  if (isAccessible) {
                    setCurrentStep(step.id);
                  } else {
                    toast.info(
                      "Vui lòng hoàn thành bước nạp video và tạo phụ đề trước.",
                    );
                  }
                }}
                className={cn(
                  "flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer",
                  isActive
                    ? "bg-primary/20 border-primary text-primary shadow-md shadow-primary/10"
                    : isCompleted
                      ? "bg-surface-variant/30 border-emerald-500/30 text-on-surface hover:bg-surface-variant/50"
                      : "bg-surface-variant/10 border-white/5 text-on-surface-variant/50 cursor-not-allowed opacity-60",
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition",
                    isActive
                      ? "bg-primary text-on-primary shadow-sm"
                      : isCompleted
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-white/5 text-on-surface-variant",
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <StepIcon className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate flex items-center gap-1.5">
                    <span>{step.title}</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant/70 truncate hidden sm:block">
                    {step.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 3. WORKFLOW STEP CONTENTS ─────────────────────────────────────── */}

      {/* ── BƯỚC 1: NẠP VIDEO & KỊCH BẢN ────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start animate-fadeIn">
          {/* Cột Trái: Chọn Video Dropzone & Preview */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="bg-surface/80 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Video className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold text-on-surface">
                    1. Chọn Video (.mp4 / .mov / .webm)
                  </h2>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Video đã edit từ CapCut/Premiere có giọng đọc rõ ràng
                </p>
              </div>

              {videoFile ? (
                <div className="p-4 rounded-xl bg-surface-variant/30 border border-white/10 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/20 text-primary border border-primary/30">
                      <Video className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-on-surface truncate">
                        {videoFile.name}
                      </p>
                      <p className="text-[11px] text-on-surface-variant">
                        {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                        {videoDuration > 0 && ` • ${videoDuration.toFixed(1)}s`}
                      </p>
                    </div>
                  </div>

                  {videoUrl && (
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 border border-white/10">
                      <video
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        controls
                        playsInline
                      />
                    </div>
                  )}

                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full py-2 rounded-lg bg-surface-variant/60 hover:bg-surface-variant border border-white/10 text-xs font-semibold text-on-surface transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5 text-primary" />
                    <span>Chọn video khác</span>
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessVideoFile(file);
                  }}
                  onClick={() => videoInputRef.current?.click()}
                  className={cn(
                    "min-h-[220px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition cursor-pointer group",
                    isDraggingFile
                      ? "border-primary bg-primary/10 scale-[1.01]"
                      : "border-white/15 hover:border-primary/50 bg-surface-variant/20 hover:bg-surface-variant/30",
                  )}
                >
                  <div className="p-3.5 rounded-2xl bg-primary/15 text-primary mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-on-surface">
                    Kéo thả video vào đây hoặc nhấp để chọn
                  </h3>
                  <p className="text-xs text-on-surface-variant max-w-xs mt-1">
                    Định dạng hỗ trợ: MP4, MOV, WEBM (Khuyên dùng video dọc
                    9:16)
                  </p>
                </div>
              )}

              <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-[11px] text-on-surface-variant flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <span>
                  Hệ thống sử dụng Whisper AI bóc tách giọng nói từng từ
                  (word-level timestamps) và tự động chống câu cụt/vụn.
                </span>
              </div>
            </div>
          </div>

          {/* Cột Phải: Kịch Bản Đối Chiếu & Cấu Hình Whisper AI */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="bg-surface/80 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-on-surface">
                      2. Kịch bản đọc đối chiếu (Khuyên dùng)
                    </h2>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                      Chính xác 100%
                    </span>
                  </div>

                  {/* Actions Kịch bản */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsLibraryModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[11px] font-semibold transition cursor-pointer"
                    >
                      <FolderOpen className="w-3 h-3 text-amber-400" />
                      <span>Import từ Thư viện</span>
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
                            "Vui lòng nhấn Ctrl+V trực tiếp vào ô để dán!",
                          );
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-variant/40 hover:bg-surface-variant border border-white/10 text-on-surface text-[11px] font-medium transition cursor-pointer"
                    >
                      <ClipboardPaste className="w-3 h-3 text-primary" />
                      <span>Dán Clipboard</span>
                    </button>

                    {referenceScript.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setReferenceScript("");
                          toast.info("Đã xóa kịch bản đối chiếu");
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-red-400/80 hover:text-red-400 text-[11px] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-on-surface-variant">
                  Dán kịch bản bạn đã dùng để lồng tiếng để AI so khớp chính tả
                  100% chuẩn xác từng từ
                </p>
              </div>

              {/* Textarea kịch bản - Kích thước cân đối, không kéo dãn vỡ UI */}
              <div className="space-y-1">
                <textarea
                  id="reference_script"
                  name="reference_script"
                  value={referenceScript}
                  onChange={(e) => setReferenceScript(e.target.value)}
                  placeholder="Dán toàn bộ kịch bản vào đây, hoặc nhấn nút 'Import từ Thư viện' ở góc trên để nạp kịch bản tự động..."
                  rows={5}
                  className="w-full min-h-[140px] max-h-[220px] px-3.5 py-2.5 rounded-xl bg-surface-variant/30 border border-white/10 text-on-surface placeholder:text-on-surface-variant/40 text-xs focus:outline-none focus:border-amber-500/50 resize-y leading-relaxed font-sans"
                />
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant px-1">
                  <span>
                    {referenceScript.trim() ? (
                      <strong className="text-emerald-400">
                        ✓ Đã có {referenceScript.length} ký tự •{" "}
                        {
                          referenceScript.trim().split(/\s+/).filter(Boolean)
                            .length
                        }{" "}
                        từ
                      </strong>
                    ) : (
                      "Không bắt buộc (nếu để trống, Whisper AI sẽ tự nhận diện âm thanh gốc)"
                    )}
                  </span>
                </div>
              </div>

              {/* Cấu hình Whisper AI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-surface-variant/20 border border-white/10">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-primary" />
                    <span>Ngôn ngữ âm thanh</span>
                  </label>
                  <select
                    value={whisperLanguage}
                    onChange={(e) => setWhisperLanguage(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface-variant/40 border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary/50"
                  >
                    <option
                      value="vi"
                      className="bg-surface-variant text-on-surface"
                    >
                      Tiếng Việt (Khuyên dùng)
                    </option>
                    <option
                      value="en"
                      className="bg-surface-variant text-on-surface"
                    >
                      Tiếng Anh (English)
                    </option>
                    <option
                      value="auto"
                      className="bg-surface-variant text-on-surface"
                    >
                      Tự động nhận diện (Auto detect)
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span>Mô hình Whisper AI</span>
                  </label>
                  <select
                    value={whisperModel}
                    onChange={(e) => setWhisperModel(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface-variant/40 border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary/50"
                  >
                    <option
                      value="medium"
                      className="bg-surface-variant text-on-surface"
                    >
                      Medium (Chuyên sâu)
                    </option>
                    <option
                      value="base"
                      className="bg-surface-variant text-on-surface"
                    >
                      Base (Nhanh 2x, khuyên dùng)
                    </option>
                    <option
                      value="small"
                      className="bg-surface-variant text-on-surface"
                    >
                      Small (Chuẩn xác cao hơn)
                    </option>
                  </select>
                </div>
              </div>

              {/* Action Buttons Step 1 */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleTranscribe}
                  disabled={!videoFile || isTranscribing}
                  className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 text-on-primary font-bold transition-all shadow-lg hover:shadow-primary/25 disabled:opacity-50 text-sm cursor-pointer flex items-center justify-center gap-2"
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang bóc tách âm thanh & nhận diện AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Bắt đầu Tạo Phụ Đề</span>
                    </>
                  )}
                </button>

                {segments.length > 0 && referenceScript.trim() && (
                  <button
                    type="button"
                    onClick={handleAlignScript}
                    disabled={isAligningScript}
                    className="w-full sm:w-auto py-3 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 font-semibold transition text-xs cursor-pointer flex items-center justify-center gap-1.5"
                    title="Khớp lại chính tả từ kịch bản đối chiếu"
                  >
                    {isAligningScript ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    <span>Khớp chính tả</span>
                  </button>
                )}

                {segments.length > 0 && (
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="w-full sm:w-auto py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition text-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Tiếp tục: Biên tập & Kiểu dáng</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BƯỚC 2: BIÊN TẬP & KIỂU DÁNG ───────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="space-y-4 animate-fadeIn">
          {/* Sub-Nav Action Bar cho Bước 2 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/70 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 shadow-md">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-surface-variant/40 hover:bg-surface-variant text-on-surface text-xs font-medium transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại: Nạp Video</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant font-medium">
                Đang có{" "}
                <strong className="text-primary font-bold">
                  {segments.length}
                </strong>{" "}
                đoạn câu
                <span className="text-white/40 ml-1.5 hidden sm:inline">
                  • Kéo trực tiếp phụ đề trên video để chỉnh vị trí Y (
                  {currentSegmentY}%)
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(3)}
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
                  Kéo thả phụ đề trên màn hình video để chỉnh vị trí Y nhanh
                  chóng ({currentSegmentY}%)
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
                    onUpdateSegments={(newSegs) => {
                      pushHistorySnapshot();
                      setSegments(normalizeSegmentsToLowercase(newSegs));
                    }}
                    onOptimizeChunks={handleOptimizeChunks}
                    isOptimizingChunks={isOptimizingChunks}
                    onRestoreSync={handleRestoreSync}
                    hasRawSegments={
                      rawSegments.length > 0 || Boolean(sessionId)
                    }
                    onUpdateTimeline={handleUpdateTimeline}
                  />
                ) : (
                  renderStyleControlsContent(false)
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
            onUpdateSegments={(newSegs) => {
              pushHistorySnapshot();
              setSegments(normalizeSegmentsToLowercase(newSegs));
            }}
            onSplit={handleSplitAtPlayhead}
            canUndo={undoStack.length > 0}
            onUndo={handleUndo}
            selectedSegmentId={selectedSegId}
            onSelectSegment={setSelectedSegId}
          />
        </div>
      )}

      {/* ── BƯỚC 3: XEM TRƯỚC & XUẤT VIDEO ──────────────────────────────────── */}
      {currentStep === 3 && (
        <div className="space-y-4 animate-fadeIn">
          {/* Sub-Nav Action Bar cho Bước 3 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/70 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 shadow-md">
            <button
              onClick={() => setCurrentStep(2)}
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
                    Video được ghép phụ đề Kinetic Karaoke sắc nét, tải trực
                    tiếp về máy tính.
                  </p>
                </div>

                {/* Secondary Actions: Tải file phụ đề rời .SRT & .VTT */}
                <div className="pt-3 border-t border-white/5 space-y-2">
                  <h4 className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-primary" />
                    <span>
                      Tải file phụ đề rời (Cho Premiere, CapCut, YouTube)
                    </span>
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
                      onClick={() => {
                        setCurrentStep(2);
                        setEditorTab("transcript");
                      }}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Sửa lời thoại
                    </button>
                    <span>•</span>
                    <button
                      onClick={() => {
                        setCurrentStep(2);
                        setEditorTab("style");
                      }}
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
      )}

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
