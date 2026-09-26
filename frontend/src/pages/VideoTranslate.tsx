import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Upload,
  Play,
  Download,
  Sparkles,
  Languages,
  Music,
  Settings2,
  Film,
  CheckCircle2,
  Loader2,
  FileVideo,
  Sliders,
  Wand2,
  Subtitles,
  Trash2,
  ExternalLink,
  Key,
  RotateCcw,
  FileEdit,
  Save,
  Maximize2,
  Minimize2,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  FolderOpen,
  Brain,
  Mic,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TranslationMemoryModal } from "@/components/TranslationMemoryModal";

import {
  useVideoTranslateStore,
  type VoiceOption,
  type TranslationProgress,
  type StudioSegment,
} from "@/store/useVideoTranslateStore";

const STEP_LABELS: Record<string, { label: string; icon: string }> = {
  extracting: { label: "Tách âm thanh & Nhạc nền", icon: "🎵" },
  transcribing: { label: "Bóc băng giọng nói (Faster-Whisper)", icon: "🎙️" },
  review_original: { label: "Tạm dừng duyệt câu gốc", icon: "⏸️" },
  translating: { label: "Dịch thuật phụ đề AI", icon: "🌐" },
  dubbing: { label: "Lồng tiếng tự động (Voice Dubbing)", icon: "🗣️" },
  aligning: { label: "Khớp lời thoại & Hòa âm (Lip-sync)", icon: "⚡" },
  rendering: { label: "Ghép phụ đề & Render Video MP4", icon: "🎬" },
  completed: { label: "Hoàn tất thành phẩm", icon: "✅" },
  failed: { label: "Có lỗi xảy ra", icon: "❌" },
};

