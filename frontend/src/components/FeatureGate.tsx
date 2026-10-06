import React, { useState, useEffect } from "react";
import {
  Lock,
  KeyRound,
  Sparkles,
  Clock,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface LicenseStatus {
  unlocked: boolean;
  tier: "lifetime" | "trial" | "locked" | "expired" | "tampered";
  feature_id: string;
  machine_id: string;
  days_left?: number | null;
  trial_used?: boolean;
  message: string;
}

interface FeatureGateProps {
  featureId?: string;
  featureTitle?: string;
  featureDesc?: string;
  children: React.ReactNode;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  featureId = "video_editor",
  featureTitle = "Trình Chỉnh Sửa Video PRO",
  featureDesc = "Tính năng cắt ghép, chỉnh sửa video và hiệu ứng chuyên sâu thời gian thực.",
  children,
}) => {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/license/status?feature_id=${featureId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Lỗi lấy trạng thái bản quyền:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [featureId]);

  const handleCopyMachineId = () => {
    if (!status?.machine_id) return;
    navigator.clipboard.writeText(status.machine_id);
    setCopied(true);
    toast.success("Đã sao chép Mã máy vào bộ nhớ tạm!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      toast.error("Vui lòng nhập mã kích hoạt hoặc 'demo30'!");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: keyInput.trim(),
          feature_id: featureId,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || "Kích hoạt thành công!");
        setKeyInput("");
        await fetchStatus();
      } else {
        toast.error(data.message || "Mã kích hoạt không hợp lệ!");
      }
    } catch (err: any) {
      toast.error(`Lỗi kết nối: ${err.message || "Không thể kích hoạt"}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-400 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Đang xác thực bản quyền...</span>
      </div>
    );
  }

  // Nếu đã mở khóa (Vĩnh viễn hoặc Dùng thử còn hạn)
  if (status?.unlocked) {
    return (
      <div className="relative w-full h-full">
        {/* Banner thông báo nếu đang dùng thử */}
        {status.tier === "trial" && (
          <div className="mb-4 px-4 py-2.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-xl flex items-center justify-between text-amber-300 text-xs backdrop-blur-sm shadow-sm animate-fade-in">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>
                <strong className="font-semibold text-amber-200">Bản Trải Nghiệm PRO:</strong> Còn{" "}
                <span className="px-1.5 py-0.5 bg-amber-500/20 rounded font-bold text-amber-300">
                  {status.days_left} ngày
                </span>{" "}
                dùng thử miễn phí.
              </span>
            </div>
            <button
              onClick={() => {
                const code = prompt("Nhập mã kích hoạt Vĩnh viễn (PRO):");
                if (code) {
                  setKeyInput(code);
                  handleActivate({ preventDefault: () => {} } as any);
                }
              }}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-200 hover:text-white transition-all text-xs font-medium"
            >
              Nâng cấp Vĩnh viễn
            </button>
          </div>
        )}
        {children}
      </div>
    );
  }

  // Giao diện Khóa Tính Năng (Lock Gate)
  return (
    <div className="flex items-center justify-center min-h-[600px] p-6">
      <div className="relative w-full max-w-lg bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Decorative Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Lock Icon Badge */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 p-0.5 shadow-lg shadow-indigo-500/20 mb-5">
            <div className="w-full h-full bg-zinc-950/80 rounded-[14px] flex items-center justify-center">
              <Lock className="w-8 h-8 text-indigo-400" />
            </div>
          </div>

          {/* Title & Description */}
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xl font-bold text-zinc-100">{featureTitle}</h2>
            <span className="px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 text-[10px] font-extrabold rounded-full tracking-wider uppercase shadow-sm">
              PRO
            </span>
          </div>
          <p className="text-sm text-zinc-400 max-w-sm mb-6 leading-relaxed">
            {featureDesc}
          </p>

          {/* Machine ID Box */}
          <div className="w-full bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 mb-6 flex items-center justify-between text-left">
            <div>
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                Mã Thiết Bị Của Bạn (Machine ID)
              </span>
              <span className="font-mono text-xs font-bold text-indigo-300">
                {status?.machine_id || "Đang quét..."}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyMachineId}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs flex items-center gap-1.5 transition-colors border border-zinc-700/50"
              title="Sao chép mã máy để gửi Admin"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Đã chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>

          {/* Activation Form */}
          <form onSubmit={handleActivate} className="w-full space-y-4">
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Nhập mã kích hoạt hoặc 'demo30'..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950/80 border border-zinc-700/60 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Kích Hoạt Tính Năng</span>
                </>
              )}
            </button>
          </form>

          {/* Trial / Contact Info */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 w-full flex flex-col gap-2 text-xs text-zinc-400">
            {!status?.trial_used ? (
              <div className="flex items-center justify-center gap-1.5 text-indigo-400 font-medium bg-indigo-500/10 py-1.5 rounded-lg border border-indigo-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Nhập mã <strong className="text-white font-mono bg-indigo-600/30 px-1 py-0.5 rounded">demo30</strong> để nhận 30 ngày dùng thử miễn phí!</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5 text-amber-400/90 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Thiết bị này đã sử dụng hết quyền dùng thử 30 ngày.</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 mt-2 text-zinc-500">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
              <span>Liên hệ Admin Zalo/Telegram để nhận mã mở khóa vĩnh viễn</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
