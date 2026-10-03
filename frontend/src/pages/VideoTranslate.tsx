import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Upload,
  Play,
  Download,
  Sparkles,
  Music,
  Settings2,
  Film,
  CheckCircle2,
  Loader2,
  FileVideo,
  FileText,
  Sliders,
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
  PauseCircle,
  Scissors,
  Clock,
  Plus,
  Minus,
  Clipboard,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/constants/api";
import { TranslationMemoryModal } from "@/components/TranslationMemoryModal";

import {
  useVideoTranslateStore,
  type VoiceOption,
  type TranslationProgress,
  type StudioSegment,
} from "@/store/useVideoTranslateStore";
import { playCompletionSound, playNotificationSound, requestNotificationPermission } from "@/utils/audioUtils";

const STEP_LABELS: Record<string, { label: string; icon: string }> = {
  extracting: { label: "Tách âm thanh & Nhạc nền", icon: "🎵" },
  transcribing: { label: "Tạo phụ đề gốc (Faster-Whisper)", icon: "🎙️" },
  waiting_manual_translation: { label: "Chờ nạp phụ đề dịch (.srt)", icon: "✍️" },
  review_original: { label: "Tạm dừng duyệt câu gốc", icon: "⏸️" },
  translating: { label: "Dịch thuật phụ đề AI", icon: "🌐" },
  dubbing: { label: "Lồng tiếng tự động (Voice Dubbing)", icon: "🗣️" },
  aligning: { label: "Khớp lời thoại & Hòa âm (Lip-sync)", icon: "⚡" },
  rendering: { label: "Ghép phụ đề & Render Video MP4", icon: "🎬" },
  completed: { label: "Hoàn tất thành phẩm", icon: "✅" },
  failed: { label: "Có lỗi xảy ra", icon: "❌" },
};

const PIPELINE_STEPS = [
  { key: "extracting", label: "Tách Audio & BGM", icon: "🎵", minProg: 0, maxProg: 15 },
  { key: "transcribing", label: "Tạo Phụ Đề Gốc", icon: "🎙️", minProg: 15, maxProg: 40 },
  { key: "translating", label: "Dịch Thuật AI Phim", icon: "🌐", minProg: 40, maxProg: 55 },
  { key: "dubbing", label: "Lồng Tiếng Từng Câu", icon: "🗣️", minProg: 55, maxProg: 75 },
  { key: "aligning", label: "Khớp Timeline & Hòa Âm", icon: "⚡", minProg: 75, maxProg: 85 },
  { key: "rendering", label: "Render Video MP4", icon: "🎬", minProg: 85, maxProg: 100 },
];

