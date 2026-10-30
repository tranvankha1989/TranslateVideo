import { useRef } from "react";
import { toast } from "sonner";

import { useTTSStore, applyPronunciationDictionary, type ScriptBlock } from "../store/useTTSStore";
import { API_BASE_URL } from "../constants/api";
import { useGlobalLicense } from "@/components/GlobalLicenseGuard";

interface ParsedSentence {
  text: string;
  pauseAfter: number;
}

interface GenerateOptions {
  saveStudioBlocks: (blocks: ScriptBlock[]) => void;
  setGenerationProgress: (progress: { current: number; total: number }) => void;
}

let globalStudioTimer: NodeJS.Timeout | null = null;

export function useStudioGenerate() {
  const { status: licenseStatus, openModal } = useGlobalLicense();
  const {
    text,
    mode,
    instruct,
    cfg_value,
    seed,
    pauseSettings,
    speed,
    pitch,
    isLoading,
    enhanceAudio,
    selectedVoiceId,
    voices,
    pronunciationWords,
    setIsLoading,
    setAudioUrl,
    addHistory,
    generationProgress,
    elapsedTime,
    setElapsedTime,
  } = useTTSStore();

  const initialBlocksRef = useRef<ScriptBlock[]>([]);
  const initialAudioUrlRef = useRef<string | null>(null);
  const initialElapsedTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const activeToastIdRef = useRef<string | number | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  const cleanupTimer = () => {
    if (globalStudioTimer) {
      clearInterval(globalStudioTimer);
      globalStudioTimer = null;
    }
  };

  // ── Phân tích câu với thông tin ngắt nghỉ ─────────────────────────────
  const splitIntoSentencesWithPause = (input: string): ParsedSentence[] => {
    const trimmed = input.trim();
    if (!trimmed) return [];
    const lines = trimmed.split(/\r?\n+/);
    const result: ParsedSentence[] = [];

    lines.forEach((line, lineIdx) => {
      const lineTrimmed = line.trim();
      if (!lineTrimmed) return;

      const isLastLine = lineIdx === lines.length - 1;
      const parts = lineTrimmed.match(/[^.!?…;]+[.!?…;]*|\S+/g);
      if (!parts || parts.length === 0) {
        result.push({
          text: lineTrimmed,
          pauseAfter: isLastLine ? pauseSettings.period : pauseSettings.newline,
        });
        return;
      }

      parts.forEach((p, pIdx) => {
        const seg = p.trim();
        if (!seg) return;
        const isLastInLine = pIdx === parts.length - 1;

        let pause = pauseSettings.period;
        if (isLastInLine && !isLastLine) {
          pause = pauseSettings.newline;
        } else if (seg.endsWith(";")) {
          pause = pauseSettings.semicolon;
        } else {
          pause = pauseSettings.period;
        }

        result.push({ text: seg, pauseAfter: pause });
      });
    });

    return result.length > 0
      ? result
      : [{ text: trimmed, pauseAfter: pauseSettings.period }];
  };

  // ── Generate chính ───────────────────────────────────────────────────────
  const handleGenerate = async (
    selectedProjectId: string,
    { saveStudioBlocks, setGenerationProgress: setProgress }: GenerateOptions,
  ) => {
    if (!text.trim()) {
      toast.error("Vui lòng nhập văn bản cần đọc");
      return;
    }

    const currentModelStatus = useTTSStore.getState().modelStatus;
    if (currentModelStatus && currentModelStatus.state !== "ready" && currentModelStatus.state !== "idle") {
      toast.warning("Mô hình AI OmniVoice đang được tải hoặc nạp vào bộ nhớ. Vui lòng đợi trong giây lát!", {
        duration: 4000,
      });
      return;
    }

    // Feature Gating: Kiểm tra giới hạn 2.000 ký tự ở chế độ dùng thử (Trial)
    const isPro = licenseStatus?.unlocked && (licenseStatus?.tier === "lifetime" || licenseStatus?.tier === "pro_licensed");
    if (!isPro && text.trim().length > 2000) {
      toast.error(
        "Chế độ dùng thử (Trial) giới hạn tối đa 2.000 ký tự / lần xuất âm thanh. Vui lòng rút ngắn văn bản hoặc nâng cấp bản quyền PRO!",
        { duration: 5000 }
      );
      openModal();
      return;
    }

    // Lưu snapshot trước khi bắt đầu để có thể khôi phục lại nguyên vẹn nếu bấm Dừng
    initialBlocksRef.current = [...useTTSStore.getState().studioBlocks];
    initialAudioUrlRef.current = useTTSStore.getState().audioUrl;
    initialElapsedTimeRef.current = useTTSStore.getState().elapsedTime;
    isCancelledRef.current = false;
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setAudioUrl(null);

    const toastId = toast.loading("Đang khởi tạo mô hình...", { duration: 30000 });
    activeToastIdRef.current = toastId;

    setElapsedTime(0);
    try {
      localStorage.removeItem("tts_master_elapsed_time");
    } catch {}
    cleanupTimer();
    globalStudioTimer = setInterval(() => {
      useTTSStore.getState().setElapsedTime((prev) => prev + 1);
    }, 1000);

    const currentSessionId =
      "aud_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
    currentSessionIdRef.current = currentSessionId;
    try {
      localStorage.setItem("tts_studio_session_id", currentSessionId);
    } catch {}

    try {
      const processedText = applyPronunciationDictionary(text, pronunciationWords);
      const sentences = splitIntoSentencesWithPause(processedText);

      // ── Single sentence mode ─────────────────────────────────────────────
      if (sentences.length <= 1) {
        const response = await fetch(`${API_BASE_URL}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            text: sentences[0]?.text || processedText,
            mode,
            instruct: mode === "design" ? instruct : null,
            cfg_value,
            normalize: false,
            voice_id: mode === "clone" ? selectedVoiceId : null,
            seed,
            speed,
            pitch,
            format: useTTSStore.getState().audioFormat,
            enhance_audio: enhanceAudio,
            engine: "omnivoice",
            session_id: currentSessionId,
          }),
        });

        if (isCancelledRef.current) return;

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Lỗi kết nối đến máy chủ API");
        }

        const data = await response.json();
        if (isCancelledRef.current) return;

        setAudioUrl(data.audio_url);
        try {
          localStorage.setItem("tts_master_elapsed_time", String(elapsedTime));
        } catch {}

        const singleBlock: ScriptBlock = {
          id: "seg_" + Math.random().toString(36).substring(2, 9),
          text: text.trim(),
          voiceId: mode === "clone" ? selectedVoiceId : null,
          voiceName:
            mode === "clone"
              ? voices.find((v) => v.id === selectedVoiceId)?.name || "Mặc định"
              : "Voice Design",
          speed,
          pitch,
          pauseAfter: sentences[0]?.pauseAfter || pauseSettings.period,
          status: "ready",
          audioUrl: data.audio_url,
          filename: data.filename,
          duration: data.duration || undefined,
        };
        saveStudioBlocks([singleBlock]);
        useTTSStore.getState().setStudioBlocks([singleBlock]);

        const singleBlockFn =
          data.filename || (data.audio_url ? data.audio_url.split("/").pop() : null);

        addHistory({
          text,
          url: data.audio_url,
          blockFilenames: singleBlockFn ? [singleBlockFn] : [],
          projectId: selectedProjectId || undefined,
          voiceId: mode === "clone" ? selectedVoiceId : null,
          voiceName:
            mode === "clone"
              ? voices.find((v) => v.id === selectedVoiceId)?.name || "Mặc định"
              : mode === "design"
                ? `Design: ${instruct.slice(0, 20) || "Tùy chỉnh"}`
                : "Tự động (Auto)",
          mode,
          instruct,
          cfg_value,
          seed,
          speed,
          pitch,
          engine: "omnivoice",
          sessionId: currentSessionId,
        });

        toast.success("Thành công! Đã tạo âm thanh mới.", { id: toastId });
      } else {
        // ── Batch (multi-sentence) mode ────────────────────────────────────
        toast.loading(`Đang xử lý ${sentences.length} phân đoạn câu...`, { id: toastId });

        const newBlocks: ScriptBlock[] = sentences.map((s, idx) => ({
          id: `seg_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          text: s.text,
          voiceId: mode === "clone" ? selectedVoiceId : null,
          voiceName:
            mode === "clone"
              ? voices.find((v) => v.id === selectedVoiceId)?.name || "Mặc định"
              : "Voice Design",
          speed,
          pitch,
          pauseAfter: s.pauseAfter,
          status: "rendering",
        }));
        saveStudioBlocks(newBlocks);
        useTTSStore.getState().setStudioBlocks(newBlocks);
        setProgress({ current: 0, total: sentences.length });
        useTTSStore.getState().setGenerationProgress({ current: 0, total: sentences.length });

        let completedBlocks: ScriptBlock[] = [...newBlocks];
        const CONCURRENCY = 2;
        let nextIndex = 0;
        let finishedCount = 0;

        const processSentenceWorker = async () => {
          while (nextIndex < sentences.length) {
            if (isCancelledRef.current) break;
            const i = nextIndex++;
            try {
              const res = await fetch(`${API_BASE_URL}/api/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: abortControllerRef.current?.signal,
                body: JSON.stringify({
                  text: sentences[i].text,
                  mode,
                  instruct: mode === "design" ? instruct : null,
                  cfg_value,
                  normalize: false,
                  voice_id: mode === "clone" ? selectedVoiceId : null,
                  seed,
                  speed,
                  pitch,
                  format: useTTSStore.getState().audioFormat || "mp3",
                  enhance_audio: enhanceAudio,
                  engine: "omnivoice",
                  session_id: currentSessionId,
                }),
              });

              if (isCancelledRef.current) break;

              if (res.ok) {
                const bData = await res.json();
                if (isCancelledRef.current) break;
                completedBlocks = completedBlocks.map((b, bIdx) =>
                  bIdx === i
                    ? {
                        ...b,
                        status: "ready" as const,
                        audioUrl: bData.audio_url,
                        filename: bData.filename,
                        duration: bData.duration || undefined,
                      }
                    : b,
                );
              } else {
                completedBlocks = completedBlocks.map((b, bIdx) =>
                  bIdx === i ? { ...b, status: "error" as const, error: "Lỗi render" } : b,
                );
              }
            } catch (e: any) {
              if (isCancelledRef.current || e.name === "AbortError") break;
              completedBlocks = completedBlocks.map((b, bIdx) =>
                bIdx === i ? { ...b, status: "error" as const, error: e.message } : b,
              );
            }

            if (isCancelledRef.current) break;

            finishedCount++;
            setProgress({ current: finishedCount, total: sentences.length });
            useTTSStore.getState().setGenerationProgress({ current: finishedCount, total: sentences.length });
            saveStudioBlocks([...completedBlocks]);
            useTTSStore.getState().setStudioBlocks([...completedBlocks]);
          }
        };

        const workers = Array.from(
          { length: Math.min(CONCURRENCY, sentences.length) },
          () => processSentenceWorker()
        );
        await Promise.all(workers);

        if (isCancelledRef.current) return;

        const readyBlocks = completedBlocks.filter(
          (b) => b.status === "ready" && (b.filename || b.audioUrl),
        );

        if (readyBlocks.length > 0) {
          const stitchRes = await fetch(`${API_BASE_URL}/api/tts/stitch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortControllerRef.current?.signal,
            body: JSON.stringify({
              blocks: readyBlocks.map((b) => ({
                filename: b.filename || b.audioUrl!.split("/").pop()!,
                pause_after:
                  typeof b.pauseAfter === "number" ? b.pauseAfter : pauseSettings.period,
                text: b.text,
              })),
              format: useTTSStore.getState().audioFormat || "mp3",
              project_name: "Studio_Master",
              session_id: currentSessionId,
              crossfade_ms: pauseSettings.crossfade ?? 15,
              loudness_standard: useTTSStore.getState().loudnessStandard || "ebu_r128",
            }),
          });

          if (isCancelledRef.current) return;

          if (stitchRes.ok) {
            const stitchData = await stitchRes.json();
            if (isCancelledRef.current) return;
            setAudioUrl(stitchData.audio_url);
            try {
              localStorage.setItem("tts_master_elapsed_time", String(elapsedTime));
            } catch {}

            if (Array.isArray(stitchData.segments) && stitchData.segments.length > 0) {
              completedBlocks = completedBlocks.map((b) => {
                const fn = b.filename || (b.audioUrl ? b.audioUrl.split("/").pop() : null);
                const matchedSeg = stitchData.segments.find((s: any) => s.filename === fn);
                return matchedSeg ? { ...b, duration: matchedSeg.duration } : b;
              });
              saveStudioBlocks(completedBlocks);
              useTTSStore.getState().setStudioBlocks(completedBlocks);
            }

            const blockFilenames = readyBlocks
              .map((b) => b.filename || (b.audioUrl ? b.audioUrl.split("/").pop() : null))
              .filter(Boolean) as string[];

            addHistory({
              text,
              url: stitchData.audio_url,
              blockFilenames,
              projectId: selectedProjectId || undefined,
              voiceId: mode === "clone" ? selectedVoiceId : null,
              voiceName:
                mode === "clone"
                  ? voices.find((v) => v.id === selectedVoiceId)?.name || "Mặc định"
                  : "Phân đoạn câu",
              mode,
              instruct,
              cfg_value,
              seed,
              speed,
              pitch,
              engine: "omnivoice",
              sessionId: currentSessionId,
            });

            toast.success(
              `Đã tạo xong và ghép nối ${readyBlocks.length} phân đoạn!`,
              { id: toastId },
            );
          } else {
            toast.warning(
              "Đã tạo xong các phân đoạn nhưng chưa thể tự ghép file master.",
              { id: toastId },
            );
          }
        } else {
          toast.error("Không có phân đoạn nào render thành công.", { id: toastId });
        }
      }
    } catch (err: any) {
      if (isCancelledRef.current || err.name === "AbortError") {
        return;
      }
      toast.error(`Tổng hợp thất bại: ${err.message}`, { id: toastId });
    } finally {
      cleanupTimer();
      setIsLoading(false);
      if (!isCancelledRef.current) {
        try {
          localStorage.setItem(
            "tts_master_elapsed_time",
            String(useTTSStore.getState().elapsedTime),
          );
        } catch {}
      }
    }
  };

  // ── Dừng xử lý và khôi phục trạng thái ban đầu ─────────────────────────────
  const handleStopGenerate = (
    saveStudioBlocks?: (blocks: ScriptBlock[]) => void,
  ) => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (activeToastIdRef.current) {
      toast.dismiss(activeToastIdRef.current);
      activeToastIdRef.current = null;
    }

    cleanupTimer();
    setIsLoading(false);
    useTTSStore.getState().setGenerationProgress({ current: 0, total: 0 });

    // Hủy và dọn dẹp thư mục session dở dang trên server
    const currentSess =
      currentSessionIdRef.current ||
      localStorage.getItem("tts_studio_session_id");
    if (currentSess) {
      fetch(`${API_BASE_URL}/api/tts/session/${currentSess}`, {
        method: "DELETE",
      }).catch(() => {});
    }

    // Khôi phục hoàn toàn trạng thái ban đầu như lúc chưa bấm gì
    const prevBlocks = initialBlocksRef.current || [];
    if (saveStudioBlocks) {
      saveStudioBlocks(prevBlocks);
    }
    useTTSStore.getState().setStudioBlocks(prevBlocks);
    useTTSStore.getState().setAudioUrl(initialAudioUrlRef.current);
    useTTSStore.getState().setElapsedTime(initialElapsedTimeRef.current);

    if (initialAudioUrlRef.current) {
      try {
        localStorage.setItem("tts_master_audio_url", initialAudioUrlRef.current);
      } catch {}
    } else {
      try {
        localStorage.removeItem("tts_master_audio_url");
      } catch {}
    }

    toast.info("Đã dừng xử lý và khôi phục trạng thái ban đầu!");
  };

  return {
    elapsedTime,
    generationProgress,
    isLoading,
    handleGenerate,
    handleStopGenerate,
    cleanupTimer,
  };
}
