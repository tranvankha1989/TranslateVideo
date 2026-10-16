import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  KeyRound,
  ShieldCheck,
  RotateCcw,
  Copy,
  Check,
  Laptop,
  Calendar,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ShieldAlert,
  Terminal,
  HelpCircle,
  Cpu,
  Layers,
  FileCheck2,
  Trash2,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/constants/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Kiểu dữ liệu cho từng Key và Nhóm Thiết Bị
export interface LicenseItem {
  id: string;
  license_key: string;
  hwid: string;
  tier: string;
  days: number;
  is_lifetime: boolean;
  expiry_date: string;
  client_name: string;
  issued_at: string;
}

export interface DeviceGroup {
  hwid: string;
  client_name: string;
  total_keys: number;
  latest_issued_at: string;
  has_active_lifetime: boolean;
  keys: LicenseItem[];
}

// Kiểm tra môi trường Electron Desktop
const isElectronApp = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    navigator.userAgent.toLowerCase().includes("electron") ||
    !!(window as any).electronAPI
  );
};

export default function AdminLicense() {
  const navigate = useNavigate();
  const isDesktop = isElectronApp();

  // Tab: "issue" | "devices" | "verify" | "reset"
  const [activeTab, setActiveTab] = useState<
    "issue" | "devices" | "verify" | "reset"
  >("issue");

  // Admin Secret
  const [adminSecret, setAdminSecret] = useState<string>(() => {
    return localStorage.getItem("ADMIN_SECRET") || "OMNIDEV2026";
  });

  // State: Quản lý danh sách key theo thiết bị
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [totalStats, setTotalStats] = useState({
    total_devices: 0,
    total_keys: 0,
    total_lifetime: 0,
  });

  // Form State: Issue License
  const [hwid, setHwid] = useState("");
  const [selectedPresetDays, setSelectedPresetDays] = useState<number>(0); // 0 = Lifetime
  const [customDays, setCustomDays] = useState<string>("");
  const [tier, setTier] = useState<"PRO" | "ENTERPRISE">("PRO");
  const [clientName, setClientName] = useState("");
  const [isIssuing, setIsIssuing] = useState(false);
  const [issuedResult, setIssuedResult] = useState<{
    key: string;
    hwid: string;
    tier: string;
    days: number;
    isLifetime: boolean;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Form State: Verify License
  const [verifyKeyInput, setVerifyKeyInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    payload?: any;
    message: string;
  } | null>(null);

  // Form State: Reset State
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{
    ok: boolean;
    hwid: string;
    reset_timestamp: string;
    message: string;
  } | null>(null);

  // Form State: Factory Reset (Wipe Machine)
  const [isWiping, setIsWiping] = useState(false);
  const [wipeResult, setWipeResult] = useState<{
    ok: boolean;
    hwid: string;
    cleared_items: string[];
    message: string;
  } | null>(null);

  // Tự động lưu Admin Secret vào localStorage khi thay đổi
  const handleAdminSecretChange = (val: string) => {
    setAdminSecret(val);
    localStorage.setItem("ADMIN_SECRET", val);
  };

  // Factory Reset: Xóa sạch toàn bộ key và dấu vết trên máy hiện tại
  const handleWipeMachine = async () => {
    if (
      !confirm(
        "⚠️ CẢNH BÁO QUAN TRỌNG:\n\nThao tác này sẽ xoá sạch toàn bộ key bản quyền đang kích hoạt trên máy bạn, đồng thời quét sạch mọi dấu vết trial (Registry, syscache, luồng NTFS ẩn).\n\nMáy tính của bạn sẽ trở về trạng thái nguyên bản giống hệt như lúc vừa mới cài lại Win (bắt đầu lại 30 ngày dùng thử).\n\nBạn có chắc chắn muốn thực hiện?"
      )
    ) {
      return;
    }

    setIsWiping(true);
    setWipeResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/license/wipe-machine`, {
        method: "POST",
        headers: { "X-Admin-Secret": adminSecret },
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setWipeResult(data);
        toast.success("🎉 Đã xóa sạch toàn bộ bản quyền & dấu vết trên máy thành công!");
        fetchLicenseList();
      } else {
        toast.error(data.detail || data.message || "Lỗi dọn dẹp máy");
      }
    } catch (err: any) {
      toast.error(`Lỗi kết nối: ${err?.message || err}`);
    } finally {
      setIsWiping(false);
    }
  };

  // Helper fetch HWID máy hiện tại
  const fetchCurrentMachineId = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/license/machine-id`, {
        headers: { "X-Admin-Secret": adminSecret },
      });
      if (res.ok) {
        const data = await res.json();
        setHwid(data.hwid);
        toast.success(`Đã lấy HWID máy hiện tại: ${data.hwid}`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Không thể lấy HWID (Kiểm tra Secret Key)");
      }
    } catch {
      toast.error("Không thể kết nối đến backend");
    }
  };

  // Helper fetch danh sách key đã cấp theo thiết bị
  const fetchLicenseList = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/license/list`, {
        headers: { "X-Admin-Secret": adminSecret },
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceGroups(data.devices || []);
        setTotalStats({
          total_devices: data.total_devices || 0,
          total_keys: data.total_keys || 0,
          total_lifetime: data.total_lifetime || 0,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Không thể tải danh sách key");
      }
    } catch (e: any) {
      toast.error(`Lỗi tải danh sách: ${e?.message || e}`);
    } finally {
      setIsLoadingList(false);
    }
  };

  // Xóa 1 mã key khỏi lịch sử
  const handleDeleteLicense = async (licenseId: string, deviceHwid: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/license/records/${licenseId}`,
        {
          method: "DELETE",
          headers: { "X-Admin-Secret": adminSecret },
        },
      );
      if (res.ok) {
        toast.success(`Đã xoá mã bản quyền của thiết bị ${deviceHwid}`);
        fetchLicenseList();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Không thể xoá mã key này");
      }
    } catch (e: any) {
      toast.error(`Lỗi khi xoá: ${e?.message || e}`);
    }
  };

  // Nút thao tác nhanh: Cấp thêm key cho thiết bị được chọn
  const handleQuickIssueForDevice = (deviceHwid: string, client: string) => {
    setHwid(deviceHwid);
    if (client && client !== "N/A") {
      setClientName(client);
    }
    setActiveTab("issue");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info(`Đã điền sẵn Mã Thiết Bị: ${deviceHwid}`);
  };

  // Copy mã key cụ thể trong bảng
  const copyLicenseItemKey = (keyStr: string, keyId: string) => {
    navigator.clipboard.writeText(keyStr);
    setCopiedKeyId(keyId);
    toast.success("Đã sao chép License Key vào bộ nhớ tạm!");
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Tự động load HWID máy và danh sách key khi mở trang
  useEffect(() => {
    if (!isDesktop) {
      fetchCurrentMachineId();
      fetchLicenseList();
    }
  }, [isDesktop, adminSecret]);

  // Cấp mã bản quyền (POST /api/admin/license/issue)
  const handleIssueLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hwid.trim()) {
      toast.error("Vui lòng nhập hoặc chọn Mã thiết bị (HWID)");
      return;
    }

    const effectiveDays =
      selectedPresetDays === -1
        ? parseInt(customDays) || 0
        : selectedPresetDays;

    setIsIssuing(true);
    setIssuedResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/license/issue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify({
          hwid: hwid.trim(),
          days: effectiveDays,
          tier: tier,
          client_name: clientName.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setIssuedResult({
          key: data.license_key,
          hwid: data.hwid,
          tier: data.tier,
          days: data.days,
          isLifetime: data.is_lifetime,
        });
        toast.success(data.message || "Tạo mã bản quyền thành công!");
        // Tự động cập nhật lại danh sách key đã cấp
        fetchLicenseList();
      } else {
        toast.error(data.detail || data.message || "Lỗi tạo license");
      }
    } catch (err: any) {
      toast.error(`Lỗi kết nối: ${err?.message || err}`);
    } finally {
      setIsIssuing(false);
    }
  };

  // Xác thực mã bản quyền (POST /api/admin/license/verify)
  const handleVerifyLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyKeyInput.trim()) {
      toast.error("Vui lòng dán chuỗi License Key cần kiểm tra");
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/license/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify({
          license_key: verifyKeyInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setVerifyResult(data);
        if (data.ok) {
          toast.success("Mã hợp lệ và chữ ký Ed25519 toàn vẹn!");
        } else {
          toast.error(data.message || "Chữ ký không hợp lệ");
        }
      } else {
        toast.error(data.detail || "Không có quyền kiểm tra");
      }
    } catch (err: any) {
      toast.error(`Lỗi kết nối: ${err?.message || err}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Reset State (POST /api/admin/license/reset-state)
  const handleResetState = async () => {
    setIsResetting(true);
    setResetResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/license/reset-state`, {
        method: "POST",
        headers: {
          "X-Admin-Secret": adminSecret,
        },
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setResetResult(data);
        toast.success("Đã reset trạng thái kiểm tra thời gian thành công!");
      } else {
        toast.error(data.detail || data.message || "Lỗi reset state");
      }
    } catch (err: any) {
      toast.error(`Lỗi kết nối: ${err?.message || err}`);
    } finally {
      setIsResetting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    toast.success("Đã sao chép License Key vào bộ nhớ tạm!");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Nếu đang chạy trên Electron Desktop -> Không cho phép truy cập
  if (isDesktop) {
    return (
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-3xl bg-surface-variant/20 border border-rose-500/20 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-rose-300">
              Khu Vực Bị Hạn Chế
            </h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Trang Quản trị Cấp Key chỉ khả dụng trong môi trường Web Developer
              (trình duyệt). Bản ứng dụng Desktop (.exe) không thể mở trang này
              vì lý do bảo mật thương mại.
            </p>
          </div>
          <button
            onClick={() => navigate("/")}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface border border-white/10 text-xs font-semibold inline-flex items-center gap-2 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Quay Về Studio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface selection:bg-primary/20 pb-16">
      {/* Top Header đồng bộ với Studio Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-surface-dim/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container border border-white/10 hover:border-primary/40 text-xs text-on-surface-variant hover:text-on-surface transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Về Studio</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-on-surface flex items-center gap-2">
                OmniVoice License Center
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  DEVELOPER ADMIN
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* Admin Secret Protection Input */}
        <div className="flex items-center gap-2.5">
          <Label
            htmlFor="admin-secret"
            className="text-xs text-on-surface-variant font-mono hidden sm:inline"
          >
            X-Admin-Secret:
          </Label>
          <Input
            id="admin-secret"
            type="password"
            value={adminSecret}
            onChange={(e) => handleAdminSecretChange(e.target.value)}
            placeholder="Nhập Secret..."
            className="w-40 sm:w-48 h-8 text-xs font-mono bg-surface-dim border-white/10 focus:border-primary/60 text-on-surface rounded-xl"
          />
        </div>
      </header>

      {/* Main Container - Tối ưu tỷ lệ chuẩn như Settings.tsx */}
      <main className="max-w-[1400px] 2k:max-w-[1800px] mx-auto px-6 pt-8 space-y-6 animate-in fade-in duration-300">
        {/* Page Title & Subtitle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-on-surface flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-primary" />
              Trung Tâm Quản Trị Bản Quyền (License Center)
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Cấp mã bản quyền Offline bằng chữ ký số Ed25519, kiểm tra tính
              toàn vẹn và quản lý mốc thời gian QA.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Ed25519 Engine Sẵn Sàng
            </span>
          </div>
        </div>

        {/* Navigation Tabs - Kiểu dáng phẳng thanh lịch như Settings */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("issue")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "issue"
                ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Cấp Key Mới</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("devices")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "devices"
                ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Quản Lý Key Theo Thiết Bị</span>
            {totalStats.total_devices > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === "devices"
                    ? "bg-black/25 text-black"
                    : "bg-primary/20 text-primary border border-primary/30"
                }`}
              >
                {totalStats.total_devices}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("verify")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "verify"
                ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Kiểm Tra Key</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reset")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs md:text-sm transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "reset"
                ? "bg-primary text-black font-semibold shadow-md shadow-primary/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset QA State</span>
          </button>
        </div>

        {/* ── TAB 1: CẤP KEY MỚI ──────────────────────────────────────────────── */}
        {activeTab === "issue" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form Cấp Key (7 Columns) */}
            <div className="lg:col-span-7 p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-6">
              <div>
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Cấp Mã Bản Quyền Mới (Offline Ed25519)
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Nhập mã phần cứng HWID của khách hàng, chọn gói và thời hạn sử
                  dụng. Mã bản quyền sinh ra được kích hoạt 100% Offline.
                </p>
              </div>

              <form onSubmit={handleIssueLicense} className="space-y-6">
                {/* Mã HWID */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="hwid"
                      className="text-xs font-semibold text-on-surface flex items-center gap-1.5"
                    >
                      <Laptop className="w-3.5 h-3.5 text-primary" />
                      Mã Thiết Bị Khách Hàng (HWID)
                    </Label>
                    <button
                      type="button"
                      onClick={fetchCurrentMachineId}
                      className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                    >
                      Lấy HWID máy này
                    </button>
                  </div>
                  <Input
                    id="hwid"
                    value={hwid}
                    onChange={(e) => setHwid(e.target.value.toUpperCase())}
                    placeholder="VD: TTS-A1B2-C3D4-E5F6-G7H8"
                    className="font-mono text-xs bg-surface-dim border-white/10 focus:border-primary text-on-surface rounded-xl h-10 px-3.5"
                    required
                  />
                </div>

                {/* Lựa chọn Thời Hạn (Presets) */}
                <div className="space-y-2.5">
                  <Label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    Thời Hạn Sử Dụng
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {[
                      { label: "Vĩnh Viễn", days: 0 },
                      { label: "7 Ngày", days: 7 },
                      { label: "30 Ngày", days: 30 },
                      { label: "90 Ngày", days: 90 },
                      { label: "365 Ngày", days: 365 },
                    ].map((preset) => (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => {
                          setSelectedPresetDays(preset.days);
                          setCustomDays("");
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center ${
                          selectedPresetDays === preset.days
                            ? "bg-primary text-black border-primary shadow-sm shadow-primary/20 font-bold"
                            : "bg-surface-dim border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Tùy chỉnh số ngày */}
                  <div className="pt-1 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPresetDays(-1)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        selectedPresetDays === -1
                          ? "bg-primary text-black font-bold border-primary"
                          : "border-white/10 text-on-surface-variant hover:text-on-surface bg-surface-dim"
                      }`}
                    >
                      Số ngày tùy chỉnh:
                    </button>
                    {selectedPresetDays === -1 && (
                      <Input
                        type="number"
                        min="1"
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value)}
                        placeholder="VD: 60, 180..."
                        className="w-36 h-8 text-xs bg-surface-dim border-white/10 text-on-surface rounded-xl"
                        autoFocus
                      />
                    )}
                  </div>
                </div>

                {/* Gói Bản Quyền (Tier) */}
                <div className="space-y-2.5">
                  <Label className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    Gói Bản Quyền (Tier)
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(["PRO", "ENTERPRISE"] as const).map((t) => (
                      <div
                        key={t}
                        onClick={() => setTier(t)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          tier === t
                            ? "bg-primary/10 border-primary/50 shadow-md shadow-primary/5 ring-1 ring-primary/30"
                            : "bg-surface-dim border-white/5 hover:border-white/15"
                        }`}
                      >
                        <div>
                          <div
                            className={`text-sm font-bold flex items-center gap-2 ${tier === t ? "text-primary" : "text-on-surface"}`}
                          >
                            {t}
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-on-surface-variant font-normal">
                              {t === "PRO" ? "Phổ biến" : "Doanh nghiệp"}
                            </span>
                          </div>
                          <div className="text-xs text-on-surface-variant mt-1">
                            {t === "PRO"
                              ? "Mở khóa toàn bộ tính năng Studio, dịch & lồng tiếng"
                              : "Dành cho DN, Studio phòng thu lớn và nhiều máy"}
                          </div>
                        </div>
                        {tier === t && (
                          <div className="w-6 h-6 rounded-full bg-primary text-black flex items-center justify-center shrink-0 ml-3">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tên khách hàng / Ghi chú */}
                <div className="space-y-2">
                  <Label
                    htmlFor="client-name"
                    className="text-xs font-semibold text-on-surface flex items-center gap-1.5"
                  >
                    <User className="w-3.5 h-3.5 text-primary" />
                    Tên Khách Hàng / Ghi Chú (Tùy chọn)
                  </Label>
                  <Input
                    id="client-name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="VD: Anh Nam - Studio Hà Nội (Zalo 0912xxx)"
                    className="text-xs bg-surface-dim border-white/10 text-on-surface rounded-xl h-10 px-3.5"
                  />
                </div>

                {/* Submit Action Bar */}
                <div className="pt-2 flex items-center justify-between gap-4 border-t border-white/5">
                  <div className="text-xs text-on-surface-variant flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-primary" />
                    <span>Thuật toán: Ed25519 (Ký số SHA512)</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isIssuing}
                    className="px-6 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isIssuing ? (
                      <>
                        <Clock className="w-4 h-4 animate-spin" />
                        <span>Đang Ký Số...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>Tạo & Ký Mã Bản Quyền</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Cột hiển thị Kết quả sinh key / Hướng dẫn (5 Columns) */}
            <div className="lg:col-span-5 space-y-6">
              {issuedResult ? (
                <div className="p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-primary/30 space-y-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-on-surface text-sm">
                          Mã Bản Quyền Đã Cấp
                        </h3>
                        <p className="text-[11px] text-on-surface-variant">
                          Chữ ký số hợp lệ và toàn vẹn
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      SUCCESS
                    </span>
                  </div>

                  {/* Meta Badges */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-surface-dim border border-white/5 space-y-1">
                      <span className="text-[11px] text-on-surface-variant">
                        Gói bản quyền:
                      </span>
                      <div className="font-bold text-primary">
                        {issuedResult.tier}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-dim border border-white/5 space-y-1">
                      <span className="text-[11px] text-on-surface-variant">
                        Thời hạn:
                      </span>
                      <div className="font-bold text-on-surface">
                        {issuedResult.isLifetime
                          ? "Vĩnh Viễn (Lifetime)"
                          : `${issuedResult.days} Ngày`}
                      </div>
                    </div>
                  </div>

                  {/* Code box */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-on-surface-variant">
                      <span>Chuỗi License Key:</span>
                      <span className="font-mono text-[10px] text-white/40">
                        Base64 / Ed25519
                      </span>
                    </div>
                    <textarea
                      readOnly
                      rows={5}
                      value={issuedResult.key}
                      className="w-full p-3.5 bg-surface-dim border border-white/10 rounded-xl font-mono text-xs text-primary focus:outline-none select-all resize-none leading-relaxed"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(issuedResult.key)}
                      className="w-full py-2.5 px-4 rounded-xl bg-primary text-black font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20 cursor-pointer"
                    >
                      {copiedKey ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Đã Sao Chép Vào Bộ Nhớ!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Sao Chép Mã Key (1-Click)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            `${API_BASE_URL}/api/license/activate`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                license_key: issuedResult.key,
                              }),
                            },
                          );
                          const data = await res.json();
                          if (res.ok && data.ok) {
                            toast.success(
                              "Đã kích hoạt trực tiếp mã này cho máy hiện tại!",
                            );
                          } else {
                            toast.error(
                              data.detail ||
                                data.message ||
                                "Kích hoạt thất bại",
                            );
                          }
                        } catch {
                          toast.error("Không thể kích hoạt tự động");
                        }
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-surface-dim hover:bg-surface-variant text-on-surface border border-white/10 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span>Kích Hoạt Ngay Cho Máy Này</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Card Hướng Dẫn & Tiêu Chuẩn khi chưa sinh key */
                <div className="p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-5">
                  <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
                    <div className="w-9 h-9 rounded-xl bg-white/5 text-primary flex items-center justify-center border border-white/10">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-on-surface text-sm">
                        Quy Chuẩn Cấp Key Bản Quyền
                      </h3>
                      <p className="text-[11px] text-on-surface-variant">
                        Hướng dẫn quy trình 4 bước
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 text-xs text-on-surface-variant leading-relaxed">
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                        1
                      </span>
                      <p>
                        <strong className="text-on-surface">
                          Nhận mã HWID:
                        </strong>{" "}
                        Khách hàng mở ứng dụng, màn hình khóa sẽ cung cấp chuỗi
                        HWID (VD:{" "}
                        <code className="text-primary font-mono">
                          TTS-XXXX-XXXX...
                        </code>
                        ).
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                        2
                      </span>
                      <p>
                        <strong className="text-on-surface">
                          Thiết lập thời hạn:
                        </strong>{" "}
                        Chọn thời hạn gói mong muốn (Vĩnh viễn hoặc số ngày
                        tương ứng gói dịch vụ).
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                        3
                      </span>
                      <p>
                        <strong className="text-on-surface">
                          Ký số Ed25519:
                        </strong>{" "}
                        Nhấn nút Tạo & Ký Mã. Khóa bí mật (Private Key) nội bộ
                        sẽ tạo chữ ký điện tử không thể làm giả.
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                        4
                      </span>
                      <p>
                        <strong className="text-on-surface">
                          Gửi cho khách hàng:
                        </strong>{" "}
                        Khách hàng dán chuỗi key vào ứng dụng là được mở khóa
                        tức thì mà không cần mạng.
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-on-surface-variant font-mono">
                    <span>Mã hóa: Cryptography 41+</span>
                    <span className="text-primary">Ed25519 Pure Python</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: QUẢN LÝ KEY THEO THIẾT BỊ ───────────────────────────────── */}
        {activeTab === "devices" && (
          <div className="space-y-6">
            {/* 3 Thẻ thống kê nhanh */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-surface-variant/20 border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs text-on-surface-variant font-medium">
                    Thiết Bị Được Quản Lý
                  </p>
                  <p className="text-2xl font-black text-on-surface mt-1">
                    {totalStats.total_devices}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                  <Laptop className="w-5 h-5" />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-surface-variant/20 border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs text-on-surface-variant font-medium">
                    Tổng Mã Key Đã Phát Hành
                  </p>
                  <p className="text-2xl font-black text-on-surface mt-1">
                    {totalStats.total_keys}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-surface-variant/20 border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs text-on-surface-variant font-medium">
                    Bản Quyền Vĩnh Viễn
                  </p>
                  <p className="text-2xl font-black text-emerald-400 mt-1">
                    {totalStats.total_lifetime}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Thanh công cụ: Tìm kiếm + Nút hành động */}
            <div className="p-4 rounded-2xl bg-surface-variant/20 border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo Mã Thiết Bị (HWID), tên khách hàng hoặc chuỗi key..."
                  className="pl-9 pr-9 h-10 text-xs bg-surface-dim border-white/10 text-on-surface rounded-xl focus:border-primary/60"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface text-xs font-bold p-1 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={fetchLicenseList}
                  disabled={isLoadingList}
                  className="px-3.5 py-2 rounded-xl bg-surface-dim hover:bg-white/10 text-on-surface border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Tải lại danh sách"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingList ? "animate-spin text-primary" : ""}`}
                  />
                  <span className="hidden sm:inline">Làm Mới</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("issue");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-4 py-2 rounded-xl bg-primary text-black font-semibold text-xs flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20 cursor-pointer whitespace-nowrap"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Cấp Key Mới</span>
                </button>
              </div>
            </div>

            {/* Danh sách thiết bị (Grouped by HWID) */}
            {(() => {
              const q = searchQuery.trim().toLowerCase();
              const filteredDevices = deviceGroups.filter((dev) => {
                if (!q) return true;
                return (
                  dev.hwid.toLowerCase().includes(q) ||
                  dev.client_name.toLowerCase().includes(q) ||
                  dev.keys.some((k) => k.license_key.toLowerCase().includes(q))
                );
              });

              if (isLoadingList && deviceGroups.length === 0) {
                return (
                  <div className="p-12 text-center rounded-3xl bg-surface-variant/20 border border-white/10 space-y-3">
                    <Clock className="w-8 h-8 text-primary animate-spin mx-auto" />
                    <p className="text-xs text-on-surface-variant">
                      Đang tải danh sách bản quyền từ hệ thống...
                    </p>
                  </div>
                );
              }

              if (filteredDevices.length === 0) {
                return (
                  <div className="p-12 text-center rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 text-on-surface-variant border border-white/10 flex items-center justify-center mx-auto">
                      <Laptop className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-on-surface">
                        {searchQuery
                          ? "Không tìm thấy thiết bị phù hợp"
                          : "Chưa có thiết bị nào được cấp key"}
                      </h4>
                      <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                        {searchQuery
                          ? `Không có kết quả khớp với từ khóa "${searchQuery}". Hãy thử tìm bằng HWID hoặc tên khác.`
                          : "Khi bạn tạo mã bản quyền mới ở Tab 'Cấp Key Mới', hệ thống sẽ tự động lưu trữ và phân nhóm thiết bị tại đây."}
                      </p>
                    </div>
                    {!searchQuery && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("issue")}
                        className="px-5 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs inline-flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-md shadow-primary/20"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Cấp Mã Key Đầu Tiên</span>
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="space-y-5">
                  {filteredDevices.map((device, devIdx) => (
                    <div
                      key={device.hwid || devIdx}
                      className="rounded-3xl bg-surface-variant/20 border border-white/10 hover:border-white/20 transition-all p-5 md:p-6 space-y-4 shadow-sm"
                    >
                      {/* Device Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
                        <div className="flex items-start sm:items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                            <Laptop className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm md:text-base font-bold text-on-surface tracking-wider">
                                {device.hwid}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(device.hwid);
                                  toast.success(
                                    `Đã sao chép HWID: ${device.hwid}`,
                                  );
                                }}
                                className="p-1 rounded-lg hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                                title="Sao chép HWID"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              {device.has_active_lifetime && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                  LIFETIME ACTIVE
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant mt-1">
                              {device.client_name &&
                                device.client_name !== "N/A" && (
                                  <span className="flex items-center gap-1.5 text-on-surface font-medium">
                                    <User className="w-3.5 h-3.5 text-primary" />
                                    {device.client_name}
                                  </span>
                                )}
                              <span>•</span>
                              <span>
                                Cấp gần nhất:{" "}
                                {device.latest_issued_at.replace(" UTC", "")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Thao tác cho thiết bị */}
                        <div className="flex items-center gap-2 self-start md:self-auto">
                          <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] font-mono text-on-surface-variant">
                            {device.total_keys}{" "}
                            {device.total_keys > 1 ? "Keys" : "Key"}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleQuickIssueForDevice(
                                device.hwid,
                                device.client_name,
                              )
                            }
                            className="px-3.5 py-1.5 rounded-xl bg-primary text-black font-semibold text-xs flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Cấp Thêm Key</span>
                          </button>
                        </div>
                      </div>

                      {/* Danh sách các Keys của thiết bị */}
                      <div className="rounded-2xl bg-surface-dim/70 border border-white/5 divide-y divide-white/5 overflow-hidden">
                        <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-white/[0.02] text-[10px] md:text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                          <div className="col-span-6 md:col-span-5">
                            Mã Bản Quyền (License Key)
                          </div>
                          <div className="col-span-2 md:col-span-2">
                            Gói (Tier)
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            Thời Hạn
                          </div>
                          <div className="hidden md:block md:col-span-2">
                            Ngày Cấp
                          </div>
                          <div className="hidden md:block md:col-span-1 text-right">
                            Xóa
                          </div>
                        </div>

                        {device.keys.map((keyItem) => (
                          <div
                            key={keyItem.id}
                            className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-white/[0.03] transition-colors text-xs"
                          >
                            {/* License Key */}
                            <div className="col-span-6 md:col-span-5 flex items-center gap-2">
                              <div
                                className="font-mono text-[11px] text-on-surface truncate bg-black/30 px-2 py-1 rounded-lg border border-white/5 flex-1 select-all"
                                title={keyItem.license_key}
                              >
                                {keyItem.license_key.length > 34
                                  ? `${keyItem.license_key.slice(0, 16)}...${keyItem.license_key.slice(-12)}`
                                  : keyItem.license_key}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  copyLicenseItemKey(
                                    keyItem.license_key,
                                    keyItem.id,
                                  )
                                }
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                                  copiedKeyId === keyItem.id
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                    : "bg-surface-dim hover:bg-white/10 text-on-surface border-white/10"
                                }`}
                                title="Sao chép toàn bộ mã key"
                              >
                                {copiedKeyId === keyItem.id ? (
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            {/* Gói Tier */}
                            <div className="col-span-2 md:col-span-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                  keyItem.tier === "ENTERPRISE"
                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                    : "bg-primary/10 text-primary border border-primary/20"
                                }`}
                              >
                                {keyItem.tier}
                              </span>
                            </div>

                            {/* Thời hạn */}
                            <div className="col-span-4 md:col-span-2">
                              {keyItem.is_lifetime ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 font-mono">
                                  <Sparkles className="w-3 h-3" /> Vĩnh viễn
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-400/90 font-mono">
                                  Hết hạn: {keyItem.expiry_date}
                                </span>
                              )}
                            </div>

                            {/* Ngày cấp */}
                            <div className="hidden md:block md:col-span-2 text-[11px] text-on-surface-variant font-mono truncate">
                              {keyItem.issued_at.replace(" UTC", "")}
                            </div>

                            {/* Nút xóa */}
                            <div className="hidden md:flex md:col-span-1 justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Bạn có chắc muốn xóa mã key này khỏi danh sách thiết bị ${device.hwid}?`,
                                    )
                                  ) {
                                    handleDeleteLicense(
                                      keyItem.id,
                                      device.hwid,
                                    );
                                  }
                                }}
                                className="p-1.5 rounded-lg text-on-surface-variant hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Xóa mã key này khỏi lịch sử"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TAB 3: KIỂM TRA KEY ─────────────────────────────────────────────── */}
        {activeTab === "verify" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Input Form (7 Cols) */}
            <div className="lg:col-span-7 p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-6">
              <div>
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" />
                  Xác Minh Toàn Vẹn Mã Bản Quyền
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Dán bất kỳ chuỗi license key nào (bắt đầu bằng{" "}
                  <code className="text-primary font-mono">ED25519.</code>) để
                  giải mã payload và kiểm tra chữ ký số.
                </p>
              </div>

              <form onSubmit={handleVerifyLicense} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-on-surface">
                    Chuỗi License Key cần kiểm tra:
                  </Label>
                  <textarea
                    rows={6}
                    value={verifyKeyInput}
                    onChange={(e) => setVerifyKeyInput(e.target.value)}
                    placeholder="Dán chuỗi ED25519.ey..."
                    className="w-full p-4 bg-surface-dim border border-white/10 focus:border-primary rounded-xl font-mono text-xs text-on-surface placeholder:text-zinc-500 focus:outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="px-6 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <>
                        <Clock className="w-4 h-4 animate-spin" />
                        <span>Đang Kiểm Tra...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Xác Thực Chữ Ký</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Result Display (5 Cols) */}
            <div className="lg:col-span-5 p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
                <div className="w-9 h-9 rounded-xl bg-white/5 text-primary flex items-center justify-center border border-white/10">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-on-surface text-sm">
                    Kết Quả Xác Minh
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Trạng thái chữ ký và nội dung mã hóa
                  </p>
                </div>
              </div>

              {verifyResult ? (
                <div className="space-y-4">
                  <div
                    className={`p-4 rounded-2xl border flex items-center gap-2.5 ${
                      verifyResult.ok
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                    }`}
                  >
                    {verifyResult.ok ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold leading-relaxed">
                      {verifyResult.message}
                    </span>
                  </div>

                  {verifyResult.payload && (
                    <div className="p-4 bg-surface-dim rounded-2xl border border-white/5 space-y-2 text-xs font-mono text-on-surface-variant">
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-on-surface-variant">HWID:</span>
                        <span className="text-primary font-bold">
                          {verifyResult.payload.hwid}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-on-surface-variant">
                          Gói Tier:
                        </span>
                        <span className="text-on-surface font-bold">
                          {verifyResult.payload.tier}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-on-surface-variant">
                          Hết hạn:
                        </span>
                        <span className="text-on-surface">
                          {verifyResult.payload.exp_date}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/5">
                        <span className="text-on-surface-variant">
                          Thời điểm cấp:
                        </span>
                        <span className="text-on-surface">
                          {verifyResult.payload.created_at}
                        </span>
                      </div>
                      {verifyResult.payload.client && (
                        <div className="flex justify-between py-1">
                          <span className="text-on-surface-variant">
                            Khách hàng:
                          </span>
                          <span className="text-on-surface">
                            {verifyResult.payload.client}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-white/10 bg-surface-dim/40">
                  <Search className="w-8 h-8 text-on-surface-variant/40 mx-auto mb-2" />
                  <div className="text-xs text-on-surface-variant font-medium">
                    Chưa có kết quả kiểm tra
                  </div>
                  <div className="text-[11px] text-on-surface-variant/60 mt-1">
                    Dán License Key ở bên trái và bấm &quot;Xác Thực Chữ
                    Ký&quot;
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: RESET QA STATE ───────────────────────────────────────────── */}
        {activeTab === "reset" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-6">
              <div>
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  Công Cụ Reset Trạng Thái QA (Đồng Hồ & Cờ Tampered)
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Dành riêng cho QA & Tester khi tiến hành thử nghiệm các kịch
                  bản tua lùi hoặc đổi ngày giờ hệ thống.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-amber-200">
                    Quy trình test chuẩn:
                  </strong>{" "}
                  Khi bạn đã chỉnh lại ngày giờ máy tính về đúng thực tế, nút
                  này sẽ đặt lại mốc thời gian lưu trữ nội bộ
                  (`last_run_timestamp`) về thời điểm hiện tại và xóa cờ
                  `tampered`. Bản quyền đã kích hoạt của bạn vẫn sẽ được giữ
                  nguyên an toàn.
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="text-xs text-on-surface-variant">
                  <span>Mục tiêu: Giải phóng cờ tampered & mốc thời gian</span>
                </div>

                <button
                  type="button"
                  onClick={handleResetState}
                  disabled={isResetting}
                  className="px-6 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50"
                >
                  {isResetting ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Đang Xử Lý...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset Mốc Thời Gian Về Hiện Tại</span>
                    </>
                  )}
                </button>
              </div>

              {resetResult && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{resetResult.message}</span>
                  </div>
                  <div className="text-[11px] font-mono text-on-surface-variant pl-6">
                    Mốc thời gian mới: {resetResult.reset_timestamp} (HWID:{" "}
                    {resetResult.hwid})
                  </div>
                </div>
              )}
            </div>

            {/* CARD 2: FACTORY RESET (NHƯ MỚI CÀI LẠI WIN) */}
            <div className="lg:col-span-8 p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-rose-500/20 space-y-6">
              <div>
                <h3 className="text-base font-bold text-rose-300 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-rose-400" />
                  Xoá Toàn Bộ Key & Dấu Vết Trên Máy (Giả Lập Cài Lại Win)
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  Quét sạch file bản quyền đã kích hoạt, dọn dẹp Registry ẩn, syscache và luồng NTFS. Đưa máy tính về trạng thái ban đầu 100% để phục vụ việc kiểm thử vòng đời dùng thử.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 leading-relaxed flex gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-rose-200">
                    Phạm vi tác động của thao tác này:
                  </strong>{" "}
                  Thao tác sẽ xóa bỏ mã kích hoạt hiện tại của máy bạn, trả hệ thống về <strong>Chế độ Dùng thử mới (30 ngày)</strong>. Lưu ý: Danh sách key bạn đã cấp cho khách hàng ở Tab 2 vẫn được bảo tồn để tra cứu hoặc tái kích hoạt bất kỳ lúc nào.
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="text-xs text-on-surface-variant">
                  <span>Mục tiêu: Đưa máy tính về như vừa cài lại Windows</span>
                </div>

                <button
                  type="button"
                  onClick={handleWipeMachine}
                  disabled={isWiping}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isWiping ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Đang Dọn Dẹp Máy...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Xoá Sạch Toàn Bộ Key Trên Máy Này</span>
                    </>
                  )}
                </button>
              </div>

              {wipeResult && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{wipeResult.message}</span>
                  </div>
                  {wipeResult.cleared_items && wipeResult.cleared_items.length > 0 && (
                    <div className="space-y-1 pt-1.5 border-t border-emerald-500/20">
                      <p className="text-[11px] font-semibold text-emerald-400">Các mục đã được dọn dẹp triệt để:</p>
                      <ul className="text-[11px] font-mono text-on-surface-variant space-y-0.5 pl-4 list-disc">
                        {wipeResult.cleared_items.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Thông tin thêm về cơ chế bảo mật (4 Cols) */}
            <div className="lg:col-span-4 p-6 md:p-8 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Layers className="w-4 h-4 text-primary" />
                <h4 className="text-xs font-bold text-on-surface">
                  Cơ Chế Bảo Vệ Thời Gian
                </h4>
              </div>

              <ul className="text-xs text-on-surface-variant space-y-3 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    Hệ thống ghi nhận mốc thời gian cuối cùng (`last_run`) khi
                    app hoạt động.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    Nếu ngày giờ máy tính bị chỉnh lùi về quá khứ $\gt$ 6 tiếng,
                    cờ `tampered` sẽ được kích hoạt để ngăn chặn gian lận dùng
                    thử.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    Mã kích hoạt có bản quyền chính thức sẽ mở khóa vĩnh viễn và
                    không bị giới hạn bởi thời gian dùng thử.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
