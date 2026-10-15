import type { StateCreator } from "zustand";
import type { TTSState, Voice, AudioRecord } from "../types";

export interface VoiceSlice {
  voices: Voice[];
  selectedVoiceId: string | null;
  pinnedVoices: string[];
  pendingVoiceForVideo: AudioRecord | null;
  setPendingVoiceForVideo: (record: AudioRecord | null) => void;
  togglePin: (id: string) => void;
  fetchVoices: () => Promise<void>;
  setSelectedVoiceId: (id: string | null) => void;
  deleteCustomVoice: (id: string) => Promise<void>;
}

export const createVoiceSlice: StateCreator<TTSState, [], [], VoiceSlice> = (
  set,
  get,
) => ({
  voices: [],
  selectedVoiceId: localStorage.getItem("tts_selected_voice") || null,
  pinnedVoices: JSON.parse(localStorage.getItem("tts_pinned_voices") || "[]"),
  pendingVoiceForVideo: null,

  setPendingVoiceForVideo: (record) => set({ pendingVoiceForVideo: record }),

  togglePin: (id) =>
    set((state) => {
      const isPinned = state.pinnedVoices.includes(id);
      const newPinned = isPinned
        ? state.pinnedVoices.filter((vId) => vId !== id)
        : [...state.pinnedVoices, id];
      localStorage.setItem("tts_pinned_voices", JSON.stringify(newPinned));
      return { pinnedVoices: newPinned };
    }),

  fetchVoices: async () => {
    try {
      get()
        .checkStorageStatus()
        .catch(() => {});

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
      const res = await fetch(`http://localhost:8000/api/voices/custom/${id}`, {
        method: "DELETE",
      });
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
});
