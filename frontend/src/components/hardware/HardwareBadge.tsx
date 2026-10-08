import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Server, CloudLightning } from "lucide-react";
import { useTTSStore } from "@/store/useTTSStore";

export function HardwareBadge() {
  const navigate = useNavigate();
  const { hardwareConfig, fetchHardwareSettings } = useTTSStore();

  useEffect(() => {
    fetchHardwareSettings();
  }, [fetchHardwareSettings]);

  const isRemote = hardwareConfig.use_remote_gpu;
  const devName = isRemote
    ? "Cloud GPU (Tesla T4)"
    : hardwareConfig.cuda_device_name ||
      (hardwareConfig.cuda_available ? "NVIDIA GPU" : "CPU Cục bộ");

  return (
    <button
      type="button"
      onClick={() => navigate("/settings")}
      title="Bấm để mở trang Cài đặt & Quản lý GPU"
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-variant/40 hover:bg-surface-variant/70 border border-white/10 hover:border-primary/40 text-xs font-mono transition-all cursor-pointer group"
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isRemote ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
        }`}
      />
      {isRemote ? (
        <CloudLightning className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
      ) : (
        <Server className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
      )}
      <span className="text-on-surface text-[11px] truncate max-w-[150px] sm:max-w-none">
        {devName}
      </span>
    </button>
  );
}
