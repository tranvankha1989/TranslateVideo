import React, { useState } from "react";
import {
  X,
  Crown,
  Sparkles,
  Check,
  KeyRound,
  Copy,
  Zap,
  Shield,
  Clock,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LicenseStatus } from "./GlobalLicenseGuard";

interface LicenseComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: LicenseStatus | null;
  onActivate: (key: string) => Promise<boolean>;
  onCopyHwid: () => void;
  copiedHwid: boolean;
}

interface FeatureItem {
  title: string;
  category: string;
  trial: {
    text: string;
    allowed: boolean;
    badge?: string;
  };
  pro: {
    text: string;
    allowed: boolean;
    badge?: string;
    highlight?: boolean;
  };
}

const COMPARISON_FEATURES: FeatureItem[] = [
  {
    category: "Quyền Hạn & Thời Gian Sử Dụng",
    title: "Thời Hạn Sử Dụng",
    trial: {
      text: "Giới hạn thời gian (Mặc định 7 ngày trải nghiệm)",
      allowed: true,
      badge: "Có thời hạn",
    },
    pro: {
      text: "Sử dụng vĩnh viễn trọn đời (Lifetime), không giới hạn",
      allowed: true,
      badge: "Vĩnh Viễn",
      highlight: true,
    },
  },
  {
    category: "Phòng Thu Âm AI (Studio TTS)",
    title: "Độ Dài Ký Tự Xuất Âm Thanh",
    trial: {
      text: "Tối đa 2.000 ký tự / lần xuất âm thanh",
      allowed: true,
      badge: "Giới hạn 2k",
    },
    pro: {
      text: "Không giới hạn số lượng ký tự (Xuất cả sách/truyện dài)",
      allowed: true,
      badge: "Không giới hạn",
      highlight: true,
    },
  },
  {
    category: "Phòng Thu Âm AI (Studio TTS)",
    title: "Chất Lượng Âm Thanh 24kHz & Tinh Chỉnh",
    trial: {
      text: "Bộ giọng mẫu tiêu chuẩn & tinh chỉnh ngữ điệu cơ bản",
      allowed: true,
    },
    pro: {
      text: "Toàn bộ Preset giọng Studio chất lượng cao 24kHz chuẩn phòng thu",
      allowed: true,
      highlight: true,
    },
  },
  {
    category: "Phụ Đề & Dịch Video (Auto Caption)",
    title: "Xuất Phụ Đề Video (.SRT / .VTT)",
    trial: {
      text: "Giới hạn tối đa 2 phút đầu tiên của video",
      allowed: true,
      badge: "Tối đa 2 phút",
    },
    pro: {
      text: "Xuất toàn bộ 100% thời lượng video, không giới hạn độ dài",
      allowed: true,
      badge: "Full Độ Dài",
      highlight: true,
    },
  },
  {
    category: "Nhân Bản Giọng Đọc (Voice Cloning)",
    title: "Tạo Giọng Cá Nhân Hóa (Custom Voice)",
    trial: {
      text: "Trải nghiệm tạo giọng cơ bản với dữ liệu mẫu",
      allowed: true,
    },
    pro: {
      text: "Nhân bản giọng nói không giới hạn từ mẫu audio thực tế",
      allowed: true,
      highlight: true,
    },
  },
  {
    category: "Dịch Vụ & Bảo Hành",
    title: "Cập Nhật Tính Năng & Hỗ Trợ Kỹ Thuật",
    trial: {
      text: "Hỗ trợ tài liệu hướng dẫn cộng đồng",
      allowed: true,
    },
    pro: {
      text: "Cập nhật phiên bản mới liên tục + Hỗ trợ kỹ thuật ưu tiên 1-1",
      allowed: true,
      highlight: true,
    },
  },
];

