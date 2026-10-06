import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { API_BASE_URL } from "@/constants/api";

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  gender: string;
  engine: string;
  type?: string;
  voice_key?: string;
  preview_url?: string;
  url?: string;
  prompt_text?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface StudioSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  original_text?: string;
  speaker?: string;
  audio_url?: string | null;
  audio_duration?: number;
  target_duration?: number;
  rate_ratio?: number;
  isRedubbing?: boolean;
}

export interface TranslationProgress {
  task_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "waiting_manual_translation";
  progress: number;
  current_step: string;
  message: string;
  source_lang?: string;
  target_lang?: string;
  total_segments?: number;
  video_url?: string;
  result_video_url?: string;
  audio_url?: string;
  subtitles_srt_url?: string;
  subtitles_original_srt_url?: string;
  elapsed_time?: number;
  elapsed_str?: string;
  error?: string;
}

interface VideoTranslateState {
  // Video File in memory & Trimming
  videoFile: File | null;
  videoFileName: string | null;
  videoFileSize: number | null;
  videoPreviewUrl: string | null;
  videoStartTime: number;
  videoEndTime: number | null;

  // Translation Config
  languages: LanguageOption[];
  sourceLang: string;
  targetLang: string;

  // Voice & Dubbing Config
  voices: VoiceOption[];
  selectedVoice: string;
  selectedEngine: string;
  voiceRate: string;

  // BGM & Subtitle Config
  preserveBgm: boolean;
  bgmType: "bgm" | "original" | "none";
  bgmVolume: number;
  subtitleMode: string;
  subtitleFontSize: number;
  subtitlePosition: "bottom" | "middle" | "top";
  subtitleMarginV: number;
  maxSpeedRate: number;
  outputResolution: string;

  // Provider & Style
  translationProvider: string;
  translationStyle: string;
  geminiApiKey: string;
  geminiModel: string;
  geminiTemperature: number;
  whisperModel: string;
  showAdvanced: boolean;

  // Transcribe & VAD Config
  vadThreshold: number;
  speechPadMs: number;
  minSpeechDurationMs: number;
  minSilenceDurationMs: number;
  beamSize: number;
  showTranscribeAdvanced: boolean;

  // Mode
  translationMode: "auto" | "manual";
  setTranslationMode: (mode: "auto" | "manual") => void;

  // Task & Processing State
  isProcessing: boolean;
  isCleaning: boolean;
  isOpeningEditor: boolean;
  isRedubbing: boolean;
  showSrtEditor: boolean;
  srtText: string;
  isLoadingSrt: boolean;
  isSavingSrt: boolean;

  taskId: string | null;
  taskStatus: TranslationProgress | null;
  elapsedSeconds: number;

  // Actions
  setVideoFile: (file: File | null, previewUrl?: string | null) => void;
  setVideoStartTime: (time: number) => void;
  setVideoEndTime: (time: number | null) => void;
  resetVideoTrim: () => void;
  setLanguages: (languages: LanguageOption[]) => void;
  setSourceLang: (lang: string) => void;
  setTargetLang: (lang: string) => void;
  setVoices: (voices: VoiceOption[]) => void;
  setSelectedVoice: (voiceId: string) => void;
  setSelectedEngine: (engine: string) => void;
  setVoiceRate: (rate: string) => void;
  setPreserveBgm: (val: boolean) => void;
  setBgmType: (type: "bgm" | "original" | "none") => void;
  setBgmVolume: (vol: number) => void;
  setSubtitleMode: (mode: string) => void;
  setSubtitleFontSize: (val: number) => void;
  setSubtitlePosition: (pos: "bottom" | "middle" | "top") => void;
  setSubtitleMarginV: (val: number) => void;
  setMaxSpeedRate: (rate: number) => void;
  setOutputResolution: (res: string) => void;
  setTranslationProvider: (provider: string) => void;
  setTranslationStyle: (style: string) => void;
  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  setGeminiTemperature: (temp: number) => void;
  setWhisperModel: (model: string) => void;
  setShowAdvanced: (val: boolean) => void;
  setVadThreshold: (val: number) => void;
  setSpeechPadMs: (val: number) => void;
  setMinSpeechDurationMs: (val: number) => void;
  setMinSilenceDurationMs: (val: number) => void;
  setBeamSize: (val: number) => void;
  setShowTranscribeAdvanced: (val: boolean) => void;

