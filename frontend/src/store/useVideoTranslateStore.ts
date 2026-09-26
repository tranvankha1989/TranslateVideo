import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  gender: string;
  engine: string;
  type?: string;
  voice_key?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface BilingualSegment {
  id: number;
  start: number;
  end: number;
  source_text: string;
  target_text: string;
}

export interface TranslationProgress {
  task_id: string;
  status: "queued" | "processing" | "paused_for_review" | "completed" | "failed";
  progress: number;
  current_step: string;
  message: string;
  source_lang?: string;
  target_lang?: string;
  total_segments?: number;
  video_url?: string;
  audio_url?: string;
  subtitles_srt_url?: string;
  subtitles_original_srt_url?: string;
  elapsed_time?: number;
  elapsed_str?: string;
  error?: string;
}

interface VideoTranslateState {
  // Video File in memory
  videoFile: File | null;
  videoFileName: string | null;
  videoFileSize: number | null;
  videoPreviewUrl: string | null;

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
  bgmVolume: number;
  subtitleMode: string;
  maxSpeedRate: number;

  // Provider & Style
  translationProvider: string;
  translationStyle: string;
  geminiApiKey: string;
  geminiModel: string;
  geminiTemperature: number;
  whisperModel: string;
  showAdvanced: boolean;
  pauseForReview: boolean;

  // Task & Processing State
  isProcessing: boolean;
  isCleaning: boolean;
  isOpeningEditor: boolean;
  isRedubbing: boolean;
  showSrtEditor: boolean;
  srtText: string;
  isLoadingSrt: boolean;
  isSavingSrt: boolean;

  // Duyệt câu gốc 2 bước
  showOriginalReviewModal: boolean;
  originalSrtText: string;
  bilingualSegments: BilingualSegment[];
  reviewViewMode: "bilingual" | "srt";
  useUserTranslations: boolean;
  isLoadingOriginalSrt: boolean;
  isSavingOriginalSrt: boolean;
  isContinuing: boolean;

  taskId: string | null;
  taskStatus: TranslationProgress | null;
  elapsedSeconds: number;

  // Actions
  setVideoFile: (file: File | null, previewUrl?: string | null) => void;
  setLanguages: (languages: LanguageOption[]) => void;
  setSourceLang: (lang: string) => void;
  setTargetLang: (lang: string) => void;
  setVoices: (voices: VoiceOption[]) => void;
  setSelectedVoice: (voiceId: string) => void;
  setSelectedEngine: (engine: string) => void;
  setVoiceRate: (rate: string) => void;
  setPreserveBgm: (val: boolean) => void;
  setBgmVolume: (vol: number) => void;
  setSubtitleMode: (mode: string) => void;
  setMaxSpeedRate: (rate: number) => void;
  setTranslationProvider: (provider: string) => void;
  setTranslationStyle: (style: string) => void;
  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  setGeminiTemperature: (temp: number) => void;
  setWhisperModel: (model: string) => void;
  setShowAdvanced: (val: boolean) => void;
  setPauseForReview: (val: boolean) => void;

  setIsProcessing: (val: boolean) => void;
  setIsCleaning: (val: boolean) => void;
  setIsOpeningEditor: (val: boolean) => void;
  setIsRedubbing: (val: boolean) => void;
  setShowSrtEditor: (val: boolean) => void;
  setSrtText: (text: string) => void;
  setIsLoadingSrt: (val: boolean) => void;
  setIsSavingSrt: (val: boolean) => void;

  setShowOriginalReviewModal: (val: boolean) => void;
  setOriginalSrtText: (text: string) => void;
  setBilingualSegments: (segments: BilingualSegment[]) => void;
  setReviewViewMode: (mode: "bilingual" | "srt") => void;
  setUseUserTranslations: (val: boolean) => void;
  setIsLoadingOriginalSrt: (val: boolean) => void;
  setIsSavingOriginalSrt: (val: boolean) => void;
  setIsContinuing: (val: boolean) => void;

  setTaskId: (taskId: string | null) => void;
  setTaskStatus: (status: TranslationProgress | null) => void;
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
      sourceLang: "auto",
      targetLang: "vi",

      voices: [],
      selectedVoice: "vi-VN-HoaiMyNeural",
      selectedEngine: "edge-tts",
      voiceRate: "+0%",

