import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Force dark mode
document.documentElement.classList.add("dark");

// Thông báo gọn cho toàn app (chỉ đổi cách hiển thị):
// - Thông báo kết quả cập nhật từ thông báo "đang xử lý" (cùng id) không kế thừa thời gian chờ 30-35 giây
//   của thông báo đó: kết quả hiện 4 giây, lỗi 6 giây (trừ khi nơi gọi tự đặt thời gian).
// - Thông báo trùng nội dung (vd. lỗi lặp cho từng đoạn) gộp làm một thay vì chồng lên nhau.
for (const kind of ["success", "error", "warning", "info"] as const) {
  const original = toast[kind];
  (toast as any)[kind] = (message: any, options?: any) => {
    const opts = { ...(options || {}) };
    if (opts.id === undefined && typeof message === "string") opts.id = `${kind}:${message}`;
    if (opts.duration === undefined) opts.duration = kind === "error" ? 6000 : 4000;
    return original(message, opts);
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster position="top-right" offset={100} theme="dark" richColors closeButton visibleToasts={3} />
    </ErrorBoundary>
  </StrictMode>,
);

