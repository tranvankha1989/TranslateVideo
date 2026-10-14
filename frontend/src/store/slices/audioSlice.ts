import type { StateCreator } from "zustand";
import { API_BASE_URL } from "@/constants/api";
import type { TTSState, AudioRecord, ScriptBlock } from "../types";

export interface AudioSlice {
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
  setMode: (mode: "clone" | "design") => void;
  setInstruct: (instruct: string) => void;
  setNumStep: (num_step: number) => void;
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
  removeHistory: (id: string) => Promise<void>;
  cleanupJunkFiles: (force?: boolean) => Promise<{
    deleted_count: number;
    freed_mb: number;
    message: string;
  }>;
  loudnessStandard: "ebu_r128" | "youtube" | "peak";
  setLoudnessStandard: (standard: "ebu_r128" | "youtube" | "peak") => void;
}

export const createAudioSlice: StateCreator<TTSState, [], [], AudioSlice> = (
  set,
  get,
) => {
  const _savedConfig = JSON.parse(
    localStorage.getItem("tts_model_config") || "{}",
  );

  return {
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
    enhanceAudio: true,
    loudnessStandard: "ebu_r128",
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
    studioBlocks: (() => {
      try {
        const saved = localStorage.getItem("tts_studio_blocks");
        if (!saved) return [];
        const parsed: ScriptBlock[] = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((b) =>
          b.status === "rendering"
            ? {
                ...b,
                status: (b.audioUrl || b.filename
                  ? "ready"
                  : "idle") as ScriptBlock["status"],
              }
            : b,
        );
      } catch {
        return [];
      }
    })(),
    generationProgress: { current: 0, total: 0 },
    elapsedTime: (() => {
      try {
        const saved = localStorage.getItem("tts_master_elapsed_time");
        return saved ? parseInt(saved, 10) || 0 : 0;
      } catch {
        return 0;
      }
    })(),
    setStudioBlocks: (studioBlocks) => {
      try {
        localStorage.setItem("tts_studio_blocks", JSON.stringify(studioBlocks));
      } catch {}
      set({ studioBlocks });
    },
    setGenerationProgress: (generationProgress) => set({ generationProgress }),
    setElapsedTime: (time) =>
      set((state) => ({
        elapsedTime:
          typeof time === "function" ? time(state.elapsedTime) : time,
      })),
    history: JSON.parse(localStorage.getItem("tts_history") || "[]"),

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
    setIsLoading: (isLoading) =>
      set((state) => {
        if (!isLoading) {
          const hasStuck = state.studioBlocks.some(
            (b) => b.status === "rendering",
          );
          if (hasStuck) {
            const sanitized = state.studioBlocks.map((b) =>
              b.status === "rendering"
                ? {
                    ...b,
                    status: (b.audioUrl || b.filename
                      ? "ready"
                      : "idle") as ScriptBlock["status"],
                  }
                : b,
            );
            try {
              localStorage.setItem(
                "tts_studio_blocks",
                JSON.stringify(sanitized),
              );
            } catch {}
            return {
              isLoading,
              studioBlocks: sanitized,
              generationProgress: { current: 0, total: 0 },
            };
          }
          return { isLoading, generationProgress: { current: 0, total: 0 } };
        }
        return { isLoading };
      }),
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
      } catch {}
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

        if (
          state.syncStatus.mode === "cloud" &&
          state.syncStatus.mongo_connected
        ) {
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

      if (record && record.sessionId) {
        try {
          await fetch(
            `http://localhost:8000/api/tts/session/${record.sessionId}`,
            {
              method: "DELETE",
            },
          );
        } catch (e) {
          console.error("Lỗi xóa audio session:", e);
        }
      } else {
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

      let currentStudioBlocks: ScriptBlock[] = [];
      try {
        currentStudioBlocks = JSON.parse(
          localStorage.getItem("tts_studio_blocks") || "[]",
        );
      } catch {}

      const state = get();
      const matchesStudioMaster = Boolean(
        record && state.audioUrl && state.audioUrl === record.url,
      );
      const matchesStudioText = Boolean(
        record && state.text && state.text.trim() === record.text.trim(),
      );
      const matchesStudioBlocks = Boolean(
        record &&
        currentStudioBlocks.some(
          (b) => b.audioUrl && b.audioUrl === record.url,
        ),
      );

      if (
        get().syncStatus.mode === "cloud" &&
        get().syncStatus.mongo_connected
      ) {
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

        if (
          matchesStudioMaster ||
          matchesStudioText ||
          matchesStudioBlocks ||
          libraryEmpty
        ) {
          newText = "";
          newAudioUrl = null;
          localStorage.removeItem("tts_input_text");
          localStorage.removeItem("tts_master_audio_url");
          localStorage.removeItem("tts_studio_blocks");
          localStorage.removeItem("tts_studio_session_id");
          localStorage.removeItem("tts_master_elapsed_time");
          localStorage.removeItem("tts_has_modified_segments");
          localStorage.removeItem("tts_draft_last_saved");

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

    cleanupJunkFiles: async (force = false) => {
      const state = get();
      const activeFiles = new Set<string>();
      const activeSessions = new Set<string>();

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

      const currentStudioSession = localStorage.getItem(
        "tts_studio_session_id",
      );
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
  };
};
