import React from "react";
import {
  Sliders,
  Sparkles,
  Key,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoTranslateStore } from "@/store/useVideoTranslateStore";

interface TranslationSettingsCardProps {
  handleVerifyGeminiKey: () => void;
  isVerifyingKey: boolean;
  keyVerifyResult: {
    valid: boolean;
    message: string;
    quota_details?: Record<string, any>;
  } | null;
  setKeyVerifyResult: (val: any) => void;
}

export const TranslationSettingsCard: React.FC<TranslationSettingsCardProps> = ({
  handleVerifyGeminiKey,
  isVerifyingKey,
  keyVerifyResult,
  setKeyVerifyResult,
}) => {
  const {
    languages,
    sourceLang,
    targetLang,
    translationProvider,
    translationStyle,
    geminiApiKey,
    geminiModel,
    geminiTemperature,
    whisperModel,
    setSourceLang,
    setTargetLang,
    setTranslationProvider,
    setTranslationStyle,
    setGeminiApiKey,
    setGeminiModel,
    setGeminiTemperature,
    setWhisperModel,
  } = useVideoTranslateStore();

  return (
    <div className="bg-surface/80 border border-white/10 rounded-3xl p-6 space-y-5 backdrop-blur-xl shadow-lg">
      <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
        <Sliders className="w-4 h-4 text-primary" />
        2. Cấu Hình Ngôn Ngữ & Mô Hình Dịch
      </h2>

      {/* Hàng chọn ngôn ngữ nguồn & đích */}
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
            Dịch sang ngôn ngữ:
          </label>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors font-medium text-primary"
          >
            {languages.length > 0 ? (
              languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))
            ) : (
              <>
                <option value="vi">Tiếng Việt (Vietnamese)</option>
                <option value="en">English (Tiếng Anh)</option>
                <option value="zh-cn">中文 (Tiếng Trung)</option>
                <option value="ja">日本語 (Tiếng Nhật)</option>
                <option value="ko">한국어 (Tiếng Hàn)</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Phong Cách Dịch & Đại Từ Xưng Hô */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
          <span>Phong cách dịch & Xưng hô (Thể loại phim):</span>
          <span className="text-[11px] text-primary font-semibold">
            {translationStyle === "auto"
              ? "✨ Tự động nhận diện"
              : "Đã chọn phong cách"}
          </span>
        </label>
        <select
          value={translationStyle}
          onChange={(e) => setTranslationStyle(e.target.value)}
          className="w-full bg-surface-variant/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors font-medium text-amber-300"
        >
          <option value="auto">
            🎭 Tự động nhận diện theo cốt truyện (AI Auto-detect)
          </option>
          <option value="romance">
            💖 Ngôn tình / Đô thị (Anh - Em ngọt ngào, tự nhiên)
          </option>
          <option value="school">
            🎓 Thanh xuân / Học đường (Cậu - Tớ, Bạn - Mình)
          </option>
          <option value="wuxia">
            ⚔️ Cổ trang / Kiếm hiệp (Tại hạ, Huynh - Đệ, Sư phụ, Các hạ)
          </option>
          <option value="workplace">
            🏢 Tổng tài / Công sở (Sếp - Tôi/Em, Tôi - Cậu/Cô)
          </option>
          <option value="family">
            👨‍👩‍👧 Gia đình / Đời sống (Bố/Mẹ - Con, Vợ - Chồng, Cháu)
          </option>
          <option value="narration">
            🎙️ Kể chuyện / Review phim / Tin tức (Tôi/Mình - Các bạn)
          </option>
        </select>
        <p className="text-[10px] text-on-surface-variant/70">
          AI sẽ điều chỉnh toàn bộ đại từ xưng hô và văn phong câu thoại chuẩn
          xác theo đúng bối cảnh phim.
        </p>
      </div>

      {/* Kênh dịch thuật & Mô hình AI */}
      <div className="space-y-2.5 bg-surface-variant/25 p-3.5 rounded-2xl border border-white/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
              <span>Kênh dịch thuật AI:</span>
              <span className="text-[10px] text-primary font-semibold uppercase">
                {translationProvider}
              </span>
            </label>
            <select
              value={translationProvider}
              onChange={(e) => setTranslationProvider(e.target.value)}
              className="w-full bg-surface-variant/70 border border-primary/30 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-medium text-primary cursor-pointer"
            >
              <option value="gemini">
                Google AI Studio (Gemini - Khuyên dùng)
              </option>
              <option value="google">
                Google Dịch (Miễn phí - Không cần Key)
              </option>
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="deepseek">DeepSeek AI</option>
            </select>
          </div>

          {translationProvider === "gemini" && (
            <div className="space-y-1 animate-fadeIn">
              <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
                <span className="text-amber-300 font-semibold">
                  ✨ Mô hình Gemini:
                </span>
                <span className="text-[10px] text-primary font-mono font-semibold">
                  {geminiModel}
                </span>
              </label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full bg-surface-variant/80 border border-primary/40 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-medium text-amber-300 cursor-pointer shadow-sm"
              >
                <option value="gemini-3.5-flash-lite">
                  gemini-3.5-flash-lite (500 lượt/ngày - Mặc định & Khuyên dùng)
                </option>
                <option value="gemini-3.1-flash-lite">
                  gemini-3.1-flash-lite (500 lượt/ngày - Nhanh & Ổn định)
                </option>
              </select>
            </div>
          )}
        </div>

        {/* Chi tiết cài đặt nếu chọn Gemini */}
        {translationProvider === "gemini" && (
          <div className="space-y-2.5 pt-2 border-t border-white/5 animate-fadeIn">
            {/* API Key */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span className="flex items-center gap-1.5 text-primary font-semibold">
                  <Key className="w-3.5 h-3.5" />
                  Google AI Studio API Key:
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary/90 hover:text-primary flex items-center gap-0.5 underline font-medium"
                >
                  Lấy API Key miễn phí <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Dán mã API Key của bạn (bắt đầu bằng AIzaSy...)"
                  value={geminiApiKey}
                  onChange={(e) => {
                    setGeminiApiKey(e.target.value);
                    localStorage.setItem("gemini_api_key", e.target.value);
                    setKeyVerifyResult(null);
                  }}
                  className="flex-1 bg-surface-variant/80 border border-primary/30 focus:border-primary rounded-xl px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={handleVerifyGeminiKey}
                  disabled={isVerifyingKey || !geminiApiKey.trim()}
                  className="px-3 py-2 rounded-xl bg-primary text-black font-semibold text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
                  title="Gửi kiểm tra trực tiếp hạn mức với Google AI Studio"
                >
                  {isVerifyingKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>Kiểm tra Key</span>
                </button>
              </div>

              {keyVerifyResult && (
                <div className="space-y-2 pt-1 animate-fadeIn">
                  <div
                    className={cn(
                      "p-2.5 rounded-xl text-[11px] flex items-start gap-2 border leading-relaxed",
                      keyVerifyResult.valid
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : keyVerifyResult.message?.includes("HẾT HẠN MỨC") ||
                          keyVerifyResult.message?.includes("429")
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                        : "bg-red-500/10 text-red-400 border-red-500/30",
                    )}
                  >
                    {keyVerifyResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400 mt-0.5" />
                    ) : keyVerifyResult.message?.includes("HẾT HẠN MỨC") ||
                      keyVerifyResult.message?.includes("429") ? (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    )}
                    <span className="flex-1 font-medium">
                      {keyVerifyResult.message}
                    </span>
                  </div>

                  {keyVerifyResult.quota_details &&
                    Array.isArray(keyVerifyResult.quota_details) && (
                      <div className="bg-black/30 border border-white/10 rounded-xl p-2.5 space-y-1.5 text-[11px]">
                        <div className="text-on-surface-variant font-semibold flex items-center justify-between border-b border-white/5 pb-1">
                          <span>📊 Hạn mức mô hình (Free Tier):</span>
                          <span className="text-[10px] text-primary/80">
                            Google AI Studio
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1 pt-0.5">
                          {keyVerifyResult.quota_details.map((m: any) => (
                            <div
                              key={m.id}
                              className={cn(
                                "p-1.5 rounded-lg flex items-center justify-between border text-[10px]",
                                m.status === "ready"
                                  ? "bg-green-500/5 border-green-500/20 text-on-surface"
                                  : m.status === "quota_exceeded"
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                  : "bg-surface-variant/40 border-white/5 text-on-surface-variant",
                              )}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-primary">
                                  {m.name}
                                </span>
                                <span className="text-[9px] text-on-surface-variant">
                                  {m.rpd} • {m.rpm} • {m.tpm}
                                </span>
                              </div>
                              <div className="text-right font-medium">
                                {m.status === "ready" ? (
                                  <span className="text-green-400 flex items-center gap-1 font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                    Sẵn sàng
                                  </span>
                                ) : m.status === "quota_exceeded" ? (
                                  <span className="text-amber-400 font-bold">
                                    Hết lượt (429)
                                  </span>
                                ) : (
                                  <span className="text-on-surface-variant/60">
                                    {m.status_text || "Không khả dụng"}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Temperature slider */}
            <div className="space-y-1 pt-1 bg-black/20 p-2.5 rounded-xl border border-white/5">
              <div className="flex justify-between text-[11px] text-on-surface-variant">
                <span className="font-medium">
                  Nhiệt độ sáng tạo (Temperature):
                </span>
                <span className="font-mono text-primary font-bold">
                  {geminiTemperature}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={geminiTemperature}
                  onChange={(e) =>
                    setGeminiTemperature(parseFloat(e.target.value))
                  }
                  className="w-full accent-primary h-1.5 bg-black/40 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] font-mono text-on-surface-variant bg-black/40 px-2 py-0.5 rounded border border-white/10 shrink-0">
                  {geminiTemperature <= 0.2
                    ? "0.2 (Chuẩn kịch bản)"
                    : geminiTemperature <= 0.5
                    ? "Cân bằng"
                    : "Sáng tạo"}
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant/70">
                Mặc định 0.2: Khuyên dùng cho lồng tiếng phim — trung thành với
                kịch bản gốc, khớp nhịp, câu từ súc tích tự nhiên.
              </p>
            </div>
          </div>
        )}

        {/* Faster-Whisper Model */}
        <div className="space-y-1.5 pt-2.5 border-t border-white/10">
          <label className="text-xs font-medium text-on-surface-variant flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Mô hình tạo phụ đề gốc (Faster-Whisper STT):
            </span>
            <span className="text-[10px] text-cyan-300 font-mono font-semibold uppercase">
              {whisperModel}
            </span>
          </label>
          <select
            value={whisperModel}
            onChange={(e) => setWhisperModel(e.target.value)}
            className="w-full bg-surface-variant/80 border border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-cyan-400 font-medium text-cyan-300 cursor-pointer shadow-sm"
          >
            <option value="large-v3">
              🌟 large-v3 (Mặc định - Bản lớn đầy đủ 1.55 Tỷ tham số • Chuẩn xác
              cao nhất)
            </option>
            <option value="large-v3-turbo">
              🚀 large-v3-turbo (Siêu tốc 8x, Nhẹ & Chuẩn 98% • Colab/Local)
            </option>
            <option value="medium">
              ⚡ medium (Cân bằng & Tốc độ cao - 769 Triệu tham số)
            </option>
            <option value="small">🚀 small (Nhẹ & Nhanh - 244 Triệu tham số)</option>
            <option value="base">⏱️ base (Bản tối giản - 74 Triệu tham số)</option>
          </select>
          <p className="text-[10px] text-on-surface-variant/70">
            ⚡ <strong>large-v3</strong> là mô hình lớn nhất với 1.55 tỷ tham số,
            giải quyết triệt để lỗi từ đồng âm, nhận diện chuẩn tên riêng và tự
            động ngắt câu với dấu phẩy/chấm đầy đủ với độ chính xác cao nhất.
          </p>
        </div>
      </div>
    </div>
  );
};
