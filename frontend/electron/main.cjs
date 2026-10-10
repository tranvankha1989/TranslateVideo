const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const http = require("http");

let mainWindow = null;
let pythonProcess = null;
let isQuitting = false;

// 1. Xác định đường dẫn thư mục gốc và các tài nguyên
function getProjectPaths() {
  const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

  // Thư mục gốc chứa backend, python_runtime, assets
  let rootDir = path.resolve(__dirname, "..");
  if (isDev) {
    rootDir = path.resolve(__dirname, "../..");
  } else {
    // Khi đóng gói (Production)
    const possibleRoots = [
      path.resolve(process.resourcesPath, "../../../.."), // Khi chạy trực tiếp trong frontend/release/win-unpacked
      path.resolve(process.resourcesPath, "../../.."),
      path.resolve(process.resourcesPath, ".."),          // Khi cài đặt qua Inno Setup ({app})
      path.resolve(process.resourcesPath, "app.asar.unpacked"),
      path.resolve(app.getAppPath(), "../../../.."),
      path.resolve(app.getAppPath(), ".."),
      app.getAppPath(),
      process.cwd()
    ];
    for (const p of possibleRoots) {
      if (fs.existsSync(path.join(p, "backend")) || fs.existsSync(path.join(p, "python_runtime"))) {
        rootDir = p;
        break;
      }
    }
  }

  // Đường dẫn Python Runtime
  let pythonExe = path.join(rootDir, "python_runtime", "python.exe");
  if (!fs.existsSync(pythonExe)) {
    pythonExe = path.join(rootDir, "backend", "venv", "Scripts", "python.exe");
  }
  if (!fs.existsSync(pythonExe)) {
    pythonExe = "python.exe"; // Fallback sang PATH hệ thống
  }

  const backendDir = path.join(rootDir, "backend");
  const iconPath = path.join(rootDir, "assets", "app.ico");

  return { rootDir, pythonExe, backendDir, iconPath, isDev };
}

// 2. Dọn dẹp tiến trình treo trên cổng 8000 trước khi khởi động
function cleanupPort(port = 8000) {
  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, {
        windowsHide: true,
        stdio: "ignore"
      });
    }
  } catch (e) {
    // Bỏ qua nếu không có tiến trình nào chiếm cổng
  }
}

// 3. Khởi động Backend FastAPI ngầm
function startBackend() {
  const { pythonExe, backendDir, isDev } = getProjectPaths();
  cleanupPort(8000);

  const args = ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"];

  console.log(`[Electron] Khởi động Python Backend: ${pythonExe}`);
  console.log(`[Electron] Thư mục Backend: ${backendDir}`);

  pythonProcess = spawn(pythonExe, args, {
    cwd: backendDir,
    windowsHide: true,
    stdio: isDev ? "inherit" : "ignore",
    env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONUTF8: "1" }
  });

  pythonProcess.on("error", (err) => {
    console.error("[Electron] Lỗi khởi động Python:", err);
  });

  pythonProcess.on("exit", (code, signal) => {
    console.log(`[Electron] Python Process thoát với mã: ${code}, signal: ${signal}`);
    if (!isQuitting && mainWindow) {
      // Nếu python chết đột ngột mà app chưa tắt
    }
  });
}

// 4. Kiểm tra sức khỏe Backend (Healthcheck)
function checkHealth(url = "http://127.0.0.1:8000/health", timeoutMs = 45000) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        resolve(false);
        return;
      }

      http.get(url, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      }).on("error", () => {
        // Đang chờ server nạp
      });
    }, 600);
  });
}

