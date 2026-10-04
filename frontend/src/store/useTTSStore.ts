import { create } from "zustand";
import { API_BASE_URL } from "@/constants/api";

export interface AudioRecord {
  id: string;
  text: string;
  url: string;
  timestamp: number;
  projectId?: string;
  voiceId?: string | null;
  voiceName?: string;
  mode?: "clone" | "design" | "auto";
  instruct?: string;
  num_step?: number;
  cfg_value?: number;
  inference_timesteps?: number;
  seed?: number;
  speed?: number;
  pitch?: number;
  engine?: string;
  blockFilenames?: string[];
  sessionId?: string;
}

export interface ScriptBlock {
  id: string;
  text: string;
  voiceId?: string | null;
  voiceName?: string;
  speed: number;
  pitch: number;
  pauseAfter: number; // Khoảng lặng sau đoạn tính bằng giây (vd: 0.5)
  status: "idle" | "rendering" | "ready" | "error";
  audioUrl?: string;
  filename?: string;
  duration?: number;
  error?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  blocks?: ScriptBlock[];
  masterAudioUrl?: string;
  masterFilename?: string;
  masterSrtUrl?: string;
  masterDuration?: number;
}

export interface Voice {
  id: string;
  name: string;
  gender: string;
  description: string;
  icon: string;
  prompt_text: string;
  url: string;
  type?: "preset" | "custom";
  samples_count?: number;
  duration?: number;
}

export interface PauseSettings {
  period: number; // Dấu chấm (. ! ? …): mặc định 0.45s
  comma: number; // Dấu phẩy (,): mặc định 0.25s
  semicolon: number; // Dấu chấm phẩy (;): mặc định 0.30s
  newline: number; // Xuống dòng (\n): mặc định 0.60s
  crossfade?: number; // Micro crossfade khử pop/click (ms): mặc định 15ms
}

export const DEFAULT_PAUSE_SETTINGS: PauseSettings = {
  period: 0.45,
  comma: 0.25,
  semicolon: 0.3,
  newline: 0.6,
  crossfade: 15,
};

export interface PronunciationWord {
  id: string;
  original: string;
  pronunciation: string;
  enabled: boolean;
  createdAt: number;
}

export const DEFAULT_PRONUNCIATION_WORDS: PronunciationWord[] = [
  {
    id: "sample-1",
    original: "năm hai một bốn",
    pronunciation: "năm-hai-một-bốn",
    enabled: true,
    createdAt: 1710000000000,
  },
  {
    id: "sample-2",
    original: "TP.HCM",
    pronunciation: "Thành phố Hồ Chí Minh",
    enabled: true,
    createdAt: 1710000000001,
  },
  {
    id: "sample-3",
    original: "AI",
    pronunciation: "Ây Ai",
    enabled: true,
    createdAt: 1710000000002,
  },
  {
    id: "sample-4",
    original: "ChatGPT",
    pronunciation: "Chát gi pi ti",
    enabled: true,
    createdAt: 1710000000003,
  },
];

export interface SyncStatus {
  mode: "local" | "cloud";
  mongo_connected: boolean;
  r2_connected: boolean;
  message: string;
}

