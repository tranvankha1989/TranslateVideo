import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Cpu, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTTSStore } from "@/store/useTTSStore";

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
  const fetchHardwareSettings = useTTSStore(
    (state) => state.fetchHardwareSettings,
  );
  const syncStatus = useTTSStore((state) => state.syncStatus);
  const fetchAppVersion = useTTSStore((state) => state.fetchAppVersion);

  // Tự động kiểm tra trạng thái lưu trữ đám mây, cấu hình phần cứng & version khi khởi động
  useEffect(() => {
    checkStorageStatus().catch(() => {});
    fetchHardwareSettings().catch(() => {});
    fetchAppVersion().catch(() => {});
  }, [checkStorageStatus, fetchHardwareSettings, fetchAppVersion]);

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
    <div className="text-on-surface font-body-md min-h-screen flex flex-col overflow-x-hidden bg-[#090d16]">
      {/* Side Navigation (Phong cách Studio Dark hiện đại, sắc nét) */}
      <nav
        className={cn(
          "hidden md:flex fixed left-0 top-0 h-full bg-[#0d1322] border-r border-white/10 flex-col py-5 px-3.5 z-40 transition-all duration-300 ease-in-out select-none shadow-2xl",
          isCollapsed ? "w-[72px]" : "w-72 2k:w-80",
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
                className="flex items-center gap-3 group flex-1 min-w-0"
              >
                <div className="w-11 h-11 rounded-2xl bg-surface-variant flex items-center justify-center border border-white/10 shadow-sm text-primary transition-transform duration-200 group-hover:border-primary/40 group-hover:scale-105 shrink-0">
                  <span className="material-symbols-outlined text-2xl text-primary">
                    diamond
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-lg font-bold text-on-surface leading-tight tracking-tight truncate">
                    VideoTranslate AI
                  </h2>
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
        <div className="mt-auto space-y-2">
          {/* Subtle System Status (Phần thông báo trạng thái tinh tế) */}
          <Link
            to="/settings"
            className={cn(
              "group relative block transition-all duration-200 cursor-pointer overflow-hidden",
              isCollapsed
                ? "w-11 h-11 mx-auto rounded-xl bg-surface-variant/30 hover:bg-surface-variant/60 border border-white/5 hover:border-white/15 flex items-center justify-center"
                : "p-2.5 rounded-xl bg-surface-variant/30 hover:bg-surface-variant/60 border border-white/5 hover:border-white/15",
            )}
            title="Xem chi tiết cấu hình phần cứng và đồng bộ"
          >
            {isCollapsed ? (
              <>
                <Cpu className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                <span
                  className={cn(
                    "w-2 h-2 rounded-full absolute top-2 right-2",
                    hardwareConfig?.use_remote_gpu
                      ? "bg-amber-400 animate-pulse shadow-sm shadow-amber-400"
                      : hardwareConfig?.cuda_available
                        ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                        : "bg-blue-400",
                  )}
                />
                {/* Tooltip đen chuẩn Gemini khi sidebar đóng */}
                <div className="absolute left-full ml-3 px-3 py-2 bg-black/95 text-white text-xs rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 border border-white/10">
                  <div className="font-semibold text-primary flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>
                      {hardwareConfig?.use_remote_gpu
                        ? "Cloud GPU"
                        : hardwareConfig?.cuda_device_name
                          ? `Local GPU (${hardwareConfig.cuda_device_name.replace("NVIDIA GeForce ", "")})`
                          : "CPU Mode"}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-300 mt-0.5 flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      {syncStatus?.mode === "cloud"
                        ? "Atlas Cloud"
                        : "Lưu trữ cục bộ"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                {/* Dòng 1: Trạng thái GPU */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        hardwareConfig?.use_remote_gpu
                          ? "bg-amber-400 animate-pulse shadow-sm shadow-amber-400"
                          : hardwareConfig?.cuda_available
                            ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                            : "bg-blue-400",
                      )}
                    />
                    <span className="text-[11px] font-mono font-medium text-on-surface truncate group-hover:text-primary transition-colors">
                      {hardwareConfig?.use_remote_gpu
                        ? "Cloud GPU"
                        : hardwareConfig?.cuda_device_name
                          ? `Local GPU (${hardwareConfig.cuda_device_name.replace("NVIDIA GeForce ", "")})`
                          : "CPU Processing"}
                    </span>
                  </div>
                  <Cpu className="w-3.5 h-3.5 text-on-surface-variant/60 group-hover:text-primary transition-colors shrink-0" />
                </div>

                {/* Dòng 2: Trạng thái Lưu trữ / Đồng bộ */}
                <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant/70 pt-1.5 border-t border-white/5">
                  <span className="flex items-center gap-1.5 truncate">
                    <Cloud
                      className={cn(
                        "w-3 h-3 shrink-0",
                        syncStatus?.mode === "cloud"
                          ? "text-cyan-400"
                          : "text-on-surface-variant/40",
                      )}
                    />
                    <span>
                      {syncStatus?.mode === "cloud"
                        ? "Atlas Cloud"
                        : "Lưu trữ cục bộ"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded border leading-none font-medium",
                      syncStatus?.mode === "cloud"
                        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                        : "bg-white/5 border-white/10 text-on-surface-variant/60",
                    )}
                  >
                    {syncStatus?.mode === "cloud" ? "Online" : "Local"}
                  </span>
                </div>
              </div>
            )}
          </Link>
          <div className="border-t border-white/10 w-full"></div>

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

      {/* Main Content Area (Tự động mở rộng vùng làm việc theo trạng thái sidebar) */}
      <main
        className={cn(
          "flex-1 flex justify-center items-start min-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out box-border",
          location.pathname === "/autocaption"
            ? "p-2 sm:p-3 md:p-4"
            : "p-margin-mobile md:p-margin-desktop 2k:p-10",
          isCollapsed
            ? "md:ml-[72px] md:w-[calc(100%-72px)]"
            : "md:ml-72 2k:ml-80 md:w-[calc(100%-288px)] 2k:w-[calc(100%-320px)]",
        )}
      >
        <div
          key={location.pathname}
          className="w-full flex justify-center items-start animate-fadeIn"
        >
          <Outlet />
        </div>
      </main>

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
