import type { StateCreator } from "zustand";
import { DEFAULT_PAUSE_SETTINGS, DEFAULT_PRONUNCIATION_WORDS } from "../types";
import type { TTSState, PauseSettings, PronunciationWord } from "../types";

export interface DictionarySlice {
  pauseSettings: PauseSettings;
  setPauseSettings: (settings: Partial<PauseSettings>) => void;
  resetPauseSettings: () => void;
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
}

export const createDictionarySlice: StateCreator<
  TTSState,
  [],
  [],
  DictionarySlice
> = (set) => ({
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

      if (
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
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
      if (
        target &&
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
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

      if (
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
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
      if (
        target &&
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
        fetch("http://localhost:8000/api/sync/pronunciation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        }).catch(() => {});
      }

      return { pronunciationWords: updated };
    }),
});