  setIsProcessing: (val: boolean) => void;
  setIsCleaning: (val: boolean) => void;
  setIsOpeningEditor: (val: boolean) => void;
  setIsRedubbing: (val: boolean) => void;
  setShowSrtEditor: (val: boolean) => void;
  setSrtText: (text: string) => void;
  setIsLoadingSrt: (val: boolean) => void;
  setIsSavingSrt: (val: boolean) => void;

  // Studio Realtime Review & Selective Redub
  studioSegments: StudioSegment[];
  activeStudioSegmentId: number | null;
  isLoadingStudioSegments: boolean;
  isRemuxingStudioVideo: boolean;
  studioRemuxMessage: string | null;

  setStudioSegments: (segments: StudioSegment[]) => void;
  addStudioSegment: (segment: StudioSegment) => void;
  updateStudioSegmentText: (id: number, text: string) => void;
  updateStudioSegmentTiming: (id: number, start?: number, end?: number) => void;
  setStudioSegmentRedubbing: (id: number, isRedubbing: boolean) => void;
  updateSingleStudioSegment: (id: number, patch: Partial<StudioSegment>) => void;
  removeStudioSegment: (id: number) => void;
  setActiveStudioSegmentId: (id: number | null) => void;
  setIsLoadingStudioSegments: (val: boolean) => void;
  setIsRemuxingStudioVideo: (val: boolean) => void;
  setStudioRemuxMessage: (msg: string | null) => void;

  setTaskId: (taskId: string | null) => void;
  setTaskStatus: (status: TranslationProgress | null | ((prev: TranslationProgress | null) => TranslationProgress | null)) => void;
  setElapsedSeconds: (valueOrFn: number | ((prev: number) => number)) => void;
  resetAll: () => void;
  fetchActiveTask: () => Promise<TranslationProgress | null>;
}

