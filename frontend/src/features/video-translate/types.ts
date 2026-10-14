export const STEP_LABELS: Record<string, { label: string; icon: string }> = {
  extracting: { label: "Tách âm thanh & Nhạc nền", icon: "🎵" },
  transcribing: { label: "Tạo phụ đề gốc (Faster-Whisper)", icon: "🎙️" },
  waiting_manual_translation: { label: "Chờ nạp phụ đề dịch (.srt)", icon: "✍️" },
  review_original: { label: "Tạm dừng duyệt câu gốc", icon: "⏸️" },
  translating: { label: "Dịch thuật phụ đề AI", icon: "🌐" },
  dubbing: { label: "Lồng tiếng tự động (Voice Dubbing)", icon: "🗣️" },
  aligning: { label: "Khớp lời thoại & Hòa âm (Lip-sync)", icon: "⚡" },
  rendering: { label: "Ghép phụ đề & Render Video MP4", icon: "🎬" },
  completed: { label: "Hoàn tất thành phẩm", icon: "✅" },
  failed: { label: "Có lỗi xảy ra", icon: "❌" },
};

export const PIPELINE_STEPS = [
  { key: "extracting", label: "Tách Audio & BGM", icon: "🎵", minProg: 0, maxProg: 15 },
  { key: "transcribing", label: "Tạo Phụ Đề Gốc", icon: "🎙️", minProg: 15, maxProg: 40 },
  { key: "translating", label: "Dịch Thuật AI Phim", icon: "🌐", minProg: 40, maxProg: 55 },
  { key: "dubbing", label: "Lồng Tiếng Từng Câu", icon: "🗣️", minProg: 55, maxProg: 75 },
  { key: "aligning", label: "Khớp Timeline & Hòa Âm", icon: "⚡", minProg: 75, maxProg: 85 },
  { key: "rendering", label: "Render Video MP4", icon: "🎬", minProg: 85, maxProg: 100 },
];
