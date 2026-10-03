import { useEffect, useRef, useState } from "react";

import { useTTSStore } from "../store/useTTSStore";

import { useStudioBlocks } from "../hooks/useStudioBlocks";
import { useStudioGenerate } from "../hooks/useStudioGenerate";
import { useStudioProject } from "../hooks/useStudioProject";

import { VoiceSelector } from "../components/studio/VoiceSelector";
import { VoiceDesignPanel } from "../components/studio/VoiceDesignPanel";
import { StudioTextInput } from "../components/studio/StudioTextInput";
import { StudioOutputSection } from "../components/studio/StudioOutputSection";
import { ModelSettingsPanel } from "../components/studio/ModelSettingsPanel";
import { SaveProjectModal } from "../components/studio/SaveProjectModal";
import { PauseSettingsModal } from "../components/PauseSettingsModal";
import { PronunciationModal } from "../components/PronunciationModal";
import { NewScriptModal } from "../components/studio/NewScriptModal";
import { BGMMixModal } from "../components/studio/BGMMixModal";
import { toast } from "sonner";

export default function Studio() {
  const {
    mode,
    instruct,
    cfg_value,
    speed,
    pitch,
    audioUrl,
    voices,
    selectedVoiceId,
    enhanceAudio,
    setEnhanceAudio,
    setMode,
    setInstruct,
    setCfgValue,
    setSpeed,
    setPitch,
    setAudioUrl,
    setAudioFormat,
    fetchVoices,
    setSelectedVoiceId,
    pinnedVoices,
    togglePin,
    text,
    setText,
    projects,
    pauseSettings,
    pronunciationWords,
  } = useTTSStore();

  // ── Custom Hooks ───────────────────────────────────────────────────────────
  const blocks = useStudioBlocks();
  const generator = useStudioGenerate();
  const project = useStudioProject();

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isSaveProjectModalOpen, setIsSaveProjectModalOpen] = useState(false);
  const [isPauseSettingsOpen, setIsPauseSettingsOpen] = useState(false);
  const [isPronunciationModalOpen, setIsPronunciationModalOpen] =
    useState(false);
  const [isNewScriptModalOpen, setIsNewScriptModalOpen] = useState(false);
  const [isBgmModalOpen, setIsBgmModalOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchVoices();
    blocks.initAudio();

    // Tự động dọn dẹp ghost draft nếu Thư viện đã bị xóa trống và không có audio nào đang mở
    const hist = useTTSStore.getState().history;
    const currentAudioUrl = useTTSStore.getState().audioUrl;
    if (hist.length === 0 && !currentAudioUrl) {
      setText("");
      blocks.saveStudioBlocks([], false);
      localStorage.removeItem("tts_input_text");
      localStorage.removeItem("tts_master_audio_url");
      localStorage.removeItem("tts_studio_blocks");
      localStorage.removeItem("tts_draft_last_saved");
    }

    return blocks.cleanup;
  }, [fetchVoices]);

  // ── Wrappers kết nối hooks với nhau ───────────────────────────────────────
  const handleGenerate = () =>
    generator.handleGenerate(selectedProjectId, {
      saveStudioBlocks: blocks.saveStudioBlocks,
      setGenerationProgress: () => {}, // generator tự track nội bộ
    });

  const handleUpdateMasterAudio = () =>
    blocks.handleUpdateMasterAudio(setAudioUrl, pauseSettings.period);

  const handleClearStudioSession = () => {
    // Lưu lại snapshot toàn bộ phiên làm việc (text, master audio, phân đoạn câu) trước khi làm mới
    blocks.pushToHistory();

    setText("");
    setAudioUrl(null);
    blocks.saveStudioBlocks([], false);
    blocks.handleStopStudioPlayback();
    blocks.setHasModifiedSegments(false);
    generator.cleanupTimer();
    try {
      localStorage.removeItem("tts_input_text");
      localStorage.removeItem("tts_master_audio_url");
      localStorage.removeItem("tts_master_elapsed_time");
      localStorage.removeItem("tts_has_modified_segments");
      localStorage.removeItem("tts_draft_last_saved");
    } catch {}
    toast.success("Đã làm mới Studio! Bạn có thể bắt đầu kịch bản mới.");
  };

  return (
    <div className="flex flex-col gap-6 2k:gap-8 animate-in fade-in duration-500 max-w-[1600px] 2k:max-w-[2000px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl 2k:text-3xl font-bold tracking-tight text-on-surface">
            Voice Studio Pro
          </h1>
          <p className="text-on-surface-variant text-sm 2k:text-base mt-0.5">
            Tổng hợp giọng nói AI chất lượng cao 24kHz với mô hình OmniVoice (k2-fsa)
          </p>
        </div>

        {/* Quick Tools */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsPauseSettingsOpen(true)}
            className="group flex items-center gap-2 px-4 2k:px-5 py-2 2k:py-2.5 rounded-xl
              bg-surface-dim border border-white/8 hover:border-primary/40
              hover:bg-primary/5 transition-all duration-300 shadow-sm"
            title="Thiết lập thời gian ngắt nghỉ giữa các câu"
          >
            <span className="material-symbols-outlined text-[17px] 2k:text-[19px] text-primary/70 group-hover:text-primary transition-colors">
              timer
            </span>
            <span className="font-label-caps text-xs 2k:text-sm text-on-surface-variant group-hover:text-on-surface transition-colors hidden sm:inline">
              Thiết lập ngắt nghỉ
            </span>
            <span className="flex items-center gap-1 ml-1">
              <span className="text-[10px] 2k:text-xs font-mono text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20">
                {pauseSettings.period.toFixed(1)}s
              </span>
              <span className="text-[10px] 2k:text-xs font-mono text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20">
                +{pauseSettings.newline.toFixed(1)}s
              </span>
            </span>
          </button>

          <div className="w-px h-6 bg-white/10" />

          <button
            type="button"
            onClick={() => setIsPronunciationModalOpen(true)}
            className="group flex items-center gap-2 px-4 2k:px-5 py-2 2k:py-2.5 rounded-xl
              bg-surface-dim border border-white/8 hover:border-amber-400/40
              hover:bg-amber-400/5 transition-all duration-300 shadow-sm"
            title="Quản lý từ điển cách đọc tùy chỉnh"
          >
            <span className="material-symbols-outlined text-[17px] 2k:text-[19px] text-amber-400/70 group-hover:text-amber-400 transition-colors">
              menu_book
            </span>
            <span className="font-label-caps text-xs 2k:text-sm text-on-surface-variant group-hover:text-on-surface transition-colors hidden sm:inline">
              Cách đọc
            </span>
            {pronunciationWords.length > 0 && (
              <span className="ml-1 text-[10px] 2k:text-xs font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md border border-amber-400/20">
                {pronunciationWords.length}
              </span>
            )}
          </button>

          {/* Chỉ giữ lại các cài đặt ít dùng: Ngắt nghỉ & Cách đọc ở góc trên bên phải */}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 2k:gap-10 items-start">
        {/* Left Column: Main Content */}
        <div className="lg:col-span-8 flex flex-col gap-6 2k:gap-8">
          <div className="glass-card rounded-2xl p-6 md:p-8 2k:p-10 flex flex-col gap-6 2k:gap-8 shadow-2xl border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none mix-blend-screen" />

            {/* Action Bar: Chuyển đổi chế độ + Các nút chức năng hay dùng */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 2k:pb-5 z-10">
              {/* Left: Chuyển chế độ Voice Cloning / Voice Design */}
              <div className="inline-flex bg-surface-dim border border-white/10 rounded-xl p-1 2k:p-1.5 shadow-inner">
                <button
                  type="button"
                  onClick={() => setMode("clone")}
                  className={`px-3.5 2k:px-5 py-1.5 2k:py-2 rounded-lg font-label-caps text-xs 2k:text-sm flex items-center gap-1.5 2k:gap-2 transition-all duration-300 ${
                    mode === "clone"
                      ? "bg-primary text-black font-semibold shadow-md"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] 2k:text-[18px]">
                    record_voice_over
                  </span>
                  Voice Cloning
                </button>
                <button
                  type="button"
                  onClick={() => setMode("design")}
                  className={`px-3.5 2k:px-5 py-1.5 2k:py-2 rounded-lg font-label-caps text-xs 2k:text-sm flex items-center gap-1.5 2k:gap-2 transition-all duration-300 ${
                    mode === "design"
                      ? "bg-primary text-black font-semibold shadow-md"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] 2k:text-[18px]">
                    auto_fix_high
                  </span>
                  Voice Design
                </button>
              </div>

              {/* Right: Các nút chức năng hay dùng trong không gian làm việc */}
              <div className="flex items-center gap-2">
                {/* Nút Undo (Hoàn tác) */}
                <button
                  type="button"
                  onClick={blocks.handleUndo}
                  disabled={!blocks.canUndo}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-200 text-xs font-label-caps ${
                    blocks.canUndo
                      ? "bg-surface-dim border-white/10 hover:border-primary/40 hover:bg-primary/5 text-on-surface-variant hover:text-on-surface cursor-pointer shadow-sm"
                      : "bg-surface-dim/40 border-white/5 text-on-surface-variant/30 cursor-not-allowed"
                  }`}
                  title="Hoàn tác thao tác vừa thực hiện (Ctrl+Z)"
                >
                  <span className="material-symbols-outlined text-[17px] 2k:text-[19px]">
                    undo
                  </span>
                  <span className="hidden sm:inline">Hoàn tác</span>
                </button>

                {/* Nút Redo (Làm lại) */}
                <button
                  type="button"
                  onClick={blocks.handleRedo}
                  disabled={!blocks.canRedo}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all duration-200 text-xs font-label-caps ${
                    blocks.canRedo
                      ? "bg-surface-dim border-white/10 hover:border-primary/40 hover:bg-primary/5 text-on-surface-variant hover:text-on-surface cursor-pointer shadow-sm"
                      : "bg-surface-dim/40 border-white/5 text-on-surface-variant/30 cursor-not-allowed"
                  }`}
                  title="Làm lại thao tác vừa hoàn tác (Ctrl+Y)"
                >
                  <span className="material-symbols-outlined text-[17px] 2k:text-[19px]">
                    redo
                  </span>
                  <span className="hidden sm:inline">Làm lại</span>
                </button>

                <div className="w-px h-5 bg-white/10 mx-0.5" />

                <button
                  type="button"
                  onClick={() => {
                    const hasData = Boolean(
                      text.trim() || blocks.studioBlocks.length > 0 || audioUrl,
                    );
                    if (!hasData) {
                      toast.info("Studio hiện đang trống và sẵn sàng cho bài mới!");
                      return;
                    }
                    setIsNewScriptModalOpen(true);
                  }}
                  className="group flex items-center gap-1.5 px-3.5 2k:px-4 py-1.5 2k:py-2 rounded-xl
                    bg-surface-dim border border-white/8 hover:border-rose-500/40
                    hover:bg-rose-500/10 transition-all duration-300 shadow-sm text-on-surface-variant hover:text-rose-400 text-xs font-label-caps"
                  title="Dọn sạch văn bản và phân đoạn hiện tại để bắt đầu bài mới"
                >
                  <span className="material-symbols-outlined text-[17px] 2k:text-[19px] text-on-surface-variant/70 group-hover:text-rose-400 transition-colors">
                    note_add
                  </span>
                  <span>Bài mới</span>
                </button>
              </div>
            </div>

            {/* Mode 1: Voice Cloning Carousel */}
            {mode === "clone" && (
              <VoiceSelector
                voices={voices}
                selectedVoiceId={selectedVoiceId}
                onSelectVoice={setSelectedVoiceId}
                pinnedVoices={pinnedVoices}
                onTogglePin={togglePin}
              />
            )}

            {/* Mode 2: Voice Design */}
            {mode === "design" && (
              <VoiceDesignPanel
                instruct={instruct}
                onUpdateInstruct={setInstruct}
              />
            )}

            {/* Text Input Section */}
            <StudioTextInput
              text={text}
              onChangeText={setText}
              textareaRef={textareaRef}
              pauseSettings={pauseSettings}
              pronunciationWords={pronunciationWords}
              isLoading={generator.isLoading}
              elapsedTime={generator.elapsedTime}
              generationProgress={generator.generationProgress}
              onClearSession={handleClearStudioSession}
              blocksCount={blocks.studioBlocks.length}
            />

            {/* Output & Blocks Section */}
            <StudioOutputSection
              audioUrl={audioUrl}
              elapsedTime={generator.elapsedTime}
              onNavigateToVideo={project.handleNavigateToVideo}
              onDownload={project.handleDownloadMaster}
              onOpenBgmModal={() => setIsBgmModalOpen(true)}
              studioBlocks={blocks.studioBlocks}
              voices={voices}
              hasModifiedSegments={blocks.hasModifiedSegments}
              isUpdatingMaster={blocks.isUpdatingMaster}
              onUpdateMasterAudio={handleUpdateMasterAudio}
              onOpenSaveProjectModal={() => setIsSaveProjectModalOpen(true)}
              isSegmentsCollapsed={blocks.isSegmentsCollapsed}
              onToggleCollapseSegments={() =>
                blocks.setIsSegmentsCollapsed(!blocks.isSegmentsCollapsed)
              }
              playingStudioBlockId={blocks.playingStudioBlockId}
              onPlayBlock={blocks.handlePlayStudioBlockPreview}
              onStopPlayback={blocks.handleStopStudioPlayback}
              onUpdateBlock={blocks.handleUpdateStudioBlock}
              onDeleteBlock={blocks.handleDeleteStudioBlock}
              onMoveBlock={blocks.handleMoveStudioBlock}
              onInsertBlockBelow={(idx) =>
                blocks.handleAddStudioBlock(voices, selectedVoiceId, idx)
              }
              onAddBlock={() =>
                blocks.handleAddStudioBlock(voices, selectedVoiceId)
              }
              onRenderBlock={blocks.renderSingleStudioBlock}
              canUndo={blocks.canUndo}
              canRedo={blocks.canRedo}
              onUndo={blocks.handleUndo}
              onRedo={blocks.handleRedo}
            />
          </div>
        </div>

        {/* Right Column: Model Settings */}
        <div className="lg:col-span-4 flex flex-col gap-6 2k:gap-8 sticky top-6">
          <ModelSettingsPanel
            cfg_value={cfg_value}
            setCfgValue={setCfgValue}
            speed={speed}
            setSpeed={setSpeed}
            pitch={pitch}
            setPitch={setPitch}
            audioFormat={
              (useTTSStore.getState().audioFormat as "mp3" | "wav") || "mp3"
            }
            setAudioFormat={setAudioFormat}
            enhanceAudio={enhanceAudio}
            setEnhanceAudio={setEnhanceAudio}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
            projects={projects}
            isLoading={generator.isLoading}
            onGenerate={handleGenerate}
            onSaveConfig={project.saveModelConfig}
            configSaved={project.configSaved}
          />
        </div>
      </div>

      {/* Modal Lưu kịch bản vào Dự án */}
      <SaveProjectModal
        isOpen={isSaveProjectModalOpen}
        onClose={() => setIsSaveProjectModalOpen(false)}
        studioBlocksCount={blocks.studioBlocks.length}
        projects={projects}
        onSave={(params) =>
          project.handleSaveStudioAsProject(
            blocks.studioBlocks,
            () => setIsSaveProjectModalOpen(false),
            params,
          )
        }
      />

      {/* Modal Thiết lập ngắt nghỉ */}
      <PauseSettingsModal
        isOpen={isPauseSettingsOpen}
        onClose={() => setIsPauseSettingsOpen(false)}
      />

      {/* Modal Cách đọc */}
      <PronunciationModal
        isOpen={isPronunciationModalOpen}
        onClose={() => setIsPronunciationModalOpen(false)}
      />

      {/* Modal Xác nhận làm mới Studio */}
      <NewScriptModal
        isOpen={isNewScriptModalOpen}
        onClose={() => setIsNewScriptModalOpen(false)}
        onConfirm={handleClearStudioSession}
        onOpenSaveProject={() => setIsSaveProjectModalOpen(true)}
        hasContent={Boolean(text.trim() || blocks.studioBlocks.length > 0 || audioUrl)}
        studioBlocksCount={blocks.studioBlocks.length}
      />

      {/* Modal Lồng Nhạc Nền (BGM) & Auto-Ducking */}
      <BGMMixModal
        isOpen={isBgmModalOpen}
        onClose={() => setIsBgmModalOpen(false)}
        currentAudioUrl={audioUrl}
        onSuccess={(newAudioUrl) => {
          // Lưu vào lịch sử undo/redo trước khi ghi đè master audio
          blocks.pushToHistory();
          setAudioUrl(newAudioUrl);
          try {
            localStorage.setItem("tts_master_audio_url", newAudioUrl);
          } catch {}
        }}
      />
    </div>
  );
}