export default function VideoTranslate() {
  const [isExpandedPlayer, setIsExpandedPlayer] = React.useState(false);
  const [isVerifyingKey, setIsVerifyingKey] = React.useState(false);
  const [keyVerifyResult, setKeyVerifyResult] = React.useState<{
    valid: boolean;
    message: string;
    quota_details?: Record<string, any>;
  } | null>(null);

  const [isOpeningFolder, setIsOpeningFolder] = React.useState(false);
  const transcriptContainerRef = React.useRef<HTMLDivElement>(null);
  const previewVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const segmentPlaybackTargetRef = React.useRef<{ end: number; segId: number } | null>(null);

  const [manualSrtFile, setManualSrtFile] = React.useState<File | null>(null);
  const [manualSrtMode, setManualSrtMode] = React.useState<"file" | "text">("text");
  const [manualSrtText, setManualSrtText] = React.useState<string>("");
  const [manualUploadedCount, setManualUploadedCount] = React.useState<number | null>(null);
  const [isUploadingManualSrt, setIsUploadingManualSrt] = React.useState(false);
  const [manualActiveStep, setManualActiveStep] = React.useState<number>(1);
  const [isStepTransitioning, setIsStepTransitioning] = React.useState<boolean>(false);
  const [isModeTransitioning, setIsModeTransitioning] = React.useState<boolean>(false);
  const manualSrtFileInputRef = React.useRef<HTMLInputElement>(null);

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
    videoStartTime,
    videoEndTime,
    languages,
    sourceLang,
    targetLang,
    voices,
    selectedVoice,
    selectedEngine,
    voiceRate,
    preserveBgm,
    bgmType,
    bgmVolume,
    subtitleMode,
    subtitleFontSize,
    subtitlePosition,
    subtitleMarginV,
    maxSpeedRate,
    outputResolution,
    translationProvider,
    translationStyle,
    geminiApiKey,
    geminiModel,
    geminiTemperature,
    whisperModel,
    setWhisperModel,
    showAdvanced,
    setShowAdvanced,
    vadThreshold,
    setVadThreshold,
    speechPadMs,
    setSpeechPadMs,
    minSpeechDurationMs,
    setMinSpeechDurationMs,
    minSilenceDurationMs,
    setMinSilenceDurationMs,
    beamSize,
    setBeamSize,
    showTranscribeAdvanced,
    setShowTranscribeAdvanced,
    translationMode,
    setTranslationMode,
    isProcessing,
    isCleaning,
    isRedubbing,
    showSrtEditor,
    srtText,
    isLoadingSrt,
    isSavingSrt,
    taskId,
    taskStatus,
    elapsedSeconds,
    setVideoFile,
    setVideoStartTime,
    setVideoEndTime,
    resetVideoTrim,
    setLanguages,
    setSourceLang,
    setTargetLang,
    setVoices,
    setSelectedVoice,
    setSelectedEngine,
    setVoiceRate,
    setPreserveBgm,
    setBgmType,
    setBgmVolume,
    setSubtitleMode,
    setSubtitleFontSize,
    setSubtitlePosition,
    setSubtitleMarginV,
    setMaxSpeedRate,
    setOutputResolution,
    setTranslationProvider,
    setTranslationStyle,
    setGeminiApiKey,
    setGeminiModel,
    setGeminiTemperature,
    setIsProcessing,
    setIsCleaning,
    setIsRedubbing,
    setShowSrtEditor,
    setSrtText,
    setIsLoadingSrt,
    setIsSavingSrt,
    studioSegments,
    activeStudioSegmentId,
    isLoadingStudioSegments,
    studioRemuxMessage,
    setStudioSegments,
    addStudioSegment,
    updateStudioSegmentText,
    updateStudioSegmentTiming,
    setStudioSegmentRedubbing,
    updateSingleStudioSegment,
    removeStudioSegment,
    setActiveStudioSegmentId,
    setIsLoadingStudioSegments,
    setStudioRemuxMessage,
    setTaskId,
    setTaskStatus,
    setElapsedSeconds,
    resetAll,
    fetchActiveTask,
  } = useVideoTranslateStore();

  const switchManualStep = (targetStep: number) => {
    if (targetStep === manualActiveStep || isStepTransitioning) return;
    setIsStepTransitioning(true);
    setTimeout(() => {
      setManualActiveStep(targetStep);
      setIsStepTransitioning(false);
    }, 250);
  };

  const switchTranslationMode = (targetMode: "auto" | "manual") => {
    if (targetMode === translationMode || isModeTransitioning) return;
    setIsModeTransitioning(true);
    setTimeout(() => {
      setTranslationMode(targetMode);
      setIsModeTransitioning(false);
    }, 250);
  };

  const [studioSearch, setStudioSearch] = React.useState("");
  const [playingAudioSegId, setPlayingAudioSegId] = React.useState<number | null>(null);
  const [deletingSegId, setDeletingSegId] = React.useState<number | null>(null);
  const [isStudioOpen, setIsStudioOpen] = React.useState(true);
  const [studioViewMode, setStudioViewMode] = React.useState<"current" | "all">("current");

  // Thêm câu thoại mới tại vị trí bất kỳ
  const [showAddSegmentModal, setShowAddSegmentModal] = React.useState(false);
  const [newSegStart, setNewSegStart] = React.useState<number>(0);
  const [newSegEnd, setNewSegEnd] = React.useState<number>(2.5);
  const [newSegText, setNewSegText] = React.useState<string>("");
  const [newSegOriginalText, setNewSegOriginalText] = React.useState<string>("");
  const [newSegVoiceId, setNewSegVoiceId] = React.useState<string>("");
  const [newSegEngine, setNewSegEngine] = React.useState<string>("");
  const [isAddingSegment, setIsAddingSegment] = React.useState<boolean>(false);

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

  // Studio State
  const [currentLiveSubtitle, setCurrentLiveSubtitle] = React.useState<string>("");

  // Translation Memory (Bộ nhớ tự học)
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);

  const fetchMemoryCount = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/video-translate/memory?limit=1`);
      const data = await res.json();
      if (res.ok && typeof data.total === "number") {
        setMemoryCount(data.total);
      }
    } catch (e) {
      // silent
    }
  };

  const [isVerbose, setIsVerbose] = useState<boolean>(false);

  const fetchVerboseStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/logs/verbose`);
      if (res.ok) {
        const data = await res.json();
        setIsVerbose(Boolean(data.enabled));
      }
    } catch {
      // silent
    }
  };

  const handleToggleVerbose = async () => {
    const nextVal = !isVerbose;
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/logs/verbose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextVal }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsVerbose(nextVal);
        toast.success(data.message || (nextVal ? "Đã BẬT ghi log chi tiết từng bước (debug)" : "Đã TẮT ghi log chi tiết"));
      }
    } catch (err: any) {
      toast.error("Không thể thay đổi chế độ log: " + err.message);
    }
  };

  useEffect(() => {
    fetchMemoryCount();
    fetchVerboseStatus();
  }, []);

  // 1. Tải danh mục ngôn ngữ từ Backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/translate/languages`)
      .then((res) => res.json())
      .then((data) => {
        if (data.languages) setLanguages(data.languages);
      })
      .catch((err) => console.error("Lỗi tải ngôn ngữ:", err));
  }, []);

  // 2. Tải danh sách giọng đọc theo ngôn ngữ đích (targetLang)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/dubbing/voices?lang=${targetLang}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          // Kiểm tra giọng hiện tại có trong danh sách và phù hợp ngôn ngữ không
          const currentVoiceObj = data.voices.find((v: VoiceOption) => v.id === selectedVoice);
          const langPrefix = targetLang.toLowerCase().split("-")[0];
          const isCompatible = currentVoiceObj && (
            currentVoiceObj.lang?.toLowerCase().startsWith(langPrefix) ||
            currentVoiceObj.engine === "omnivoice" ||
            selectedVoice.startsWith("omnivoice:") ||
            targetLang === "all"
          );

          if (!isCompatible) {
            let defaultV = data.voices.find((v: VoiceOption) => {
              if (langPrefix === "en") return v.id.includes("English") || v.id.includes("Jenny") || v.id.startsWith("en-");
              if (langPrefix === "zh") return v.id.includes("Xiaoxiao") || v.id.startsWith("zh-");
              if (langPrefix === "ja") return v.id.includes("Nanami") || v.id.startsWith("ja-");
              if (langPrefix === "ko") return v.id.includes("SunHi") || v.id.startsWith("ko-");
              if (langPrefix === "vi") return v.id.includes("HoaiMy") || v.id.startsWith("vi-");
              return v.lang?.toLowerCase().startsWith(langPrefix);
            });
            if (!defaultV) defaultV = data.voices[0];
            if (defaultV) {
              setSelectedVoice(defaultV.id);
              setSelectedEngine(defaultV.engine);
            }
          } else if (currentVoiceObj) {
            setSelectedEngine(currentVoiceObj.engine);
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
          const res = await fetch(`${API_BASE_URL}/api/video-translate/status/${currentId}`);
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
        const res = await fetch(`${API_BASE_URL}/api/video-translate/status/${taskId}`);
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
          playCompletionSound();
          toast.success("🎉 Video đã hoàn tất dịch & lồng tiếng!");
          if (resultVideoRef.current) {
            resultVideoRef.current.load();
          }
        } else if (data.status === "waiting_manual_translation") {
          setIsProcessing(false);
          setIsRedubbing(false);
          playNotificationSound();
          toast.success("✅ Đã tạo phụ đề gốc thành công! Tự động chuyển sang Bước 2 để dịch kịch bản.");
          switchManualStep(2);
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

  // Tự động nạp lại phần tử DOM Video khi URL xem trước thay đổi
  useEffect(() => {
    if (previewVideoRef.current && videoPreviewUrl) {
      try {
        previewVideoRef.current.load();
      } catch {
        // Bỏ qua lỗi load
      }
    }
  }, [videoPreviewUrl]);

  // 5. Xử lý tải video lên
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mkv|mov|webm|avi|flv|m4v|wmv)$/i)) {
      toast.error("Vui lòng chọn file video hợp lệ (MP4, MKV, MOV, WebM)");
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file, url);
    setTaskId(null);
    setTaskStatus(null);
    // Kích hoạt nạp trước Faster-Whisper trong lúc người dùng tinh chỉnh tham số
    fetch(`${API_BASE_URL}/api/video-translate/warmup`).catch(() => {});
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
    requestNotificationPermission();
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
    formData.append("bgm_type", bgmType);
    formData.append("bgm_volume", bgmVolume.toString());
    formData.append("subtitle_mode", subtitleMode);
    formData.append("max_speed_rate", maxSpeedRate.toString());
    formData.append("output_resolution", outputResolution);
    formData.append("font_size", subtitleFontSize.toString());
    formData.append("margin_v", subtitleMarginV.toString());
    formData.append("alignment", subtitlePosition === "top" ? "6" : "2");
    formData.append("translation_provider", translationProvider);
    formData.append("translation_style", translationStyle);
    formData.append("translation_model", geminiModel);
    formData.append("translation_temperature", geminiTemperature.toString());
    formData.append("whisper_model", whisperModel);
    formData.append("vad_threshold", vadThreshold.toString());
    formData.append("speech_pad_ms", speechPadMs.toString());
    formData.append("min_speech_duration_ms", minSpeechDurationMs.toString());
    formData.append("min_silence_duration_ms", minSilenceDurationMs.toString());
    formData.append("beam_size", beamSize.toString());
    if (geminiApiKey.trim()) {
      formData.append("translation_api_key", geminiApiKey.trim());
    }
    if (videoStartTime > 0) {
      formData.append("start_time", videoStartTime.toString());
    }
    if (videoEndTime !== null && videoEndTime > videoStartTime) {
      formData.append("end_time", videoEndTime.toString());
    }

    try {
      toast.info("🚀 Đang khởi chạy quy trình dịch & lồng tiếng video...", { duration: 4000 });

      const uploadPromise = new Promise<{ task_id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE_URL}/api/video-translate/start`);

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

  // Lồng tiếng lại theo phụ đề SRT đã chỉnh sửa
  const handleRedub = async (customSrtContent?: string) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;
    setIsRedubbing(true);
    setElapsedSeconds(0);
    taskStartTimeRef.current = Date.now();
    try {
      toast.info("Đang bắt đầu lồng tiếng và render lại video...");
      const res = await fetch(`${API_BASE_URL}/api/video-translate/redub/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srt_content: customSrtContent || undefined,
          voice_id: selectedVoice,
          engine: selectedEngine,
          voice_rate: voiceRate,
          bgm_type: bgmType,
          bgm_volume: bgmVolume,
          subtitle_mode: subtitleMode,
          max_speed_rate: maxSpeedRate,
          font_size: subtitleFontSize,
          margin_v: subtitleMarginV,
          alignment: subtitlePosition === "top" ? 6 : 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể thực hiện lồng tiếng lại");

      setTaskId(currentId);
      setIsProcessing(true);
      setShowSrtEditor(false);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi thực hiện lồng tiếng lại");
    } finally {
      setIsRedubbing(false);
    }
  };

  // ── Chế độ Thủ công (Manual Workflow Handlers) ─────────────────────────────
  // 1. Khởi chạy tạo phụ đề Whisper thủ công
  const handleStartManualTranscribe = async () => {
    requestNotificationPermission();
    if (!videoFile) {
      toast.error("Vui lòng chọn video cần tạo phụ đề trước.");
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
    formData.append("whisper_model", whisperModel);
    formData.append("vad_threshold", vadThreshold.toString());
    formData.append("speech_pad_ms", speechPadMs.toString());
    formData.append("min_speech_duration_ms", minSpeechDurationMs.toString());
    formData.append("min_silence_duration_ms", minSilenceDurationMs.toString());
    formData.append("beam_size", beamSize.toString());
    if (videoStartTime > 0) {
      formData.append("start_time", videoStartTime.toString());
    }
    if (videoEndTime !== null && videoEndTime > videoStartTime) {
      formData.append("end_time", videoEndTime.toString());
    }

    try {
      toast.info("🚀 Đang tải video lên và tạo phụ đề gốc bằng Faster-Whisper...", { duration: 4000 });
      const res = await fetch(`${API_BASE_URL}/api/video-translate/manual/start-transcribe`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Lỗi khởi chạy tạo phụ đề");
      setTaskId(data.task_id);
      setIsProcessing(true);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi bắt đầu tạo phụ đề");
      setIsProcessing(false);
    }
  };

  // Khôi phục các thông số bóc tách Whisper / VAD về mặc định tối ưu
  const handleResetTranscribeDefaults = () => {
    setVadThreshold(0.15);
    setSpeechPadMs(400);
    setMinSpeechDurationMs(150);
    setMinSilenceDurationMs(1000);
    setBeamSize(5);
    setWhisperModel("large-v3");
    setSourceLang("en");
    toast.success("✅ Đã khôi phục các thông số bóc tách về chuẩn tối ưu!");
  };

  // Khôi phục các tùy chỉnh phụ đề & âm thanh về mặc định tối ưu
  const handleResetAudioSubtitleDefaults = () => {
    setSubtitleMode("hard_target");
    setSubtitleFontSize(20);
    setSubtitlePosition("bottom");
    setSubtitleMarginV(30);
    setOutputResolution("720p");
    setBgmType("bgm");
    setPreserveBgm(true);
    setBgmVolume(0.30);
    setVoiceRate("+0%");
    setMaxSpeedRate(1.35);
    toast.success("✅ Đã khôi phục tùy chỉnh phụ đề & âm thanh về chuẩn tối ưu!");
  };

  const [showPromptPreview, setShowPromptPreview] = useState(false);

  const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = `Tôi muốn dịch file phụ đề này. Hãy tuân thủ các quy tắc sau:
1. Đọc và dịch nội dung bám sát kịch bản, lưu nhớ và nhất quán các danh từ riêng, thuật ngữ.
2. Phân tích logic hội thoại và quan hệ nhân vật để xưng hô chuẩn xác theo cốt truyện.
3. Kiểm tra mốc thời gian và ngữ pháp để gộp các câu thoại bị ngắt dở dang thành câu hoàn chỉnh trước khi dịch.
4. Tối ưu độ dài câu (CPS) và chèn dấu ngắt nghỉ phù hợp để làm giọng đọc AI/thuyết minh.
5. Lọc các câu mang tính chất quảng cáo.
Đây là file/nội dung phụ đề:

`;

  const [customTranslationPrompt, setCustomTranslationPrompt] = useState<string>(() => {
    return localStorage.getItem("tts_custom_translation_prompt") || DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
  });

  const handleUpdateCustomPrompt = (val: string) => {
    setCustomTranslationPrompt(val);
    localStorage.setItem("tts_custom_translation_prompt", val);
  };

  const handleResetCustomPrompt = () => {
    setCustomTranslationPrompt(DEFAULT_TRANSLATION_PROMPT_TEMPLATE);
    localStorage.removeItem("tts_custom_translation_prompt");
    toast.success("✅ Đã khôi phục Quy tắc Prompt AI về mặc định!");
  };

  // 2. Sao chép nhanh toàn bộ phụ đề gốc kèm Prompt AI vào Clipboard
  const [isCopyingOriginalSrt, setIsCopyingOriginalSrt] = useState(false);

  const handleCopyOriginalSrt = async (includePrompt: boolean = true) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) {
      toast.error("Chưa có tác vụ bóc tách phụ đề nào.");
      return;
    }
    setIsCopyingOriginalSrt(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/video-translate/subtitles-original-content/${currentId}`);
      const data = await res.json();
      if (!res.ok || !data.content) {
        throw new Error(data.detail || "Không thể lấy nội dung phụ đề gốc");
      }
      const rawText = data.content;
      const promptToUse = customTranslationPrompt || DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
      const textToCopy = includePrompt ? `${promptToUse.trim()}\n\n${rawText}` : rawText;
      await navigator.clipboard.writeText(textToCopy);
      if (includePrompt) {
        toast.success("📋 Đã sao chép Prompt yêu cầu & Phụ đề vào Clipboard! Đang chuyển sang Bước 3...");
      } else {
        toast.success("📋 Đã sao chép nội dung phụ đề SRT gốc vào Clipboard! Đang chuyển sang Bước 3...");
      }
      setTimeout(() => {
        switchManualStep(3);
      }, 600);
    } catch (err: any) {
      // Fallback: thử tải trực tiếp từ URL file SRT gốc
      try {
        const directUrl = `${API_BASE_URL}/outputs/video_translate/${currentId}/subtitles_original.srt`;
        const resDirect = await fetch(directUrl);
        if (resDirect.ok) {
          const text = await resDirect.text();
          if (text && text.trim()) {
            const promptToUse = customTranslationPrompt || DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
            const textToCopy = includePrompt ? `${promptToUse.trim()}\n\n${text}` : text;
            await navigator.clipboard.writeText(textToCopy);
            toast.success("📋 Đã sao chép toàn bộ Prompt & Phụ đề vào Clipboard! Đang chuyển sang Bước 3...");
            setTimeout(() => {
              switchManualStep(3);
            }, 600);
            return;
          }
        }
      } catch (_) {}
      toast.error("Lỗi khi sao chép phụ đề: " + (err.message || "Không thể truy cập Clipboard"));
    } finally {
      setIsCopyingOriginalSrt(false);
    }
  };

  // 2b. Tải file TXT kèm Prompt dịch mẫu cho AI
  const handleDownloadOriginalPromptTxt = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) {
      toast.error("Chưa có tác vụ nào.");
      return;
    }
    try {
      toast.info("Đang chuẩn bị file Prompt kèm Phụ đề...");
      const res = await fetch(`${API_BASE_URL}/api/video-translate/subtitles-original-content/${currentId}`);
      const data = await res.json();
      const rawText = (res.ok && data.content) ? data.content : "";
      const promptToUse = customTranslationPrompt || DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
      const fullContent = `${promptToUse.trim()}\n\n${rawText}`;
      
      const blob = new Blob([fullContent], { type: "text/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subtitles_with_prompt_${currentId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("✅ Đã tải file Prompt AI (.TXT) thành công! Đang chuyển sang Bước 3...");
      setTimeout(() => {
        switchManualStep(3);
      }, 600);
    } catch {
      handleDownloadFile(currentId, "prompt_txt", `subtitles_with_prompt_${currentId}.txt`);
      setTimeout(() => {
        switchManualStep(3);
      }, 600);
    }
  };

  // 2c. Tải file SRT gốc về máy
  const handleDownloadOriginalSrt = () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) {
      toast.error("Chưa có tác vụ nào.");
      return;
    }
    handleDownloadFile(currentId, "srt_original", `original_subtitles_${currentId}.srt`);
    setTimeout(() => {
      switchManualStep(3);
    }, 600);
  };

  // 3. Xử lý tải file SRT dịch lên
  const handleManualSrtFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) {
      toast.error("Chưa có tác vụ tạo phụ đề tương ứng.");
      return;
    }

    setManualSrtFile(file);
    setIsUploadingManualSrt(true);

    const formData = new FormData();
    formData.append("srt_file", file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/video-translate/manual/upload-translated-srt/${currentId}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Lỗi khi nạp file phụ đề");
      setManualUploadedCount(data.segments_count || null);
      switchManualStep(4);
      toast.success(`✅ ${data.message} • Đã chuyển sang Bước 4 để chọn giọng & render!`);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi nạp file phụ đề");
    } finally {
      setIsUploadingManualSrt(false);
    }
  };

  // 3b. Dán văn bản từ Clipboard
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setManualSrtText(text);
        toast.success("📋 Đã dán nội dung từ clipboard!");
      } else {
        toast.info("Clipboard rỗng hoặc không có văn bản.");
      }
    } catch (err) {
      toast.error("Không thể đọc Clipboard trình duyệt tự động. Vui lòng bấm Ctrl + V vào ô văn bản bên dưới.");
    }
  };

  // 3c. Xử lý nạp văn bản phụ đề dịch (Text Paste)
  const handleManualSrtTextSubmit = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) {
      toast.error("Chưa có tác vụ tạo phụ đề tương ứng.");
      return;
    }

    if (!manualSrtText.trim()) {
      toast.error("Vui lòng dán nội dung phụ đề trước khi áp dụng.");
      return;
    }

    setIsUploadingManualSrt(true);
    const formData = new FormData();
    formData.append("srt_content", manualSrtText.trim());

    try {
      const res = await fetch(`${API_BASE_URL}/api/video-translate/manual/upload-translated-srt/${currentId}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Lỗi khi nạp nội dung phụ đề");
      setManualUploadedCount(data.segments_count || null);
      switchManualStep(4);
      toast.success(`✅ ${data.message} • Đã chuyển sang Bước 4 để chọn giọng & render!`);
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi nạp nội dung phụ đề");
    } finally {
      setIsUploadingManualSrt(false);
    }
  };

  // 4. Tiếp tục quy trình: Lồng tiếng & Render Video
  const handleResumeManualPipeline = async () => {
    requestNotificationPermission();
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) {
      toast.error("Chưa có tác vụ nào.");
      return;
    }

    setIsProcessing(true);
    setElapsedSeconds(0);
    taskStartTimeRef.current = Date.now();

    const formData = new FormData();
    formData.append("voice_id", selectedVoice);
    formData.append("engine", selectedEngine);
    formData.append("voice_rate", voiceRate);
    formData.append("voice_pitch", "+0Hz");
    formData.append("voice_volume", "1.0");
    formData.append("preserve_bgm", preserveBgm ? "true" : "false");
    formData.append("bgm_type", bgmType);
    formData.append("bgm_volume", bgmVolume.toString());
    formData.append("subtitle_mode", subtitleMode);
    formData.append("max_speed_rate", maxSpeedRate.toString());
    formData.append("output_resolution", outputResolution);
    formData.append("font_size", subtitleFontSize.toString());
    formData.append("margin_v", subtitleMarginV.toString());
    formData.append("alignment", subtitlePosition === "top" ? "6" : "2");

    if (manualSrtMode === "file" && manualSrtFile) {
      formData.append("srt_file", manualSrtFile);
    } else if (manualSrtMode === "text" && manualSrtText.trim()) {
      formData.append("srt_content", manualSrtText.trim());
    }

    try {
      toast.info("🎬 Đang tiến hành lồng tiếng và render video...", { duration: 4000 });
      const res = await fetch(`${API_BASE_URL}/api/video-translate/manual/resume-pipeline/${currentId}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Lỗi khi tiếp tục quy trình");
      setIsProcessing(true);
    } catch (err: any) {
      toast.error(err.message || "Lỗi lồng tiếng và render");
      setIsProcessing(false);
    }
  };

  // Đọc nội dung SRT hiển thị trên web
  const handleToggleSrtEditor = async () => {
    const currentId = taskStatus?.task_id || taskId;
    if (!showSrtEditor) {
      if (!currentId) return;
      setIsLoadingSrt(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/video-translate/subtitles-content/${currentId}`);
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
      const res = await fetch(`${API_BASE_URL}/api/video-translate/subtitles-content/${currentId}`, {
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
      const res = await fetch(`${API_BASE_URL}/api/video-translate/studio-segments/${tId}`);
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
    if (!resultVideoRef.current) return;
    const cur = resultVideoRef.current.currentTime;

    // Tự động dừng phát khi phát hết câu thoại đơn lẻ được chọn
    if (segmentPlaybackTargetRef.current !== null) {
      if (cur >= segmentPlaybackTargetRef.current.end) {
        resultVideoRef.current.pause();
        segmentPlaybackTargetRef.current = null;
        return;
      }
    }

    if (studioSegments.length === 0) return;

    // Tìm câu thoại tương ứng với thời gian phát hiện tại
    const found = studioSegments.find((s) => s.start <= cur && cur <= s.end + 0.15);
    if (found) {
      setCurrentLiveSubtitle(found.text);
      if (found.id !== activeStudioSegmentId) {
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
    } else {
      setCurrentLiveSubtitle("");
    }
  };

  // Phát đúng câu thoại được nhấp và tự động dừng khi câu kết thúc (không chạy lấn sang câu sau)
  const handlePlaySingleSegmentOnVideo = (seg: StudioSegment) => {
    if (!resultVideoRef.current) return;
    resultVideoRef.current.currentTime = Math.max(0, seg.start);
    segmentPlaybackTargetRef.current = { end: seg.end, segId: seg.id };
    resultVideoRef.current.play().catch(() => {});
    setActiveStudioSegmentId(seg.id);
  };

  // Tua video trực tiếp tới câu đang chọn
  const handleSeekToSegment = (seg: StudioSegment) => {
    if (!resultVideoRef.current) return;
    segmentPlaybackTargetRef.current = null; // Cho phép phát liên tục nếu bấm tua
    resultVideoRef.current.currentTime = seg.start;
    resultVideoRef.current.play().catch(() => {});
    setActiveStudioSegmentId(seg.id);
  };

  // Đồng bộ thay đổi văn bản hoặc mốc thời gian của câu thoại về máy chủ
  const handleSyncSegmentUpdate = async (segId: number, newText: string, newStart?: number, newEnd?: number) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;
    try {
      await fetch(`${API_BASE_URL}/api/video-translate/studio-update-segment/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_id: segId,
          text: newText,
          start: newStart,
          end: newEnd,
        }),
      });
    } catch (e) {
      console.error("Lỗi đồng bộ segment:", e);
    }
  };

  // Tinh chỉnh mốc thời gian bắt đầu của câu thoại (±0.1s hoặc nhập số)
  const handleAdjustSegmentStart = (seg: StudioSegment, delta: number) => {
    const newStart = Math.max(0, Math.round((seg.start + delta) * 10) / 10);
    if (newStart >= seg.end) {
      toast.error("Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc");
      return;
    }
    updateStudioSegmentTiming(seg.id, newStart, seg.end);
    handleSyncSegmentUpdate(seg.id, seg.text, newStart, seg.end);
  };

  // Thuyết minh lại CỤC BỘ đúng 1 câu duy nhất (chỉ mất ~0.5s - 1s trên Colab GPU)
  const handleRedubSingleSegment = async (seg: StudioSegment) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;

    setStudioSegmentRedubbing(seg.id, true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/video-translate/studio-redub-segment/${currentId}`, {
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
        audio_url: data.audio_url,
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
        const fullAudioUrl = data.audio_url.startsWith("http") ? data.audio_url : `${API_BASE_URL}${data.audio_url}`;
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
    const fullUrl = audioUrl.startsWith("http") ? audioUrl : `${API_BASE_URL}${audioUrl}`;
    const audio = new Audio(fullUrl);
    setPlayingAudioSegId(segId);
    audio.onended = () => setPlayingAudioSegId(null);
    audio.onerror = () => setPlayingAudioSegId(null);
    audio.play().catch(() => setPlayingAudioSegId(null));
  };

  // Xóa một câu thoại/phụ đề khỏi timeline Studio
  const handleDeleteStudioSegment = async (segId: number) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa đoạn phụ đề #${segId} này không? Đoạn này sẽ không còn xuất hiện trong video thành phẩm.`)) {
      return;
    }

    setDeletingSegId(segId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/video-translate/studio-delete-segment/${currentId}/${segId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Không thể xóa câu này");
      }
      removeStudioSegment(segId);
      if (playingAudioSegId === segId) {
        setPlayingAudioSegId(null);
      }
      toast.success(`🗑️ Đã xóa đoạn #${segId} thành công!`);
    } catch (err: any) {
      toast.error("Lỗi khi xóa câu: " + err.message);
    } finally {
      setDeletingSegId(null);
    }
  };

  // Chèn câu thoại mới vào bất kỳ vị trí nào trong Timeline Studio
  const handleOpenAddSegment = (initialStart?: number, initialEnd?: number) => {
    let startVal = 0;
    if (initialStart !== undefined) {
      startVal = Math.round(initialStart * 10) / 10;
    } else if (resultVideoRef.current) {
      startVal = Math.round(resultVideoRef.current.currentTime * 10) / 10;
    }
    const endVal = initialEnd !== undefined ? Math.round(initialEnd * 10) / 10 : Math.round((startVal + 2.5) * 10) / 10;
    setNewSegStart(startVal);
    setNewSegEnd(endVal);
    setNewSegText("");
    setNewSegOriginalText("");
    setNewSegVoiceId(selectedVoice);
    setNewSegEngine(selectedEngine);
    setShowAddSegmentModal(true);
  };

  const handleSubmitAddSegment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) {
      toast.error("Chưa có tác vụ nào đang hoạt động");
      return;
    }
    if (!newSegText.trim()) {
      toast.error("Vui lòng nhập nội dung câu thoại");
      return;
    }
    if (newSegStart >= newSegEnd) {
      toast.error("Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc");
      return;
    }

    setIsAddingSegment(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/video-translate/studio-add-segment/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: newSegStart,
          end: newSegEnd,
          text: newSegText.trim(),
          original_text: newSegOriginalText.trim() || undefined,
          voice_id: newSegVoiceId || selectedVoice,
          engine: newSegEngine || selectedEngine,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Không thể thêm câu thoại");
      }
      const data = await res.json();
      if (data.segment) {
        addStudioSegment(data.segment);
        toast.success(`✅ Đã chèn câu thoại #${data.segment.id} và tạo giọng đọc thành công!`);
        setShowAddSegmentModal(false);

        // Tua video đến mốc vừa thêm để người dùng xem lại
        if (resultVideoRef.current) {
          resultVideoRef.current.currentTime = data.segment.start;
        }
        if (data.audio_url) {
          const fullAudioUrl = data.audio_url.startsWith("http") ? data.audio_url : `${API_BASE_URL}${data.audio_url}`;
          const audio = new Audio(fullAudioUrl);
          setPlayingAudioSegId(data.segment.id);
          audio.onended = () => setPlayingAudioSegId(null);
          audio.onerror = () => setPlayingAudioSegId(null);
          audio.play().catch(() => setPlayingAudioSegId(null));
        }
      }
    } catch (err: any) {
      toast.error("Lỗi khi chèn câu: " + err.message);
    } finally {
      setIsAddingSegment(false);
    }
  };

  // 6. Xử lý tải video/phụ đề trực tiếp và mượt mà bằng trình duyệt (Không tốn RAM)
  const handleDownloadFile = async (
    id: string,
    fileType: "video" | "srt" | "srt_original" | "prompt_txt" | "vocals" | "bgm" | "audio",
    defaultFilename?: string
  ) => {
    const rawStem = (videoFile?.name || (taskStatus as any)?.video_filename || "Video").replace(/\.[^/.]+$/, "");
    const videoTargetName = `${rawStem} Translate buy KhaTran.mp4`;
    const finalFilename = fileType === "video" ? (defaultFilename || videoTargetName) : (defaultFilename || (fileType === "srt_original" ? `${rawStem}_original.srt` : `${rawStem}.srt`));
    const typeLabel = fileType === "video" ? "video MP4" : fileType === "srt_original" ? "phụ đề thoại gốc (.SRT)" : fileType === "prompt_txt" ? "file phụ đề kèm Prompt AI (.TXT)" : fileType === "vocals" ? "âm thanh giọng nói sạch (Vocals)" : fileType === "bgm" ? "nhạc nền không lời (BGM)" : fileType === "audio" ? "âm thanh lồng tiếng" : "phụ đề dịch (.SRT)";
    
    toast.info(`Bắt đầu tải ${typeLabel}...`);
    const downloadUrl = `${API_BASE_URL}/api/video-translate/download/${id}?file_type=${fileType}`;

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        const videoDirectPath = taskStatus?.video_url || (taskStatus as any)?.result_video_url;
        if (fileType === "video" && videoDirectPath) {
          const directUrl = videoDirectPath.startsWith("http") ? videoDirectPath : `${API_BASE_URL}${videoDirectPath}`;
          const resDirect = await fetch(directUrl);
          if (resDirect.ok) {
            const blob = await resDirect.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast.success(`✅ Đã tải ${typeLabel} thành công!`);
            return;
          }
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Không thể tải file (Mã HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = finalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`✅ Đã tải ${typeLabel} thành công!`);
    } catch (err: any) {
      console.warn("Direct blob download fallback to standard link:", err);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", finalFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
      const res = await fetch(`${API_BASE_URL}/api/video-translate/cleanup-cache`, {
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
      const res = await fetch(`${API_BASE_URL}/api/video-translate/open-folder/${currentId}`, {
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

  // Trạng thái phụ đề cho chế độ Thủ công (Manual Mode)
  const isOriginalSrtReady = Boolean(
    taskStatus?.status === "waiting_manual_translation" ||
    taskStatus?.subtitles_original_srt_url ||
    (taskStatus?.status === "completed" && taskStatus?.task_id) ||
    manualUploadedCount !== null ||
    manualSrtFile !== null ||
    taskStatus?.subtitles_srt_url
  );
  const isTranscribingOriginal = isProcessing && (taskStatus?.current_step === "transcribing" || taskStatus?.current_step === "extracting");

  return (
    <div className="flex flex-col gap-6 2k:gap-8 animate-in fade-in duration-500 max-w-[1600px] 2k:max-w-[2000px] mx-auto w-full">
      {/* Header (Thiết kế phẳng, tinh tế chuẩn OmniVoice Studio) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl 2k:text-3xl font-bold tracking-tight text-on-surface">
              Dịch & Lồng Tiếng Video
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-mono">
              v3.6.0
            </span>
          </div>
          <p className="text-on-surface-variant text-sm 2k:text-base mt-0.5">
            Tự động bóc tách Faster-Whisper, Dịch thuật kịch bản AI & Hòa âm lồng tiếng chuẩn phòng thu
          </p>
        </div>

        {/* Quick Tools Header */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCleanCache}
            disabled={isCleaning || isProcessing}
            className="inline-flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            title="Dọn dẹp các tệp tạm và rác video để giải phóng dung lượng đĩa"
          >
            {isCleaning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>{isCleaning ? "Đang dọn..." : "Dọn rác đĩa"}</span>
          </button>
          <button
            type="button"
            onClick={handleToggleVerbose}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer font-semibold shadow-xs",
              isVerbose
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10"
                : "bg-surface-dim hover:bg-white/10 text-on-surface-variant hover:text-on-surface border-white/10"
            )}
            title={
              isVerbose
                ? "Chế độ ghi log chi tiết từng bước đang BẬT. Nhấp để tắt quay về ghi log tiêu chuẩn."
                : "Nhấp để BẬT chế độ ghi log chi tiết từng bước phục vụ debug và chẩn đoán lỗi."
            }
          >
            <Bug className="w-3.5 h-3.5" />
            <span>{isVerbose ? "Debug: BẬT" : "Debug: TẮT"}</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant/80 bg-surface-dim border border-white/10 px-3 py-1.5 rounded-xl">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Studio 24kHz
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant/80 bg-surface-dim border border-white/10 px-3 py-1.5 rounded-xl">
            <Music className="w-3.5 h-3.5 text-secondary" />
            Giữ BGM
          </span>
        </div>
      </div>

      {/* Main Grid: Upload & Controls | Preview & Result */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 2k:gap-10 items-start">
        {/* Left Column: Upload & Config (7 cols - ẩn khi mở chế độ rạp chiếu) */}
        <div className={cn(isExpandedPlayer ? "hidden" : "lg:col-span-7", "space-y-6 transition-all duration-300")}>
          {/* Tab Switcher: Chế độ Dịch Thủ Công vs Chế độ Dịch Tự Động (Đưa lên trên cùng) */}
          <div className="flex items-center p-1.5 bg-surface-variant/40 border border-white/10 rounded-2xl gap-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => switchTranslationMode("manual")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all duration-300 ease-out cursor-pointer",
                translationMode === "manual"
                  ? "bg-primary text-black shadow-lg shadow-primary/20 scale-[1.01]"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
              )}
            >
              <FileText className="w-4 h-4" />
              <span>✍️ Dịch Thủ Công (Tạo Phụ Đề & Nạp SRT)</span>
            </button>
            <button
              type="button"
              onClick={() => switchTranslationMode("auto")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all duration-300 ease-out cursor-pointer",
                translationMode === "auto"
                  ? "bg-primary text-black shadow-lg shadow-primary/20 scale-[1.01]"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
              )}
            >
              <Sparkles className="w-4 h-4" />
              <span>⚡ Dịch Tự Động (Full AI)</span>
            </button>
          </div>

          {/* Card 1: Chọn Video Cần Dịch */}
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
              <div className="space-y-3">
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

                {/* Tùy chọn Cắt đoạn Video cần dịch (Trimming Clip) */}
                {(videoFile || videoPreviewUrl) && !isProcessing && (
                  <div className="p-3.5 bg-surface-variant/25 rounded-2xl border border-primary/20 space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Scissors className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-on-surface">Cắt đoạn video cần dịch (Tùy chọn)</span>
                        <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">
                          {videoStartTime > 0 || videoEndTime !== null ? "Đang cắt clip" : "Toàn bộ video"}
                        </span>
                      </div>
                      {(videoStartTime > 0 || videoEndTime !== null) && (
                        <button
                          type="button"
                          onClick={resetVideoTrim}
                          className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Dịch toàn bộ video
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Start time */}
                      <div className="space-y-1 bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <label className="text-[11px] text-on-surface-variant flex items-center justify-between">
                          <span className="flex items-center gap-1 text-green-400 font-semibold">
                            <Clock className="w-3 h-3" />
                            Bắt đầu từ:
                          </span>
                          <span className="font-mono text-xs text-primary font-bold">{formatSrtTime(videoStartTime)}</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={videoStartTime}
                            onChange={(e) => setVideoStartTime(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-20 bg-surface-variant/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-on-surface font-mono"
                            placeholder="0.0s"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cur = previewVideoRef.current?.currentTime || resultVideoRef.current?.currentTime || 0;
                              setVideoStartTime(Math.round(cur * 10) / 10);
                              toast.success(`📍 Đã lấy mốc bắt đầu: ${formatSrtTime(cur)}`);
                            }}
                            className="flex-1 py-1.5 px-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title="Đặt mốc thời gian hiện tại của video player làm điểm bắt đầu"
                          >
                            <span>📍 Mốc hiện tại</span>
                          </button>
                        </div>
                      </div>

                      {/* End time */}
                      <div className="space-y-1 bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <label className="text-[11px] text-on-surface-variant flex items-center justify-between">
                          <span className="flex items-center gap-1 text-red-400 font-semibold">
                            <Clock className="w-3 h-3" />
                            Kết thúc tại:
                          </span>
                          <span className="font-mono text-xs text-primary font-bold">
                            {videoEndTime !== null ? formatSrtTime(videoEndTime) : "Hết video"}
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={videoEndTime ?? ""}
                            placeholder="Hết video"
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              setVideoEndTime(val ? Math.max(0, parseFloat(val)) : null);
                            }}
                            className="w-20 bg-surface-variant/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-on-surface font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cur = previewVideoRef.current?.currentTime || resultVideoRef.current?.currentTime || 0;
                              if (cur <= videoStartTime) {
                                toast.error("Mốc kết thúc phải lớn hơn mốc bắt đầu");
                                return;
                              }
                              setVideoEndTime(Math.round(cur * 10) / 10);
                              toast.success(`📍 Đã lấy mốc kết thúc: ${formatSrtTime(cur)}`);
                            }}
                            className="flex-1 py-1.5 px-2 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title="Đặt mốc thời gian hiện tại của video player làm điểm kết thúc"
                          >
                            <span>📍 Mốc hiện tại</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {translationMode === "auto" ? (
          /* Card 2: Cấu hình Ngôn Ngữ & Giọng Lồng Tiếng */
          <div key="auto-mode-card" className={cn("bg-surface/80 border border-white/10 rounded-3xl p-6 space-y-5 backdrop-blur-xl shadow-lg transition-all duration-300", isModeTransitioning ? "step-fade-exit" : "step-fade-enter")}>
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
                      <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (500 lượt/ngày - Mặc định & Khuyên dùng)</option>
                      <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (500 lượt/ngày - Nhanh & Ổn định)</option>
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
                        className="px-3 py-2 rounded-xl bg-primary text-black font-semibold text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
                        title="Gửi kiểm tra trực tiếp hạn mức với Google AI Studio"
                      >
                        {isVerifyingKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        <span>Kiểm tra Key</span>
                      </button>
                    </div>

                    {keyVerifyResult && (
                      <div className="space-y-2 pt-1 animate-fadeIn">
                        <div
                          className={cn(
                            "p-2.5 rounded-xl text-[11px] flex items-start gap-2 border leading-relaxed",
                            keyVerifyResult.valid
                              ? "bg-green-500/10 text-green-400 border-green-500/30"
                              : (keyVerifyResult.message?.includes("HẾT HẠN MỨC") || keyVerifyResult.message?.includes("429"))
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                          )}
                        >
                          {keyVerifyResult.valid ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400 mt-0.5" />
                          ) : (keyVerifyResult.message?.includes("HẾT HẠN MỨC") || keyVerifyResult.message?.includes("429")) ? (
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                          )}
                          <span className="flex-1 font-medium">{keyVerifyResult.message}</span>
                        </div>

                        {/* Bảng chi tiết hạn mức từng mô hình */}
                        {keyVerifyResult.quota_details && Array.isArray(keyVerifyResult.quota_details) && (
                          <div className="bg-black/30 border border-white/10 rounded-xl p-2.5 space-y-1.5 text-[11px]">
                            <div className="text-on-surface-variant font-semibold flex items-center justify-between border-b border-white/5 pb-1">
                              <span>📊 Hạn mức mô hình (Free Tier):</span>
                              <span className="text-[10px] text-primary/80">Google AI Studio</span>
                            </div>
                            <div className="grid grid-cols-1 gap-1 pt-0.5">
                              {keyVerifyResult.quota_details.map((m: any) => (
                                <div
                                  key={m.id}
                                  className={cn(
                                    "p-1.5 rounded-lg flex items-center justify-between border text-[10px]",
                                    m.status === "ready"
                                      ? "bg-green-500/5 border-green-500/20 text-on-surface"
                                      : m.status === "quota_exceeded"
                                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                      : "bg-surface-variant/40 border-white/5 text-on-surface-variant"
                                  )}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-primary">{m.name}</span>
                                    <span className="text-[9px] text-on-surface-variant">
                                      {m.rpd} • {m.rpm} • {m.tpm}
                                    </span>
                                  </div>
                                  <div className="text-right font-medium">
                                    {m.status === "ready" ? (
                                      <span className="text-green-400 flex items-center gap-1 font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                        Sẵn sàng
                                      </span>
                                    ) : m.status === "quota_exceeded" ? (
                                      <span className="text-amber-400 font-bold">Hết lượt (429)</span>
                                    ) : (
                                      <span className="text-on-surface-variant/60">{m.status_text || "Không khả dụng"}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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

              {/* Mô hình tạo phụ đề giọng nói Faster-Whisper ASR */}
              <div className="space-y-1.5 pt-2.5 border-t border-white/10">
                <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    Mô hình tạo phụ đề gốc (Faster-Whisper STT):
                  </span>
                  <span className="text-[10px] text-cyan-300 font-mono font-semibold uppercase">{whisperModel}</span>
                </label>
                <select
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value)}
                  className="w-full bg-surface-variant/80 border border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-cyan-400 font-medium text-cyan-300 cursor-pointer shadow-sm"
                >
                  <option value="large-v3">🌟 large-v3 (Mặc định - Bản lớn đầy đủ 1.55 Tỷ tham số • Chuẩn xác cao nhất)</option>
                  <option value="large-v3-turbo">🚀 large-v3-turbo (Siêu tốc 8x, Nhẹ & Chuẩn 98% • Colab/Local)</option>
                  <option value="medium">⚡ medium (Cân bằng & Tốc độ cao - 769 Triệu tham số)</option>
                  <option value="small">🚀 small (Nhẹ & Nhanh - 244 Triệu tham số)</option>
                  <option value="base">⏱️ base (Bản tối giản - 74 Triệu tham số)</option>
                </select>
                <p className="text-[10px] text-on-surface-variant/70">
                  ⚡ <strong>large-v3</strong> là mô hình lớn nhất với 1.55 tỷ tham số, giải quyết triệt để lỗi từ đồng âm, nhận diện chuẩn tên riêng và tự động ngắt câu với dấu phẩy/chấm đầy đủ với độ chính xác cao nhất.
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

            {/* Tùy chỉnh Phụ Đề & Âm Thanh Nền Nâng Cao (Accordion đồng nhất) */}
            <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/20 transition-all">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                  ⚙️ Tùy Chỉnh Phụ Đề & Âm Thanh Nền (BGM / Âm Thanh Gốc / Tốc Độ)
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                  {showAdvanced ? "Thu nhỏ" : "Mở rộng"}
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                  )}
                </span>
              </button>

              {/* Curtain slide-down container */}
              <div className={cn("curtain-collapse", showAdvanced && "curtain-expanded")}>
                <div className="curtain-inner">
                  <div className="p-4 border-t border-white/10 space-y-4 bg-black/20 text-xs">
                  {/* Chế độ phụ đề */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-on-surface flex items-center gap-1.5">
                      <Subtitles className="w-3.5 h-3.5 text-primary" />
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
                            "py-2 px-3 rounded-xl text-xs font-medium border transition-all text-center cursor-pointer",
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

                  {/* Tùy chỉnh chi tiết phụ đề (Font Size, Vị trí MarginV) - Tự động ẩn khi Không gắn sub */}
                  {subtitleMode !== "none" && (
                    <div className="space-y-3 pt-2 border-t border-white/5 bg-surface-variant/30 p-3 rounded-2xl border border-white/5 animate-fadeIn">
                      {/* Kích thước chữ */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-on-surface-variant">
                          <span className="font-medium text-on-surface">Kích thước chữ phụ đề (Font Size):</span>
                          <span className="font-mono text-primary font-bold">{subtitleFontSize}px</span>
                        </div>
                        <input
                          type="range"
                          min="16"
                          max="36"
                          step="1"
                          value={subtitleFontSize}
                          onChange={(e) => setSubtitleFontSize(parseInt(e.target.value))}
                          className="w-full accent-primary cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-on-surface-variant/70">
                          <span>16px (Nhỏ)</span>
                          <span className="text-primary font-semibold">Mặc định: 20px</span>
                          <span>36px (Lớn)</span>
                        </div>
                      </div>

                      {/* Vị trí hiển thị */}
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <label className="font-medium text-on-surface flex items-center justify-between text-xs">
                          <span>Vị trí hiển thị phụ đề:</span>
                          <span className="text-[10px] text-primary font-bold">
                            {subtitlePosition === "bottom" ? "Dưới đáy" : subtitlePosition === "middle" ? "Giữa màn hình" : "Trên cùng"}
                          </span>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: "bottom", label: "⬇️ Dưới đáy" },
                            { id: "middle", label: "⏹️ Giữa màn hình" },
                            { id: "top", label: "⬆️ Trên cùng" },
                          ].map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => setSubtitlePosition(pos.id as any)}
                              className={cn(
                                "py-1.5 px-2 rounded-xl text-xs font-medium border transition-all text-center cursor-pointer",
                                subtitlePosition === pos.id
                                  ? "bg-primary text-black border-primary font-bold shadow-md"
                                  : "bg-surface-variant/40 text-on-surface-variant border-white/5 hover:border-white/20"
                              )}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chuẩn Video Đầu Ra (Resolution) */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <label className="font-medium text-on-surface flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-primary" />
                        Độ phân giải video đầu ra:
                      </span>
                      <span className="text-[10px] text-primary font-mono uppercase font-bold">
                        {outputResolution === "original" ? "Gốc" : outputResolution}
                      </span>
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: "720p", label: "720p (HD)", desc: "Mặc định • Chuẩn" },
                        { id: "1080p", label: "1080p", desc: "Full HD nét" },
                        { id: "480p", label: "480p", desc: "Siêu nhẹ" },
                        { id: "original", label: "Gốc", desc: "Giữ nguyên" },
                      ].map((res) => (
                        <button
                          key={res.id}
                          type="button"
                          onClick={() => setOutputResolution(res.id)}
                          className={cn(
                            "py-2 px-1.5 rounded-xl text-xs font-medium border transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer",
                            outputResolution === res.id
                              ? "bg-primary text-black border-primary font-bold shadow-md scale-[1.02]"
                              : "bg-surface-variant/40 text-on-surface-variant border-white/5 hover:border-white/20"
                          )}
                        >
                          <span className="font-semibold text-[11px] leading-tight">{res.label}</span>
                          <span className={cn("text-[9px] leading-none", outputResolution === res.id ? "text-black/80 font-medium" : "text-on-surface-variant/60")}>
                            {res.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tùy chọn Âm thanh nền & Thuyết minh */}
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <label className="font-medium text-on-surface flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-secondary" />
                        Âm thanh nền lồng ghép (BGM / Âm thanh gốc):
                      </span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "bgm", label: "🎵 Nhạc nền tách (BGM)", desc: "Tách vocal, giữ giai điệu" },
                        { id: "original", label: "🎙️ Âm thanh gốc (Voice-over)", desc: "Giữ toàn bộ âm gốc nhỏ phía dưới" },
                        { id: "none", label: "🔇 Không dùng nền", desc: "Tắt nền, chỉ giữ giọng AI" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setBgmType(item.id as "bgm" | "original" | "none");
                            setPreserveBgm(item.id !== "none");
                          }}
                          className={cn(
                            "py-2 px-2 rounded-xl text-xs font-medium border transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer",
                            (bgmType === item.id || (!preserveBgm && item.id === "none"))
                              ? "bg-secondary/20 border-secondary text-secondary font-bold shadow-md scale-[1.01]"
                              : "bg-surface-variant/40 text-on-surface-variant border-white/5 hover:border-white/20"
                          )}
                        >
                          <span className="font-semibold text-[11px] leading-tight">{item.label}</span>
                          <span className="text-[9px] text-on-surface-variant/70 leading-none">
                            {item.desc}
                          </span>
                        </button>
                      ))}
                    </div>

                    {bgmType !== "none" && preserveBgm && (
                      <div className="space-y-1.5 pl-3 border-l-2 border-secondary/40 pt-1">
                        <div className="flex justify-between text-xs text-on-surface-variant">
                          <span>Âm lượng {bgmType === "original" ? "âm thanh gốc" : "nhạc nền"}:</span>
                          <span className="font-semibold text-secondary font-mono">{Math.round(bgmVolume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.01"
                          value={bgmVolume}
                          onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                          className="w-full accent-secondary cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-on-surface-variant/70">
                          <span>0% (Tắt)</span>
                          <span className="text-secondary font-semibold">Mặc định: 30%</span>
                          <span>100% (Tối đa)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tốc độ đọc cơ bản */}
                  <div className="space-y-1 pt-2 border-t border-white/5">
                    <label className="font-medium text-on-surface block">
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
                  <div className="space-y-1 pt-2 border-t border-white/5">
                    <div className="flex justify-between text-xs text-on-surface-variant">
                      <span className="font-medium text-on-surface">Tốc độ đọc tăng tối đa (SpeedRate):</span>
                      <span className="font-mono text-primary font-bold">{maxSpeedRate}x</span>
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

                  {/* 🔄 Nút Phục Hồi Mặc Định */}
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] text-on-surface-variant/70">
                      💡 Chuẩn khuyến nghị: <code>Phụ đề dịch</code>, <code>720p</code>, <code>BGM 30%</code>, <code>Tốc độ +0%</code>.
                    </span>
                    <button
                      type="button"
                      onClick={handleResetAudioSubtitleDefaults}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Phục hồi mặc định
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

            {/* CTA Button Bắt Đầu Tự Động */}
            <button
              onClick={handleStartTranslation}
              disabled={!videoFile || isProcessing || taskStatus?.status === "completed"}
              title={
                !videoFile
                  ? "Vui lòng tải video lên trước"
                  : isProcessing
                  ? "Đang xử lý dịch video..."
                  : taskStatus?.status === "completed"
                  ? "Đã hoàn thành xuất video. Nạp video mới để dịch tác vụ mới."
                  : "Bắt đầu toàn bộ quy trình dịch và lồng tiếng tự động"
              }
              className={cn(
                "w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 shadow-xl",
                !videoFile || isProcessing || taskStatus?.status === "completed"
                  ? "bg-surface-variant/40 text-on-surface-variant/60 cursor-not-allowed opacity-60 border border-white/5"
                  : "bg-gradient-to-r from-primary via-primary/90 to-primary text-black hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] shadow-primary/20 cursor-pointer"
              )}
            >
              {isProcessing
                ? `Đang xử lý dịch video (${taskStatus?.progress || 0}%)...`
                : taskStatus?.status === "completed"
                ? "Đã hoàn thành xuất video"
                : "Bắt Đầu Dịch & Lồng Tiếng Tự Động"}
            </button>
          </div>
          ) : (
            /* Chế độ Thủ Công (Manual Pipeline - 4-Step Stepper Wizard in Single Unified Block) */
            <div key="manual-mode-card" className={cn("bg-surface/80 border border-white/10 rounded-3xl p-5 sm:p-6 space-y-5 backdrop-blur-xl shadow-xl transition-all duration-300", isModeTransitioning ? "step-fade-exit" : "step-fade-enter")}>
              {/* Stepper Navigation Bar with < > arrow buttons */}
              <div className="bg-surface-variant/30 border border-white/5 rounded-2xl p-1.5 flex items-center gap-2">
                {/* Nút Mũi Tên < (Bước trước) */}
                <button
                  type="button"
                  disabled={manualActiveStep <= 1}
                  onClick={() => switchManualStep(Math.max(1, manualActiveStep - 1))}
                  title={manualActiveStep <= 1 ? "Đang ở bước đầu tiên" : `Quay lại Bước ${manualActiveStep - 1}`}
                  className={cn(
                    "w-9 h-11 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 border cursor-pointer",
                    manualActiveStep <= 1
                      ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
                      : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Danh sách 4 Bước */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-1">
                  {[
                    { step: 1, title: "1. Phụ đề gốc", desc: "Faster-Whisper", icon: Mic, active: manualActiveStep === 1, done: isOriginalSrtReady },
                    { step: 2, title: "2. Prompt & Dịch", desc: "Gemini AI / Copy", icon: Download, active: manualActiveStep === 2, done: manualUploadedCount !== null },
                    { step: 3, title: "3. Nạp SRT Dịch", desc: "Upload / Paste", icon: FileEdit, active: manualActiveStep === 3, done: manualUploadedCount !== null },
                    { step: 4, title: "4. Giọng & Render", desc: "OmniVoice / Edge", icon: Sliders, active: manualActiveStep === 4, done: taskStatus?.status === "completed" },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isCurrent = item.step === manualActiveStep;
                    return (
                      <button
                        key={item.step}
                        type="button"
                        onClick={() => switchManualStep(item.step)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all duration-300 ease-out cursor-pointer border",
                          isCurrent
                            ? "bg-primary text-black font-semibold border-primary shadow-md shadow-primary/20 scale-[1.01]"
                            : item.done
                            ? "bg-surface-variant/70 text-green-400 hover:bg-surface-variant border-green-500/30 hover:border-green-500/50"
                            : "bg-surface-variant/40 text-on-surface-variant hover:bg-surface-variant/70 border-white/5 hover:text-on-surface hover:border-white/20"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold",
                          isCurrent ? "bg-black/20 text-black" : item.done ? "bg-green-500/20 text-green-400" : "bg-white/10 text-on-surface-variant"
                        )}>
                          {item.done && !isCurrent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[11px] leading-tight truncate", isCurrent ? "text-black font-bold" : "font-medium")}>
                            {item.title}
                          </p>
                          <p className={cn("text-[9px] leading-tight truncate opacity-80", isCurrent ? "text-black/80" : "text-on-surface-variant")}>
                            {item.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Nút Mũi Tên > (Bước tiếp theo) */}
                <button
                  type="button"
                  disabled={manualActiveStep >= 4}
                  onClick={() => switchManualStep(Math.min(4, manualActiveStep + 1))}
                  title={manualActiveStep >= 4 ? "Đang ở bước cuối cùng" : `Sang Bước ${manualActiveStep + 1}`}
                  className={cn(
                    "w-9 h-11 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 border cursor-pointer",
                    manualActiveStep >= 4
                      ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
                      : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
                  )}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Main Step Content */}
              <div className={cn("border-t border-white/5 pt-1 min-h-[320px] transition-all duration-300", isStepTransitioning ? "step-fade-exit" : "step-fade-enter")}>
                {/* Bước 1: Cấu hình tạo phụ đề Whisper */}
                {manualActiveStep === 1 && (
                <div key="manual-step-1" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                      <Mic className="w-4 h-4 text-primary" />
                      Bước 1: Tạo Phụ Đề Gốc (Faster-Whisper)
                    </h2>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                      Xuất file .SRT gốc
                    </span>
                  </div>

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
                      Mô hình Whisper AI:
                    </label>
                    <select
                      value={whisperModel}
                      onChange={(e) => setWhisperModel(e.target.value)}
                      className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors font-medium text-primary"
                    >
                      <option value="large-v3">🌟 large-v3 (Mặc định - 1.55 Tỷ tham số • Chuẩn xác cao nhất)</option>
                      <option value="large-v3-turbo">🚀 large-v3-turbo (Siêu tốc 8x & Chuẩn xác)</option>
                      <option value="medium">⚡ medium (Cân bằng & Tốc độ cao)</option>
                      <option value="small">🚀 small (Nhẹ & Nhanh)</option>
                      <option value="base">⏱️ base (Bản tối giản)</option>
                    </select>
                  </div>
                </div>

                {/* ⚙️ Bảng Tùy Chỉnh Nhận Diện Nâng Cao (Mở rộng / Thu nhỏ) */}
                <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/20 transition-all">
                  <button
                    type="button"
                    onClick={() => setShowTranscribeAdvanced(!showTranscribeAdvanced)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      ⚙️ Tùy Chỉnh Bóc Tách Nâng Cao (Độ nhạy VAD, Đệm từ, Chống nuốt chữ)
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                      {showTranscribeAdvanced ? "Thu nhỏ" : "Mở rộng"}
                      {showTranscribeAdvanced ? (
                        <ChevronUp className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-cyan-400" />
                      )}
                    </span>
                  </button>

                  {/* Curtain slide-down container */}
                  <div className={cn("curtain-collapse", showTranscribeAdvanced && "curtain-expanded")}>
                    <div className="curtain-inner">
                      <div className="p-4 border-t border-white/10 space-y-4 bg-black/20 text-xs">
                      {/* VAD Threshold */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="font-medium text-on-surface flex items-center gap-1.5">
                            <Volume2 className="w-3.5 h-3.5 text-primary" />
                            Độ nhạy bắt giọng nói (VAD Threshold):
                          </label>
                          <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                            {vadThreshold.toFixed(2)} {vadThreshold <= 0.30 ? "(Siêu nhạy - Bắt cả tiếng thì thầm)" : vadThreshold <= 0.40 ? "(Cân bằng tối ưu)" : "(Chặt chẽ)"}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.15"
                          max="0.65"
                          step="0.05"
                          value={vadThreshold}
                          onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
                          className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                        <p className="text-[10px] text-on-surface-variant/70">
                          💡 <em>Kéo về bên trái (0.20 - 0.35)</em> để bắt trọn những câu thoại nói nhỏ, nói thầm, nói lướt hoặc có nhạc nền đè lên.
                        </p>
                      </div>

                      {/* Grid: Speech Pad & Min Silence Duration */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                        {/* Speech Pad */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="font-medium text-on-surface flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-cyan-400" />
                              Đệm mở rộng câu (Pad):
                            </label>
                            <span className="font-mono text-[11px] font-bold text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                              {speechPadMs}ms
                            </span>
                          </div>
                          <input
                            type="range"
                            min="100"
                            max="700"
                            step="50"
                            value={speechPadMs}
                            onChange={(e) => setSpeechPadMs(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                          />
                          <p className="text-[10px] text-on-surface-variant/70">
                            Tăng lên 400ms - 500ms để không bao giờ bị cắt cụt chữ đầu và chữ cuối câu.
                          </p>
                        </div>

                        {/* Min Silence Duration */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="font-medium text-on-surface flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-emerald-400" />
                              Khoảng lặng ngắt câu (Min Silence):
                            </label>
                            <span className="font-mono text-[11px] font-bold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              {minSilenceDurationMs}ms
                            </span>
                          </div>
                          <input
                            type="range"
                            min="300"
                            max="2000"
                            step="100"
                            value={minSilenceDurationMs}
                            onChange={(e) => setMinSilenceDurationMs(parseInt(e.target.value))}
                            className="w-full accent-emerald-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                          />
                          <p className="text-[10px] text-on-surface-variant/70">
                            Đặt 800ms - 1200ms để không nuốt đoạn thoại khi diễn viên ngắt nghỉ lấy hơi giữa câu (chống nuốt 8s).
                          </p>
                        </div>
                      </div>

                      {/* Grid: Min Speech Duration & Beam Size */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/5 items-center">
                        {/* Min Speech Duration */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="font-medium text-on-surface flex items-center gap-1">
                              <Scissors className="w-3.5 h-3.5 text-amber-400" />
                              Thời lượng ngắn nhất:
                            </label>
                            <span className="font-mono text-[11px] font-bold text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded">
                              {minSpeechDurationMs}ms
                            </span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="500"
                            step="50"
                            value={minSpeechDurationMs}
                            onChange={(e) => setMinSpeechDurationMs(parseInt(e.target.value))}
                            className="w-full accent-amber-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                          />
                          <p className="text-[10px] text-on-surface-variant/70">
                            Giảm xuống 100ms - 150ms để bắt được cả các từ ngắn như "ừ", "hả", tiếng cảm thán.
                          </p>
                        </div>

                        {/* Beam Size */}
                        <div>
                          <label className="font-medium text-on-surface block mb-1">
                            Độ sâu dò từ (Beam Size):
                          </label>
                          <select
                            value={beamSize}
                            onChange={(e) => setBeamSize(parseInt(e.target.value))}
                            className="w-full bg-surface-variant/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                          >
                            <option value="1">1 (Tốc độ tối đa - Nhanh nhất)</option>
                            <option value="3">3 (Cân bằng chuẩn - Khuyên dùng)</option>
                            <option value="5">5 (Độ chính xác sâu nhất)</option>
                          </select>
                          <p className="text-[10px] text-on-surface-variant/70 mt-1">
                            Dò tìm nhiều nhánh từ đồng âm để chọn kết quả chính xác nhất.
                          </p>
                        </div>
                      </div>

                      {/* 🔄 Nút Phục Hồi Mặc Định */}
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[11px] text-on-surface-variant/70">
                          💡 Chuẩn khuyến nghị: <code>large-v3</code>, <code>VAD 0.35</code>, <code>Pad 400ms</code>, <code>Silence 1000ms</code>.
                        </span>
                        <button
                          type="button"
                          onClick={handleResetTranscribeDefaults}
                          className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Phục hồi mặc định
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

                <button
                  type="button"
                  onClick={handleStartManualTranscribe}
                  disabled={!videoFile || isProcessing || isOriginalSrtReady}
                  title={
                    !videoFile
                      ? "Vui lòng tải video lên trước"
                      : isProcessing
                      ? "Đang tạo phụ đề Whisper..."
                      : isOriginalSrtReady
                      ? "Đã hoàn thành tạo phụ đề gốc cho video này. Tải video mới lên để tạo lại từ đầu."
                      : "Bắt đầu bóc tách âm thanh và tạo file phụ đề gốc bằng Faster-Whisper"
                  }
                  className={cn(
                    "w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg",
                    !videoFile || isProcessing || isOriginalSrtReady
                      ? "bg-surface-variant/40 text-on-surface-variant/60 cursor-not-allowed opacity-60 border border-white/5"
                      : "bg-gradient-to-r from-primary to-primary/80 text-black hover:opacity-90 active:scale-[0.99] cursor-pointer"
                  )}
                >
                  {isProcessing && taskStatus?.current_step === "transcribing"
                    ? `Đang tạo phụ đề Whisper (${taskStatus?.progress || 0}%)...`
                    : isOriginalSrtReady
                    ? "Đã Hoàn Thành Tạo Phụ Đề Gốc"
                    : "Bắt Đầu Tạo Phụ Đề Gốc"}
                </button>
              </div>
              )}

              {/* Bước 2: Xuất file SRT gốc & Dịch thủ công bên ngoài */}
              {manualActiveStep === 2 && (
              <div key="manual-step-2" className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                    <Download className="w-4 h-4 text-secondary" />
                    Bước 2: Xuất File Phụ Đề Gốc & Dịch Bên Ngoài
                  </h2>
                  {isTranscribingOriginal ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1.5 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang tạo phụ đề ({taskStatus?.progress || 0}%)...
                    </span>
                  ) : isOriginalSrtReady ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Đã sẵn sàng tải SRT gốc
                    </span>
                  ) : (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/5 text-on-surface-variant/70 border border-white/10 font-medium">
                      Chưa tạo phụ đề
                    </span>
                  )}
                </div>

                <p className="text-xs text-on-surface-variant">
                  Sau khi bóc tách xong, bạn có thể <strong>Sao chép phụ đề đã ghép sẵn Prompt mẫu</strong> để dán trực tiếp vào AI (ChatGPT / Claude / DeepL) hoặc tải file <code className="text-primary font-mono font-semibold">.txt / .srt</code> về máy để biên dịch.
                </p>

                {/* Accordion: Tùy chỉnh Quy tắc AI khi dịch (Prompt AI) */}
                <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/20 transition-all">
                  <button
                    type="button"
                    onClick={() => setShowPromptPreview(!showPromptPreview)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      ⚙️ Quy tắc AI khi dịch (Tùy chỉnh Prompt cho ChatGPT / Claude / DeepL)
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                      {showPromptPreview ? "Thu nhỏ" : "Mở rộng để sửa"}
                      {showPromptPreview ? (
                        <ChevronUp className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-cyan-400" />
                      )}
                    </span>
                  </button>

                  {/* Curtain slide-down container */}
                  <div className={cn("curtain-collapse", showPromptPreview && "curtain-expanded")}>
                    <div className="curtain-inner">
                      <div className="p-3.5 border-t border-white/10 bg-black/30 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-on-surface-variant font-medium">
                            💡 Bạn có thể dán hoặc chỉnh sửa quy tắc dịch thuật theo ý muốn (hệ thống sẽ tự ghi nhớ):
                          </span>
                          <button
                            type="button"
                            onClick={handleResetCustomPrompt}
                            className="px-2 py-0.5 rounded-lg bg-surface-variant/60 hover:bg-surface-variant text-[10px] text-on-surface-variant hover:text-on-surface border border-white/10 cursor-pointer"
                            title="Khôi phục về prompt chuẩn ban đầu"
                          >
                            Khôi phục mặc định
                          </button>
                        </div>
                        <textarea
                          value={customTranslationPrompt}
                          onChange={(e) => handleUpdateCustomPrompt(e.target.value)}
                          rows={6}
                          className="w-full text-xs font-mono bg-surface/80 border border-white/10 rounded-xl p-3 text-on-surface focus:outline-none focus:border-cyan-400 resize-y leading-relaxed"
                          placeholder="Nhập hoặc dán các quy tắc yêu cầu AI dịch vào đây..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Nút 1: Sao Chép Kèm Prompt AI */}
                  <button
                    type="button"
                    onClick={() => handleCopyOriginalSrt(true)}
                    disabled={!isOriginalSrtReady || isTranscribingOriginal || isCopyingOriginalSrt}
                    className={cn(
                      "py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                      isOriginalSrtReady && !isTranscribingOriginal
                        ? "bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-primary"
                        : "bg-white/5 text-on-surface-variant/50 border-white/5 cursor-not-allowed opacity-50"
                    )}
                    title="Sao chép toàn bộ Prompt và Phụ đề vào Clipboard để dán trực tiếp vào ChatGPT / Claude / DeepL"
                  >
                    {isCopyingOriginalSrt ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span>Đang sao chép...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span>📋 Sao Chép Kèm Prompt AI</span>
                      </>
                    )}
                  </button>

                  {/* Nút 2: Tải File TXT Kèm Prompt */}
                  <button
                    type="button"
                    onClick={handleDownloadOriginalPromptTxt}
                    disabled={!isOriginalSrtReady || isTranscribingOriginal}
                    className={cn(
                      "py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                      isOriginalSrtReady && !isTranscribingOriginal
                        ? "bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-cyan-300"
                        : "bg-white/5 text-on-surface-variant/50 border-white/5 cursor-not-allowed opacity-50"
                    )}
                    title="Tải file văn bản .txt đã ghép sẵn Prompt yêu cầu dịch và nội dung phụ đề"
                  >
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span>📄 Tải File Kèm Prompt (.TXT)</span>
                  </button>

                  {/* Nút 3: Tải File SRT Gốc Thuần */}
                  <button
                    type="button"
                    onClick={handleDownloadOriginalSrt}
                    disabled={!isOriginalSrtReady || isTranscribingOriginal}
                    className={cn(
                      "py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                      isOriginalSrtReady && !isTranscribingOriginal
                        ? "bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-secondary"
                        : "bg-white/5 text-on-surface-variant/50 border-white/5 cursor-not-allowed opacity-50"
                    )}
                    title="Tải file phụ đề câu thoại gốc .srt về máy tính"
                  >
                    <Download className="w-4 h-4 text-secondary" />
                    <span>📥 Tải File .SRT Gốc</span>
                  </button>
                </div>

                {/* 🎧 Mở thư mục chứa Vocals (Giọng nói sạch) & Nhạc nền BGM tách bởi Demucs AI */}
                {isOriginalSrtReady && !isTranscribingOriginal && (
                  <button
                    type="button"
                    onClick={handleOpenFolder}
                    disabled={isOpeningFolder}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-cyan-300 mt-3"
                    title="Mở thư mục trên máy tính chứa file giọng nói sạch Vocals và Nhạc nền đã bóc tách"
                  >
                    {isOpeningFolder ? (
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                    ) : (
                      <FolderOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                    )}
                    <span>Mở âm thanh tách Vocal</span>
                  </button>
                )}
              </div>
              )}

              {/* Bước 3: Nạp file SRT đã dịch */}
              {manualActiveStep === 3 && (
              <div key="manual-step-3" className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                    <FileEdit className="w-4 h-4 text-amber-400" />
                    Bước 3: Nạp Lại Phụ Đề Đã Dịch
                  </h2>
                  {manualUploadedCount !== null ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Đã nhận {manualUploadedCount} câu phụ đề
                    </span>
                  ) : isTranscribingOriginal ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                      Đang chờ tạo phụ đề...
                    </span>
                  ) : null}
                </div>

                {/* Tab chuyển đổi giữa Dán Text trực tiếp (Bên trái) và Tải File .SRT (Bên phải) */}
                <div className="flex p-1 bg-surface-variant/40 rounded-xl border border-white/5 gap-1">
                  <button
                    type="button"
                    onClick={() => setManualSrtMode("text")}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                      manualSrtMode === "text"
                        ? "bg-surface-variant/90 text-primary border-primary/40 shadow-sm"
                        : "bg-transparent text-on-surface-variant hover:text-on-surface border-transparent hover:bg-white/5"
                    )}
                  >
                    <Clipboard className="w-3.5 h-3.5 text-primary" />
                    <span>📋 Dán văn bản (Copy/Paste)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualSrtMode("file")}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                      manualSrtMode === "file"
                        ? "bg-surface-variant/90 text-primary border-primary/40 shadow-sm"
                        : "bg-transparent text-on-surface-variant hover:text-on-surface border-transparent hover:bg-white/5"
                    )}
                  >
                    <Upload className="w-3.5 h-3.5 text-primary" />
                    <span>📁 Tải file .SRT</span>
                  </button>
                </div>

                {/* Chế độ 1: Tải file .SRT */}
                {manualSrtMode === "file" && (
                  <div className="space-y-2">
                    <input
                      ref={manualSrtFileInputRef}
                      type="file"
                      accept=".srt"
                      className="hidden"
                      disabled={isTranscribingOriginal}
                      onChange={handleManualSrtFileChange}
                    />

                    <div
                      onClick={() => {
                        if (!isTranscribingOriginal) {
                          manualSrtFileInputRef.current?.click();
                        } else {
                          toast.info("Vui lòng chờ tạo phụ đề thoại xong trước khi nạp file dịch.");
                        }
                      }}
                      className={cn(
                        "border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all group",
                        isTranscribingOriginal
                          ? "border-white/10 bg-surface-variant/10 opacity-50 cursor-not-allowed"
                          : "border-white/15 hover:border-primary/50 cursor-pointer bg-surface-variant/40 hover:bg-surface-variant/60 shadow-sm"
                      )}
                    >
                      {isUploadingManualSrt ? (
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                      )}
                      <p className="text-xs font-medium text-on-surface text-center">
                        {isUploadingManualSrt
                          ? "Đang phân tích cú pháp file SRT..."
                          : manualSrtFile
                          ? manualSrtFile.name
                          : isTranscribingOriginal
                          ? "Tạm thời khóa khi đang tạo phụ đề video..."
                          : "Nhấp để chọn hoặc kéo thả file .SRT đã dịch vào đây"}
                      </p>
                      {manualSrtFile && !isUploadingManualSrt ? (
                        <p className="text-[11px] text-green-400 font-medium">
                          ✅ Đã nạp: {manualSrtFile.name} ({(manualSrtFile.size / 1024).toFixed(1)} KB)
                        </p>
                      ) : (
                        <p className="text-[10px] text-on-surface-variant">
                          Chấp nhận file định dạng SubRip (.srt) chuẩn UTF-8
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Chế độ 2: Dán trực tiếp văn bản SRT / Copy từ ChatGPT/Xoppy/Notepad */}
                {manualSrtMode === "text" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePasteFromClipboard}
                          className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5" />
                          <span>Dán từ Clipboard</span>
                        </button>
                        {manualSrtText && (
                          <button
                            type="button"
                            onClick={() => setManualSrtText("")}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-on-surface-variant hover:text-rose-400 border border-white/10 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa</span>
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-on-surface-variant">
                        {manualSrtText ? `${manualSrtText.split("\n").length} dòng • ${manualSrtText.length} ký tự` : "Hỗ trợ định dạng SRT chuẩn"}
                      </span>
                    </div>

                    <textarea
                      value={manualSrtText}
                      onChange={(e) => setManualSrtText(e.target.value)}
                      placeholder={`1\n00:00:01,000 --> 00:00:04,500\nXin chào các bạn, đây là phụ đề đã dịch...\n\n2\n00:00:05,000 --> 00:00:08,200\nNội dung câu tiếp theo...`}
                      rows={7}
                      className="w-full bg-surface-variant/40 border border-white/10 focus:border-primary rounded-xl p-3 text-xs font-mono text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none transition-colors resize-y leading-relaxed"
                    />

                    <button
                      type="button"
                      disabled={isUploadingManualSrt || !manualSrtText.trim()}
                      onClick={handleManualSrtTextSubmit}
                      className={cn(
                        "w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm",
                        !manualSrtText.trim()
                          ? "bg-white/5 text-on-surface-variant/40 border border-white/5 cursor-not-allowed"
                          : "bg-primary text-on-primary hover:bg-primary/90 hover:shadow-primary/25"
                      )}
                    >
                      {isUploadingManualSrt ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Đang phân tích cú pháp phụ đề...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Áp Dụng Nội Dung Phụ Đề Này</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* Bước 4: Cấu hình Giọng đọc & Tiếp tục Lồng tiếng */}
              {manualActiveStep === 4 && (
              <div id="manual-step-4-card" key="manual-step-4" className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    Bước 4: Cấu Hình Giọng Lồng Tiếng & Hoàn Tất Video
                  </h2>
                  {manualUploadedCount !== null && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
                      Đã nạp {manualUploadedCount} câu phụ đề
                    </span>
                  )}
                </div>

                {/* Chọn Giọng Đọc Lồng Tiếng */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                    <span>Giọng đọc AI lồng tiếng:</span>
                    <span className="text-[11px] text-primary">{voices.length} giọng sẵn sàng</span>
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
                    <optgroup label="🌐 Giọng Đọc Chuẩn Edge-TTS">
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

                {/* Tùy chỉnh Phụ Đề & Âm Thanh Nền Nâng Cao (Accordion đồng nhất) */}
                <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/20 transition-all">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                      ⚙️ Tùy Chỉnh Phụ Đề & Âm Thanh Nền (BGM / Âm Thanh Gốc / Tốc Độ)
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                      {showAdvanced ? "Thu nhỏ" : "Mở rộng"}
                      {showAdvanced ? (
                        <ChevronUp className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-cyan-400" />
                      )}
                    </span>
                  </button>

                  {/* Curtain slide-down container */}
                  <div className={cn("curtain-collapse", showAdvanced && "curtain-expanded")}>
                    <div className="curtain-inner">
                      <div className="p-4 border-t border-white/10 space-y-4 bg-black/20 text-xs">
                      {/* Chế độ phụ đề - Dạng Dropdown */}
                      <div className="space-y-1.5">
                        <label className="font-medium text-on-surface flex items-center gap-1.5">
                          <Subtitles className="w-3.5 h-3.5 text-primary" />
                          Kiểu gắn phụ đề (Subtitles):
                        </label>
                        <select
                          value={subtitleMode}
                          onChange={(e) => setSubtitleMode(e.target.value)}
                          className="w-full bg-surface-variant/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
                        >
                          <option value="hard_target">🔤 Phụ đề dịch (Hardsub tiếng Việt)</option>
                          <option value="hard_dual">🌐 Song ngữ (Gốc + Dịch song song)</option>
                          <option value="none">🚫 Không gắn phụ đề (Chỉ lồng tiếng)</option>
                        </select>
                      </div>

                      {/* Tùy chỉnh chi tiết phụ đề (Font Size, Vị trí MarginV) - Tự động ẩn khi Không gắn sub */}
                      {subtitleMode !== "none" && (
                        <div className="space-y-3 pt-2 border-t border-white/5 bg-surface-variant/30 p-3 rounded-2xl border border-white/5 animate-fadeIn">
                          {/* Kích thước chữ */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-on-surface-variant">
                              <span className="font-medium text-on-surface">Kích thước chữ phụ đề (Font Size):</span>
                              <span className="font-mono text-primary font-bold">{subtitleFontSize}px</span>
                            </div>
                            <input
                              type="range"
                              min="16"
                              max="36"
                              step="1"
                              value={subtitleFontSize}
                              onChange={(e) => setSubtitleFontSize(parseInt(e.target.value))}
                              className="w-full accent-primary cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-on-surface-variant/70">
                              <span>16px (Nhỏ)</span>
                              <span className="text-primary font-semibold">Mặc định: 20px</span>
                              <span>36px (Lớn)</span>
                            </div>
                          </div>

                          {/* Vị trí hiển thị */}
                          <div className="space-y-1.5 pt-2 border-t border-white/5">
                            <label className="font-medium text-on-surface flex items-center justify-between text-xs">
                              <span>Vị trí hiển thị phụ đề:</span>
                              <span className="text-[10px] text-primary font-bold">
                                {subtitlePosition === "bottom" ? "Dưới đáy" : subtitlePosition === "middle" ? "Giữa màn hình" : "Trên cùng"}
                              </span>
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { id: "bottom", label: "⬇️ Dưới đáy" },
                                { id: "middle", label: "⏹️ Giữa màn hình" },
                                { id: "top", label: "⬆️ Trên cùng" },
                              ].map((pos) => (
                                <button
                                  key={pos.id}
                                  type="button"
                                  onClick={() => setSubtitlePosition(pos.id as any)}
                                  className={cn(
                                    "py-1.5 px-2 rounded-xl text-xs font-medium border transition-all text-center cursor-pointer",
                                    subtitlePosition === pos.id
                                      ? "bg-primary text-black border-primary font-bold shadow-md"
                                      : "bg-surface-variant/40 text-on-surface-variant border-white/5 hover:border-white/20"
                                  )}
                                >
                                  {pos.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Chuẩn Video Đầu Ra (Resolution) - Dạng Dropdown */}
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <label className="font-medium text-on-surface flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-primary" />
                          Độ phân giải video đầu ra:
                        </label>
                        <select
                          value={outputResolution}
                          onChange={(e) => setOutputResolution(e.target.value)}
                          className="w-full bg-surface-variant/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
                        >
                          <option value="original">📐 Giữ nguyên độ phân giải gốc</option>
                          <option value="1080p">📺 1080p (Full HD sắc nét)</option>
                          <option value="720p">💻 720p (HD tiêu chuẩn - Tối ưu xuất nhanh)</option>
                          <option value="480p">📱 480p (SD Siêu nhẹ)</option>
                        </select>
                      </div>

                      {/* Âm thanh nền ghép cùng thuyết minh - Dạng Dropdown */}
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <label className="font-medium text-on-surface flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5 text-secondary" />
                          Kiểu âm thanh nền ghép cùng thuyết minh:
                        </label>
                        <select
                          value={!preserveBgm ? "none" : bgmType}
                          onChange={(e) => {
                            const val = e.target.value as "bgm" | "original" | "none";
                            setBgmType(val);
                            setPreserveBgm(val !== "none");
                          }}
                          className="w-full bg-surface-variant/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary transition-colors cursor-pointer"
                        >
                          <option value="bgm">🎵 Nhạc nền tách (Lọc sạch vocal cũ - Demucs)</option>
                          <option value="original">🎙️ Âm thanh gốc (Giữ nguyên gốc - Thuyết minh đè lên)</option>
                          <option value="none">🔇 Tắt hẳn nhạc nền (Chỉ giữ giọng đọc AI)</option>
                        </select>

                        {bgmType !== "none" && preserveBgm && (
                          <div className="space-y-1.5 pl-3 border-l-2 border-secondary/40 pt-1">
                            <div className="flex justify-between text-xs text-on-surface-variant">
                              <span>Âm lượng {bgmType === "original" ? "âm thanh gốc" : "nhạc nền"}:</span>
                              <span className="font-semibold text-secondary font-mono">{Math.round(bgmVolume * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0.0"
                              max="1.0"
                              step="0.01"
                              value={bgmVolume}
                              onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                              className="w-full accent-secondary cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-on-surface-variant/70">
                              <span>0%</span>
                              <span className="text-secondary font-semibold">Mặc định: 30%</span>
                              <span>100% (Cho video âm thanh nhỏ)</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Tốc độ đọc AI */}
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <label className="font-medium text-on-surface block">
                          Tốc độ đọc mặc định:
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
                      <div className="space-y-1 pt-2 border-t border-white/5">
                        <div className="flex justify-between text-xs text-on-surface-variant">
                          <span className="font-medium text-on-surface">Tốc độ đọc tăng tối đa (SpeedRate):</span>
                          <span className="font-mono text-primary font-bold">{maxSpeedRate}x</span>
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

                      {/* 🔄 Nút Phục Hồi Mặc Định */}
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[11px] text-on-surface-variant/70">
                          💡 Chuẩn khuyến nghị: <code>Phụ đề dịch</code>, <code>720p</code>, <code>BGM 30%</code>, <code>Tốc độ +0%</code>.
                        </span>
                        <button
                          type="button"
                          onClick={handleResetAudioSubtitleDefaults}
                          className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Phục hồi mặc định
                        </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA Button Tiếp Tục Lồng Tiếng & Render */}
                <button
                  onClick={handleResumeManualPipeline}
                  disabled={(!taskStatus?.task_id && !taskId) || isProcessing || !isOriginalSrtReady || taskStatus?.status === "completed"}
                  title={
                    (!taskStatus?.task_id && !taskId) || !isOriginalSrtReady
                      ? "Vui lòng hoàn thành các bước bóc tách và nạp phụ đề trước"
                      : isProcessing
                      ? "Đang tiến hành lồng tiếng & render video..."
                      : taskStatus?.status === "completed"
                      ? "Đã hoàn thành xuất video. Nạp video mới để thực hiện tác vụ mới."
                      : "Bắt đầu lồng tiếng và render video thành phẩm"
                  }
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 shadow-xl",
                    (!taskStatus?.task_id && !taskId) || isProcessing || !isOriginalSrtReady || taskStatus?.status === "completed"
                      ? "bg-surface-variant/40 text-on-surface-variant/60 cursor-not-allowed opacity-60 border border-white/5"
                      : "bg-gradient-to-r from-primary via-primary/90 to-primary text-black hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] shadow-primary/20 cursor-pointer"
                  )}
                >
                  {isProcessing && taskStatus?.current_step !== "transcribing"
                    ? `Đang lồng tiếng & render video (${taskStatus?.progress || 0}%)...`
                    : isTranscribingOriginal
                    ? "Đang chờ tạo phụ đề thoại xong..."
                    : taskStatus?.status === "completed"
                    ? "Đã Hoàn Thành Xuất Video"
                    : "Tiếp Tục Lồng Tiếng & Render Video"}
                </button>
              </div>
              )}
              </div>
            </div>
          )}
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

            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/90 border border-white/10 flex items-center justify-center group shadow-2xl">
              {taskStatus?.status === "completed" && taskStatus?.task_id ? (
                <>
                  {/* Layer 1: Video Gốc / Video Stream */}
                  <video
                    ref={resultVideoRef}
                    key={`result-${taskStatus.task_id}-${taskStatus.status}-${taskStatus.elapsed_time || ""}`}
                    src={`${API_BASE_URL}/api/video-translate/stream/${taskStatus.task_id}?t=${taskStatus.elapsed_time || Date.now()}`}
                    controls
                    playsInline
                    autoPlay
                    onTimeUpdate={handleVideoTimeUpdate}
                    className="w-full h-full object-contain"
                  />
                  {subtitleMode !== "none" && subtitleMode !== "off" && subtitleMode !== "no_sub" && currentLiveSubtitle && (
                    <div
                      className={cn(
                        "absolute left-4 right-4 flex justify-center pointer-events-none animate-fadeIn transition-all duration-200",
                        subtitlePosition === "top"
                          ? "top-8"
                          : subtitlePosition === "middle"
                          ? "top-1/2 -translate-y-1/2"
                          : "bottom-12"
                      )}
                    >
                      <div
                        style={{ fontSize: `${subtitleFontSize}px` }}
                        className="px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 text-white font-bold text-center shadow-2xl tracking-wide max-w-[90%] drop-shadow-md"
                      >
                        {currentLiveSubtitle}
                      </div>
                    </div>
                  )}
                </>
              ) : videoPreviewUrl ? (
                <video
                  ref={previewVideoRef}
                  key={`preview-${videoPreviewUrl}`}
                  src={videoPreviewUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                  onError={() => {
                    toast.warning(
                      "Trình duyệt không thể giải mã trực tiếp định dạng video này (có thể do codec MKV/HEVC). Bạn vẫn có thể bấm 'Bắt Đầu Dịch' để hệ thống xử lý bình thường!"
                    );
                  }}
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
              <div className="space-y-4 pt-2 animate-fadeIn">
                {/* 1. Hàng nút tải về & Mở thư mục */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadFile(
                        taskStatus.task_id,
                        "video",
                        `${(videoFile?.name || (taskStatus as any)?.video_filename || "Video").replace(/\.[^/.]+$/, "")} Translate buy KhaTran.mp4`
                      )
                    }
                    className="py-3 px-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-95 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-green-500/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-black shrink-0" />
                    <span>Tải Video (MP4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenFolder}
                    disabled={isOpeningFolder}
                    className="py-3 px-2 rounded-xl bg-surface-variant/80 hover:bg-surface-variant text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
                    title="Mở thư mục chứa file MP4 trên máy tính (Windows Explorer)"
                  >
                    {isOpeningFolder ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                    )}
                    <span>📁 Mở Thư Mục</span>
                  </button>
                </div>

                {/* 2. Studio Xem Lại & Thuyết Minh Thời Gian Thực (Interactive Timeline & In-Place Redub) */}
                <div className="rounded-3xl bg-surface/90 border border-white/10 shadow-xl overflow-hidden transition-all duration-300">
                  {/* Studio Header - Dạng Sổ Xuống (Accordion Collapsible) */}
                  <div
                    onClick={() => setIsStudioOpen(!isStudioOpen)}
                    className="p-4 flex items-center justify-between flex-wrap gap-2 cursor-pointer select-none bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-b border-white/5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-primary/20 text-primary">
                        <Sparkles className="w-4 h-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                          <span>Xem Lại & Chỉnh Sửa Lời Thoại</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-mono">
                            {studioSegments.length > 0 ? `${studioSegments.length} câu` : "Thời gian thực"}
                          </span>
                        </h3>
                        <p className="text-[11px] text-on-surface-variant">
                          {isStudioOpen
                            ? "💡 Đang mở bảng chỉnh sửa câu thoại theo vị trí video phát"
                            : "👉 Nhấp vào đây để sổ bảng xem lại & sửa câu thoại"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant font-medium">
                        {isStudioOpen ? "Thu gọn" : "Mở chỉnh sửa"}
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-on-surface-variant">
                        {isStudioOpen ? (
                          <ChevronUp className="w-4 h-4 text-primary" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Nội dung bên trong khi xổ ra (Hiệu ứng kéo màn từ trên xuống) */}
                  <div className={cn("curtain-collapse", isStudioOpen && "curtain-expanded")}>
                    <div className="curtain-inner">
                      <div className="p-4 space-y-4">
                      {/* Status Banner */}
                      {studioRemuxMessage && (
                        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs flex items-center justify-between">
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

                      {/* Header điều khiển: Chuyển chế độ xem & Nạp lại */}
                      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
                        <div className="flex items-center p-1 bg-surface-variant/40 rounded-xl border border-white/5 gap-1">
                          <button
                            type="button"
                            onClick={() => setStudioViewMode("current")}
                            className={cn(
                              "py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                              studioViewMode === "current"
                                ? "bg-primary text-black shadow-sm font-bold"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                            )}
                          >
                            <span>🎯 Câu tại vị trí video đang phát</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudioViewMode("all")}
                            className={cn(
                              "py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                              studioViewMode === "all"
                                ? "bg-primary text-black shadow-sm font-bold"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                            )}
                          >
                            <span>📋 Xem tất cả ({filteredStudioSegments.length})</span>
                          </button>
                        </div>

                        {taskStatus?.task_id && (
                          <button
                            type="button"
                            onClick={() => fetchStudioSegments(taskStatus.task_id)}
                            disabled={isLoadingStudioSegments}
                            className="px-3 py-1.5 rounded-xl bg-surface-variant/60 hover:bg-surface-variant text-on-surface text-xs flex items-center gap-1.5 border border-white/10 cursor-pointer shrink-0 disabled:opacity-50"
                            title="Tải lại danh sách câu thoại"
                          >
                            {isLoadingStudioSegments ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5 text-primary" />
                            )}
                            <span>Nạp lại</span>
                          </button>
                        )}
                      </div>

                      {/* Nạp dữ liệu hoặc thông báo rỗng */}
                      {isLoadingStudioSegments && studioSegments.length === 0 ? (
                        <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-xs">
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          <span>Đang nạp dữ liệu timeline studio...</span>
                        </div>
                      ) : studioSegments.length === 0 ? (
                        <div className="py-6 text-center text-xs text-on-surface-variant">
                          Chưa có dữ liệu câu thoại cho video này.
                        </div>
                      ) : studioViewMode === "current" ? (
                        /* CHẾ ĐỘ 1: Chỉ hiển thị câu thoại tại vị trí video đang phát với nút < > chuyển câu */
                        (() => {
                          const currentActiveSeg =
                            filteredStudioSegments.find((s) => s.id === activeStudioSegmentId) ||
                            filteredStudioSegments[0] ||
                            null;
                          const currentActiveIndex = currentActiveSeg
                            ? filteredStudioSegments.findIndex((s) => s.id === currentActiveSeg.id)
                            : -1;

                          if (!currentActiveSeg) {
                            return (
                              <div className="py-6 text-center text-xs text-on-surface-variant">
                                Không tìm thấy câu thoại phù hợp.
                              </div>
                            );
                          }

                          const isPlayingAudio = playingAudioSegId === currentActiveSeg.id;

                          return (
                            <div className="space-y-3">
                              {/* Thanh điều hướng câu thoại với nút < và > */}
                              <div className="bg-surface-variant/30 border border-white/10 rounded-2xl p-2 flex items-center justify-between gap-2">
                                {/* Nút Mũi Tên < (Câu trước) */}
                                <button
                                  type="button"
                                  disabled={currentActiveIndex <= 0}
                                  onClick={() => {
                                    if (currentActiveIndex > 0) {
                                      const prevSeg = filteredStudioSegments[currentActiveIndex - 1];
                                      handleSeekToSegment(prevSeg);
                                    }
                                  }}
                                  title={
                                    currentActiveIndex <= 0
                                      ? "Đang ở câu thoại đầu tiên"
                                      : `Xem câu trước (#${filteredStudioSegments[currentActiveIndex - 1]?.id})`
                                  }
                                  className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 border cursor-pointer",
                                    currentActiveIndex <= 0
                                      ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
                                      : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
                                  )}
                                >
                                  <ChevronLeft className="w-5 h-5" />
                                </button>

                                {/* Thông tin vị trí câu thoại đang chọn */}
                                <div className="flex items-center gap-2 text-center min-w-0">
                                  <span className="text-xs font-bold text-primary font-mono px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                                    Câu #{currentActiveSeg.id} ({currentActiveIndex + 1}/{filteredStudioSegments.length})
                                  </span>
                                  <span className="text-[11px] font-mono text-on-surface-variant hidden sm:inline">
                                    [{formatSrtTime(currentActiveSeg.start)} ➔ {formatSrtTime(currentActiveSeg.end)}]
                                  </span>
                                </div>

                                {/* Nút Mũi Tên > (Câu tiếp) */}
                                <button
                                  type="button"
                                  disabled={
                                    currentActiveIndex >= filteredStudioSegments.length - 1 ||
                                    currentActiveIndex === -1
                                  }
                                  onClick={() => {
                                    if (currentActiveIndex < filteredStudioSegments.length - 1) {
                                      const nextSeg = filteredStudioSegments[currentActiveIndex + 1];
                                      handleSeekToSegment(nextSeg);
                                    }
                                  }}
                                  title={
                                    currentActiveIndex >= filteredStudioSegments.length - 1
                                      ? "Đang ở câu thoại cuối cùng"
                                      : `Xem câu tiếp theo (#${filteredStudioSegments[currentActiveIndex + 1]?.id})`
                                  }
                                  className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 border cursor-pointer",
                                    currentActiveIndex >= filteredStudioSegments.length - 1 ||
                                    currentActiveIndex === -1
                                      ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
                                      : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
                                  )}
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                              </div>

                              {/* Thẻ chỉnh sửa chi tiết câu thoại hiện tại */}
                              <div key={`studio-active-seg-${currentActiveSeg.id}`} className="p-4 rounded-2xl border border-primary/30 bg-surface-variant/40 space-y-3 shadow-lg step-transition">
                                {/* Top Controls */}
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleSeekToSegment(currentActiveSeg)}
                                      className="text-xs font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer font-bold px-2 py-1 rounded-lg bg-primary/10 border border-primary/20"
                                      title="Tua video đến mốc này và phát"
                                    >
                                      <Play className="w-3 h-3 text-primary fill-primary" />
                                      <span>
                                        {formatSrtTime(currentActiveSeg.start)} ➔ {formatSrtTime(currentActiveSeg.end)}
                                      </span>
                                    </button>
                                    {currentActiveSeg.audio_duration ? (
                                      <span className="text-[11px] text-on-surface-variant/70 font-mono">
                                        ({currentActiveSeg.audio_duration.toFixed(1)}s)
                                      </span>
                                    ) : null}
                                  </div>

                                  {/* Tinh chỉnh mốc thời gian bắt đầu */}
                                  <div className="flex items-center gap-1 bg-black/40 px-2.5 py-1 rounded-lg border border-white/10">
                                    <span className="text-[11px] text-on-surface-variant font-medium">Bắt đầu:</span>
                                    <button
                                      type="button"
                                      onClick={() => handleAdjustSegmentStart(currentActiveSeg, -0.1)}
                                      className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                      title="Lùi mốc bắt đầu 0.1 giây"
                                    >
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="font-mono text-xs text-primary font-bold px-1">
                                      {currentActiveSeg.start.toFixed(1)}s
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleAdjustSegmentStart(currentActiveSeg, +0.1)}
                                      className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                      title="Tiến mốc bắt đầu 0.1 giây"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Câu gốc tiếng nước ngoài (nếu có) */}
                                {currentActiveSeg.original_text && (
                                  <div className="text-xs font-mono text-amber-300/80 bg-black/40 px-3 py-1.5 rounded-xl border border-amber-500/10">
                                    <span className="text-amber-400 font-medium">Gốc: </span>
                                    {currentActiveSeg.original_text}
                                  </div>
                                )}

                                {/* Textarea Sửa Văn Bản */}
                                <div className="space-y-2">
                                  <label className="text-[11px] font-medium text-on-surface-variant flex items-center justify-between">
                                    <span>Nội dung câu thoại tiếng Việt:</span>
                                    <span className="text-[10px] text-primary">Tự động đồng bộ</span>
                                  </label>
                                  <textarea
                                    value={currentActiveSeg.text}
                                    onChange={(e) => updateStudioSegmentText(currentActiveSeg.id, e.target.value)}
                                    onBlur={() =>
                                      handleSyncSegmentUpdate(
                                        currentActiveSeg.id,
                                        currentActiveSeg.text,
                                        currentActiveSeg.start,
                                        currentActiveSeg.end
                                      )
                                    }
                                    rows={3}
                                    className="w-full text-xs bg-black/60 border border-white/10 rounded-xl p-3 text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed font-sans"
                                    placeholder="Nhập hoặc chỉnh sửa câu thoại tiếng Việt..."
                                  />
                                </div>

                                {/* Hàng nút hành động: Nghe thử, Thu lại, Thêm, Xóa */}
                                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                                  <div className="flex items-center gap-1.5">
                                    {currentActiveSeg.audio_url && (
                                      <button
                                        type="button"
                                        onClick={() => handlePlaySegmentAudio(currentActiveSeg.id, currentActiveSeg.audio_url)}
                                        className={cn(
                                          "px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer",
                                          isPlayingAudio
                                            ? "bg-primary text-black border-primary font-bold animate-pulse"
                                            : "bg-white/5 hover:bg-white/10 text-on-surface border-white/10"
                                        )}
                                      >
                                        <Volume2 className="w-3.5 h-3.5 text-primary" />
                                        <span>{isPlayingAudio ? "Đang phát..." : "Nghe thử"}</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenAddSegment(
                                          currentActiveSeg.end,
                                          Math.round((currentActiveSeg.end + 2.5) * 10) / 10
                                        )
                                      }
                                      className="px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                                      title="Chèn câu thoại ngay sau câu này"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>+ Chèn</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStudioSegment(currentActiveSeg.id)}
                                      disabled={deletingSegId === currentActiveSeg.id}
                                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                      title="Xóa câu này khỏi video"
                                    >
                                      {deletingSegId === currentActiveSeg.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                      )}
                                      <span>Xóa</span>
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleRedubSingleSegment(currentActiveSeg)}
                                    disabled={currentActiveSeg.isRedubbing}
                                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-primary/30 to-amber-500/30 hover:from-primary/40 hover:to-amber-500/40 text-primary border border-primary/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                                    title="Tạo giọng mới cho câu này và cập nhật vào video"
                                  >
                                    {currentActiveSeg.isRedubbing ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                        <span>Đang thu...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Mic className="w-3.5 h-3.5 text-primary" />
                                        <span>⚡ Nạp Lại Lời Thoại Này</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        /* CHẾ ĐỘ 2: Xem toàn bộ danh sách câu thoại dạng cuộn */
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={studioSearch}
                            onChange={(e) => setStudioSearch(e.target.value)}
                            placeholder="🔍 Tìm kiếm nhanh câu thoại..."
                            className="w-full text-xs bg-surface-variant/40 border border-white/10 rounded-xl px-3 py-2 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
                          />

                          <div ref={transcriptContainerRef} className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                            {filteredStudioSegments.map((seg) => {
                              const isActive = activeStudioSegmentId === seg.id;
                              const isPlayingAudio = playingAudioSegId === seg.id;
                              return (
                                <div
                                  key={seg.id}
                                  id={`studio-seg-${seg.id}`}
                                  onClick={() => handlePlaySingleSegmentOnVideo(seg)}
                                  className={cn(
                                    "p-3 rounded-2xl border transition-all duration-200 space-y-2 cursor-pointer group",
                                    isActive
                                      ? "bg-primary/10 border-primary shadow-md shadow-primary/15 ring-1 ring-primary/40"
                                      : "bg-surface-variant/25 border-white/5 hover:border-primary/40 hover:bg-surface-variant/40"
                                  )}
                                  title="Nhấp vào đây để phát riêng đoạn video này và tự động dừng khi kết thúc"
                                >
                                  {/* Top row */}
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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
                                        title="Tua video đến mốc này và tiếp tục phát"
                                      >
                                        <Play className="w-3 h-3 text-primary fill-primary" />
                                        <span>
                                          {formatSrtTime(seg.start)} ➔ {formatSrtTime(seg.end)}
                                        </span>
                                      </button>
                                      {seg.audio_duration ? (
                                        <span className="text-[10px] text-on-surface-variant/70 font-mono">
                                          ({seg.audio_duration.toFixed(1)}s)
                                        </span>
                                      ) : null}
                                    </div>

                                    {/* Tinh chỉnh thời gian bắt đầu câu thoại (±0.1s) */}
                                    <div
                                      className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-white/10"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="text-[10px] text-on-surface-variant font-medium">Bắt đầu:</span>
                                      <button
                                        type="button"
                                        onClick={() => handleAdjustSegmentStart(seg, -0.1)}
                                        className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                        title="Lùi mốc bắt đầu 0.1 giây"
                                      >
                                        <Minus className="w-2.5 h-2.5" />
                                      </button>
                                      <span className="font-mono text-[11px] text-primary font-bold px-1">
                                        {seg.start.toFixed(1)}s
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleAdjustSegmentStart(seg, +0.1)}
                                        className="w-5 h-5 rounded bg-white/10 hover:bg-primary/20 text-on-surface hover:text-primary flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                        title="Tiến mốc bắt đầu 0.1 giây"
                                      >
                                        <Plus className="w-2.5 h-2.5" />
                                      </button>
                                    </div>

                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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

                                      <button
                                        type="button"
                                        onClick={() => handleRedubSingleSegment(seg)}
                                        disabled={seg.isRedubbing}
                                        className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                        title="Chỉ thu lại duy nhất câu này bằng giọng đọc AI"
                                      >
                                        {seg.isRedubbing ? (
                                          <>
                                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                            <span>Đang thu...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Mic className="w-3 h-3 text-primary" />
                                            <span>Thu lại</span>
                                          </>
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenAddSegment(seg.end, Math.round((seg.end + 2.5) * 10) / 10)
                                        }
                                        className="px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                                        title="Chèn thêm một câu thoại ngay sau câu này"
                                      >
                                        <Plus className="w-3 h-3 text-primary" />
                                        <span>+ Chèn</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteStudioSegment(seg.id)}
                                        disabled={deletingSegId === seg.id}
                                        className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                        title="Xóa câu này khỏi video"
                                      >
                                        {deletingSegId === seg.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                                        ) : (
                                          <Trash2 className="w-3 h-3 text-rose-400" />
                                        )}
                                        <span>Xóa</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Câu gốc tiếng Trung */}
                                  {seg.original_text && (
                                    <div className="text-[11px] font-mono text-amber-300/80 bg-black/30 px-2.5 py-1 rounded-lg border border-amber-500/10">
                                      <span className="text-amber-400 font-medium">Gốc: </span>
                                      {seg.original_text}
                                    </div>
                                  )}

                                  {/* Ô nhập câu dịch tiếng Việt */}
                                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                    <textarea
                                      value={seg.text}
                                      onChange={(e) => updateStudioSegmentText(seg.id, e.target.value)}
                                      onBlur={() => handleSyncSegmentUpdate(seg.id, seg.text, seg.start, seg.end)}
                                      rows={2}
                                      className="w-full text-xs bg-black/60 border border-white/10 rounded-xl p-2.5 text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed font-sans"
                                      placeholder="Nhập câu thoại tiếng Việt..."
                                    />
                                    <div className="flex items-center justify-between gap-2 pt-0.5">
                                      <span className="text-[10px] text-on-surface-variant/70">
                                        💡 Sửa văn bản xong bấm nút bên phải để nạp lại câu này
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleRedubSingleSegment(seg)}
                                        disabled={seg.isRedubbing}
                                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary/30 to-amber-500/30 hover:from-primary/40 hover:to-amber-500/40 text-primary border border-primary/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                                      >
                                        {seg.isRedubbing ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                            <span>Đang nạp...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Mic className="w-3.5 h-3.5 text-primary" />
                                            <span>⚡ Nạp Lại Lời Thoại Này</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                  {/* Phân vùng Chỉnh sửa phụ đề SRT & Lồng tiếng lại (Gộp chung trong Studio) */}
                  <div className="p-3.5 rounded-2xl bg-surface-variant/30 border border-primary/20 space-y-2.5 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <FileEdit className="w-3.5 h-3.5 text-primary" />
                        Chỉnh sửa phụ đề & Lồng tiếng lại toàn bộ:
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

                    <button
                      type="button"
                      onClick={() => handleRedub()}
                      disabled={isRedubbing || isProcessing}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-black text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                      title="Lồng tiếng và render lại video theo nội dung file SRT đã sửa"
                    >
                      {isRedubbing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>Lồng tiếng lại theo SRT đã sửa</span>
                    </button>

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
                      💡 <b>Quy trình sửa từ ngữ:</b> Bấm <i>"Sửa trực tiếp trên Web"</i> ➔ Sửa câu từ / thuật ngữ ➔ Bấm <i>"Lưu & Lồng tiếng ngay"</i>.
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
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

          {/* Card Trạng Thái Tạm Dừng: Chờ Nạp Phụ Đề Dịch (Manual Workflow Pause State) */}
          {taskStatus?.status === "waiting_manual_translation" && (
            <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-3xl p-6 space-y-4 backdrop-blur-xl shadow-xl animate-fadeIn">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
                    <PauseCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">Đang Tạm Dừng: Chờ Nạp Bản Dịch</h3>
                    <p className="text-[11px] text-amber-300/80">
                      {taskStatus.progress || 40}% • Đã tạo {taskStatus.total_segments || 0} câu thoại gốc
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold font-mono text-amber-400 bg-amber-500/20 px-3 py-1 rounded-xl border border-amber-500/30">
                  {taskStatus.progress || 40}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/10">
                <div
                  className="bg-gradient-to-r from-amber-500 to-orange-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${taskStatus.progress || 40}%` }}
                />
              </div>

              <div className="p-3.5 bg-black/50 border border-amber-500/20 rounded-2xl text-xs space-y-2.5">
                <p className="text-on-surface leading-relaxed">
                  {taskStatus.message || "Đã xuất xong file phụ đề gốc. Vui lòng dịch phụ đề và nạp lại ở Bước 3 bên trái để hoàn tất."}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadOriginalSrt}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Phụ Đề Gốc (.SRT)</span>
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                👉 <b>Bước tiếp theo:</b> Nạp file <code>.srt</code> đã dịch ở <b>Bước 3</b> và bấm <b>🎬 3. Tiếp Tục Lồng Tiếng & Render Video</b> ở Bước 4 để xuất video thành phẩm.
              </p>
            </div>
          )}

          {/* Card Tiến Trình Chi Tiết (Granular Progress Tracker) khi đang chạy */}
          {isProcessing && taskStatus && (() => {
            const currentStepKey = taskStatus.current_step || "extracting";
            const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.key === currentStepKey);
            const activeStepIdx = currentStepIndex !== -1 ? currentStepIndex : (taskStatus.progress && taskStatus.progress >= 85 ? 5 : 0);

            // Ước tính thời gian còn lại
            const curProg = taskStatus.progress || 0;
            let remainingSeconds: number | null = null;
            if (curProg >= 8 && elapsedSeconds >= 3 && curProg < 100) {
              const totalEstSec = (elapsedSeconds / curProg) * 100;
              remainingSeconds = Math.max(1, Math.round(totalEstSec - elapsedSeconds));
            }

            return (
              <div className="bg-surface/90 border-2 border-primary/40 rounded-3xl p-6 space-y-5 backdrop-blur-xl shadow-2xl animate-fadeIn">
                {/* Header: Title & Badges */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    {taskStatus.task_id === "uploading" ? (
                      <>
                        <div className="w-9 h-9 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
                          <Upload className="w-5 h-5 animate-bounce" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-on-surface">Đang Tải Video Lên Máy Chủ</h3>
                          <p className="text-[11px] text-on-surface-variant">Chuẩn bị không gian xử lý dữ liệu</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-9 h-9 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30 relative">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                            <span>Tiến Trình Xử Lý AI Khép Kín</span>
                            {taskId && <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">#{taskId}</span>}
                          </h3>
                          <p className="text-[11px] text-on-surface-variant">Đang chạy các mô hình AI trực tiếp theo thời gian thực</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Percentage Big Badge */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-2xl font-black text-primary font-mono tracking-tight">
                        {taskStatus.progress}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Granular Multi-Step Visual Pipeline Stepper */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {PIPELINE_STEPS.map((step, idx) => {
                    const isDone = curProg >= step.maxProg || idx < activeStepIdx;
                    const isCurrent = idx === activeStepIdx && curProg < step.maxProg;

                    return (
                      <div
                        key={step.key}
                        className={cn(
                          "relative p-2.5 rounded-2xl border transition-all flex flex-col justify-between gap-1.5 overflow-hidden",
                          isCurrent
                            ? "bg-primary/15 border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                            : isDone
                            ? "bg-green-500/10 border-green-500/30 text-green-300"
                            : "bg-surface-variant/20 border-white/5 opacity-50"
                        )}
                      >
                        {/* Top Step Index & Icon */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/40">
                            {idx + 1}/6
                          </span>
                          <span className="text-xs">
                            {isDone ? "✅" : isCurrent ? "⚡" : step.icon}
                          </span>
                        </div>

                        {/* Step Title */}
                        <p className={cn(
                          "text-[11px] font-semibold leading-tight line-clamp-2",
                          isCurrent ? "text-primary" : isDone ? "text-green-300" : "text-on-surface-variant"
                        )}>
                          {step.label}
                        </p>

                        {/* Step Active Glow Bar */}
                        {isCurrent && (
                          <div className="w-full bg-primary/30 h-1 rounded-full overflow-hidden mt-1">
                            <div className="bg-primary h-full rounded-full animate-pulse w-full" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Super Smooth Animated Progress Bar */}
                <div className="space-y-1.5">
                  <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden p-0.5 border border-white/10">
                    <div
                      className="bg-gradient-to-r from-primary via-amber-400 to-primary h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                      style={{ width: `${taskStatus.progress}%` }}
                    >
                      {/* Animated Shimmer Stripe */}
                      <div className="absolute inset-0 bg-white/20 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[move-stripe_1s_linear_infinite]" />
                    </div>
                  </div>
                </div>

                {/* Live Real-time Sub-Step Message Banner */}
                <div className="p-3 bg-black/50 border border-primary/30 rounded-2xl flex items-start gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-1 animate-ping" />
                  <div className="overflow-hidden flex-1">
                    <p className="text-xs font-semibold text-on-surface leading-relaxed break-words">
                      {taskStatus.message || "Đang xử lý dữ liệu..."}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        Giai đoạn: <b>{STEP_LABELS[currentStepKey]?.label || currentStepKey}</b>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real-time Statistics Badges Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">⏱️ Thời gian đã chạy</span>
                    <span className="text-xs font-bold text-on-surface font-mono mt-0.5">
                      {formatTimer(elapsedSeconds)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">⏳ Ước tính còn lại</span>
                    <span className="text-xs font-bold text-amber-400 font-mono mt-0.5">
                      {remainingSeconds ? `~${formatTimer(remainingSeconds)}` : "Đang tính..."}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">🎙️ Tổng câu thoại</span>
                    <span className="text-xs font-bold text-primary font-mono mt-0.5">
                      {taskStatus.total_segments ? `${taskStatus.total_segments} câu` : "Đang đếm..."}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-variant/40 border border-white/5 flex flex-col">
                    <span className="text-[10px] text-on-surface-variant">🤖 Mô hình AI</span>
                    <span className="text-xs font-bold text-on-surface truncate mt-0.5" title={geminiModel}>
                      {geminiModel ? geminiModel.replace("gemini-", "").replace("gemma-", "gemma-") : "Edge-TTS"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Modal Chèn Thêm Câu Thoại Mới (Add Segment Modal) */}
      {showAddSegmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface border-2 border-primary/40 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-primary/20 text-primary">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Chèn Thêm Câu Thoại Mới</h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Tạo câu lồng tiếng và phụ đề mới tại mốc thời gian chỉ định
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSegmentModal(false)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitAddSegment} className="space-y-4">
              {/* Mốc thời gian Start - End */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                    <span>Bắt đầu (giây):</span>
                    <span className="font-mono text-primary text-[11px]">{formatSrtTime(newSegStart)}</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newSegStart}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setNewSegStart(val);
                      if (val >= newSegEnd) {
                        setNewSegEnd(Math.round((val + 2.0) * 10) / 10);
                      }
                    }}
                    className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                    <span>Kết thúc (giây):</span>
                    <span className="font-mono text-primary text-[11px]">{formatSrtTime(newSegEnd)}</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={newSegStart + 0.1}
                    value={newSegEnd}
                    onChange={(e) => setNewSegEnd(parseFloat(e.target.value) || 0)}
                    className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              {/* Lời thoại dịch */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                  <span className="text-on-surface font-semibold">Lời thoại dịch (tạo âm thanh & phụ đề):</span>
                  <span className="text-[10px] text-primary">{newSegText.length} ký tự</span>
                </label>
                <textarea
                  value={newSegText}
                  onChange={(e) => setNewSegText(e.target.value)}
                  rows={3}
                  placeholder="Nhập nội dung câu thoại bạn muốn thuyết minh vào đây..."
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-primary resize-y leading-relaxed"
                  autoFocus
                  required
                />
              </div>

              {/* Câu gốc (tùy chọn) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface-variant">
                  Câu gốc (tùy chọn):
                </label>
                <input
                  type="text"
                  value={newSegOriginalText}
                  onChange={(e) => setNewSegOriginalText(e.target.value)}
                  placeholder="Ví dụ: 原文句子..."
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              {/* Giọng đọc cho câu này */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface-variant">
                  Giọng đọc tổng hợp câu này:
                </label>
                <select
                  value={newSegVoiceId}
                  onChange={(e) => {
                    setNewSegVoiceId(e.target.value);
                    const v = voices.find((item) => item.id === e.target.value);
                    if (v) setNewSegEngine(v.engine);
                  }}
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender}) - {v.engine}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddSegmentModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant text-xs font-semibold cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAddingSegment || !newSegText.trim()}
                  className="px-5 py-2 rounded-xl bg-primary text-black text-xs font-bold flex items-center gap-1.5 hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isAddingSegment ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Đang tạo giọng đọc...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-black" />
                      <span>Xác Nhận & Nạp Câu Thoại</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal quản lý Bộ nhớ tự học của AI (Translation Memory) */}
      <TranslationMemoryModal
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
        onMemoryChanged={fetchMemoryCount}
      />
    </div>
  );
}
