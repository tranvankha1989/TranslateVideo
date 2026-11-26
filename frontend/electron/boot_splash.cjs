// Màn hình khởi động duy nhất (vòng xoay + phần trăm) dùng từ lúc mở app tới khi vào giao diện chính.
// Giao diện PHẢI giống hệt 2 nơi còn lại: frontend/index.html (CSS lớp boot-* + khung tĩnh) và
// frontend/src/components/BootSplash.tsx (màn hình xác thực bản quyền). Sửa giao diện thì sửa cả 3 nơi.

const BOOT_CSS = `
  .boot-screen {
    position: fixed; inset: 0; z-index: 2147483000;
    display: flex; align-items: center; justify-content: center;
    background: #090d16; color: #f8fafc; overflow: hidden; user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  }
  .boot-card {
    display: flex; flex-direction: column; align-items: center; box-sizing: border-box;
    min-width: 380px; max-width: 520px; padding: 40px 48px; text-align: center;
  }
  .boot-spin-wrap { position: relative; width: 76px; height: 76px; margin-bottom: 22px; }
  .boot-spinner { display: block; width: 76px; height: 76px; animation: boot-rotate 0.95s steps(12, end) infinite; }
  @keyframes boot-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .boot-pct {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 600; color: #f8fafc; font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
  }
  .boot-title {
    margin: 0 0 8px; font-weight: 600; font-size: 21px; line-height: 1.3; letter-spacing: -0.02em;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .boot-sub {
    margin: 0; color: #94a3b8; font-size: 13.5px; font-weight: 400; line-height: 1.5; letter-spacing: -0.01em;
    animation: boot-pulse 2.2s ease-in-out infinite;
  }
  @keyframes boot-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
`;

function spokesSvg() {
  let lines = "";
  for (let i = 0; i < 12; i++) {
    const opacity = (1 - i * 0.08).toFixed(2);
    lines += `<line x1="40" y1="4" x2="40" y2="14" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="${opacity}" transform="rotate(${i * 30} 40 40)" />`;
  }
  return `<svg class="boot-spinner" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Trang chờ của Electron. Cập nhật phần trăm/chữ bằng: window.__boot(phanTram, chu)
function bootSplashHtml(percent, text) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>VideoTranslate AI</title>
  <style>html, body { margin: 0; padding: 0; background: #090d16; }${BOOT_CSS}</style>
</head>
<body>
  <div class="boot-screen">
    <div class="boot-card">
      <div class="boot-spin-wrap">
        ${spokesSvg()}
        <div class="boot-pct" id="boot-pct">${pct}%</div>
      </div>
      <h2 class="boot-title">VideoTranslate AI</h2>
      <p class="boot-sub" id="boot-sub">${escapeHtml(text)}</p>
    </div>
  </div>
  <script>
    window.__boot = function (p, t) {
      var a = document.getElementById("boot-pct");
      var b = document.getElementById("boot-sub");
      if (a && typeof p === "number") a.textContent = Math.round(p) + "%";
      if (b && typeof t === "string" && b.textContent !== t) b.textContent = t;
    };
  </script>
</body>
</html>`;
}

// Lớp phủ khung chờ nằm TRÊN giao diện chính suốt quá trình khởi động (1 màn hình duy nhất 0-100%):
// giao diện React tải ngầm bên dưới, báo tiến độ qua window.__vtBoot = {pct, text, done};
// khi done thì hiện 100% một nhịp rồi gỡ lớp phủ -> không có bước chuyển trang nào lộ ra.
function createBootOverlay(win, WebContentsView, initialPct, initialText) {
  const view = new WebContentsView({
    webPreferences: { nodeIntegration: false, contextIsolation: true, devTools: false, spellcheck: false },
  });
  view.setBackgroundColor("#090d16");
  const fit = () => {
    if (win.isDestroyed()) return;
    const b = win.getContentBounds();
    view.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
  };
  win.contentView.addChildView(view);
  fit();
  win.on("resize", fit);
  view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(bootSplashHtml(initialPct, initialText))}`);

  let shownPct = Math.round(initialPct);
  let shownText = initialText;
  let removed = false;
  let follow = null;

  function push(pct, text) {
    if (removed || view.webContents.isDestroyed()) return;
    pct = Math.max(shownPct, Math.min(100, Math.round(pct))); // phần trăm chỉ tăng, không lùi
    text = typeof text === "string" && text ? text : shownText;
    if (pct === shownPct && text === shownText) return;
    shownPct = pct;
    shownText = text;
    view.webContents
      .executeJavaScript(`window.__boot && window.__boot(${pct}, ${JSON.stringify(text)})`)
      .catch(() => {});
  }

  function remove() {
    if (removed) return;
    removed = true;
    if (follow) clearInterval(follow);
    if (!win.isDestroyed()) {
      win.removeListener("resize", fit);
      try { win.contentView.removeChildView(view); } catch (e) {}
    }
    try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch (e) {}
  }

  // Theo dõi tiến độ giao diện chính; gỡ lớp phủ khi giao diện báo xong. Giao diện không báo tiến độ
  // (lỗi nạp JS...) sau 20 giây kể từ khi trang tải xong, hoặc quá maxMs, thì cũng gỡ để không kẹt màn hình chờ.
  function followApp(wc, maxMs = 180000) {
    const start = Date.now();
    let loadedAt = 0;
    let busy = false;
    const onLoaded = () => { loadedAt = Date.now(); };
    wc.on("did-finish-load", onLoaded);
    follow = setInterval(async () => {
      if (removed || wc.isDestroyed()) { remove(); return; }
      if (Date.now() - start > maxMs || (loadedAt && Date.now() - loadedAt > 20000 && shownPct < 93)) {
        remove();
        return;
      }
      if (busy) return;
      busy = true;
      let raw = "";
      try {
        raw = await wc.executeJavaScript("window.__vtBoot ? JSON.stringify(window.__vtBoot) : ''", true);
      } catch (e) {}
      busy = false;
      if (removed || !raw) return;
      try {
        const b = JSON.parse(raw);
        push(Number(b.pct) || 0, b.text);
        if (b.done) {
          push(100, b.text);
          clearInterval(follow);
          follow = null;
          wc.removeListener("did-finish-load", onLoaded);
          setTimeout(() => {
            remove();
            try { if (!wc.isDestroyed()) wc.focus(); } catch (e) {}
          }, 300);
        }
      } catch (e) {}
    }, 250);
  }

  return { view, push, remove, followApp, isRemoved: () => removed };
}

module.exports = { bootSplashHtml, createBootOverlay, BOOT_CSS };