export const useVideoTranslateStore = create<VideoTranslateState>()(
  persist(
    (set) => ({
      videoFile: null,
      videoFileName: null,
      videoFileSize: null,
      videoPreviewUrl: null,

      languages: [],
      sourceLang: "en",
      targetLang: "vi",

      voices: [],
      selectedVoice: "vi-VN-HoaiMyNeural",
      selectedEngine: "edge-tts",
      voiceRate: "+0%",

      preserveBgm: true,
      bgmType: "bgm",
      bgmVolume: 0.30,
      subtitleMode: "hard_target",
      subtitleFontSize: 20,
      subtitlePosition: "bottom",
      subtitleMarginV: 30,
      maxSpeedRate: 1.35,
      outputResolution: "720p",

      translationProvider: "gemini",
      translationStyle: "auto",
      geminiApiKey: typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || "" : "",
      geminiModel: "gemini-3.5-flash-lite",
      geminiTemperature: 0.2,
      whisperModel: "large-v3",
      showAdvanced: false,

      vadThreshold: 0.15,
      speechPadMs: 400,
      minSpeechDurationMs: 150,
      minSilenceDurationMs: 1000,
      beamSize: 5,
      showTranscribeAdvanced: false,

      translationMode: "manual",
      setTranslationMode: (translationMode) => set({ translationMode }),

      isProcessing: false,
      isCleaning: false,
      isOpeningEditor: false,
      isRedubbing: false,
      showSrtEditor: false,
      srtText: "",
      isLoadingSrt: false,
      isSavingSrt: false,

      taskId: null,
      taskStatus: null,
      elapsedSeconds: 0,

      videoStartTime: 0,
      videoEndTime: null,

      setVideoFile: (file, previewUrl = null) =>
        set({
          videoFile: file,
          videoFileName: file ? file.name : null,
          videoFileSize: file ? file.size : null,
          videoPreviewUrl: previewUrl,
        }),

      setVideoStartTime: (videoStartTime) => set({ videoStartTime }),
      setVideoEndTime: (videoEndTime) => set({ videoEndTime }),
      resetVideoTrim: () => set({ videoStartTime: 0, videoEndTime: null }),

      setLanguages: (languages) => set({ languages }),
      setSourceLang: (sourceLang) => set({ sourceLang }),
      setTargetLang: (targetLang) => set({ targetLang }),
      setVoices: (voices) => set({ voices }),
      setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
      setSelectedEngine: (selectedEngine) => set({ selectedEngine }),
      setVoiceRate: (voiceRate) => set({ voiceRate }),
      setPreserveBgm: (preserveBgm) => set({ preserveBgm }),
      setBgmType: (bgmType) => set({ bgmType }),
      setBgmVolume: (bgmVolume) => set({ bgmVolume }),
      setSubtitleMode: (subtitleMode) => set({ subtitleMode }),
      setSubtitleFontSize: (subtitleFontSize) => set({ subtitleFontSize }),
      setSubtitlePosition: (subtitlePosition) => {
        let margin = 30;
        if (subtitlePosition === "middle") margin = 180;
        else if (subtitlePosition === "top") margin = 40;
        set({ subtitlePosition, subtitleMarginV: margin });
      },
      setSubtitleMarginV: (subtitleMarginV) => set({ subtitleMarginV }),
      setMaxSpeedRate: (maxSpeedRate) => set({ maxSpeedRate }),
      setOutputResolution: (outputResolution) => set({ outputResolution }),
      setTranslationProvider: (translationProvider) => set({ translationProvider }),
      setTranslationStyle: (translationStyle) => set({ translationStyle }),
      setGeminiApiKey: (geminiApiKey) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("gemini_api_key", geminiApiKey);
        }
        set({ geminiApiKey });
      },
      setGeminiModel: (geminiModel) => set({ geminiModel }),
      setGeminiTemperature: (geminiTemperature) => set({ geminiTemperature }),
      setWhisperModel: (whisperModel) => set({ whisperModel }),
      setShowAdvanced: (showAdvanced) => set({ showAdvanced }),
      setVadThreshold: (vadThreshold) => set({ vadThreshold }),
      setSpeechPadMs: (speechPadMs) => set({ speechPadMs }),
      setMinSpeechDurationMs: (minSpeechDurationMs) => set({ minSpeechDurationMs }),
      setMinSilenceDurationMs: (minSilenceDurationMs) => set({ minSilenceDurationMs }),
      setBeamSize: (beamSize) => set({ beamSize }),
      setShowTranscribeAdvanced: (showTranscribeAdvanced) => set({ showTranscribeAdvanced }),

      setIsProcessing: (isProcessing) => set({ isProcessing }),
      setIsCleaning: (isCleaning) => set({ isCleaning }),
      setIsOpeningEditor: (isOpeningEditor) => set({ isOpeningEditor }),
      setIsRedubbing: (isRedubbing) => set({ isRedubbing }),
      setShowSrtEditor: (showSrtEditor) => set({ showSrtEditor }),
      setSrtText: (srtText) => set({ srtText }),
      setIsLoadingSrt: (isLoadingSrt) => set({ isLoadingSrt }),
      setIsSavingSrt: (isSavingSrt) => set({ isSavingSrt }),

      studioSegments: [],
      activeStudioSegmentId: null,
      isLoadingStudioSegments: false,
      isRemuxingStudioVideo: false,
      studioRemuxMessage: null,

      setStudioSegments: (studioSegments) => set({ studioSegments }),
      addStudioSegment: (segment) =>
        set((state) => {
          const newSegments = [...state.studioSegments, segment];
          newSegments.sort((a, b) => a.start - b.start);
          return { studioSegments: newSegments };
        }),
      updateStudioSegmentText: (id, text) =>
        set((state) => ({
          studioSegments: state.studioSegments.map((s) => (s.id === id ? { ...s, text } : s)),
        })),
      updateStudioSegmentTiming: (id, start, end) =>
        set((state) => ({
          studioSegments: state.studioSegments.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...(start !== undefined ? { start } : {}),
                  ...(end !== undefined ? { end } : {}),
                }
              : s
          ),
        })),
      setStudioSegmentRedubbing: (id, isRedubbing) =>
        set((state) => ({
          studioSegments: state.studioSegments.map((s) => (s.id === id ? { ...s, isRedubbing } : s)),
        })),
      updateSingleStudioSegment: (id, patch) =>
        set((state) => ({
          studioSegments: state.studioSegments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      removeStudioSegment: (id) =>
        set((state) => ({
          studioSegments: state.studioSegments.filter((s) => s.id !== id),
        })),
      setActiveStudioSegmentId: (activeStudioSegmentId) => set({ activeStudioSegmentId }),
      setIsLoadingStudioSegments: (isLoadingStudioSegments) => set({ isLoadingStudioSegments }),
      setIsRemuxingStudioVideo: (isRemuxingStudioVideo) => set({ isRemuxingStudioVideo }),
      setStudioRemuxMessage: (studioRemuxMessage) => set({ studioRemuxMessage }),

      setTaskId: (taskId) => set({ taskId }),
      setTaskStatus: (valueOrFn) =>
        set((state) => ({
          taskStatus: typeof valueOrFn === "function" ? valueOrFn(state.taskStatus) : valueOrFn,
        })),
      setElapsedSeconds: (valueOrFn) =>
        set((state) => ({
          elapsedSeconds: typeof valueOrFn === "function" ? valueOrFn(state.elapsedSeconds) : valueOrFn,
        })),

      resetAll: () =>
        set({
          videoFile: null,
          videoFileName: null,
          videoFileSize: null,
          videoPreviewUrl: null,
          taskId: null,
          taskStatus: null,
          isProcessing: false,
          isRedubbing: false,
          elapsedSeconds: 0,
          showSrtEditor: false,
          srtText: "",
        }),

      fetchActiveTask: async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/video-translate/active-task`);
          if (!res.ok) return null;
          const data = await res.json();
          if (data && data.task_id) {
            set({
              taskId: data.task_id,
              taskStatus: data,
              isProcessing: data.status === "processing" || data.status === "queued",
            });
            return data;
          }
          return null;
        } catch (e) {
          console.error("Lỗi khi kiểm tra active task:", e);
          return null;
        }
      },
    }),
    {
      name: "videosync_translate_store",
      storage: createJSONStorage(() => localStorage),
      // Chỉ lưu các trường có thể tuần tự hóa vào localStorage
      partialize: (state) => ({
        videoFileName: state.videoFileName,
        videoFileSize: state.videoFileSize,
        sourceLang: state.sourceLang,
        targetLang: state.targetLang,
        selectedVoice: state.selectedVoice,
        selectedEngine: state.selectedEngine,
        voiceRate: state.voiceRate,
        preserveBgm: state.preserveBgm,
        bgmType: state.bgmType,
        bgmVolume: state.bgmVolume,
        subtitleMode: state.subtitleMode,
        subtitleFontSize: state.subtitleFontSize,
        subtitlePosition: state.subtitlePosition,
        subtitleMarginV: state.subtitleMarginV,
        maxSpeedRate: state.maxSpeedRate,
        translationProvider: state.translationProvider,
        translationStyle: state.translationStyle,
        geminiApiKey: state.geminiApiKey,
        geminiModel: state.geminiModel,
        geminiTemperature: state.geminiTemperature,
        whisperModel: state.whisperModel,
        vadThreshold: state.vadThreshold,
        speechPadMs: state.speechPadMs,
        minSpeechDurationMs: state.minSpeechDurationMs,
        minSilenceDurationMs: state.minSilenceDurationMs,
        beamSize: state.beamSize,
        showTranscribeAdvanced: state.showTranscribeAdvanced,
        taskId: state.taskId,
        taskStatus: state.taskStatus,
        isProcessing: state.isProcessing,
        elapsedSeconds: state.elapsedSeconds,
      }),
    }
  )
);
