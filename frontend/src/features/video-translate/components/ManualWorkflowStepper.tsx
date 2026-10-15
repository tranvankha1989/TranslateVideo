import React from "react";
import {
  Mic,
  Download,
  FileEdit,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Volume2,
  Clock,
  Scissors,
  CheckCircle2,
  Sparkles,
  FileText,
  FolderOpen,
  Clipboard,
  Upload,
  ClipboardPaste,
  Trash2,
  AlertCircle,
  Loader2,
  Settings2,
  Type,
  Film,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VoicePreviewSelector } from "@/components/voice-preview";
import { useVideoTranslateStore } from "@/store/useVideoTranslateStore";

export interface ManualWorkflowStepperProps {
  manualActiveStep: number;
  switchManualStep: (step: number) => void;
  isOriginalSrtReady: boolean;
  manualUploadedCount: number | null;
  isTranslatedSrtReady: boolean;
  isStepTransitioning: boolean;
  isTranscribingOriginal: boolean;
  handleStartManualTranscribe: () => void;
  handleResetTranscribeDefaults: () => void;
  showPromptPreview: boolean;
  setShowPromptPreview: (val: boolean) => void;
  customTranslationPrompt: string;
  handleUpdateCustomPrompt: (val: string) => void;
  handleReloadCustomPrompt: () => void;
  handleResetCustomPrompt: () => void;
  handleCopyOriginalSrt: (withPrompt: boolean) => void;
  handleDownloadOriginalPromptTxt: () => void;
  handleDownloadOriginalSrt: () => void;
  handleOpenFolder: () => void;
  isOpeningFolder: boolean;
  isCopyingOriginalSrt: boolean;
  manualSrtMode: "text" | "file";
  setManualSrtMode: (mode: "text" | "file") => void;
  manualSrtFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleManualSrtFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingManualSrt: boolean;
  manualSrtFile: File | null;
  handlePasteFromClipboard: () => void;
  manualSrtText: string;
  setManualSrtText: (text: string) => void;
  setHasAppliedManualSrt: (val: boolean) => void;
  handleManualSrtTextSubmit: () => void;
  hasAppliedManualSrt: boolean;
  handleResetAudioSubtitleDefaults: () => void;
  handleResumeManualPipeline: () => void;
  isStep4Enabled: boolean;
}

