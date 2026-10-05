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

  // Tải trang Loading chờ server sẵn sàng
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>VideoTranslate AI</title>
      <style>
        body {
          margin: 0;
          background: #0b0f19;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          user-select: none;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 24px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        h2 { margin: 0 0 8px; font-weight: 600; font-size: 20px; }
        p { margin: 0; color: #94a3b8; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="spinner"></div>
      <h2>VideoTranslate AI</h2>
      <p>Đang nạp mô hình và khởi động môi trường AI Studio...</p>
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
