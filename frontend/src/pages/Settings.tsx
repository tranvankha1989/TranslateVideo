import { useState, useEffect } from "react";
import {
  Cpu,
  Server,
  CloudLightning,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Wifi,
  Sparkles,
  Layers,
  Save,
  Loader2,
  HardDrive,
  Cloud,
  RefreshCw,
  BookOpen,
  Download,
  FolderOpen,
  Copy,
  Trash2,
  Search,
  FileText,
  Filter,
  Plus,
  ListFilter,
  ShieldAlert,
  Bug,
  Activity,
  ArrowDownUp,
  Play,
  Pause,
  Eye,
  EyeOff,
  ShieldCheck,
  Database,
  Radio,
  RotateCcw,
  Folder,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useTTSStore,
  type TestGpuResult,
  type CheckUpdateResult,
} from "@/store/useTTSStore";
import { APP_VERSION } from "@/constants/version";
import { AppUpdateModal } from "@/components/AppUpdateModal";
import { FeedbackModal } from "@/components/FeedbackModal";
import { MessageSquarePlus } from "lucide-react";

export default function Settings() {
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
    appVersionInfo,
    fetchAppVersion,
    checkAppUpdate,
  } = useTTSStore();

  const [activeTab, setActiveTab] = useState<
    "hardware" | "filter" | "logs" | "guide"
  >("hardware");
  const [useRemoteGpu, setUseRemoteGpu] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [concurrency, setConcurrency] = useState(2);

  // ── State Quản Lý Lưu Trữ & Đồng Bộ Đám Mây (Cloud Sync) ─────────────────────
  // Mặc định là tắt (Local Mode)
  const [isCloudSyncEnabled, setIsCloudSyncEnabled] = useState(false);
  const [mongoUri, setMongoUri] = useState("");
  const [mongoDbName, setMongoDbName] = useState("omnivoice");
  const [showMongoUriPassword, setShowMongoUriPassword] = useState(false);

  // Cấu hình Cloudflare R2 (Lưu trữ Audio Online - Tùy chọn)
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKeyId, setR2AccessKeyId] = useState("");
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState("");
  const [showR2Secret, setShowR2Secret] = useState(false);
  const [r2BucketName, setR2BucketName] = useState("");
  const [r2PublicUrl, setR2PublicUrl] = useState("");

  // ── State Quản Lý Thư Mục Lưu Trữ Đầu Ra (Custom Output Directory) ─────────
  const [customOutputDir, setCustomOutputDir] = useState("");
  const [defaultOutputDir, setDefaultOutputDir] = useState("");
  const [currentOutputDir, setCurrentOutputDir] = useState("");
  const [isCustomOutputDir, setIsCustomOutputDir] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [isSavingOutputDir, setIsSavingOutputDir] = useState(false);
  const [isBrowsingDir, setIsBrowsingDir] = useState(false);

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

  const handleBrowseOutputDir = async () => {
    setIsBrowsingDir(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/browse-directory",
        {
          method: "POST",
        },
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

  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudTestResult, setCloudTestResult] = useState<{
    mongo_ok: boolean;
    mongo_message: string;
    r2_ok: boolean;
    r2_message: string;
  } | null>(null);
  const [isActionSyncLoading, setIsActionSyncLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestGpuResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] =
    useState<CheckUpdateResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const handleCheckUpdate = async (showToast = false) => {
    setIsCheckingUpdate(true);
    try {
      const res = await checkAppUpdate();
      setUpdateCheckResult(res);
      if (showToast) {
        if (res.has_update) {
          toast.info(
            `Có bản cập nhật mới (${res.commits_behind || 1} cập nhật mới). Sẵn sàng nâng cấp!`,
          );
        } else if (res.ok) {
          toast.success("Hệ thống đang hoạt động trên phiên bản mới nhất!");
        } else {
          toast.error(res.error || "Không thể kiểm tra bản cập nhật.");
        }
      }
    } catch (err: any) {
      if (showToast) {
        toast.error("Lỗi khi kiểm tra cập nhật: " + (err.message || ""));
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // ── State Quản Lý Bộ Lọc Quảng Cáo & Dạy AI (Ad Filter) ────────────────────
  const [adRules, setAdRules] = useState<string[]>([]);
  const [isLoadingAdRules, setIsLoadingAdRules] = useState(false);
  const [newAdPhrase, setNewAdPhrase] = useState("");
  const [isAddingAdRule, setIsAddingAdRule] = useState(false);
  const [adRuleSearch, setAdRuleSearch] = useState("");

  const fetchAdRules = async () => {
    setIsLoadingAdRules(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/ad-filter-rules",
      );
      if (res.ok) {
        const data = await res.json();
        setAdRules(data.rules || []);
      }
    } catch (err) {
      console.warn("Lỗi khi tải quy tắc lọc quảng cáo:", err);
    } finally {
      setIsLoadingAdRules(false);
    }
  };

  const handleAddAdRule = async (phraseToAdd?: string) => {
    const p = (phraseToAdd !== undefined ? phraseToAdd : newAdPhrase).trim();
    if (!p) {
      toast.error("Vui lòng nhập câu hoặc từ khóa cần lọc.");
      return;
    }
    setIsAddingAdRule(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/ad-filter-rules/add",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phrase: p }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setAdRules(data.rules || []);
        setNewAdPhrase("");
        toast.success(`Đã dạy cho AI bỏ qua: "${p}"`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Không thể thêm quy tắc.");
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    } finally {
      setIsAddingAdRule(false);
    }
  };

  const handleDeleteAdRule = async (phraseToDelete: string) => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/ad-filter-rules/delete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phrase: phraseToDelete }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setAdRules(data.rules || []);
        toast.success(`Đã xóa quy tắc: "${phraseToDelete}"`);
      } else {
        toast.error("Không thể xóa quy tắc.");
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };

  // ── State Quản Lý Nhật Ký Hệ Thống (Logs) ──────────────────────────────────
  const [logContent, setLogContent] = useState("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logLinesCount, setLogLinesCount] = useState(300);
  const [logStats, setLogStats] = useState<{
    total_lines: number;
    file_size_kb: number;
    log_path: string;
  } | null>(null);

  // Tự động làm mới Logs: mặc định là Play (đang chạy), chu kỳ 1s - 10s (lưu vào localStorage, mặc định 1s)
  const [isLogAutoRefresh, setIsLogAutoRefresh] = useState(true);
  const [logRefreshInterval, setLogRefreshInterval] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("log_refresh_interval");
      if (saved) {
        const parsed = Number(saved);
        if (parsed >= 1 && parsed <= 10) return parsed;
      }
    } catch {
      // ignore
    }
    return 1;
  });

  // Chế độ Ghi nhật ký chi tiết từng bước (Verbose / Debug Step-by-Step)
  const [verboseLogging, setVerboseLogging] = useState(false);
  const [isTogglingVerbose, setIsTogglingVerbose] = useState(false);

  const fetchVerboseStatus = async () => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/logs/verbose",
      );
      if (res.ok) {
        const data = await res.json();
        setVerboseLogging(Boolean(data.enabled));
      }
    } catch (e) {
      console.warn("Lỗi khi tải trạng thái verbose logging:", e);
    }
  };

  const handleToggleVerboseLogging = async () => {
    const nextVal = !verboseLogging;
    setIsTogglingVerbose(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/logs/verbose",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: nextVal }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setVerboseLogging(nextVal);
        toast.success(
          data.message ||
            (nextVal
              ? "Đã BẬT chế độ ghi log chi tiết từng bước để debug lỗi!"
              : "Đã TẮT chế độ ghi log chi tiết. Quay về ghi log tiêu chuẩn."),
        );
        fetchLogContent();
      } else {
        toast.error("Không thể thay đổi cấu hình log!");
      }
    } catch (err: any) {
      toast.error("Lỗi khi kết nối backend: " + err.message);
    } finally {
      setIsTogglingVerbose(false);
    }
  };

  // Thứ tự hiển thị log: mặc định 'desc' (dòng mới nhất ở trên cùng)
  const [logOrder, setLogOrder] = useState<"desc" | "asc">("desc");

  const fetchLogContent = async (
    lines = logLinesCount,
    order = logOrder,
    showSpinner = true,
  ) => {
    if (showSpinner) setIsLoadingLogs(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/settings/logs/content?lines=${lines}&order=${order}`,
      );
      if (res.ok) {
        const data = await res.json();
        setLogContent(data.content || "");
        setLogStats({
          total_lines: data.total_lines || 0,
          file_size_kb: data.file_size_kb || 0,
          log_path: data.log_path || "",
        });
      }
    } catch (err) {
      console.warn("Lỗi khi tải nhật ký:", err);
    } finally {
      if (showSpinner) setIsLoadingLogs(false);
    }
  };

  // Tự động làm mới logs theo chu kỳ đã chọn (1s - 10s) khi tab logs đang mở và ở trạng thái Play
  useEffect(() => {
    if (activeTab !== "logs") return;

    fetchVerboseStatus();
    fetchLogContent(logLinesCount, logOrder, !logContent);

    if (!isLogAutoRefresh) return;

    const interval = setInterval(() => {
      fetchLogContent(logLinesCount, logOrder, false);
    }, logRefreshInterval * 1000);

    return () => clearInterval(interval);
  }, [
    activeTab,
    logLinesCount,
    logOrder,
    isLogAutoRefresh,
    logRefreshInterval,
  ]);

  const handleToggleLogOrder = () => {
    const nextOrder = logOrder === "desc" ? "asc" : "desc";
    setLogOrder(nextOrder);
    fetchLogContent(logLinesCount, nextOrder, true);
    toast.info(
      nextOrder === "desc"
        ? "Đã chuyển sắp xếp: Mới nhất trên cùng ⬇"
        : "Đã chuyển sắp xếp: Cũ nhất trên cùng ⬆",
    );
  };

  const handleDownloadLog = () => {
    window.open("http://localhost:8000/api/settings/logs/download", "_blank");
    toast.success("Đang tải file log báo lỗi về máy...");
  };

  const handleOpenLogsFolder = async () => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/logs/open-folder",
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Đã mở thư mục logs.");
      } else {
        toast.error(data.detail || "Không thể mở thư mục logs.");
      }
    } catch (err: any) {
      toast.error("Lỗi khi mở thư mục logs: " + err.message);
    }
  };

  const handleCopyLogs = () => {
    if (!logContent) {
      toast.error("Không có nội dung log để sao chép.");
      return;
    }
    navigator.clipboard.writeText(logContent);
    toast.success("Đã sao chép toàn bộ nhật ký vào Clipboard!");
  };

  const handleClearLogs = async () => {
    if (
      !confirm("Bạn có chắc chắn muốn xóa toàn bộ nội dung nhật ký cũ không?")
    )
      return;
    try {
      const res = await fetch("http://localhost:8000/api/settings/logs/clear", {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Đã xóa sạch nội dung nhật ký cũ.");
        await fetchLogContent();
      }
    } catch (err: any) {
      toast.error("Lỗi khi xóa log: " + err.message);
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
    fetchAppVersion();
    fetchVerboseStatus();
    fetchCloudSyncSettings();
    fetchOutputDirInfo();
    handleCheckUpdate(false);
  }, [fetchHardwareSettings, checkStorageStatus, fetchAppVersion]);

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
            // Tự động đồng bộ các dữ liệu hiện có trong LocalStorage lên Cloud
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
    <div className="flex flex-col gap-6 2k:gap-8 animate-in fade-in duration-500 max-w-[1600px] 2k:max-w-[2000px] mx-auto w-full pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface flex items-center gap-3">
            <Cpu className="w-7 h-7 text-primary" />
            Cài Đặt Hệ Thống & Bộ Xử Lý GPU
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Quản lý phần cứng tính toán AI, chuyển đổi linh hoạt giữa GPU máy
            tính và GPU đám mây.
          </p>
        </div>

        {/* Header Action & Status Badge */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Nút Góp Ý & Báo Lỗi (Feedback Button) */}
          <button
            type="button"
            onClick={() => setIsFeedbackModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-xs font-semibold transition-all shadow-sm shadow-emerald-500/10 group cursor-pointer"
            title="Gửi góp ý, báo lỗi kèm file log về Telegram Admin"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            <span>Góp ý & Báo lỗi</span>
          </button>

          {/* Trạng thái phiên bản & Nút Cập Nhật Phiên Bản Mới (Top-Right Action) */}
          {isCheckingUpdate && !updateCheckResult ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-on-surface-variant font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>Kiểm tra phiên bản...</span>
            </div>
          ) : updateCheckResult?.has_update ? (
            /* Khi KHÔNG PHẢI phiên bản mới nhất: Hiện nút Cập nhật ứng dụng nổi bật */
            <button
              type="button"
              onClick={() => setIsUpdateModalOpen(true)}
              className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-primary/20 hover:from-amber-500/30 hover:to-primary/30 text-amber-300 border border-amber-500/40 hover:border-amber-400 text-xs font-semibold transition-all shadow-md shadow-amber-500/10 group cursor-pointer animate-pulse"
              title={`Có bản cập nhật mới (${updateCheckResult.commits_behind || 1} cập nhật mới). Bấm để cập nhật ngay!`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110" />
              <span>Cập nhật ứng dụng</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/30 text-amber-200 font-bold">
                +{updateCheckResult.commits_behind || "Mới"}
              </span>
            </button>
          ) : updateCheckResult?.ok && !updateCheckResult?.has_update ? (
            /* Khi LÀ phiên bản mới nhất: Chỉ hiện thông báo trạng thái tinh tế */
            <div
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-xs font-medium shadow-sm transition-all"
              title="Hệ thống đang hoạt động trên phiên bản mới nhất. Bấm nút xoay để kiểm tra lại."
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Phiên bản mới nhất</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                v{appVersionInfo?.version || APP_VERSION}
              </span>
              <button
                type="button"
                onClick={() => handleCheckUpdate(true)}
                disabled={isCheckingUpdate}
                className="ml-0.5 p-0.5 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-emerald-500/20"
                title="Kiểm tra lại bản cập nhật"
              >
                <RefreshCw
                  className={cn(
                    "w-3 h-3 text-emerald-400 hover:text-emerald-200",
                    isCheckingUpdate && "animate-spin",
                  )}
                />
              </button>
            </div>
          ) : (
            /* Fallback khi chưa kiểm tra hoặc có lỗi mạng */
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 text-on-surface-variant border border-white/10 text-xs font-medium transition-all"
              title="Phiên bản ứng dụng hiện tại"
            >
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-on-surface font-semibold">
                v{appVersionInfo?.version || APP_VERSION}
              </span>
              <button
                type="button"
                onClick={() => handleCheckUpdate(true)}
                disabled={isCheckingUpdate}
                className="flex items-center gap-1 text-[11px] hover:text-primary transition-colors cursor-pointer ml-0.5"
                title="Bấm để kiểm tra bản cập nhật mới nhất"
              >
                <RefreshCw
                  className={cn(
                    "w-3 h-3",
                    isCheckingUpdate && "animate-spin text-primary",
                  )}
                />
                <span>Kiểm tra cập nhật</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("hardware")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "hardware"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <Cpu className="w-4 h-4" />
          Bộ Xử Lý & GPU
        </button>

        <button
          onClick={() => {
            setActiveTab("filter");
            fetchAdRules();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "filter"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <Filter className="w-4 h-4" />
          Bộ Lọc & Dạy AI (Quảng Cáo)
        </button>

        <button
          onClick={() => {
            setActiveTab("logs");
            fetchLogContent();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "logs"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <FileText className="w-4 h-4" />
          Nhật Ký & Báo Lỗi (Logs)
        </button>

        <button
          onClick={() => setActiveTab("guide")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "guide"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Tài Liệu Hướng Dẫn & Cấu Hình Cloud
        </button>
      </div>

      {/* Tab 1: Bộ Xử Lý & GPU */}
      {activeTab === "hardware" && (
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
                <span className="font-mono text-primary">
                  Cần mạng & Bật Colab
                </span>
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

              {/* Quick Link tới Colab */}
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
                  💡 Nhớ bấm <strong>Play (Run)</strong> trên Google Colab trước
                  khi kiểm tra
                </span>
              </div>

              {/* Banner Kết quả Test Ping */}
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

              {/* Tùy chọn Số luồng song song */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-white/5">
                <div>
                  <span className="text-on-surface font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Số luồng tổng hợp song song (Concurrency):
                  </span>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Số đoạn câu gửi đồng thời lên GPU T4 (mặc định 2 luồng là
                    tối ưu nhất).
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

          {/* ── Section 2: Đồng Bộ Đám Mây & Dữ Liệu (Cloud Database & Storage Sync) ── */}
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-primary" />
                  Đồng Bộ Đám Mây & Cơ Sở Dữ Liệu (Cloud Sync)
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Đồng bộ lịch sử âm thanh, dự án và từ điển phát âm giữa nhiều
                  máy tính qua MongoDB Atlas & Cloudflare R2.
                </p>
              </div>

              {/* Status Badge */}
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

            {/* ── 2 Tùy chọn Bật/Tắt Lưu Dữ Liệu Lên Cloud ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Option 1: Tắt Cloud - Chế độ Cục Bộ (Mặc định) */}
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
                    Dữ liệu dự án, kịch bản lưu trong LocalStorage trình duyệt.
                    File âm thanh lưu tại thư mục{" "}
                    <code className="text-primary font-mono text-[11px]">
                      /outputs
                    </code>{" "}
                    trên máy tính. Không cần tài khoản hay kết nối Internet.
                  </p>
                </div>
              </div>

              {/* Option 2: Bật Cloud - Đồng Bộ Đa Thiết Bị */}
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
                    Lưu trữ dữ liệu lên MongoDB Atlas và âm thanh lên Cloudflare
                    R2. Tự động đồng bộ lịch sử, dự án khi chuyển đổi giữa
                    laptop và PC.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Khối cấu hình Thư mục lưu trữ Cục Bộ trên Máy Tính (khi KHÔNG bật Cloud) ── */}
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
                          Tự động lưu audio & video khi tạo xong (Không cần bấm
                          Tải về)
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Các ô input Setup cần thiết khi BẬT Cloud Sync ── */}
            {isCloudSyncEnabled ? (
              <div className="space-y-4 pt-3 border-t border-white/10 animate-fadeIn">
                {/* 1. Cấu hình MongoDB Atlas */}
                <div className="p-4 rounded-2xl bg-surface-container-lowest/60 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-on-surface flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      Cơ Sở Dữ Liệu MongoDB Atlas (Bắt buộc cho Kịch bản, Dự án,
                      Từ điển):
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
                            <CheckCircle2 className="w-3.5 h-3.5" /> Đã kết nối
                            Cloud
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Chưa kết
                            nối
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Cấu hình Cloudflare R2 (Lưu trữ file âm thanh online - Tùy chọn) */}
                <div className="p-4 rounded-2xl bg-surface-container-lowest/60 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-on-surface flex items-center gap-2">
                        <Radio className="w-4 h-4 text-cyan-400" />
                        Lưu Trữ Âm Thanh Đám Mây - Cloudflare R2 (Tùy chọn):
                      </span>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        Miễn phí 10GB lưu trữ & 0đ phí tải xuống (Egress free).
                        Lưu audio online để phát trên mọi máy.
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

                {/* 3. Kiểm tra kết nối & Thao tác đồng bộ */}
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
                    💡 Nhấn "Lưu & Áp Dụng Thay Đổi" bên dưới để kích hoạt kết
                    nối.
                  </span>
                </div>

                {/* Kết quả kiểm tra Test Cloud (nếu có) */}
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
              /* Khi TẮT Lưu Cloud - Hiển thị card xác nhận chế độ cục bộ */
              <div className="p-3.5 rounded-2xl bg-black/20 border border-white/5 flex items-center gap-2.5 text-xs text-on-surface-variant animate-fadeIn">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Chế độ Cục Bộ đang bật: Toàn bộ dữ liệu dự án, kịch bản và âm
                  thanh lưu an toàn tuyệt đối trên máy tính của bạn, không gửi
                  lên bất kỳ máy chủ đám mây nào.
                </span>
              </div>
            )}
          </div>
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
      )}

      {/* Tab 2: Hướng Dẫn Google Colab & Cloud */}
      {activeTab === "guide" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Card 1: Hướng dẫn Google Colab + Ngrok Static Domain */}
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Cách 1: Google Colab T4 GPU + Ngrok Static Domain (Khuyên Dùng)
              </h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium">
                Cấu hình 1 lần - Dùng mãi mãi
              </span>
            </div>

            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Giải pháp tối ưu nhất cho Google Colab: Đăng ký miễn phí 1 tên
              miền cố định từ Ngrok để không bao giờ phải sửa lại đường link
              nữa!
            </p>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">
                  Bước 1: Đăng ký tài khoản Ngrok miễn phí
                </span>
                <p className="text-on-surface-variant text-xs">
                  Truy cập{" "}
                  <a
                    href="https://dashboard.ngrok.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    dashboard.ngrok.com <ExternalLink className="w-3 h-3" />
                  </a>{" "}
                  đăng nhập bằng Google trong 10 giây.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">
                  Bước 2: Lấy Authtoken & Tên miền tĩnh
                </span>
                <p className="text-on-surface-variant text-xs">
                  Vào mục <strong>Your Authtoken</strong> copy mã token. Sau đó
                  vào mục <strong>Cloud Edge ➔ Domains</strong> bấm nhận 1
                  domain tĩnh miễn phí (ví dụ:{" "}
                  <code className="text-primary font-mono">
                    tipper-semantic-dropper.ngrok-free.dev
                  </code>
                  ).
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">
                  Bước 3: Chạy Notebook trên Google Colab
                </span>
                <p className="text-on-surface-variant text-xs">
                  Mở file notebook{" "}
                  <code className="text-primary font-mono">
                    notebooks/OmniVoice_Colab_T4.ipynb
                  </code>{" "}
                  trên Google Colab. Nhập Authtoken và Static Domain rồi bấm{" "}
                  <strong>Play (▶️)</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">
                  Bước 4: Điền vào ô Cloud GPU URL ở Tab 1
                </span>
                <p className="text-on-surface-variant text-xs">
                  Dán link domain Ngrok của bạn (ví dụ:{" "}
                  <code className="text-primary font-mono">
                    https://tipper-semantic-dropper.ngrok-free.dev
                  </code>
                  ) vào ô URL ở Tab 1 và bấm <strong>Lưu & Áp Dụng</strong>. Từ
                  nay về sau mỗi lần dùng chỉ việc mở Colab bấm Play!
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Hugging Face ZeroGPU */}
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                <Cloud className="w-5 h-5 text-emerald-400" />
                Cách 2: Hugging Face Spaces (ZeroGPU A100) — Chạy 24/7 Không Cần
                Treo Tab
              </h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                Chạy 24/7
              </span>
            </div>

            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Tạo một Space miễn phí trên Hugging Face bằng các file có sẵn
              trong thư mục{" "}
              <code className="text-primary font-mono">hf_space/</code> của dự
              án. Khi Space chạy, bạn copy đường link Space dán vào ô URL để
              dùng mọi lúc mọi nơi mà không cần treo máy.
            </p>
          </div>
        </div>
      )}

      {/* Tab 5: Bộ Lọc Quảng Cáo & Dạy AI (Ad Filter & Teach AI) */}
      {activeTab === "filter" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Card Hero: Dạy AI & Cấu Hình Bộ Lọc */}
          <div className="p-6 md:p-8 rounded-3xl bg-surface-variant/40 border border-white/10 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-semibold">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Bộ Lọc Thông Minh & Dạy AI</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-on-surface">
                  Lọc Câu Quảng Cáo & Từ Khóa Cần Bỏ Qua
                </h2>
                <p className="text-xs sm:text-sm text-on-surface-variant max-w-2xl leading-relaxed">
                  Khi bóc tách phụ đề và dịch video tự động, AI sẽ tự động phát
                  hiện và <strong>bỏ qua không đọc các câu quảng cáo</strong>,
                  kêu gọi like/share hoặc giới thiệu nguồn ngoài mà người khác
                  chèn vào.
                </p>
              </div>

              <button
                type="button"
                onClick={() => fetchAdRules()}
                disabled={isLoadingAdRules}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-medium border border-white/10 flex items-center gap-2 transition-all cursor-pointer w-fit shrink-0"
              >
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5",
                    isLoadingAdRules && "animate-spin text-primary",
                  )}
                />
                <span>Tải lại</span>
              </button>
            </div>

            {/* Input Form: Dạy thêm từ/câu mới */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4">
              <label className="text-xs font-bold text-on-surface flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                Dạy thêm câu văn hoặc cụm từ quảng cáo mới cho AI:
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  value={newAdPhrase}
                  onChange={(e) => setNewAdPhrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddAdRule();
                    }
                  }}
                  placeholder="Ví dụ: Cảm ơn các bạn đã xem video, Link mua hàng bên dưới..."
                  className="w-full flex-1 px-4 py-3 rounded-xl bg-surface-container-lowest/90 border border-white/10 focus:border-primary/50 text-on-surface text-sm placeholder:text-on-surface-variant/40 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => handleAddAdRule()}
                  disabled={isAddingAdRule || !newAdPhrase.trim()}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-black font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 shrink-0 cursor-pointer"
                >
                  {isAddingAdRule ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>Dạy cho AI</span>
                </button>
              </div>

              {/* Quick Preset Chips */}
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-medium text-on-surface-variant block">
                  Gợi ý câu quảng cáo phổ biến (bấm để thêm nhanh):
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Hãy like và subscribe kênh",
                    "Xem thêm tại link dưới mô tả",
                    "Phụ đề được dịch bởi",
                    "Quảng cáo tài trợ bởi",
                    "Nhớ bấm chuông thông báo",
                    "Chúc các bạn một ngày vui vẻ",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAddAdRule(chip)}
                      className="px-3 py-1 rounded-lg bg-white/5 hover:bg-primary/20 text-on-surface-variant hover:text-primary border border-white/10 hover:border-primary/30 text-xs transition-all cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Danh sách các quy tắc AI đã học */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-on-surface">
                    Danh sách câu/từ khóa đang áp dụng ({adRules.length}):
                  </span>
                </div>

                {/* Search in rules */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-on-surface-variant/60 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={adRuleSearch}
                    onChange={(e) => setAdRuleSearch(e.target.value)}
                    placeholder="Tìm kiếm từ khóa..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-lowest/80 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/40 outline-none"
                  />
                </div>
              </div>

              {isLoadingAdRules ? (
                <div className="p-8 text-center text-on-surface-variant text-xs flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Đang tải dữ liệu quy tắc...</span>
                </div>
              ) : adRules.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-black/20 border border-dashed border-white/10 text-on-surface-variant text-xs space-y-1">
                  <p className="font-semibold text-on-surface">
                    Chưa có quy tắc lọc nào được lưu.
                  </p>
                  <p>
                    Hãy nhập câu văn hoặc từ khóa quảng cáo ở trên để dạy cho AI
                    bỏ qua.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {adRules
                    .filter(
                      (r) =>
                        !adRuleSearch ||
                        r.toLowerCase().includes(adRuleSearch.toLowerCase()),
                    )
                    .map((rule, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-surface-container-lowest/90 border border-white/10 flex items-center justify-between gap-3 group hover:border-primary/30 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-white/5 text-on-surface-variant text-[11px] font-mono flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span
                            className="text-xs font-medium text-on-surface truncate"
                            title={rule}
                          >
                            {rule}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdRule(rule)}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:text-red-400 hover:bg-red-400/10 opacity-70 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                          title="Xóa câu này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Nhật Ký & Báo Lỗi (System Logs & Diagnostic) */}
      {activeTab === "logs" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Card Tiêu Đề & Thống Kê */}
          <div className="p-6 md:p-8 rounded-3xl bg-surface-variant/30 border border-white/5 space-y-4 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg md:text-xl font-bold text-on-surface">
                    Nhật Ký Hệ Thống & Chẩn Đoán Lỗi (Logfile)
                  </h2>
                </div>
                <p className="text-xs text-on-surface-variant max-w-2xl">
                  Ghi lại toàn bộ tiến trình của AI, GPU, kết nối mạng và lỗi
                  chi tiết. Khi cần hỗ trợ kỹ thuật, bạn chỉ cần bấm nút tải
                  file hoặc sao chép nhật ký gửi cho người phát triển.
                </p>
              </div>

              {logStats && (
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
                  {/* Nhóm điều khiển Tự động làm mới: Play/Stop & Lựa chọn chu kỳ 1s - 10s */}
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all",
                      isLogAutoRefresh
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                        : "bg-amber-500/10 border-amber-500/25 text-amber-300",
                    )}
                  >
                    {/* Nút Play / Stop (Mặc định là Play - đang chạy) */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isLogAutoRefresh;
                        setIsLogAutoRefresh(next);
                        toast.info(
                          next
                            ? `▶️ Đã BẬT tự động làm mới logs (${logRefreshInterval}s)`
                            : "⏸️ Đã TẠM DỪNG tự động làm mới để bạn dễ dàng xem logs",
                        );
                      }}
                      className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-xs",
                        isLogAutoRefresh
                          ? "bg-emerald-500 text-black hover:bg-emerald-400"
                          : "bg-amber-500 text-black hover:bg-amber-400",
                      )}
                      title={
                        isLogAutoRefresh
                          ? "Nhấp để TẠM DỪNG tự động làm mới để soi logs"
                          : "Nhấp để TIẾP TỤC tự động làm mới logs"
                      }
                    >
                      {isLogAutoRefresh ? (
                        <Pause className="w-3.5 h-3.5 fill-black" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-black ml-0.5" />
                      )}
                    </button>

                    {/* Hiệu ứng đèn ping khi đang Play */}
                    {isLogAutoRefresh && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}

                    <span className="font-sans font-medium text-[11px]">
                      {isLogAutoRefresh ? "Tự động làm mới:" : "Đã tạm dừng:"}
                    </span>

                    {/* Bộ chọn chu kỳ từ 1s đến 10s */}
                    <select
                      value={logRefreshInterval}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setLogRefreshInterval(val);
                        try {
                          localStorage.setItem(
                            "log_refresh_interval",
                            String(val),
                          );
                        } catch {
                          // ignore
                        }
                        toast.success(`Đã lưu chu kỳ làm mới logs: ${val}s`);
                      }}
                      className="bg-black/50 text-on-surface font-mono font-bold text-xs px-2 py-0.5 rounded-lg border border-white/10 focus:outline-none focus:border-primary cursor-pointer hover:bg-black/70 transition-colors"
                      title="Chọn chu kỳ tự động làm mới từ 1s đến 10s (tự động ghi nhớ)"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}s
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-on-surface">
                    📊 Dung lượng:{" "}
                    <strong className="text-primary">
                      {logStats.file_size_kb} KB
                    </strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-on-surface">
                    📝 Tổng:{" "}
                    <strong className="text-primary">
                      {logStats.total_lines} dòng
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Thanh công cụ hành động (Action Toolbar) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
              <div className="flex flex-wrap items-center gap-2">
                {/* Nút Gửi Phản Hồi & Logs Cho Admin */}
                <button
                  type="button"
                  onClick={() => setIsFeedbackModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  <span>Gửi Phản Hồi & Logs Cho Admin</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadLog}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:brightness-110 text-black font-bold text-xs flex items-center gap-2 shadow-md shadow-primary/20 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Log (.log)</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenLogsFolder}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-on-surface font-semibold text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4 text-amber-300" />
                  <span>Mở Thư Mục Chứa Log</span>
                </button>

                <button
                  type="button"
                  onClick={() => fetchLogContent()}
                  disabled={isLoadingLogs}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn(
                      "w-3.5 h-3.5",
                      isLoadingLogs && "animate-spin text-primary",
                    )}
                  />
                  <span>Làm Mới</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-400" />
                  <span>Sao Chép Tất Cả</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleClearLogs}
                className="px-3.5 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-rose-500/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa Nhật Ký Cũ</span>
              </button>
            </div>
          </div>

          {/* Card Bật/Tắt Ghi Nhật Ký Chi Tiết Từng Bước (Verbose / Debug Step-by-Step) */}
          <div className="p-5 md:p-6 rounded-3xl bg-surface-variant/30 border border-white/10 space-y-4 backdrop-blur-md relative overflow-hidden shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                      verboseLogging
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-md shadow-amber-500/10"
                        : "bg-white/5 text-on-surface-variant border border-white/10",
                    )}
                  >
                    <Bug className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                    <span>
                      Chế Độ Ghi Nhật Ký Chi Tiết Từng Bước (Debug Step Logs)
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border",
                        verboseLogging
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-white/10 text-on-surface-variant border-white/15",
                      )}
                    >
                      {verboseLogging
                        ? "ĐANG BẬT (VERBOSE DEBUG)"
                        : "TIÊU CHUẨN (NORMAL)"}
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {verboseLogging
                    ? "Hệ thống đang ghi chép toàn bộ tiến trình chạy chi tiết của ứng dụng (lệnh FFmpeg, tham số Whisper, phản hồi AI dịch, quá trình tách nhạc Demucs, cân chỉnh timeline âm thanh và lỗi ngầm) vào app.log để phục vụ chẩn đoán lỗi."
                    : "Hệ thống đang ghi nhật ký ở mức tiêu chuẩn (INFO). Bật tính năng này nếu bạn gặp lỗi cần ghi lại toàn bộ quá trình chạy từng bước để kiểm tra nguyên nhân."}
                </p>
              </div>

              {/* Nút Toggle Switch */}
              <button
                type="button"
                onClick={handleToggleVerboseLogging}
                disabled={isTogglingVerbose}
                className={cn(
                  "px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2.5 transition-all shadow-lg cursor-pointer shrink-0 disabled:opacity-50",
                  verboseLogging
                    ? "bg-amber-400 hover:bg-amber-300 text-black shadow-amber-500/25"
                    : "bg-white/10 hover:bg-white/15 text-on-surface border border-white/15",
                )}
              >
                {isTogglingVerbose ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
                <span>
                  {verboseLogging
                    ? "Tắt Chế Độ Ghi Chi Tiết"
                    : "Bật Ghi Chi Tiết Từng Bước"}
                </span>
              </button>
            </div>
          </div>

          {/* Hộp Tìm Kiếm & Live Log Console */}
          <div className="p-5 md:p-6 rounded-3xl bg-black/60 border border-white/10 space-y-3.5 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-lg">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Lọc từ khóa: ERROR, WARNING, DEBUG-STEP, Whisper, Prompt..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-variant/40 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setLogSearch(logSearch === "DEBUG-STEP" ? "" : "DEBUG-STEP")
                  }
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shrink-0",
                    logSearch === "DEBUG-STEP"
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-400"
                      : "bg-white/5 text-on-surface-variant hover:text-on-surface border-white/10",
                  )}
                >
                  🔍 Debug Steps
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleLogOrder}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-variant/50 hover:bg-surface-variant/80 border border-white/10 text-xs text-on-surface flex items-center gap-1.5 transition-all cursor-pointer font-medium"
                  title="Thay đổi thứ tự hiển thị dòng log"
                >
                  <ArrowDownUp className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {logOrder === "desc"
                      ? "Mới nhất trên cùng ⬇"
                      : "Cũ nhất trên cùng ⬆"}
                  </span>
                </button>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-on-surface-variant">
                    Hiển thị:
                  </span>
                  <select
                    value={logLinesCount}
                    onChange={(e) => {
                      const l = parseInt(e.target.value, 10);
                      setLogLinesCount(l);
                      fetchLogContent(l, logOrder);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-variant/50 border border-white/10 text-xs text-on-surface focus:outline-none"
                  >
                    <option value={100}>100 dòng</option>
                    <option value={300}>300 dòng</option>
                    <option value={500}>500 dòng</option>
                    <option value={1000}>1000 dòng</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Màn Hình Terminal Console */}
            <div className="relative rounded-2xl bg-[#0a0d14] border border-white/10 p-4 font-mono text-[11px] md:text-xs leading-relaxed max-h-[500px] overflow-y-auto select-text scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {isLoadingLogs ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span>Đang đọc file nhật ký app.log...</span>
                </div>
              ) : !logContent ? (
                <div className="py-12 text-center text-on-surface-variant/60">
                  Chưa có dữ liệu nhật ký nào. Hãy tạo thử giọng hoặc dịch video
                  để ghi nhận hoạt động.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {logContent
                    .split("\n")
                    .filter((line) => line.trim().length > 0)
                    .filter(
                      (line) =>
                        !logSearch.trim() ||
                        line.toLowerCase().includes(logSearch.toLowerCase()),
                    )
                    .map((line, idx) => {
                      const isError =
                        line.includes("[ERROR]") ||
                        line.includes("Exception") ||
                        line.includes("Traceback") ||
                        line.includes("Error:") ||
                        line.includes("❌");
                      const isWarn =
                        line.includes("[WARNING]") ||
                        line.includes("[WARN]") ||
                        line.includes("⚠️");
                      const isSuccess =
                        line.includes("✅") ||
                        line.includes("🚀") ||
                        line.includes("SUCCESS") ||
                        line.includes("thành công");
                      const isStep =
                        line.includes("[DEBUG-STEP]") ||
                        line.includes("🔍") ||
                        line.includes("[DEBUG-MODE]");

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "py-0.5 px-1.5 rounded transition-colors whitespace-pre-wrap break-all",
                            isError &&
                              "bg-rose-500/15 text-rose-300 font-semibold border-l-2 border-rose-500",
                            isWarn &&
                              "bg-amber-500/10 text-amber-300 border-l-2 border-amber-500",
                            isSuccess && "text-emerald-300",
                            isStep &&
                              !isError &&
                              "bg-cyan-500/10 text-cyan-300 font-medium border-l-2 border-cyan-400",
                            !isError &&
                              !isWarn &&
                              !isSuccess &&
                              !isStep &&
                              "text-slate-300 hover:bg-white/5",
                          )}
                        >
                          {line}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Cập Nhật Tích Hợp Xác Nhận */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          handleCheckUpdate(false);
          fetchAppVersion();
        }}
      />

      {/* Modal Góp Ý & Báo Lỗi Cho Admin */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />
    </div>
  );
}
