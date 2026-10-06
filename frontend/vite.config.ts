import path from "path";
import fs from "fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tự động đọc phiên bản từ nguồn duy nhất version.json tại thư mục gốc
let appVersion = "3.10.4";
const possibleVersionPaths = [
  path.resolve(import.meta.dirname, "../version.json"),
  path.resolve(import.meta.dirname, "./version.json"),
];

for (const vPath of possibleVersionPaths) {
  if (fs.existsSync(vPath)) {
    try {
      const vData = JSON.parse(fs.readFileSync(vPath, "utf-8"));
      if (vData.version) {
        appVersion = vData.version.trim();
        break;
      }
    } catch {
      // fallback
    }
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
