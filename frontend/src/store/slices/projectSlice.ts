import type { StateCreator } from "zustand";
import type { TTSState, Project, ScriptBlock } from "../types";

export interface ProjectSlice {
  projects: Project[];
  addProject: (
    name: string,
    description?: string,
    initialData?: Partial<Project>,
  ) => Project;
  deleteProject: (id: string) => void;
  updateRecordProject: (recordId: string, projectId?: string) => void;
  updateProjectBlocks: (projectId: string, blocks: ScriptBlock[]) => void;
  updateProjectMaster: (
    projectId: string,
    master: {
      masterAudioUrl?: string;
      masterFilename?: string;
      masterSrtUrl?: string;
      masterDuration?: number;
    },
  ) => void;
}

export const createProjectSlice: StateCreator<
  TTSState,
  [],
  [],
  ProjectSlice
> = (set, get) => ({
  projects: JSON.parse(localStorage.getItem("tts_projects") || "[]"),

  addProject: (name, description, initialData = {}) => {
    const newProject: Project = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      description,
      createdAt: Date.now(),
      ...initialData,
    };
    set((state) => {
      const newProjects = [newProject, ...state.projects];
      localStorage.setItem("tts_projects", JSON.stringify(newProjects));

      if (
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
        fetch("http://localhost:8000/api/sync/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newProject),
        }).catch(() => {});
      }

      return { projects: newProjects };
    });
    return newProject;
  },

  deleteProject: (id) => {
    const proj = get().projects.find((p) => p.id === id);
    if (proj) {
      if (proj.blocks) {
        for (const b of proj.blocks) {
          const fn =
            b.filename || (b.audioUrl ? b.audioUrl.split("/").pop() : null);
          if (fn) {
            fetch(`http://localhost:8000/api/tts/${fn}`, {
              method: "DELETE",
            }).catch(() => {});
          }
        }
      }
      const mFn =
        proj.masterFilename ||
        (proj.masterAudioUrl ? proj.masterAudioUrl.split("/").pop() : null);
      if (mFn) {
        fetch(`http://localhost:8000/api/tts/${mFn}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      if (proj.masterSrtUrl) {
        const srtFn = proj.masterSrtUrl.split("/").pop();
        if (srtFn) {
          fetch(`http://localhost:8000/api/tts/${srtFn}`, {
            method: "DELETE",
          }).catch(() => {});
        }
      }
    }

    set((state) => {
      const newHistory = state.history.filter((h) => h.projectId !== id);
      const newProjects = state.projects.filter((p) => p.id !== id);
      localStorage.setItem("tts_projects", JSON.stringify(newProjects));
      localStorage.setItem("tts_history", JSON.stringify(newHistory));

      if (
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
        fetch(`http://localhost:8000/api/sync/projects/${id}`, {
          method: "DELETE",
        }).catch(() => {});
      }

      return { projects: newProjects, history: newHistory };
    });
  },

  updateRecordProject: (recordId, projectId) => {
    set((state) => {
      const newHistory = state.history.map((h) =>
        h.id === recordId ? { ...h, projectId } : h,
      );
      localStorage.setItem("tts_history", JSON.stringify(newHistory));
      return { history: newHistory };
    });
  },

  updateProjectBlocks: (projectId, blocks) => {
    set((state) => {
      const newProjects = state.projects.map((p) =>
        p.id === projectId ? { ...p, blocks } : p,
      );
      localStorage.setItem("tts_projects", JSON.stringify(newProjects));

      const target = newProjects.find((p) => p.id === projectId);
      if (
        target &&
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
        fetch("http://localhost:8000/api/sync/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        }).catch(() => {});
      }

      return { projects: newProjects };
    });
  },

  updateProjectMaster: (projectId, master) => {
    set((state) => {
      const newProjects = state.projects.map((p) =>
        p.id === projectId ? { ...p, ...master } : p,
      );
      localStorage.setItem("tts_projects", JSON.stringify(newProjects));

      const target = newProjects.find((p) => p.id === projectId);
      if (
        target &&
        state.syncStatus.mode === "cloud" &&
        state.syncStatus.mongo_connected
      ) {
        fetch("http://localhost:8000/api/sync/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        }).catch(() => {});
      }

      return { projects: newProjects };
    });
  },
});
