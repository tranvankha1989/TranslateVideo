import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  X,
  Plus,
  Trash2,
  Search,
  Brain,
  Sparkles,
  BookOpen,
  ArrowRight,
  Loader2,
  Save,
} from "lucide-react";

interface MemoryItem {
  id: string;
  source_text: string;
  ai_translated?: string;
  user_corrected: string;
  source_lang?: string;
  target_lang?: string;
  use_count?: number;
  updated_at?: string;
}

interface TranslationMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemoryChanged?: () => void;
}

export const TranslationMemoryModal: React.FC<TranslationMemoryModalProps> = ({
  isOpen,
  onClose,
  onMemoryChanged,
}) => {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Form thêm thủ công
  const [newSource, setNewSource] = useState("");
  const [newCorrected, setNewCorrected] = useState("");
  const [newAi, setNewAi] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMemories = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/video-translate/memory?limit=300");
      const data = await res.json();
      if (res.ok && data.items) {
        setItems(data.items);
      }
    } catch (e: any) {
      toast.error("Lỗi khi tải bộ nhớ dịch thuật: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/video-translate/memory/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Đã xóa câu khỏi bộ nhớ học tập của AI");
        setItems((prev) => prev.filter((it) => it.id !== id));
        onMemoryChanged?.();
      }
    } catch (e: any) {
      toast.error("Lỗi xóa: " + e.message);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa toàn bộ bộ nhớ tự học của AI không?")) {
      return;
    }
    try {
      const res = await fetch("http://localhost:8000/api/video-translate/memory", {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Đã làm trống toàn bộ bộ nhớ tự học!");
        setItems([]);
        onMemoryChanged?.();
      }
    } catch (e: any) {
      toast.error("Lỗi xóa toàn bộ: " + e.message);
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSource.trim() || !newCorrected.trim()) {
      toast.error("Vui lòng nhập câu gốc và bản dịch chuẩn!");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("http://localhost:8000/api/video-translate/memory/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_text: newSource.trim(),
          user_corrected: newCorrected.trim(),
          ai_translated: newAi.trim(),
          source_lang: "zh",
          target_lang: "vi",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("🧠 Đã nạp bài học mới vào bộ nhớ của AI!");
        setNewSource("");
        setNewCorrected("");
        setNewAi("");
        setShowAddForm(false);
        fetchMemories();
        onMemoryChanged?.();
      } else {
        toast.error(data.detail || "Không thể thêm bài học");
      }
    } catch (e: any) {
      toast.error("Lỗi thêm bài học: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = items.filter((it) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      it.source_text.toLowerCase().includes(q) ||
      it.user_corrected.toLowerCase().includes(q) ||
      (it.ai_translated && it.ai_translated.toLowerCase().includes(q))
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-surface border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-on-surface">Bộ Nhớ Tự Học Của AI (Translation Memory)</h3>
                <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">
                  {items.length} bài học
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Mỗi khi bạn sửa phụ đề và bấm Lưu, AI sẽ tự động ghi nhớ và ưu tiên áp dụng cho các video sau.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Tìm kiếm & Nút hành động */}
        <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-surface/30">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Tìm theo câu gốc hoặc câu dịch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddForm ? "Đóng form" : "Dạy thủ công"}</span>
            </button>

            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                title="Xóa toàn bộ kinh nghiệm đã học"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả</span>
              </button>
            )}
          </div>
        </div>

        {/* Form thêm quy tắc thủ công */}
        {showAddForm && (
          <form onSubmit={handleAddManual} className="p-4 bg-purple-500/5 border-b border-purple-500/20 space-y-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
              <Sparkles className="w-4 h-4" />
              <span>Dạy AI cách dịch một từ / cụm từ / câu mới</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-on-surface-variant mb-1">
                  1. Câu hoặc từ ngữ tiếng gốc (Trung / Anh):
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: 徐小姐"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-purple-500/50"
                />
              </div>

              <div>
                <label className="block text-[11px] text-green-400 mb-1 font-medium">
                  2. Bản dịch chuẩn bạn muốn AI luôn dịch sang:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Từ tiểu thư (hoặc Cô Từ)"
                  value={newCorrected}
                  onChange={(e) => setNewCorrected(e.target.value)}
                  className="w-full px-3 py-2 bg-black/50 border border-green-500/30 rounded-xl text-xs text-on-surface focus:outline-none focus:border-green-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-on-surface-variant mb-1">
                3. Cách dịch sai trước đây cần tránh (không bắt buộc):
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Tiểu thư họ Từ"
                value={newAi}
                onChange={(e) => setNewAi(e.target.value)}
                className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-on-surface-variant hover:bg-white/5 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-purple-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Lưu vào bộ nhớ AI
              </button>
            </div>
          </form>
        )}

        {/* Danh sách các bài học */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <span className="text-xs">Đang tải danh sách bài học...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center text-on-surface-variant">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-on-surface-variant/50">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-semibold text-on-surface">Chưa có bài học nào trong bộ nhớ</p>
                <p className="text-xs text-on-surface-variant/80">
                  Khi bạn chỉnh sửa câu thoại trong file phụ đề SRT và bấm <b>"Lưu phụ đề"</b>, hệ thống sẽ tự động học các câu đó và lưu vào đây!
                </p>
              </div>
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-3.5 rounded-2xl bg-black/40 border border-white/5 hover:border-purple-500/30 transition-all flex items-start justify-between gap-4 group"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                      Bài học #{filteredItems.length - idx}
                    </span>
                    {item.updated_at && (
                      <span className="text-[10px] text-on-surface-variant/60 font-mono">
                        {item.updated_at}
                      </span>
                    )}
                    {item.use_count && item.use_count > 1 && (
                      <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded font-mono">
                        Lặp lại {item.use_count} lần
                      </span>
                    )}
                  </div>

                  {/* Câu gốc */}
                  <div className="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="font-semibold text-on-surface/80 shrink-0">Bản gốc:</span>
                    <span className="text-white/90 font-sans truncate">{item.source_text}</span>
                  </div>

                  {/* Câu dịch sai ban đầu (nếu có) */}
                  {item.ai_translated && item.ai_translated !== item.user_corrected && (
                    <div className="text-[11px] text-red-400/80 flex items-center gap-1.5">
                      <span className="shrink-0 font-medium">Bản cũ AI dịch sai:</span>
                      <span className="line-through truncate">{item.ai_translated}</span>
                    </div>
                  )}

                  {/* Câu chuẩn người dùng sửa */}
                  <div className="text-xs font-semibold text-green-400 flex items-center gap-1.5">
                    <span className="shrink-0 flex items-center gap-1 text-green-300">
                      <ArrowRight className="w-3.5 h-3.5" /> Bản chuẩn bạn dạy:
                    </span>
                    <span className="truncate">{item.user_corrected}</span>
                  </div>
                </div>

                {/* Nút xóa */}
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-xl text-on-surface-variant/40 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                  title="Xóa bài học này"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-surface/50 flex items-center justify-between">
          <span className="text-[11px] text-on-surface-variant/80">
            💡 AI sẽ tự động tham khảo bộ nhớ này khi dịch bất kỳ video nào trong tương lai.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-on-surface text-xs font-semibold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
