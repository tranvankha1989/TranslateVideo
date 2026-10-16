import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  Lock,
  KeyRound,
  Shield,
  Clock,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  X,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/constants/api";

export interface LicenseStatus {
  unlocked: boolean;
  tier: "lifetime" | "pro_licensed" | "trial" | "locked" | "expired" | "tampered";
  feature_id: string;
  machine_id: string;
  days_left?: number | null;
  trial_used?: boolean;
  message: string;
}

interface LicenseContextValue {
  status: LicenseStatus | null;
  loading: boolean;
  refreshLicense: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  isModalOpen: boolean;
}

const LicenseContext = createContext<LicenseContextValue>({
  status: null,
  loading: true,
  refreshLicense: async () => {},
  openModal: () => {},
  closeModal: () => {},
  isModalOpen: false,
});

export const useGlobalLicense = () => useContext(LicenseContext);

export const GlobalLicenseGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async (retryCount = 0) => {
    try {
      if (retryCount === 0) {
        setLoading(true);
        setConnectionError(null);
      }
      const res = await fetch(`${API_BASE_URL}/api/license/status?feature_id=app_global`);
      if (res.ok) {
        const data: LicenseStatus = await res.json();
        if (data && typeof data.unlocked === "boolean") {
          setStatus(data);
          setConnectionError(null);
          setLoading(false);
          return;
        }
      }
      throw new Error(`Máy chủ phản hồi mã lỗi HTTP ${res.status}`);
    } catch (err: any) {
      console.warn(`Lỗi kiểm tra bản quyền toàn app (lần ${retryCount + 1}/5):`, err?.message || err);
      // Tự động retry tối đa 4 lần (mỗi lần 1.2s) để chờ FastAPI backend khởi động xong
      if (retryCount < 4) {
        setTimeout(() => {
          fetchStatus(retryCount + 1);
        }, 1200);
      } else {
        setConnectionError("Không thể kết nối đến máy chủ AI (Backend). Vui lòng đảm bảo backend (cửa sổ Terminal) đang chạy ổn định.");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCopyMachineId = () => {
    if (!status?.machine_id) return;
    navigator.clipboard.writeText(status.machine_id);
    setCopied(true);
    toast.success("Đã sao chép Mã thiết bị (HWID) vào bộ nhớ tạm!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = keyInput.trim();
    if (!cleanKey) {
      toast.error("Vui lòng nhập mã kích hoạt!");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/api/license/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: cleanKey,
          feature_id: "app_global",
        }),
      });

      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || "Kích hoạt bản quyền thành công!");
        setKeyInput("");
        setIsModalOpen(false);
        await fetchStatus(0);
      } else {
        toast.error(data.message || "Mã kích hoạt không hợp lệ!");
      }
    } catch (err: any) {
      toast.error(`Lỗi kết nối: ${err.message || "Không thể gửi yêu cầu kích hoạt"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const contextValue: LicenseContextValue = {
    status,
    loading,
    refreshLicense: () => fetchStatus(0),
    openModal: () => setIsModalOpen(true),
    closeModal: () => setIsModalOpen(false),
    isModalOpen,
  };

  // Màn hình tải trạng thái ban đầu
  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#090d16] flex flex-col items-center justify-center z-50 text-zinc-400 space-y-4">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <Shield className="w-5 h-5 text-primary absolute animate-pulse" />
        </div>
        <p className="text-sm font-medium tracking-wide text-zinc-400 animate-pulse">
          Đang xác thực hệ thống bản quyền...
        </p>
      </div>
    );
  }

  // TRƯỜNG HỢP LỖI KẾT NỐI BACKEND (Không phải do bị khóa bản quyền)
  if (!status && connectionError) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#070a12]/95 backdrop-blur-xl flex items-center justify-center p-4 select-none">
        <div className="relative w-full max-w-md bg-[#0d1322] border border-rose-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Chưa Thể Kết Nối Máy Chủ AI</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {connectionError}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchStatus(0)}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-on-primary font-semibold text-sm shadow-lg hover:shadow-primary/20 active:scale-[0.99] transition cursor-pointer"
          >
            Thử Kết Nối Lại
          </button>
        </div>
      </div>
    );
  }

  // Cho phép trang Quản trị Admin được truy cập trên Web mà không bị chặn bởi LicenseGuard
  const isAdminPath = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  if (isAdminPath) {
    return (
      <LicenseContext.Provider value={contextValue}>
        {children}
      </LicenseContext.Provider>
    );
  }

  // TRƯỜNG HỢP 1: ỨNG DỤNG BỊ KHÓA (Hết hạn, chưa kích hoạt hoặc bị tua lùi giờ)
  if (!status?.unlocked) {
    const isExpired = status?.tier === "expired";
    const isTampered = status?.tier === "tampered";

    return (
      <LicenseContext.Provider value={contextValue}>
        <div className="fixed inset-0 z-[9999] bg-[#070a12]/95 backdrop-blur-xl flex items-center justify-center p-4 select-none overflow-y-auto">
          {/* Background Ambient Glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative w-full max-w-lg bg-[#0d1322] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-on-surface">
            {/* Header Icon & Title */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-surface-variant border border-primary/30 shadow-lg shadow-primary/10">
                {isExpired ? (
                  <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
                ) : isTampered ? (
                  <AlertTriangle className="w-8 h-8 text-rose-400 animate-bounce" />
                ) : (
                  <Lock className="w-8 h-8 text-primary" />
                )}
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-white">
                {isExpired
                  ? "Thời Hạn Sử Dụng Đã Kết Thúc"
                  : isTampered
                    ? "Thời Gian Hệ Thống Bất Thường"
                    : "Kích Hoạt Bản Quyền Ứng Dụng"}
              </h1>

              <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
                {isExpired
                  ? "Bản quyền dùng thử của thiết bị đã hết hạn. Vui lòng gửi mã máy bên dưới cho Admin để nhận mã bản quyền mới."
                  : isTampered
                    ? "Hệ thống phát hiện sai lệch ngày giờ hệ điều hành hoặc can thiệp thời gian. Vui lòng đồng bộ lại ngày giờ internet hoặc kích hoạt bản quyền."
                    : "Ứng dụng cần mã kích hoạt để sử dụng. Vui lòng sao chép mã thiết bị bên dưới và gửi cho Quản trị viên."}
              </p>
            </div>

            {/* Khối hiển thị HWID kèm nút Copy */}
            <div className="bg-surface-variant/30 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-zinc-400 font-medium">Mã thiết bị phần cứng (HWID):</div>
                <div className="text-sm font-mono font-bold text-primary tracking-wider">{status?.machine_id}</div>
              </div>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Đã sao chép" : "Sao chép mã"}</span>
              </button>
            </div>

            {/* Form nhập mã kích hoạt */}
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-primary" />
                    Mã kích hoạt bản quyền (Ed25519)
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Dán chuỗi bản quyền do Admin cấp (Bắt đầu bằng ED25519.)..."
                  className="w-full px-4 py-3 bg-black/40 border border-white/15 focus:border-primary rounded-xl text-white placeholder-zinc-500 text-xs font-mono tracking-wider focus:outline-none transition-colors resize-none"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !keyInput.trim()}
                className={cn(
                  "w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg cursor-pointer",
                  submitting || !keyInput.trim()
                    ? "bg-zinc-700/50 text-zinc-500 cursor-not-allowed border border-white/5"
                    : "bg-gradient-to-r from-primary to-primary-hover text-on-primary hover:shadow-primary/25 active:scale-[0.99]",
                )}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Đang kiểm tra chữ ký số...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Xác Thực & Kích Hoạt</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center border-t border-white/5">
              <span className="text-[11px] text-zinc-500">
                OmniVoice Studio &bull; VideoTranslate AI &bull; Bảo mật Offline Ed25519
              </span>
            </div>
          </div>
        </div>
      </LicenseContext.Provider>
    );
  }

  // TRƯỜNG HỢP 2: ỨNG DỤNG ĐÃ MỞ KHÓA (Bản quyền Trial hoặc Lifetime PRO)
  return (
    <LicenseContext.Provider value={contextValue}>
      {children}

      {/* Modal nâng cấp PRO hoặc gia hạn khi người dùng mở thủ công */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative w-full max-w-md bg-[#0d1322] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5 text-on-surface">
            {/* Close button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Nâng Cấp / Gia Hạn Bản Quyền</h3>
                <p className="text-xs text-zinc-400">
                  {status?.tier === "trial"
                    ? `Hiện đang còn ${status.days_left} ngày dùng. Nhập mã mới để gia hạn hoặc lên Vĩnh viễn.`
                    : "Đã kích hoạt bản quyền Vĩnh viễn (PRO)."}
                </p>
              </div>
            </div>

            {/* Machine ID */}
            <div className="bg-surface-variant/30 border border-white/5 rounded-xl p-3 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-medium">Mã thiết bị:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-primary">{status.machine_id}</span>
                <button
                  onClick={handleCopyMachineId}
                  className="p-1 hover:bg-white/10 rounded text-zinc-300 hover:text-white"
                  title="Sao chép"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Key Input Form */}
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Nhập mã kích hoạt (Ed25519)</label>
                <textarea
                  rows={3}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Dán chuỗi bản quyền do Admin cấp..."
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/15 focus:border-primary rounded-xl text-white placeholder-zinc-500 text-xs font-mono tracking-wider focus:outline-none resize-none"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5 text-xs font-medium transition-colors cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={submitting || !keyInput.trim()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {submitting ? "Đang xử lý..." : "Kích Hoạt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LicenseContext.Provider>
  );
};

/**
 * Component Badge hiển thị trạng thái bản quyền trên Header / Sidebar
 */
export const LicenseBadge: React.FC<{ isCollapsed?: boolean }> = ({ isCollapsed = false }) => {
  const { status, openModal } = useGlobalLicense();

  if (!status || !status.unlocked) return null;

  // Bản quyền Vĩnh viễn hoặc Bản quyền PRO có thời hạn
  if (status.tier === "lifetime" || status.tier === "pro_licensed") {
    const isLifetime = status.tier === "lifetime";
    const days = status.days_left;

    if (isCollapsed) {
      return (
        <button
          onClick={openModal}
          className="w-11 h-11 mx-auto rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 transition-all cursor-pointer group relative"
          title={isLifetime ? "Bản quyền Vĩnh viễn (PRO)" : `Bản quyền PRO (Còn ${days} ngày)`}
        >
          <Crown className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
          <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 border border-white/10">
            {isLifetime ? "Bản quyền Vĩnh viễn (PRO)" : `Bản quyền PRO (Còn ${days} ngày)`}
          </div>
        </button>
      );
    }

    return (
      <button
        onClick={openModal}
        className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/25 hover:border-emerald-500/40 flex items-center justify-between text-emerald-300 text-xs transition-all cursor-pointer group shadow-sm"
        title="Nhấp để xem chi tiết bản quyền"
      >
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-emerald-400 group-hover:rotate-12 transition-transform" />
          <span className="font-semibold text-emerald-200">Bản Quyền PRO</span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
          {isLifetime ? "Vĩnh viễn" : `Còn ${days} ngày`}
        </span>
      </button>
    );
  }

  // Bản quyền có thời hạn / Dùng thử
  if (status.tier === "trial") {
    const days = status.days_left ?? 0;
    const isUrgent = days <= 5;

    if (isCollapsed) {
      return (
        <button
          onClick={openModal}
          className={cn(
            "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer group relative",
            isUrgent
              ? "bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 animate-pulse"
              : "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-400",
          )}
          title={`Bản quyền còn ${days} ngày`}
        >
          <Clock className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 border border-white/10">
            Thời hạn còn {days} ngày (Nhấp để gia hạn)
          </div>
        </button>
      );
    }

    return (
      <button
        onClick={openModal}
        className={cn(
          "w-full px-3 py-2 rounded-xl flex items-center justify-between text-xs transition-all cursor-pointer group shadow-sm border",
          isUrgent
            ? "bg-rose-500/10 hover:bg-rose-500/15 border-rose-500/30 text-rose-300"
            : "bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/25 text-amber-300",
        )}
        title="Nhấp để gia hạn hoặc nâng cấp Vĩnh viễn"
      >
        <div className="flex items-center gap-2">
          <Clock
            className={cn(
              "w-4 h-4 transition-transform group-hover:rotate-45",
              isUrgent ? "text-rose-400 animate-pulse" : "text-amber-400",
            )}
          />
          <span className="font-semibold text-white/90">
            Còn <span className="text-amber-300 font-bold">{days} ngày</span>
          </span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors">
          Gia hạn
        </span>
      </button>
    );
  }

  return null;
};
