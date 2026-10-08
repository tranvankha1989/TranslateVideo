import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useTTSStore, type ScriptBlock } from "../store/useTTSStore";
import { downloadAudioFile } from "../utils/download";

export function useStudioProject() {
  const navigate = useNavigate();
  const { audioUrl, history, text, voices, selectedVoiceId, addProject, updateProjectBlocks, updateProjectMaster, projects, setPendingVoiceForVideo, cfg_value, speed, pitch } =
    useTTSStore();

  const [configSaved, setConfigSaved] = useState(false);

  // ── Lưu cấu hình model ───────────────────────────────────────────────────
  const saveModelConfig = useCallback(() => {
    const config = {
      cfg_value,
      speed,
      pitch,
      audioFormat: useTTSStore.getState().audioFormat,
      enhanceAudio: true,
    };
    localStorage.setItem("tts_model_config", JSON.stringify(config));
    setConfigSaved(true);
    toast.success(
      `Đã lưu cấu hình: CFG ${cfg_value.toFixed(1)} · Speed ${speed.toFixed(2)}x · Pitch ${pitch >= 0 ? "+" : ""}${pitch.toFixed(1)}`,
      { duration: 3000 },
    );
    setTimeout(() => setConfigSaved(false), 2000);
  }, [cfg_value, speed, pitch]);

  // ── Lưu kịch bản vào dự án ──────────────────────────────────────────────
  const handleSaveStudioAsProject = (
    studioBlocks: ScriptBlock[],
    closeModal: () => void,
    {
      tab,
      newTitle,
      newNotes,
      targetProjectId,
      mode: saveMode,
    }: {
      tab: "new" | "existing";
      newTitle: string;
      newNotes: string;
      targetProjectId: string;
      mode: "append" | "replace";
    },
  ) => {
    if (tab === "new") {
      const createdProj = addProject(newTitle, newNotes, {
        blocks: studioBlocks,
        masterAudioUrl: audioUrl || undefined,
      });
      closeModal();
      toast.success(`Đã lưu kịch bản vào Dự án mới "${createdProj.name}"!`);
    } else {
      const targetProj = projects.find((p) => p.id === targetProjectId);
      if (!targetProj) {
        toast.error("Không tìm thấy dự án đã chọn");
        return;
      }

      const existingBlocks = targetProj.blocks || [];
      let finalBlocks: ScriptBlock[];

      if (saveMode === "append") {
        finalBlocks = [...existingBlocks, ...studioBlocks];
        toast.success(
          `Đã thêm ${studioBlocks.length} phân đoạn vào dự án "${targetProj.name}"!`,
        );
      } else {
        finalBlocks = [...studioBlocks];
        toast.success(`Đã ghi đè kịch bản cho dự án "${targetProj.name}"!`);
      }

      updateProjectBlocks(targetProj.id, finalBlocks);
      if (audioUrl) {
        updateProjectMaster(targetProj.id, { masterAudioUrl: audioUrl });
      }

      closeModal();
    }
  };

  // ── Chuyển sang Video Studio ─────────────────────────────────────────────
  const handleNavigateToVideo = () => {
    if (!audioUrl) return;
    const latestRecord = history[0] || {
      id: `voice_${Date.now()}`,
      text,
      url: audioUrl,
      timestamp: Date.now(),
      voiceName:
        voices.find((v) => v.id === selectedVoiceId)?.name || "Giọng đọc mới",
    };
    setPendingVoiceForVideo(latestRecord);
    toast.success("Đang chuyển sang Video Studio với giọng đọc này!");
    navigate("/autocaption");
  };

  // ── Tải xuống audio chính ────────────────────────────────────────────────
  const handleDownloadMaster = () => {
    if (!audioUrl) return;
    const filename =
      audioUrl.split("/").pop() || `audio.${useTTSStore.getState().audioFormat}`;
    downloadAudioFile(audioUrl, filename);
  };

  return {
    configSaved,
    saveModelConfig,
    handleSaveStudioAsProject,
    handleNavigateToVideo,
    handleDownloadMaster,
  };
}
