import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  RefreshCw,
  Plus,
  Loader2,
  ListFilter,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const AdFilterTab: React.FC = () => {
  const [adRules, setAdRules] = useState<string[]>([]);
  const [isLoadingAdRules, setIsLoadingAdRules] = useState(false);
  const [newAdPhrase, setNewAdPhrase] = useState("");
  const [isAddingAdRule, setIsAddingAdRule] = useState(false);
  const [adRuleSearch, setAdRuleSearch] = useState("");

  const fetchAdRules = async () => {
    setIsLoadingAdRules(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/ad-filter-rules",
      );
      if (res.ok) {
        const data = await res.json();
        setAdRules(data.rules || []);
      }
    } catch (err) {
      console.warn("Lỗi khi tải quy tắc lọc quảng cáo:", err);
    } finally {
      setIsLoadingAdRules(false);
    }
  };

  useEffect(() => {
    fetchAdRules();
  }, []);

  const handleAddAdRule = async (phraseToAdd?: string) => {
    const p = (phraseToAdd !== undefined ? phraseToAdd : newAdPhrase).trim();
    if (!p) {
      toast.error("Vui lòng nhập câu hoặc từ khóa cần lọc.");
      return;
    }
    setIsAddingAdRule(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/ad-filter-rules/add",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phrase: p }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setAdRules(data.rules || []);
        setNewAdPhrase("");
        toast.success(`Đã dạy cho AI bỏ qua: "${p}"`);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Không thể thêm quy tắc.");
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    } finally {
      setIsAddingAdRule(false);
    }
  };

  const handleDeleteAdRule = async (phraseToDelete: string) => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/settings/ad-filter-rules/delete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phrase: phraseToDelete }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setAdRules(data.rules || []);
        toast.success(`Đã xóa quy tắc: "${phraseToDelete}"`);
      } else {
        toast.error("Không thể xóa quy tắc.");
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Card Hero: Dạy AI & Cấu Hình Bộ Lọc */}
      <div className="p-6 md:p-8 rounded-3xl bg-surface-variant/40 border border-white/10 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Bộ Lọc Thông Minh & Dạy AI</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-on-surface">
              Lọc Câu Quảng Cáo & Từ Khóa Cần Bỏ Qua
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant max-w-2xl leading-relaxed">
              Khi bóc tách phụ đề và dịch video tự động, AI sẽ tự động phát
              hiện và <strong>bỏ qua không đọc các câu quảng cáo</strong>, kêu
              gọi like/share hoặc giới thiệu nguồn ngoài mà người khác chèn vào.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchAdRules()}
            disabled={isLoadingAdRules}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-medium border border-white/10 flex items-center gap-2 transition-all cursor-pointer w-fit shrink-0"
          >
            <RefreshCw
              className={cn(
                "w-3.5 h-3.5",
                isLoadingAdRules && "animate-spin text-primary",
              )}
            />
            <span>Tải lại</span>
          </button>
        </div>

        {/* Input Form: Dạy thêm từ/câu mới */}
        <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4">
          <label className="text-xs font-bold text-on-surface flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Dạy thêm câu văn hoặc cụm từ quảng cáo mới cho AI:
          </label>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              value={newAdPhrase}
              onChange={(e) => setNewAdPhrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddAdRule();
                }
              }}
              placeholder="Ví dụ: Cảm ơn các bạn đã xem video, Link mua hàng bên dưới..."
              className="w-full flex-1 px-4 py-3 rounded-xl bg-surface-container-lowest/90 border border-white/10 focus:border-primary/50 text-on-surface text-sm placeholder:text-on-surface-variant/40 outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => handleAddAdRule()}
              disabled={isAddingAdRule || !newAdPhrase.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-black font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 shrink-0 cursor-pointer"
            >
              {isAddingAdRule ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Dạy cho AI</span>
            </button>
          </div>

          {/* Quick Preset Chips */}
          <div className="space-y-2 pt-2">
            <span className="text-[11px] font-medium text-on-surface-variant block">
              Gợi ý câu quảng cáo phổ biến (bấm để thêm nhanh):
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                "Hãy like và subscribe kênh",
                "Xem thêm tại link dưới mô tả",
                "Phụ đề được dịch bởi",
                "Quảng cáo tài trợ bởi",
                "Nhớ bấm chuông thông báo",
                "Chúc các bạn một ngày vui vẻ",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAddAdRule(chip)}
                  className="px-3 py-1 rounded-lg bg-white/5 hover:bg-primary/20 text-on-surface-variant hover:text-primary border border-white/10 hover:border-primary/30 text-xs transition-all cursor-pointer"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Danh sách các quy tắc AI đã học */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-on-surface">
                Danh sách câu/từ khóa đang áp dụng ({adRules.length}):
              </span>
            </div>

            {/* Search in rules */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-on-surface-variant/60 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={adRuleSearch}
                onChange={(e) => setAdRuleSearch(e.target.value)}
                placeholder="Tìm kiếm từ khóa..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-lowest/80 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/40 outline-none"
              />
            </div>
          </div>

          {isLoadingAdRules ? (
            <div className="p-8 text-center text-on-surface-variant text-xs flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Đang tải dữ liệu quy tắc...</span>
            </div>
          ) : adRules.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-black/20 border border-dashed border-white/10 text-on-surface-variant text-xs space-y-1">
              <p className="font-semibold text-on-surface">
                Chưa có quy tắc lọc nào được lưu.
              </p>
              <p>
                Hãy nhập câu văn hoặc từ khóa quảng cáo ở trên để dạy cho AI bỏ
                qua.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
              {adRules
                .filter(
                  (r) =>
                    !adRuleSearch ||
                    r.toLowerCase().includes(adRuleSearch.toLowerCase()),
                )
                .map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-surface-container-lowest/90 border border-white/10 flex items-center justify-between gap-3 group hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-white/5 text-on-surface-variant text-[11px] font-mono flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span
                        className="text-xs font-medium text-on-surface truncate"
                        title={rule}
                      >
                        {rule}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAdRule(rule)}
                      className="p-1.5 rounded-lg text-on-surface-variant hover:text-red-400 hover:bg-red-400/10 opacity-70 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                      title="Xóa câu này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