export function applyPronunciationDictionary(

  text: string,
  words: PronunciationWord[],
): string {
  if (!text || !words || words.length === 0) return text;

  const activeWords = words
    .filter((w) => w.enabled && w.original.trim())
    .sort((a, b) => b.original.length - a.original.length);

  let result = text;
  for (const item of activeWords) {
    const orig = item.original.trim();
    const pron = item.pronunciation.trim();
    if (!orig || !pron) continue;

    const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Nếu từ gốc là chữ hoa hoàn toàn và ngắn (ví dụ: "AI", "USD", "TP.HCM", "CSKH"),
    // thì BẮT BUỘC phân biệt hoa thường để tránh thay nhầm từ tiếng Việt thường như "ai", "ai đó"!
    const isAllUpperShort =
      orig === orig.toUpperCase() && orig.length <= 5 && /[A-Z]/.test(orig);
    const flags = isAllUpperShort ? "gu" : "giu";

    // Sử dụng Unicode Word Boundary: trước và sau từ không được là chữ cái hoặc số (\p{L}\p{N})
    // Giúp tránh nuốt từ như "hai" -> "h + Ây Ai" khi có từ khóa "AI"
    try {
      const regex = new RegExp(
        `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
        flags,
      );
      result = result.replace(regex, pron);
    } catch {
      // Fallback nếu môi trường không hỗ trợ lookbehind
      const regex = new RegExp(`\\b${escaped}\\b`, flags.replace("u", ""));
      result = result.replace(regex, pron);
    }
  }
  return result;
}

interface TTSState {
  pauseSettings: PauseSettings;
  setPauseSettings: (settings: Partial<PauseSettings>) => void;
  resetPauseSettings: () => void;
  text: string;
  mode: "clone" | "design";
  instruct: string;
  num_step: number;
  cfg_value: number;
  inference_timesteps: number;
  seed: number;
  speed: number;
  pitch: number;
  isLoading: boolean;
  audioUrl: string | null;
  audioFormat: string;
  enhanceAudio: boolean;
  setEnhanceAudio: (enhanceAudio: boolean) => void;
  engine: string;
  setEngine: (engine: string) => void;
  history: AudioRecord[];
  pronunciationWords: PronunciationWord[];
  addPronunciationWord: (word: {
    original: string;
    pronunciation: string;
  }) => void;
  updatePronunciationWord: (
    id: string,
    updates: Partial<PronunciationWord>,
  ) => void;
  deletePronunciationWord: (id: string) => void;
  togglePronunciationWord: (id: string) => void;
  voices: Voice[];
  selectedVoiceId: string | null;
  pinnedVoices: string[];
  projects: Project[];
  pendingVoiceForVideo: AudioRecord | null;
  setPendingVoiceForVideo: (record: AudioRecord | null) => void;
  setMode: (mode: "clone" | "design") => void;
  setInstruct: (instruct: string) => void;
  setNumStep: (num_step: number) => void;
  addProject: (
    name: string,
    description?: string,
    initialData?: Partial<Project>,
  ) => Project;
  deleteProject: (id: string) => void;
  updateRecordProject: (recordId: string, projectId?: string) => void;
  togglePin: (id: string) => void;
  setText: (text: string) => void;
  setCfgValue: (val: number) => void;
  setTimesteps: (val: number) => void;
  setSeed: (val: number) => void;
  setSpeed: (val: number) => void;
  setPitch: (val: number) => void;
  setIsLoading: (val: boolean) => void;
  setAudioUrl: (url: string | null) => void;
  setAudioFormat: (format: string) => void;
  addHistory: (record: Omit<AudioRecord, "id" | "timestamp">) => void;
  removeHistory: (id: string) => void;
  fetchVoices: () => Promise<void>;
  setSelectedVoiceId: (id: string | null) => void;
  deleteCustomVoice: (id: string) => Promise<void>;
  updateProjectBlocks: (projectId: string, blocks: ScriptBlock[]) => void;
  updateProjectMaster: (
    projectId: string,
    master: {
      masterAudioUrl?: string;
      masterFilename?: string;
      masterSrtUrl?: string;
      masterDuration?: number;
    },
  ) => void;
  cleanupJunkFiles: (force?: boolean) => Promise<{
    deleted_count: number;
    freed_mb: number;
    message: string;
  }>;
  loudnessStandard: "ebu_r128" | "youtube" | "peak";
  setLoudnessStandard: (standard: "ebu_r128" | "youtube" | "peak") => void;
  syncStatus: SyncStatus;
  isSyncing: boolean;
  checkStorageStatus: () => Promise<void>;
  syncAllToCloud: () => Promise<void>;
  fetchFromCloud: () => Promise<void>;
  hardwareConfig: HardwareConfig;
  isLoadingHardware: boolean;
  fetchHardwareSettings: () => Promise<void>;
  updateHardwareSettings: (data: {
    use_remote_gpu: boolean;
    remote_gpu_url: string;
    remote_concurrency?: number;
  }) => Promise<boolean>;
  testRemoteGpuConnection: (url: string) => Promise<TestGpuResult>;
  openEnvFile: () => Promise<{ ok: boolean; message?: string }>;
  reloadBackend: () => Promise<{ ok: boolean; message?: string }>;
  appVersionInfo: AppVersionInfo | null;
  fetchAppVersion: () => Promise<AppVersionInfo | null>;
  checkAppUpdate: () => Promise<CheckUpdateResult>;
  performAppUpdate: () => Promise<PerformUpdateResult>;
  sendFeedback: (payload: FeedbackPayload) => Promise<FeedbackResult>;
}

export interface FeedbackPayload {
  sender_name?: string;
  sender_contact?: string;
  feedback_type: "bug" | "feature" | "question" | "other";
  message: string;
  include_logs: boolean;
  system_info?: Record<string, any>;
}

export interface FeedbackResult {
  ok: boolean;
  message: string;
  error?: string;
}

export interface AppVersionInfo {
  version: string;
  name?: string;
  release_date?: string;
  description?: string;
  git_branch?: string;
  git_commit?: string;
  git_commit_date?: string;
}

export interface CheckUpdateResult {
  ok: boolean;
  has_update: boolean;
  current_version: string;
  latest_remote_commit?: string;
  commits_behind: number;
  commit_messages: string[];
  message: string;
  error?: string;
}

export interface PerformUpdateResult {
  ok: boolean;
  message: string;
  new_version?: string;
  logs: string[];
  error?: string;
}

export interface HardwareConfig {
  use_remote_gpu: boolean;
  remote_gpu_url: string;
  remote_concurrency: number;
  local_device: string;
  cuda_available: boolean;
  cuda_device_name: string | null;
  cuda_vram_gb?: number | null;
}

export interface TestGpuResult {
  ok: boolean;
  gpu_name?: string;
  vram_total_gb?: number;
  provider?: string;
  ping_ms?: number;
  error?: string;
}




export const useTTSStore = create<TTSState>((set, get) => {
  // Đọc cấu hình mô hình đã lưu từ localStorage
  const _savedConfig = JSON.parse(
    localStorage.getItem("tts_model_config") || "{}",
  );
  return {
    pauseSettings: (() => {
      try {
        const saved = localStorage.getItem("tts_pause_settings");
        return saved
          ? { ...DEFAULT_PAUSE_SETTINGS, ...JSON.parse(saved) }
          : DEFAULT_PAUSE_SETTINGS;
      } catch {
        return DEFAULT_PAUSE_SETTINGS;
      }
    })(),
    setPauseSettings: (newSettings) =>
      set((state) => {
        const updated = { ...state.pauseSettings, ...newSettings };
        localStorage.setItem("tts_pause_settings", JSON.stringify(updated));
        return { pauseSettings: updated };
      }),
    resetPauseSettings: () =>
      set(() => {
        localStorage.setItem(
          "tts_pause_settings",
          JSON.stringify(DEFAULT_PAUSE_SETTINGS),
        );
        return { pauseSettings: DEFAULT_PAUSE_SETTINGS };
      }),
    text: (() => {
      try {
        const savedText = localStorage.getItem("tts_input_text");
        if (savedText !== null && savedText.trim()) return savedText;
        const savedBlocks = JSON.parse(
          localStorage.getItem("tts_studio_blocks") || "[]",
        );
        if (Array.isArray(savedBlocks) && savedBlocks.length > 0) {
          return savedBlocks
            .map((b: any) => b.text)
            .filter(Boolean)
            .join("\n");
        }
      } catch {}
      return "";
    })(),
    mode: "clone",
    instruct: "",
    num_step: 32,
    cfg_value:
      typeof _savedConfig.cfg_value === "number" ? _savedConfig.cfg_value : 2.0,
    inference_timesteps: 32,
    seed: 42,
    speed: typeof _savedConfig.speed === "number" ? _savedConfig.speed : 1.0,
    pitch: typeof _savedConfig.pitch === "number" ? _savedConfig.pitch : 0.0,
    isLoading: false,
    audioUrl: (() => {
      try {
        return localStorage.getItem("tts_master_audio_url") || null;
      } catch {
        return null;
      }
    })(),
    audioFormat:
      typeof _savedConfig.audioFormat === "string"
        ? _savedConfig.audioFormat
        : "mp3",
    enhanceAudio:
      typeof _savedConfig.enhanceAudio === "boolean"
        ? _savedConfig.enhanceAudio
        : true,
    loudnessStandard: (() => {
      try {
        const saved = localStorage.getItem("tts_loudness_standard");
        return (saved as "ebu_r128" | "youtube" | "peak") || "ebu_r128";
      } catch {
        return "ebu_r128";
      }
    })(),
    setLoudnessStandard: (standard) => {
      try {
        localStorage.setItem("tts_loudness_standard", standard);
      } catch {}
      set({ loudnessStandard: standard });
    },
    engine: localStorage.getItem("tts_selected_engine") || "omnivoice",
    setEngine: (engine) => {
      localStorage.setItem("tts_selected_engine", engine);
      set({ engine });
    },
    history: JSON.parse(localStorage.getItem("tts_history") || "[]"),
    syncStatus: {
      mode: (localStorage.getItem("tts_sync_mode") as "cloud" | "local") || "local",
      mongo_connected: localStorage.getItem("tts_sync_mongo") === "true",
      r2_connected: localStorage.getItem("tts_sync_r2") === "true",
      message:
        localStorage.getItem("tts_sync_mode") === "cloud"
          ? "Đồng bộ Đám mây (MongoDB Atlas & R2)"
          : "Chế độ Cục Bộ (Local Mode) - Dữ liệu lưu trong LocalStorage trình duyệt.",
    },
    isSyncing: false,
    checkStorageStatus: async () => {
      try {
        const res = await fetch("http://localhost:8000/api/sync/status");
        if (res.ok) {
          const data: SyncStatus = await res.json();
          set({ syncStatus: data });
          localStorage.setItem("tts_sync_mode", data.mode);
          localStorage.setItem("tts_sync_mongo", String(data.mongo_connected));
          localStorage.setItem("tts_sync_r2", String(data.r2_connected));
          if (data.mode === "cloud" && data.mongo_connected) {
            await get().fetchFromCloud();
          }
        }
      } catch {
        const fallback: SyncStatus = {
          mode: "local",
          mongo_connected: false,
          r2_connected: false,
          message: "Chế độ Cục Bộ (Local Mode) - Không kết nối được API đám mây.",
        };
        set({ syncStatus: fallback });
        localStorage.setItem("tts_sync_mode", "local");
        localStorage.setItem("tts_sync_mongo", "false");
        localStorage.setItem("tts_sync_r2", "false");
      }
    },
    fetchFromCloud: async () => {
      try {
        set({ isSyncing: true });
        const [projRes, histRes, pronRes] = await Promise.all([
          fetch("http://localhost:8000/api/sync/projects").catch(() => null),
          fetch("http://localhost:8000/api/sync/history").catch(() => null),
          fetch("http://localhost:8000/api/sync/pronunciation").catch(() => null),
        ]);

        if (projRes && projRes.ok) {
          const cloudProjects: Project[] = await projRes.json();
          if (Array.isArray(cloudProjects) && cloudProjects.length > 0) {
            set({ projects: cloudProjects });
            localStorage.setItem("tts_projects", JSON.stringify(cloudProjects));
          }
        }

        if (histRes && histRes.ok) {
          const cloudHistory: AudioRecord[] = await histRes.json();
          if (Array.isArray(cloudHistory) && cloudHistory.length > 0) {
            set({ history: cloudHistory });
            localStorage.setItem("tts_history", JSON.stringify(cloudHistory));
          }
        }

        if (pronRes && pronRes.ok) {
          const cloudPron: PronunciationWord[] = await pronRes.json();
          if (Array.isArray(cloudPron) && cloudPron.length > 0) {
            set({ pronunciationWords: cloudPron });
            localStorage.setItem("tts_pronunciation_dict", JSON.stringify(cloudPron));
          }
        }
      } catch (e) {
        console.error("Lỗi khi đồng bộ từ Cloud:", e);
      } finally {
        set({ isSyncing: false });
      }
    },
    syncAllToCloud: async () => {
      const state = get();
      if (state.syncStatus.mode !== "cloud" || !state.syncStatus.mongo_connected) {
        return;
      }
      set({ isSyncing: true });
      try {
        for (const p of state.projects) {
          await fetch("http://localhost:8000/api/sync/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          }).catch(() => {});
        }
        for (const h of state.history) {
          await fetch("http://localhost:8000/api/sync/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(h),
          }).catch(() => {});
        }
        for (const w of state.pronunciationWords) {
          await fetch("http://localhost:8000/api/sync/pronunciation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(w),
          }).catch(() => {});
        }
      } finally {
        set({ isSyncing: false });
      }
    },
    pronunciationWords: (() => {
      try {
        const saved = localStorage.getItem("tts_pronunciation_dict");
        return saved ? JSON.parse(saved) : DEFAULT_PRONUNCIATION_WORDS;
      } catch {
        return DEFAULT_PRONUNCIATION_WORDS;
      }
    })(),
    addPronunciationWord: (word) =>
      set((state) => {
        const newWord: PronunciationWord = {
          id: Math.random().toString(36).substring(2, 9),
          original: word.original.trim(),
          pronunciation: word.pronunciation.trim(),
          enabled: true,
          createdAt: Date.now(),
        };
        const updated = [newWord, ...state.pronunciationWords];
        localStorage.setItem("tts_pronunciation_dict", JSON.stringify(updated));

        // Sync lên cloud nếu bật
        if (state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch("http://localhost:8000/api/sync/pronunciation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newWord),
          }).catch(() => {});
        }

        return { pronunciationWords: updated };
      }),
    updatePronunciationWord: (id, updates) =>
      set((state) => {
        const updated = state.pronunciationWords.map((w) =>
          w.id === id ? { ...w, ...updates } : w,
        );
        localStorage.setItem("tts_pronunciation_dict", JSON.stringify(updated));

        const target = updated.find((w) => w.id === id);
        if (target && state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch("http://localhost:8000/api/sync/pronunciation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target),
          }).catch(() => {});
        }

        return { pronunciationWords: updated };
      }),
    deletePronunciationWord: (id) =>
      set((state) => {
        const updated = state.pronunciationWords.filter((w) => w.id !== id);
        localStorage.setItem("tts_pronunciation_dict", JSON.stringify(updated));

        if (state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch(`http://localhost:8000/api/sync/pronunciation/${id}`, {
            method: "DELETE",
          }).catch(() => {});
        }

        return { pronunciationWords: updated };
      }),
    togglePronunciationWord: (id) =>
      set((state) => {
        const updated = state.pronunciationWords.map((w) =>
          w.id === id ? { ...w, enabled: !w.enabled } : w,
        );
        localStorage.setItem("tts_pronunciation_dict", JSON.stringify(updated));

        const target = updated.find((w) => w.id === id);
        if (target && state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch("http://localhost:8000/api/sync/pronunciation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target),
          }).catch(() => {});
        }

        return { pronunciationWords: updated };
      }),

    voices: [],
    selectedVoiceId: localStorage.getItem("tts_selected_voice") || null,
    pinnedVoices: JSON.parse(localStorage.getItem("tts_pinned_voices") || "[]"),
    projects: JSON.parse(localStorage.getItem("tts_projects") || "[]"),
    pendingVoiceForVideo: null,
    setPendingVoiceForVideo: (record) => set({ pendingVoiceForVideo: record }),
    addProject: (name, description, initialData = {}) => {
      const newProject: Project = {
        id: Math.random().toString(36).substring(2, 9),
        name,
        description,
        createdAt: Date.now(),
        ...initialData,
      };
      set((state) => {
        const newProjects = [newProject, ...state.projects];
        localStorage.setItem("tts_projects", JSON.stringify(newProjects));

        if (state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch("http://localhost:8000/api/sync/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newProject),
          }).catch(() => {});
        }

        return { projects: newProjects };
      });
      return newProject;
    },
    deleteProject: (id) => {
      const proj = get().projects.find((p) => p.id === id);
      if (proj) {
        // Xoá các file audio của blocks trên backend
        if (proj.blocks) {
          for (const b of proj.blocks) {
            const fn =
              b.filename || (b.audioUrl ? b.audioUrl.split("/").pop() : null);
            if (fn) {
              fetch(`http://localhost:8000/api/tts/${fn}`, {
                method: "DELETE",
              }).catch(() => {});
            }
          }
        }
        // Xoá master audio và srt nếu có
        const mFn =
          proj.masterFilename ||
          (proj.masterAudioUrl ? proj.masterAudioUrl.split("/").pop() : null);
        if (mFn) {
          fetch(`http://localhost:8000/api/tts/${mFn}`, {
            method: "DELETE",
          }).catch(() => {});
        }
        if (proj.masterSrtUrl) {
          const srtFn = proj.masterSrtUrl.split("/").pop();
          if (srtFn) {
            fetch(`http://localhost:8000/api/tts/${srtFn}`, {
              method: "DELETE",
            }).catch(() => {});
          }
        }
      }

      set((state) => {
        // Xoá tất cả các record thuộc project này
        const newHistory = state.history.filter((h) => h.projectId !== id);

        const newProjects = state.projects.filter((p) => p.id !== id);
        localStorage.setItem("tts_projects", JSON.stringify(newProjects));
        localStorage.setItem("tts_history", JSON.stringify(newHistory));

        if (state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch(`http://localhost:8000/api/sync/projects/${id}`, {
            method: "DELETE",
          }).catch(() => {});
        }

        return { projects: newProjects, history: newHistory };
      });
    },

    updateRecordProject: (recordId, projectId) => {
      set((state) => {
        const newHistory = state.history.map((h) =>
          h.id === recordId ? { ...h, projectId } : h,
        );
        localStorage.setItem("tts_history", JSON.stringify(newHistory));
        return { history: newHistory };
      });
    },
    togglePin: (id) =>
      set((state) => {
        const isPinned = state.pinnedVoices.includes(id);
        const newPinned = isPinned
          ? state.pinnedVoices.filter((vId) => vId !== id)
          : [...state.pinnedVoices, id];
        localStorage.setItem("tts_pinned_voices", JSON.stringify(newPinned));
        return { pinnedVoices: newPinned };
      }),
    setMode: (mode) => set({ mode }),
    setInstruct: (instruct) => set({ instruct }),
    setNumStep: (num_step) => set({ num_step, inference_timesteps: num_step }),
    setText: (text) => {
      try {
        localStorage.setItem("tts_input_text", text);
      } catch {}
      set({ text });
    },
    setCfgValue: (cfg_value) => set({ cfg_value }),
    setTimesteps: (inference_timesteps) =>
      set({ inference_timesteps, num_step: inference_timesteps }),
    setSeed: (seed) => set({ seed }),
    setSpeed: (speed) => set({ speed }),
    setPitch: (pitch) => set({ pitch }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setAudioUrl: (audioUrl) => {
      try {
        if (audioUrl) {
          localStorage.setItem("tts_master_audio_url", audioUrl);
        } else {
          localStorage.removeItem("tts_master_audio_url");
        }
      } catch {}
      set({ audioUrl });
    },
    setAudioFormat: (audioFormat) => set({ audioFormat }),
    setEnhanceAudio: (enhanceAudio) => {
      try {
        const cur = JSON.parse(
          localStorage.getItem("tts_model_config") || "{}",
        );
        localStorage.setItem(
          "tts_model_config",
          JSON.stringify({ ...cur, enhanceAudio }),
        );
      } catch {
        // ignore
      }
      set({ enhanceAudio });
    },
    addHistory: (record) =>
      set((state) => {
        const newRecord: AudioRecord = {
          ...record,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
        };
        const newHistory = [newRecord, ...state.history];
        localStorage.setItem("tts_history", JSON.stringify(newHistory));

        if (state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch("http://localhost:8000/api/sync/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newRecord),
          }).catch(() => {});
        }

        return { history: newHistory };
      }),
    removeHistory: async (id) => {
      const record = get().history.find((h) => h.id === id);
      const filesToDelete = new Set<string>();

      // 1. Nếu audio có sessionId -> Gọi API xóa trọn gói thư mục session trong 1 tích tắc
      if (record && record.sessionId) {
        try {
          await fetch(`http://localhost:8000/api/tts/session/${record.sessionId}`, {
            method: "DELETE",
          });
        } catch (e) {
          console.error("Lỗi xóa audio session:", e);
        }
      } else {
        // Fallback tương thích ngược: Thu thập từng file lẻ để xóa batch
        if (record && record.url) {
          const masterFn = record.url.split("/").pop();
          if (masterFn) filesToDelete.add(masterFn);
        }

        if (record && Array.isArray(record.blockFilenames)) {
          for (const bFn of record.blockFilenames) {
            if (bFn) filesToDelete.add(bFn);
          }
        }

        if (filesToDelete.size > 0) {
          try {
            await fetch("http://localhost:8000/api/tts/delete-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filenames: Array.from(filesToDelete) }),
            });
          } catch (e) {
            console.error("Lỗi xóa batch audio files:", e);
          }
        }
      }

      // 2. Kiểm tra xem audio vừa xóa có phải là phiên đang mở ở Phòng thu không
      let currentStudioBlocks: ScriptBlock[] = [];
      try {
        currentStudioBlocks = JSON.parse(
          localStorage.getItem("tts_studio_blocks") || "[]",
        );
      } catch {}

      const state = get();
      const matchesStudioMaster =
        Boolean(record && state.audioUrl && state.audioUrl === record.url);
      const matchesStudioText =
        Boolean(record && state.text && state.text.trim() === record.text.trim());
      const matchesStudioBlocks =
        Boolean(record && currentStudioBlocks.some((b) => b.audioUrl && b.audioUrl === record.url));

      if (get().syncStatus.mode === "cloud" && get().syncStatus.mongo_connected) {
        fetch(`http://localhost:8000/api/sync/history/${id}`, {
          method: "DELETE",
        }).catch(() => {});
      }

      set((state) => {
        const newHistory = state.history.filter((h) => h.id !== id);
        localStorage.setItem("tts_history", JSON.stringify(newHistory));

        const libraryEmpty = newHistory.length === 0;
        let newText = state.text;
        let newAudioUrl = state.audioUrl;

        if (matchesStudioMaster || matchesStudioText || matchesStudioBlocks || libraryEmpty) {
          newText = "";
          newAudioUrl = null;
          localStorage.removeItem("tts_input_text");
          localStorage.removeItem("tts_master_audio_url");
          localStorage.removeItem("tts_studio_blocks");
          localStorage.removeItem("tts_studio_session_id");
          localStorage.removeItem("tts_master_elapsed_time");
          localStorage.removeItem("tts_has_modified_segments");
          localStorage.removeItem("tts_draft_last_saved");

          // Bắn event toàn cục để các component/hook ở Phòng thu đồng bộ reset ngay
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("tts_studio_clear"));
          }
        }

        return {
          history: newHistory,
          text: newText,
          audioUrl: newAudioUrl,
        };
      });
    },
    fetchVoices: async () => {
      try {
        // Tự động kiểm tra trạng thái lưu trữ / đồng bộ
        get().checkStorageStatus().catch(() => {});

        const res = await fetch("http://localhost:8000/api/voices");
        if (res.ok) {
          const data: Voice[] = await res.json();
          const pinned: string[] = get().pinnedVoices || [];
          const sorted = [...data].sort((a, b) => {
            const aPinned = pinned.includes(a.id);
            const bPinned = pinned.includes(b.id);
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return 0;
          });
          set({ voices: data });

          const savedVoiceId = localStorage.getItem("tts_selected_voice");
          const isValidSaved =
            savedVoiceId && data.some((v) => v.id === savedVoiceId);

          if (isValidSaved) {
            set({ selectedVoiceId: savedVoiceId });
          } else if (sorted.length > 0) {
            set({ selectedVoiceId: sorted[0].id });
          }
        }
      } catch (e) {
        console.error("Lỗi khi tải danh sách giọng mẫu:", e);
      }
    },

    deleteCustomVoice: async (id) => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/voices/custom/${id}`,
          {
            method: "DELETE",
          },
        );
        if (res.ok) {
          set((state) => ({
            voices: state.voices.filter((v) => v.id !== id),
            selectedVoiceId:
              state.selectedVoiceId === id ? null : state.selectedVoiceId,
          }));
        } else {
          throw new Error("Không thể xoá giọng đọc");
        }
      } catch (e) {
        console.error("Lỗi khi xoá giọng:", e);
        throw e;
      }
    },
    setSelectedVoiceId: (id) => {
      if (id) {
        localStorage.setItem("tts_selected_voice", id);
      } else {
        localStorage.removeItem("tts_selected_voice");
      }
      set({ selectedVoiceId: id });
    },
    updateProjectBlocks: (projectId, blocks) => {
      set((state) => {
        const newProjects = state.projects.map((p) =>
          p.id === projectId ? { ...p, blocks } : p,
        );
        localStorage.setItem("tts_projects", JSON.stringify(newProjects));

        const target = newProjects.find((p) => p.id === projectId);
        if (target && state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch("http://localhost:8000/api/sync/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target),
          }).catch(() => {});
        }

        return { projects: newProjects };
      });
    },
    updateProjectMaster: (projectId, master) => {
      set((state) => {
        const newProjects = state.projects.map((p) =>
          p.id === projectId ? { ...p, ...master } : p,
        );
        localStorage.setItem("tts_projects", JSON.stringify(newProjects));

        const target = newProjects.find((p) => p.id === projectId);
        if (target && state.syncStatus.mode === "cloud" && state.syncStatus.mongo_connected) {
          fetch("http://localhost:8000/api/sync/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target),
          }).catch(() => {});
        }

        return { projects: newProjects };
      });
    },

    cleanupJunkFiles: async (force = false) => {
      const state = get();
      const activeFiles = new Set<string>();
      const activeSessions = new Set<string>();

      // 1. Từ lịch sử Audio (history): master audio + tất cả file phân đoạn + session_id
      for (const h of state.history) {
        if (h.sessionId) {
          activeSessions.add(h.sessionId);
        }
        if (h.url) {
          const fn = h.url.split("/").pop();
          if (fn) activeFiles.add(fn);
        }
        if (Array.isArray(h.blockFilenames)) {
          for (const bFn of h.blockFilenames) {
            if (bFn) activeFiles.add(bFn);
          }
        }
      }

      // 2. Từ các dự án (projects: blocks + master audio + srt)
      for (const p of state.projects) {
        if (p.blocks) {
          for (const b of p.blocks) {
            if (b.filename) activeFiles.add(b.filename);
            else if (b.audioUrl) {
              const fn = b.audioUrl.split("/").pop();
              if (fn) activeFiles.add(fn);
            }
          }
        }
        if (p.masterFilename) activeFiles.add(p.masterFilename);
        else if (p.masterAudioUrl) {
          const fn = p.masterAudioUrl.split("/").pop();
          if (fn) activeFiles.add(fn);
        }
        if (p.masterSrtUrl) {
          const fn = p.masterSrtUrl.split("/").pop();
          if (fn) activeFiles.add(fn);
        }
      }

      // 3. Từ phiên làm việc hiện tại ở Phòng thu (Studio) - bảo vệ session_id và các file phân đoạn
      const currentStudioSession = localStorage.getItem("tts_studio_session_id");
      if (currentStudioSession) {
        activeSessions.add(currentStudioSession);
      }

      if (state.audioUrl) {
        const fn = state.audioUrl.split("/").pop();
        if (fn) activeFiles.add(fn);
      }
      try {
        const studioBlocks: ScriptBlock[] = JSON.parse(
          localStorage.getItem("tts_studio_blocks") || "[]",
        );
        for (const b of studioBlocks) {
          if (b.filename) activeFiles.add(b.filename);
          else if (b.audioUrl) {
            const fn = b.audioUrl.split("/").pop();
            if (fn) activeFiles.add(fn);
          }
        }
      } catch {}

      try {
        const [ttsRes, vtRes] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/api/tts/cleanup-orphans`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              active_filenames: Array.from(activeFiles),
              active_session_ids: Array.from(activeSessions),
              max_age_minutes: force ? 0 : 15,
              force,
            }),
          }),
          fetch(`${API_BASE_URL}/api/video-translate/cleanup-cache`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              preserve_active_tasks: !force,
            }),
          }),
        ]);

        let deletedCount = 0;
        let freedMb = 0;

        if (ttsRes.status === "fulfilled" && ttsRes.value.ok) {
          const ttsData = await ttsRes.value.json().catch(() => ({}));
          deletedCount += ttsData.deleted_count || 0;
          freedMb += ttsData.freed_mb || 0;
        }

        if (vtRes.status === "fulfilled" && vtRes.value.ok) {
          const vtData = await vtRes.value.json().catch(() => ({}));
          deletedCount += vtData.deleted_count || 0;
          freedMb += vtData.freed_mb || 0;
        }

        return {
          deleted_count: deletedCount,
          freed_mb: Math.round(freedMb * 10) / 10,
          message: `Đã dọn dẹp ${deletedCount} tệp tin (${Math.round(freedMb * 10) / 10} MB)`,
        };
      } catch (e: any) {
        console.error("Lỗi khi dọn dẹp file rác:", e);
        throw e;
      }
    },
    hardwareConfig: {
      use_remote_gpu: false,
      remote_gpu_url: "",
      remote_concurrency: 2,
      local_device: "cuda",
      cuda_available: true,
      cuda_device_name: null,
      cuda_vram_gb: null,
    },
    isLoadingHardware: false,
    fetchHardwareSettings: async () => {
      try {
        set({ isLoadingHardware: true });
        const res = await fetch(`${API_BASE_URL}/api/settings/hardware`);
        if (res.ok) {
          const data: HardwareConfig = await res.json();
          set({ hardwareConfig: data });
        }
      } catch (err) {
        console.error("Lỗi khi tải cấu hình phần cứng:", err);
      } finally {
        set({ isLoadingHardware: false });
      }
    },
    updateHardwareSettings: async (payload) => {
      try {
        set({ isLoadingHardware: true });
        const res = await fetch(`${API_BASE_URL}/api/settings/hardware`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data: HardwareConfig = await res.json();
          set({ hardwareConfig: data });
          return true;
        }
        return false;
      } catch (err) {
        console.error("Lỗi khi cập nhật cấu hình phần cứng:", err);
        return false;
      } finally {
        set({ isLoadingHardware: false });
      }
    },
    testRemoteGpuConnection: async (url: string) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/hardware/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remote_gpu_url: url }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          return {
            ok: false,
            error: errData?.detail || `Lỗi máy chủ Backend HTTP ${res.status}`,
          };
        }
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err.message || "Lỗi kết nối mạng" };
      }
    },
    openEnvFile: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/open-env`, {
          method: "POST",
        });
        const data = await res.json();
        return { ok: res.ok, message: data.message || data.detail };
      } catch (err: any) {
        return { ok: false, message: err.message || "Không thể kết nối máy chủ Backend" };
      }
    },
    reloadBackend: async () => {
      try {
        set({ isLoadingHardware: true });
        const res = await fetch(`${API_BASE_URL}/api/settings/reload-backend`, {
          method: "POST",
        });
        const data = await res.json();
        if (res.ok && data.hardware) {
          set({ hardwareConfig: data.hardware });
        }
        return { ok: res.ok, message: data.message || data.detail };
      } catch (err: any) {
        return { ok: false, message: err.message || "Không thể kết nối máy chủ Backend" };
      } finally {
        set({ isLoadingHardware: false });
      }
    },
    appVersionInfo: null,
    fetchAppVersion: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/app-version`);
        if (res.ok) {
          const data: AppVersionInfo = await res.json();
          set({ appVersionInfo: data });
          return data;
        }
        return null;
      } catch (err) {
        console.error("Lỗi lấy thông tin phiên bản:", err);
        return null;
      }
    },
    checkAppUpdate: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/check-update`, {
          method: "POST",
        });
        const data: CheckUpdateResult = await res.json();
        return data;
      } catch (err: any) {
        return {
          ok: false,
          has_update: false,
          current_version: "3.7.2",
          commits_behind: 0,
          commit_messages: [],
          message: "Không thể kiểm tra bản cập nhật",
          error: err.message || "Lỗi kết nối mạng",
        };
      }
    },
    performAppUpdate: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/perform-update`, {
          method: "POST",
        });
        const data: PerformUpdateResult = await res.json();
        if (data.ok && data.new_version) {
          get().fetchAppVersion().catch(() => {});
        }
        return data;
      } catch (err: any) {
        return {
          ok: false,
          message: "Lỗi thực thi cập nhật",
          logs: [],
          error: err.message || "Không thể kết nối máy chủ Backend",
        };
      }
    },
    sendFeedback: async (payload: FeedbackPayload) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings/feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data: FeedbackResult = await res.json();
        return data;
      } catch (err: any) {
        return {
          ok: false,
          message: "Không thể kết nối máy chủ Backend",
          error: err.message || "Lỗi mạng",
        };
      }
    },
  }; // end return
}); // end create

