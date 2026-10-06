import { useState } from "react";
import {
  MessageSquarePlus,
  Send,
  X,
  Loader2,
  Bug,
  Sparkles,
  HelpCircle,
  MessageCircle,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useTTSStore, type FeedbackPayload } from "@/store/useTTSStore";
import { APP_VERSION } from "@/constants/version";
import { cn } from "@/lib/utils";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { sendFeedback, hardwareConfig, appVersionInfo } = useTTSStore();

  const [feedbackType, setFeedbackType] = useState<"bug" | "feature" | "question" | "other">("bug");
  const [senderName, setSenderName] = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [message, setMessage] = useState("");
  const [includeLogs, setIncludeLogs] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Vui lòng nhập nội dung chi tiết phản hồi.");
      return;
    }

    setIsSending(true);

    const gpuMode = hardwareConfig?.use_remote_gpu
      ? `Cloud GPU (${hardwareConfig.remote_gpu_url || "Remote"})`
      : hardwareConfig?.cuda_available
      ? `Local GPU (${hardwareConfig.cuda_device_name || "NVIDIA"})`
      : "CPU Mode";

    const payload: FeedbackPayload = {
      feedback_type: feedbackType,
      sender_name: senderName.trim() || undefined,
      sender_contact: senderContact.trim() || undefined,
      message: message.trim(),
      include_logs: includeLogs,
      system_info: {
        os: navigator.userAgent.includes("Windows") ? "Windows" : navigator.platform,
        gpu_mode: gpuMode,
        app_version: appVersionInfo?.version || APP_VERSION,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
      },
    };

    try {
      const res = await sendFeedback(payload);
      if (res.ok) {
        setIsSuccess(true);
        toast.success(res.message || "Đã gửi phản hồi thành công!");
      } else {
        toast.error(res.error || res.message || "Không thể gửi phản hồi.");
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message || "Gửi phản hồi thất bại."}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setMessage("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-surface-variant/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-on-surface">Góp Ý & Báo Lỗi Cho Admin</h3>
              <p className="text-xs text-on-surface-variant">
                Tự động gửi thông tin kèm nhật ký hệ thống (Logs) về Telegram
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-on-surface">Cảm ơn bạn đã gửi phản hồi!</h4>
                <p className="text-xs text-on-surface-variant max-w-sm">
                  Thông tin phản hồi cùng nhật ký hệ thống đã được gửi trực tiếp đến quản trị viên. Chúng tôi sẽ kiểm tra và khắc phục sớm nhất.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-6 py-2.5 rounded-xl bg-primary text-black font-bold text-xs shadow-md hover:brightness-110 transition-all cursor-pointer"
              >
                Đóng Cửa Sổ
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Loại phản hồi */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-on-surface">Phân loại yêu cầu</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { type: "bug", label: "Báo Lỗi", icon: Bug, color: "text-rose-400" },
                    { type: "feature", label: "Góp Ý", icon: Sparkles, color: "text-amber-400" },
                    { type: "question", label: "Hỏi Đáp", icon: HelpCircle, color: "text-blue-400" },
                    { type: "other", label: "Khác", icon: MessageCircle, color: "text-emerald-400" },
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = feedbackType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setFeedbackType(item.type as any)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                          active
                            ? "bg-primary/15 border-primary text-primary shadow-sm"
                            : "bg-surface-variant/20 border-white/5 text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                        )}
                      >
                        <Icon className={cn("w-4 h-4", active ? "text-primary" : item.color)} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tên & Liên hệ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface">Tên hoặc biệt danh (Tùy chọn)</label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-variant/40 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface">Email / Zalo / Telegram (Tùy chọn)</label>
                  <input
                    type="text"
                    value={senderContact}
                    onChange={(e) => setSenderContact(e.target.value)}
                    placeholder="VD: 0912xxxxxx hoặc email"
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-variant/40 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Nội dung chi tiết */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface flex items-center justify-between">
                  <span>Mô tả chi tiết vấn đề hoặc ý kiến đóng góp *</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Mô tả cụ thể lỗi bạn gặp phải: Lúc bấm nút nào? Báo lỗi gì? Kèm chi tiết..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-variant/40 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                />
              </div>

              {/* Tùy chọn gửi kèm file log */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeLogs}
                    onChange={(e) => setIncludeLogs(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-surface-variant text-primary focus:ring-0 cursor-pointer accent-primary"
                  />
                  <div className="flex items-center gap-1.5 text-xs text-on-surface font-medium">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span>Tự động đính kèm tệp nhật ký hệ thống (app.log)</span>
                  </div>
                </label>
                <p className="text-[11px] text-on-surface-variant/70 pl-6.5">
                  File log chỉ chứa thông tin lỗi kỹ thuật và tiến trình chạy của ứng dụng, hoàn toàn không chứa mật khẩu hay thông tin cá nhân riêng tư.
                </p>
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  disabled={isSending}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-on-surface font-medium transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>

                <button
                  type="submit"
                  disabled={isSending || !message.trim()}
                  className="px-5 py-2 rounded-xl bg-primary hover:brightness-110 text-black font-bold text-xs flex items-center gap-2 shadow-md shadow-primary/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang gửi đến Admin...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Gửi Phản Hồi Ngay</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
