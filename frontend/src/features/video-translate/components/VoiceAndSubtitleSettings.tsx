import React from "react";
import {
  VoicePreviewSelector,
} from "@/components/VoicePreviewSelector";
import {
  Settings2,
  ChevronDown,
  ChevronUp,
  Subtitles,
  Film,
  Music,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoTranslateStore } from "@/store/useVideoTranslateStore";

export interface VoiceAndSubtitleSettingsProps {
  handleResetAudioSubtitleDefaults?: () => void;
}

export const VoiceAndSubtitleSettings: React.FC<VoiceAndSubtitleSettingsProps> = ({
  handleResetAudioSubtitleDefaults,
}) => {
  const {
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

  const handleResetSettings = () => {
    setSubtitleMode("hard_target");
    setSubtitleFontSize(20);
    setSubtitlePosition("bottom");
    setOutputResolution("720p");
    setPreserveBgm(true);
    setBgmType("bgm");
    setBgmVolume(0.3);
    setVoiceRate("+0%");
    setMaxSpeedRate(1.25);
  };

  return (
    <div className="space-y-4 pt-1">
      {/* Chọn Giọng Đọc Lồng Tiếng */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
          <span>Giọng đọc AI lồng tiếng:</span>
          <span className="text-[11px] text-primary">
            {voices.length} giọng sẵn sàng
          </span>
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

      {/* Accordion Phụ Đề & Âm Thanh Nền Nâng Cao */}
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

        <div
          className={cn("curtain-collapse", showAdvanced && "curtain-expanded")}
        >
          <div className="curtain-inner">
            <div className="p-4 border-t border-white/10 space-y-4 bg-black/20 text-xs">
              {/* Chế độ phụ đề */}
              <div className="space-y-1.5">
                <label className="font-medium text-on-surface flex items-center gap-1.5">
                  <Subtitles className="w-3.5 h-3.5 text-primary" />
                  Kiểu gắn phụ đề (Subtitles):
                </label>
                <select
                  value={subtitleMode}
                  onChange={(e) => setSubtitleMode(e.target.value)}
                  className="w-full bg-surface-variant/70 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
                >
                  <option value="hard_target">
                    🔤 Phụ đề dịch (Hardsub tiếng Việt)
                  </option>
                  <option value="hard_dual">
                    🌐 Song ngữ (Gốc + Dịch song song)
                  </option>
                  <option value="none">
                    🚫 Không gắn phụ đề (Chỉ lồng tiếng)
                  </option>
                </select>
              </div>

              {/* Tùy chỉnh chi tiết phụ đề */}
              {subtitleMode !== "none" && (
                <div className="space-y-3 pt-2 border-t border-white/5 bg-surface-variant/30 p-3 rounded-2xl border border-white/5 animate-fadeIn">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-on-surface-variant">
                      <span className="font-medium text-on-surface">
                        Kích thước chữ phụ đề (Font Size):
                      </span>
                      <span className="font-mono text-primary font-bold">
                        {subtitleFontSize}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="36"
                      step="1"
                      value={subtitleFontSize}
                      onChange={(e) =>
                        setSubtitleFontSize(parseInt(e.target.value))
                      }
                      className="w-full accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-on-surface-variant/70">
                      <span>16px (Nhỏ)</span>
                      <span className="text-primary font-semibold">
                        Mặc định: 20px
                      </span>
                      <span>36px (Lớn)</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <label className="font-medium text-on-surface flex items-center justify-between text-xs">
                      <span>Vị trí hiển thị phụ đề:</span>
                      <span className="text-[10px] text-primary font-bold">
                        {subtitlePosition === "bottom"
                          ? "Dưới đáy"
                          : subtitlePosition === "middle"
                          ? "Giữa màn hình"
                          : "Trên cùng"}
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
                              : "bg-surface-variant/40 text-on-surface-variant border-white/5 hover:border-white/20",
                          )}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Chuẩn Video Đầu Ra (Resolution) */}
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
                  <option value="720p">
                    💻 720p (HD tiêu chuẩn - Tối ưu xuất nhanh)
                  </option>
                  <option value="480p">📱 480p (SD Siêu nhẹ)</option>
                </select>
              </div>

              {/* Âm thanh nền ghép cùng thuyết minh */}
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
                  <option value="bgm">
                    🎵 Nhạc nền tách (Lọc sạch vocal cũ - Demucs)
                  </option>
                  <option value="original">
                    🎙️ Âm thanh gốc (Giữ nguyên gốc - Thuyết minh đè lên)
                  </option>
                  <option value="none">
                    🔇 Tắt hẳn nhạc nền (Chỉ giữ giọng đọc AI)
                  </option>
                </select>

                {bgmType !== "none" && preserveBgm && (
                  <div className="space-y-1.5 pl-3 border-l-2 border-secondary/40 pt-1">
                    <div className="flex justify-between text-xs text-on-surface-variant">
                      <span>
                        Âm lượng{" "}
                        {bgmType === "original"
                          ? "âm thanh gốc"
                          : "nhạc nền"}
                        :
                      </span>
                      <span className="font-semibold text-secondary font-mono">
                        {Math.round(bgmVolume * 100)}%
                      </span>
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
                    <div className="flex justify-between text-[10px] text-on-surface-variant/70">
                      <span>0%</span>
                      <span className="text-secondary font-semibold">
                        Mặc định: 30%
                      </span>
                      <span>100% (Cho video âm thanh nhỏ)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tốc độ đọc AI */}
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

              {/* Tốc độ co giãn tối đa (SpeedRate) */}
              <div className="space-y-1 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span className="font-medium text-on-surface">
                    Tốc độ đọc tăng tối đa (SpeedRate):
                  </span>
                  <span className="font-mono text-primary font-bold">
                    {maxSpeedRate}x
                  </span>
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
                <p className="text-[10px] text-on-surface-variant/70">
                  Tự động tăng tốc câu lồng tiếng nếu câu dịch dài hơn thời lượng
                  cảnh quay video gốc.
                </p>
              </div>

              {/* Nút Phục Hồi Mặc Định */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] text-on-surface-variant/70">
                  💡 Chuẩn khuyến nghị: <code>Phụ đề dịch</code>,{" "}
                  <code>720p</code>, <code>BGM 30%</code>,{" "}
                  <code>Tốc độ +0%</code>.
                </span>
                <button
                  type="button"
                  onClick={handleResetAudioSubtitleDefaults || handleResetSettings}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Đặt lại mặc định</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
