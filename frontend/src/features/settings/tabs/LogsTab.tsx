import React, { useState, useEffect } from "react";
import {
  FileText,
  Pause,
  Play,
  MessageSquarePlus,
  Download,
  FolderOpen,
  RefreshCw,
  Copy,
  Trash2,
  Bug,
  Activity,
  Loader2,
  Search,
  ArrowDownUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LogsTabProps {
  onOpenFeedback: () => void;
}

export const LogsTab: React.FC<LogsTabProps> = ({ onOpenFeedback }) => {
  const [logContent, setLogContent] = useState("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logLinesCount, setLogLinesCount] = useState(300);
  const [logOrder, setLogOrder] = useState<"desc" | "asc">("desc");
  const [logStats, setLogStats] = useState<{
    total_lines: number;
    file_size_kb: number;
    log_path: string;
  } | null>(null);

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

  useEffect(() => {
    fetchVerboseStatus();
    fetchLogContent(logLinesCount, logOrder, !logContent);

    if (!isLogAutoRefresh) return;

    const interval = setInterval(() => {
      fetchLogContent(logLinesCount, logOrder, false);
    }, logRefreshInterval * 1000);

    return () => clearInterval(interval);
  }, [logLinesCount, logOrder, isLogAutoRefresh, logRefreshInterval]);

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

  return (
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
              Ghi lại toàn bộ tiến trình của AI, GPU, kết nối mạng và lỗi chi
              tiết. Khi cần hỗ trợ kỹ thuật, bạn chỉ cần bấm nút tải file hoặc
              sao chép nhật ký gửi cho người phát triển.
            </p>
          </div>

          {logStats && (
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all",
                  isLogAutoRefresh
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                    : "bg-amber-500/10 border-amber-500/25 text-amber-300",
                )}
              >
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

                {isLogAutoRefresh && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}

                <span className="font-sans font-medium text-[11px]">
                  {isLogAutoRefresh ? "Tự động làm mới:" : "Đã tạm dừng:"}
                </span>

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
                <strong className="text-primary">{logStats.file_size_kb} KB</strong>
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-on-surface">
                📝 Tổng:{" "}
                <strong className="text-primary">{logStats.total_lines} dòng</strong>
              </span>
            </div>
          )}
        </div>

        {/* Thanh công cụ hành động */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenFeedback}
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

      {/* Card Bật/Tắt Ghi Chi Tiết */}
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
                <span>Chế Độ Ghi Nhật Ký Chi Tiết Từng Bước (Debug Step Logs)</span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border",
                    verboseLogging
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-white/10 text-on-surface-variant border-white/15",
                  )}
                >
                  {verboseLogging ? "ĐANG BẬT (VERBOSE DEBUG)" : "TIÊU CHUẨN (NORMAL)"}
                </span>
              </h3>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {verboseLogging
                ? "Hệ thống đang ghi chép toàn bộ tiến trình chạy chi tiết của ứng dụng (lệnh FFmpeg, tham số Whisper, phản hồi AI dịch, quá trình tách nhạc Demucs, cân chỉnh timeline âm thanh và lỗi ngầm) vào app.log để phục vụ chẩn đoán lỗi."
                : "Hệ thống đang ghi nhật ký ở mức tiêu chuẩn (INFO). Bật tính năng này nếu bạn gặp lỗi cần ghi lại toàn bộ quá trình chạy từng bước để kiểm tra nguyên nhân."}
            </p>
          </div>

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
              {verboseLogging ? "Tắt Chế Độ Ghi Chi Tiết" : "Bật Ghi Chi Tiết Từng Bước"}
            </span>
          </button>
        </div>
      </div>

      {/* Live Log Console */}
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
                {logOrder === "desc" ? "Mới nhất trên cùng ⬇" : "Cũ nhất trên cùng ⬆"}
              </span>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-on-surface-variant">Hiển thị:</span>
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

        <div className="relative rounded-2xl bg-[#0a0d14] border border-white/10 p-4 font-mono text-[11px] md:text-xs leading-relaxed max-h-[500px] overflow-y-auto select-text scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {isLoadingLogs ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>Đang đọc file nhật ký app.log...</span>
            </div>
          ) : !logContent ? (
            <div className="py-12 text-center text-on-surface-variant/60">
              Chưa có dữ liệu nhật ký nào. Hãy tạo thử giọng hoặc dịch video để ghi
              nhận hoạt động.
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
  );
};