      preserveBgm: true,
      bgmVolume: 0.25,
      subtitleMode: "hard_target",
      maxSpeedRate: 1.35,

      translationProvider: "gemini",
      translationStyle: "auto",
      geminiApiKey: typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || "" : "",
      geminiModel: "gemini-2.5-flash",
      geminiTemperature: 0.2,
      whisperModel: "large-v3",
      showAdvanced: false,
      pauseForReview: false,

      isProcessing: false,
      isCleaning: false,
      isOpeningEditor: false,
      isRedubbing: false,
      showSrtEditor: false,
      srtText: "",
      isLoadingSrt: false,
      isSavingSrt: false,

      showOriginalReviewModal: false,
      originalSrtText: "",
      bilingualSegments: [],
      reviewViewMode: "bilingual",
      useUserTranslations: false,
      isLoadingOriginalSrt: false,
      isSavingOriginalSrt: false,
      isContinuing: false,

      taskId: null,
      taskStatus: null,
      elapsedSeconds: 0,

      setVideoFile: (file, previewUrl = null) =>
        set({
          videoFile: file,
          videoFileName: file ? file.name : null,
          videoFileSize: file ? file.size : null,
          videoPreviewUrl: previewUrl,
        }),

      setLanguages: (languages) => set({ languages }),
      setSourceLang: (sourceLang) => set({ sourceLang }),
      setTargetLang: (targetLang) => set({ targetLang }),
      setVoices: (voices) => set({ voices }),
      setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
      setSelectedEngine: (selectedEngine) => set({ selectedEngine }),
      setVoiceRate: (voiceRate) => set({ voiceRate }),
      setPreserveBgm: (preserveBgm) => set({ preserveBgm }),
      setBgmVolume: (bgmVolume) => set({ bgmVolume }),
      setSubtitleMode: (subtitleMode) => set({ subtitleMode }),
      setMaxSpeedRate: (maxSpeedRate) => set({ maxSpeedRate }),
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
      setPauseForReview: (pauseForReview) => set({ pauseForReview }),

      setIsProcessing: (isProcessing) => set({ isProcessing }),
      setIsCleaning: (isCleaning) => set({ isCleaning }),
      setIsOpeningEditor: (isOpeningEditor) => set({ isOpeningEditor }),
      setIsRedubbing: (isRedubbing) => set({ isRedubbing }),
      setShowSrtEditor: (showSrtEditor) => set({ showSrtEditor }),
      setSrtText: (srtText) => set({ srtText }),
      setIsLoadingSrt: (isLoadingSrt) => set({ isLoadingSrt }),
      setIsSavingSrt: (isSavingSrt) => set({ isSavingSrt }),

      setShowOriginalReviewModal: (showOriginalReviewModal) => set({ showOriginalReviewModal }),
      setOriginalSrtText: (originalSrtText) => set({ originalSrtText }),
      setBilingualSegments: (bilingualSegments) => set({ bilingualSegments }),
      setReviewViewMode: (reviewViewMode) => set({ reviewViewMode }),
      setUseUserTranslations: (useUserTranslations) => set({ useUserTranslations }),
      setIsLoadingOriginalSrt: (isLoadingOriginalSrt) => set({ isLoadingOriginalSrt }),
      setIsSavingOriginalSrt: (isSavingOriginalSrt) => set({ isSavingOriginalSrt }),
      setIsContinuing: (isContinuing) => set({ isContinuing }),

      setTaskId: (taskId) => set({ taskId }),
      setTaskStatus: (taskStatus) => set({ taskStatus }),
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
          const res = await fetch("http://localhost:8000/api/video-translate/active-task");
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
        bgmVolume: state.bgmVolume,
        subtitleMode: state.subtitleMode,
        maxSpeedRate: state.maxSpeedRate,
        translationProvider: state.translationProvider,
        translationStyle: state.translationStyle,
        geminiApiKey: state.geminiApiKey,
        geminiModel: state.geminiModel,
        geminiTemperature: state.geminiTemperature,
        whisperModel: state.whisperModel,
        pauseForReview: state.pauseForReview,
        taskId: state.taskId,
        taskStatus: state.taskStatus,
        isProcessing: state.isProcessing,
        elapsedSeconds: state.elapsedSeconds,
      }),
    }
  )
);
