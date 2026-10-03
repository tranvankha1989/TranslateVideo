import { useState, useEffect } from "react";
import {
  Sparkles,
  RefreshCw,
  GitBranch,
  GitCommit,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Terminal,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTTSStore, type CheckUpdateResult, type PerformUpdateResult } from "@/store/useTTSStore";
import { APP_VERSION } from "@/constants/version";

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppUpdateModal({ isOpen, onClose }: AppUpdateModalProps) {
  const { appVersionInfo, fetchAppVersion, checkAppUpdate, performAppUpdate } = useTTSStore();

  const [step, setStep] = useState<"checking" | "confirm" | "updating" | "success" | "error">("checking");
  const [checkResult, setCheckResult] = useState<CheckUpdateResult | null>(null);
  const [updateResult, setUpdateResult] = useState<PerformUpdateResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);


  useEffect(() => {
    if (isOpen) {
      setStep("checking");
      setLogs([]);
      setUpdateResult(null);
      fetchAppVersion().catch(() => {});
      runCheck();
    }
  }, [isOpen]);

  const runCheck = async () => {
    setStep("checking");
    try {
      const res = await checkAppUpdate();
      setCheckResult(res);
      setStep("confirm");
    } catch (err: any) {
      setStep("error");
      setUpdateResult({
        ok: false,
        message: "Không thể kiểm tra bản cập nhật",
        logs: [],
        error: err.message || "Lỗi kết nối",
      });
    }
  };

  const handleStartUpdate = async () => {
    setStep("updating");
    setLogs(["🚀 Bắt đầu quá trình cập nhật VoiceSync AI..."]);

    try {
      const res = await performAppUpdate();
      setUpdateResult(res);
      if (res.logs && res.logs.length > 0) {
        setLogs((prev) => [...prev, ...res.logs]);
      }

      if (res.ok) {
        setStep("success");
        toast.success(res.message || "Cập nhật ứng dụng thành công!");
      } else {
        setStep("error");
        toast.error(res.error || "Cập nhật thất bại. Vui lòng thử lại.");
      }
    } catch (err: any) {
      setStep("error");
      const errMsg = err.message || "Lỗi không xác định khi cập nhật.";
      setUpdateResult({
        ok: false,
        message: "Lỗi thực thi",
        logs: [],
        error: errMsg,
      });
      setLogs((prev) => [...prev, `❌ [Lỗi]: ${errMsg}`]);
      toast.error(errMsg);
    }
  };

  const handleReloadApp = () => {
    window.location.reload();
  };

  if (!isOpen) return null;

  const currentVer = appVersionInfo?.version || APP_VERSION;
  const currentBranch = appVersionInfo?.git_branch || "main";
  const currentCommit = appVersionInfo?.git_commit || "HEAD";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl bg-surface-container border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-on-surface flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-variant/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-on-surface flex items-center gap-2">
                <span>Cập Nhật Hệ Thống VoiceSync AI</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  v{currentVer}
                </span>
              </h3>
              <p className="text-xs text-on-surface-variant font-body-sm">
                Kiểm tra và nâng cấp mã nguồn tự động từ GitHub
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={step === "updating"}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content based on Step */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* STEP 1: CHECKING */}
          {step === "checking" && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <RefreshCw className="w-8 h-8 animate-spin" />
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-on-surface">Đang kiểm tra máy chủ GitHub...</h4>
                <p className="text-xs text-on-surface-variant">
                  Đang đối chiếu phiên bản hiện tại với bản phát hành mới nhất.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: CONFIRMATION VIEW */}
          {step === "confirm" && (
            <div className="space-y-5">
              {/* Status Banner */}
              {checkResult?.has_update ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-amber-500/10 border border-primary/40 flex items-start gap-3.5 shadow-md shadow-primary/5">
                  <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-primary flex items-center gap-2">
                      <span>🎉 Đã có bản cập nhật mới!</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary text-black font-extrabold">
                        {checkResult.latest_remote_commit || "Mới"}
                      </span>
                    </p>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {checkResult.message || `Tìm thấy ${checkResult.commits_behind} cải tiến mới từ máy chủ.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-emerald-300">
                      ✅ Bạn đang sử dụng phiên bản mới nhất (v{currentVer})!
                    </p>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Hệ thống của bạn đã được đồng bộ đầy đủ với kho mã nguồn mới nhất trên nhánh <strong>{currentBranch}</strong>. Không có bản nâng cấp nào cần tải về.
                    </p>
                  </div>
                </div>
              )}

              {/* Version & Git Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-surface-variant/40 border border-white/10 space-y-1">
                  <span className="text-[11px] text-on-surface-variant font-medium flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-primary" /> Nhánh hoạt động:
                  </span>
                  <p className="text-xs font-mono font-semibold text-on-surface">
                    {currentBranch}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-variant/40 border border-white/10 space-y-1">
                  <span className="text-[11px] text-on-surface-variant font-medium flex items-center gap-1.5">
                    <GitCommit className="w-3.5 h-3.5 text-primary" /> Commit hiện tại:
                  </span>
                  <p className="text-xs font-mono font-semibold text-on-surface">
                    {currentCommit}
                  </p>
                </div>
              </div>

              {/* New Commits / Changelog / Features */}
              {checkResult?.has_update && checkResult?.commit_messages && checkResult.commit_messages.length > 0 ? (
                <div className="space-y-2 p-4 rounded-2xl bg-black/40 border border-primary/20">
                  <label className="text-xs font-bold text-primary flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Tính năng mới & Thay đổi trong bản cập nhật này:
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      {checkResult.commit_messages.length} nội dung mới
                    </span>
                  </label>
                  <div className="max-h-44 overflow-y-auto space-y-2 pr-1 pt-1">
                    {checkResult.commit_messages.map((msg, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs leading-relaxed p-2 rounded-xl bg-white/5 border border-white/5">
                        <span className="w-5 h-5 rounded-md bg-primary/20 text-primary text-[10px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-on-surface font-medium">{msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Confirmation Notice Box */}
              <div className="p-4 rounded-xl bg-surface-variant/50 border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Bảo đảm an toàn dữ liệu</span>
                </div>
                <ul className="text-[11px] text-on-surface-variant space-y-1 list-disc pl-4 leading-relaxed">
                  <li>Tự động kéo mã nguồn mới nhất từ GitHub qua <code className="text-primary font-mono">git pull</code>.</li>
                  <li>Toàn bộ dữ liệu dự án, file giọng nói đã tạo và cài đặt cá nhân của bạn được <strong className="text-on-surface">bảo toàn 100%</strong>.</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 3: UPDATING PROGRESS */}
          {step === "updating" && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tiến hành cập nhật hệ thống...</span>
                </div>
                <span className="text-xs text-on-surface-variant font-mono">Vui lòng không tắt app</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-surface-variant rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-accent animate-pulse w-full rounded-full" />
              </div>

              {/* Terminal Logs View */}
              <div className="p-3.5 rounded-xl bg-black/70 border border-white/10 font-mono text-xs text-emerald-400 max-h-48 overflow-y-auto space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant border-b border-white/10 pb-1 mb-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Tiến trình cập nhật Console</span>
                </div>
                {logs.map((log, idx) => (
                  <p key={idx} className="text-[11px] leading-relaxed whitespace-pre-wrap">
                    {log}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS VIEW */}
          {step === "success" && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-on-surface">Cập Nhật Thành Công!</h4>
                <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                  VoiceSync AI đã được nâng cấp lên phiên bản mới nhất{" "}
                  <strong className="text-primary font-mono">v{updateResult?.new_version || currentVer}</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-variant/40 border border-white/10 text-xs text-on-surface-variant font-mono text-left max-h-28 overflow-y-auto">
                {logs.map((log, idx) => (
                  <p key={idx} className="text-[11px]">{log}</p>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: ERROR VIEW */}
          {step === "error" && (
            <div className="py-4 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-red-400">Không Thể Hoàn Tất Cập Nhật</h4>
                <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                  {updateResult?.error || checkResult?.error || "Đã xảy ra lỗi khi kết nối tới Git hoặc cập nhật mã nguồn."}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/20 text-xs text-red-300 font-mono text-left max-h-28 overflow-y-auto">
                {logs.length > 0 ? (
                  logs.map((log, idx) => <p key={idx} className="text-[11px]">{log}</p>)
                ) : (
                  <p className="text-[11px]">{updateResult?.error || "Vui lòng kiểm tra kết nối Internet và thử lại."}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-surface-variant/30 flex items-center justify-between">
          {step === "confirm" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
              >
                Hủy bỏ
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runCheck}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/5 border border-white/10 flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Kiểm tra lại</span>
                </button>
                <button
                  type="button"
                  disabled={!checkResult?.has_update}
                  onClick={handleStartUpdate}
                  title={!checkResult?.has_update ? "Bạn đang ở phiên bản mới nhất, không có bản cập nhật mới" : "Bắt đầu cập nhật ứng dụng"}
                  className={cn(
                    "px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all",
                    !checkResult?.has_update
                      ? "bg-surface-variant/40 text-on-surface-variant/40 border border-white/5 cursor-not-allowed opacity-60"
                      : "bg-gradient-to-r from-primary to-accent text-on-primary hover:opacity-95 shadow-md shadow-primary/20 cursor-pointer active:scale-95"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{checkResult?.has_update ? "Xác nhận & Cập nhật ngay" : "Đã ở bản mới nhất"}</span>
                  {checkResult?.has_update && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </>
          )}

          {step === "updating" && (
            <div className="w-full flex justify-center">
              <span className="text-xs text-on-surface-variant flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                Đang xử lý nâng cấp, vui lòng chờ trong giây lát...
              </span>
            </div>
          )}

          {step === "success" && (
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleReloadApp}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 flex items-center gap-2 transition-transform active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tải lại ứng dụng ngay (F5)</span>
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={runCheck}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary text-on-primary hover:opacity-90 flex items-center gap-2 transition-transform active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử kiểm tra lại</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
