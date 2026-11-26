const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const http = require("http");

let mainWindow = null;
let pythonProcess = null;
let isQuitting = false;
let backendExited = false;
let backendExitCode = null;
let lastBackendLogs = [];
let logStream = null; // Chỉ ghi backend_startup.log trong lúc khởi động (tránh file phình to cả phiên)
let waitingForBackend = false; // Đang ở màn hình chờ khởi động (tự chờ, F5 không cần làm gì)
const BACKEND_URL = "http://127.0.0.1:8000";

function closeStartupLog(note) {
  if (!logStream) return;
  try {
    if (note) logStream.write(`${note}\n`);
    logStream.end();
  } catch (e) {}
  logStream = null;
}

function appendBackendLog(chunk) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    lastBackendLogs.push(line);
    if (lastBackendLogs.length > 30) {
      lastBackendLogs.shift();
    }
  }
}

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

  // Đường dẫn Python Runtime: Ưu tiên backend/venv (môi trường dev), sau đó đến python_runtime (standalone package)
  let pythonExe = path.join(rootDir, "backend", "venv", "Scripts", "python.exe");
  if (!fs.existsSync(pythonExe)) {
    pythonExe = path.join(rootDir, "python_runtime", "python.exe");
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
  const { rootDir, pythonExe, backendDir, isDev } = getProjectPaths();
  cleanupPort(8000);
  backendExited = false;
  backendExitCode = null;
  lastBackendLogs = [];

  const logsDir = path.join(rootDir, "logs");
  if (!fs.existsSync(logsDir)) {
    try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) {}
  }
  const startupLogFile = path.join(logsDir, "backend_startup.log");
  closeStartupLog();
  try {
    logStream = fs.createWriteStream(startupLogFile, { flags: "a" });
    logStream.write(`\n--- [${new Date().toISOString()}] KHOI DONG BACKEND PYTHON ---\n`);
    logStream.write(`Python: ${pythonExe}\nBackendDir: ${backendDir}\n`);
  } catch (e) {}

  const args = ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"];

  console.log(`[Electron] Khởi động Python Backend: ${pythonExe}`);
  console.log(`[Electron] Thư mục Backend: ${backendDir}`);

  try {
    pythonProcess = spawn(pythonExe, args, {
      cwd: backendDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONUTF8: "1" }
    });

    if (pythonProcess.stdout) {
      pythonProcess.stdout.on("data", (chunk) => {
        appendBackendLog(chunk);
        if (logStream) logStream.write(chunk);
        if (isDev) process.stdout.write(chunk);
      });
    }

    if (pythonProcess.stderr) {
      pythonProcess.stderr.on("data", (chunk) => {
        appendBackendLog(chunk);
        if (logStream) logStream.write(chunk);
        if (isDev) process.stderr.write(chunk);
      });
    }

    pythonProcess.on("error", (err) => {
      console.error("[Electron] Lỗi khởi động Python:", err);
      const errMsg = `[Electron Error] Không thể chạy Python: ${err.message}\n`;
      appendBackendLog(errMsg);
      if (logStream) logStream.write(errMsg);
      backendExited = true;
      backendExitCode = -1;
    });

    pythonProcess.on("exit", (code, signal) => {
      const exitMsg = `[Electron Exit] Python Process kết thúc với mã: ${code}, signal: ${signal}\n`;
      console.log(exitMsg);
      appendBackendLog(exitMsg);
      closeStartupLog(exitMsg.trim());
      backendExited = true;
      backendExitCode = code;
    });
  } catch (err) {
    console.error("[Electron] Exception khi spawn Python:", err);
    backendExited = true;
    backendExitCode = -1;
    appendBackendLog(err.message);
  }
}

