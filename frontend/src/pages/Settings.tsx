import { useState, useEffect } from "react";
import {
  Cpu,
  Filter,
  FileText,
  BookOpen,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Loader2,
  MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTTSStore, type CheckUpdateResult } from "@/store/useTTSStore";
import { APP_VERSION } from "@/constants/version";
import { AppUpdateModal } from "@/components/AppUpdateModal";
import { FeedbackModal } from "@/components/FeedbackModal";
import {
  HardwareTab,
  AdFilterTab,
  LogsTab,
  GuideTab,
} from "@/features/settings/tabs";

export default function Settings() {
  const { appVersionInfo, fetchAppVersion, checkAppUpdate } = useTTSStore();

  const [activeTab, setActiveTab] = useState<
    "hardware" | "filter" | "logs" | "guide"
  >("hardware");

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

  useEffect(() => {
    fetchAppVersion();
    handleCheckUpdate(false);
  }, [fetchAppVersion]);

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
          {/* Nút Góp Ý & Báo Lỗi */}
          <button
            type="button"
            onClick={() => setIsFeedbackModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-xs font-semibold transition-all shadow-sm shadow-emerald-500/10 group cursor-pointer"
            title="Gửi góp ý, báo lỗi kèm file log về Telegram Admin"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            <span>Góp ý & Báo lỗi</span>
          </button>

          {/* Trạng thái phiên bản & Nút Cập Nhật Phiên Bản Mới */}
          {isCheckingUpdate && !updateCheckResult ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-on-surface-variant font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>Kiểm tra phiên bản...</span>
            </div>
          ) : updateCheckResult?.has_update ? (
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
          onClick={() => setActiveTab("filter")}
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
          onClick={() => setActiveTab("logs")}
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

      {/* Tabs Content */}
      {activeTab === "hardware" && <HardwareTab />}
      {activeTab === "filter" && <AdFilterTab />}
      {activeTab === "logs" && (
        <LogsTab onOpenFeedback={() => setIsFeedbackModalOpen(true)} />
      )}
      {activeTab === "guide" && <GuideTab />}

      {/* Modals */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          handleCheckUpdate(false);
          fetchAppVersion();
        }}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />
    </div>
  );
}
