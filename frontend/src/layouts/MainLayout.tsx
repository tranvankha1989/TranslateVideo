import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Sparkles, Cpu, Cloud, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTTSStore } from "@/store/useTTSStore";
import { APP_VERSION } from "@/constants/version";
import { AppUpdateModal } from "@/components/AppUpdateModal";


const NAV_ITEMS = [
  { path: "/", label: "Phòng thu", icon: "graphic_eq" },
  { path: "/video-translate", label: "Dịch Video", icon: "translate" },
  { path: "/autocaption", label: "Auto Caption", icon: "subtitles" },
  { path: "/cloning-voice", label: "Tạo giọng mới", icon: "record_voice_over" },
  { path: "/library", label: "Thư viện", icon: "folder_open" },
  { path: "/projects", label: "Dự án", icon: "folder_shared" },
];

export function MainLayout() {
  const location = useLocation();
  const checkStorageStatus = useTTSStore((state) => state.checkStorageStatus);
  const hardwareConfig = useTTSStore((state) => state.hardwareConfig);
  const fetchHardwareSettings = useTTSStore((state) => state.fetchHardwareSettings);
  const syncStatus = useTTSStore((state) => state.syncStatus);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Tự động kiểm tra trạng thái lưu trữ đám mây & cấu hình phần cứng khi khởi động
  useEffect(() => {
    checkStorageStatus().catch(() => {});
    fetchHardwareSettings().catch(() => {});
  }, [checkStorageStatus, fetchHardwareSettings]);

  // Lưu trạng thái thu nhỏ sidebar vào localStorage để giữ trải nghiệm người dùng
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };


  return (
    <div className="text-on-surface font-body-md min-h-screen flex flex-col overflow-x-hidden">
      {/* Side Navigation (Phong cách Gemini, mượt mà, padding đồng nhất 100%) */}
      <nav
        className={cn(
          "hidden md:flex fixed left-0 top-0 h-full bg-surface/80 backdrop-blur-2xl border-r border-white/10 flex-col py-5 px-3.5 z-40 transition-all duration-300 ease-in-out select-none",
          isCollapsed ? "w-[72px]" : "w-64 2k:w-72",
        )}
      >
        {/* Header & Branding Area - Chiều cao cố định h-11, không nhảy vị trí */}
        <div className="h-11 shrink-0 flex items-center mb-5 transition-all duration-300 w-full overflow-hidden">
          {isCollapsed ? (
            /* Khi đóng: Nút logo w-11 h-11 căn thẳng hàng tuyệt đối với icon menu bên dưới */
            <button
              onClick={toggleSidebar}
              className="w-11 h-11 rounded-2xl flex items-center justify-center relative group cursor-pointer shrink-0 transition-all duration-200"
              aria-label="Mở thanh bên"
            >
              {/* Trạng thái bình thường: Logo VoiceSync AI */}
              <div className="w-11 h-11 rounded-2xl bg-surface-variant flex items-center justify-center text-primary border border-white/10 shadow-sm transition-all duration-200 group-hover:opacity-0 group-hover:scale-90 absolute inset-0">
                <span className="material-symbols-outlined text-2xl text-primary">
                    diamond
                </span>
              </div>

              {/* Trạng thái Hover: Biến thành icon PanelLeftOpen chuẩn Gemini */}
              <div className="w-11 h-11 rounded-2xl bg-surface-variant/90 hover:bg-surface-variant flex items-center justify-center text-on-surface border border-white/20 shadow-md transition-all duration-200 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 absolute inset-0">
                <PanelLeftOpen className="w-5 h-5 text-primary" />
              </div>

              {/* Tooltip đen chuẩn Gemini: Mở thanh bên */}
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50">
                Mở thanh bên
              </div>
            </button>
          ) : (
            /* Khi mở: Hộp logo w-11 h-11 giữ nguyên tọa độ X không xê dịch 1px */
            <div className="w-full flex items-center justify-between">
              <Link
                to="/"
                className="flex items-center gap-3 group overflow-hidden"
              >
                <div className="w-11 h-11 rounded-2xl bg-surface-variant flex items-center justify-center border border-white/10 shadow-sm text-primary transition-transform duration-200 group-hover:border-primary/40 group-hover:scale-105 shrink-0">
                  <span className="material-symbols-outlined text-2xl text-primary">
                      diamond
                  </span>
                </div>
                <div className="flex flex-col overflow-hidden whitespace-nowrap">
                  <h2 className="font-headline-lg text-lg font-bold text-on-surface leading-tight tracking-tight">
                    VoiceSync AI
                  </h2>
                  <p className="text-[11px] text-on-surface-variant font-mono-data">
                    Studio Pro v{APP_VERSION}
                  </p>
                </div>
              </Link>

              {/* Nút đóng sidebar [<] kèm tooltip Gemini */}
              <button
                onClick={toggleSidebar}
                className="w-9 h-9 rounded-xl hover:bg-surface-variant/60 flex items-center justify-center text-on-surface-variant hover:text-on-surface border border-white/10 hover:border-white/20 transition-all duration-200 relative group cursor-pointer shrink-0"
                aria-label="Đóng thanh bên"
              >
                <PanelLeftClose className="w-4 h-4" />
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50">
                  Đóng thanh bên
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Items - Thẳng hàng hoàn toàn với Logo ở trên, padding bất biến */}
        <ul className="flex-1 space-y-2 transition-all duration-300 w-full">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path} className="w-full">
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center h-11 rounded-xl transition-all duration-200 font-label-caps text-label-caps group relative w-full overflow-hidden",
                    isActive
                      ? "text-primary bg-primary/15 border border-primary/30 font-semibold shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-variant/40 hover:text-on-surface border border-transparent",
                  )}
                >
                  {/* Hộp icon cố định w-11 h-11 căn thẳng hàng 100% với Logo */}
                  <div className="w-11 h-11 flex items-center justify-center shrink-0">
                    <span
                      className={cn(
                        "material-symbols-outlined transition-transform duration-200 group-hover:scale-110 shrink-0 text-2xl",
                        isActive
                          ? "text-primary"
                          : "text-on-surface-variant group-hover:text-on-surface",
                      )}
                    >
                      {item.icon}
                    </span>
                  </div>

                  {/* Chữ nhãn của menu lướt trượt êm mượt */}
                  <span
                    className={cn(
                      "whitespace-nowrap transition-all duration-300 ease-in-out overflow-hidden ml-1",
                      isCollapsed
                        ? "max-w-0 opacity-0 -translate-x-3 pointer-events-none"
                        : "max-w-[150px] opacity-100 translate-x-0",
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Tooltip đen chuẩn Gemini khi ở chế độ thu nhỏ sidebar */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50">
                      {item.label}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Hardware Status & Settings Footer */}
        <div className="mt-auto pt-3 border-t border-white/10 w-full space-y-2">
          {/* Nút Cài đặt & GPU */}
          <Link
            to="/settings"
            className={cn(
              "flex items-center h-11 rounded-xl transition-all duration-200 font-label-caps text-label-caps group relative w-full overflow-hidden",
              location.pathname === "/settings"
                ? "text-primary bg-primary/15 border border-primary/30 font-semibold shadow-sm"
                : "text-on-surface-variant hover:bg-surface-variant/40 hover:text-on-surface border border-transparent",
            )}
          >
            <div className="w-11 h-11 flex items-center justify-center shrink-0">
              <span
                className={cn(
                  "material-symbols-outlined transition-transform duration-200 group-hover:scale-110 shrink-0 text-2xl",
                  location.pathname === "/settings"
                    ? "text-primary"
                    : "text-on-surface-variant group-hover:text-on-surface",
                )}
              >
                settings
              </span>
            </div>
            <span
              className={cn(
                "whitespace-nowrap transition-all duration-300 ease-in-out overflow-hidden ml-1",
                isCollapsed
                  ? "max-w-0 opacity-0 -translate-x-3 pointer-events-none"
                  : "max-w-[150px] opacity-100 translate-x-0",
              )}
            >
              Cài đặt & GPU
            </span>
            {isCollapsed && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/95 text-white text-xs font-medium rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50">
                Cài đặt & GPU
              </div>
            )}
          </Link>
        </div>
      </nav>


      {/* Top Right Header Action Center */}
      <header className="hidden md:flex fixed top-4 right-6 z-40 items-center gap-2.5">
        {/* GPU Mode Badge */}
        <Link
          to="/settings"
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl border text-[11px] font-mono transition-all shadow-sm group",
            hardwareConfig?.use_remote_gpu
              ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300"
              : hardwareConfig?.cuda_available
              ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
              : "bg-surface/70 hover:bg-surface-variant/70 border-white/10 text-on-surface-variant hover:text-on-surface"
          )}
          title={
            hardwareConfig?.use_remote_gpu
              ? `Đang chạy qua Cloud GPU: ${hardwareConfig.remote_gpu_url || "Chưa gán URL"}`
              : hardwareConfig?.cuda_available
              ? `Đang chạy qua GPU máy cục bộ: ${hardwareConfig.cuda_device_name}`
              : "Đang chạy qua CPU máy tính"
          }
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              hardwareConfig?.use_remote_gpu
                ? "bg-amber-400 animate-pulse shadow-sm shadow-amber-400"
                : hardwareConfig?.cuda_available
                ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                : "bg-blue-400"
            )}
          />
          <Cpu className="w-3.5 h-3.5" />
          <span className="font-semibold">
            {hardwareConfig?.use_remote_gpu
              ? "Cloud GPU (Colab T4)"
              : hardwareConfig?.cuda_device_name
              ? `Local GPU (${hardwareConfig.cuda_device_name.replace("NVIDIA GeForce ", "")})`
              : "CPU Mode"}
          </span>
        </Link>

        {/* Cloud Sync Status */}
        {syncStatus?.mode === "cloud" && (
          <Link
            to="/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/70 hover:bg-surface-variant/70 backdrop-blur-xl border border-white/10 text-[11px] font-mono text-on-surface-variant hover:text-on-surface transition-all shadow-sm"
            title="Trạng thái đồng bộ đám mây"
          >
            <Cloud className="w-3.5 h-3.5 text-accent" />
            <span>Atlas Cloud</span>
          </Link>
        )}

        {/* Nút Cập Nhật Ứng Dụng (Top-Right Update Button) */}
        <button
          type="button"
          onClick={() => setIsUpdateModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 hover:border-primary/50 text-[11px] font-semibold transition-all shadow-sm shadow-primary/10 group cursor-pointer"
          title="Kiểm tra & Cập nhật phiên bản mới nhất"
        >
          <Sparkles className="w-3.5 h-3.5 transition-transform group-hover:rotate-12 group-hover:scale-110" />
          <span>Cập nhật</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-normal">
            v{APP_VERSION}
          </span>
        </button>

        {/* Quick Settings Icon Button */}
        <Link
          to="/settings"
          className="w-8 h-8 rounded-full bg-surface/70 hover:bg-surface-variant/70 backdrop-blur-xl border border-white/10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all shadow-sm"
          title="Cài đặt hệ thống"
        >
          <SettingsIcon className="w-4 h-4" />
        </Link>
      </header>

      {/* Main Content Area (Tự động mở rộng vùng làm việc theo trạng thái sidebar) */}
      <main
        className={cn(
          "flex-1 flex justify-center items-start min-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out box-border",
          location.pathname === "/autocaption"
            ? "p-2 sm:p-3 md:p-4"
            : "p-margin-mobile md:p-margin-desktop 2k:p-10",
          isCollapsed
            ? "md:ml-[72px] md:w-[calc(100%-72px)]"
            : "md:ml-64 2k:ml-72 md:w-[calc(100%-256px)] 2k:w-[calc(100%-288px)]",
        )}
      >
        <Outlet />
      </main>

      {/* Modal Cập Nhật Phần Mềm Tích Hợp Xác Nhận */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />


      {/* Mobile Navigation (Bottom) */}
      <nav className="md:hidden fixed bottom-0 w-full bg-surface-container-lowest/90 backdrop-blur-md border-t border-white/5 z-50 pb-safe">
        <div className="flex justify-around items-center h-16">
          <Link
            to="/"
            className={cn(
              "flex flex-col items-center justify-center w-full h-full relative transition-colors",
              location.pathname === "/"
                ? "text-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className="material-symbols-outlined mb-1">graphic_eq</span>
            <span className="text-[10px] font-label-caps">Phòng thu</span>
            {location.pathname === "/" && (
              <div className="absolute top-0 w-8 h-1 bg-primary rounded-b-full"></div>
            )}
          </Link>
          <Link
            to="/library"
            className={cn(
              "flex flex-col items-center justify-center w-full h-full relative transition-colors",
              location.pathname === "/library"
                ? "text-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className="material-symbols-outlined mb-1">folder_open</span>
            <span className="text-[10px] font-label-caps">Thư viện</span>
            {location.pathname === "/library" && (
              <div className="absolute top-0 w-8 h-1 bg-primary rounded-b-full"></div>
            )}
          </Link>
          <Link
            to="/cloning-voice"
            className={cn(
              "flex flex-col items-center justify-center w-full h-full relative transition-colors",
              location.pathname === "/cloning-voice"
                ? "text-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className="material-symbols-outlined mb-1">
              record_voice_over
            </span>
            <span className="text-[10px] font-label-caps">Cloning Voice</span>
            {location.pathname === "/cloning-voice" && (
              <div className="absolute top-0 w-8 h-1 bg-primary rounded-b-full"></div>
            )}
          </Link>
          <Link
            to="/autocaption"
            className={cn(
              "flex flex-col items-center justify-center w-full h-full relative transition-colors",
              location.pathname === "/autocaption"
                ? "text-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className="material-symbols-outlined mb-1">subtitles</span>
            <span className="text-[10px] font-label-caps">Auto Caption</span>
            {location.pathname === "/autocaption" && (
              <div className="absolute top-0 w-8 h-1 bg-primary rounded-b-full"></div>
            )}
          </Link>
          <Link
            to="/settings"
            className={cn(
              "flex flex-col items-center justify-center w-full h-full relative transition-colors",
              location.pathname === "/settings"
                ? "text-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className="material-symbols-outlined mb-1">settings</span>
            <span className="text-[10px] font-label-caps">Cài đặt</span>
            {location.pathname === "/settings" && (
              <div className="absolute top-0 w-8 h-1 bg-primary rounded-b-full"></div>
            )}
          </Link>
        </div>
      </nav>
    </div>
  );
}
