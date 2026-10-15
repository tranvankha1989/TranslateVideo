import { create } from "zustand";
import type { TTSState } from "./types";
import { createDictionarySlice } from "./slices/dictionarySlice";
import { createVoiceSlice } from "./slices/voiceSlice";
import { createProjectSlice } from "./slices/projectSlice";
import { createSystemSlice } from "./slices/systemSlice";
import { createAudioSlice } from "./slices/audioSlice";

export * from "./types";

export const useTTSStore = create<TTSState>()((...a) => ({
  ...createDictionarySlice(...a),
  ...createVoiceSlice(...a),
  ...createProjectSlice(...a),
  ...createSystemSlice(...a),
  ...createAudioSlice(...a),
}));
