import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Sparkles, Music, FileText, Bug, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/constants/api";
import { APP_VERSION } from "@/constants/version";
import { useTTSStore } from "@/store/useTTSStore";

import {
  useVideoTranslateStore,
  type VoiceOption,
  type TranslationProgress,
  type StudioSegment,
} from "@/store/useVideoTranslateStore";
import {
  VideoSourceCard,
  TranslationSettingsCard,
  VoiceAndSubtitleSettings,
  ManualWorkflowStepper,
  StudioSegmentsManager,
  VideoPlayerOutput,
} from "@/features/video-translate";
import {
  playCompletionSound,
  playNotificationSound,
  requestNotificationPermission,
} from "@/utils/audioUtils";

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
  const segmentPlaybackTargetRef = React.useRef<{
    end: number;
    segId: number;
  } | null>(null);

  const [manualSrtFile, setManualSrtFile] = React.useState<File | null>(null);
  const [manualSrtMode, setManualSrtMode] = React.useState<"file" | "text">(
    "text",
  );
  const [manualSrtText, setManualSrtText] = React.useState<string>("");
  const [manualUploadedCount, setManualUploadedCount] = React.useState<
    number | null
  >(null);
  const [hasAppliedManualSrt, setHasAppliedManualSrt] =
    React.useState<boolean>(false);
  const [isUploadingManualSrt, setIsUploadingManualSrt] = React.useState(false);
  const [manualActiveStep, setManualActiveStep] = React.useState<number>(1);
  const [isStepTransitioning, setIsStepTransitioning] =
    React.useState<boolean>(false);
  const [isModeTransitioning, setIsModeTransitioning] =
    React.useState<boolean>(false);
  const manualSrtFileInputRef = React.useRef<HTMLInputElement>(null);

  const formatSrtTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const {
    videoFile,
    videoPreviewUrl,
    videoStartTime,
    videoEndTime,
    sourceLang,
    targetLang,
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
    translationMode,
    setTranslationMode,
    isProcessing,
    isCleaning,
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
    setIsProcessing,
    setIsCleaning,
    setIsRedubbing,
    setShowSrtEditor,
    setSrtText,
    setIsLoadingSrt,
    setIsSavingSrt,
    studioSegments,
    activeStudioSegmentId,
    studioRemuxMessage,
    setStudioSegments,
    addStudioSegment,
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
    fetchActiveTask,
  } = useVideoTranslateStore();

  const appVersionInfo = useTTSStore((state) => state.appVersionInfo);

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
  const [playingAudioSegId, setPlayingAudioSegId] = React.useState<
    number | null
  >(null);
  const [deletingSegId, setDeletingSegId] = React.useState<number | null>(null);
  const [isStudioOpen, setIsStudioOpen] = React.useState(false);
  const [studioViewMode, setStudioViewMode] = React.useState<"current" | "all">(
    "current",
  );

  // Thêm câu thoại mới tại vị trí bất kỳ
  const [showAddSegmentModal, setShowAddSegmentModal] = React.useState(false);
  const [newSegStart, setNewSegStart] = React.useState<number>(0);
  const [newSegEnd, setNewSegEnd] = React.useState<number>(2.5);
  const [newSegText, setNewSegText] = React.useState<string>("");
  const [newSegOriginalText, setNewSegOriginalText] =
    React.useState<string>("");
  const [newSegVoiceId, setNewSegVoiceId] = React.useState<string>("");
  const [newSegEngine, setNewSegEngine] = React.useState<string>("");
  const [isAddingSegment, setIsAddingSegment] = React.useState<boolean>(false);

  // Đơn vị mốc thời gian cắt video (Giây hoặc Phút, mặc định là Giây)
  const [startTimeUnit, setStartTimeUnit] = React.useState<
    "seconds" | "minutes"
  >("seconds");
  const [endTimeUnit, setEndTimeUnit] = React.useState<"seconds" | "minutes">(
    "seconds",
  );

  const filteredStudioSegments = studioSegments.filter((s) => {
    if (!studioSearch.trim()) return true;
    const q = studioSearch.toLowerCase();
    return (
      s.text.toLowerCase().includes(q) ||
      (s.original_text && s.original_text.toLowerCase().includes(q))
    );
  });

  // Bộ đếm thời gian thực (wall-clock) chống lag/đứng giờ khi chuyển tab hoặc render video lâu
  const taskStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let timer: any = null;
    if (isProcessing) {
      if (!taskStartTimeRef.current) {
        taskStartTimeRef.current = Date.now() - elapsedSeconds * 1000;
      }
      timer = setInterval(() => {
        if (taskStartTimeRef.current) {
          const diff = Math.floor(
            (Date.now() - taskStartTimeRef.current) / 1000,
          );
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
  const [currentLiveSubtitle, setCurrentLiveSubtitle] =
    React.useState<string>("");

  // Translation Memory (Bộ nhớ tự học)
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);

  const fetchMemoryCount = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/memory?limit=1`,
      );
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
        toast.success(
          data.message ||
            (nextVal
              ? "Đã BẬT ghi log chi tiết từng bước (debug)"
              : "Đã TẮT ghi log chi tiết"),
        );
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
          const currentVoiceObj = data.voices.find(
            (v: VoiceOption) => v.id === selectedVoice,
          );
          const langPrefix = targetLang.toLowerCase().split("-")[0];
          const isCompatible =
            currentVoiceObj &&
            (currentVoiceObj.lang?.toLowerCase().startsWith(langPrefix) ||
              currentVoiceObj.engine === "omnivoice" ||
              selectedVoice.startsWith("omnivoice:") ||
              targetLang === "all");

          if (!isCompatible) {
            let defaultV = data.voices.find((v: VoiceOption) => {
              if (langPrefix === "en")
                return (
                  v.id.includes("English") ||
                  v.id.includes("Jenny") ||
                  v.id.startsWith("en-")
                );
              if (langPrefix === "zh")
                return v.id.includes("Xiaoxiao") || v.id.startsWith("zh-");
              if (langPrefix === "ja")
                return v.id.includes("Nanami") || v.id.startsWith("ja-");
              if (langPrefix === "ko")
                return v.id.includes("SunHi") || v.id.startsWith("ko-");
              if (langPrefix === "vi")
                return v.id.includes("HoaiMy") || v.id.startsWith("vi-");
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
          const res = await fetch(
            `${API_BASE_URL}/api/video-translate/status/${currentId}`,
          );
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
        const res = await fetch(
          `${API_BASE_URL}/api/video-translate/status/${taskId}`,
        );
        if (!res.ok) return;

        const data: TranslationProgress = await res.json();
        setTaskStatus(data);

        // Đồng bộ thời gian thực chuẩn xác với server (chống lệch giờ khi render video)
        if (typeof data.elapsed_time === "number" && data.elapsed_time > 0) {
          const srvSec = Math.round(data.elapsed_time);
          setElapsedSeconds(srvSec);
          taskStartTimeRef.current = Date.now() - srvSec * 1000;
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
          toast.success(
            "✅ Đã tạo phụ đề gốc thành công! Tự động chuyển sang Bước 2 để dịch kịch bản.",
          );
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

    if (
      !file.type.startsWith("video/") &&
      !file.name.match(/\.(mp4|mkv|mov|webm|avi|flv|m4v|wmv)$/i)
    ) {
      toast.error("Vui lòng chọn file video hợp lệ (MP4, MKV, MOV, WebM)");
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file, url);
    setTaskId(null);
    setTaskStatus(null);
    setManualActiveStep(1); // Tự động quay về Bước 1 để người dùng không cần bấm lại
    setManualUploadedCount(null);
    setHasAppliedManualSrt(false);
    setManualSrtFile(null);
    setManualSrtText("");
    setStudioSegments([]);
    // Kích hoạt nạp trước Faster-Whisper trong lúc người dùng tinh chỉnh tham số
    fetch(`${API_BASE_URL}/api/video-translate/warmup`).catch(() => {});
    toast.success(
      `Đã chọn video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
    );
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
      const res = await fetch(
        "http://localhost:8000/api/video-translate/verify-gemini-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: geminiApiKey.trim() }),
        },
      );
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
      toast.error(
        "Bạn đã chọn Google AI Studio nhưng chưa nhập API Key. Vui lòng nhập API Key để dịch chuẩn ngữ cảnh phim, hoặc chọn kênh 'Google Dịch (Miễn phí)'.",
      );
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
      toast.info("🚀 Đang khởi chạy quy trình dịch & lồng tiếng video...", {
        duration: 4000,
      });

      const uploadPromise = new Promise<{ task_id: string }>(
        (resolve, reject) => {
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
                reject(
                  new Error(
                    err.detail || "Không thể khởi chạy tác vụ dịch video",
                  ),
                );
              } catch {
                reject(new Error(`Tải video thất bại (HTTP ${xhr.status})`));
              }
            }
          };

          xhr.onerror = () =>
            reject(new Error("Lỗi kết nối mạng khi tải video lên máy chủ"));
          xhr.send(formData);
        },
      );

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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/redub/${currentId}`,
        {
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
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.detail || "Không thể thực hiện lồng tiếng lại");

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
      toast.info(
        "🚀 Đang tải video lên và tạo phụ đề gốc bằng Faster-Whisper...",
        { duration: 4000 },
      );
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/manual/start-transcribe`,
        {
          method: "POST",
          body: formData,
        },
      );
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
    setBgmVolume(0.3);
    setVoiceRate("+0%");
    setMaxSpeedRate(1.35);
    toast.success(
      "✅ Đã khôi phục tùy chỉnh phụ đề & âm thanh về chuẩn tối ưu!",
    );
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

  const [customTranslationPrompt, setCustomTranslationPrompt] =
    useState<string>(() => {
      return (
        localStorage.getItem("tts_custom_translation_prompt") ||
        DEFAULT_TRANSLATION_PROMPT_TEMPLATE
      );
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

  const handleReloadCustomPrompt = () => {
    if (customTranslationPrompt && customTranslationPrompt.trim()) {
      localStorage.setItem(
        "tts_custom_translation_prompt",
        customTranslationPrompt,
      );
    }
    const saved = localStorage.getItem("tts_custom_translation_prompt");
    if (saved && saved.trim()) {
      setCustomTranslationPrompt(saved);
      toast.success("🔄 Đã nạp lại quy tắc dịch thuật thành công!");
    } else {
      setCustomTranslationPrompt(DEFAULT_TRANSLATION_PROMPT_TEMPLATE);
      toast.info("🔄 Đã nạp lại quy tắc dịch thuật mặc định!");
    }
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/subtitles-original-content/${currentId}`,
      );
      const data = await res.json();
      if (!res.ok || !data.content) {
        throw new Error(data.detail || "Không thể lấy nội dung phụ đề gốc");
      }
      const rawText = data.content;
      const promptToUse =
        customTranslationPrompt || DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
      const textToCopy = includePrompt
        ? `${promptToUse.trim()}\n\n${rawText}`
        : rawText;
      await navigator.clipboard.writeText(textToCopy);
      if (includePrompt) {
        toast.success(
          "📋 Đã sao chép Prompt yêu cầu & Phụ đề vào Clipboard! Đang chuyển sang Bước 3...",
        );
      } else {
        toast.success(
          "📋 Đã sao chép nội dung phụ đề SRT gốc vào Clipboard! Đang chuyển sang Bước 3...",
        );
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
            const promptToUse =
              customTranslationPrompt || DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
            const textToCopy = includePrompt
              ? `${promptToUse.trim()}\n\n${text}`
              : text;
            await navigator.clipboard.writeText(textToCopy);
            toast.success(
              "📋 Đã sao chép toàn bộ Prompt & Phụ đề vào Clipboard! Đang chuyển sang Bước 3...",
            );
            setTimeout(() => {
              switchManualStep(3);
            }, 600);
            return;
          }
        }
      } catch (_) {}
      toast.error(
        "Lỗi khi sao chép phụ đề: " +
          (err.message || "Không thể truy cập Clipboard"),
      );
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/subtitles-original-content/${currentId}`,
      );
      const data = await res.json();
      const rawText = res.ok && data.content ? data.content : "";
      const promptToUse =
        customTranslationPrompt || DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
      const fullContent = `${promptToUse.trim()}\n\n${rawText}`;

      const blob = new Blob([fullContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subtitles_with_prompt_${currentId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(
        "✅ Đã tải file Prompt AI (.TXT) thành công! Đang chuyển sang Bước 3...",
      );
      setTimeout(() => {
        switchManualStep(3);
      }, 600);
    } catch {
      handleDownloadFile(
        currentId,
        "prompt_txt",
        `subtitles_with_prompt_${currentId}.txt`,
      );
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
    handleDownloadFile(
      currentId,
      "srt_original",
      `original_subtitles_${currentId}.srt`,
    );
    setTimeout(() => {
      switchManualStep(3);
    }, 600);
  };

  // 3. Xử lý tải file SRT dịch lên
  const handleManualSrtFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/manual/upload-translated-srt/${currentId}`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Lỗi khi nạp file phụ đề");
      setManualUploadedCount(data.segments_count || null);
      setHasAppliedManualSrt(true);
      switchManualStep(4);
      toast.success(
        `✅ ${data.message} • Đã chuyển sang Bước 4 để chọn giọng & render!`,
      );
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
        setHasAppliedManualSrt(false);
        toast.success("📋 Đã dán nội dung từ clipboard!");
      } else {
        toast.info("Clipboard rỗng hoặc không có văn bản.");
      }
    } catch (err) {
      toast.error(
        "Không thể đọc Clipboard trình duyệt tự động. Vui lòng bấm Ctrl + V vào ô văn bản bên dưới.",
      );
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/manual/upload-translated-srt/${currentId}`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.detail || "Lỗi khi nạp nội dung phụ đề");
      setManualUploadedCount(data.segments_count || null);
      setHasAppliedManualSrt(true);
      switchManualStep(4);
      toast.success(
        `✅ ${data.message} • Đã chuyển sang Bước 4 để chọn giọng & render!`,
      );
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
    setHasAppliedManualSrt(false);
    setElapsedSeconds(0);
    taskStartTimeRef.current = Date.now();
    // Chuyển ngay trạng thái sang processing để ẩn ngay card tạm dừng và hiển thị duy nhất 1 card tiến trình lồng tiếng
    setTaskStatus((prev: any) => ({
      ...(prev || {}),
      task_id: currentId,
      status: "processing",
      progress: 20,
      current_step: "dubbing",
      message: "Đang tiến hành lồng tiếng và render video...",
    }));

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
      toast.info("🎬 Đang tiến hành lồng tiếng và render video...", {
        duration: 4000,
      });
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/manual/resume-pipeline/${currentId}`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Lỗi khi tiếp tục quy trình");
      setIsProcessing(true);
      if (data.status) {
        setTaskStatus({
          ...(taskStatus || {}),
          task_id: currentId,
          status: data.status,
          progress: 20,
          current_step: "dubbing",
          message:
            data.message || "Đang tiến hành lồng tiếng và render video...",
        } as any);
      }
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
        const res = await fetch(
          `${API_BASE_URL}/api/video-translate/subtitles-content/${currentId}`,
        );
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/subtitles-content/${currentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: srtText }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể lưu phụ đề");
      if (data.learned_count && data.learned_count > 0) {
        toast.success(
          `🧠 Đã lưu phụ đề & AI đã tự động học được ${data.learned_count} câu bạn vừa sửa!`,
        );
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/studio-segments/${tId}`,
      );
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
    const found = studioSegments.find(
      (s) => s.start <= cur && cur <= s.end + 0.15,
    );
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
          if (
            elTop < containerScrollTop ||
            elTop + el.clientHeight > containerScrollTop + containerHeight
          ) {
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
  const handleSyncSegmentUpdate = async (
    segId: number,
    newText: string,
    newStart?: number,
    newEnd?: number,
  ) => {
    const currentId = taskStatus?.task_id || taskId;
    if (!currentId) return;
    try {
      await fetch(
        `${API_BASE_URL}/api/video-translate/studio-update-segment/${currentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segment_id: segId,
            text: newText,
            start: newStart,
            end: newEnd,
          }),
        },
      );
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/studio-redub-segment/${currentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segment_id: seg.id,
            text: seg.text,
            voice_id: selectedVoice,
            engine: selectedEngine,
          }),
        },
      );
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
        const fullAudioUrl = data.audio_url.startsWith("http")
          ? data.audio_url
          : `${API_BASE_URL}${data.audio_url}`;
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
  const handlePlaySegmentAudio = (
    segId: number,
    audioUrl: string | null | undefined,
  ) => {
    if (!audioUrl) {
      toast.error("Chưa có file âm thanh cho câu này");
      return;
    }
    const fullUrl = audioUrl.startsWith("http")
      ? audioUrl
      : `${API_BASE_URL}${audioUrl}`;
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

    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa đoạn phụ đề #${segId} này không? Đoạn này sẽ không còn xuất hiện trong video thành phẩm.`,
      )
    ) {
      return;
    }

    setDeletingSegId(segId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/studio-delete-segment/${currentId}/${segId}`,
        {
          method: "DELETE",
        },
      );
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
    const endVal =
      initialEnd !== undefined
        ? Math.round(initialEnd * 10) / 10
        : Math.round((startVal + 2.5) * 10) / 10;
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/studio-add-segment/${currentId}`,
        {
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
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Không thể thêm câu thoại");
      }
      const data = await res.json();
      if (data.segment) {
        addStudioSegment(data.segment);
        toast.success(
          `✅ Đã chèn câu thoại #${data.segment.id} và tạo giọng đọc thành công!`,
        );
        setShowAddSegmentModal(false);

        // Tua video đến mốc vừa thêm để người dùng xem lại
        if (resultVideoRef.current) {
          resultVideoRef.current.currentTime = data.segment.start;
        }
        if (data.audio_url) {
          const fullAudioUrl = data.audio_url.startsWith("http")
            ? data.audio_url
            : `${API_BASE_URL}${data.audio_url}`;
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
    fileType:
      | "video"
      | "srt"
      | "srt_original"
      | "prompt_txt"
      | "vocals"
      | "bgm"
      | "audio",
    defaultFilename?: string,
  ) => {
    const rawStem = (
      videoFile?.name ||
      (taskStatus as any)?.video_filename ||
      "Video"
    ).replace(/\.[^/.]+$/, "");
    const videoTargetName = `${rawStem} Translate buy KhaTran.mp4`;
    const finalFilename =
      fileType === "video"
        ? defaultFilename || videoTargetName
        : defaultFilename ||
          (fileType === "srt_original"
            ? `${rawStem}_original.srt`
            : `${rawStem}.srt`);
    const typeLabel =
      fileType === "video"
        ? "video MP4"
        : fileType === "srt_original"
          ? "phụ đề thoại gốc (.SRT)"
          : fileType === "prompt_txt"
            ? "file phụ đề kèm Prompt AI (.TXT)"
            : fileType === "vocals"
              ? "âm thanh giọng nói sạch (Vocals)"
              : fileType === "bgm"
                ? "nhạc nền không lời (BGM)"
                : fileType === "audio"
                  ? "âm thanh lồng tiếng"
                  : "phụ đề dịch (.SRT)";

    toast.info(`Bắt đầu tải ${typeLabel}...`);
    const downloadUrl = `${API_BASE_URL}/api/video-translate/download/${id}?file_type=${fileType}`;

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        const videoDirectPath =
          taskStatus?.video_url || (taskStatus as any)?.result_video_url;
        if (fileType === "video" && videoDirectPath) {
          const directUrl = videoDirectPath.startsWith("http")
            ? videoDirectPath
            : `${API_BASE_URL}${videoDirectPath}`;
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
        throw new Error(
          errData.detail || `Không thể tải file (Mã HTTP ${res.status})`,
        );
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
    if (
      !window.confirm(
        "Bạn có chắc muốn dọn dẹp các tệp tạm và rác video để giải phóng bộ nhớ đĩa không? (Các tác vụ đang chạy vẫn an toàn)",
      )
    ) {
      return;
    }
    setIsCleaning(true);
    try {
      toast.info("Đang quét và dọn dẹp các tệp tạm...");
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/cleanup-cache`,
        {
          method: "POST",
        },
      );
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
      const res = await fetch(
        `${API_BASE_URL}/api/video-translate/open-folder/${currentId}`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể mở thư mục");
      toast.success(
        "📁 " + (data.message || "Đã mở thư mục chứa video trên máy tính"),
      );
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
    taskStatus?.subtitles_srt_url,
  );
  const isTranslatedSrtReady = Boolean(
    hasAppliedManualSrt ||
    manualUploadedCount !== null ||
    manualSrtFile !== null ||
    (typeof manualSrtText === "string" && manualSrtText.trim().length > 0) ||
    taskStatus?.subtitles_srt_url ||
    (taskStatus?.status === "completed" && taskStatus?.task_id),
  );
  const isStep4Enabled = Boolean(
    (taskStatus?.task_id || taskId) &&
    !isProcessing &&
    (taskStatus?.status === "completed"
      ? hasAppliedManualSrt
      : hasAppliedManualSrt ||
        manualUploadedCount !== null ||
        manualSrtFile !== null),
  );
  const isTranscribingOriginal =
    isProcessing &&
    (taskStatus?.current_step === "transcribing" ||
      taskStatus?.current_step === "extracting");

  return (
    <div className="flex flex-col gap-6 2k:gap-8 animate-in fade-in duration-500 max-w-[1600px] 2k:max-w-[2000px] mx-auto w-full">
      {/* Header (Thiết kế phẳng, tinh tế chuẩn OmniVoice Studio) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl 2k:text-3xl font-bold tracking-tight text-on-surface">
              Dịch & Lồng Tiếng Video
            </h1>
            <span className="text-xs font-medium text-on-surface-variant font-mono tracking-wide select-none">
              Version: {appVersionInfo?.version || APP_VERSION}
            </span>
          </div>
          <p className="text-on-surface-variant text-sm 2k:text-base mt-0.5">
            Tự động bóc tách Faster-Whisper, Dịch thuật kịch bản AI & Hòa âm
            lồng tiếng chuẩn phòng thu
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
                : "bg-surface-dim hover:bg-white/10 text-on-surface-variant hover:text-on-surface border-white/10",
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
        <div
          className={cn(
            isExpandedPlayer ? "hidden" : "lg:col-span-7",
            "space-y-6 transition-all duration-300",
          )}
        >
          {/* Tab Switcher: Chế độ Dịch Thủ Công vs Chế độ Dịch Tự Động (Đưa lên trên cùng) */}
          <div className="flex items-center p-1.5 bg-surface-variant/40 border border-white/10 rounded-2xl gap-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => switchTranslationMode("manual")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all duration-300 ease-out cursor-pointer",
                translationMode === "manual"
                  ? "bg-primary text-black shadow-lg shadow-primary/20 scale-[1.01]"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5",
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
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5",
              )}
            >
              <Sparkles className="w-4 h-4" />
              <span>⚡ Dịch Tự Động (Full AI)</span>
            </button>
          </div>

          {/* Card 1: Chọn Video Cần Dịch & Cắt đoạn */}
          <VideoSourceCard
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
            startTimeUnit={startTimeUnit}
            setStartTimeUnit={setStartTimeUnit}
            endTimeUnit={endTimeUnit}
            setEndTimeUnit={setEndTimeUnit}
            previewVideoRef={previewVideoRef}
            resultVideoRef={resultVideoRef}
            formatSrtTime={formatSrtTime}
          />

          {translationMode === "auto" ? (
            /* Chế độ Dịch Tự Động (Full AI) */
            <div
              key="auto-mode-card"
              className={cn(
                "space-y-6 transition-all duration-300",
                isModeTransitioning ? "step-fade-exit" : "step-fade-enter",
              )}
            >
              <TranslationSettingsCard
                handleVerifyGeminiKey={handleVerifyGeminiKey}
                isVerifyingKey={isVerifyingKey}
                keyVerifyResult={keyVerifyResult}
                setKeyVerifyResult={setKeyVerifyResult}
              />

              <VoiceAndSubtitleSettings
                handleResetAudioSubtitleDefaults={
                  handleResetAudioSubtitleDefaults
                }
              />

              {/* CTA Button Bắt Đầu Tự Động */}
              <button
                onClick={handleStartTranslation}
                disabled={
                  !videoFile ||
                  isProcessing ||
                  taskStatus?.status === "completed"
                }
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
                  !videoFile ||
                    isProcessing ||
                    taskStatus?.status === "completed"
                    ? "bg-surface-variant/40 text-on-surface-variant/60 cursor-not-allowed opacity-60 border border-white/5"
                    : "bg-gradient-to-r from-primary via-primary/90 to-primary text-black hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] shadow-primary/20 cursor-pointer",
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
            /* Chế độ Thủ Công (Manual Pipeline - 4-Step Stepper Wizard) */
            <div
              key="manual-mode-card"
              className={cn(
                "transition-all duration-300",
                isModeTransitioning ? "step-fade-exit" : "step-fade-enter",
              )}
            >
              <ManualWorkflowStepper
                manualActiveStep={manualActiveStep}
                switchManualStep={switchManualStep}
                isOriginalSrtReady={isOriginalSrtReady}
                manualUploadedCount={manualUploadedCount}
                isTranslatedSrtReady={isTranslatedSrtReady}
                isStepTransitioning={isStepTransitioning}
                isTranscribingOriginal={isTranscribingOriginal}
                handleStartManualTranscribe={handleStartManualTranscribe}
                handleResetTranscribeDefaults={handleResetTranscribeDefaults}
                showPromptPreview={showPromptPreview}
                setShowPromptPreview={setShowPromptPreview}
                customTranslationPrompt={customTranslationPrompt}
                handleUpdateCustomPrompt={handleUpdateCustomPrompt}
                handleReloadCustomPrompt={handleReloadCustomPrompt}
                handleResetCustomPrompt={handleResetCustomPrompt}
                handleCopyOriginalSrt={handleCopyOriginalSrt}
                handleDownloadOriginalPromptTxt={
                  handleDownloadOriginalPromptTxt
                }
                handleDownloadOriginalSrt={handleDownloadOriginalSrt}
                handleOpenFolder={handleOpenFolder}
                isOpeningFolder={isOpeningFolder}
                isCopyingOriginalSrt={isCopyingOriginalSrt}
                manualSrtMode={manualSrtMode}
                setManualSrtMode={setManualSrtMode}
                manualSrtFileInputRef={manualSrtFileInputRef}
                handleManualSrtFileChange={handleManualSrtFileChange}
                isUploadingManualSrt={isUploadingManualSrt}
                manualSrtFile={manualSrtFile}
                handlePasteFromClipboard={handlePasteFromClipboard}
                manualSrtText={manualSrtText}
                setManualSrtText={setManualSrtText}
                setHasAppliedManualSrt={setHasAppliedManualSrt}
                handleManualSrtTextSubmit={handleManualSrtTextSubmit}
                hasAppliedManualSrt={hasAppliedManualSrt}
                handleResetAudioSubtitleDefaults={
                  handleResetAudioSubtitleDefaults
                }
                handleResumeManualPipeline={handleResumeManualPipeline}
                isStep4Enabled={isStep4Enabled}
              />
            </div>
          )}
        </div>

        {/* Right Column: Preview, Progress & Studio Result */}
        <VideoPlayerOutput
          isExpandedPlayer={isExpandedPlayer}
          setIsExpandedPlayer={setIsExpandedPlayer}
          resultVideoRef={resultVideoRef}
          previewVideoRef={previewVideoRef}
          handleVideoTimeUpdate={handleVideoTimeUpdate}
          currentLiveSubtitle={currentLiveSubtitle}
          handleDownloadFile={handleDownloadFile}
          handleOpenFolder={handleOpenFolder}
          isOpeningFolder={isOpeningFolder}
          formatTimer={formatTimer}
          handleDownloadOriginalSrt={handleDownloadOriginalSrt}
          studioNode={
            <StudioSegmentsManager
              isStudioOpen={isStudioOpen}
              setIsStudioOpen={setIsStudioOpen}
              studioRemuxMessage={studioRemuxMessage}
              setStudioRemuxMessage={setStudioRemuxMessage}
              studioViewMode={studioViewMode}
              setStudioViewMode={setStudioViewMode}
              filteredStudioSegments={filteredStudioSegments}
              studioSearch={studioSearch}
              setStudioSearch={setStudioSearch}
              playingAudioSegId={playingAudioSegId}
              deletingSegId={deletingSegId}
              fetchStudioSegments={fetchStudioSegments}
              handleSeekToSegment={handleSeekToSegment}
              handleAdjustSegmentStart={handleAdjustSegmentStart}
              handleSyncSegmentUpdate={handleSyncSegmentUpdate}
              handlePlaySegmentAudio={handlePlaySegmentAudio}
              handleOpenAddSegment={handleOpenAddSegment}
              handleDeleteStudioSegment={handleDeleteStudioSegment}
              handleRedubSingleSegment={handleRedubSingleSegment}
              handlePlaySingleSegmentOnVideo={handlePlaySingleSegmentOnVideo}
              transcriptContainerRef={transcriptContainerRef}
              handleToggleSrtEditor={handleToggleSrtEditor}
              isLoadingSrt={isLoadingSrt}
              showSrtEditor={showSrtEditor}
              handleRedub={handleRedub}
              setShowMemoryModal={setShowMemoryModal}
              memoryCount={memoryCount}
              handleSaveSrt={handleSaveSrt}
              isSavingSrt={isSavingSrt}
              srtText={srtText}
              setSrtText={setSrtText}
              showAddSegmentModal={showAddSegmentModal}
              setShowAddSegmentModal={setShowAddSegmentModal}
              handleSubmitAddSegment={handleSubmitAddSegment}
              newSegStart={newSegStart}
              setNewSegStart={setNewSegStart}
              newSegEnd={newSegEnd}
              setNewSegEnd={setNewSegEnd}
              newSegText={newSegText}
              setNewSegText={setNewSegText}
              newSegOriginalText={newSegOriginalText}
              setNewSegOriginalText={setNewSegOriginalText}
              newSegVoiceId={newSegVoiceId}
              setNewSegVoiceId={setNewSegVoiceId}
              setNewSegEngine={setNewSegEngine}
              isAddingSegment={isAddingSegment}
              showMemoryModal={showMemoryModal}
              fetchMemoryCount={fetchMemoryCount}
              formatSrtTime={formatSrtTime}
            />
          }
        />
      </div>
    </div>
  );
}