export default function VideoTranslate() {
  const [isExpandedPlayer, setIsExpandedPlayer] = React.useState(false);
  const [isVerifyingKey, setIsVerifyingKey] = React.useState(false);
  const [keyVerifyResult, setKeyVerifyResult] = React.useState<{ valid: boolean; message: string } | null>(null);

  const [isOpeningFolder, setIsOpeningFolder] = React.useState(false);
  const transcriptContainerRef = React.useRef<HTMLDivElement>(null);

  const formatSrtTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const {
    videoFile,
    videoFileName,
    videoFileSize,
    videoPreviewUrl,
    languages,
    sourceLang,
    targetLang,
    voices,
    selectedVoice,
    selectedEngine,
    voiceRate,
    preserveBgm,
    bgmVolume,
    subtitleMode,
    maxSpeedRate,
    translationProvider,
    translationStyle,
    geminiApiKey,
    geminiModel,
    geminiTemperature,
    showAdvanced,
    isProcessing,
    isCleaning,
    isOpeningEditor,
    isRedubbing,
    showSrtEditor,
    srtText,
    isLoadingSrt,
    isSavingSrt,
    taskId,
    taskStatus,
    elapsedSeconds,
    setVideoFile,
    setLanguages,
    setSourceLang,
    setTargetLang,
    setVoices,
    setSelectedVoice,
    setSelectedEngine,
    setVoiceRate,
    setPreserveBgm,
    setBgmVolume,
    setSubtitleMode,
    setMaxSpeedRate,
    setTranslationProvider,
    setTranslationStyle,
    setGeminiApiKey,
    setGeminiModel,
    setGeminiTemperature,
    whisperModel,
    setWhisperModel,
    setShowAdvanced,
    setIsProcessing,
    setIsCleaning,
    setIsOpeningEditor,
    setIsRedubbing,
    setShowSrtEditor,
    setSrtText,
    setIsLoadingSrt,
    setIsSavingSrt,
    studioSegments,
    activeStudioSegmentId,
    isLoadingStudioSegments,
    isRemuxingStudioVideo,
    studioRemuxMessage,
    setStudioSegments,
    updateStudioSegmentText,
    setStudioSegmentRedubbing,
    updateSingleStudioSegment,
    setActiveStudioSegmentId,
    setIsLoadingStudioSegments,
    setIsRemuxingStudioVideo,
    setStudioRemuxMessage,
    setTaskId,
    setTaskStatus,
    setElapsedSeconds,
    resetAll,
    fetchActiveTask,
  } = useVideoTranslateStore();

  const [studioSearch, setStudioSearch] = React.useState("");
  const [playingAudioSegId, setPlayingAudioSegId] = React.useState<number | null>(null);

  const filteredStudioSegments = studioSegments.filter((s) => {
    if (!studioSearch.trim()) return true;
    const q = studioSearch.toLowerCase();
    return s.text.toLowerCase().includes(q) || (s.original_text && s.original_text.toLowerCase().includes(q));
  });

  // Bộ đếm thời gian thực (wall-clock) chống lag/đứng giờ khi chuyển tab hoặc render video lâu
  const taskStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let timer: any = null;
    if (isProcessing) {
      if (!taskStartTimeRef.current) {
        taskStartTimeRef.current = Date.now() - (elapsedSeconds * 1000);
      }
      timer = setInterval(() => {
        if (taskStartTimeRef.current) {
          const diff = Math.floor((Date.now() - taskStartTimeRef.current) / 1000);
          setElapsedSeconds(Math.max(0, diff));
        }
      }, 1000);
    } else {
      taskStartTimeRef.current = null;
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isProcessing, setElapsedSeconds]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins > 0) {
      return `${mins} phút ${secs.toString().padStart(2, "0")} giây`;
    }
    return `${secs} giây`;
  };

  // Result Video Audio Element
  const resultVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Translation Memory (Bộ nhớ tự học)
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);

  const fetchMemoryCount = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/video-translate/memory?limit=1");
      const data = await res.json();
      if (res.ok && typeof data.total === "number") {
        setMemoryCount(data.total);
      }
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    fetchMemoryCount();
  }, []);

  // 1. Tải danh mục ngôn ngữ từ Backend
  useEffect(() => {
    fetch("http://localhost:8000/api/translate/languages")
      .then((res) => res.json())
      .then((data) => {
        if (data.languages) setLanguages(data.languages);
      })
      .catch((err) => console.error("Lỗi tải ngôn ngữ:", err));
  }, []);

  // 2. Tải danh sách giọng đọc theo ngôn ngữ đích (targetLang)
  useEffect(() => {
    fetch(`http://localhost:8000/api/dubbing/voices?lang=${targetLang}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          // Giữ nguyên giọng đã chọn nếu vẫn còn trong danh sách, nếu không thì chọn mặc định
          const exists = data.voices.find((v: VoiceOption) => v.id === selectedVoice);
          if (!exists) {
            const defaultV =
              data.voices.find((v: VoiceOption) => v.id.includes("HoaiMy") || v.id.includes("Jenny")) ||
              data.voices[0];
            setSelectedVoice(defaultV.id);
            setSelectedEngine(defaultV.engine);
          }
        }
      })
      .catch((err) => console.error("Lỗi tải giọng đọc:", err));
  }, [targetLang]);

  // 3. Khôi phục tác vụ đang chạy khi chuyển trang hoặc mở lại trình duyệt
  useEffect(() => {
    let isMounted = true;
    const restoreActiveTask = async () => {
      let currentId = taskId;
      if (!currentId) {
        const active = await fetchActiveTask();
        if (active && isMounted) {
          currentId = active.task_id;
        }
      }
      if (currentId && isMounted) {
        try {
          const res = await fetch(`http://localhost:8000/api/video-translate/status/${currentId}`);
          if (res.ok) {
            const data: TranslationProgress = await res.json();
            if (isMounted) {
              setTaskStatus(data);
              if (data.status === "processing" || data.status === "queued") {
                setIsProcessing(true);
              } else {
                setIsProcessing(false);
                setIsRedubbing(false);
              }
            }
          }
        } catch (e) {
          console.error("Lỗi khi khôi phục task:", e);
        }
      }
    };

    restoreActiveTask();
    return () => {
      isMounted = false;
    };
  }, []);

  // 4. Polling liên tục khi có tiến trình đang xử lý (kể cả khi vừa chuyển trang quay lại)
  useEffect(() => {
    if (!isProcessing || !taskId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/video-translate/status/${taskId}`);
        if (!res.ok) return;

        const data: TranslationProgress = await res.json();
        setTaskStatus(data);

        // Đồng bộ thời gian thực chuẩn xác với server (chống lệch giờ khi render video)
        if (typeof data.elapsed_time === "number" && data.elapsed_time > 0) {
          const srvSec = Math.round(data.elapsed_time);
          setElapsedSeconds(srvSec);
          taskStartTimeRef.current = Date.now() - (srvSec * 1000);
        }

        if (data.status === "completed") {
          setIsProcessing(false);
          setIsRedubbing(false);
          toast.success("🎉 Video đã hoàn tất dịch & lồng tiếng!");
          if (resultVideoRef.current) {
            resultVideoRef.current.load();
          }
        } else if (data.status === "failed") {
          setIsProcessing(false);
          setIsRedubbing(false);
          toast.error(data.error || "Quá trình dịch video gặp sự cố");
        }
      } catch (e) {
        console.error("Lỗi polling status:", e);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isProcessing, taskId, setIsProcessing, setIsRedubbing, setTaskStatus]);

  // 5. Xử lý tải video lên
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Vui lòng chọn file video hợp lệ (MP4, MKV, MOV, WebM)");
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file, url);
    setTaskId(null);
    setTaskStatus(null);
    // Kích hoạt nạp trước Faster-Whisper trong lúc người dùng tinh chỉnh tham số
    fetch("http://localhost:8000/api/video-translate/warmup").catch(() => {});
    toast.success(`Đã chọn video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
  };

  // Xác thực Google AI Studio API Key
  const handleVerifyGeminiKey = async () => {
    if (!geminiApiKey.trim()) {
      toast.error("Vui lòng dán mã API Key trước khi kiểm tra!");
      return;
    }
    setIsVerifyingKey(true);
    setKeyVerifyResult(null);
    try {
      const res = await fetch("http://localhost:8000/api/video-translate/verify-gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: geminiApiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể kiểm tra API Key");
      setKeyVerifyResult(data);
      if (data.valid) {
        toast.success(data.message, { duration: 6000 });
      } else {
        toast.error(data.message, { duration: 7000 });
      }
    } catch (err: any) {
      toast.error("Lỗi kiểm tra key: " + err.message);
    } finally {
      setIsVerifyingKey(false);
    }
  };

  // 6. Kích hoạt Pipeline Dịch & Lồng tiếng
  const handleStartTranslation = async () => {
    if (!videoFile) {
      toast.error("Vui lòng tải video cần dịch lên trước.");
      return;
    }

    if (translationProvider === "gemini" && !geminiApiKey.trim()) {
      toast.error("Bạn đã chọn Google AI Studio nhưng chưa nhập API Key. Vui lòng nhập API Key để dịch chuẩn ngữ cảnh phim, hoặc chọn kênh 'Google Dịch (Miễn phí)'.");
      return;
    }

    setIsProcessing(true);
    setTaskStatus(null);
    setElapsedSeconds(0);
    taskStartTimeRef.current = Date.now();

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("source_lang", sourceLang);
    formData.append("target_lang", targetLang);
    formData.append("voice_id", selectedVoice);
    formData.append("engine", selectedEngine);
    formData.append("voice_rate", voiceRate);
    formData.append("voice_pitch", "+0Hz");
    formData.append("voice_volume", "1.0");
    formData.append("preserve_bgm", preserveBgm ? "true" : "false");
    formData.append("bgm_volume", bgmVolume.toString());
    formData.append("subtitle_mode", subtitleMode);
    formData.append("max_speed_rate", maxSpeedRate.toString());
    formData.append("translation_provider", translationProvider);
    formData.append("translation_style", translationStyle);
    formData.append("translation_model", geminiModel);
    formData.append("translation_temperature", geminiTemperature.toString());
    formData.append("whisper_model", whisperModel);
    if (geminiApiKey.trim()) {
      formData.append("translation_api_key", geminiApiKey.trim());
    }

    try {
      toast.info("🚀 Đang khởi chạy quy trình dịch & lồng tiếng video...", { duration: 4000 });

      const uploadPromise = new Promise<{ task_id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "http://localhost:8000/api/video-translate/start");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            const loadedMB = (event.loaded / (1024 * 1024)).toFixed(1);
            const totalMB = (event.total / (1024 * 1024)).toFixed(1);
            setTaskStatus({
              task_id: "uploading",
              status: "processing",
              progress: percent,
              current_step: "extracting",
              message:
                percent < 100
                  ? `Đang tải video lên máy chủ: ${percent}% (${loadedMB}/${totalMB} MB)...`
                  : `Đã tải lên 100% (${totalMB} MB). Đang nạp video vào hệ thống xử lý...`,
            });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              resolve({ task_id: xhr.responseText });
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.detail || "Không thể khởi chạy tác vụ dịch video"));
            } catch {
              reject(new Error(`Tải video thất bại (HTTP ${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải video lên máy chủ"));
        xhr.send(formData);
      });

      const data = await uploadPromise;
      setTaskId(data.task_id);
      setIsProcessing(true);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi bắt đầu dịch video");
      setIsProcessing(false);
    }
  };

  // Mở file subtitles.srt trực tiếp bằng Notepad++ hoặc Notepad
  const handleOpenEditor = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;
    setIsOpeningEditor(true);
    try {
      const res = await fetch(`http://localhost:8000/api/video-translate/open-editor/${currentId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể mở trình soạn thảo");
      if (data.content) {
        setSrtText(data.content);
        setShowSrtEditor(true);
      }
      toast.success(data.message, { duration: 7000 });
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi mở editor");
      // Dự phòng: Tự động tải nội dung SRT mở trên giao diện Web
      try {
        const resWeb = await fetch(`http://localhost:8000/api/video-translate/subtitles-content/${currentId}`);
        const dataWeb = await resWeb.json();
        if (resWeb.ok && dataWeb.content) {
          setSrtText(dataWeb.content);
          setShowSrtEditor(true);
          toast.info("Đã mở trình chỉnh sửa phụ đề trực tiếp trên Web.");
        }
      } catch (_) {}
    } finally {
      setIsOpeningEditor(false);
    }
  };

  // Lồng tiếng lại theo phụ đề SRT đã chỉnh sửa
  const handleRedub = async (customSrtContent?: string) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;
    setIsRedubbing(true);
    setElapsedSeconds(0);
    taskStartTimeRef.current = Date.now();
    try {
      toast.info("Đang bắt đầu lồng tiếng và render lại video...");
      const res = await fetch(`http://localhost:8000/api/video-translate/redub/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srt_content: customSrtContent || undefined,
          voice_id: selectedVoice,
          engine: selectedEngine,
          voice_rate: voiceRate,
          bgm_volume: bgmVolume,
          subtitle_mode: subtitleMode,
          max_speed_rate: maxSpeedRate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể thực hiện lồng tiếng lại");

      setTaskId(currentId);
      setIsProcessing(true);
      setShowSrtEditor(false);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lồng tiếng lại");
      setIsRedubbing(false);
    }
  };

  // Đọc nội dung SRT hiển thị trên web
  const handleToggleSrtEditor = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!showSrtEditor) {
      if (!currentId) return;
      setIsLoadingSrt(true);
      try {
        const res = await fetch(`http://localhost:8000/api/video-translate/subtitles-content/${currentId}`);
        const data = await res.json();
        if (res.ok && data.content) {
          setSrtText(data.content);
          setShowSrtEditor(true);
        } else {
          toast.error("Chưa có file phụ đề để chỉnh sửa");
        }
      } catch (err: any) {
        toast.error("Lỗi khi tải phụ đề: " + err.message);
      } finally {
        setIsLoadingSrt(false);
      }
    } else {
      setShowSrtEditor(false);
    }
  };

  // Lưu nội dung SRT từ web
  const handleSaveSrt = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;
    setIsSavingSrt(true);
    try {
      const res = await fetch(`http://localhost:8000/api/video-translate/subtitles-content/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: srtText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể lưu phụ đề");
      if (data.learned_count && data.learned_count > 0) {
        toast.success(`🧠 Đã lưu phụ đề & AI đã tự động học được ${data.learned_count} câu bạn vừa sửa!`);
        fetchMemoryCount();
      } else {
        toast.success("💾 Đã lưu thay đổi phụ đề thành công!");
      }
    } catch (err: any) {
      toast.error("Lỗi lưu phụ đề: " + err.message);
    } finally {
      setIsSavingSrt(false);
    }
  };

  // ── STUDIO REALTIME SYNC & SELECTIVE REDUB HANDLERS ─────────────────────
  const fetchStudioSegments = async (tId: string) => {
    setIsLoadingStudioSegments(true);
    try {
      const res = await fetch(`http://localhost:8000/api/video-translate/studio-segments/${tId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.segments) {
          setStudioSegments(data.segments);
        }
      }
    } catch (e) {
      console.error("Lỗi tải studio segments:", e);
    } finally {
      setIsLoadingStudioSegments(false);
    }
  };

  // Tự động nạp segments khi tác vụ hoàn thành
  useEffect(() => {
    if (taskStatus?.status === "completed" && taskStatus?.task_id) {
      fetchStudioSegments(taskStatus.task_id);
    }
  }, [taskStatus?.status, taskStatus?.task_id]);

  // Đồng bộ thời gian thực: Video chạy đến đâu, câu thoại tự sáng & cuộn trong khung nhìn
  const handleVideoTimeUpdate = () => {
    if (!resultVideoRef.current || studioSegments.length === 0) return;
    const cur = resultVideoRef.current.currentTime;
    const found = studioSegments.find((s) => s.start <= cur && cur <= s.end + 0.35);
    if (found && found.id !== activeStudioSegmentId) {
      setActiveStudioSegmentId(found.id);
      const el = document.getElementById(`studio-seg-${found.id}`);
      const container = transcriptContainerRef.current;
      if (el && container) {
        const elTop = el.offsetTop - container.offsetTop;
        const containerScrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        if (elTop < containerScrollTop || elTop + el.clientHeight > containerScrollTop + containerHeight) {
          container.scrollTo({
            top: Math.max(0, elTop - 40),
            behavior: "smooth",
          });
        }
      }
    }
  };

  // Tua video trực tiếp tới câu đang chọn
  const handleSeekToSegment = (seg: StudioSegment) => {
    if (!resultVideoRef.current) return;
    resultVideoRef.current.currentTime = seg.start;
    resultVideoRef.current.play().catch(() => {});
    setActiveStudioSegmentId(seg.id);
  };

  // Thuyết minh lại CỤC BỘ đúng 1 câu duy nhất (chỉ mất ~0.5s)
  const handleRedubSingleSegment = async (seg: StudioSegment) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;

    setStudioSegmentRedubbing(seg.id, true);
    try {
      const res = await fetch(`http://localhost:8000/api/video-translate/studio-redub-segment/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_id: seg.id,
          text: seg.text,
          voice_id: selectedVoice,
          engine: selectedEngine,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Không thể thu lại câu này");
      }
      const data = await res.json();
      updateSingleStudioSegment(seg.id, {
        ...data.segment,
        text: seg.text,
        isRedubbing: false,
      });
      toast.success(`🎙️ Đã thu lại câu #${seg.id} thành công!`);

      // Tua video về mốc bắt đầu của câu vừa thu để người dùng nhìn khung hình
      if (resultVideoRef.current) {
        resultVideoRef.current.currentTime = seg.start;
        resultVideoRef.current.pause();
      }

      // Tự động phát âm thanh vừa thu lại để người dùng nghe thử ngay lập tức
      if (data.audio_url) {
        const fullAudioUrl = data.audio_url.startsWith("http") ? data.audio_url : `http://localhost:8000${data.audio_url}`;
        const audio = new Audio(fullAudioUrl);
        setPlayingAudioSegId(seg.id);
        audio.onended = () => setPlayingAudioSegId(null);
        audio.onerror = () => setPlayingAudioSegId(null);
        audio.play().catch(() => setPlayingAudioSegId(null));
      }
    } catch (err: any) {
      toast.error("Lỗi khi thu lại: " + err.message);
      setStudioSegmentRedubbing(seg.id, false);
    }
  };

  // Nghe thử file âm thanh riêng của một câu thoại
  const handlePlaySegmentAudio = (segId: number, audioUrl: string | null | undefined) => {
    if (!audioUrl) {
      toast.error("Chưa có file âm thanh cho câu này");
      return;
    }
    const fullUrl = audioUrl.startsWith("http") ? audioUrl : `http://localhost:8000${audioUrl}`;
    const audio = new Audio(fullUrl);
    setPlayingAudioSegId(segId);
    audio.onended = () => setPlayingAudioSegId(null);
    audio.onerror = () => setPlayingAudioSegId(null);
    audio.play().catch(() => setPlayingAudioSegId(null));
  };

  // Trộn lại audio & mux video siêu tốc (chỉ 2-5s)
  const handleQuickRemux = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;

    setIsRemuxingStudioVideo(true);
    setStudioRemuxMessage(null);
    try {
      const res = await fetch(`http://localhost:8000/api/video-translate/studio-quick-remux/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtitle_mode: subtitleMode,
          preserve_bgm: preserveBgm,
          bgm_volume: bgmVolume,
          voice_volume: 1.0,
          max_speed_rate: maxSpeedRate,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Lỗi khi cập nhật video");
      }
      const data = await res.json();
      setStudioRemuxMessage("🎉 Đã cập nhật video thành phẩm mới với các câu vừa thuyết minh lại!");
      toast.success("✅ Cập nhật video thành công!");

      // Tải lại video thành phẩm trên trình duyệt với cache-buster
      if (resultVideoRef.current && data.video_url) {
        resultVideoRef.current.src = `http://localhost:8000${data.video_url}`;
        resultVideoRef.current.load();
        resultVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      toast.error("Lỗi khi cập nhật video: " + err.message);
    } finally {
      setIsRemuxingStudioVideo(false);
    }
  };


  // 6. Xử lý tải video/phụ đề trực tiếp và mượt mà bằng trình duyệt (Không tốn RAM)
  const handleDownloadFile = (id: string, fileType: "video" | "srt" | "srt_original", defaultFilename: string) => {
    const typeLabel = fileType === "video" ? "video MP4" : fileType === "srt_original" ? "phụ đề thoại gốc (.SRT)" : "phụ đề dịch (.SRT)";
    toast.info(`Bắt đầu tải ${typeLabel}...`);
    const downloadUrl = `http://localhost:8000/api/video-translate/download/${id}?file_type=${fileType}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", defaultFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 7. Xử lý dọn dẹp rác & giải phóng bộ nhớ đệm
  const handleCleanCache = async () => {
    if (isCleaning) return;
    if (!window.confirm("Bạn có chắc muốn dọn dẹp các tệp tạm và rác video để giải phóng bộ nhớ đĩa không? (Các tác vụ đang chạy vẫn an toàn)")) {
      return;
    }
    setIsCleaning(true);
    try {
      toast.info("Đang quét và dọn dẹp các tệp tạm...");
      const res = await fetch("http://localhost:8000/api/video-translate/cleanup-cache", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Không thể dọn dẹp bộ nhớ đệm");
      const data = await res.json();
      toast.success(`🧹 ${data.message}`);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi dọn dẹp");
    } finally {
      setIsCleaning(false);
    }
  };

  // 8. Mở thư mục chứa file MP4 thành phẩm trên Windows Explorer
  const handleOpenFolder = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;
    setIsOpeningFolder(true);
    try {
      const res = await fetch(`http://localhost:8000/api/video-translate/open-folder/${currentId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể mở thư mục");
      toast.success("📁 " + (data.message || "Đã mở thư mục chứa video trên máy tính"));
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi mở thư mục");
    } finally {
      setIsOpeningFolder(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-surface-variant/80 to-surface-variant/40 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 text-primary flex items-center justify-center border border-primary/30 shadow-inner">
              <Languages className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">
              Dịch & Lồng Tiếng Video Tự Động
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              VoiceSync AI Pro
            </span>
          </div>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Tự động chuyển ngữ video sang bất kỳ ngôn ngữ nào: Nhận dạng giọng nói Faster-Whisper, Dịch thuật AI chuẩn ngữ cảnh, Lồng tiếng Edge-TTS / OmniVoice và Cân chỉnh tốc độ khớp khẩu hình.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCleanCache}
            disabled={isCleaning || isProcessing}
            className="inline-flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              isProcessing
                ? "Đang có tiến trình dịch video, tạm thời khóa dọn rác để bảo vệ dữ liệu"
                : "Dọn dẹp các tệp tạm, file audio phòng thu lịch sử và rác video để giải phóng dung lượng đĩa"
            }
          >
            {isCleaning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>{isCleaning ? "Đang dọn..." : "Dọn dẹp bộ nhớ đệm"}</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant/80 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Chuẩn phòng thu 24kHz
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant/80 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
            <Music className="w-3.5 h-3.5 text-secondary" />
            Giữ nhạc nền BGM
          </span>
        </div>
      </div>

      {/* Main Grid: Upload & Controls | Preview & Result */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Config (7 cols - ẩn khi mở chế độ rạp chiếu) */}
        <div className={cn(isExpandedPlayer ? "hidden" : "lg:col-span-7", "space-y-6 transition-all duration-300")}>
          {/* Card 1: Chọn Video */}
          <div className="bg-surface/80 border border-white/10 rounded-3xl p-6 space-y-4 backdrop-blur-xl shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <FileVideo className="w-4 h-4 text-primary" />
                1. Chọn Video Cần Dịch
              </h2>
              {(videoFile || videoFileName || taskId) && (
                <button
                  type="button"
                  onClick={() => {
                    resetAll();
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                      fileInputRef.current.click();
                    }
                  }}
                  className="text-xs text-primary hover:underline font-medium cursor-pointer"
                >
                  Đổi video khác
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {!videoFile && !videoFileName && !taskId ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/20 hover:border-primary/50 transition-all duration-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer group bg-surface-variant/20 hover:bg-surface-variant/40"
              >
                <div className="w-14 h-14 rounded-2xl bg-surface-variant flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-on-surface">
                    Nhấp hoặc kéo thả video vào đây
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Hỗ trợ MP4, MKV, MOV, WebM (Khuyên dùng video dưới 30 phút)
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3.5 bg-surface-variant/40 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <Film className="w-5 h-5 text-primary" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-on-surface truncate">
                      {videoFile?.name || videoFileName || `Tác vụ #${taskId}`}
                    </p>
                    <p className="text-xs text-on-surface-variant font-mono">
                      {videoFile
                        ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB`
                        : videoFileSize
                        ? `${(videoFileSize / (1024 * 1024)).toFixed(1)} MB`
                        : "Đang lưu trên máy chủ"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetAll();
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-white border border-white/10 transition-colors cursor-pointer"
                    title="Làm mới tác vụ để chọn video khác"
                  >
                    Hủy & Làm mới
                  </button>
                  <span
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border font-medium",
                      isProcessing
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : taskStatus?.status === "completed"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    )}
                  >
                    {isProcessing
                      ? "Đang xử lý"
                      : taskStatus?.status === "completed"
                      ? "Đã xong"
                      : "Sẵn sàng"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Cấu hình Ngôn Ngữ & Giọng Lồng Tiếng */}
          <div className="bg-surface/80 border border-white/10 rounded-3xl p-6 space-y-5 backdrop-blur-xl shadow-lg">
            <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              2. Cấu Hình Ngôn Ngữ & Giọng Đọc
            </h2>

            {/* Hàng chọn ngôn ngữ nguồn & đích */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
                  Ngôn ngữ video gốc:
                </label>
                <select
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="auto">✨ Tự động nhận diện (Auto Detect)</option>
                  <option value="en">English (Tiếng Anh)</option>
                  <option value="zh-cn">中文 (Tiếng Trung)</option>
                  <option value="ja">日本語 (Tiếng Nhật)</option>
                  <option value="ko">한국어 (Tiếng Hàn)</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="fr">Français (Tiếng Pháp)</option>
                  <option value="de">Deutsch (Tiếng Đức)</option>
                  <option value="es">Español (Tây Ban Nha)</option>
                  <option value="ru">Русский (Tiếng Nga)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
                  Dịch sang ngôn ngữ:
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors font-medium text-primary"
                >
                  {languages.length > 0 ? (
                    languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="vi">Tiếng Việt (Vietnamese)</option>
                      <option value="en">English (Tiếng Anh)</option>
                      <option value="zh-cn">中文 (Tiếng Trung)</option>
                      <option value="ja">日本語 (Tiếng Nhật)</option>
                      <option value="ko">한국어 (Tiếng Hàn)</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Phong Cách Dịch & Đại Từ Xưng Hô (Thể loại video) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                <span>Phong cách dịch & Xưng hô (Thể loại phim):</span>
                <span className="text-[11px] text-primary font-semibold">
                  {translationStyle === "auto" ? "✨ Tự động nhận diện" : "Đã chọn phong cách"}
                </span>
              </label>
              <select
                value={translationStyle}
                onChange={(e) => setTranslationStyle(e.target.value)}
                className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors font-medium text-amber-300"
              >
                <option value="auto">🎭 Tự động nhận diện theo cốt truyện (AI Auto-detect)</option>
                <option value="romance">💖 Ngôn tình / Đô thị (Anh - Em ngọt ngào, tự nhiên)</option>
                <option value="school">🎓 Thanh xuân / Học đường (Cậu - Tớ, Bạn - Mình)</option>
                <option value="wuxia">⚔️ Cổ trang / Kiếm hiệp (Tại hạ, Huynh - Đệ, Sư phụ, Các hạ)</option>
                <option value="workplace">🏢 Tổng tài / Công sở (Sếp - Tôi/Em, Tôi - Cậu/Cô)</option>
                <option value="family">👨‍👩‍👧 Gia đình / Đời sống (Bố/Mẹ - Con, Vợ - Chồng, Cháu)</option>
                <option value="narration">🎙️ Kể chuyện / Review phim / Tin tức (Tôi/Mình - Các bạn)</option>
              </select>
              <p className="text-[10px] text-on-surface-variant/70">
                AI sẽ điều chỉnh toàn bộ đại từ xưng hô và văn phong câu thoại chuẩn xác theo đúng bối cảnh phim.
              </p>
            </div>

            {/* Kênh dịch thuật & Mô hình AI (Gemini / Google / DeepSeek) */}
            <div className="space-y-2.5 bg-surface-variant/25 p-3.5 rounded-2xl border border-white/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                    <span>Kênh dịch thuật AI:</span>
                    <span className="text-[10px] text-primary font-semibold uppercase">{translationProvider}</span>
                  </label>
                  <select
                    value={translationProvider}
                    onChange={(e) => setTranslationProvider(e.target.value)}
                    className="w-full bg-surface-variant/70 border border-primary/30 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-medium text-primary cursor-pointer"
                  >
                    <option value="gemini">Google AI Studio (Gemini - Khuyên dùng)</option>
                    <option value="google">Google Dịch (Miễn phí - Không cần Key)</option>
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="deepseek">DeepSeek AI</option>
                  </select>
                </div>

                {translationProvider === "gemini" && (
                  <div className="space-y-1 animate-fadeIn">
                    <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                      <span className="text-amber-300 font-semibold">✨ Mô hình Gemini:</span>
                      <span className="text-[10px] text-primary font-mono font-semibold">{geminiModel}</span>
                    </label>
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="w-full bg-surface-variant/80 border border-primary/40 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-medium text-amber-300 cursor-pointer shadow-sm"
                    >
                      <option value="gemini-3.8-flash">gemini-3.8-flash (Thế hệ mới nhất - Google AI Studio)</option>
                      <option value="gemini-flash-latest">gemini-flash-latest (Bản cập nhật tự động)</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash (Nhanh & Tối ưu)</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro (Thông minh - Dịch kịch bản sâu)</option>
                      <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Siêu nhanh)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Chi tiết cài đặt nếu chọn Gemini */}
              {translationProvider === "gemini" && (
                <div className="space-y-2.5 pt-2 border-t border-white/5 animate-fadeIn">
                  {/* API Key */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1.5 text-primary font-semibold">
                        <Key className="w-3.5 h-3.5" />
                        Google AI Studio API Key:
                      </span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-primary/90 hover:text-primary flex items-center gap-0.5 underline font-medium"
                      >
                        Lấy API Key miễn phí <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="Dán mã API Key của bạn (bắt đầu bằng AIzaSy...)"
                        value={geminiApiKey}
                        onChange={(e) => {
                          setGeminiApiKey(e.target.value);
                          localStorage.setItem("gemini_api_key", e.target.value);
                          setKeyVerifyResult(null);
                        }}
                        className="flex-1 bg-surface-variant/80 border border-primary/30 focus:border-primary rounded-xl px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyGeminiKey}
                        disabled={isVerifyingKey || !geminiApiKey.trim()}
                        className="px-3 py-2 rounded-xl bg-primary text-black font-semibold text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0"
                        title="Gửi kiểm tra trực tiếp với Google AI Studio"
                      >
                        {isVerifyingKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        <span>Kiểm tra</span>
                      </button>
                    </div>

                    {keyVerifyResult && (
                      <div
                        className={cn(
                          "p-2.5 rounded-xl text-[11px] flex items-start gap-2 border animate-fadeIn leading-relaxed",
                          keyVerifyResult.valid
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : (keyVerifyResult.message.includes("HẾT HẠN MỨC") || keyVerifyResult.message.includes("429"))
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                        )}
                      >
                        {keyVerifyResult.valid ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400 mt-0.5" />
                        ) : (keyVerifyResult.message.includes("HẾT HẠN MỨC") || keyVerifyResult.message.includes("429")) ? (
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                        )}
                        <span className="flex-1">{keyVerifyResult.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Temperature slider */}
                  <div className="space-y-1 pt-1 bg-black/20 p-2.5 rounded-xl border border-white/5">
                    <div className="flex justify-between text-[11px] text-on-surface-variant">
                      <span className="font-medium">Nhiệt độ sáng tạo (Temperature):</span>
                      <span className="font-mono text-primary font-bold">{geminiTemperature}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={geminiTemperature}
                        onChange={(e) => setGeminiTemperature(parseFloat(e.target.value))}
                        className="w-full accent-primary h-1.5 bg-black/40 rounded-lg cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-on-surface-variant bg-black/40 px-2 py-0.5 rounded border border-white/10 shrink-0">
                        {geminiTemperature <= 0.2 ? "0.2 (Chuẩn kịch bản)" : geminiTemperature <= 0.5 ? "Cân bằng" : "Sáng tạo"}
                      </span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant/70">
                      Mặc định 0.2: Khuyên dùng cho lồng tiếng phim — trung thành với kịch bản gốc, khớp nhịp, câu từ súc tích tự nhiên.
                    </p>
                  </div>
                </div>
              )}

              {/* Mô hình bóc băng giọng nói Faster-Whisper ASR */}
              <div className="space-y-1.5 pt-2.5 border-t border-white/10">
                <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    Mô hình bóc băng phụ đề (Faster-Whisper STT):
                  </span>
                  <span className="text-[10px] text-cyan-300 font-mono font-semibold uppercase">{whisperModel}</span>
                </label>
                <select
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value)}
                  className="w-full bg-surface-variant/80 border border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-cyan-400 font-medium text-cyan-300 cursor-pointer shadow-sm"
                >
                  <option value="large-v3">🌟 large-v3 (Chuẩn cao cấp - 1.55 Tỷ tham số • Khuyên dùng cho Colab / Hugging Face GPU)</option>
                  <option value="medium">⚡ medium (Cân bằng & Tốc độ cao - 769 Triệu tham số)</option>
                  <option value="small">🚀 small (Nhẹ & Nhanh - 244 Triệu tham số)</option>
                  <option value="base">⏱️ base (Bản tối giản - 74 Triệu tham số)</option>
                </select>
                <p className="text-[10px] text-on-surface-variant/70">
                  ⚡ <strong>large-v3</strong> giải quyết triệt để lỗi từ đồng âm tiếng Trung, nhận diện chuẩn tên riêng và tự động ngắt câu với dấu phẩy/chấm đầy đủ khi chạy trên GPU online (Colab/Hugging Face).
                </p>
              </div>
            </div>

            {/* Chọn Giọng Đọc Lồng Tiếng */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                <span>Giọng đọc AI lồng tiếng:</span>
                <span className="text-[11px] text-primary">
                  {voices.length} giọng sẵn sàng
                </span>
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => {
                  setSelectedVoice(e.target.value);
                  const v = voices.find((item) => item.id === e.target.value);
                  if (v) setSelectedEngine(v.engine);
                }}
                className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
              >
                {/* Nhóm Giọng Phòng Thu Studio (Preset + Clone tự tạo) */}
                {voices.some((v) => v.engine === "omnivoice") && (
                  <optgroup label="🎙️ Giọng Phòng Thu (Studio / AI Cloned)">
                    {voices
                      .filter((v) => v.engine === "omnivoice")
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </optgroup>
                )}

                {/* Nhóm Giọng Đọc Edge-TTS Tuyển Chọn */}
                <optgroup label="🌐 Giọng Đọc Chuẩn Edge-TTS Đa Quốc Gia">
                  {voices
                    .filter((v) => v.engine !== "omnivoice")
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.gender})
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Tùy chọn nâng cao: Accordion */}
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs text-on-surface-variant hover:text-on-surface transition-colors font-medium py-1"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {showAdvanced ? "Thu gọn tùy chọn phụ đề & nhạc nền" : "Mở rộng tùy chọn phụ đề & nhạc nền"}
              </button>

              {showAdvanced && (
                <div className="mt-3.5 space-y-4 bg-surface-variant/20 p-4 rounded-2xl border border-white/5 animate-fadeIn">
                  {/* Chế độ phụ đề */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-on-surface-variant block">
                      Kiểu gắn phụ đề (Subtitles):
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "hard_target", label: "Phụ đề dịch" },
                        { id: "hard_dual", label: "Song ngữ (Dual)" },
                        { id: "none", label: "Không gắn sub" },
                      ].map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSubtitleMode(sub.id)}
                          className={cn(
                            "py-2 px-3 rounded-xl text-xs font-medium border transition-all text-center",
                            subtitleMode === sub.id
                              ? "bg-primary text-black border-primary font-semibold shadow-md"
                              : "bg-surface-variant/40 text-on-surface-variant border-white/5 hover:border-white/20"
                          )}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Giữ âm thanh gốc chuẩn Thuyết minh phim */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-on-surface flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-secondary" />
                        Giữ âm thanh gốc chuẩn Thuyết minh phim (Voice-over)
                      </p>
                      <p className="text-[11px] text-on-surface-variant">
                        Giữ lại toàn bộ nhạc nền & âm thanh gốc, giảm nhỏ âm lượng để giọng AI lồng tiếng vang rõ
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preserveBgm}
                      onChange={(e) => setPreserveBgm(e.target.checked)}
                      className="w-5 h-5 accent-primary cursor-pointer rounded"
                    />
                  </div>

                  {preserveBgm && (
                    <div className="space-y-1 pl-4 border-l-2 border-primary/40">
                      <div className="flex justify-between text-xs text-on-surface-variant">
                        <span>Âm lượng âm thanh gốc (Thuyết minh):</span>
                        <span className="font-semibold text-primary">{Math.round(bgmVolume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.7"
                        step="0.05"
                        value={bgmVolume}
                        onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                        className="w-full accent-primary cursor-pointer"
                      />
                      <p className="text-[10px] text-on-surface-variant/70">
                        Khuyến nghị: 20% - 30% cho phim tài liệu, video hướng dẫn kỹ thuật.
                      </p>
                    </div>
                  )}

                  {/* Tốc độ đọc cơ bản */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant block">
                      Tốc độ đọc giọng:
                    </label>
                    <select
                      value={voiceRate}
                      onChange={(e) => setVoiceRate(e.target.value)}
                      className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                    >
                      <option value="-15%">Chậm (-15%)</option>
                      <option value="-10%">Hơi chậm (-10%)</option>
                      <option value="+0%">Bình thường (+0%)</option>
                      <option value="+10%">Hơi nhanh (+10%)</option>
                      <option value="+15%">Nhanh (+15%)</option>
                    </select>
                  </div>

                  {/* Tốc độ co giãn tối đa (SpeedRate) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-on-surface-variant">
                      <span>Tốc độ đọc tăng tối đa (SpeedRate):</span>
                      <span className="font-mono text-primary">{maxSpeedRate}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.1"
                      max="1.5"
                      step="0.05"
                      value={maxSpeedRate}
                      onChange={(e) => setMaxSpeedRate(parseFloat(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                    <p className="text-[10px] text-on-surface-variant/70">
                      Tự động tăng tốc câu lồng tiếng nếu câu dịch dài hơn thời lượng cảnh quay video gốc.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* CTA Button Bắt Đầu */}
            <button
              onClick={handleStartTranslation}
              disabled={!videoFile || isProcessing}
              className={cn(
                "w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 shadow-xl cursor-pointer",
                !videoFile || isProcessing
                  ? "bg-surface-variant/40 text-on-surface-variant cursor-not-allowed opacity-60"
                  : "bg-gradient-to-r from-primary via-primary/90 to-primary text-black hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] shadow-primary/20"
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang xử lý dịch video ({taskStatus?.progress || 0}%)...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  Bắt Đầu Dịch & Lồng Tiếng Video
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Preview, Progress & Result */}
        <div className={cn(isExpandedPlayer ? "lg:col-span-12" : "lg:col-span-5", "space-y-6 transition-all duration-300")}>
          {/* Card Video Player Preview */}
          <div className="bg-surface/80 border border-white/10 rounded-3xl p-5 space-y-4 backdrop-blur-xl shadow-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <Play className="w-4 h-4 text-primary" />
                {taskStatus?.status === "completed" ? "Video Thành Phẩm" : "Xem Trước Video"}
              </h2>
              <div className="flex items-center gap-2">
                {taskStatus?.status === "completed" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold flex items-center gap-1">
                      ⏱️ {taskStatus.elapsed_str || formatTimer(elapsedSeconds)}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-medium">
                      Hoàn tất 100%
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsExpandedPlayer(!isExpandedPlayer)}
                  className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-medium flex items-center gap-1.5 border border-white/10 transition-colors cursor-pointer"
                  title={isExpandedPlayer ? "Thu nhỏ về giao diện chia đôi" : "Mở rộng khung xem Video (Theater Mode)"}
                >
                  {isExpandedPlayer ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-primary" />
                      <span>Thu gọn</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-primary" />
                      <span>Rạp chiếu</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/80 border border-white/10 flex items-center justify-center">
              {taskStatus?.status === "completed" && taskStatus?.task_id ? (
                <video
                  ref={resultVideoRef}
                  key={taskStatus.task_id}
                  src={`http://localhost:8000/api/video-translate/stream/${taskStatus.task_id}`}
                  controls
                  playsInline
                  autoPlay
                  onTimeUpdate={handleVideoTimeUpdate}
                  className="w-full h-full object-contain"
                />
              ) : videoPreviewUrl ? (
                <video
                  src={videoPreviewUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                  <FileVideo className="w-10 h-10 opacity-30" />
                  <p className="text-xs">Chưa có video được chọn</p>
                </div>
              )}
            </div>

            {/* Nút thao tác hoàn tất & Chỉnh sửa phụ đề SRT */}
            {taskStatus?.status === "completed" && taskStatus?.task_id && (
              <div className="space-y-3 pt-2 animate-fadeIn">
                {/* 1. Hàng nút tải về */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadFile(
                        taskStatus.task_id,
                        "video",
                        `translated_video_${taskStatus.task_id}.mp4`
                      )
                    }
                    className="py-3 px-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-95 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-green-500/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-black shrink-0" />
                    <span>Tải Video (MP4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadFile(
                        taskStatus.task_id,
                        "srt",
                        `subtitles_${taskStatus.task_id}.srt`
                      )
                    }
                    className="py-3 px-2 rounded-xl bg-surface-variant/70 hover:bg-surface-variant text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/10 transition-colors cursor-pointer"
                    title="Tải tệp phụ đề tiếng Việt đã dịch"
                  >
                    <Subtitles className="w-4 h-4 text-primary shrink-0" />
                    <span>Tải Phụ Đề (.SRT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadFile(
                        taskStatus.task_id,
                        "srt_original",
                        `original_subtitles_${taskStatus.task_id}.srt`
                      )
                    }
                    className="py-3 px-2 rounded-xl bg-surface-variant/70 hover:bg-surface-variant text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 border border-amber-500/20 transition-colors cursor-pointer"
                    title="Tải phụ đề câu thoại gốc của nhân vật trong video để đối chiếu kiểm tra"
                  >
                    <Subtitles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Phụ Đề Gốc (.SRT)</span>
                  </button>
                </div>

                {/* Mở thư mục máy tính chứa video */}
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  disabled={isOpeningFolder}
                  className="w-full py-3 px-3 rounded-xl bg-surface-variant/80 hover:bg-surface-variant text-on-surface font-semibold text-xs flex items-center justify-center gap-2 border border-white/10 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                  title="Mở thư mục chứa file MP4 trên máy tính (Windows Explorer)"
                >
                  {isOpeningFolder ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                  )}
                  <span>📁 Mở Thư Mục Chứa Video Trên Máy Tính</span>
                </button>

                {/* 2. Studio Xem Lại & Thuyết Minh Thời Gian Thực (Interactive Timeline & In-Place Redub) */}
                <div className="p-4 rounded-3xl bg-surface/90 border-2 border-primary/40 space-y-4 shadow-xl animate-fadeIn">
                  {/* Studio Header */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-primary/20 text-primary">
                        <Sparkles className="w-5 h-5" />
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                          <span>Studio Xem Lại & Thuyết Minh Từng Đoạn</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                            Real-time Sync
                          </span>
                        </h3>
                        <p className="text-[11px] text-on-surface-variant">
                          Video chạy tới đâu câu thoại tự sáng tới đó. Sửa trực tiếp từng câu và bấm thu lại siêu tốc (0.5s)!
                        </p>
                      </div>
                    </div>

                    {/* Quick Remux CTA */}
                    <button
                      type="button"
                      onClick={handleQuickRemux}
                      disabled={isRemuxingStudioVideo}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-primary to-amber-400 text-black font-bold text-xs flex items-center gap-1.5 hover:opacity-95 shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98]"
                      title="Trộn âm thanh câu vừa sửa vào video thành phẩm (chỉ mất 2-5 giây)"
                    >
                      {isRemuxingStudioVideo ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Đang cập nhật video...</span>
                        </>
                      ) : (
                        <>
                          <Film className="w-4 h-4 text-black" />
                          <span>⚡ Cập Nhật Video Thành Phẩm (3-5s)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Status Banner */}
                  {studioRemuxMessage && (
                    <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs flex items-center justify-between animate-fadeIn">
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

                  {/* Search Bar & Refresh */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={studioSearch}
                      onChange={(e) => setStudioSearch(e.target.value)}
                      placeholder="🔍 Tìm kiếm nhanh câu thoại..."
                      className="w-full text-xs bg-surface-variant/40 border border-white/10 rounded-xl px-3 py-2 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
                    />
                    {taskStatus?.task_id && (
                      <button
                        type="button"
                        onClick={() => fetchStudioSegments(taskStatus.task_id)}
                        disabled={isLoadingStudioSegments}
                        className="px-2.5 py-2 rounded-xl bg-surface-variant/60 hover:bg-surface-variant text-on-surface text-xs flex items-center gap-1 border border-white/10 cursor-pointer shrink-0 disabled:opacity-50"
                        title="Tải lại danh sách câu thoại"
                      >
                        {isLoadingStudioSegments ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5 text-primary" />
                        )}
                        <span>Nạp lại</span>
                      </button>
                    )}
                  </div>

                  {/* Danh sách câu thoại đồng bộ thời gian thực */}
                  {isLoadingStudioSegments && studioSegments.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-xs">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span>Đang nạp dữ liệu timeline studio...</span>
                    </div>
                  ) : studioSegments.length === 0 ? (
                    <div className="py-6 text-center text-xs text-on-surface-variant">
                      Chưa có dữ liệu câu thoại cho video này.
                    </div>
                  ) : (
                    <div ref={transcriptContainerRef} className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                      {filteredStudioSegments.map((seg) => {
                        const isActive = activeStudioSegmentId === seg.id;
                        const isPlayingAudio = playingAudioSegId === seg.id;
                        return (
                          <div
                            key={seg.id}
                            id={`studio-seg-${seg.id}`}
                            className={cn(
                              "p-3 rounded-2xl border transition-all duration-200 space-y-2",
                              isActive
                                ? "bg-primary/10 border-primary shadow-md shadow-primary/15 ring-1 ring-primary/40"
                                : "bg-surface-variant/25 border-white/5 hover:border-white/15"
                            )}
                          >
                            {/* Top row: ID, Time, Actions */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
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
                                  title="Tua video đến đúng mốc này"
                                >
                                  <Play className="w-3 h-3 text-primary fill-primary" />
                                  <span>{formatSrtTime(seg.start)} ➔ {formatSrtTime(seg.end)}</span>
                                </button>
                                {seg.audio_duration ? (
                                  <span className="text-[10px] text-on-surface-variant/70 font-mono">
                                    ({seg.audio_duration.toFixed(1)}s)
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {/* Nghe thử âm thanh câu này */}
                                {seg.audio_url && (
                                  <button
                                    type="button"
                                    onClick={() => handlePlaySegmentAudio(seg.id, seg.audio_url)}
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

                                {/* Thu lại câu này */}
                                <button
                                  type="button"
                                  onClick={() => handleRedubSingleSegment(seg)}
                                  disabled={seg.isRedubbing}
                                  className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                  title="Chỉ thu lại duy nhất câu này bằng giọng đọc AI (chỉ mất ~0.5s)"
                                >
                                  {seg.isRedubbing ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                      <span>Đang thu...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Mic className="w-3 h-3 text-primary" />
                                      <span>Thu lại câu này</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Câu gốc tiếng Trung (nếu có) */}
                            {seg.original_text && (
                              <div className="text-[11px] font-mono text-amber-300/80 bg-black/30 px-2.5 py-1 rounded-lg border border-amber-500/10">
                                <span className="text-amber-400 font-medium">Gốc: </span>
                                {seg.original_text}
                              </div>
                            )}

                            {/* Ô nhập câu dịch tiếng Việt có thể sửa trực tiếp */}
                            <div className="relative">
                              <textarea
                                value={seg.text}
                                onChange={(e) => updateStudioSegmentText(seg.id, e.target.value)}
                                rows={2}
                                className="w-full text-xs bg-black/60 border border-white/10 rounded-xl p-2.5 text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed font-sans"
                                placeholder="Nhập câu thoại tiếng Việt..."
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. Khối chức năng mở Notepad & Lồng tiếng lại */}
                <div className="p-3.5 rounded-2xl bg-surface-variant/30 border border-primary/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <FileEdit className="w-3.5 h-3.5 text-primary" />
                      Chỉnh sửa phụ đề & Lồng tiếng lại:
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleOpenEditor}
                      disabled={isOpeningEditor}
                      className="py-2.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      title="Mở file SRT trực tiếp bằng Notepad++ hoặc Notepad trên máy tính"
                    >
                      {isOpeningEditor ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      <span>Mở bằng Notepad / Notepad++</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRedub()}
                      disabled={isRedubbing || isProcessing}
                      className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-black text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                      title="Lồng tiếng và render lại video theo nội dung file SRT đã sửa"
                    >
                      {isRedubbing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>Lồng tiếng lại theo SRT đã sửa</span>
                    </button>
                  </div>

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
                    💡 <b>Quy trình sửa từ ngữ:</b> Nhấn <i>"Mở bằng Notepad / Notepad++"</i> ➔ Sửa các thuật ngữ kỹ thuật hoặc tên riêng ➔ Nhấn <code>Ctrl+S</code> để lưu file ➔ Bấm <i>"Lồng tiếng lại theo SRT đã sửa"</i>.
                  </p>

                  {/* Trình soạn thảo SRT trực tiếp trên trình duyệt */}
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
            )}
          </div>

          {/* Card Tiến Trình (Progress Tracker) khi đang chạy */}
          {isProcessing && taskStatus && (
            <div className="bg-surface/80 border border-white/10 rounded-3xl p-5 space-y-4 backdrop-blur-xl shadow-lg animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {taskStatus.task_id === "uploading" ? (
                    <>
                      <Upload className="w-4 h-4 text-primary animate-bounce" />
                      <h3 className="text-sm font-semibold text-on-surface">Đang Tải Video Lên Máy Chủ</h3>
                      <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 font-medium">Bước 1/2</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      <h3 className="text-sm font-semibold text-on-surface">Tiến Trình Xử Lý AI</h3>
                      {taskId && <span className="text-[10px] font-mono text-on-surface-variant/70">#{taskId}</span>}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary font-mono font-medium">
                    ⏱️ {formatTimer(elapsedSeconds)}
                  </span>
                  <span className="text-sm font-bold text-primary font-mono">
                    {taskStatus.progress}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-amber-400 h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${taskStatus.progress}%` }}
                />
              </div>

              {/* Status Message */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span className="font-medium text-on-surface">{taskStatus.message}</span>
                </div>
                {taskStatus.current_step && (
                  <span className="text-[11px] font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    {STEP_LABELS[taskStatus.current_step]?.icon ? `${STEP_LABELS[taskStatus.current_step].icon} ` : ""}{STEP_LABELS[taskStatus.current_step]?.label || taskStatus.current_step}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal quản lý Bộ nhớ tự học của AI (Translation Memory) */}
      <TranslationMemoryModal
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
        onMemoryChanged={fetchMemoryCount}
      />
    </div>
  );
}
