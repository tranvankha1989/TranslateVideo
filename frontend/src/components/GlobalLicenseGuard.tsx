import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  Lock,
  KeyRound,
  Shield,
  Clock,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/constants/api";
import { LicenseComparisonModal } from "./LicenseComparisonModal";

export interface LicenseStatus {
  unlocked: boolean;
  tier:
    | "lifetime"
    | "pro_licensed"
    | "trial"
    | "locked"
    | "expired"
    | "tampered";
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

export const GlobalLicenseGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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
      const res = await fetch(
        `${API_BASE_URL}/api/license/status?feature_id=app_global`,
      );
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
      console.warn(
        `Lỗi kiểm tra bản quyền toàn app (lần ${retryCount + 1}/5):`,
        err?.message || err,
      );
      // Tự động retry tối đa 4 lần (mỗi lần 1.2s) để chờ FastAPI backend khởi động xong
      if (retryCount < 4) {
        setTimeout(() => {
          fetchStatus(retryCount + 1);
        }, 1200);
      } else {
        setConnectionError(
          "Không thể kết nối đến máy chủ AI (Backend). Vui lòng đảm bảo backend (cửa sổ Terminal) đang chạy ổn định.",
        );
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
      toast.error(
        `Lỗi kết nối: ${err.message || "Không thể gửi yêu cầu kích hoạt"}`,
      );
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
            <h2 className="text-xl font-bold text-white">
              Chưa Thể Kết Nối Máy Chủ AI
            </h2>
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
  const isAdminPath =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");
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
                <div className="text-[11px] text-zinc-400 font-medium">
                  Mã thiết bị phần cứng (HWID):
                </div>
                <div className="text-sm font-mono font-bold text-primary tracking-wider">
                  {status?.machine_id}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyMachineId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
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
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="w-full py-2 px-3 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Xem Bảng So Sánh Tính Năng (Trial vs PRO)</span>
              </button>
            </form>

            <div className="pt-2 text-center border-t border-white/5">
              <span className="text-[11px] text-zinc-500">
                OmniVoice Studio &bull; VideoTranslate AI &bull; Bảo mật Offline
                Ed25519
              </span>
            </div>
          </div>

          <LicenseComparisonModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            status={status}
            onActivate={async (keyStr) => {
              try {
                setSubmitting(true);
                const res = await fetch(
                  `${API_BASE_URL}/api/license/activate`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      key: keyStr,
                      feature_id: "app_global",
                    }),
                  },
                );
                const data = await res.json();
                if (data.ok) {
                  toast.success(
                    data.message || "Kích hoạt bản quyền thành công!",
                  );
                  await fetchStatus(0);
                  return true;
                } else {
                  toast.error(data.message || "Mã kích hoạt không hợp lệ!");
                  return false;
                }
              } catch (err: any) {
                toast.error(
                  `Lỗi kết nối: ${err.message || "Không thể gửi yêu cầu kích hoạt"}`,
                );
                return false;
              } finally {
                setSubmitting(false);
              }
            }}
            onCopyHwid={handleCopyMachineId}
            copiedHwid={copied}
          />
        </div>
      </LicenseContext.Provider>
    );
  }

  // TRƯỜNG HỢP 2: ỨNG DỤNG ĐÃ MỞ KHÓA (Bản quyền Trial hoặc Lifetime PRO)
  return (
    <LicenseContext.Provider value={contextValue}>
      {children}

      {/* Modal so sánh tính năng Trial vs PRO và kích hoạt bản quyền */}
      <LicenseComparisonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        status={status}
        onActivate={async (keyStr) => {
          try {
            setSubmitting(true);
            const res = await fetch(`${API_BASE_URL}/api/license/activate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                key: keyStr,
                feature_id: "app_global",
              }),
            });
            const data = await res.json();
            if (data.ok) {
              toast.success(data.message || "Kích hoạt bản quyền thành công!");
              await fetchStatus(0);
              return true;
            } else {
              toast.error(data.message || "Mã kích hoạt không hợp lệ!");
              return false;
            }
          } catch (err: any) {
            toast.error(
              `Lỗi kết nối: ${err.message || "Không thể gửi yêu cầu kích hoạt"}`,
            );
            return false;
          } finally {
            setSubmitting(false);
          }
        }}
        onCopyHwid={handleCopyMachineId}
        copiedHwid={copied}
      />
    </LicenseContext.Provider>
  );
};

/**
 * Component Badge hiển thị trạng thái bản quyền trên Header / Sidebar
 */
export const LicenseBadge: React.FC<{ isCollapsed?: boolean }> = ({
  isCollapsed = false,
}) => {
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
          title={
            isLifetime
              ? "Bản quyền Vĩnh viễn (PRO)"
              : `Bản quyền PRO (Còn ${days} ngày)`
          }
        >
          <Crown className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
          <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 border border-white/10">
            {isLifetime
              ? "Bản quyền Vĩnh viễn (PRO)"
              : `Bản quyền PRO (Còn ${days} ngày)`}
          </div>
        </button>
      );
    }

    return (
      <button
        onClick={openModal}
        className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 hover:border-emerald-500/50 flex items-center justify-between text-emerald-300 text-xs transition-all cursor-pointer group shadow-sm"
        title="Nhấp để xem chi tiết bản quyền và bảng so sánh"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Crown className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-12 transition-transform" />
          </div>
          <div className="flex flex-col text-left truncate">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white tracking-tight">
                Bản Quyền
              </span>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 tracking-wider">
                PRO
              </span>
            </div>
            <span className="text-[10px] text-emerald-300/80 font-medium">
              {isLifetime ? "Vĩnh viễn trọn đời" : `Còn ${days} ngày`}
            </span>
          </div>
        </div>

        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 shrink-0">
          {isLifetime ? "PRO" : `${days}d`}
        </span>
      </button>
    );
  }

  // Bản quyền Dùng thử (TRIAL)
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
              : "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400",
          )}
          title={`Gói Dùng Thử (TRIAL) • Còn ${days} ngày • Bấm xem so sánh tính năng`}
        >
          <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform text-amber-400" />
          <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-2 right-2 ring-2 ring-[#0d1322] animate-pulse" />
          <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 border border-white/10">
            <span className="font-bold text-amber-300">Gói TRIAL:</span> Còn{" "}
            {days} ngày (Nhấp xem tính năng & nâng cấp PRO)
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
            ? "bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/30 hover:border-rose-500/50 text-rose-300"
            : "bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30 hover:border-amber-500/50 text-amber-300",
        )}
        title="Nhấp để xem bảng so sánh tính năng Trial & PRO"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Sparkles
              className={cn(
                "w-3.5 h-3.5 transition-transform group-hover:rotate-12",
                isUrgent ? "text-rose-400 animate-pulse" : "text-amber-400",
              )}
            />
          </div>
          <div className="flex flex-col text-left truncate">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white tracking-tight">
                Gói Dùng Thử
              </span>
            </div>
            <span className="text-[10px] text-amber-300/80 font-medium">
              Còn {days} ngày
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-500/20 group-hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 transition-all flex items-center gap-1">
            <span>TRIAL</span>
          </span>
        </div>
      </button>
    );
  }

  return null;
};
