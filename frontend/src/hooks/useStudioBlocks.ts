import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

import { useTTSStore, applyPronunciationDictionary, type ScriptBlock } from "../store/useTTSStore";
import { API_BASE_URL } from "../constants/api";
import { globalAudio } from "../utils/audioCoordinator";

export function useStudioBlocks() {
  const { pronunciationWords, enhanceAudio, studioBlocks, setStudioBlocks } = useTTSStore();

  // ── State ────────────────────────────────────────────────────────────────
  const [isSegmentsCollapsed, setIsSegmentsCollapsed] = useState(false);
  const [hasModifiedSegments, setHasModifiedSegments] = useState<boolean>(() => {
    try {
      return localStorage.getItem("tts_has_modified_segments") === "true";
    } catch {
      return false;
    }
  });

  const updateHasModifiedSegments = (val: boolean) => {
    setHasModifiedSegments(val);
    try {
      localStorage.setItem("tts_has_modified_segments", String(val));
    } catch {}
  };
  const [isUpdatingMaster, setIsUpdatingMaster] = useState(false);
  const [playingStudioBlockId, setPlayingStudioBlockId] = useState<string | null>(null);

  // Lắng nghe sự kiện dọn dẹp Studio khi audio tương ứng bị xóa khỏi Thư viện
  useEffect(() => {
    const handleClear = () => {
      setStudioBlocks([]);
      setHasModifiedSegments(false);
      setPast([]);
      setFuture([]);
    };

    window.addEventListener("tts_studio_clear", handleClear);

    // Dọn sạch nếu thư viện trống và không có audioUrl
    const hist = useTTSStore.getState().history;
    const audUrl = useTTSStore.getState().audioUrl;
    if (hist.length === 0 && !audUrl) {
      handleClear();
      localStorage.removeItem("tts_studio_blocks");
      localStorage.removeItem("tts_has_modified_segments");
    }

    return () => {
      window.removeEventListener("tts_studio_clear", handleClear);
    };
  }, []);

  // ── Undo / Redo State (Full Studio Session: blocks, text, master audio) ──
  interface StudioSnapshot {
    blocks: ScriptBlock[];
    text: string;
    audioUrl: string | null;
  }

  const [past, setPast] = useState<StudioSnapshot[]>([]);
  const [future, setFuture] = useState<StudioSnapshot[]>([]);
  const MAX_HISTORY = 30;
  const isTypingTextRef = useRef(false);
  const textDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const captureSnapshot = (overrideBlocks?: ScriptBlock[]): StudioSnapshot => {
    const ttsState = useTTSStore.getState();
    return {
      blocks: overrideBlocks ?? studioBlocks,
      text: ttsState.text || "",
      audioUrl: ttsState.audioUrl || null,
    };
  };

  const pushToHistory = (overrideBlocks?: ScriptBlock[]) => {
    const snap = captureSnapshot(overrideBlocks);
    setPast((prev) => [...prev, snap].slice(-MAX_HISTORY));
    setFuture([]); // Xoá redo stack khi có thao tác mới
  };

  const studioSequenceAudioRef = useRef<HTMLAudioElement | null>(null);
  const studioSequenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const saveStudioBlocks = (newBlocks: ScriptBlock[], recordHistory: boolean = false) => {
    if (recordHistory) {
      pushToHistory(studioBlocks);
    }
    setStudioBlocks(newBlocks);
  };

  const handleUndo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    const currentSnap = captureSnapshot();
    setFuture((prev) => [currentSnap, ...prev].slice(0, MAX_HISTORY));
    setPast(newPast);

    // 1. Khôi phục danh sách phân đoạn câu
    setStudioBlocks(previous.blocks);

    // 2. Khôi phục văn bản đầu vào (text input)
    useTTSStore.getState().setText(previous.text);
    localStorage.setItem("tts_input_text", previous.text);

    // 3. Khôi phục Master Audio hoàn chỉnh
    useTTSStore.getState().setAudioUrl(previous.audioUrl);
    if (previous.audioUrl) {
      localStorage.setItem("tts_master_audio_url", previous.audioUrl);
    } else {
      localStorage.removeItem("tts_master_audio_url");
    }

    updateHasModifiedSegments(true);
    toast.info("Đã hoàn tác phiên làm việc (Undo)", { duration: 1500 });
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);

    const currentSnap = captureSnapshot();
    setPast((prev) => [...prev, currentSnap].slice(-MAX_HISTORY));
    setFuture(newFuture);

    // 1. Khôi phục danh sách phân đoạn câu
    setStudioBlocks(next.blocks);

    // 2. Khôi phục văn bản đầu vào (text input)
    useTTSStore.getState().setText(next.text);
    localStorage.setItem("tts_input_text", next.text);

    // 3. Khôi phục Master Audio hoàn chỉnh
    useTTSStore.getState().setAudioUrl(next.audioUrl);
    if (next.audioUrl) {
      localStorage.setItem("tts_master_audio_url", next.audioUrl);
    } else {
      localStorage.removeItem("tts_master_audio_url");
    }

    updateHasModifiedSegments(true);
    toast.info("Đã làm lại phiên làm việc (Redo)", { duration: 1500 });
  };

  // Lắng nghe phím tắt Ctrl+Z (Undo) và Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isEditingInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable);

      if (isEditingInput) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && !e.altKey) {
        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [past, future, studioBlocks]);

  const initAudio = () => {
    if (!studioSequenceAudioRef.current) {
      studioSequenceAudioRef.current = new Audio();
    }
  };

  // Tự động đo duration cho các block đã có audioUrl nhưng chưa lưu duration
  useEffect(() => {
    const missing = studioBlocks.filter(
      (b) => b.status === "ready" && b.audioUrl && !b.duration,
    );
    if (missing.length === 0) return;

    let isMounted = true;
    missing.forEach((block) => {
      const a = new Audio(block.audioUrl);
      a.addEventListener("loadedmetadata", () => {
        if (!isMounted || !a.duration) return;
        const currentBlocks = useTTSStore.getState().studioBlocks;
        const next = currentBlocks.map((item) =>
          item.id === block.id
            ? { ...item, duration: Math.round(a.duration * 100) / 100 }
            : item,
        );
        setStudioBlocks(next);
      });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const cleanup = () => {
    globalAudio.stopAll();
    if (studioSequenceAudioRef.current) {
      studioSequenceAudioRef.current.pause();
    }
    if (studioSequenceTimeoutRef.current) {
      clearTimeout(studioSequenceTimeoutRef.current);
    }
  };

  // ── CRUD Handlers ────────────────────────────────────────────────────────
  const handleAddStudioBlock = (voices: { id: string; name: string }[], selectedVoiceId: string | null, afterIndex?: number) => {
    const newBlock: ScriptBlock = {
      id: "block_" + Math.random().toString(36).substring(2, 9),
      text: "",
      voiceId: selectedVoiceId || (voices.length > 0 ? voices[0].id : null),
      voiceName:
        voices.find((v) => v.id === (selectedVoiceId || voices[0]?.id))?.name ||
        "Mặc định",
      speed: 1.0,
      pitch: 0.0,
      pauseAfter: 0.5,
      status: "idle",
    };

    if (typeof afterIndex === "number" && afterIndex >= 0) {
      const updated = [...studioBlocks];
      updated.splice(afterIndex + 1, 0, newBlock);
      saveStudioBlocks(updated, true);
    } else {
      saveStudioBlocks([...studioBlocks, newBlock], true);
    }
    updateHasModifiedSegments(true);
  };

  const handleDeleteStudioBlock = (blockId: string) => {
    const target = studioBlocks.find((b) => b.id === blockId);
    if (target?.audioUrl) {
      const fn = target.filename || target.audioUrl.split("/").pop();
      if (fn) {
        fetch(`${API_BASE_URL}/api/tts/${fn}`, { method: "DELETE" }).catch(() => {});
      }
    }
    const remaining = studioBlocks.filter((b) => b.id !== blockId);
    saveStudioBlocks(remaining, true);
    if (remaining.length === 0) {
      useTTSStore.getState().setAudioUrl(null);
      updateHasModifiedSegments(false);
      try {
        localStorage.removeItem("tts_master_elapsed_time");
      } catch {}
    } else {
      updateHasModifiedSegments(true);
    }
    toast.success("Đã xóa phân đoạn");
  };

  const handleUpdateStudioBlock = (blockId: string, updatedFields: Partial<ScriptBlock>) => {
    // Nếu sửa các thuộc tính cấu hình (speed, pitch, pauseAfter, voiceId), lưu snapshot trước khi sửa
    const isConfigChange =
      updatedFields.speed !== undefined ||
      updatedFields.pitch !== undefined ||
      updatedFields.pauseAfter !== undefined ||
      updatedFields.voiceId !== undefined;

    if (isConfigChange) {
      pushToHistory(studioBlocks);
    } else if (updatedFields.text !== undefined) {
      // Nếu người dùng đang gõ text, debounce snapshot để không lưu từng ký tự
      if (!isTypingTextRef.current) {
        pushToHistory(studioBlocks);
        isTypingTextRef.current = true;
      }
      if (textDebounceTimerRef.current) {
        clearTimeout(textDebounceTimerRef.current);
      }
      textDebounceTimerRef.current = setTimeout(() => {
        isTypingTextRef.current = false;
      }, 800);
    }

    const updated = studioBlocks.map((b) =>
      b.id === blockId ? { ...b, ...updatedFields } : b,
    );
    saveStudioBlocks(updated, false);
    if (
      updatedFields.text !== undefined ||
      isConfigChange
    ) {
      updateHasModifiedSegments(true);
    }
  };

  const handleMoveStudioBlock = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= studioBlocks.length) return;

    const updated = [...studioBlocks];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    saveStudioBlocks(updated, true);
    updateHasModifiedSegments(true);
  };

  // ── Render single block ──────────────────────────────────────────────────
  const renderSingleStudioBlock = async (blockId: string) => {
    const target = studioBlocks.find((b) => b.id === blockId);
    if (!target || !target.text.trim()) {
      toast.error("Nội dung phân đoạn không được để trống");
      return;
    }

    handleUpdateStudioBlock(blockId, { status: "rendering", error: undefined });

    try {
      const processedText = applyPronunciationDictionary(
        target.text.trim(),
        pronunciationWords,
      );

      const savedSessionId = localStorage.getItem("tts_studio_session_id") || undefined;
      const res = await fetch(`${API_BASE_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: processedText,
          mode: "clone",
          voice_id: target.voiceId || null,
          speed: target.speed || 1.0,
          pitch: target.pitch || 0.0,
          format: useTTSStore.getState().audioFormat || "mp3",
          enhance_audio: enhanceAudio,
          engine: "omnivoice",
          session_id: savedSessionId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Lỗi tạo âm thanh từ server");
      }

      const data = await res.json();

      // Đo duration audio
      let audioDuration = 0;
      try {
        const tempAudio = new Audio(data.audio_url);
        await new Promise((resolve) => {
          tempAudio.addEventListener("loadedmetadata", () => {
            audioDuration = tempAudio.duration;
            resolve(true);
          });
          tempAudio.addEventListener("error", () => resolve(false));
          setTimeout(resolve, 2000);
        });
      } catch (e) {
        console.warn("Không thể lấy duration audio:", e);
      }

      const oldFilename =
        target.filename ||
        (target.audioUrl ? target.audioUrl.split("/").pop() : null);

      handleUpdateStudioBlock(blockId, {
        status: "ready",
        audioUrl: data.audio_url,
        filename: data.filename,
        duration: data.duration || (audioDuration > 0 ? audioDuration : undefined),
      });

      // Xóa file cũ nếu tồn tại
      if (oldFilename && oldFilename !== data.filename) {
        fetch(`${API_BASE_URL}/api/tts/${oldFilename}`, { method: "DELETE" }).catch(() => {});
      }

      updateHasModifiedSegments(true);
      toast.success(
        "Render phân đoạn thành công! Bạn có thể bấm 'Cập nhật Audio chính' để nghe bản hoàn chỉnh.",
      );
    } catch (error: any) {
      handleUpdateStudioBlock(blockId, {
        status: "error",
        error: error.message || "Lỗi không xác định",
      });
      toast.error(`Render thất bại: ${error.message}`);
    }
  };

  // ── Update master audio ──────────────────────────────────────────────────
  const handleUpdateMasterAudio = async (
    setAudioUrl: (url: string | null) => void,
    pausePeriod: number,
  ) => {
    const readyBlocks = studioBlocks.filter(
      (b) => b.status === "ready" && (b.filename || b.audioUrl),
    );
    if (readyBlocks.length === 0) {
      toast.error("Vui lòng render ít nhất một phân đoạn trước khi cập nhật");
      return;
    }

    setIsUpdatingMaster(true);
    const toastId = toast.loading("Đang ghép nối và cập nhật lại Audio chính...");

    try {
      const savedSessionId = localStorage.getItem("tts_studio_session_id") || undefined;
      const payload = {
        blocks: readyBlocks.map((b) => ({
          filename: b.filename || b.audioUrl!.split("/").pop()!,
          pause_after: typeof b.pauseAfter === "number" ? b.pauseAfter : pausePeriod,
          text: b.text.trim(),
        })),
        format: useTTSStore.getState().audioFormat || "mp3",
        project_name: "Studio_Master",
        session_id: savedSessionId,
        crossfade_ms: useTTSStore.getState().pauseSettings?.crossfade ?? 15,
        loudness_standard: useTTSStore.getState().loudnessStandard || "ebu_r128",
      };

      const res = await fetch(`${API_BASE_URL}/api/tts/stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Không thể ghép nối âm thanh");
      }

      const data = await res.json();
      setAudioUrl(data.audio_url);
      updateHasModifiedSegments(false);

      if (Array.isArray(data.segments) && data.segments.length > 0) {
        const updated = studioBlocks.map((b) => {
          const fn = b.filename || (b.audioUrl ? b.audioUrl.split("/").pop() : null);
          const matchedSeg = data.segments.find((s: any) => s.filename === fn);
          return matchedSeg ? { ...b, duration: matchedSeg.duration } : b;
        });
        saveStudioBlocks(updated);
      }
      toast.success(`Đã cập nhật Audio chính thành công! (${data.total_duration}s)`, {
        id: toastId,
      });
    } catch (err: any) {
      toast.error(`Cập nhật thất bại: ${err.message}`, { id: toastId });
    } finally {
      setIsUpdatingMaster(false);
    }
  };

  // ── Playback ─────────────────────────────────────────────────────────────
  const handlePlayStudioBlockPreview = (block: ScriptBlock) => {
    if (!block.audioUrl) return;
    initAudio();
    if (!studioSequenceAudioRef.current) return;

    if (studioSequenceTimeoutRef.current) {
      clearTimeout(studioSequenceTimeoutRef.current);
    }

    setPlayingStudioBlockId(block.id);
    studioSequenceAudioRef.current.src = block.audioUrl;
    studioSequenceAudioRef.current.onended = () => setPlayingStudioBlockId(null);

    // Dừng các nguồn audio khác (Master audio, Voice sample preview...)
    globalAudio.play(studioSequenceAudioRef.current, () => {
      setPlayingStudioBlockId(null);
    });

    studioSequenceAudioRef.current.play().catch((e) => {
      console.warn("Lỗi phát:", e);
      setPlayingStudioBlockId(null);
    });
  };

  const handleStopStudioPlayback = () => {
    globalAudio.stopAll();
    if (studioSequenceAudioRef.current) {
      studioSequenceAudioRef.current.pause();
      studioSequenceAudioRef.current.currentTime = 0;
    }
    if (studioSequenceTimeoutRef.current) {
      clearTimeout(studioSequenceTimeoutRef.current);
    }
    setPlayingStudioBlockId(null);
  };

  const handleClearStudioBlocks = () => {
    if (studioBlocks.length > 0) {
      pushToHistory(studioBlocks);
    }
    saveStudioBlocks([]);
    updateHasModifiedSegments(false);
    handleStopStudioPlayback();
  };

  return {
    // State
    studioBlocks,
    isSegmentsCollapsed,
    hasModifiedSegments,
    isUpdatingMaster,
    playingStudioBlockId,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    // Setters
    saveStudioBlocks,
    setIsSegmentsCollapsed,
    setHasModifiedSegments,
    // Handlers
    handleAddStudioBlock,
    handleDeleteStudioBlock,
    handleUpdateStudioBlock,
    handleMoveStudioBlock,
    renderSingleStudioBlock,
    handleUpdateMasterAudio,
    handlePlayStudioBlockPreview,
    handleStopStudioPlayback,
    handleClearStudioBlocks,
    handleUndo,
    handleRedo,
    pushToHistory,
    // Lifecycle
    initAudio,
    cleanup,
  };
}
