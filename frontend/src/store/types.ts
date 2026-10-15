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
    const isAllUpperShort =
      orig === orig.toUpperCase() && orig.length <= 5 && /[A-Z]/.test(orig);
    const flags = isAllUpperShort ? "gu" : "giu";

    try {
      const regex = new RegExp(
        `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
        flags,
      );
      result = result.replace(regex, pron);
    } catch {
      const regex = new RegExp(`\\b${escaped}\\b`, flags.replace("u", ""));
      result = result.replace(regex, pron);
    }
  }
  return result;
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
  release_tag?: string;
  release_notes?: string;
  patch_asset_url?: string;
  patch_asset_name?: string;
  patch_asset_size_mb?: number;
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

export interface TTSState {
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
  studioBlocks: ScriptBlock[];
  setStudioBlocks: (blocks: ScriptBlock[]) => void;
  generationProgress: { current: number; total: number };
  setGenerationProgress: (progress: { current: number; total: number }) => void;
  elapsedTime: number;
  setElapsedTime: (time: number | ((prev: number) => number)) => void;
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
