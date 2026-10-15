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
  RotateCcw,
  Sparkles,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LibraryScriptModal } from "@/components/caption/LibraryScriptModal";
import { useTTSStore } from "@/store/useTTSStore";
import {
  type CaptionSegment,
  type WordTiming,
  type StyleConfig,
  DEFAULT_STYLE,
  DRAFT_STORAGE_KEY,
  STEPS,
  VideoPlayerPreview,
  StyleControls,
  CaptionStepUpload,
  CaptionStepEditor,
  CaptionStepExport,
} from "@/features/caption";

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

  // Xử lý nạp file video
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

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleProcessVideoFile(file);
    e.target.value = "";
  };

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

  // So khớp kịch bản đối chiếu
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

  // Cập nhật timeline chống lệch mốc
  const handleUpdateTimeline = useCallback(() => {
    if (!segments.length) {
      toast.info("Chưa có phụ đề để cập nhật timeline.");
      return;
    }

    pushHistorySnapshot();
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const normalized: CaptionSegment[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const seg = { ...sorted[i] };
      const words = seg.words ? [...seg.words] : [];

      if (words.length > 0) {
        words.sort((a, b) => a.start - b.start);
        for (let j = 0; j < words.length - 1; j++) {
          if (words[j].end > words[j + 1].start) {
            words[j].end = words[j + 1].start;
          }
        }
        seg.start = words[0].start;
        seg.end = words[words.length - 1].end;
        seg.words = words;
      }

      if (normalized.length > 0) {
        const prev = normalized[normalized.length - 1];
        if (seg.start < prev.end) {
          seg.start = prev.end;
          if (seg.end <= seg.start) {
            seg.end = seg.start + 0.5;
          }
        }
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

  const currentSegmentY =
    (activeSegment
      ? (activeSegment.customPositionY ?? style.position_y)
      : selectedSegId
      ? (segments.find((s) => s.id === selectedSegId)?.customPositionY ??
        style.position_y)
      : style.position_y);

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
            position_y: currentSegmentY,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Không thể xuất video");
      }

      const data = await response.json();
      if (data.download_url) {
        window.open(data.download_url, "_blank");
        toast.success("✨ Đã render thành công! Bắt đầu tải video về máy.");
      } else {
        toast.success("✨ Đã render video xong!");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi xuất video");
    } finally {
      setIsExporting(false);
    }
  };

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

  const renderVideoPlayer = (interactiveDrag = false) => {
    return (
      <VideoPlayerPreview
        videoContainerRef={videoContainerRef}
        videoRef={videoRef}
        videoUrl={videoUrl}
        videoAspectRatio={videoAspectRatio}
        isFullscreen={isFullscreen}
        isPlaying={isPlaying}
        currentTime={currentTime}
        videoDuration={videoDuration}
        activeSegment={activeSegment}
        activeWordIdx={activeWordIdx}
        currentSegmentY={currentSegmentY}
        style={style}
        interactiveDrag={interactiveDrag}
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
        togglePlay={togglePlay}
        seekTo={seekTo}
        handleToggleFullscreen={handleToggleFullscreen}
        handleCaptionMouseDown={handleCaptionMouseDown}
        handleResetSegmentPosition={handleResetSegmentPosition}
        handleApplyPositionToAll={handleApplyPositionToAll}
      />
    );
  };

  const renderStyleControlsContent = (withHeader = true) => {
    return (
      <StyleControls
        style={style}
        setStyle={setStyle}
        customFonts={customFonts}
        onCustomFontUpload={handleCustomFontUpload}
        currentSegmentY={currentSegmentY}
        activeSegment={activeSegment}
        onUpdateSegmentPositionY={handleUpdateSegmentPositionY}
        onResetSegmentPosition={handleResetSegmentPosition}
        onApplyPositionToAll={handleApplyPositionToAll}
        withHeader={withHeader}
      />
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

      {/* 1. Header Toolbar */}
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

      {/* 2. Stepper Progress Bar */}
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

      {/* 3. Workflow Steps */}
      {currentStep === 1 && (
        <CaptionStepUpload
          videoFile={videoFile}
          videoUrl={videoUrl}
          videoDuration={videoDuration}
          isDraggingFile={isDraggingFile}
          setIsDraggingFile={setIsDraggingFile}
          videoInputRef={videoInputRef}
          handleProcessVideoFile={handleProcessVideoFile}
          referenceScript={referenceScript}
          setReferenceScript={setReferenceScript}
          setIsLibraryModalOpen={setIsLibraryModalOpen}
          whisperLanguage={whisperLanguage}
          setWhisperLanguage={setWhisperLanguage}
          whisperModel={whisperModel}
          setWhisperModel={setWhisperModel}
          handleTranscribe={handleTranscribe}
          isTranscribing={isTranscribing}
          segments={segments}
          handleAlignScript={handleAlignScript}
          isAligningScript={isAligningScript}
          onGoToNextStep={() => setCurrentStep(2)}
        />
      )}

      {currentStep === 2 && (
        <CaptionStepEditor
          onGoToStep={(s) => setCurrentStep(s)}
          segments={segments}
          currentSegmentY={currentSegmentY}
          renderVideoPlayer={renderVideoPlayer}
          editorTab={editorTab}
          setEditorTab={setEditorTab}
          currentTime={currentTime}
          isPlaying={isPlaying}
          seekTo={seekTo}
          onUpdateSegments={(newSegs) => {
            pushHistorySnapshot();
            setSegments(normalizeSegmentsToLowercase(newSegs));
          }}
          onOptimizeChunks={handleOptimizeChunks}
          isOptimizingChunks={isOptimizingChunks}
          onRestoreSync={handleRestoreSync}
          hasRawSegments={rawSegments.length > 0 || Boolean(sessionId)}
          onUpdateTimeline={handleUpdateTimeline}
          renderStyleControls={() => renderStyleControlsContent(false)}
          videoDuration={videoDuration}
          videoFile={videoFile}
          videoUrl={videoUrl}
          togglePlay={togglePlay}
          handleSplitAtPlayhead={handleSplitAtPlayhead}
          canUndo={undoStack.length > 0}
          onUndo={handleUndo}
          selectedSegId={selectedSegId}
          setSelectedSegId={setSelectedSegId}
        />
      )}

      {currentStep === 3 && (
        <CaptionStepExport
          onGoToStep={(s) => setCurrentStep(s)}
          renderVideoPlayer={renderVideoPlayer}
          videoFile={videoFile}
          videoDuration={videoDuration}
          segments={segments}
          style={style}
          handleExport={handleExport}
          isExporting={isExporting}
          handleDownloadSrt={handleDownloadSrt}
          handleDownloadVtt={handleDownloadVtt}
          onSwitchTabInEditor={(tab) => {
            setCurrentStep(2);
            setEditorTab(tab);
          }}
        />
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
