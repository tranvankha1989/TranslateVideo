import React, { useState } from "react";
import { createPortal } from "react-dom";
import { FolderPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "../../store/useTTSStore";

interface SaveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  studioBlocksCount: number;
  projects: Project[];
  onSave: (params: {
    tab: "new" | "existing";
    newTitle: string;
    newNotes: string;
    targetProjectId: string;
    mode: "append" | "replace";
  }) => void;
}

export const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  onClose,
  studioBlocksCount,
  projects,
  onSave,
}) => {
  const [saveProjectTab, setSaveProjectTab] = useState<"new" | "existing">(
    "new",
  );
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectNotes, setNewProjectNotes] = useState("");
  const [targetExistingProjectId, setTargetExistingProjectId] =
    useState<string>(projects[0]?.id || "");
  const [saveExistingMode, setSaveExistingMode] = useState<
    "append" | "replace"
  >("append");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (saveProjectTab === "new") {
      if (!newProjectTitle.trim()) {
        toast.error("Vui lòng nhập tên dự án mới");
        return;
      }
      onSave({
        tab: "new",
        newTitle: newProjectTitle.trim(),
        newNotes: newProjectNotes.trim(),
        targetProjectId: "",
        mode: "append",
      });
      setNewProjectTitle("");
      setNewProjectNotes("");
    } else {
      if (!targetExistingProjectId) {
        toast.error("Vui lòng chọn một dự án từ danh sách");
        return;
      }
      onSave({
        tab: "existing",
        newTitle: "",
        newNotes: "",
        targetProjectId: targetExistingProjectId,
        mode: saveExistingMode,
      });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="glass-card rounded-2xl max-w-lg w-full p-6 border border-white/10 shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-label-caps text-sm text-on-surface font-semibold">
                Lưu kịch bản vào Dự án
              </h3>
              <p className="text-[11px] text-on-surface-variant/70">
                Chuyển {studioBlocksCount} phân đoạn câu hiện tại vào thư viện
                Dự án
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-on-surface-variant transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab chuyển đổi: Tạo mới vs Thêm vào có sẵn */}
        <div className="flex rounded-xl bg-surface-dim p-1 border border-white/10 shadow-inner">
          <button
            type="button"
            onClick={() => setSaveProjectTab("new")}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-label-caps font-medium transition-all ${
              saveProjectTab === "new"
                ? "bg-primary text-black font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Tạo dự án mới
          </button>
          <button
            type="button"
            onClick={() => {
              setSaveProjectTab("existing");
              if (projects.length > 0 && !targetExistingProjectId) {
                setTargetExistingProjectId(projects[0].id);
              }
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-label-caps font-medium transition-all flex items-center justify-center gap-1.5 ${
              saveProjectTab === "existing"
                ? "bg-primary text-black font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>Thêm vào dự án có sẵn</span>
            {projects.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono-data font-bold ${
                  saveProjectTab === "existing"
                    ? "bg-black/20 text-black"
                    : "bg-white/10 text-on-surface"
                }`}
              >
                {projects.length}
              </span>
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {saveProjectTab === "new" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-label-caps text-on-surface-variant">
                  Tên dự án mới *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Kịch bản thuyết minh tập 1..."
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  className="bg-surface-dim border border-white/10 rounded-xl px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-label-caps text-on-surface-variant">
                  Ghi chú (Tùy chọn)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú thêm về nội dung, nhân vật..."
                  value={newProjectNotes}
                  onChange={(e) => setNewProjectNotes(e.target.value)}
                  className="bg-surface-dim border border-white/10 rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
            </>
          ) : projects.length === 0 ? (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center flex flex-col items-center gap-2">
              <p className="text-xs text-on-surface-variant">
                Bạn chưa có dự án nào trong Thư viện.
              </p>
              <button
                type="button"
                onClick={() => setSaveProjectTab("new")}
                className="text-xs font-label-caps text-primary hover:underline"
              >
                Bấm vào đây để tạo dự án đầu tiên
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-label-caps text-on-surface-variant">
                  Chọn dự án đích *
                </label>
                <select
                  value={targetExistingProjectId}
                  onChange={(e) => setTargetExistingProjectId(e.target.value)}
                  className="bg-surface-dim border border-white/10 rounded-xl px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
                >
                  {projects.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      className="bg-surface-variant text-on-surface"
                    >
                      {p.name} ({p.blocks?.length || 0} phân đoạn)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-label-caps text-on-surface-variant">
                  Cách thức lưu vào dự án
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      saveExistingMode === "append"
                        ? "bg-primary/10 border-primary/40 text-on-surface"
                        : "bg-surface-dim/70 border-white/10 text-on-surface-variant hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="saveExistingMode"
                      value="append"
                      checked={saveExistingMode === "append"}
                      onChange={() => setSaveExistingMode("append")}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-on-surface">
                        Nối tiếp vào sau
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        Giữ câu cũ, thêm +{studioBlocksCount} câu này vào cuối
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      saveExistingMode === "replace"
                        ? "bg-primary/10 border-primary/40 text-on-surface"
                        : "bg-surface-dim/70 border-white/10 text-on-surface-variant hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="saveExistingMode"
                      value="replace"
                      checked={saveExistingMode === "replace"}
                      onChange={() => setSaveExistingMode("replace")}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-on-surface">
                        Ghi đè kịch bản
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        Thay thế toàn bộ bằng {studioBlocksCount} câu này
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-label-caps text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-primary text-black font-semibold rounded-xl text-xs font-label-caps hover:brightness-110 transition-all shadow-md"
            >
              {saveProjectTab === "new" ? "Lưu Dự án mới" : "Lưu vào Dự án này"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
