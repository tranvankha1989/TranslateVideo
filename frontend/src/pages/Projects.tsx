import { useState, useEffect } from "react";
import { useTTSStore } from "../store/useTTSStore";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function Projects() {
  const { projects, addProject, deleteProject, history, cleanupJunkFiles } = useTTSStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isCleaning, setIsCleaning] = useState(false);

  useEffect(() => {
    // Tự động dọn dẹp nhẹ các file rác cũ hơn 15 phút ở chế độ nền
    cleanupJunkFiles(false).catch(() => {});
  }, [cleanupJunkFiles]);

  const handleCleanJunk = async () => {
    setIsCleaning(true);
    const toastId = toast.loading("Đang quét và dọn dẹp các file âm thanh rác...");
    try {
      const res = await cleanupJunkFiles(true);
      if (res.deleted_count > 0) {
        toast.success(`Đã dọn dẹp ${res.deleted_count} file rác, giải phóng ${res.freed_mb} MB bộ nhớ!`, {
          id: toastId,
        });
      } else {
        toast.success("Hệ thống sạch sẽ! Không có file rác mồ côi nào.", { id: toastId });
      }
    } catch (e: any) {
      toast.error(`Lỗi dọn dẹp: ${e.message}`, { id: toastId });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      toast.error("Vui lòng nhập tên dự án");
      return;
    }
    addProject(newProjectName.trim(), newProjectDesc.trim());
    setNewProjectName("");
    setNewProjectDesc("");
    setIsModalOpen(false);
    toast.success("Tạo dự án thành công!");
  };

  return (
    <div className="w-full max-w-[1600px] 2k:max-w-[2000px] mx-auto flex flex-col gap-6 md:gap-8 2k:gap-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-3xl">
            workspaces
          </span>
          <h1 className="font-display text-display md:text-display text-headline-lg-mobile text-on-surface">
            Dự án
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCleanJunk}
            disabled={isCleaning}
            className="flex items-center gap-2 bg-surface-variant hover:bg-white/10 text-on-surface border border-white/10 px-3.5 py-2 rounded-lg font-label-caps text-xs transition-all shadow-sm"
            title="Quét và xóa các file audio tạm không thuộc dự án hay lịch sử nào"
          >
            <span className={`material-symbols-outlined text-[18px] ${isCleaning ? "animate-spin" : "text-amber-400"}`}>
              {isCleaning ? "sync" : "mop"}
            </span>
            Dọn dẹp file rác
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-black font-semibold px-4 py-2 rounded-lg font-label-caps text-sm hover:shadow-lg transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Tạo dự án mới
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="glass-card p-12 text-center text-on-surface-variant font-mono-data text-mono-data border border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-5xl opacity-50">
            folder_off
          </span>
          Chưa có dự án nào. Bấm "Tạo dự án mới" để bắt đầu.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => {
            const count = history.filter((h) => h.projectId === p.id).length;
            return (
              <Link
                to={`/projects/${p.id}`}
                key={p.id}
                className="glass-card rounded-2xl p-6 hover:border-primary/50 hover:shadow-xl transition-all group flex flex-col gap-4 border border-white/5 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full blur-[30px] -z-10 group-hover:bg-primary/10 transition-colors"></div>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-variant flex items-center justify-center text-primary group-hover:scale-110 transition-transform border border-white/5 shadow-inner">
                      <span className="material-symbols-outlined">folder</span>
                    </div>
                    <h3 className="font-label-caps text-on-surface group-hover:text-primary transition-colors text-lg">
                      {p.name}
                    </h3>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (
                        window.confirm(
                          "Bạn có chắc muốn xóa dự án này? (Các file audio bên trong sẽ không bị xóa mà chỉ bị gỡ khỏi dự án)",
                        )
                      ) {
                        deleteProject(p.id);
                        toast.success("Đã xóa dự án");
                      }
                    }}
                    className="w-8 h-8 rounded hover:bg-error/20 hover:text-error text-on-surface-variant flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      delete
                    </span>
                  </button>
                </div>
                {p.description && (
                  <p className="font-body-md text-sm text-on-surface-variant line-clamp-2">
                    {p.description}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-4 text-xs font-mono-data text-on-surface-variant/70 pt-2 border-t border-white/5">
                  <span className="flex items-center gap-1.5 text-primary font-bold">
                    <span className="material-symbols-outlined text-[14px]">
                      layers
                    </span>
                    {(p.blocks?.length || 0)} phân đoạn
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">
                      audio_file
                    </span>
                    {count} files
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">
                      calendar_today
                    </span>
                    {new Date(p.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95">
            <h2 className="font-display text-xl text-on-surface mb-6">
              Tạo Dự Án Mới
            </h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-xs text-on-surface-variant">
                  Tên dự án *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="bg-surface-dim border border-white/10 rounded-lg px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-body-md"
                  placeholder="VD: Lồng tiếng Vlog du lịch..."
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-xs text-on-surface-variant">
                  Mô tả (tùy chọn)
                </label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="bg-surface-dim border border-white/10 rounded-lg px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-body-md h-24 resize-none"
                  placeholder="Thêm một vài ghi chú..."
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-label-caps text-sm text-on-surface-variant hover:bg-white/5 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg font-label-caps text-sm bg-primary text-on-primary hover:shadow-lg transition-all"
                >
                  Tạo dự án
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
