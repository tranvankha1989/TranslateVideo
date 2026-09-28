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
  Sliders,
  FileCode,
  GitBranch,
  GitCommit,
  ArrowRight,
  ShieldCheck,
  Terminal,
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTTSStore, type TestGpuResult } from "@/store/useTTSStore";
import { APP_VERSION } from "@/constants/version";
import { AppUpdateModal } from "@/components/AppUpdateModal";

export default function Settings() {
  const {
    hardwareConfig,
    fetchHardwareSettings,
    updateHardwareSettings,
    testRemoteGpuConnection,
    openEnvFile,
    reloadBackend,
    isLoadingHardware,
    syncStatus,
    checkStorageStatus,
    isSyncing,
    appVersionInfo,
    fetchAppVersion,
  } = useTTSStore();

  const [activeTab, setActiveTab] = useState<"hardware" | "guide" | "sync" | "studio" | "filter" | "update" | "logs">("hardware");
  const [useRemoteGpu, setUseRemoteGpu] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [concurrency, setConcurrency] = useState(2);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestGpuResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpeningEnv, setIsOpeningEnv] = useState(false);
  const [isReloadingBackend, setIsReloadingBackend] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // ── State Quản Lý Bộ Lọc Quảng Cáo & Dạy AI (Ad Filter) ────────────────────
  const [adRules, setAdRules] = useState<string[]>([]);
  const [isLoadingAdRules, setIsLoadingAdRules] = useState(false);
  const [newAdPhrase, setNewAdPhrase] = useState("");
  const [isAddingAdRule, setIsAddingAdRule] = useState(false);
  const [adRuleSearch, setAdRuleSearch] = useState("");

  const fetchAdRules = async () => {
    setIsLoadingAdRules(true);
    try {
      const res = await fetch("http://localhost:8000/api/settings/ad-filter-rules");
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
      const res = await fetch("http://localhost:8000/api/settings/ad-filter-rules/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: p }),
      });
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
      const res = await fetch("http://localhost:8000/api/settings/ad-filter-rules/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: phraseToDelete }),
      });
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
  const [logStats, setLogStats] = useState<{ total_lines: number; file_size_kb: number; log_path: string } | null>(null);

  const fetchLogContent = async (lines = logLinesCount) => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`http://localhost:8000/api/settings/logs/content?lines=${lines}`);
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
      setIsLoadingLogs(false);
    }
  };

  const handleDownloadLog = () => {
    window.open("http://localhost:8000/api/settings/logs/download", "_blank");
    toast.success("Đang tải file log báo lỗi về máy...");
  };

  const handleOpenLogsFolder = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/settings/logs/open-folder", { method: "POST" });
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
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ nội dung nhật ký cũ không?")) return;
    try {
      const res = await fetch("http://localhost:8000/api/settings/logs/clear", { method: "POST" });
      if (res.ok) {
        toast.success("Đã xóa sạch nội dung nhật ký cũ.");
        await fetchLogContent();
      }
    } catch (err: any) {
      toast.error("Lỗi khi xóa log: " + err.message);
    }
  };



  const handleOpenEnv = async () => {
    setIsOpeningEnv(true);
    try {
      const res = await openEnvFile();
      if (res.ok) {
        toast.success(res.message || "Đã mở file .env bằng Notepad.");
        toast.info("Sau khi chỉnh sửa xong và nhấn Ctrl+S lưu lại, hãy bấm nút 'Làm mới Backend' để áp dụng!");
      } else {
        toast.error(res.message || "Không thể mở file .env.");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi gọi mở file .env.");
    } finally {
      setIsOpeningEnv(false);
    }
  };

  const handleReloadBackend = async () => {
    setIsReloadingBackend(true);
    try {
      const res = await reloadBackend();
      if (res.ok) {
        toast.success(res.message || "Đã làm mới Backend và cập nhật cấu hình .env thành công!");
        await fetchHardwareSettings();
        await checkStorageStatus();
      } else {
        toast.error(res.message || "Làm mới Backend thất bại.");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi làm mới Backend.");
    } finally {
      setIsReloadingBackend(false);
    }
  };

  // Default studio model params stored in localStorage
  const [defaultCfg, setDefaultCfg] = useState(() => {
    try {
      const cur = JSON.parse(localStorage.getItem("tts_model_config") || "{}");
      return cur.cfg_value || 2.0;
    } catch {
      return 2.0;
    }
  });
  const [defaultFormat, setDefaultFormat] = useState<"mp3" | "wav">(() => {
    return (localStorage.getItem("tts_audio_format") as "mp3" | "wav") || "mp3";
  });

  useEffect(() => {
    fetchHardwareSettings();
    checkStorageStatus();
    fetchAppVersion();
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
          `Kết nối thành công tới ${res.provider || "Cloud GPU"} (${res.gpu_name})!`
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

  const handleSaveHardware = async () => {
    if (useRemoteGpu && !remoteUrl.trim()) {
      toast.error("Vui lòng nhập đường dẫn URL của Cloud GPU Worker!");
      return;
    }

    setIsSaving(true);
    try {
      const success = await updateHardwareSettings({
        use_remote_gpu: useRemoteGpu,
        remote_gpu_url: remoteUrl.trim(),
        remote_concurrency: concurrency,
      });

      if (success) {
        toast.success(
          useRemoteGpu
            ? "Đã lưu và kích hoạt chế độ Cloud GPU (Tesla T4)!"
            : "Đã lưu và kích hoạt chế độ GPU Cục Bộ (GTX 1650)!"
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

  const handleSaveStudioDefaults = () => {
    try {
      const config = {
        cfg_value: defaultCfg,
        speed: 1.0,
      };
      localStorage.setItem("tts_model_config", JSON.stringify(config));
      localStorage.setItem("tts_audio_format", defaultFormat);
      toast.success("Đã lưu thiết lập phòng thu mặc định!");
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface flex items-center gap-3">
            <Cpu className="w-7 h-7 text-primary" />
            Cài Đặt Hệ Thống & Bộ Xử Lý GPU
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Quản lý phần cứng tính toán AI, chuyển đổi linh hoạt giữa GPU máy tính và GPU đám mây.
          </p>
        </div>

        {/* Header Action & Status Badge */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Nút Cập Nhật Phiên Bản Mới (Top-Right Action) */}
          <button
            type="button"
            onClick={() => setIsUpdateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 hover:border-primary/50 text-xs font-semibold transition-all shadow-sm shadow-primary/10 group cursor-pointer"
            title="Kiểm tra & Cập nhật phiên bản mới nhất"
          >
            <Sparkles className="w-3.5 h-3.5 transition-transform group-hover:rotate-12 group-hover:scale-110" />
            <span>Cập nhật ứng dụng</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-normal">
              v{appVersionInfo?.version || APP_VERSION}
            </span>
          </button>

          {/* Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-variant/40 border border-white/10 text-xs text-on-surface font-mono w-fit">
            <span
              className={`w-2 h-2 rounded-full ${
                hardwareConfig.use_remote_gpu
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-400"
              }`}
            />
            {hardwareConfig.use_remote_gpu ? (
              <span>Cloud GPU: {hardwareConfig.remote_gpu_url || "Chưa nhập URL"}</span>
            ) : (
              <span>
                Local GPU:{" "}
                {hardwareConfig.cuda_device_name || "NVIDIA GTX 1650 (4GB)"}
              </span>
            )}
          </div>
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
          onClick={() => setActiveTab("guide")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "guide"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Hướng Dẫn Google Colab & Cloud
        </button>

        <button
          onClick={() => setActiveTab("sync")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "sync"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <Cloud className="w-4 h-4" />
          Đồng Bộ Đám Mây & Dữ Liệu
        </button>

        <button
          onClick={() => setActiveTab("studio")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "studio"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Mặc Định Phòng Thu
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
          onClick={() => setActiveTab("update")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "update"
              ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Phiên Bản & Cập Nhật
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
      </div>


      {/* Tab 1: Bộ Xử Lý & GPU */}
      {activeTab === "hardware" && (
        <div className="space-y-6">
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
                        GPU Cục Bộ (Máy Tính)
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Offline 100%
                        </span>
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        {hardwareConfig.cuda_device_name || "NVIDIA GeForce GTX 1650 (4GB)"}
                      </p>
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
                    Sử dụng card rời NVIDIA GTX 1650 4GB VRAM.
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
                      <p className="text-xs text-on-surface-variant">
                        Google Colab GPU (16GB VRAM) hoặc Hugging Face ZeroGPU
                      </p>
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
                  Nhập đường link Ngrok Static Domain, Cloudflare Tunnel hoặc Hugging Face Space của bạn.
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
                  💡 Nhớ bấm <strong>Play (Run)</strong> trên Google Colab trước khi kiểm tra
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
                      <span>{testResult.ok ? "🎉 Máy chủ Cloud GPU đang trực tuyến & sẵn sàng!" : "❌ Không thể kết nối tới máy chủ"}</span>
                      {testResult.ping_ms && (
                        <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/10">
                          Ping: {testResult.ping_ms} ms
                        </span>
                      )}
                    </div>
                    {testResult.ok ? (
                      <p className="text-xs opacity-90 font-mono">
                        {testResult.provider} — Card: {testResult.gpu_name} ({testResult.vram_total_gb} GB VRAM)
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
                    Số đoạn câu gửi đồng thời lên GPU T4 (mặc định 2 luồng là tối ưu nhất).
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

          {/* Card Quản lý trực tiếp file .env & Làm mới Backend */}
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-primary" />
                  Chỉnh Sửa File Cấu Hình Trực Tiếp (.env)
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Mở file <code className="font-mono text-primary px-1.5 py-0.5 rounded bg-white/5 border border-white/10">backend/.env</code> bằng ứng dụng Notepad để tùy biến cấu hình chi tiết (GPU, R2, MongoDB, Port...).
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleOpenEnv}
                  disabled={isOpeningEnv}
                  className="px-4 py-2.5 rounded-2xl bg-surface-variant hover:bg-surface-variant/80 border border-white/10 hover:border-white/20 text-on-surface text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-[1.02] disabled:opacity-50"
                >
                  {isOpeningEnv ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <ExternalLink className="w-4 h-4 text-primary" />
                  )}
                  Mở file .env (Notepad)
                </button>

                <button
                  type="button"
                  onClick={handleReloadBackend}
                  disabled={isReloadingBackend || isLoadingHardware}
                  className="px-4 py-2.5 rounded-2xl bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={cn("w-4 h-4", (isReloadingBackend || isLoadingHardware) && "animate-spin")} />
                  Làm mới Backend
                </button>
              </div>
            </div>
          </div>

          {/* Card Xuất File Log Báo Lỗi & Chẩn Đoán Hệ Thống */}
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>Xuất File Log Báo Lỗi & Chẩn Đoán</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                    app.log
                  </span>
                </h3>
                <p className="text-xs text-on-surface-variant max-w-xl">
                  Tải file nhật ký hoạt động của AI, GPU và lỗi hệ thống để gửi cho kỹ thuật viên chẩn đoán và khắc phục nhanh chóng.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleDownloadLog}
                  className="px-4 py-2.5 rounded-2xl bg-primary hover:brightness-110 text-black font-bold text-xs flex items-center gap-2 shadow-md shadow-primary/20 transition-all cursor-pointer hover:scale-[1.02]"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Log (.log)</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenLogsFolder}
                  className="px-4 py-2.5 rounded-2xl bg-surface-variant hover:bg-surface-variant/80 border border-white/10 hover:border-white/20 text-on-surface text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer hover:scale-[1.02]"
                >
                  <FolderOpen className="w-4 h-4 text-amber-300" />
                  <span>Mở Thư Mục Logs</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("logs");
                    fetchLogContent();
                  }}
                  className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-on-surface text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5 text-blue-400" />
                  <span>Xem Live Log</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action Bar Lưu Thay Đổi */}
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <span className="text-xs text-on-surface-variant font-mono">
              {isLoadingHardware ? "Đang đồng bộ..." : "Tự động cập nhật file backend/.env khi lưu"}
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
        <div className="space-y-6">
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
              Giải pháp tối ưu nhất cho Google Colab: Đăng ký miễn phí 1 tên miền cố định từ Ngrok để không bao giờ phải sửa lại đường link nữa!
            </p>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">Bước 1: Đăng ký tài khoản Ngrok miễn phí</span>
                <p className="text-on-surface-variant text-xs">
                  Truy cập{" "}
                  <a
                    href="https://dashboard.ngrok.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    dashboard.ngrok.com <ExternalLink className="w-3 h-3" />
                  </a>
                  {" "}đăng nhập bằng Google trong 10 giây.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">Bước 2: Lấy Authtoken & Tên miền tĩnh</span>
                <p className="text-on-surface-variant text-xs">
                  Vào mục <strong>Your Authtoken</strong> copy mã token. Sau đó vào mục <strong>Cloud Edge ➔ Domains</strong> bấm nhận 1 domain tĩnh miễn phí (ví dụ: <code className="text-primary font-mono">tipper-semantic-dropper.ngrok-free.dev</code>).
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">Bước 3: Chạy Notebook trên Google Colab</span>
                <p className="text-on-surface-variant text-xs">
                  Mở file notebook <code className="text-primary font-mono">notebooks/OmniVoice_Colab_T4.ipynb</code> trên Google Colab. Nhập Authtoken và Static Domain rồi bấm <strong>Play (▶️)</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                <span className="font-semibold text-primary block">Bước 4: Điền vào ô Cloud GPU URL ở Tab 1</span>
                <p className="text-on-surface-variant text-xs">
                  Dán link domain Ngrok của bạn (ví dụ: <code className="text-primary font-mono">https://tipper-semantic-dropper.ngrok-free.dev</code>) vào ô URL ở Tab 1 và bấm <strong>Lưu & Áp Dụng</strong>. Từ nay về sau mỗi lần dùng chỉ việc mở Colab bấm Play!
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Hugging Face ZeroGPU */}
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                <Cloud className="w-5 h-5 text-emerald-400" />
                Cách 2: Hugging Face Spaces (ZeroGPU A100) — Chạy 24/7 Không Cần Treo Tab
              </h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                Chạy 24/7
              </span>
            </div>

            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Tạo một Space miễn phí trên Hugging Face bằng các file có sẵn trong thư mục <code className="text-primary font-mono">hf_space/</code> của dự án.
              Khi Space chạy, bạn copy đường link Space dán vào ô URL để dùng mọi lúc mọi nơi mà không cần treo máy.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Đồng Bộ & Dữ Liệu */}
      {activeTab === "sync" && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-primary" />
                  Trạng Thái Đồng Bộ Đám Mây (Cloud Sync)
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Đồng bộ lịch sử âm thanh, dự án và từ điển phát âm giữa nhiều máy tính qua MongoDB Atlas & Cloudflare R2.
                </p>
              </div>

              <button
                type="button"
                onClick={() => checkStorageStatus()}
                disabled={isSyncing}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                Kiểm tra lại
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-4 rounded-2xl bg-black/20 border border-white/5 space-y-1">
                <span className="text-xs text-on-surface-variant">Cơ sở dữ liệu (MongoDB Atlas):</span>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {syncStatus.mongo_connected ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Đã kết nối MongoDB Cloud
                    </span>
                  ) : (
                    <span className="text-on-surface-variant flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4" /> Chế độ Cục Bộ (LocalStorage)
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/20 border border-white/5 space-y-1">
                <span className="text-xs text-on-surface-variant">Lưu trữ Audio (Cloudflare R2):</span>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {syncStatus.r2_connected ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Đã kết nối Cloudflare R2
                    </span>
                  ) : (
                    <span className="text-on-surface-variant flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4" /> Lưu cục bộ trong /outputs
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant pt-2 border-t border-white/5">
              💡 Để bật đồng bộ đám mây, chỉ cần điền <code className="text-primary font-mono">MONGODB_URI</code> và thông tin Cloudflare R2 vào file <code className="text-primary font-mono">backend/.env</code>.
            </p>
          </div>
        </div>
      )}

      {/* Tab 4: Mặc Định Phòng Thu */}
      {activeTab === "studio" && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
            <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
              <Sliders className="w-5 h-5 text-primary" />
              Thiết Lập Mặc Định Khi Khởi Tạo Studio
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface">
                  Độ Bám Văn Bản Mặc Định (CFG Guidance):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.1"
                    value={defaultCfg}
                    onChange={(e) => setDefaultCfg(parseFloat(e.target.value))}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold w-10 text-right text-primary">
                    {defaultCfg.toFixed(1)}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Mặc định 2.0 cho giọng nói tự nhiên, truyền cảm nhất.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface">
                  Định Dạng Âm Thanh Xuất Mặc Định:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDefaultFormat("mp3")}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      defaultFormat === "mp3"
                        ? "bg-primary text-black shadow-md shadow-primary/20"
                        : "bg-surface-container-lowest/80 text-on-surface-variant hover:text-on-surface border border-white/5"
                    }`}
                  >
                    MP3 (Nén nhẹ, tải nhanh)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultFormat("wav")}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      defaultFormat === "wav"
                        ? "bg-primary text-black shadow-md shadow-primary/20"
                        : "bg-surface-container-lowest/80 text-on-surface-variant hover:text-on-surface border border-white/5"
                    }`}
                  >
                    WAV (Chuẩn Studio 24kHz nguyên bản)
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={handleSaveStudioDefaults}
                className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-primary/20 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Lưu Thiết Lập Phòng Thu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Bộ Lọc Quảng Cáo & Dạy AI (Ad Filter & Teach AI) */}
      {activeTab === "filter" && (
        <div className="space-y-6">
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
                  Khi bóc tách phụ đề và dịch video tự động, AI sẽ tự động phát hiện và <strong>bỏ qua không đọc các câu quảng cáo</strong>, kêu gọi like/share hoặc giới thiệu nguồn ngoài mà người khác chèn vào.
                </p>
              </div>

              <button
                type="button"
                onClick={() => fetchAdRules()}
                disabled={isLoadingAdRules}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-medium border border-white/10 flex items-center gap-2 transition-all cursor-pointer w-fit shrink-0"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingAdRules && "animate-spin text-primary")} />
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
                  {isAddingAdRule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
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
                  <p className="font-semibold text-on-surface">Chưa có quy tắc lọc nào được lưu.</p>
                  <p>Hãy nhập câu văn hoặc từ khóa quảng cáo ở trên để dạy cho AI bỏ qua.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {adRules
                    .filter((r) => !adRuleSearch || r.toLowerCase().includes(adRuleSearch.toLowerCase()))
                    .map((rule, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-surface-container-lowest/90 border border-white/10 flex items-center justify-between gap-3 group hover:border-primary/30 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-white/5 text-on-surface-variant text-[11px] font-mono flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-medium text-on-surface truncate" title={rule}>
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

      {/* Tab 5: Phiên Bản & Cập Nhật Phần Mềm */}
      {activeTab === "update" && (
        <div className="space-y-6">
          {/* Hero Update Card */}
          <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-primary/15 via-surface-variant/40 to-surface-variant/20 border border-primary/30 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Trình Quản Lý Phiên Bản Tự Động</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-on-surface">
                  VoiceSync AI Pro Studio
                </h2>
                <p className="text-xs sm:text-sm text-on-surface-variant max-w-xl leading-relaxed">
                  Cập nhật các tính năng AI mới nhất, thuật toán khử tạp âm, mô hình dịch phim tự động và tối ưu hóa hiệu năng từ kho mã nguồn GitHub chính thức.
                </p>
              </div>

              {/* Version Badge Box */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-center sm:text-right shrink-0">
                <span className="text-[11px] text-on-surface-variant uppercase tracking-wider block">
                  Phiên bản hiện tại
                </span>
                <span className="text-2xl font-black font-mono text-primary block mt-0.5">
                  v{appVersionInfo?.version || APP_VERSION}
                </span>
                {appVersionInfo?.release_date && (
                  <span className="text-[11px] text-on-surface-variant block mt-1">
                    Ngày phát hành: {appVersionInfo.release_date}
                  </span>
                )}
              </div>
            </div>

            {/* Git Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-white/10">
              <div className="p-3.5 rounded-xl bg-surface-variant/50 border border-white/10 space-y-1">
                <span className="text-[11px] text-on-surface-variant font-medium flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-primary" /> Nhánh Git:
                </span>
                <p className="text-xs font-mono font-semibold text-on-surface">
                  {appVersionInfo?.git_branch || "main"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-variant/50 border border-white/10 space-y-1">
                <span className="text-[11px] text-on-surface-variant font-medium flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5 text-primary" /> Commit Hash:
                </span>
                <p className="text-xs font-mono font-semibold text-on-surface">
                  {appVersionInfo?.git_commit || "HEAD"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-variant/50 border border-white/10 space-y-1">
                <span className="text-[11px] text-on-surface-variant font-medium flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-primary" /> Ngày Commit:
                </span>
                <p className="text-xs font-mono font-semibold text-on-surface">
                  {appVersionInfo?.git_commit_date || "Mới nhất"}
                </p>
              </div>
            </div>

            {/* Release Description / Notes */}
            {appVersionInfo?.description && (
              <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-1.5">
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  📝 Điểm mới trên phiên bản v{appVersionInfo.version}:
                </span>
                <p className="text-xs text-on-surface leading-relaxed">
                  {appVersionInfo.description}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Quy trình có bước xác nhận an toàn, không ảnh hưởng dữ liệu dự án.</span>
              </div>

              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(true)}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-on-primary font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-primary/20 transition-all cursor-pointer active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span>Kiểm Tra & Cập Nhật Phiên Bản Mới</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Hướng Dẫn Cập Nhật Thủ Công Bằng update.bat */}
          <div className="p-6 rounded-3xl bg-surface-variant/30 border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              <span>Tùy chọn: Cập nhật thủ công qua File Batch</span>
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Nếu bạn muốn cập nhật trực tiếp ngoài màn hình hoặc khi không mở trình duyệt, bạn chỉ cần chạy tệp <code className="text-primary font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10">update.bat</code> trong thư mục gốc của phần mềm. File này sẽ tự động chạy lệnh git pull và cập nhật các gói thư viện.
            </p>
          </div>
        </div>
      )}

      {/* Tab 6: Nhật Ký & Báo Lỗi (System Logs & Diagnostic) */}
      {activeTab === "logs" && (
        <div className="space-y-6">
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
                  Ghi lại toàn bộ tiến trình của AI, GPU, kết nối mạng và lỗi chi tiết. Khi cần hỗ trợ kỹ thuật, bạn chỉ cần bấm nút tải file hoặc sao chép nhật ký gửi cho người phát triển.
                </p>
              </div>

              {logStats && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-on-surface">
                    📊 Dung lượng: <strong className="text-primary">{logStats.file_size_kb} KB</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-on-surface">
                    📝 Tổng: <strong className="text-primary">{logStats.total_lines} dòng</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Thanh công cụ hành động (Action Toolbar) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadLog}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:brightness-110 text-black font-bold text-xs flex items-center gap-2 shadow-md shadow-primary/20 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Log Báo Lỗi (.log)</span>
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
                  <RefreshCw className={cn("w-3.5 h-3.5", isLoadingLogs && "animate-spin text-primary")} />
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

          {/* Hộp Tìm Kiếm & Live Log Console */}
          <div className="p-5 md:p-6 rounded-3xl bg-black/60 border border-white/10 space-y-3.5 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Lọc từ khóa: ERROR, WARNING, CUDA, Colab, Prompt..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-variant/40 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant">Hiển thị:</span>
                <select
                  value={logLinesCount}
                  onChange={(e) => {
                    const l = parseInt(e.target.value, 10);
                    setLogLinesCount(l);
                    fetchLogContent(l);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-variant/50 border border-white/10 text-xs text-on-surface focus:outline-none"
                >
                  <option value={100}>100 dòng cuối</option>
                  <option value={300}>300 dòng cuối</option>
                  <option value={500}>500 dòng cuối</option>
                  <option value={1000}>1000 dòng cuối</option>
                </select>
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
                  Chưa có dữ liệu nhật ký nào. Hãy tạo thử giọng hoặc dịch video để ghi nhận hoạt động.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {logContent
                    .split("\n")
                    .filter((line) => !logSearch.trim() || line.toLowerCase().includes(logSearch.toLowerCase()))
                    .map((line, idx) => {
                      const isError = line.includes("[ERROR]") || line.includes("Exception") || line.includes("Traceback") || line.includes("Error:") || line.includes("❌");
                      const isWarn = line.includes("[WARNING]") || line.includes("[WARN]") || line.includes("⚠️");
                      const isSuccess = line.includes("✅") || line.includes("🚀") || line.includes("SUCCESS") || line.includes("thành công");

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "py-0.5 px-1.5 rounded transition-colors whitespace-pre-wrap break-all",
                            isError && "bg-rose-500/15 text-rose-300 font-semibold border-l-2 border-rose-500",
                            isWarn && "bg-amber-500/10 text-amber-300 border-l-2 border-amber-500",
                            isSuccess && "text-emerald-300",
                            !isError && !isWarn && !isSuccess && "text-slate-300 hover:bg-white/5"
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
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
}