export const LicenseComparisonModal: React.FC<LicenseComparisonModalProps> = ({
  isOpen,
  onClose,
  status,
  onActivate,
  onCopyHwid,
  copiedHwid,
}) => {
  const [activeTab, setActiveTab] = useState<"comparison" | "activate">(
    "comparison",
  );
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const isPro =
    status?.unlocked &&
    (status?.tier === "lifetime" || status?.tier === "pro_licensed");
  const isTrial = status?.unlocked && status?.tier === "trial";
  const daysLeft = status?.days_left ?? 0;

  const handleSubmitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      toast.error("Vui lòng nhập chuỗi mã bản quyền kích hoạt!");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onActivate(keyInput.trim());
      if (ok) {
        setKeyInput("");
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 select-none overflow-y-auto">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-amber-500/10 via-primary/10 to-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-5xl bg-[#0d1322] border border-white/15 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="relative px-6 py-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-surface-variant/20">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-primary/20 to-emerald-500/20 border border-white/15 flex items-center justify-center text-white shadow-md">
              <Flame className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  So Sánh Gói Bản Quyền & Tính Năng
                </h2>
                {isPro ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    BẢN QUYỀN PRO
                  </span>
                ) : isTrial ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    ĐANG DÙNG THỬ ({daysLeft} NGÀY)
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                VideoTranslate AI &bull; OmniVoice Studio &bull; Trực quan hóa
                giá trị giữa bản Trial và PRO
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Switcher */}
            <div className="hidden sm:flex items-center p-1 bg-black/40 border border-white/10 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab("comparison")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === "comparison"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Bảng So Sánh</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("activate")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                  activeTab === "activate"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Nhập Mã Kích Hoạt</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher for Mobile */}
        <div className="flex sm:hidden p-2 border-b border-white/10 bg-black/30 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("comparison")}
            className={cn(
              "flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === "comparison"
                ? "bg-primary text-on-primary"
                : "text-zinc-400 bg-white/5",
            )}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Bảng So Sánh</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("activate")}
            className={cn(
              "flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === "activate"
                ? "bg-primary text-on-primary"
                : "text-zinc-400 bg-white/5",
            )}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Nhập Mã</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {activeTab === "comparison" ? (
            <>
              {/* Top Highlights Banner */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: Gói Dùng Thử (Trial) */}
                <div
                  className={cn(
                    "relative p-5 rounded-2xl border transition-all duration-200",
                    isTrial
                      ? "bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/20"
                      : "bg-surface-variant/20 border-white/10",
                  )}
                >
                  {isTrial && (
                    <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40">
                      Đang sử dụng
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        Bản Dùng Thử (TRIAL)
                      </h3>
                      <span className="text-[11px] text-amber-300/80 font-medium">
                        Miễn phí làm quen & trải nghiệm đầy đủ tính năng
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5 text-xs text-zinc-300">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">
                        Giới hạn Studio TTS:
                      </span>
                      <span className="font-medium text-zinc-300">
                        Tối đa 2.000 ký tự / lần
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">
                        Giới hạn Auto Caption:
                      </span>
                      <span className="font-medium text-zinc-300">
                        2 phút đầu video
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Bản Quyền Vĩnh Viễn (PRO) */}
                <div
                  className={cn(
                    "relative p-5 rounded-2xl border transition-all duration-200",
                    isPro
                      ? "bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30"
                      : "bg-gradient-to-br from-emerald-500/10 via-primary/10 to-transparent border-emerald-500/30 hover:border-emerald-500/50 shadow-lg shadow-emerald-500/5",
                  )}
                >
                  <div className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    {isPro ? (
                      <>
                        <Check className="w-3 h-3" /> Đã Kích Hoạt
                      </>
                    ) : (
                      <>
                        <Crown className="w-3 h-3 text-amber-300" /> Khuyên Dùng
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                      <Crown className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        Bản Quyền Vĩnh Viễn (PRO)
                      </h3>
                      <span className="text-[11px] text-emerald-300/80 font-medium">
                        Toàn quyền sử dụng không giới hạn trọn đời
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5 text-xs text-zinc-300">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">
                        Giới hạn Studio TTS:
                      </span>
                      <span className="font-bold text-emerald-300">
                        Không giới hạn
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">
                        Giới hạn Auto Caption:
                      </span>
                      <span className="font-bold text-emerald-300">
                        Full 100% video
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chi Tiết Bảng So Sánh Tính Năng (Detailed Feature Matrix) */}
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/15">
                <div className="p-3.5 bg-black/40 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    <Shield className="w-4 h-4 text-primary" />
                    <span>Bảng Đối Chiếu Tính Năng Chi Tiết</span>
                  </div>
                </div>

                <div className="divide-y divide-white/5">
                  {COMPARISON_FEATURES.map((feat, idx) => (
                    <div
                      key={idx}
                      className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Tiêu chí */}
                      <div className="md:col-span-4 space-y-0.5">
                        <span className="text-[10px] text-zinc-400 font-mono tracking-wider uppercase block">
                          {feat.category}
                        </span>
                        <div className="text-xs sm:text-sm font-semibold text-white">
                          {feat.title}
                        </div>
                      </div>

                      {/* Gói Trial */}
                      <div className="md:col-span-4 flex items-start gap-2 bg-black/25 md:bg-transparent p-2 md:p-0 rounded-xl border border-white/5 md:border-transparent">
                        <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                          {feat.trial.badge ? (
                            <Clock className="w-3 h-3 text-amber-400" />
                          ) : (
                            <Check className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-zinc-300 font-medium leading-relaxed">
                              {feat.trial.text}
                            </span>
                          </div>
                          {feat.trial.badge && (
                            <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                              {feat.trial.badge}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Gói PRO */}
                      <div className="md:col-span-4 flex items-start gap-2 bg-emerald-500/5 md:bg-transparent p-2 md:p-0 rounded-xl border border-emerald-500/20 md:border-transparent">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-emerald-400 font-bold" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-emerald-200 font-semibold leading-relaxed">
                              {feat.pro.text}
                            </span>
                          </div>
                          {feat.pro.badge && (
                            <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {feat.pro.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Call-to-action Footer */}
              {!isPro && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-primary/10 to-transparent border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                      <Crown className="w-4 h-4 text-emerald-400" />
                      <span>Bạn đã có mã bản quyền PRO từ Quản trị viên?</span>
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Chuyển sang tab Kích Hoạt hoặc bấm nút bên phải để mở khóa
                      ngay lập tức.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("activate")}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all cursor-pointer shrink-0 flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Nhập Mã Kích Hoạt PRO</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Tab Nhập Mã Kích Hoạt */
            <div className="max-w-xl mx-auto space-y-6 py-2">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  Kích Hoạt Bản Quyền Ứng Dụng
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
                  Vui lòng sao chép Mã thiết bị (HWID) bên dưới gửi cho Admin để
                  nhận chuỗi mã kích hoạt Ed25519.
                </p>
              </div>

              {/* Machine ID Box */}
              <div className="bg-surface-variant/30 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-zinc-400 font-medium">
                    Mã thiết bị phần cứng (HWID):
                  </div>
                  <div className="text-sm font-mono font-bold text-primary tracking-wider">
                    {status?.machine_id || "Đang lấy..."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCopyHwid}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium transition-colors cursor-pointer"
                >
                  {copiedHwid ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedHwid ? "Đã sao chép" : "Sao chép mã"}</span>
                </button>
              </div>

              {/* Form Input Key */}
              <form onSubmit={handleSubmitKey} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-primary" />
                    Chuỗi mã bản quyền (Ed25519)
                  </label>
                  <textarea
                    rows={4}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Dán chuỗi bản quyền do Admin cấp (Bắt đầu bằng ED25519.)..."
                    className="w-full px-4 py-3 bg-black/50 border border-white/15 focus:border-primary rounded-xl text-white placeholder-zinc-500 text-xs font-mono tracking-wider focus:outline-none transition-colors resize-none"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("comparison")}
                    className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Quay Lại Bảng So Sánh
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !keyInput.trim()}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-2 shadow-lg cursor-pointer",
                      submitting || !keyInput.trim()
                        ? "bg-zinc-700/50 text-zinc-500 cursor-not-allowed border border-white/5"
                        : "bg-gradient-to-r from-primary to-primary-hover text-on-primary hover:shadow-primary/25 active:scale-[0.99]",
                    )}
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>Đang xác thực...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Xác Thực & Kích Hoạt</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="text-center pt-2">
                <span className="text-[11px] text-zinc-500">
                  Chữ ký số mật mã học Ed25519 xác thực an toàn tuyệt đối 100%
                  offline.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
