const { app, BrowserWindow, shell } = require("electron");
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
      path.resolve(process.resourcesPath, ".."),
      path.resolve(process.resourcesPath, "app.asar.unpacked"),
      path.resolve(app.getAppPath(), ".."),
      app.getAppPath()
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
    backgroundColor: "#0b0f19",
    show: false, // Ẩn cho đến khi sẵn sàng để tránh giật hình
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      webSecurity: true
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

        /* ─── Apple iOS / macOS 12-Blade Activity Indicator ─── */
        .ios-spinner {
          position: relative;
          width: 48px;
          height: 48px;
          margin-bottom: 26px;
        }
        .ios-spinner .blade {
          position: absolute;
          left: 47%;
          top: 15%;
          width: 3.5px;
          height: 11px;
          background: #ffffff;
          border-radius: 2.5px;
          transform-origin: center 17px;
          animation: ios-fade 1.2s linear infinite;
        }
        .ios-spinner .blade:nth-child(1)  { transform: rotate(0deg);   animation-delay: -1.2s; }
        .ios-spinner .blade:nth-child(2)  { transform: rotate(30deg);  animation-delay: -1.1s; }
        .ios-spinner .blade:nth-child(3)  { transform: rotate(60deg);  animation-delay: -1.0s; }
        .ios-spinner .blade:nth-child(4)  { transform: rotate(90deg);  animation-delay: -0.9s; }
        .ios-spinner .blade:nth-child(5)  { transform: rotate(120deg); animation-delay: -0.8s; }
        .ios-spinner .blade:nth-child(6)  { transform: rotate(150deg); animation-delay: -0.7s; }
        .ios-spinner .blade:nth-child(7)  { transform: rotate(180deg); animation-delay: -0.6s; }
        .ios-spinner .blade:nth-child(8)  { transform: rotate(210deg); animation-delay: -0.5s; }
        .ios-spinner .blade:nth-child(9)  { transform: rotate(240deg); animation-delay: -0.4s; }
        .ios-spinner .blade:nth-child(10) { transform: rotate(270deg); animation-delay: -0.3s; }
        .ios-spinner .blade:nth-child(11) { transform: rotate(300deg); animation-delay: -0.2s; }
        .ios-spinner .blade:nth-child(12) { transform: rotate(330deg); animation-delay: -0.1s; }

        @keyframes ios-fade {
          0% { opacity: 1; }
          100% { opacity: 0.15; }
        }

        /* Typography & Glow */
        h2 {
          margin: 0 0 6px;
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
        <div class="ios-spinner">
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
          <div class="blade"></div>
        </div>
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
  if (isReady && mainWindow) {
    mainWindow.loadURL("http://127.0.0.1:8000");
  } else if (mainWindow) {
    mainWindow.loadURL("http://127.0.0.1:8000");
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
    } catch (e) {}
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
