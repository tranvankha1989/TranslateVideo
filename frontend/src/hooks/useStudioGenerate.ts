import { toast } from "sonner";

import { useTTSStore, applyPronunciationDictionary, type ScriptBlock } from "../store/useTTSStore";
import { API_BASE_URL } from "../constants/api";

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

    setIsLoading(true);
    setAudioUrl(null);

    const toastId = toast.loading("Đang khởi tạo mô hình...", { duration: 30000 });

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

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Lỗi kết nối đến máy chủ API");
        }

        const data = await response.json();
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
            const i = nextIndex++;
            try {
              const res = await fetch(`${API_BASE_URL}/api/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

              if (res.ok) {
                const bData = await res.json();
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
              completedBlocks = completedBlocks.map((b, bIdx) =>
                bIdx === i ? { ...b, status: "error" as const, error: e.message } : b,
              );
            }

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

        const readyBlocks = completedBlocks.filter(
          (b) => b.status === "ready" && (b.filename || b.audioUrl),
        );

        if (readyBlocks.length > 0) {
          const stitchRes = await fetch(`${API_BASE_URL}/api/tts/stitch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

          if (stitchRes.ok) {
            const stitchData = await stitchRes.json();
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
      toast.error(`Tổng hợp thất bại: ${err.message}`, { id: toastId });
    } finally {
      cleanupTimer();
      setIsLoading(false);
      try {
        localStorage.setItem(
          "tts_master_elapsed_time",
          String(useTTSStore.getState().elapsedTime),
        );
      } catch {}
    }
  };

  return {
    elapsedTime,
    generationProgress,
    isLoading,
    handleGenerate,
    cleanupTimer,
  };
}
