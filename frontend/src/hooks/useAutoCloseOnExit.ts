import { useEffect, useRef } from "react";
import { API_BASE_URL } from "../constants/api";

/**
 * Hook useAutoCloseOnExit
 * Gửi heartbeat định kỳ 3 giây/lần lên Backend API (/api/system/heartbeat).
 * Sử dụng sessionStorage để giữ nguyên tab_id khi người dùng F5/Refresh trang.
 * Tăng độ ổn định, chống việc tắt nhầm backend khi tải lại giao diện.
 */
export function useAutoCloseOnExit() {
  const tabIdRef = useRef<string>(
    (() => {
      try {
        let existingId = sessionStorage.getItem("app_tab_session_id");
        if (!existingId) {
          existingId = `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
          sessionStorage.setItem("app_tab_session_id", existingId);
        }
        return existingId;
      } catch {
        return `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
      }
    })()
  );

  useEffect(() => {
    const tabId = tabIdRef.current;
    const apiHost = API_BASE_URL.replace(/\/$/, "");
    const heartbeatUrl = `${apiHost}/api/system/heartbeat`;

    const sendHeartbeat = (action: "heartbeat" | "close" = "heartbeat") => {
      const payload = JSON.stringify({
        tab_id: tabId,
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
          // Bỏ qua lỗi kết nối khi backend đang khởi động
        });
      } catch {
        // Bỏ qua ngoại lệ
      }
    };

    // 1. Gửi heartbeat ngay khi tab mở / tải lại
    sendHeartbeat("heartbeat");

    // 2. Gửi định kỳ mỗi 3 giây
    const intervalId = setInterval(() => {
      sendHeartbeat("heartbeat");
    }, 3000);

    // 3. Đánh thức nhịp tim ngay lập tức khi người dùng quay lại tab
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

    window.addEventListener("pagehide", handleUnload);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, []);
}

