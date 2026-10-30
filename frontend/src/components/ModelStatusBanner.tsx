import { useEffect, useRef, useState } from "react";
import {
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  HardDrive,
  Clock,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { useTTSStore } from "@/store/useTTSStore";

export function ModelStatusBanner() {
  const modelStatus = useTTSStore((state) => state.modelStatus);
  const fetchModelStatus = useTTSStore((state) => state.fetchModelStatus);
  const retryModelDownload = useTTSStore((state) => state.retryModelDownload);

  const [isRetrying, setIsRetrying] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  // Polling lấy trạng thái mô hình
  useEffect(() => {
    fetchModelStatus().catch(() => {});

    const interval = setInterval(() => {
      fetchModelStatus().then((status) => {
        if (!status) return;

        // Bắn thông báo Sonner khi chuyển từ tải/nạp sang Ready
        if (
          (prevStatusRef.current === "downloading" ||
            prevStatusRef.current === "loading") &&
          status.state === "ready"
        ) {
          toast.success("Mô hình AI OmniVoice đã sẵn sàng phục vụ!", {
            description:
              "Toàn bộ chức năng Phòng thu, Tạo giọng và Dịch Video đã được kích hoạt.",
            duration: 6000,
          });
        }
        prevStatusRef.current = status.state;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [fetchModelStatus]);

  // Nếu mô hình đã sẵn sàng hoặc chưa có thông tin, không hiển thị banner
  if (!modelStatus || modelStatus.state === "ready" || modelStatus.state === "idle") {
    return null;
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryModelDownload();
      toast.info("Đang khởi động lại tiến trình tải mô hình AI...");
    } catch {
      toast.error("Không thể kết nối Backend để thử lại.");
    } finally {
      setIsRetrying(false);
    }
  };

  const downloadedMB = (modelStatus.downloaded_bytes / (1024 * 1024)).toFixed(1);
  const totalMB = (modelStatus.total_bytes / (1024 * 1024)).toFixed(1);
  const etaMinutes =
    modelStatus.eta_seconds > 60
      ? `~${Math.ceil(modelStatus.eta_seconds / 60)} phút`
      : `${modelStatus.eta_seconds}s`;

  return (
    <div className="w-full max-w-6xl mx-auto mb-6 transition-all duration-300">
      {/* ─── Trạng thái: Đang tải mô hình từ Hugging Face ─── */}
      {modelStatus.state === "downloading" && (
        <div className="relative overflow-hidden rounded-2xl bg-[#0e1628]/95 border border-primary/30 p-5 shadow-2xl backdrop-blur-xl">
          {/* Subtle Top Glow Accent */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80" />

          <div className="flex flex-col gap-3.5">
            {/* Header row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
                  <Download className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight flex items-center gap-2">
                    Đang tải mô hình giọng nói OmniVoice lần đầu tiên
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Khoảng 3.1 GB
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Quá trình này chỉ diễn ra <strong className="text-slate-300">một lần duy nhất</strong> khi cài đặt app. Sau khi tải xong, mô hình sẽ lưu vĩnh viễn trên máy của bạn.
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  {modelStatus.percent.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="w-full h-2.5 bg-slate-800/80 rounded-full overflow-hidden p-[2px] border border-white/5 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-300 shadow-sm"
                style={{ width: `${Math.min(100, Math.max(1, modelStatus.percent))}%` }}
              />
            </div>

            {/* Meta Stats Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] sm:text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  {downloadedMB} MB / {totalMB} MB
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                  Tốc độ: {modelStatus.speed_mbps.toFixed(1)} MB/s
                </span>
                {modelStatus.eta_seconds > 0 && (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Còn lại: {etaMinutes}
                  </span>
                )}
              </div>

              <div className="text-[11px] text-amber-300/80 italic">
                ⚠️ Các chức năng tạo giọng tạm thời chờ mô hình tải xong để tránh phát sinh lỗi.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Trạng thái: Đang nạp mô hình vào RAM / GPU ─── */}
      {modelStatus.state === "loading" && (
        <div className="relative overflow-hidden rounded-2xl bg-[#0f172a]/95 border border-indigo-500/30 p-5 shadow-2xl backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-80" />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-inner">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight flex items-center gap-2">
                  Đang nạp mô hình AI vào bộ nhớ RAM / GPU...
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-300" />
                    Sắp hoàn tất
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mô hình đã có trên ổ cứng. Hệ thống đang biên dịch ma trận trọng số và tối ưu hóa tốc độ tính toán...
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-indigo-300 bg-indigo-950/50 px-3 py-1.5 rounded-xl border border-indigo-500/20">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              Chờ vài giây
            </div>
          </div>
        </div>
      )}

      {/* ─── Trạng thái: Lỗi khi tải mô hình ─── */}
      {modelStatus.state === "error" && (
        <div className="relative overflow-hidden rounded-2xl bg-red-950/30 border border-red-500/40 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-red-300 tracking-tight">
                  Chưa thể hoàn tất tải mô hình OmniVoice
                </h3>
                <p className="text-xs text-red-200/80 mt-1 max-w-2xl leading-relaxed">
                  {modelStatus.error_message ||
                    "Đã xảy ra sự cố mạng hoặc tường lửa chặn kết nối tới máy chủ Hugging Face."}
                </p>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  💡 Gợi ý: Hãy kiểm tra kết nối Internet, tạm thời tắt chức năng quét HTTPS trong phần mềm diệt virus (Kaspersky, Avast, ESET...) hoặc tắt VPN nếu có.
                </p>
              </div>
            </div>

            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-lg shadow-red-600/30 transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
              {isRetrying ? "Đang thử lại..." : "Thử lại ngay"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