// 5. Tạo cửa sổ chính Desktop Native
async function createMainWindow() {
  const { iconPath } = getProjectPaths();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: "VideoTranslate AI - OmniVoice Studio",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
    backgroundMaterial: "mica",
    show: false, // Ẩn cho đến khi sẵn sàng để tránh giật hình
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });

  // Cho phép phím F5 / Ctrl+R để reload giao diện (bỏ qua cache)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F5" || (input.control && input.key.toLowerCase() === "r")) {
      mainWindow.webContents.reloadIgnoringCache();
      event.preventDefault();
      return;
    }
    // Chặn mở DevTools và phím tắt Debug (F12, Ctrl+Shift+I, Ctrl+U) trong bản Production
    if (app.isPackaged) {
      if (
        (input.control && input.shift && (input.key.toLowerCase() === "i" || input.key.toLowerCase() === "j")) ||
        input.key === "F12" ||
        (input.control && input.key.toLowerCase() === "u")
      ) {
        event.preventDefault();
      }
    }
  });

  // Mở các link target=_blank bên ngoài bằng trình duyệt mặc định của hệ điều hành
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Tải trang Loading chuẩn phong cách Apple iOS / macOS
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>VideoTranslate AI</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          background: #090d16;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          user-select: none;
          overflow: hidden;
        }

        /* Glassmorphism Container */
        .splash-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 48px;
          background: rgba(18, 24, 38, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.08);
          text-align: center;
        }

        /* ─── Authentic Apple iOS / macOS 12-Spoke Activity Indicator ─── */
        .apple-spinner {
          width: 46px;
          height: 46px;
          margin-bottom: 24px;
          animation: apple-rotate 0.95s steps(12, end) infinite;
        }

        @keyframes apple-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Typography & Glow */
        h2 {
          margin: 0 0 8px;
          font-weight: 600;
          font-size: 21px;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .subtitle {
          margin: 0;
          color: #94a3b8;
          font-size: 13.5px;
          font-weight: 400;
          letter-spacing: -0.01em;
          animation: pulse 2.2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      </style>
    </head>
    <body>
      <div class="splash-card">
        <svg class="apple-spinner" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="1.0" transform="rotate(0 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.92" transform="rotate(30 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.84" transform="rotate(60 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.76" transform="rotate(90 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.68" transform="rotate(120 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.60" transform="rotate(150 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.52" transform="rotate(180 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.44" transform="rotate(210 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.36" transform="rotate(240 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.28" transform="rotate(270 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.20" transform="rotate(300 24 24)" />
          <line x1="24" y1="5.5" x2="24" y2="14" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.12" transform="rotate(330 24 24)" />
        </svg>
        <h2>VideoTranslate AI</h2>
        <p class="subtitle">Đang nạp mô hình và khởi động môi trường AI Studio...</p>
      </div>
    </body>
    </html>
  `)}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Chờ Backend sẵn sàng rồi chuyển sang URL chính
  const isReady = await checkHealth();
  try {
    if (mainWindow && mainWindow.webContents && mainWindow.webContents.session) {
      await mainWindow.webContents.session.clearCache();
    }
  } catch (e) {}

  // Lắng nghe sự kiện tải trang thất bại để hiển thị trang lỗi thay vì trắng màn hình
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    if (errorCode === -3) return; // Bỏ qua abort
    console.error(`[Electron] Lỗi nạp trang (${errorCode}): ${errorDescription}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Lỗi Kết Nối - VideoTranslate AI</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; padding: 36px; max-width: 520px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            h2 { color: #f87171; margin-top: 0; font-size: 20px; }
            p { color: #94a3b8; font-size: 13.5px; line-height: 1.6; }
            .btn { display: inline-block; margin-top: 18px; padding: 10px 24px; background: #3b82f6; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; cursor: pointer; border: none; font-size: 14px; transition: 0.2s; }
            .btn:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⚠️ Không thể tải giao diện ứng dụng</h2>
            <p>Hệ thống Backend AI tại <code>http://127.0.0.1:8000</code> chưa sẵn sàng hoặc gặp lỗi kết nối.<br>Mã lỗi: ${errorDescription} (${errorCode})</p>
            <button class="btn" onclick="location.reload()">Thử lại (F5)</button>
          </div>
        </body>
        </html>
      `)}`);
    }
  });

  const loadOptions = {
    extraHeaders: "pragma: no-cache\ncache-control: no-cache\n"
  };

  if (mainWindow) {
    if (isReady) {
      mainWindow.loadURL("http://127.0.0.1:8000", loadOptions);
    } else {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>VideoTranslate AI - Backend Chưa Sẵn Sàng</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; padding: 36px; max-width: 520px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            h2 { color: #f87171; margin-top: 0; font-size: 20px; }
            p { color: #94a3b8; font-size: 13.5px; line-height: 1.6; }
            .btn { display: inline-block; margin-top: 18px; padding: 10px 24px; background: #3b82f6; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; cursor: pointer; border: none; font-size: 14px; transition: 0.2s; }
            .btn:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⚠️ Backend AI Chưa Phản Hồi</h2>
            <p>Hệ thống đã đợi 45 giây nhưng Backend Python chưa hoàn tất khởi động.<br>Vui lòng thử bấm 'Tải lại' hoặc kiểm tra file nhật ký tại <code>logs/app.log</code>.</p>
            <button class="btn" onclick="location.reload()">Tải lại (F5)</button>
          </div>
        </body>
        </html>
      `)}`);
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 6. Quản lý dọn dẹp khi tắt ứng dụng
function killPythonBackend() {
  if (pythonProcess) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${pythonProcess.pid} /T /F`, { windowsHide: true, stdio: "ignore" });
      } else {
        pythonProcess.kill("SIGTERM");
      }
    } catch (e) { }
    pythonProcess = null;
  }
  cleanupPort(8000);
}

// Khởi chạy ứng dụng Electron
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startBackend();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
    killPythonBackend();
  });

  app.on("window-all-closed", () => {
    isQuitting = true;
    killPythonBackend();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
