import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  Play,
  Plus,
  Split,
  FolderOpen,
  Download,
  Layers,
  Loader2,
  Square,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useTTSStore, applyPronunciationDictionary, type ScriptBlock } from "../store/useTTSStore";
import { ScriptBlockItem } from "../components/project/ScriptBlockItem";
import { SmartSplitModal } from "../components/project/SmartSplitModal";
import { MasterAudioBar } from "../components/project/MasterAudioBar";
import { AudioRecordItem } from "./Library";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const {
    projects,
    history,
    removeHistory,
    voices,
    fetchVoices,
    pronunciationWords,
    updateProjectBlocks,
    updateProjectMaster,
  } = useTTSStore();

  const project = projects.find((p) => p.id === id);
  const projectAudios = history.filter((h) => h.projectId === id);

  // Tabs: "blocks" (Kịch bản phân đoạn) | "audios" (File đã lưu)
  const [activeTab, setActiveTab] = useState<"blocks" | "audios">("blocks");

  // Modal bóc tách kịch bản thông minh
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);

  // Giọng được chọn áp dụng cho tất cả
  const [bulkVoiceId, setBulkVoiceId] = useState<string>("");

  // Trạng thái Render All
  const [isRenderingAll, setIsRenderingAll] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{
    current: number;
    total: number;
  }>({ current: 0, total: 0 });
  const cancelRenderRef = useRef(false);

  // Trình phát nghe thử tuần tự (Seamless Multi-block Playback)
  const [playingBlockId, setPlayingBlockId] = useState<string | null>(null);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const sequenceAudioRef = useRef<HTMLAudioElement | null>(null);
  const sequenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeBlockIndexRef = useRef<number>(-1);

  // Khởi tạo danh sách voices khi mount
  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  // Audio preview instance cho từng block
  useEffect(() => {
    sequenceAudioRef.current = new Audio();

    return () => {
      if (sequenceAudioRef.current) {
        sequenceAudioRef.current.pause();
      }
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, []);

  if (!project) {
    return (
      <div className="w-full max-w-[1600px] 2k:max-w-[2000px] mx-auto p-12 text-center glass-card rounded-2xl border border-white/5">
        <h2 className="font-display text-2xl text-on-surface mb-4">
          Không tìm thấy dự án
        </h2>
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 bg-primary text-black font-semibold px-4 py-2 rounded-xl text-sm hover:shadow-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const blocks = project.blocks || [];

  // Helper cập nhật blocks vào store
  const saveBlocks = (newBlocks: ScriptBlock[]) => {
    if (project) {
      updateProjectBlocks(project.id, newBlocks);
    }
  };

  // 1. Thêm block mới
  const handleAddBlock = (afterIndex?: number) => {
    const newBlock: ScriptBlock = {
      id: "block_" + Math.random().toString(36).substring(2, 9),
      text: "",
      voiceId: bulkVoiceId || (voices.length > 0 ? voices[0].id : null),
      voiceName:
        voices.find((v) => v.id === (bulkVoiceId || (voices[0]?.id)))?.name ||
        "Mặc định",
      speed: 1.0,
      pitch: 0.0,
      pauseAfter: 0.5,
      status: "idle",
    };

    if (typeof afterIndex === "number" && afterIndex >= 0) {
      const updated = [...blocks];
      updated.splice(afterIndex + 1, 0, newBlock);
      saveBlocks(updated);
    } else {
      saveBlocks([...blocks, newBlock]);
    }
  };

  // 2. Xóa block (kèm dọn dẹp file audio trên server nếu có)
  const handleDeleteBlock = (blockId: string) => {
    const target = blocks.find((b) => b.id === blockId);
    if (target?.audioUrl) {
      const fn = target.filename || target.audioUrl.split("/").pop();
      if (fn) {
        fetch(`http://localhost:8000/api/tts/${fn}`, { method: "DELETE" }).catch(() => {});
      }
    }
    const updated = blocks.filter((b) => b.id !== blockId);
    saveBlocks(updated);
    toast.success("Đã xóa phân đoạn");
  };

  // 3. Cập nhật block
  const handleUpdateBlock = (blockId: string, updatedFields: Partial<ScriptBlock>) => {
    const updated = blocks.map((b) =>
      b.id === blockId ? { ...b, ...updatedFields } : b,
    );
    saveBlocks(updated);
  };

  // 4. Di chuyển block (Lên / Xuống)
  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    const updated = [...blocks];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    saveBlocks(updated);
  };

  // 5. Áp dụng giọng cho tất cả block
  const handleApplyVoiceToAll = (voiceId: string) => {
    if (!voiceId) return;
    const v = voices.find((item) => item.id === voiceId);
    const updated = blocks.map((b) => ({
      ...b,
      voiceId,
      voiceName: v ? v.name : "Mặc định",
      status: b.status === "ready" ? ("idle" as const) : b.status,
    }));
    saveBlocks(updated);
    toast.success(`Đã áp dụng giọng "${v?.name || voiceId}" cho toàn bộ ${blocks.length} phân đoạn!`);
  };

  // 6. Áp dụng từ modal SmartSplit
  const handleApplySmartSplit = (
    newBlocks: ScriptBlock[],
    mode: "replace" | "append",
  ) => {
    if (mode === "replace") {
      // Dọn dẹp các file audio của kịch bản cũ trước khi thay thế
      for (const oldB of blocks) {
        if (oldB.audioUrl) {
          const fn = oldB.filename || oldB.audioUrl.split("/").pop();
          if (fn) {
            fetch(`http://localhost:8000/api/tts/${fn}`, { method: "DELETE" }).catch(() => {});
          }
        }
      }
      saveBlocks(newBlocks);
    } else {
      saveBlocks([...blocks, ...newBlocks]);
    }
  };

  // 7. Render một block đơn lẻ
  const renderSingleBlock = async (blockId: string) => {
    const target = blocks.find((b) => b.id === blockId);
    if (!target || !target.text.trim()) {
      toast.error("Nội dung phân đoạn không được để trống");
      return;
    }

    handleUpdateBlock(blockId, { status: "rendering", error: undefined });

    try {
      const processedText = applyPronunciationDictionary(
        target.text.trim(),
        pronunciationWords,
      );

      const res = await fetch("http://localhost:8000/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: processedText,
          mode: "clone",
          voice_id: target.voiceId || null,
          speed: target.speed || 1.0,
          pitch: target.pitch || 0.0,
          format: "mp3",
          enhance_audio: useTTSStore.getState().enhanceAudio,
          engine: useTTSStore.getState().engine || "omnivoice",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Lỗi tạo âm thanh từ server");
      }

      const data = await res.json();

      // Đọc duration thực tế từ audio
      let audioDuration = 0;
      try {
        const tempAudio = new Audio(data.audio_url);
        await new Promise((resolve) => {
          tempAudio.addEventListener("loadedmetadata", () => {
            audioDuration = tempAudio.duration;
            resolve(true);
          });
          tempAudio.addEventListener("error", () => resolve(false));
          setTimeout(resolve, 2000); // timeout an toàn
        });
      } catch (e) {
        console.warn("Không thể lấy duration audio:", e);
      }

      const oldFilename = target.filename || (target.audioUrl ? target.audioUrl.split("/").pop() : null);

      handleUpdateBlock(blockId, {
        status: "ready",
        audioUrl: data.audio_url,
        filename: data.filename,
        duration: audioDuration > 0 ? audioDuration : undefined,
      });

      // Nếu file mới khác file cũ, xóa file cũ để tránh file rác
      if (oldFilename && oldFilename !== data.filename) {
        fetch(`http://localhost:8000/api/tts/${oldFilename}`, { method: "DELETE" }).catch(() => {});
      }

      toast.success("Render phân đoạn thành công!");
    } catch (error: any) {
      handleUpdateBlock(blockId, {
        status: "error",
        error: error.message || "Lỗi không xác định",
      });
      toast.error(`Render thất bại: ${error.message}`);
    }
  };

  // 8. Render tất cả các block chưa hoàn thành (Batch Render)
  const handleRenderAll = async () => {
    const unreadyBlocks = blocks.filter(
      (b) => b.text.trim().length > 0 && b.status !== "ready",
    );

    if (unreadyBlocks.length === 0) {
      toast.info("Tất cả các phân đoạn đã được render sẵn sàng!");
      return;
    }

    setIsRenderingAll(true);
    cancelRenderRef.current = false;
    setRenderProgress({ current: 0, total: unreadyBlocks.length });

    let currentList = [...blocks];

    for (let i = 0; i < unreadyBlocks.length; i++) {
      if (cancelRenderRef.current) {
        toast.info("Đã dừng tiến trình render hàng loạt");
        break;
      }

      const blk = unreadyBlocks[i];
      setRenderProgress({ current: i + 1, total: unreadyBlocks.length });

      // Đánh dấu rendering trên UI
      currentList = currentList.map((b) =>
        b.id === blk.id ? { ...b, status: "rendering" as const } : b,
      );
      saveBlocks(currentList);

      try {
        const processedText = applyPronunciationDictionary(
          blk.text.trim(),
          pronunciationWords,
        );

        const res = await fetch("http://localhost:8000/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: processedText,
            mode: "clone",
            voice_id: blk.voiceId || null,
            speed: blk.speed || 1.0,
            pitch: blk.pitch || 0.0,
            format: "mp3",
            enhance_audio: useTTSStore.getState().enhanceAudio,
            engine: useTTSStore.getState().engine || "omnivoice",
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Lỗi kết nối");
        }

        const data = await res.json();

        // Cập nhật trạng thái ready
        currentList = currentList.map((b) =>
          b.id === blk.id
            ? {
                ...b,
                status: "ready" as const,
                audioUrl: data.audio_url,
                filename: data.filename,
              }
            : b,
        );
        saveBlocks(currentList);
      } catch (err: any) {
        currentList = currentList.map((b) =>
          b.id === blk.id
            ? { ...b, status: "error" as const, error: err.message }
            : b,
        );
        saveBlocks(currentList);
      }
    }

    setIsRenderingAll(false);
    toast.success("Hoàn thành tiến trình render kịch bản!");
  };

  const handleCancelRenderAll = () => {
    cancelRenderRef.current = true;
    setIsRenderingAll(false);
  };

  // 9. Phát thử một block đơn lẻ
  const handlePlayBlockPreview = (block: ScriptBlock) => {
    if (!block.audioUrl || !sequenceAudioRef.current) return;

    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
    }

    setIsPlayingSequence(false);
    setPlayingBlockId(block.id);

    sequenceAudioRef.current.src = block.audioUrl;
    sequenceAudioRef.current.onended = () => {
      setPlayingBlockId(null);
    };
    sequenceAudioRef.current.play().catch((e) => {
      console.warn("Lỗi phát audio:", e);
      setPlayingBlockId(null);
    });
  };

  const handleStopPlayback = () => {
    if (sequenceAudioRef.current) {
      sequenceAudioRef.current.pause();
      sequenceAudioRef.current.currentTime = 0;
    }
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
    }
    setPlayingBlockId(null);
    setIsPlayingSequence(false);
    activeBlockIndexRef.current = -1;
  };

  // 10. Phát toàn bộ kịch bản tuần tự (Seamless Multi-block Playback)
  const playBlockAtIndex = (index: number) => {
    const readyBlocks = blocks;
    if (index >= readyBlocks.length) {
      // Hết bài
      handleStopPlayback();
      toast.success("Đã hoàn tất nghe thử toàn bộ kịch bản!");
      return;
    }

    const currentBlock = readyBlocks[index];
    if (!currentBlock.audioUrl) {
      // Bỏ qua câu chưa render hoặc chuyển tiếp sang câu sau
      playBlockAtIndex(index + 1);
      return;
    }

    activeBlockIndexRef.current = index;
    setPlayingBlockId(currentBlock.id);

    if (sequenceAudioRef.current) {
      sequenceAudioRef.current.src = currentBlock.audioUrl;
      sequenceAudioRef.current.onended = () => {
        // Hết câu này, tạm dừng đúng pauseAfter giây trước khi phát tiếp câu sau
        const pauseMs = Math.max(0, (currentBlock.pauseAfter || 0) * 1000);
        sequenceTimeoutRef.current = setTimeout(() => {
          playBlockAtIndex(index + 1);
        }, pauseMs);
      };
      sequenceAudioRef.current.play().catch((e) => {
        console.warn("Lỗi phát:", e);
        playBlockAtIndex(index + 1);
      });
    }
  };

  const handlePlayAllSequence = () => {
    const readyCount = blocks.filter((b) => b.status === "ready" && b.audioUrl).length;
    if (readyCount === 0) {
      toast.error("Chưa có phân đoạn nào được render. Hãy nhấn 'Render tất cả' trước!");
      return;
    }

    setIsPlayingSequence(true);
    playBlockAtIndex(0);
    toast.info("Bắt đầu nghe thử toàn bộ kịch bản...");
  };

  // 11. Ghép nối và Xuất Master (Stitching Engine)
  const handleStitchMaster = async () => {
    const readyBlocks = blocks.filter((b) => b.status === "ready" && b.audioUrl && b.filename);
    if (readyBlocks.length === 0) {
      toast.error("Vui lòng render ít nhất một phân đoạn trước khi ghép xuất Master");
      return;
    }

    setIsStitching(true);
    const toastId = toast.loading("Đang ghép nối các phân đoạn và tạo phụ đề SRT...");

    try {
      const payload = {
        blocks: readyBlocks.map((b) => ({
          filename: b.filename || b.audioUrl!.split("/").pop()!,
          pause_after: b.pauseAfter || 0.5,
          text: b.text.trim(),
        })),
        format: "mp3",
        project_name: project.name,
        crossfade_ms: useTTSStore.getState().pauseSettings?.crossfade ?? 15,
        loudness_standard: useTTSStore.getState().loudnessStandard || "ebu_r128",
      };

      const res = await fetch("http://localhost:8000/api/tts/stitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Không thể ghép nối audio từ server");
      }

      const data = await res.json();

      // Lưu kết quả vào project
      updateProjectMaster(project.id, {
        masterAudioUrl: data.audio_url,
        masterFilename: data.filename,
        masterSrtUrl: data.srt_url,
        masterDuration: data.total_duration,
      });

      toast.success(
        `Ghép nối thành công! Thời lượng tổng: ${data.total_duration}s`,
        { id: toastId },
      );
    } catch (err: any) {
      toast.error(`Ghép nối thất bại: ${err.message}`, { id: toastId });
    } finally {
      setIsStitching(false);
    }
  };

  const readyCount = blocks.filter((b) => b.status === "ready").length;

  return (
    <div className="w-full max-w-[1600px] 2k:max-w-[2000px] mx-auto flex flex-col gap-6 md:gap-8 2k:gap-10 animate-in fade-in duration-500 pb-24">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-6 md:p-8 border border-white/5 relative overflow-hidden flex flex-col gap-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-bl-[120px] blur-[80px] pointer-events-none"></div>

        {/* Top bar: Back & Title */}
        <div className="flex flex-wrap items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-4">
            <Link
              to="/projects"
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-variant hover:bg-white/10 hover:text-primary transition-colors text-on-surface-variant"
              title="Quay lại danh sách dự án"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-2xl">
                  workspaces
                </span>
                <h1 className="font-display text-2xl md:text-3xl text-on-surface font-bold">
                  {project.name}
                </h1>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono-data text-on-surface-variant mt-1">
                <span>
                  Ngày tạo: {new Date(project.createdAt).toLocaleDateString("vi-VN")}
                </span>
                <span>•</span>
                <span className="text-primary font-bold">
                  {blocks.length} phân đoạn ({readyCount}/{blocks.length} đã render)
                </span>
              </div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="inline-flex bg-surface-dim border border-white/10 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setActiveTab("blocks")}
              className={`px-4 py-2 rounded-lg font-label-caps text-xs flex items-center gap-2 transition-all ${
                activeTab === "blocks"
                  ? "bg-primary text-black font-semibold shadow-md"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
              }`}
            >
              <Layers className="w-4 h-4" />
              Kịch bản phân đoạn ({blocks.length})
            </button>
            <button
              onClick={() => setActiveTab("audios")}
              className={`px-4 py-2 rounded-lg font-label-caps text-xs flex items-center gap-2 transition-all ${
                activeTab === "audios"
                  ? "bg-primary text-black font-semibold shadow-md"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              File đã lưu ({projectAudios.length})
            </button>
          </div>
        </div>

        {project.description && (
          <p className="text-sm text-on-surface-variant bg-surface-dim/80 p-3.5 rounded-xl border border-white/5 max-w-3xl">
            {project.description}
          </p>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === "blocks" ? (
        <div className="flex flex-col gap-6">
          {/* Action Toolbar */}
          <div className="glass-card rounded-2xl p-4 md:p-5 border border-white/5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
            {/* Left Tools */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Nút Smart Split */}
              <button
                type="button"
                onClick={() => setIsSplitModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-surface-variant hover:bg-white/10 text-on-surface text-xs font-label-caps border border-white/10 transition-all flex items-center gap-2 shadow-sm hover:border-primary/40"
              >
                <Split className="w-4 h-4 text-primary" />
                Tách kịch bản tự động
              </button>

              {/* Nút Thêm đoạn thủ công */}
              <button
                type="button"
                onClick={() => handleAddBlock()}
                className="px-4 py-2 rounded-xl bg-surface-variant hover:bg-white/10 text-on-surface text-xs font-label-caps border border-white/10 transition-all flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                Thêm phân đoạn mới
              </button>

              {/* Gán giọng cho toàn bộ */}
              {blocks.length > 0 && voices.length > 0 && (
                <div className="flex items-center gap-2 bg-surface-dim border border-white/10 rounded-xl px-3 py-1.5 shadow-inner">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-xs text-on-surface-variant hidden sm:inline">
                    Gán giọng tất cả:
                  </span>
                  <select
                    value={bulkVoiceId}
                    onChange={(e) => {
                      setBulkVoiceId(e.target.value);
                      handleApplyVoiceToAll(e.target.value);
                    }}
                    className="bg-transparent text-xs text-on-surface font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-surface-dim text-on-surface">
                      -- Chọn giọng áp dụng --
                    </option>
                    {voices.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                        className="bg-surface-dim text-on-surface"
                      >
                        {v.name} ({v.gender === "female" ? "Nữ" : "Nam"})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Right Execution Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Nút Nghe thử kịch bản liền mạch */}
              {readyCount > 0 && (
                <button
                  type="button"
                  onClick={isPlayingSequence ? handleStopPlayback : handlePlayAllSequence}
                  className={`px-4 py-2 rounded-xl text-xs font-label-caps flex items-center gap-2 transition-all shadow-md ${
                    isPlayingSequence
                      ? "bg-amber-500 text-black font-bold animate-pulse"
                      : "bg-surface-variant hover:bg-white/10 text-on-surface border border-white/10"
                  }`}
                >
                  {isPlayingSequence ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      Dừng nghe thử
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current text-primary" />
                      Nghe thử toàn bộ kịch bản
                    </>
                  )}
                </button>
              )}

              {/* Nút Render tất cả */}
              {isRenderingAll ? (
                <button
                  type="button"
                  onClick={handleCancelRenderAll}
                  className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-label-caps flex items-center gap-2 hover:bg-rose-500/30 transition-all"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tạo ({renderProgress.current}/{renderProgress.total}) · Hủy
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRenderAll}
                  disabled={blocks.length === 0}
                  className="px-4 py-2 rounded-xl bg-primary text-black font-semibold text-xs font-label-caps hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  Render tất cả đoạn
                </button>
              )}

              {/* Nút Ghép Master */}
              {readyCount > 0 && (
                <button
                  type="button"
                  onClick={handleStitchMaster}
                  disabled={isStitching}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs font-label-caps hover:shadow-lg hover:shadow-emerald-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
                  title="Ghép nối tất cả audio phân đoạn thành 1 file duy nhất và xuất phụ đề SRT"
                >
                  {isStitching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Ghép & Xuất Master
                </button>
              )}
            </div>
          </div>

          {/* Master Audio Bar (nếu đã ghép xong) */}
          {project.masterAudioUrl && (
            <MasterAudioBar
              audioUrl={project.masterAudioUrl}
              srtUrl={project.masterSrtUrl}
              duration={project.masterDuration}
              projectName={project.name}
            />
          )}

          {/* Block List */}
          {blocks.length === 0 ? (
            <div className="glass-card p-12 text-center text-on-surface-variant font-mono-data border border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Split className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-on-surface">
                Chưa có phân đoạn kịch bản nào
              </h3>
              <p className="text-xs max-w-md text-on-surface-variant leading-relaxed">
                Bạn có thể dán toàn bộ bài báo, podcast, sách nói để hệ thống tự động
                bóc tách thành từng câu theo chuẩn ElevenLabs Projects, hoặc tự bấm thêm đoạn mới.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => setIsSplitModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-primary text-black font-semibold text-xs font-label-caps hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <Split className="w-4 h-4" />
                  Tách kịch bản tự động
                </button>
                <button
                  onClick={() => handleAddBlock()}
                  className="px-5 py-2.5 rounded-xl bg-surface-variant hover:bg-white/10 text-on-surface text-xs font-label-caps border border-white/10 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  Thêm đoạn đầu tiên
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {blocks.map((block, idx) => (
                <ScriptBlockItem
                  key={block.id}
                  block={block}
                  index={idx}
                  total={blocks.length}
                  voices={voices}
                  isPlaying={playingBlockId === block.id}
                  onPlay={() => handlePlayBlockPreview(block)}
                  onStop={handleStopPlayback}
                  onUpdate={(updated) => handleUpdateBlock(block.id, updated)}
                  onDelete={() => handleDeleteBlock(block.id)}
                  onMoveUp={() => handleMoveBlock(idx, -1)}
                  onMoveDown={() => handleMoveBlock(idx, 1)}
                  onInsertBelow={() => handleAddBlock(idx)}
                  onRender={() => renderSingleBlock(block.id)}
                />
              ))}

              {/* Add more block at bottom */}
              <button
                type="button"
                onClick={() => handleAddBlock()}
                className="w-full py-4 rounded-2xl border border-dashed border-white/10 hover:border-primary/40 bg-surface-dim/40 hover:bg-surface-dim text-on-surface-variant hover:text-primary transition-all flex items-center justify-center gap-2 text-xs font-label-caps group"
              >
                <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Thêm phân đoạn tiếp theo
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Tab 2: Single Audio Records History */
        <div className="flex flex-col gap-6">
          {projectAudios.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant font-mono-data text-mono-data border border-dashed border-white/10 rounded-2xl bg-surface-dim">
              Dự án này chưa có file audio đơn nào từ Phòng thu.
            </div>
          ) : (
            <div className="divide-y divide-white/5 border border-white/5 rounded-2xl bg-surface-dim overflow-hidden shadow-xl">
              {projectAudios.map((record) => (
                <AudioRecordItem
                  key={record.id}
                  record={record}
                  removeHistory={removeHistory}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Smart Split */}
      <SmartSplitModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        onApply={handleApplySmartSplit}
        defaultVoiceId={bulkVoiceId || (voices[0]?.id || null)}
        defaultVoiceName={voices[0]?.name}
      />
    </div>
  );
}
