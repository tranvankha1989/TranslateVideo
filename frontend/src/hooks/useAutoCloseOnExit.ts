import { useEffect, useRef } from "react";
import { API_BASE_URL } from "../constants/api";

/**
 * Hook useAutoCloseOnExit
 * Gửi heartbeat định kỳ 2 giây/lần lên Backend API (/api/system/heartbeat).
 * Khi người dùng đóng tất cả các tab localhost hoặc tắt trình duyệt,
 * Backend và Tray Manager sẽ tự động đóng toàn bộ tiến trình và tắt Terminal.
 */
export function useAutoCloseOnExit() {
  const tabIdRef = useRef<string>(
    `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
  );

  useEffect(() => {
    const apiHost = API_BASE_URL.replace(/\/$/, "");
    const heartbeatUrl = `${apiHost}/api/system/heartbeat`;

    const sendHeartbeat = (action: "heartbeat" | "close" = "heartbeat") => {
      const payload = JSON.stringify({
        tab_id: tabIdRef.current,
        action,
      });

      try {
        if (action === "close" && typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(heartbeatUrl, blob);
          return;
        }

        fetch(heartbeatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {
          // Bỏ qua lỗi kết nối khi backend đang khởi động hoặc tắt
        });
      } catch {
        // Bỏ qua ngoại lệ
      }
    };

    // 1. Gửi heartbeat ngay khi tab mở
    sendHeartbeat("heartbeat");

    // 2. Gửi định kỳ mỗi 3 giây (tiết kiệm CPU)
    const intervalId = setInterval(() => {
      sendHeartbeat("heartbeat");
    }, 3000);

    // 3. Đánh thức nhịp tim ngay lập tức khi người dùng quay lại tab (chống trình duyệt cho tab ngủ)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat("heartbeat");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 4. Bắt sự kiện khi tab/trình duyệt đóng
    const handleUnload = () => {
      sendHeartbeat("close");
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      handleUnload();
    };
  }, []);
}
