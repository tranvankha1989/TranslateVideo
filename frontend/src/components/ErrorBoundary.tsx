import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCacheAndReload = () => {
    try {
      localStorage.removeItem("videosync_translate_store");
      localStorage.removeItem("omnivoice_tts_store");
      localStorage.removeItem("sidebar_collapsed");
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 select-none font-sans">
          <div className="max-w-xl w-full bg-slate-900/90 border border-red-500/30 rounded-2xl shadow-2xl p-8 backdrop-blur-xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Đã xảy ra lỗi hiển thị giao diện
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  VoiceSync AI đã bắt được ngoại lệ để ngăn chặn hiện tượng màn hình trắng.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 overflow-hidden">
              <p className="text-xs font-mono text-red-400 font-medium break-words">
                {this.state.error?.toString() || "Unknown rendering exception"}
              </p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[11px] font-mono text-slate-500 mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-slate-950 font-semibold hover:bg-primary/90 transition-colors text-sm shadow-sm cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Tải lại trang
              </button>

              <button
                onClick={this.handleResetCacheAndReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors text-sm border border-slate-700 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-amber-400" />
                Xóa Cache & Về trang chủ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
