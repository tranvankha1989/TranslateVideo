import type { StateCreator } from "zustand";
import { API_BASE_URL } from "@/constants/api";
import { APP_VERSION } from "@/constants/version";
import type {
  TTSState,
  SyncStatus,
  Project,
  AudioRecord,
  PronunciationWord,
  HardwareConfig,
  TestGpuResult,
  AppVersionInfo,
  CheckUpdateResult,
  PerformUpdateResult,
  FeedbackPayload,
  FeedbackResult,
  ModelStatus,
} from "../types";

export interface SystemSlice {
  modelStatus: ModelStatus | null;
  fetchModelStatus: () => Promise<ModelStatus | null>;
  retryModelDownload: () => Promise<void>;
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

export const createSystemSlice: StateCreator<TTSState, [], [], SystemSlice> = (
  set,
  get,
) => ({
  syncStatus: {
    mode:
      (localStorage.getItem("tts_sync_mode") as "cloud" | "local") || "local",
    mongo_connected: localStorage.getItem("tts_sync_mongo") === "true",
    r2_connected: localStorage.getItem("tts_sync_r2") === "true",
    message:
      localStorage.getItem("tts_sync_mode") === "cloud"
        ? "Đồng bộ Đám mây (MongoDB Atlas & R2)"
        : "Chế độ Cục Bộ (Local Mode) - Dữ liệu lưu trong LocalStorage trình duyệt.",
  },
  isSyncing: false,
  modelStatus: null,

  fetchModelStatus: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/model/status`);
      if (res.ok) {
        const data: ModelStatus = await res.json();
        set({ modelStatus: data });
        return data;
      }
    } catch {
      // Backend có thể chưa sẵn sàng hoặc đang khởi động
    }
    return null;
  },

  retryModelDownload: async () => {
    try {
      await fetch(`${API_BASE_URL}/api/model/retry`, { method: "POST" });
      await get().fetchModelStatus();
    } catch (e) {
      console.error("Lỗi khi gọi retry model download:", e);
    }
  },

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
          localStorage.setItem(
            "tts_pronunciation_dict",
            JSON.stringify(cloudPron),
          );
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
    if (
      state.syncStatus.mode !== "cloud" ||
      !state.syncStatus.mongo_connected
    ) {
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
      return {
        ok: false,
        message: err.message || "Không thể kết nối máy chủ Backend",
      };
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
      return {
        ok: false,
        message: err.message || "Không thể kết nối máy chủ Backend",
      };
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
        current_version: APP_VERSION,
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
        get()
          .fetchAppVersion()
          .catch(() => {});
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
});