// 4. Kiểm tra sức khỏe Backend (Healthcheck)
// Lần mở đầu sau khi bật máy / vừa cài: Python + thư viện AI (~50.000 file) đọc từ ổ đĩa nguội,
// có antivirus quét có thể mất 1-3 phút -> chờ 3 phút (thoát sớm nếu Python chết)
function checkHealth(url = `${BACKEND_URL}/health`, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      // Nếu Python đã crash / thoát sớm thì fail-fast ngay lập tức
      if (backendExited) {
        clearInterval(interval);
        console.error(`[Electron] Backend đã thoát sớm (exitCode=${backendExitCode}), hủy chờ healthcheck!`);
        resolve(false);
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        resolve(false);
        return;
      }

      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          res.resume(); // Tiêu thụ stream để giải phóng socket
          resolve(true);
        } else {
          res.resume();
        }
      });

      req.on("error", () => {
        // Đang chờ server nạp
      });

      // Tránh socket bị treo
      req.setTimeout(1200, () => {
        req.destroy();
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
      // Đang ở trang chờ/trang lỗi (data:) thì kết nối lại Backend, không tải lại chính trang lỗi
      if (mainWindow.webContents.getURL().startsWith("data:")) {
        if (!waitingForBackend) mainWindow.loadURL(BACKEND_URL);
      } else {
        mainWindow.webContents.reloadIgnoringCache();
      }
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

  // Chờ Backend sẵn sàng rồi chuyển sang URL chính; quá 15 giây thì báo người dùng đừng tắt app
  const waitStart = Date.now();
  const waitNotice = setInterval(() => {
    const secs = Math.round((Date.now() - waitStart) / 1000);
    if (secs < 15 || !mainWindow || mainWindow.isDestroyed()) return;
    const msg = `Lần mở đầu sau khi bật máy có thể mất 1-3 phút, vui lòng không tắt ứng dụng... (${secs} giây)`;
    mainWindow.webContents
      .executeJavaScript(`(function(){var e=document.querySelector('.subtitle'); if(e) e.textContent=${JSON.stringify(msg)};})()`)
      .catch(() => {});
  }, 1000);
  waitingForBackend = true;
  const isReady = await checkHealth();
  waitingForBackend = false;
  clearInterval(waitNotice);
  if (isReady) closeStartupLog(`[Electron] Backend sẵn sàng sau ${Math.round((Date.now() - waitStart) / 1000)} giây`);
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
            <button class="btn" onclick="window.location.href='${BACKEND_URL}'">Thử lại (F5)</button>
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
      const logPreview = lastBackendLogs.slice(-10).join("\n") || "Chưa có log từ tiến trình Backend.";
      const exitInfo = backendExited
        ? `Tiến trình Python đã dừng đột ngột (Mã thoát: ${backendExitCode}). Vui lòng tắt và mở lại ứng dụng.`
        : "Hệ thống đã đợi 3 phút nhưng Backend chưa hoàn tất nạp server. Ứng dụng sẽ tự vào giao diện khi Backend sẵn sàng.";

      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>VideoTranslate AI - Backend Chưa Sẵn Sàng</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; padding: 32px; max-width: 650px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            h2 { color: #f87171; margin-top: 0; font-size: 20px; }
            p { color: #94a3b8; font-size: 13.5px; line-height: 1.6; margin: 8px 0; }
            .log-box { background: #030712; color: #38bdf8; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11.5px; text-align: left; max-height: 160px; overflow-y: auto; white-space: pre-wrap; margin: 16px 0; border: 1px solid #1f2937; }
            .btn { display: inline-block; margin-top: 10px; padding: 10px 24px; background: #3b82f6; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; cursor: pointer; border: none; font-size: 14px; transition: 0.2s; }
            .btn:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⚠️ Backend AI Chưa Phản Hồi</h2>
            <p>${exitInfo}</p>
            <p>Vui lòng kiểm tra nhật ký chi tiết tại: <code>logs/backend_startup.log</code> hoặc <code>logs/app.log</code></p>
            <div class="log-box">${logPreview.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            <button class="btn" onclick="window.location.href='${BACKEND_URL}'">Thử kết nối lại (F5)</button>
          </div>
        </body>
        </html>
      `)}`);

      // Python vẫn đang chạy (chỉ chậm): tiếp tục chờ ngầm thêm 10 phút, sẵn sàng thì tự vào giao diện
      if (!backendExited) {
        checkHealth(`${BACKEND_URL}/health`, 600000).then((lateReady) => {
          if (!lateReady || !mainWindow || mainWindow.isDestroyed()) return;
          closeStartupLog("[Electron] Backend sẵn sàng (muộn), tự chuyển vào giao diện");
          if (mainWindow.webContents.getURL().startsWith("data:")) {
            mainWindow.loadURL(BACKEND_URL, loadOptions);
          }
        });
      }
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
