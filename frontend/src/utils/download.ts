import { toast } from "sonner";

/**
 * Tải file âm thanh hoặc video về máy tính người dùng.
 * Hỗ trợ tự động chuyển hướng qua Backend Proxy nếu gặp lỗi CORS trên Cloudflare R2.
 */
export async function downloadAudioFile(rawUrl: string, customFilename?: string) {
  if (!rawUrl) return;

  const urlWithoutQuery = rawUrl.split("?")[0];
  const urlBaseName = urlWithoutQuery.split("/").pop() || "audio.mp3";
  const filename = customFilename || urlBaseName;

  const toastId = toast.loading(`Đang chuẩn bị tải "${filename}"...`);

  const currentHost = window.location.hostname;
  const apiHost = currentHost === "127.0.0.1" ? "127.0.0.1:8000" : "localhost:8000";

  // Hàm helper lưu Blob an toàn
  const triggerBlobSave = (blob: Blob, saveName: string) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = blobUrl;
    a.download = saveName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    }, 200);
  };

  try {
    let fetchUrl = rawUrl;
    if (currentHost === "127.0.0.1" && fetchUrl.includes("localhost:8000")) {
      fetchUrl = fetchUrl.replace("localhost:8000", "127.0.0.1:8000");
    } else if (currentHost === "localhost" && fetchUrl.includes("127.0.0.1:8000")) {
      fetchUrl = fetchUrl.replace("127.0.0.1:8000", "localhost:8000");
    }

    // Nếu không phải là domain local (tức là Cloudflare R2 hoặc link bên ngoài),
    // ưu tiên tải qua Backend Proxy Stream để tránh bị CORS chặn hoàn toàn.
    const isRemoteCloudUrl =
      fetchUrl.startsWith("http://") || fetchUrl.startsWith("https://")
        ? !fetchUrl.includes("localhost:8000") && !fetchUrl.includes("127.0.0.1:8000")
        : false;

    if (isRemoteCloudUrl) {
      const proxyDownloadUrl = `http://${apiHost}/api/storage/download?url=${encodeURIComponent(
        rawUrl,
      )}&filename=${encodeURIComponent(filename)}`;

      const proxyRes = await fetch(proxyDownloadUrl);
      if (!proxyRes.ok) {
        const errorDetail = await proxyRes.text().catch(() => "");
        throw new Error(`Cloudflare R2 Proxy lỗi HTTP ${proxyRes.status}: ${errorDetail}`);
      }

      const blob = await proxyRes.blob();
      if (blob.size === 0) {
        throw new Error("Tệp tải về từ Cloudflare R2 có kích thước 0 byte");
      }

      triggerBlobSave(blob, filename);
      const sizeStr = blob.size > 1024 * 1024
        ? `${(blob.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(blob.size / 1024).toFixed(0)} KB`;
      toast.success(`Tải xuống thành công! (${sizeStr})`, { id: toastId });
      return;
    }

    // Nếu là file local, thử tải trực tiếp
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      throw new Error(`Máy chủ phản hồi HTTP ${res.status}`);
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      throw new Error("File có kích thước 0 byte");
    }

    triggerBlobSave(blob, filename);
    toast.success("Tải xuống thành công!", { id: toastId });
  } catch (err: any) {
    console.warn("Tải trực tiếp thất bại, chuyển sang Backend Proxy:", err);
    try {
      // Fallback lần cuối qua Backend Storage Proxy
      const fallbackUrl = `http://${apiHost}/api/storage/download?url=${encodeURIComponent(
        rawUrl,
      )}&filename=${encodeURIComponent(filename)}`;

      const resFallback = await fetch(fallbackUrl);
      if (!resFallback.ok) {
        throw new Error(`Proxy fallback lỗi (HTTP ${resFallback.status})`);
      }

      const blob = await resFallback.blob();
      if (blob.size === 0) {
        throw new Error("Tệp rỗng");
      }

      triggerBlobSave(blob, filename);
      toast.success("Tải xuống thành công!", { id: toastId });
    } catch (finalErr: any) {
      console.error("Tải file thất bại hoàn toàn:", finalErr);
      toast.error(`Không thể tải tệp: ${err?.message || finalErr?.message || "Lỗi không xác định"}`, {
        id: toastId,
      });
    }
  }
}
