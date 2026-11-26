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
    background: rgba(18, 24, 38, 0.7);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.08);
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

module.exports = { bootSplashHtml, BOOT_CSS };
