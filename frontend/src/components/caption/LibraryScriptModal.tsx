import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FolderOpen,
  Search,
  Check,
  X,
  Play,
  Pause,
  Clock,
  Sparkles,
  FileText,
  Volume2,
  Folder,
} from "lucide-react";
import { useTTSStore, type AudioRecord } from "@/store/useTTSStore";
import { cn } from "@/lib/utils";

interface LibraryScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScript: (scriptText: string, record?: AudioRecord) => void;
}

export function LibraryScriptModal({
  isOpen,
  onClose,
  onSelectScript,
}: LibraryScriptModalProps) {
  const { history, projects } = useTTSStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!isOpen) return null;

  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

  const filteredHistory = sortedHistory.filter((item) => {
    if (selectedProjectId !== "all" && item.projectId !== selectedProjectId) {
      return false;
    }
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const projName = projects.find((p) => p.id === item.projectId)?.name || "";
    return (
      item.text.toLowerCase().includes(q) ||
      (item.voiceName && item.voiceName.toLowerCase().includes(q)) ||
      projName.toLowerCase().includes(q)
    );
  });

  const handleTogglePlayAudio = (record: AudioRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingId === record.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(record.url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingId(null);
      setPlayingId(record.id);
    }
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(null);
    onClose();
  };

  const handleSelect = (record: AudioRecord) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(null);
    onSelectScript(record.text, record);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-surface border border-white/15 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-surface-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                <span>Chọn Kịch bản từ Thư viện</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-medium">
                  {history.length} kịch bản
                </span>
              </h3>
              <p className="text-xs text-on-surface-variant">
                Lấy lại nội dung bài đọc từ Thư viện / Phòng thu để Whisper AI
                đối chiếu chính tả 100%
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 border-b border-white/5 bg-surface/50 shrink-0 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm kịch bản, giọng đọc, dự án..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface-variant/40 border border-white/10 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/60 transition"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {projects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface-variant/80 border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary/60 transition cursor-pointer"
            >
              <option value="all">📁 Tất cả dự án ({history.length})</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* List of Audio Records */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
          {history.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-variant/40 flex items-center justify-center text-primary mx-auto border border-white/5">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-on-surface">
                Thư viện chưa có bản ghi âm nào
              </p>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
                Hãy chuyển sang trang <strong>Phòng thu</strong> để chuyển kịch
                bản từ text sang giọng nói trước.
              </p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant text-xs italic">
              Không tìm thấy kịch bản nào khớp với "{searchTerm}"
            </div>
          ) : (
            filteredHistory.map((record, index) => {
              const isPlayingThis = playingId === record.id;
              const dateStr = new Date(record.timestamp).toLocaleString(
                "vi-VN",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                },
              );

              const proj = projects.find((p) => p.id === record.projectId);

              return (
                <div
                  key={record.id}
                  onClick={() => handleSelect(record)}
                  className="p-3.5 rounded-xl border border-white/10 hover:border-amber-500/50 bg-surface-variant/20 hover:bg-surface-variant/50 transition-all duration-150 flex flex-col gap-2.5 cursor-pointer group shadow-xs"
                >
                  {/* Item Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md">
                        #{index + 1}
                      </span>
                      {proj && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30">
                          <Folder className="w-2.5 h-2.5" />
                          <span>{proj.name}</span>
                        </span>
                      )}
                      {record.voiceName && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-white bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                          <Volume2 className="w-3 h-3 text-cyan-400" />
                          <span>{record.voiceName}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-on-surface-variant font-mono">
                        <Clock className="w-3 h-3 opacity-60" />
                        <span>{dateStr}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Nút nghe thử voice */}
                      {record.url && (
                        <button
                          type="button"
                          onClick={(e) => handleTogglePlayAudio(record, e)}
                          className={cn(
                            "p-1.5 rounded-lg border transition text-xs flex items-center gap-1 cursor-pointer",
                            isPlayingThis
                              ? "bg-primary text-on-primary border-primary"
                              : "bg-surface-variant/40 hover:bg-surface-variant border-white/10 text-on-surface",
                          )}
                          title={
                            isPlayingThis
                              ? "Tạm dừng nghe thử"
                              : "Nghe thử giọng đọc này"
                          }
                        >
                          {isPlayingThis ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </button>
                      )}

                      {/* Nút chọn kịch bản */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(record);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary font-semibold text-xs transition shadow-sm flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Chọn kịch bản</span>
                      </button>
                    </div>
                  </div>

                  {/* Kịch bản văn bản */}
                  <p className="text-xs text-on-surface leading-relaxed line-clamp-3 group-hover:text-white transition-colors">
                    "{record.text}"
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-on-surface-variant pt-1 border-t border-white/5">
                    <span>
                      {record.text.length} ký tự •{" "}
                      {record.text.trim().split(/\s+/).length} từ
                    </span>
                    <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 font-medium">
                      <span>Nhấp để nạp vào kịch bản</span>
                      <Sparkles className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-white/10 flex items-center justify-between bg-surface-variant/20 text-xs shrink-0">
          <span className="text-on-surface-variant text-[11px]">
            💡 Sau khi chọn, nội dung sẽ được nạp tự động vào ô Kịch bản đọc đối
            chiếu.
          </span>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 rounded-xl border border-white/10 hover:bg-surface-variant text-on-surface transition font-medium cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