export function ManualWorkflowStepper({
  manualActiveStep,
  switchManualStep,
  isOriginalSrtReady,
  manualUploadedCount,
  isTranslatedSrtReady,
  isStepTransitioning,
  isTranscribingOriginal,
  handleStartManualTranscribe,
  handleResetTranscribeDefaults,
  showPromptPreview,
  setShowPromptPreview,
  customTranslationPrompt,
  handleUpdateCustomPrompt,
  handleReloadCustomPrompt,
  handleResetCustomPrompt,
  handleCopyOriginalSrt,
  handleDownloadOriginalPromptTxt,
  handleDownloadOriginalSrt,
  handleOpenFolder,
  isOpeningFolder,
  isCopyingOriginalSrt,
  manualSrtMode,
  setManualSrtMode,
  manualSrtFileInputRef,
  handleManualSrtFileChange,
  isUploadingManualSrt,
  manualSrtFile,
  handlePasteFromClipboard,
  manualSrtText,
  setManualSrtText,
  setHasAppliedManualSrt,
  handleManualSrtTextSubmit,
  hasAppliedManualSrt,
  handleResetAudioSubtitleDefaults,
  handleResumeManualPipeline,
  isStep4Enabled,
}: ManualWorkflowStepperProps) {
  const {
    videoFile,
    isProcessing,
    taskStatus,
    taskId,
    sourceLang,
    setSourceLang,
    whisperModel,
    setWhisperModel,
    showTranscribeAdvanced,
    setShowTranscribeAdvanced,
    vadThreshold,
    setVadThreshold,
    speechPadMs,
    setSpeechPadMs,
    minSilenceDurationMs,
    setMinSilenceDurationMs,
    minSpeechDurationMs,
    setMinSpeechDurationMs,
    beamSize,
    setBeamSize,
    voices,
    selectedVoice,
    setSelectedVoice,
    setSelectedEngine,
    showAdvanced,
    setShowAdvanced,
    subtitleMode,
    setSubtitleMode,
    subtitleFontSize,
    setSubtitleFontSize,
    subtitlePosition,
    setSubtitlePosition,
    outputResolution,
    setOutputResolution,
    preserveBgm,
    setPreserveBgm,
    bgmType,
    setBgmType,
    bgmVolume,
    setBgmVolume,
    voiceRate,
    setVoiceRate,
    maxSpeedRate,
    setMaxSpeedRate,
  } = useVideoTranslateStore();

  return (
    <div
      key="manual-mode-card"
      className="bg-surface/80 border border-white/10 rounded-3xl p-5 sm:p-6 space-y-5 backdrop-blur-xl shadow-xl transition-all duration-300"
    >
      {/* Stepper Navigation Bar with < > arrow buttons */}
      <div className="bg-surface-variant/30 border border-white/5 rounded-2xl p-1.5 flex items-center gap-2">
        {/* Nút Mũi Tên < (Bước trước) */}
        <button
          type="button"
          disabled={manualActiveStep <= 1}
          onClick={() => switchManualStep(Math.max(1, manualActiveStep - 1))}
          title={manualActiveStep <= 1 ? "Đang ở bước đầu tiên" : `Quay lại Bước ${manualActiveStep - 1}`}
          className={cn(
            "w-9 h-11 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 border cursor-pointer",
            manualActiveStep <= 1
              ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
              : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Danh sách 4 Bước */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-1">
          {[
            { step: 1, title: "1. Phụ đề gốc", desc: "Faster-Whisper", icon: Mic, active: manualActiveStep === 1, done: isOriginalSrtReady },
            { step: 2, title: "2. Prompt & Dịch", desc: "Gemini AI / Copy", icon: Download, active: manualActiveStep === 2, done: manualUploadedCount !== null },
            { step: 3, title: "3. Nạp SRT Dịch", desc: "Upload / Paste", icon: FileEdit, active: manualActiveStep === 3, done: isTranslatedSrtReady },
            { step: 4, title: "4. Giọng & Render", desc: "OmniVoice / Edge", icon: Sliders, active: manualActiveStep === 4, done: taskStatus?.status === "completed" },
          ].map((item) => {
            const Icon = item.icon;
            const isCurrent = item.step === manualActiveStep;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => switchManualStep(item.step)}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all duration-300 ease-out cursor-pointer border",
                  isCurrent
                    ? "bg-primary text-black font-semibold border-primary shadow-md shadow-primary/20 scale-[1.01]"
                    : item.done
                    ? "bg-surface-variant/70 text-green-400 hover:bg-surface-variant border-green-500/30 hover:border-green-500/50"
                    : "bg-surface-variant/40 text-on-surface-variant hover:bg-surface-variant/70 border-white/5 hover:text-on-surface hover:border-white/20"
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold",
                    isCurrent ? "bg-black/20 text-black" : item.done ? "bg-green-500/20 text-green-400" : "bg-white/10 text-on-surface-variant"
                  )}
                >
                  {item.done && !isCurrent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[11px] leading-tight truncate", isCurrent ? "text-black font-bold" : "font-medium")}>
                    {item.title}
                  </p>
                  <p className={cn("text-[9px] leading-tight truncate opacity-80", isCurrent ? "text-black/80" : "text-on-surface-variant")}>
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Nút Mũi Tên > (Bước tiếp theo) */}
        <button
          type="button"
          disabled={manualActiveStep >= 4}
          onClick={() => switchManualStep(Math.min(4, manualActiveStep + 1))}
          title={manualActiveStep >= 4 ? "Đang ở bước cuối cùng" : `Sang Bước ${manualActiveStep + 1}`}
          className={cn(
            "w-9 h-11 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 border cursor-pointer",
            manualActiveStep >= 4
              ? "opacity-20 text-white/30 border-white/5 bg-transparent cursor-not-allowed"
              : "opacity-40 hover:opacity-100 text-white/70 hover:text-white bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 hover:scale-105 active:scale-95 shadow-sm"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Main Step Content */}
      <div className={cn("border-t border-white/5 pt-1 min-h-[320px] transition-all duration-300", isStepTransitioning ? "step-fade-exit" : "step-fade-enter")}>
        {/* Bước 1: Cấu hình tạo phụ đề Whisper */}
        {manualActiveStep === 1 && (
          <div key="manual-step-1" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <Mic className="w-4 h-4 text-primary" />
                Bước 1: Tạo Phụ Đề Gốc (Faster-Whisper)
              </h2>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                Xuất file .SRT gốc
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
                  Ngôn ngữ video gốc:
                </label>
                <select
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="auto">✨ Tự động nhận diện (Auto Detect)</option>
                  <option value="en">English (Tiếng Anh)</option>
                  <option value="zh-cn">中文 (Tiếng Trung)</option>
                  <option value="ja">日本語 (Tiếng Nhật)</option>
                  <option value="ko">한국어 (Tiếng Hàn)</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="fr">Français (Tiếng Pháp)</option>
                  <option value="de">Deutsch (Tiếng Đức)</option>
                  <option value="es">Español (Tây Ban Nha)</option>
                  <option value="ru">Русский (Tiếng Nga)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1.5">
                  Mô hình Whisper AI:
                </label>
                <select
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value)}
                  className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors font-medium text-primary"
                >
                  <option value="large-v3">🌟 large-v3 (Mặc định - 1.55 Tỷ tham số • Chuẩn xác cao nhất)</option>
                  <option value="large-v3-turbo">🚀 large-v3-turbo (Siêu tốc 8x & Chuẩn xác)</option>
                  <option value="medium">⚡ medium (Cân bằng & Tốc độ cao)</option>
                  <option value="small">🚀 small (Nhẹ & Nhanh)</option>
                  <option value="base">⏱️ base (Bản tối giản)</option>
                </select>
              </div>
            </div>

            {/* ⚙️ Bảng Tùy Chỉnh Nhận Diện Nâng Cao */}
            <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/20 transition-all">
              <button
                type="button"
                onClick={() => setShowTranscribeAdvanced(!showTranscribeAdvanced)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  ⚙️ Tùy Chỉnh Bóc Tách Nâng Cao (Độ nhạy VAD, Đệm từ, Chống nuốt chữ)
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                  {showTranscribeAdvanced ? "Thu nhỏ" : "Mở rộng"}
                  {showTranscribeAdvanced ? (
                    <ChevronUp className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                  )}
                </span>
              </button>

              <div className={cn("curtain-collapse", showTranscribeAdvanced && "curtain-expanded")}>
                <div className="curtain-inner">
                  <div className="p-4 border-t border-white/10 space-y-4 bg-black/20 text-xs">
                    {/* VAD Threshold */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="font-medium text-on-surface flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-primary" />
                          Độ nhạy bắt giọng nói (VAD Threshold):
                        </label>
                        <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {vadThreshold.toFixed(2)} {vadThreshold <= 0.30 ? "(Siêu nhạy - Bắt cả tiếng thì thầm)" : vadThreshold <= 0.40 ? "(Cân bằng tối ưu)" : "(Chặt chẽ)"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.15"
                        max="0.65"
                        step="0.05"
                        value={vadThreshold}
                        onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
                        className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
                      />
                      <p className="text-[10px] text-on-surface-variant/70">
                        💡 <em>Kéo về bên trái (0.20 - 0.35)</em> để bắt trọn những câu thoại nói nhỏ, nói thầm, nói lướt hoặc có nhạc nền đè lên.
                      </p>
                    </div>

                    {/* Grid: Speech Pad & Min Silence Duration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="font-medium text-on-surface flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-cyan-400" />
                            Đệm mở rộng câu (Pad):
                          </label>
                          <span className="font-mono text-[11px] font-bold text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                            {speechPadMs}ms
                          </span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="700"
                          step="50"
                          value={speechPadMs}
                          onChange={(e) => setSpeechPadMs(parseInt(e.target.value))}
                          className="w-full accent-cyan-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                        <p className="text-[10px] text-on-surface-variant/70">
                          Tăng lên 400ms - 500ms để không bao giờ bị cắt cụt chữ đầu và chữ cuối câu.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="font-medium text-on-surface flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-emerald-400" />
                            Khoảng lặng ngắt câu (Min Silence):
                          </label>
                          <span className="font-mono text-[11px] font-bold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            {minSilenceDurationMs}ms
                          </span>
                        </div>
                        <input
                          type="range"
                          min="300"
                          max="2000"
                          step="100"
                          value={minSilenceDurationMs}
                          onChange={(e) => setMinSilenceDurationMs(parseInt(e.target.value))}
                          className="w-full accent-emerald-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                        <p className="text-[10px] text-on-surface-variant/70">
                          Đặt 800ms - 1200ms để không nuốt đoạn thoại khi diễn viên ngắt nghỉ lấy hơi giữa câu (chống nuốt 8s).
                        </p>
                      </div>
                    </div>

                    {/* Grid: Min Speech Duration & Beam Size */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/5 items-center">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="font-medium text-on-surface flex items-center gap-1">
                            <Scissors className="w-3.5 h-3.5 text-amber-400" />
                            Thời lượng ngắn nhất:
                          </label>
                          <span className="font-mono text-[11px] font-bold text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded">
                            {minSpeechDurationMs}ms
                          </span>
                        </div>
                        <input
                          type="range"
                          min="50"
                          max="500"
                          step="50"
                          value={minSpeechDurationMs}
                          onChange={(e) => setMinSpeechDurationMs(parseInt(e.target.value))}
                          className="w-full accent-amber-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                        <p className="text-[10px] text-on-surface-variant/70">
                          Giảm xuống 100ms - 150ms để bắt được cả các từ ngắn như "ừ", "hả", tiếng cảm thán.
                        </p>
                      </div>

                      <div>
                        <label className="font-medium text-on-surface block mb-1">
                          Độ sâu dò từ (Beam Size):
                        </label>
                        <select
                          value={beamSize}
                          onChange={(e) => setBeamSize(parseInt(e.target.value))}
                          className="w-full bg-surface-variant/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                        >
                          <option value="1">1 (Tốc độ tối đa - Nhanh nhất)</option>
                          <option value="3">3 (Cân bằng chuẩn - Khuyên dùng)</option>
                          <option value="5">5 (Độ chính xác sâu nhất)</option>
                        </select>
                        <p className="text-[10px] text-on-surface-variant/70 mt-1">
                          Dò tìm nhiều nhánh từ đồng âm để chọn kết quả chính xác nhất.
                        </p>
                      </div>
                    </div>

                    {/* 🔄 Nút Phục Hồi Mặc Định */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] text-on-surface-variant/70">
                        💡 Chuẩn khuyến nghị: <code>large-v3</code>, <code>VAD 0.35</code>, <code>Pad 400ms</code>, <code>Silence 1000ms</code>.
                      </span>
                      <button
                        type="button"
                        onClick={handleResetTranscribeDefaults}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Phục hồi mặc định
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartManualTranscribe}
              disabled={!videoFile || isProcessing || isOriginalSrtReady}
              title={
                !videoFile
                  ? "Vui lòng tải video lên trước"
                  : isProcessing
                  ? "Đang tạo phụ đề Whisper..."
                  : isOriginalSrtReady
                  ? "Đã hoàn thành tạo phụ đề gốc cho video này. Tải video mới lên để tạo lại từ đầu."
                  : "Bắt đầu bóc tách âm thanh và tạo file phụ đề gốc bằng Faster-Whisper"
              }
              className={cn(
                "w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg",
                !videoFile || isProcessing || isOriginalSrtReady
                  ? "bg-surface-variant/40 text-on-surface-variant/60 cursor-not-allowed opacity-60 border border-white/5"
                  : "bg-gradient-to-r from-primary to-primary/80 text-black hover:opacity-90 active:scale-[0.99] cursor-pointer"
              )}
            >
              {isProcessing && taskStatus?.current_step === "transcribing"
                ? `Đang tạo phụ đề Whisper (${taskStatus?.progress || 0}%)...`
                : isOriginalSrtReady
                ? "Đã Hoàn Thành Tạo Phụ Đề Gốc"
                : "Bắt Đầu Tạo Phụ Đề Gốc"}
            </button>
          </div>
        )}

        {/* Bước 2: Xuất file SRT gốc & Dịch thủ công bên ngoài */}
        {manualActiveStep === 2 && (
          <div key="manual-step-2" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <Download className="w-4 h-4 text-secondary" />
                Bước 2: Xuất File Phụ Đề Gốc & Dịch Bên Ngoài
              </h2>
              {isTranscribingOriginal ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Đang tạo phụ đề ({taskStatus?.progress || 0}%)...
                </span>
              ) : isOriginalSrtReady ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Đã sẵn sàng tải SRT gốc
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/5 text-on-surface-variant/70 border border-white/10 font-medium">
                  Chưa tạo phụ đề
                </span>
              )}
            </div>

            <p className="text-xs text-on-surface-variant">
              Sau khi bóc tách xong, bạn có thể <strong>Sao chép phụ đề đã ghép sẵn Prompt mẫu</strong> để dán trực tiếp vào AI (ChatGPT / Claude / DeepL) hoặc tải file <code className="text-primary font-mono font-semibold">.txt / .srt</code> về máy để biên dịch.
            </p>

            {/* Accordion: Tùy chỉnh Quy tắc AI khi dịch (Prompt AI) */}
            <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/20 transition-all">
              <button
                type="button"
                onClick={() => setShowPromptPreview(!showPromptPreview)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  ⚙️ Quy tắc AI khi dịch (Tùy chỉnh Prompt cho ChatGPT / Claude / DeepL)
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                  {showPromptPreview ? "Thu nhỏ" : "Mở rộng để sửa"}
                  {showPromptPreview ? (
                    <ChevronUp className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                  )}
                </span>
              </button>

              <div className={cn("curtain-collapse", showPromptPreview && "curtain-expanded")}>
                <div className="curtain-inner">
                  <div className="p-3.5 border-t border-white/10 bg-black/30 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] text-on-surface-variant font-medium">
                        💡 Bạn có thể dán hoặc chỉnh sửa quy tắc dịch thuật theo ý muốn (hệ thống sẽ tự ghi nhớ):
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleReloadCustomPrompt}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-[10px] font-semibold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                          title="Nạp lại quy tắc dịch thuật đã lưu"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Nạp lại quy tắc
                        </button>
                        <button
                          type="button"
                          onClick={handleResetCustomPrompt}
                          className="px-2 py-0.5 rounded-lg bg-surface-variant/60 hover:bg-surface-variant text-[10px] text-on-surface-variant hover:text-on-surface border border-white/10 cursor-pointer transition-all active:scale-95"
                          title="Khôi phục về prompt chuẩn ban đầu"
                        >
                          Khôi phục mặc định
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={customTranslationPrompt}
                      onChange={(e) => handleUpdateCustomPrompt(e.target.value)}
                      rows={6}
                      className="w-full text-xs font-mono bg-surface/80 border border-white/10 rounded-xl p-3 text-on-surface focus:outline-none focus:border-cyan-400 resize-y leading-relaxed"
                      placeholder="Nhập hoặc dán các quy tắc yêu cầu AI dịch vào đây..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Nút 1: Sao Chép Kèm Prompt AI */}
              <button
                type="button"
                onClick={() => handleCopyOriginalSrt(true)}
                disabled={!isOriginalSrtReady || isTranscribingOriginal || isCopyingOriginalSrt}
                className={cn(
                  "py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                  isOriginalSrtReady && !isTranscribingOriginal
                    ? "bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-primary"
                    : "bg-white/5 text-on-surface-variant/50 border-white/5 cursor-not-allowed opacity-50"
                )}
                title="Sao chép toàn bộ Prompt và Phụ đề vào Clipboard để dán trực tiếp vào ChatGPT / Claude / DeepL"
              >
                {isCopyingOriginalSrt ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Đang sao chép...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span>📋 Sao Chép Kèm Prompt AI</span>
                  </>
                )}
              </button>

              {/* Nút 2: Tải File TXT Kèm Prompt */}
              <button
                type="button"
                onClick={handleDownloadOriginalPromptTxt}
                disabled={!isOriginalSrtReady || isTranscribingOriginal}
                className={cn(
                  "py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                  isOriginalSrtReady && !isTranscribingOriginal
                    ? "bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-cyan-300"
                    : "bg-white/5 text-on-surface-variant/50 border-white/5 cursor-not-allowed opacity-50"
                )}
                title="Tải file văn bản .txt đã ghép sẵn Prompt yêu cầu dịch và nội dung phụ đề"
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>📄 Tải File Kèm Prompt (.TXT)</span>
              </button>

              {/* Nút 3: Tải File SRT Gốc Thuần */}
              <button
                type="button"
                onClick={handleDownloadOriginalSrt}
                disabled={!isOriginalSrtReady || isTranscribingOriginal}
                className={cn(
                  "py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                  isOriginalSrtReady && !isTranscribingOriginal
                    ? "bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-secondary"
                    : "bg-white/5 text-on-surface-variant/50 border-white/5 cursor-not-allowed opacity-50"
                )}
                title="Tải file phụ đề câu thoại gốc .srt về máy tính"
              >
                <Download className="w-4 h-4 text-secondary" />
                <span>📥 Tải File .SRT Gốc</span>
              </button>
            </div>

            {/* Mở âm thanh tách Vocal */}
            {isOriginalSrtReady && !isTranscribingOriginal && (
              <button
                type="button"
                onClick={handleOpenFolder}
                disabled={isOpeningFolder}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border bg-surface-variant/60 hover:bg-surface-variant text-on-surface border-white/10 hover:border-white/20 active:scale-95 shadow-sm hover:text-cyan-300 mt-3"
                title="Mở thư mục trên máy tính chứa file giọng nói sạch Vocals và Nhạc nền đã bóc tách"
              >
                {isOpeningFolder ? (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                ) : (
                  <FolderOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                )}
                <span>Mở âm thanh tách Vocal</span>
              </button>
            )}
          </div>
        )}

        {/* Bước 3: Nạp file SRT đã dịch */}
        {manualActiveStep === 3 && (
          <div key="manual-step-3" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-amber-400" />
                Bước 3: Nạp Lại Phụ Đề Đã Dịch
              </h2>
              {manualUploadedCount !== null ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Đã nhận {manualUploadedCount} câu phụ đề
                </span>
              ) : isTranscribingOriginal ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  Đang chờ tạo phụ đề...
                </span>
              ) : null}
            </div>

            {/* Tab chuyển đổi giữa Dán Text và Tải File .SRT */}
            <div className="flex p-1 bg-surface-variant/40 rounded-xl border border-white/5 gap-1">
              <button
                type="button"
                onClick={() => setManualSrtMode("text")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                  manualSrtMode === "text"
                    ? "bg-surface-variant/90 text-primary border-primary/40 shadow-sm"
                    : "bg-transparent text-on-surface-variant hover:text-on-surface border-transparent hover:bg-white/5"
                )}
              >
                <Clipboard className="w-3.5 h-3.5 text-primary" />
                <span>📋 Dán văn bản (Copy/Paste)</span>
              </button>
              <button
                type="button"
                onClick={() => setManualSrtMode("file")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                  manualSrtMode === "file"
                    ? "bg-surface-variant/90 text-primary border-primary/40 shadow-sm"
                    : "bg-transparent text-on-surface-variant hover:text-on-surface border-transparent hover:bg-white/5"
                )}
              >
                <Upload className="w-3.5 h-3.5 text-primary" />
                <span>📁 Tải file .SRT</span>
              </button>
            </div>

            {/* Chế độ 1: Tải file .SRT */}
            {manualSrtMode === "file" && (
              <div className="space-y-2">
                <input
                  ref={manualSrtFileInputRef as React.RefObject<HTMLInputElement>}
                  type="file"
                  accept=".srt"
                  className="hidden"
                  disabled={isTranscribingOriginal}
                  onChange={handleManualSrtFileChange}
                />

                <div
                  onClick={() => {
                    if (!isTranscribingOriginal) {
                      manualSrtFileInputRef.current?.click();
                    } else {
                      toast.info("Vui lòng chờ tạo phụ đề thoại xong trước khi nạp file dịch.");
                    }
                  }}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all group",
                    isTranscribingOriginal
                      ? "border-white/10 bg-surface-variant/10 opacity-50 cursor-not-allowed"
                      : "border-white/15 hover:border-primary/50 cursor-pointer bg-surface-variant/40 hover:bg-surface-variant/60 shadow-sm"
                  )}
                >
                  {isUploadingManualSrt ? (
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                  )}
                  <p className="text-xs font-medium text-on-surface text-center">
                    {isUploadingManualSrt
                      ? "Đang phân tích cú pháp file SRT..."
                      : manualSrtFile
                      ? manualSrtFile.name
                      : isTranscribingOriginal
                      ? "Tạm thời khóa khi đang tạo phụ đề video..."
                      : "Nhấp để chọn hoặc kéo thả file .SRT đã dịch vào đây"}
                  </p>
                  {manualSrtFile && !isUploadingManualSrt ? (
                    <p className="text-[11px] text-green-400 font-medium">
                      ✅ Đã nạp: {manualSrtFile.name} ({(manualSrtFile.size / 1024).toFixed(1)} KB)
                    </p>
                  ) : (
                    <p className="text-[10px] text-on-surface-variant">
                      Chấp nhận file định dạng SubRip (.srt) chuẩn UTF-8
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Chế độ 2: Dán trực tiếp văn bản SRT */}
            {manualSrtMode === "text" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      <span>Dán từ Clipboard</span>
                    </button>
                    {manualSrtText && (
                      <button
                        type="button"
                        onClick={() => setManualSrtText("")}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-on-surface-variant hover:text-rose-400 border border-white/10 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-on-surface-variant">
                    {manualSrtText ? `${manualSrtText.split("\n").length} dòng • ${manualSrtText.length} ký tự` : "Hỗ trợ định dạng SRT chuẩn"}
                  </span>
                </div>

                <textarea
                  value={manualSrtText}
                  onChange={(e) => {
                    setManualSrtText(e.target.value);
                    setHasAppliedManualSrt(false);
                  }}
                  placeholder={`1\n00:00:01,000 --> 00:00:04,500\nXin chào các bạn, đây là phụ đề đã dịch...\n\n2\n00:00:05,000 --> 00:00:08,200\nNội dung câu tiếp theo...`}
                  rows={7}
                  className="w-full bg-surface-variant/40 border border-white/10 focus:border-primary rounded-xl p-3 text-xs font-mono text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none transition-colors resize-y leading-relaxed"
                />

                <button
                  type="button"
                  disabled={isUploadingManualSrt || !manualSrtText.trim()}
                  onClick={handleManualSrtTextSubmit}
                  className={cn(
                    "w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm",
                    !manualSrtText.trim()
                      ? "bg-white/5 text-on-surface-variant/40 border border-white/5 cursor-not-allowed"
                      : "bg-primary text-on-primary hover:bg-primary/90 hover:shadow-primary/25"
                  )}
                >
                  {isUploadingManualSrt ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang phân tích cú pháp phụ đề...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Áp Dụng Nội Dung Phụ Đề Này</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bước 4: Cấu hình Giọng đọc & Tiếp tục Lồng tiếng */}
        {manualActiveStep === 4 && (
          <div id="manual-step-4-card" key="manual-step-4" className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                Bước 4: Cấu Hình Giọng Lồng Tiếng & Hoàn Tất Video
              </h2>
              {manualUploadedCount !== null && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
                  Đã nạp {manualUploadedCount} câu phụ đề
                </span>
              )}
            </div>

            {/* Thông báo trạng thái khi đã hoàn thành */}
            {taskStatus?.status === "completed" && !hasAppliedManualSrt && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">Tác vụ video hiện tại đã xuất thành phẩm hoàn tất.</p>
                  <p className="text-amber-200/80 leading-relaxed">
                    Để lồng tiếng và render lại: Vui lòng quay lại{" "}
                    <button
                      type="button"
                      onClick={() => switchManualStep(3)}
                      className="underline font-bold text-amber-300 hover:text-white cursor-pointer inline-flex items-center gap-0.5"
                    >
                      Bước 3 (Nạp SRT Dịch)
                    </button>
                    , dán/nạp phụ đề dịch và bấm <b>"Áp Dụng Nội Dung Phụ Đề Này"</b> để mở khóa nút Render lại.
                  </p>
                </div>
              </div>
            )}
            {taskStatus?.status === "completed" && hasAppliedManualSrt && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-2xl text-xs text-green-300 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <span>Đã nạp và áp dụng nội dung phụ đề dịch mới! Nút <b>"Lồng Tiếng & Render Lại"</b> đã được mở khóa bên dưới.</span>
              </div>
            )}

            {/* Chọn Giọng Đọc Lồng Tiếng */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                <span>Giọng đọc AI lồng tiếng:</span>
                <span className="text-[11px] text-primary">{voices.length} giọng sẵn sàng</span>
              </label>
              <VoicePreviewSelector
                voices={voices}
                selectedVoice={selectedVoice}
                onSelectVoice={(vId, eng) => {
                  setSelectedVoice(vId);
                  setSelectedEngine(eng);
                }}
              />
            </div>

            {/* Tùy chỉnh Phụ Đề & Âm Thanh Nền Nâng Cao */}
            <div className="border border-white/10 rounded-2xl overflow-hidden bg-surface-variant/20 transition-all">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                  ⚙️ Tùy Chỉnh Phụ Đề & Âm Thanh Nền (BGM / Âm Thanh Gốc / Tốc Độ)
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                  {showAdvanced ? "Thu nhỏ" : "Mở rộng"}
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                  )}
                </span>
              </button>

              <div className={cn("curtain-collapse", showAdvanced && "curtain-expanded")}>
                <div className="curtain-inner">
                  <div className="p-4 border-t border-white/10 space-y-4 bg-black/20 text-xs">
                    {/* Kiểu Phụ Đề */}
                    <div className="space-y-1.5">
                      <label className="font-medium text-on-surface flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-primary" />
                        Kiểu phụ đề xuất cùng video:
                      </label>
                      <select
                        value={subtitleMode}
                        onChange={(e) => setSubtitleMode(e.target.value)}
                        className="w-full bg-surface-variant/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
                      >
                        <option value="hard_target">🔤 Phụ đề Dịch tiếng Việt (Hardsub nét)</option>
                        <option value="hard_bilingual">🈴 Phụ đề Song Ngữ (Gốc + Dịch - Dành cho học tập)</option>
                        <option value="hard_source">📝 Phụ đề Gốc nguyên bản</option>
                        <option value="none">🚫 Không ghi đè phụ đề vào video (Chỉ lồng tiếng đọc)</option>
                      </select>
                    </div>

                    {/* Tùy chỉnh chi tiết Cỡ chữ & Vị trí phụ đề */}
                    {subtitleMode !== "none" && (
                      <div className="p-3 bg-surface-variant/30 rounded-xl border border-white/5 space-y-3">
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-on-surface">Cỡ chữ phụ đề (Font Size):</span>
                            <span className="font-mono text-primary font-bold">{subtitleFontSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="14"
                            max="36"
                            step="1"
                            value={subtitleFontSize}
                            onChange={(e) => setSubtitleFontSize(parseInt(e.target.value))}
                            className="w-full accent-primary cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="font-medium text-on-surface flex items-center justify-between">
                            <span>Vị trí hiển thị phụ đề:</span>
                            <span className="text-primary font-bold">
                              {subtitlePosition === "bottom" ? "Dưới đáy" : subtitlePosition === "middle" ? "Giữa màn hình" : "Trên cùng"}
                            </span>
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { id: "bottom", label: "⬇️ Dưới đáy" },
                              { id: "middle", label: "⏹️ Giữa màn hình" },
                              { id: "top", label: "⬆️ Trên cùng" },
                            ].map((pos) => (
                              <button
                                key={pos.id}
                                type="button"
                                onClick={() => setSubtitlePosition(pos.id as any)}
                                className={cn(
                                  "py-1.5 px-2 rounded-xl text-xs font-medium border transition-all text-center cursor-pointer",
                                  subtitlePosition === pos.id
                                    ? "bg-primary text-black border-primary font-bold shadow-md"
                                    : "bg-surface-variant/40 text-on-surface-variant border-white/5 hover:border-white/20"
                                )}
                              >
                                {pos.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Độ phân giải */}
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <label className="font-medium text-on-surface flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-primary" />
                        Độ phân giải video đầu ra:
                      </label>
                      <select
                        value={outputResolution}
                        onChange={(e) => setOutputResolution(e.target.value)}
                        className="w-full bg-surface-variant/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
                      >
                        <option value="original">📐 Giữ nguyên độ phân giải gốc</option>
                        <option value="1080p">📺 1080p (Full HD sắc nét)</option>
                        <option value="720p">💻 720p (HD tiêu chuẩn - Tối ưu xuất nhanh)</option>
                        <option value="480p">📱 480p (SD Siêu nhẹ)</option>
                      </select>
                    </div>

                    {/* Âm thanh nền */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <label className="font-medium text-on-surface flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-secondary" />
                        Kiểu âm thanh nền ghép cùng thuyết minh:
                      </label>
                      <select
                        value={!preserveBgm ? "none" : bgmType}
                        onChange={(e) => {
                          const val = e.target.value as "bgm" | "original" | "none";
                          setBgmType(val);
                          setPreserveBgm(val !== "none");
                        }}
                        className="w-full bg-surface-variant/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-secondary transition-colors cursor-pointer"
                      >
                        <option value="bgm">🎵 Nhạc nền tách (Lọc sạch vocal cũ - Demucs)</option>
                        <option value="original">🎙️ Âm thanh gốc (Giữ nguyên gốc - Thuyết minh đè lên)</option>
                        <option value="none">🔇 Tắt hẳn nhạc nền (Chỉ giữ giọng đọc AI)</option>
                      </select>

                      {bgmType !== "none" && preserveBgm && (
                        <div className="space-y-1.5 pl-3 border-l-2 border-secondary/40 pt-1">
                          <div className="flex justify-between text-xs text-on-surface-variant">
                            <span>Âm lượng {bgmType === "original" ? "âm thanh gốc" : "nhạc nền"}:</span>
                            <span className="font-semibold text-secondary font-mono">{Math.round(bgmVolume * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.01"
                            value={bgmVolume}
                            onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                            className="w-full accent-secondary cursor-pointer"
                          />
                        </div>
                      )}
                    </div>

                    {/* Tốc độ đọc */}
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <label className="font-medium text-on-surface block">
                        Tốc độ đọc mặc định:
                      </label>
                      <select
                        value={voiceRate}
                        onChange={(e) => setVoiceRate(e.target.value)}
                        className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                      >
                        <option value="-15%">Chậm (-15%)</option>
                        <option value="-10%">Hơi chậm (-10%)</option>
                        <option value="+0%">Bình thường (+0%)</option>
                        <option value="+10%">Hơi nhanh (+10%)</option>
                        <option value="+15%">Nhanh (+15%)</option>
                      </select>
                    </div>

                    {/* SpeedRate */}
                    <div className="space-y-1 pt-2 border-t border-white/5">
                      <div className="flex justify-between text-xs text-on-surface-variant">
                        <span className="font-medium text-on-surface">Tốc độ đọc tăng tối đa (SpeedRate):</span>
                        <span className="font-mono text-primary font-bold">{maxSpeedRate}x</span>
                      </div>
                      <input
                        type="range"
                        min="1.1"
                        max="1.5"
                        step="0.05"
                        value={maxSpeedRate}
                        onChange={(e) => setMaxSpeedRate(parseFloat(e.target.value))}
                        className="w-full accent-primary cursor-pointer"
                      />
                    </div>

                    {/* 🔄 Nút Phục Hồi Mặc Định */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] text-on-surface-variant/70">
                        💡 Chuẩn khuyến nghị: <code>Phụ đề dịch</code>, <code>720p</code>, <code>BGM 30%</code>, <code>Tốc độ +0%</code>.
                      </span>
                      <button
                        type="button"
                        onClick={handleResetAudioSubtitleDefaults}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Phục hồi mặc định
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Button Tiếp Tục Lồng Tiếng & Render */}
            <button
              onClick={handleResumeManualPipeline}
              disabled={!isStep4Enabled}
              title={
                !taskStatus?.task_id && !taskId
                  ? "Vui lòng chọn hoặc nạp video trước"
                  : isProcessing
                  ? "Đang tiến hành lồng tiếng & render video..."
                  : taskStatus?.status === "completed" && !hasAppliedManualSrt
                  ? "Để render lại: Vui lòng quay lại Bước 3 dán phụ đề và bấm 'Áp Dụng Nội Dung Phụ Đề Này'"
                  : !isStep4Enabled
                  ? "Vui lòng nạp phụ đề dịch (.srt) ở Bước 3 trước khi tiếp tục"
                  : taskStatus?.status === "completed"
                  ? "Bắt đầu lồng tiếng và render lại video với phụ đề mới vừa áp dụng"
                  : "Bắt đầu lồng tiếng và render video thành phẩm"
              }
              className={cn(
                "w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 shadow-xl",
                !isStep4Enabled
                  ? "bg-surface-variant/40 text-on-surface-variant/60 cursor-not-allowed opacity-60 border border-white/5"
                  : "bg-gradient-to-r from-primary via-primary/90 to-primary text-black hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] shadow-primary/20 cursor-pointer"
              )}
            >
              {isProcessing && taskStatus?.current_step !== "transcribing" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{`Đang lồng tiếng & render video (${taskStatus?.progress || 0}%)...`}</span>
                </>
              ) : isTranscribingOriginal ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang chờ tạo phụ đề thoại xong...</span>
                </>
              ) : taskStatus?.status === "completed" ? (
                hasAppliedManualSrt ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Lồng Tiếng & Render Lại</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 opacity-50" />
                    <span>Lồng Tiếng & Render Lại (Chờ áp dụng phụ đề ở Bước 3)</span>
                  </>
                )
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Tiếp Tục Lồng Tiếng & Render Video</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
