import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Scissors,
  Search,
  Check,
  X,
  Edit2,
  Trash2,
  ArrowRightLeft,
  Sparkles,
  Split,
  RotateCcw,
  ArrowDownToLine,
  Clock,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CaptionSegment, WordTiming } from "@/utils/silenceDetector";
import { batchFindAndReplace } from "@/utils/silenceDetector";
import { toast } from "sonner";

interface TranscriptDocEditorProps {
  segments: CaptionSegment[];
  currentTime: number;
  isPlaying?: boolean;
  onSeek: (time: number) => void;
  onUpdateSegments: (newSegments: CaptionSegment[]) => void;
  onOptimizeChunks?: () => void;
  isOptimizingChunks?: boolean;
  onRestoreSync?: () => void;
  hasRawSegments?: boolean;
  onUpdateTimeline?: () => void;
}

export function TranscriptDocEditor({
  segments,
  currentTime,
  isPlaying: _isPlaying,
  onSeek,
  onUpdateSegments,
  onOptimizeChunks,
  isOptimizingChunks,
  onRestoreSync,
  hasRawSegments = false,
  onUpdateTimeline,
}: TranscriptDocEditorProps) {
  // Inline Word Editing State
  const [editingWord, setEditingWord] = useState<{
    segId: number;
    wordIdx: number;
    text: string;
  } | null>(null);

  // Full Segment Editing State
  const [editingSegId, setEditingSegId] = useState<number | null>(null);
  const [editingSegText, setEditingSegText] = useState<string>("");

  // Find and Replace State
  const [showFindModal, setShowFindModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [replaceQuery, setReplaceQuery] = useState<string>("");
  const [matchCase, setMatchCase] = useState<boolean>(false);

  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Focus input khi kích hoạt double-click sửa từ
  useEffect(() => {
    if (editingWord && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingWord]);

  // ─── Word Actions ──────────────────────────────────────────────────────────
  const handleSaveWord = () => {
    if (!editingWord) return;
    const { segId, wordIdx, text } = editingWord;
    const cleanText = text.trim();

    if (!cleanText) {
      setEditingWord(null);
      return;
    }

    const lowerWord = cleanText.toLowerCase();

    const nextSegments = segments.map((seg) => {
      if (seg.id !== segId) return seg;
      const updatedWords = [...seg.words];
      if (updatedWords[wordIdx]) {
        updatedWords[wordIdx] = {
          ...updatedWords[wordIdx],
          word: lowerWord,
        };
      }
      // Đồng bộ lại text của toàn bộ segment
      const newFullText = updatedWords.map((w) => w.word.toLowerCase()).join(" ");
      return {
        ...seg,
        text: newFullText,
        words: updatedWords,
      };
    });

    onUpdateSegments(nextSegments);
    setEditingWord(null);
    toast.success("Đã cập nhật từ!");
  };

  // ─── Segment Batch Text Actions ───────────────────────────────────────────
  const handleStartEditSeg = (seg: CaptionSegment) => {
    setEditingSegId(seg.id);
    setEditingSegText(seg.text);
  };

  const handleSaveSeg = (segId: number) => {
    const cleanText = editingSegText.trim().toLowerCase();
    if (!cleanText) {
      setEditingSegId(null);
      return;
    }

    const nextSegments = segments.map((seg) => {
      if (seg.id !== segId) return seg;

      const wordsList = cleanText.split(/\s+/).filter(Boolean);
      // Tái phân bổ mốc thời gian mượt mà cho các từ mới
      const totalDuration = Math.max(0.5, seg.end - seg.start);
      const perWordDur = totalDuration / wordsList.length;

      const recomputedWords: WordTiming[] = wordsList.map((w, idx) => {
        const existing = seg.words[idx];
        if (existing) {
          return { ...existing, word: w };
        }
        return {
          word: w,
          start: Number((seg.start + idx * perWordDur).toFixed(2)),
          end: Number((seg.start + (idx + 1) * perWordDur).toFixed(2)),
        };
      });

      return {
        ...seg,
        start: recomputedWords.length > 0 ? recomputedWords[0].start : seg.start,
        end: recomputedWords.length > 0 ? recomputedWords[recomputedWords.length - 1].end : seg.end,
        text: cleanText,
        words: recomputedWords,
      };
    });

    onUpdateSegments(nextSegments);
    setEditingSegId(null);
    toast.success("Đã cập nhật câu thoại!");
  };

  // ─── Split & Delete Segment ───────────────────────────────────────────────
  const handleSplitAtWord = (segId: number, wordIdx: number) => {
    const seg = segments.find((s) => s.id === segId);
    if (!seg || seg.words.length <= 1 || wordIdx >= seg.words.length - 1)
      return;

    const firstWords = seg.words.slice(0, wordIdx + 1);
    const secondWords = seg.words.slice(wordIdx + 1);

    const firstSeg: CaptionSegment = {
      id: seg.id,
      start: firstWords[0].start,
      end: firstWords[firstWords.length - 1].end,
      text: firstWords.map((w) => w.word).join(" "),
      words: firstWords,
    };

    const secondSeg: CaptionSegment = {
      id: Date.now(),
      start: secondWords[0].start,
      end: secondWords[secondWords.length - 1].end,
      text: secondWords.map((w) => w.word).join(" "),
      words: secondWords,
    };

    const nextSegments: CaptionSegment[] = [];
    for (const s of segments) {
      if (s.id === segId) {
        nextSegments.push(firstSeg, secondSeg);
      } else {
        nextSegments.push(s);
      }
    }

    onUpdateSegments(nextSegments);
    toast.success("Đã tách câu thành công!");
  };

  const handleMergeWithNext = (segIdx: number) => {
    if (segIdx < 0 || segIdx >= segments.length - 1) return;
    const cur = segments[segIdx];
    const nxt = segments[segIdx + 1];

    const mergedWords = [...(cur.words || []), ...(nxt.words || [])];
    const mergedText = `${cur.text.trim()} ${nxt.text.trim()}`;

    const mergedSeg: CaptionSegment = {
      id: cur.id,
      start: cur.start,
      end: Math.max(cur.end, nxt.end),
      text: mergedText,
      words: mergedWords,
      customPositionY: cur.customPositionY,
    };

    const nextSegments = [
      ...segments.slice(0, segIdx),
      mergedSeg,
      ...segments.slice(segIdx + 2),
    ];

    onUpdateSegments(nextSegments);
    toast.success(
      `Đã gộp đoạn #${segIdx + 1} và #${segIdx + 2} thành một câu!`,
    );
  };

  const handleDeleteSegment = (segId: number) => {
    const next = segments.filter((s) => s.id !== segId);
    onUpdateSegments(next);
    toast.info("Đã xóa câu thoại");
  };

  // ─── Shift Word to Prev / Next Segment (Tự động co giãn timeline) ──────────
  const handleShiftWordToPrev = (segIdx: number) => {
    if (segIdx <= 0 || segIdx >= segments.length) return;
    const curSeg = segments[segIdx];
    const prevSeg = segments[segIdx - 1];

    if (!curSeg.words || curSeg.words.length === 0) return;

    // Lấy từ đầu tiên của câu hiện tại
    const wordToShift = curSeg.words[0];
    const remainingCurWords = curSeg.words.slice(1);
    const newPrevWords = [...(prevSeg.words || []), wordToShift];

    // Cập nhật câu trước
    const updatedPrevSeg: CaptionSegment = {
      ...prevSeg,
      words: newPrevWords,
      start: newPrevWords[0].start,
      end: newPrevWords[newPrevWords.length - 1].end,
      text: newPrevWords.map((w) => w.word).join(" "),
    };

    const nextSegments = [...segments];
    nextSegments[segIdx - 1] = updatedPrevSeg;

    // Nếu câu hiện tại hết từ, xóa câu hiện tại; nếu còn từ thì cập nhật
    if (remainingCurWords.length === 0) {
      nextSegments.splice(segIdx, 1);
      toast.success(`Đã chuyển từ "${wordToShift.word}" lên câu trước và gộp câu!`);
    } else {
      const updatedCurSeg: CaptionSegment = {
        ...curSeg,
        words: remainingCurWords,
        start: remainingCurWords[0].start,
        end: remainingCurWords[remainingCurWords.length - 1].end,
        text: remainingCurWords.map((w) => w.word).join(" "),
      };
      nextSegments[segIdx] = updatedCurSeg;
      toast.success(`Đã chuyển từ "${wordToShift.word}" lên câu trước (Timeline tự khớp)!`);
    }

    onUpdateSegments(nextSegments);
  };

  const handleShiftWordToNext = (segIdx: number) => {
    if (segIdx < 0 || segIdx >= segments.length - 1) return;
    const curSeg = segments[segIdx];
    const nextSeg = segments[segIdx + 1];

    if (!curSeg.words || curSeg.words.length === 0) return;

    // Lấy từ cuối cùng của câu hiện tại
    const wordToShift = curSeg.words[curSeg.words.length - 1];
    const remainingCurWords = curSeg.words.slice(0, -1);
    const newNextWords = [wordToShift, ...(nextSeg.words || [])];

    // Cập nhật câu sau
    const updatedNextSeg: CaptionSegment = {
      ...nextSeg,
      words: newNextWords,
      start: newNextWords[0].start,
      end: newNextWords[newNextWords.length - 1].end,
      text: newNextWords.map((w) => w.word).join(" "),
    };

    const nextSegments = [...segments];
    nextSegments[segIdx + 1] = updatedNextSeg;

    // Nếu câu hiện tại hết từ, xóa câu hiện tại; nếu còn từ thì cập nhật
    if (remainingCurWords.length === 0) {
      nextSegments.splice(segIdx, 1);
      toast.success(`Đã chuyển từ "${wordToShift.word}" xuống câu sau và gộp câu!`);
    } else {
      const updatedCurSeg: CaptionSegment = {
        ...curSeg,
        words: remainingCurWords,
        start: remainingCurWords[0].start,
        end: remainingCurWords[remainingCurWords.length - 1].end,
        text: remainingCurWords.map((w) => w.word).join(" "),
      };
      nextSegments[segIdx] = updatedCurSeg;
      toast.success(`Đã chuyển từ "${wordToShift.word}" xuống câu sau (Timeline tự khớp)!`);
    }

    onUpdateSegments(nextSegments);
  };

  // ─── Find & Replace Execution ─────────────────────────────────────────────
  const handleExecuteReplace = () => {
    if (!searchQuery.trim()) {
      toast.error("Vui lòng nhập từ khóa cần tìm");
      return;
    }

    const updated = batchFindAndReplace(
      segments,
      searchQuery.trim(),
      replaceQuery.trim(),
      matchCase,
    );
    onUpdateSegments(updated);
    setShowFindModal(false);
    toast.success(`Đã thay thế tất cả từ khóa "${searchQuery}"`);
  };

  return (
    <div className="bg-surface/70 backdrop-blur-md rounded-2xl border border-white/10 p-3 flex flex-col h-full overflow-hidden select-text">
      {/* ─── Header Toolbar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-on-surface-variant font-mono">
            {segments.length} đoạn
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Nút Cập nhật Timeline Caption */}
          {onUpdateTimeline && segments.length > 0 && (
            <button
              onClick={onUpdateTimeline}
              className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition font-semibold shadow-xs"
              title="Cập nhật và tính toán lại mốc thời gian phụ đề, chống lệch tiếng sau khi gộp/tách câu"
            >
              <Clock className="w-3 h-3 text-emerald-400" />
              <span>Cập nhật Timeline</span>
            </button>
          )}

          {/* Nút Tìm & Thay Thế */}
          <button
            onClick={() => setShowFindModal(true)}
            className="flex items-center gap-1 text-[12px] px-2 py-1 rounded-md bg-surface-variant/40 hover:bg-surface-variant border border-white/10 text-on-surface transition font-medium cursor-pointer"
            title="Tìm kiếm và thay thế nhanh từ ngữ bị AI nhận diện sai"
          >
            <Search className="w-3 h-3 text-primary" />
            <span className="hidden sm:inline">Tìm/Sửa</span>
          </button>

          {/* Nút Tối ưu Chia câu ngắn */}
          {onOptimizeChunks && segments.length > 0 && (
            <button
              onClick={onOptimizeChunks}
              disabled={isOptimizingChunks}
              className="flex items-center gap-1 text-[12px] text-primary hover:text-primary-fixed-dim px-2 py-1 rounded-md bg-primary/10 border border-primary/20 transition disabled:opacity-40 font-medium"
              title="Tự động chia câu dài thành các câu 4-9 từ chuẩn ngắn gọn"
            >
              <Scissors className="w-3 h-3" />
              <span className="hidden sm:inline">Chia ngắn</span>
            </button>
          )}

          {/* Nút Khôi Phục Phụ Đề Gốc (Nếu có) */}
          {hasRawSegments && onRestoreSync && (
            <button
              onClick={onRestoreSync}
              className="flex items-center gap-1 text-[12px] px-2 py-1 rounded-md bg-surface-variant/30 hover:bg-surface-variant/60 border border-white/10 text-on-surface-variant hover:text-on-surface transition font-medium cursor-pointer"
              title="Khôi phục lại toàn bộ mốc thời gian và nội dung phụ đề gốc ban đầu"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span className="hidden xl:inline">Khôi phục</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Document Transcript Flow ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 scrollbar-thin scrollbar-thumb-white/10">
        {segments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-on-surface-variant space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-surface-variant/30 flex items-center justify-center text-primary/70 border border-white/5">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface">
                Chưa có văn bản lời thoại
              </p>
              <p className="text-xs text-on-surface-variant mt-1 max-w-xs">
                Nhấn vào nút "Tạo Phụ Đề AI" phía trên để chuyển hóa giọng nói
                video thành văn bản tương tác dạng Descript
              </p>
            </div>
          </div>
        ) : (
          segments.map((seg, segIdx) => {
            const isSegActive =
              currentTime >= seg.start - 0.05 && currentTime <= seg.end + 0.1;
            const isEditingThisSeg = editingSegId === seg.id;

            return (
              <div
                key={seg.id}
                className={cn(
                  "p-2.5 rounded-xl border transition-all duration-200 group/seg relative",
                  isSegActive
                    ? "bg-primary/10 border-primary/40 shadow-sm ring-1 ring-primary/20"
                    : "bg-surface-variant/15 border-white/5 hover:border-white/15",
                )}
              >
                {/* Paragraph Meta Header */}
                <div className="flex items-center justify-between text-[11px] mb-1.5 pb-1 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSeek(seg.start)}
                      className="flex items-center gap-1 font-mono text-primary hover:underline font-semibold text-[10px]"
                      title="Nhấp để phát từ mốc thời gian này"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                    </button>
                    <span className="text-[9px] text-on-surface-variant/60 font-mono">
                      #{segIdx + 1} ({seg.words?.length || 0} từ)
                    </span>
                  </div>

                  {/* Actions on Segment */}
                  <div className="flex items-center gap-1 opacity-0 group-hover/seg:opacity-100 transition-opacity">
                    {/* Nút Đẩy 1 từ lên câu trước */}
                    {segIdx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleShiftWordToPrev(segIdx)}
                        className="px-1.5 py-0.5 hover:bg-primary/20 text-on-surface-variant hover:text-primary transition rounded flex items-center gap-0.5 text-[10px] font-mono border border-white/5 cursor-pointer"
                        title={`Đẩy từ "${seg.words?.[0]?.word || ""}" lên câu trước (Timeline tự khớp)`}
                      >
                        <ArrowUp className="w-2.5 h-2.5" />
                        <span className="hidden sm:inline">Lên</span>
                      </button>
                    )}

                    {/* Nút Đẩy 1 từ xuống câu sau */}
                    {segIdx < segments.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleShiftWordToNext(segIdx)}
                        className="px-1.5 py-0.5 hover:bg-primary/20 text-on-surface-variant hover:text-primary transition rounded flex items-center gap-0.5 text-[10px] font-mono border border-white/5 cursor-pointer"
                        title={`Đẩy từ "${seg.words?.[seg.words.length - 1]?.word || ""}" xuống câu sau (Timeline tự khớp)`}
                      >
                        <span className="hidden sm:inline">Xuống</span>
                        <ArrowDown className="w-2.5 h-2.5" />
                      </button>
                    )}

                    {segIdx < segments.length - 1 && (
                      <button
                        onClick={() => handleMergeWithNext(segIdx)}
                        className="p-1 hover:text-amber-400 transition rounded text-on-surface-variant cursor-pointer"
                        title="Gộp với câu kế tiếp"
                      >
                        <ArrowDownToLine className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() =>
                        isEditingThisSeg
                          ? handleSaveSeg(seg.id)
                          : handleStartEditSeg(seg)
                      }
                      className="p-1 hover:text-primary transition rounded text-on-surface-variant"
                      title={isEditingThisSeg ? "Lưu câu này" : "Sửa cả câu"}
                    >
                      {isEditingThisSeg ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Edit2 className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteSegment(seg.id)}
                      className="p-1 hover:text-rose-400 transition rounded text-on-surface-variant"
                      title="Xóa câu này"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Paragraph Text Mode / Edit Mode */}
                {isEditingThisSeg ? (
                  <div className="space-y-1.5">
                    <textarea
                      rows={2}
                      value={editingSegText}
                      onChange={(e) => setEditingSegText(e.target.value)}
                      className="w-full bg-surface-variant/60 border border-primary/50 rounded-lg p-2 text-xs text-on-surface focus:outline-none leading-relaxed"
                      placeholder="Nhập nội dung câu..."
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditingSegId(null)}
                        className="px-2 py-0.5 text-[10px] text-on-surface-variant hover:text-on-surface"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => handleSaveSeg(seg.id)}
                        className="px-2.5 py-0.5 text-[10px] bg-primary text-on-primary rounded font-medium shadow"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Interactive Words Flow */
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-relaxed text-xs">
                    {(seg.words || []).map((w, wIdx) => {
                      const isWordActive =
                        currentTime >= w.start && currentTime <= w.end;
                      const isWordBeingEdited =
                        editingWord?.segId === seg.id &&
                        editingWord?.wordIdx === wIdx;

                      if (isWordBeingEdited) {
                        return (
                          <span
                            key={wIdx}
                            className="inline-flex items-center gap-0.5 bg-surface-variant border border-primary rounded px-1"
                          >
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editingWord.text}
                              onChange={(e) =>
                                setEditingWord({
                                  ...editingWord,
                                  text: e.target.value,
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveWord();
                                if (e.key === "Escape") setEditingWord(null);
                              }}
                              className="bg-transparent text-xs text-on-surface focus:outline-none w-20 px-0.5 font-medium"
                            />
                            <button
                              onClick={handleSaveWord}
                              className="hover:text-emerald-400 p-0.5"
                              title="Lưu (Enter)"
                            >
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            </button>
                            <button
                              onClick={() => setEditingWord(null)}
                              className="hover:text-rose-400 p-0.5"
                              title="Hủy (Esc)"
                            >
                              <X className="w-2.5 h-2.5 text-rose-400" />
                            </button>
                          </span>
                        );
                      }

                      return (
                        <React.Fragment key={wIdx}>
                          <span
                            onClick={() => onSeek(w.start)}
                            onDoubleClick={() =>
                              setEditingWord({
                                segId: seg.id,
                                wordIdx: wIdx,
                                text: w.word,
                              })
                            }
                            className={cn(
                              "cursor-pointer rounded px-1 -mx-0.5 py-0.5 transition-all duration-100 select-none group/word relative inline-block",
                              isWordActive
                                ? "bg-primary text-on-primary font-bold shadow-sm scale-105"
                                : "text-on-surface hover:bg-surface-variant/70 hover:text-primary",
                            )}
                            title={`Mốc: ${w.start}s - ${w.end}s (Nhấp đúp để sửa từ)`}
                          >
                            {w.word}

                            {/* Split indicator on word hover */}
                            {wIdx < seg.words.length - 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSplitAtWord(seg.id, wIdx);
                                }}
                                className="absolute -right-1.5 -top-2 opacity-0 group-hover/word:opacity-100 p-0.5 bg-black/80 hover:bg-primary text-white rounded-full transition z-20"
                                title="Tách câu tại đây"
                              >
                                <Split className="w-2 h-2" />
                              </button>
                            )}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ─── Modal Tìm Kiếm & Thay Thế (Find & Replace Dialog) ─────────────── */}
      {showFindModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
            <div className="bg-surface border border-white/15 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/20 text-primary">
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">
                      Tìm kiếm & Thay thế
                    </h3>
                    <p className="text-[11px] text-on-surface-variant">
                      Sửa hàng loạt từ khóa AI nghe nhầm trên toàn bài
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFindModal(false)}
                  className="p-1 text-on-surface-variant hover:text-on-surface transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-on-surface-variant">
                    Từ cần tìm:
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ví dụ: Tech Lab..."
                    className="w-full px-3 py-2 rounded-xl bg-surface-variant/50 border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary/50"
                    autoFocus
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-on-surface-variant">
                    Thay thế bằng:
                  </label>
                  <input
                    type="text"
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    placeholder="Ví dụ: Technical Lab..."
                    className="w-full px-3 py-2 rounded-xl bg-surface-variant/50 border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary/50"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={matchCase}
                    onChange={(e) => setMatchCase(e.target.checked)}
                    className="rounded border-white/20 text-primary focus:ring-primary"
                  />
                  <span>Phân biệt chữ hoa / chữ thường</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  onClick={() => setShowFindModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs text-on-surface-variant hover:text-on-surface transition"
                >
                  Hủy
                </button>
                <button
                  onClick={handleExecuteReplace}
                  disabled={!searchQuery.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary font-semibold text-xs transition shadow-lg disabled:opacity-40"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Thay thế tất cả</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
