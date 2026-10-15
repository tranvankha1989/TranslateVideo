import React, { useState, useEffect } from "react";
import {
  Server,
  CloudLightning,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  ExternalLink,
  Layers,
  Cloud,
  HardDrive,
  Folder,
  FolderOpen,
  Save,
  RotateCcw,
  Database,
  Eye,
  EyeOff,
  Radio,
  RefreshCw,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTTSStore, type TestGpuResult } from "@/store/useTTSStore";

export const HardwareTab: React.FC = () => {
  const {
    hardwareConfig,
    fetchHardwareSettings,
    updateHardwareSettings,
    testRemoteGpuConnection,
    isLoadingHardware,
    syncStatus,
    checkStorageStatus,
    isSyncing,
    syncAllToCloud,
    fetchFromCloud,
  } = useTTSStore();

  const [useRemoteGpu, setUseRemoteGpu] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [concurrency, setConcurrency] = useState(2);

  // Cloud Sync
  const [isCloudSyncEnabled, setIsCloudSyncEnabled] = useState(false);
  const [mongoUri, setMongoUri] = useState("");
  const [mongoDbName, setMongoDbName] = useState("omnivoice");
  const [showMongoUriPassword, setShowMongoUriPassword] = useState(false);

  // Cloudflare R2
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKeyId, setR2AccessKeyId] = useState("");
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState("");
  const [showR2Secret, setShowR2Secret] = useState(false);
  const [r2BucketName, setR2BucketName] = useState("");
  const [r2PublicUrl, setR2PublicUrl] = useState("");

  // Custom Output Directory
  const [customOutputDir, setCustomOutputDir] = useState("");
  const [defaultOutputDir, setDefaultOutputDir] = useState("");
  const [currentOutputDir, setCurrentOutputDir] = useState("");
  const [isCustomOutputDir, setIsCustomOutputDir] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [isSavingOutputDir, setIsSavingOutputDir] = useState(false);
  const [isBrowsingDir, setIsBrowsingDir] = useState(false);

  // Test and Save States
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestGpuResult | null>(null);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudTestResult, setCloudTestResult] = useState<{
    mongo_ok: boolean;
    mongo_message: string;
    r2_ok: boolean;
    r2_message: string;
  } | null>(null);
  const [isActionSyncLoading, setIsActionSyncLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchOutputDirInfo = async () => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/output-directory",
      );
      if (res.ok) {
        const data = await res.json();
        setCustomOutputDir(data.custom_output_dir || "");
        setDefaultOutputDir(data.default_output_dir || "");
        setCurrentOutputDir(data.current_output_dir || "");
        setIsCustomOutputDir(Boolean(data.is_custom));
        setAutoSaveEnabled(Boolean(data.auto_save_enabled));
      }
    } catch (e) {
      console.warn("Lỗi khi tải thông tin thư mục đầu ra:", e);
    }
  };

  const fetchCloudSyncSettings = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/settings/cloud-sync");
      if (res.ok) {
        const data = await res.json();
        setIsCloudSyncEnabled(Boolean(data.enabled));
        setMongoUri(data.mongodb_uri || "");
        setMongoDbName(data.mongodb_db_name || "omnivoice");
        setR2AccountId(data.r2_account_id || "");
        setR2AccessKeyId(data.r2_access_key_id || "");
        setR2SecretAccessKey(data.r2_secret_access_key || "");
        setR2BucketName(data.r2_bucket_name || "");
        setR2PublicUrl(data.r2_public_url || "");
      }
    } catch (e) {
      console.warn("Lỗi khi tải cấu hình cloud sync:", e);
    }
  };

  useEffect(() => {
    fetchHardwareSettings();
    checkStorageStatus();
    fetchCloudSyncSettings();
    fetchOutputDirInfo();
  }, [fetchHardwareSettings, checkStorageStatus]);

  useEffect(() => {
    if (hardwareConfig) {
      setUseRemoteGpu(hardwareConfig.use_remote_gpu);
      setRemoteUrl(hardwareConfig.remote_gpu_url || "");
      setConcurrency(hardwareConfig.remote_concurrency || 2);
    }
  }, [hardwareConfig]);

  const handleRunPingTest = async () => {
    const trimmed = remoteUrl.trim();
    if (!trimmed) {
      toast.error("Vui lòng nhập đường dẫn Cloud GPU URL trước khi kiểm tra!");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testRemoteGpuConnection(trimmed);
      setTestResult(res);
      if (res.ok) {
        toast.success(
          `Kết nối thành công tới ${res.provider || "Cloud GPU"} (${res.gpu_name})!`,
        );
      } else {
        toast.error(res.error || "Không thể kết nối tới Cloud GPU.");
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || "Lỗi kiểm tra" });
      toast.error("Kiểm tra kết nối thất bại.");
    } finally {
      setIsTesting(false);
    }
  };

  const saveOutputDir = async (dirPath: string, autoSave: boolean) => {
    setIsSavingOutputDir(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/output-directory",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            custom_output_dir: dirPath,
            auto_save_enabled: autoSave,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCurrentOutputDir(data.current_output_dir);
        setIsCustomOutputDir(Boolean(data.is_custom));
        toast.success(data.message || "Đã lưu cài đặt thư mục xuất file!");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Không thể cập nhật thư mục.");
      }
    } catch (e: any) {
      toast.error(`Lỗi: ${e.message}`);
    } finally {
      setIsSavingOutputDir(false);
    }
  };

  const handleBrowseOutputDir = async () => {
    setIsBrowsingDir(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/browse-directory",
        { method: "POST" },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ok" && data.selected_path) {
          setCustomOutputDir(data.selected_path);
          await saveOutputDir(data.selected_path, autoSaveEnabled);
        } else if (data.status === "unsupported") {
          toast.info("Vui lòng nhập đường dẫn thư mục vào ô bên dưới.");
        }
      }
    } catch (e: any) {
      toast.error(`Lỗi khi mở hộp thoại: ${e.message}`);
    } finally {
      setIsBrowsingDir(false);
    }
  };

  const handleOpenOutputDir = async () => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/open-output-directory",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: currentOutputDir }),
        },
      );
      if (res.ok) {
        toast.success("Đang mở thư mục trong File Explorer...");
      } else {
        toast.error("Không thể mở thư mục.");
      }
    } catch (e: any) {
      toast.error(`Lỗi: ${e.message}`);
    }
  };

  const handleResetOutputDir = async () => {
    setCustomOutputDir("");
    await saveOutputDir("", autoSaveEnabled);
  };

  const handleTestCloudSync = async () => {
    if (isCloudSyncEnabled && !mongoUri.trim()) {
      toast.error(
        "Vui lòng nhập chuỗi kết nối MongoDB URI trước khi kiểm tra!",
      );
      return;
    }
    setIsTestingCloud(true);
    setCloudTestResult(null);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/cloud-sync/test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mongodb_uri: mongoUri.trim(),
            mongodb_db_name: mongoDbName.trim() || "omnivoice",
            r2_account_id: r2AccountId.trim(),
            r2_access_key_id: r2AccessKeyId.trim(),
            r2_secret_access_key: r2SecretAccessKey.trim(),
            r2_bucket_name: r2BucketName.trim(),
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCloudTestResult(data);
        if (data.mongo_ok) {
          toast.success(data.mongo_message);
        } else {
          toast.error(data.mongo_message);
        }
      } else {
        toast.error("Không thể kết nối máy chủ để kiểm tra Cloud Sync.");
      }
    } catch (e: any) {
      toast.error(`Lỗi kiểm tra kết nối: ${e.message}`);
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handlePushAllData = async () => {
    setIsActionSyncLoading(true);
    try {
      await syncAllToCloud();
      toast.success(
        "Đã đồng bộ toàn bộ dự án, lịch sử và từ điển lên Cloud thành công!",
      );
    } catch {
      toast.error("Gặp sự cố khi đồng bộ lên Cloud.");
    } finally {
      setIsActionSyncLoading(false);
    }
  };

  const handlePullAllData = async () => {
    setIsActionSyncLoading(true);
    try {
      await fetchFromCloud();
      toast.success("Đã tải dữ liệu mới nhất từ Cloud về máy!");
    } catch {
      toast.error("Không thể tải dữ liệu từ Cloud.");
    } finally {
      setIsActionSyncLoading(false);
    }
  };

  const handleSaveHardware = async () => {
    if (useRemoteGpu && !remoteUrl.trim()) {
      toast.error("Vui lòng nhập đường dẫn URL của Cloud GPU Worker!");
      return;
    }
    if (isCloudSyncEnabled && !mongoUri.trim()) {
      toast.error(
        "Vui lòng nhập chuỗi kết nối MongoDB URI khi bật lưu dữ liệu lên cloud!",
      );
      return;
    }

    setIsSaving(true);
    try {
      const hwSuccess = await updateHardwareSettings({
        use_remote_gpu: useRemoteGpu,
        remote_gpu_url: remoteUrl.trim(),
        remote_concurrency: concurrency,
      });

      const syncRes = await fetch(
        "http://localhost:8000/api/settings/cloud-sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: isCloudSyncEnabled,
            mongodb_uri: mongoUri.trim(),
            mongodb_db_name: mongoDbName.trim() || "omnivoice",
            r2_account_id: r2AccountId.trim(),
            r2_access_key_id: r2AccessKeyId.trim(),
            r2_secret_access_key: r2SecretAccessKey.trim(),
            r2_bucket_name: r2BucketName.trim(),
            r2_public_url: r2PublicUrl.trim(),
          }),
        },
      );

      if (hwSuccess && syncRes.ok) {
        const syncData = await syncRes.json().catch(() => ({}));
        await checkStorageStatus();
        if (isCloudSyncEnabled) {
          if (syncData.mongo_connected) {
            toast.success(
              "Đã lưu cấu hình & Bật đồng bộ Đám mây (MongoDB Atlas) thành công!",
            );
            syncAllToCloud().catch(() => {});
          } else {
            toast.warning(
              "Đã lưu cấu hình, nhưng chưa thể kết nối MongoDB Atlas. Vui lòng kiểm tra lại chuỗi URI!",
            );
          }
        } else {
          toast.success("Đã lưu cấu hình GPU & Chế độ Cục bộ (Local Mode)!");
        }
      } else if (!syncRes.ok) {
        const errJson = await syncRes.json().catch(() => null);
        toast.error(
          `Không thể lưu Cloud Sync: ${errJson?.detail || "Lỗi máy chủ " + syncRes.status}`,
        );
      } else {
        toast.error("Không thể lưu cấu hình vào file .env.");
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Card chọn Engine */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Option 1: GPU Cục Bộ */}
        <div
          onClick={() => setUseRemoteGpu(false)}
          className={`p-5 rounded-3xl border transition-all cursor-pointer relative flex flex-col justify-between ${
            !useRemoteGpu
              ? "bg-primary/10 border-primary/50 shadow-xl shadow-primary/5 ring-1 ring-primary/20"
              : "bg-surface-variant/30 hover:bg-surface-variant/50 border-white/5 opacity-75 hover:opacity-100"
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    !useRemoteGpu
                      ? "bg-primary text-black font-bold shadow-md shadow-primary/20"
                      : "bg-white/10 text-on-surface"
                  }`}
                >
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-on-surface text-base flex items-center gap-2">
                    GPU Cục Bộ Trên Máy
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Offline 100%
                    </span>
                  </h3>
                </div>
              </div>
              {!useRemoteGpu && (
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>

            <ul className="text-xs text-on-surface-variant space-y-1.5 pt-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Chạy hoàn toàn ngoại tuyến, không cần mạng Internet.
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Không phụ thuộc vào Google Colab hay đường truyền mạng.
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Sử dụng VGA rời NVIDIA hoặc CPU.
              </li>
            </ul>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>Trạng thái:</span>
            <span className="font-mono text-emerald-400">
              {hardwareConfig.cuda_available
                ? `CUDA Sẵn Sàng (${hardwareConfig.cuda_vram_gb || 4} GB VRAM)`
                : "CPU Mode"}
            </span>
          </div>
        </div>

        {/* Option 2: Cloud GPU */}
        <div
          onClick={() => setUseRemoteGpu(true)}
          className={`p-5 rounded-3xl border transition-all cursor-pointer relative flex flex-col justify-between ${
            useRemoteGpu
              ? "bg-primary/10 border-primary/50 shadow-xl shadow-primary/5 ring-1 ring-primary/20"
              : "bg-surface-variant/30 hover:bg-surface-variant/50 border-white/5 opacity-75 hover:opacity-100"
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    useRemoteGpu
                      ? "bg-primary text-black font-bold shadow-md shadow-primary/20"
                      : "bg-white/10 text-on-surface"
                  }`}
                >
                  <CloudLightning className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-on-surface text-base flex items-center gap-2">
                    Cloud GPU Từ Xa
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      Tesla T4 / A100
                    </span>
                  </h3>
                </div>
              </div>
              {useRemoteGpu && (
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>

            <ul className="text-xs text-on-surface-variant space-y-1.5 pt-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                Tận dụng card Tesla T4 (16GB VRAM) miễn phí từ Google Colab.
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                Máy tính của bạn hoàn toàn mát mẻ, không tốn tài nguyên.
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                Tốc độ xử lý chuẩn Studio 32 steps siêu mượt mà.
              </li>
            </ul>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>Yêu cầu:</span>
            <span className="font-mono text-primary">Cần mạng & Bật Colab</span>
          </div>
        </div>
      </div>

      {/* Cấu hình chi tiết Cloud GPU */}
      {useRemoteGpu && (
        <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <Wifi className="w-4 h-4 text-primary" />
              Cấu Hình Đường Dẫn Cloud GPU Worker (Public URL)
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Nhập đường link Ngrok Static Domain, Cloudflare Tunnel hoặc
              Hugging Face Space của bạn.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://tipper-semantic-dropper.ngrok-free.dev"
              className="flex-1 bg-surface-container-lowest/80 border border-white/10 rounded-2xl px-4 py-3 text-xs sm:text-sm text-on-surface font-mono placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all"
            />

            <button
              type="button"
              onClick={handleRunPingTest}
              disabled={isTesting || !remoteUrl.trim()}
              className="px-6 py-3 rounded-2xl bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang kiểm tra...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  Kiểm tra kết nối
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <a
              href="https://colab.research.google.com/github/tranvankha1989/VoxCPM-TTS/blob/main/notebooks/OmniVoice_Colab_T4.ipynb"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:text-primary-hover underline underline-offset-4 font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Mở Google Colab Notebook (T4 16GB)
            </a>

            <span className="text-[11px] text-on-surface-variant">
              💡 Nhớ bấm <strong>Play (Run)</strong> trên Google Colab trước khi
              kiểm tra
            </span>
          </div>

          {testResult && (
            <div
              className={`p-4 rounded-2xl border flex items-start gap-3 text-xs sm:text-sm animate-in fade-in duration-200 ${
                testResult.ok
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="font-bold flex items-center justify-between">
                  <span>
                    {testResult.ok
                      ? "🎉 Máy chủ Cloud GPU đang trực tuyến & sẵn sàng!"
                      : "❌ Không thể kết nối tới máy chủ"}
                  </span>
                  {testResult.ping_ms && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/10">
                      Ping: {testResult.ping_ms} ms
                    </span>
                  )}
                </div>
                {testResult.ok ? (
                  <p className="text-xs opacity-90 font-mono">
                    {testResult.provider} — Card: {testResult.gpu_name} (
                    {testResult.vram_total_gb} GB VRAM)
                  </p>
                ) : (
                  <p className="text-xs opacity-90">{testResult.error}</p>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-white/5">
            <div>
              <span className="text-on-surface font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Số luồng tổng hợp song song (Concurrency):
              </span>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Số đoạn câu gửi đồng thời lên GPU T4 (mặc định 2 luồng là tối ưu
                nhất).
              </p>
            </div>

            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setConcurrency(n)}
                  className={`w-9 h-9 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    concurrency === n
                      ? "bg-primary text-black shadow-md shadow-primary/20 scale-105"
                      : "bg-surface-container-lowest/80 text-on-surface-variant hover:text-on-surface hover:bg-white/10 border border-white/5"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Đồng Bộ Đám Mây & Dữ Liệu */}
      <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
              <Cloud className="w-5 h-5 text-primary" />
              Đồng Bộ Đám Mây & Cơ Sở Dữ Liệu (Cloud Sync)
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Đồng bộ lịch sử âm thanh, dự án và từ điển phát âm giữa nhiều máy
              tính qua MongoDB Atlas & Cloudflare R2.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs px-3 py-1 rounded-full border font-mono font-medium flex items-center gap-1.5",
                isCloudSyncEnabled && syncStatus.mongo_connected
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : isCloudSyncEnabled
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    : "bg-white/5 border-white/10 text-on-surface-variant",
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  isCloudSyncEnabled && syncStatus.mongo_connected
                    ? "bg-emerald-400 animate-pulse"
                    : isCloudSyncEnabled
                      ? "bg-amber-400"
                      : "bg-slate-400",
                )}
              />
              {isCloudSyncEnabled
                ? syncStatus.mongo_connected
                  ? "Cloud Sync Đang Bật"
                  : "Chờ Kết Nối Cloud"
                : "Lưu Cục Bộ (Tắt Cloud)"}
            </span>

            <button
              type="button"
              onClick={() => checkStorageStatus()}
              disabled={isSyncing}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Kiểm tra lại trạng thái kết nối"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")}
              />
            </button>
          </div>
        </div>

        {/* 2 Tùy chọn Bật/Tắt Lưu Dữ Liệu Lên Cloud */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div
            onClick={() => setIsCloudSyncEnabled(false)}
            className={cn(
              "p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between",
              !isCloudSyncEnabled
                ? "bg-primary/10 border-primary/50 shadow-md shadow-primary/5 ring-1 ring-primary/25"
                : "bg-surface-variant/20 hover:bg-surface-variant/40 border-white/5 opacity-70 hover:opacity-100",
            )}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold",
                      !isCloudSyncEnabled
                        ? "bg-primary text-black"
                        : "bg-white/10 text-on-surface",
                    )}
                  >
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-on-surface flex items-center gap-2">
                      Lưu Cục Bộ (Tắt Cloud)
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Mặc định
                      </span>
                    </h4>
                  </div>
                </div>
                {!isCloudSyncEnabled && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Dữ liệu dự án, kịch bản lưu trong LocalStorage trình duyệt. File
                âm thanh lưu tại thư mục{" "}
                <code className="text-primary font-mono text-[11px]">
                  /outputs
                </code>{" "}
                trên máy tính. Không cần tài khoản hay kết nối Internet.
              </p>
            </div>
          </div>

          <div
            onClick={() => setIsCloudSyncEnabled(true)}
            className={cn(
              "p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between",
              isCloudSyncEnabled
                ? "bg-primary/10 border-primary/50 shadow-md shadow-primary/5 ring-1 ring-primary/25"
                : "bg-surface-variant/20 hover:bg-surface-variant/40 border-white/5 opacity-70 hover:opacity-100",
            )}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold",
                      isCloudSyncEnabled
                        ? "bg-primary text-black"
                        : "bg-white/10 text-on-surface",
                    )}
                  >
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-on-surface flex items-center gap-2">
                      Đồng Bộ Đám Mây (Bật Cloud)
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        Đa Thiết Bị
                      </span>
                    </h4>
                  </div>
                </div>
                {isCloudSyncEnabled && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Lưu trữ dữ liệu lên MongoDB Atlas và âm thanh lên Cloudflare R2.
                Tự động đồng bộ lịch sử, dự án khi chuyển đổi giữa laptop và PC.
              </p>
            </div>
          </div>
        </div>

        {/* Khối cấu hình Thư mục lưu trữ Cục Bộ trên Máy Tính */}
        {!isCloudSyncEnabled && (
          <div className="space-y-4 pt-3 border-t border-white/10 animate-fadeIn">
            <div className="p-4 rounded-2xl bg-surface-container-lowest/60 border border-white/5 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-on-surface flex items-center gap-2">
                  <Folder className="w-4 h-4 text-primary" />
                  Thư Mục Lưu Trữ Mặc Định Trên Máy Tính:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBrowseOutputDir}
                    disabled={isBrowsingDir}
                    className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="Mở hộp thoại chọn thư mục trên máy tính"
                  >
                    {isBrowsingDir ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5" />
                    )}
                    <span>Duyệt thư mục...</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenOutputDir}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface border border-white/10 text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Mở thư mục này trong Windows Explorer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Mở thư mục</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={customOutputDir}
                    onChange={(e) => setCustomOutputDir(e.target.value)}
                    placeholder={`Mặc định: ${defaultOutputDir || "outputs"}`}
                    className="flex-1 bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      saveOutputDir(customOutputDir, autoSaveEnabled)
                    }
                    disabled={isSavingOutputDir}
                    className="px-4 py-2 rounded-xl bg-primary text-black font-semibold text-xs flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingOutputDir ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Lưu thư mục</span>
                  </button>
                  {isCustomOutputDir && (
                    <button
                      type="button"
                      onClick={handleResetOutputDir}
                      className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface border border-white/10 text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Đặt lại về thư mục outputs/ mặc định của hệ thống"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Mặc định</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[11px] text-on-surface-variant">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/50">Đang lưu tại:</span>
                    <code
                      className="px-2 py-0.5 rounded bg-black/30 border border-white/5 text-primary font-mono font-medium truncate max-w-[420px]"
                      title={currentOutputDir}
                    >
                      {currentOutputDir || defaultOutputDir}
                    </code>
                    {isCustomOutputDir && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Tùy chọn
                      </span>
                    )}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none hover:text-on-surface transition-colors">
                    <input
                      type="checkbox"
                      checked={autoSaveEnabled}
                      onChange={(e) => {
                        setAutoSaveEnabled(e.target.checked);
                        saveOutputDir(customOutputDir, e.target.checked);
                      }}
                      className="w-3.5 h-3.5 rounded border-white/20 bg-surface-container-lowest text-primary focus:ring-0 cursor-pointer accent-amber-500"
                    />
                    <span>
                      Tự động lưu audio & video khi tạo xong (Không cần bấm Tải
                      về)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cấu hình khi BẬT Cloud Sync */}
        {isCloudSyncEnabled ? (
          <div className="space-y-4 pt-3 border-t border-white/10 animate-fadeIn">
            {/* MongoDB Atlas */}
            <div className="p-4 rounded-2xl bg-surface-container-lowest/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Cơ Sở Dữ Liệu MongoDB Atlas (Bắt buộc cho Kịch bản, Dự án, Từ
                  điển):
                </span>
                <a
                  href="https://www.mongodb.com/cloud/atlas"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  Đăng ký MongoDB Free (512MB){" "}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-on-surface-variant block">
                  Chuỗi Kết Nối MongoDB URI (Connection String):
                </label>
                <div className="relative">
                  <input
                    type={showMongoUriPassword ? "text" : "password"}
                    value={mongoUri}
                    onChange={(e) => setMongoUri(e.target.value)}
                    placeholder="mongodb+srv://username:password@cluster0.mongodb.net/?retryWrites=true&w=majority"
                    className="w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3.5 py-2.5 pr-20 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowMongoUriPassword(!showMongoUriPassword)
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg hover:bg-white/10 text-on-surface-variant hover:text-on-surface text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {showMongoUriPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>{showMongoUriPassword ? "Ẩn" : "Hiện"}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-on-surface-variant block mb-1">
                    Tên Cơ Sở Dữ Liệu (Database Name):
                  </label>
                  <input
                    type="text"
                    value={mongoDbName}
                    onChange={(e) => setMongoDbName(e.target.value)}
                    placeholder="omnivoice"
                    className="w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex items-end">
                  <div className="w-full p-2.5 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant text-[11px]">
                      Trạng thái MongoDB Atlas:
                    </span>
                    {syncStatus.mongo_connected ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã kết nối Cloud
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Chưa kết nối
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Cloudflare R2 */}
            <div className="p-4 rounded-2xl bg-surface-container-lowest/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-on-surface flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400" />
                    Lưu Trữ Âm Thanh Đám Mây - Cloudflare R2 (Tùy chọn):
                  </span>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Miễn phí 10GB lưu trữ & 0đ phí tải xuống (Egress free). Lưu
                    audio online để phát trên mọi máy.
                  </p>
                </div>
                <a
                  href="https://dash.cloudflare.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  Cloudflare R2 <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] text-on-surface-variant block mb-1">
                    R2 Account ID:
                  </label>
                  <input
                    type="text"
                    value={r2AccountId}
                    onChange={(e) => setR2AccountId(e.target.value)}
                    placeholder="Ví dụ: a1b2c3d4e5f6..."
                    className="w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-on-surface-variant block mb-1">
                    R2 Bucket Name:
                  </label>
                  <input
                    type="text"
                    value={r2BucketName}
                    onChange={(e) => setR2BucketName(e.target.value)}
                    placeholder="Ví dụ: omnivoice-audio"
                    className="w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-on-surface-variant block mb-1">
                    R2 Access Key ID:
                  </label>
                  <input
                    type="text"
                    value={r2AccessKeyId}
                    onChange={(e) => setR2AccessKeyId(e.target.value)}
                    placeholder="Access Key ID"
                    className="w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-on-surface-variant block mb-1">
                    R2 Secret Access Key:
                  </label>
                  <div className="relative">
                    <input
                      type={showR2Secret ? "text" : "password"}
                      value={r2SecretAccessKey}
                      onChange={(e) => setR2SecretAccessKey(e.target.value)}
                      placeholder="Secret Access Key"
                      className="w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3 py-2 pr-16 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowR2Secret(!showR2Secret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded hover:bg-white/10 text-on-surface-variant hover:text-on-surface text-[10px] cursor-pointer"
                    >
                      {showR2Secret ? "Ẩn" : "Hiện"}
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] text-on-surface-variant block mb-1">
                    R2 Public Domain / URL (Tùy chọn):
                  </label>
                  <input
                    type="text"
                    value={r2PublicUrl}
                    onChange={(e) => setR2PublicUrl(e.target.value)}
                    placeholder="https://pub-xxxx.r2.dev hoặc để trống"
                    className="w-full bg-surface-container-lowest/90 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-on-surface placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>

            {/* Test kết nối & Đồng bộ */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleTestCloudSync}
                  disabled={isTestingCloud}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-on-surface flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTestingCloud ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      Đang kiểm tra kết nối...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-primary" />
                      Kiểm Tra Kết Nối Cloud
                    </>
                  )}
                </button>

                {syncStatus.mongo_connected && (
                  <>
                    <button
                      type="button"
                      disabled={isActionSyncLoading || isSyncing}
                      onClick={handlePushAllData}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      title="Đẩy dữ liệu hiện tại lên MongoDB Atlas"
                    >
                      <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                      Đẩy lên Cloud
                    </button>

                    <button
                      type="button"
                      disabled={isActionSyncLoading || isSyncing}
                      onClick={handlePullAllData}
                      className="px-3.5 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      title="Tải dữ liệu mới nhất từ MongoDB Atlas về máy"
                    >
                      <RefreshCw
                        className={cn(
                          "w-3.5 h-3.5 text-cyan-400",
                          isSyncing && "animate-spin",
                        )}
                      />
                      Tải về máy
                    </button>
                  </>
                )}
              </div>

              <span className="text-[11px] text-on-surface-variant font-mono">
                💡 Nhấn "Lưu & Áp Dụng Thay Đổi" bên dưới để kích hoạt kết nối.
              </span>
            </div>

            {cloudTestResult && (
              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-1.5 text-xs animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-on-surface">
                    MongoDB Atlas:
                  </span>
                  {cloudTestResult.mongo_ok ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      {cloudTestResult.mongo_message}
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />{" "}
                      {cloudTestResult.mongo_message}
                    </span>
                  )}
                </div>
                {cloudTestResult.r2_message && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface">
                      Cloudflare R2:
                    </span>
                    <span
                      className={
                        cloudTestResult.r2_ok
                          ? "text-emerald-400"
                          : "text-on-surface-variant"
                      }
                    >
                      {cloudTestResult.r2_message}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-black/20 border border-white/5 flex items-center gap-2.5 text-xs text-on-surface-variant animate-fadeIn">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Chế độ Cục Bộ đang bật: Toàn bộ dữ liệu dự án, kịch bản và âm
              thanh lưu an toàn tuyệt đối trên máy tính của bạn, không gửi lên
              bất kỳ máy chủ đám mây nào.
            </span>
          </div>
        )}
      </div>

      {/* Nút Lưu & Áp Dụng */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <span className="text-xs text-on-surface-variant font-mono">
          {isLoadingHardware
            ? "Đang đồng bộ..."
            : "Tự động cập nhật file backend/.env khi lưu"}
        </span>

        <button
          type="button"
          onClick={handleSaveHardware}
          disabled={isSaving}
          className="px-8 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-black font-bold text-sm flex items-center gap-2 shadow-xl shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang lưu cấu hình...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Lưu & Áp Dụng Thay Đổi
            </>
          )}
        </button>
      </div>
    </div>
  );
};
