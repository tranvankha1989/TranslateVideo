import React, { useState, useRef, useEffect } from "react";
import { useTTSStore } from "../store/useTTSStore";
import { toast } from "sonner";
import { convertToWav } from "../utils/audioUtils";
import { globalAudio } from "../utils/audioCoordinator";
import {
  Play,
  Pause,
  Trash2,
  Plus,
  Mic,
  Square,
  UploadCloud,
  FileAudio,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Dices,
  RotateCcw,
  Volume2,
  Quote,
  Hash,
  Wand2,
} from "lucide-react";

// Ánh xạ tên Tiếng Anh sang Tiếng Việt để hiển thị thẻ
const TAG_LABELS: Record<string, string> = {
  female: "Nữ",
  male: "Nam",
  child: "Trẻ em",
  teenager: "Thiếu niên",
  "young adult": "Thanh niên",
  "middle-aged": "Trung niên",
  elderly: "Cao tuổi",
  "very low pitch": "Rất trầm",
  "low pitch": "Trầm",
  "moderate pitch": "Vừa phải",
  "high pitch": "Cao",
  "very high pitch": "Rất cao",
  whisper: "Thì thầm",
  normal: "Tự nhiên",
  warm: "Ấm áp",
  cheerful: "Vui tươi",
  calm: "Điềm tĩnh",
  serious: "Nghiêm túc",
  enthusiastic: "Nhiệt huyết",
  mysterious: "Bí ẩn",
};

// Gợi ý câu đọc thử nghiệm nhanh cho người dùng
const PREVIEW_PROMPTS = [
  {
    label: "Tin tức",
    icon: "newspaper",
    text: "Bản tin hôm nay có những diễn biến đáng chú ý về kinh tế và công nghệ.",
  },
  {
    label: "Tâm sự",
    icon: "coffee",
    text: "Những buổi chiều yên tĩnh luôn mang lại cho chúng ta cảm giác thật bình yên.",
  },
  {
    label: "Quảng cáo",
    icon: "bolt",
    text: "Trải nghiệm sức mạnh giọng nói AI đột phá ngay hôm nay cùng hệ thống của chúng tôi!",
  },
  {
    label: "Chào mừng",
    icon: "hand",
    text: "Xin chào quý vị, chào mừng các bạn đã đến với kênh podcast ngày hôm nay.",
  },
];

interface RandomVoiceResult {
  audio_url: string;
  filename: string;
  instruct: string;
  gender: string;
  age: string;
  pitch: string;
  style: string;
  seed: number;
  preview_text?: string;
}

interface AudioSampleItem {
  id: string;
  file: File;
  audioUrl: string;
  name: string;
  duration: number;
  transcript: string;
  source: "upload" | "record";
}

const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      const dur = audio.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(dur) && dur > 0 ? Math.round(dur * 10) / 10 : 3.0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(3.0);
    };
  });
};

export default function CloningVoice() {
  const { voices, fetchVoices, deleteCustomVoice } = useTTSStore();

  // Multi-sample reference state
  const [samples, setSamples] = useState<AudioSampleItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingCounter, setRecordingCounter] = useState(1);

  // Preview playback cho từng sample
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Metadata state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("Giọng tự tạo (Đa mẫu)");
  const [gender, setGender] = useState("all");
  const [separateVocals, setSeparateVocals] = useState(true);

  // Random & Guided Voice Design state
  const [randomMode, setRandomMode] = useState<"guided" | "random">("guided");
  const [guidedGender, setGuidedGender] = useState("random");
  const [guidedAge, setGuidedAge] = useState("random");
  const [guidedPitch, setGuidedPitch] = useState("random");
  const [guidedStyle, setGuidedStyle] = useState("random");
  const [customPreviewText, setCustomPreviewText] = useState("");
  const [seedInput, setSeedInput] = useState<string>("");

  const [isGeneratingRandom, setIsGeneratingRandom] = useState(false);
  const [isSavingRandom, setIsSavingRandom] = useState(false);
  const [randomResult, setRandomResult] = useState<RandomVoiceResult | null>(null);
  const [randomName, setRandomName] = useState("");
  const currentRandomFileRef = useRef<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchVoices();
    return () => {
      if (currentRandomFileRef.current) {
        discardRandomPreview(currentRandomFileRef.current);
      }
      stopSamplePreview();
    };
  }, []);

  const customVoices = voices.filter((v) => v.type === "custom");

  // Tổng thời lượng các mẫu
  const totalDuration = Math.round(samples.reduce((acc, s) => acc + s.duration, 0) * 10) / 10;

  // ── Preview Sample Audio ──────────────────────────────────────────────────
  const stopSamplePreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPlayingSampleId(null);
  };

  const handleTogglePlaySample = (sample: AudioSampleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingSampleId === sample.id) {
      stopSamplePreview();
      return;
    }

    stopSamplePreview();
    const audio = new Audio(sample.audioUrl);
    previewAudioRef.current = audio;
    globalAudio.play(audio);

    audio.onended = () => setPlayingSampleId(null);
    audio.onerror = () => {
      toast.error(`Không thể phát mẫu: ${sample.name}`);
      setPlayingSampleId(null);
    };

    audio.play().then(() => {
      setPlayingSampleId(sample.id);
    }).catch(() => {
      setPlayingSampleId(null);
    });
  };

  // ── Thêm files vào danh sách ──────────────────────────────────────────────
  const addFilesToSamples = async (filesToAdd: FileList | File[]) => {
    const validFiles: File[] = [];
    for (let i = 0; i < filesToAdd.length; i++) {
      const f = filesToAdd[i];
      if (!f.name.toLowerCase().match(/\.(wav|mp3|m4a|webm|ogg)$/)) {
        toast.error(`File "${f.name}" không đúng định dạng (.wav, .mp3, .m4a)`);
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`File "${f.name}" quá lớn (>25MB)`);
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length === 0) return;

    if (samples.length + validFiles.length > 6) {
      toast.error("Hệ thống hỗ trợ tối đa 5-6 mẫu âm thanh tham chiếu tối ưu.");
    }

    const maxAllowed = validFiles.slice(0, Math.max(0, 6 - samples.length));
    const newItems: AudioSampleItem[] = [];

    for (const file of maxAllowed) {
      const dur = await getAudioDuration(file);
      const url = URL.createObjectURL(file);
      newItems.push({
        id: `sample_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        file,
        audioUrl: url,
        name: file.name,
        duration: dur,
        transcript: "",
        source: "upload",
      });
    }

    setSamples((prev) => [...prev, ...newItems]);
    toast.success(`Đã thêm ${newItems.length} mẫu âm thanh tham chiếu.`);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await addFilesToSamples(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFilesToSamples(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveSample = (sampleId: string) => {
    if (playingSampleId === sampleId) stopSamplePreview();
    setSamples((prev) => {
      const item = prev.find((s) => s.id === sampleId);
      if (item) URL.revokeObjectURL(item.audioUrl);
      return prev.filter((s) => s.id !== sampleId);
    });
  };

  const handleUpdateTranscript = (sampleId: string, newTranscript: string) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, transcript: newTranscript } : s))
    );
  };

  // ── Ghi âm trực tiếp ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const recordName = `Mẫu ghi âm #${recordingCounter}.webm`;
        const recordFile = new File([audioBlob], recordName, { type: "audio/webm" });
        const dur = await getAudioDuration(recordFile);
        const url = URL.createObjectURL(recordFile);

        setSamples((prev) => [
          ...prev,
          {
            id: `sample_rec_${Date.now()}`,
            file: recordFile,
            audioUrl: url,
            name: `Ghi âm #${recordingCounter}`,
            duration: dur,
            transcript: "",
            source: "record",
          },
        ]);

        setRecordingCounter((prev) => prev + 1);
        stream.getTracks().forEach((track) => track.stop());
        toast.success(`Đã lưu ${recordName} (${dur}s). Bạn có thể ghi âm thêm mẫu nữa!`);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      toast.info("🎙️ Đang ghi âm mẫu... Nhấn 'Dừng ghi' khi hoàn thành câu nói.");
    } catch (err) {
      toast.error("Không thể truy cập Microphone. Vui lòng cấp quyền.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // ── Gửi form khởi tạo giọng đọc ───────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (samples.length === 0) {
      return toast.error("Vui lòng tải lên hoặc ghi âm ít nhất 1 mẫu âm thanh tham chiếu.");
    }
    if (!name.trim()) {
      return toast.error("Vui lòng nhập tên cho giọng đọc mới.");
    }

    setIsUploading(true);
    const toastId = toast.loading(`Đang chuẩn hóa và xử lý ${samples.length} mẫu âm thanh...`);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("gender", gender);
      formData.append("icon", "record_voice_over");

      // Convert từng file sang chuẩn WAV trong browser
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        toast.loading(`Đang chuẩn hóa mẫu #${i + 1} (${s.name})...`, { id: toastId });
        const wavBlob = await convertToWav(s.file);
        const wavFile = new File([wavBlob], `sample_${i + 1}.wav`, { type: "audio/wav" });
        formData.append("files", wavFile);
      }

      // Đẩy mảng transcript tương ứng
      const transcriptsList = samples.map((s) => s.transcript.trim());
      formData.append("transcripts", JSON.stringify(transcriptsList));
      formData.append("separate_vocals", separateVocals ? "true" : "false");

      toast.loading("Đang trích xuất VoiceClonePrompt đa mẫu (OmniVoice/Whisper)...", { id: toastId });
      const res = await fetch("http://localhost:8000/api/voices/clone", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Lỗi tạo giọng đọc đa mẫu");
      }

      const resData = await res.json();
      toast.success(resData.message || "Khởi tạo giọng đọc đa mẫu thành công!", { id: toastId });

      // Dọn dẹp form
      samples.forEach((s) => URL.revokeObjectURL(s.audioUrl));
      setSamples([]);
      setName("");
      setDescription("Giọng tự tạo (Đa mẫu)");
      setRecordingCounter(1);

      await fetchVoices();
    } catch (err: any) {
      console.error("Lỗi clone voice:", err);
      toast.error(`Lỗi: ${err.message}`, { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    toast("Bạn có chắc chắn muốn xoá giọng đọc này?", {
      action: {
        label: "Xác nhận xoá",
        onClick: async () => {
          try {
            await deleteCustomVoice(id);
            toast.success("Đã xoá giọng đọc và bộ đệm.");
          } catch (e) {
            toast.error("Lỗi khi xoá giọng đọc.");
          }
        },
      },
      cancel: {
        label: "Huỷ",
        onClick: () => {},
      },
    });
  };

  // ── Dọn dẹp file preview ngẫu nhiên ─────────────────────────────────────────
  const discardRandomPreview = async (filename: string) => {
    if (!filename) return;
    try {
      await fetch(
        `http://localhost:8000/api/voices/discard-random/${encodeURIComponent(filename)}`,
        { method: "DELETE", keepalive: true }
      );
    } catch (err) {
      console.warn("Không thể dọn dẹp file preview:", err);
    }
  };

  const handleGenerateRandom = async () => {
    if (currentRandomFileRef.current) {
      discardRandomPreview(currentRandomFileRef.current);
      currentRandomFileRef.current = null;
    }

    setIsGeneratingRandom(true);
    setRandomResult(null);
    const toastId = toast.loading(
      randomMode === "guided"
        ? "🎨 Đang tổng hợp giọng theo thiết kế..."
        : "🎲 Đang quay số giọng ngẫu nhiên..."
    );

    try {
      const payload: Record<string, any> = {};

      if (randomMode === "guided") {
        if (guidedGender !== "random") payload.gender = guidedGender;
        if (guidedAge !== "random") payload.age = guidedAge;
        if (guidedPitch !== "random") payload.pitch = guidedPitch;
        if (guidedStyle !== "random") payload.style = guidedStyle;
      }

      if (customPreviewText.trim()) {
        payload.preview_text = customPreviewText.trim();
      }

      if (seedInput.trim() !== "") {
        const parsedSeed = parseInt(seedInput.trim(), 10);
        if (!isNaN(parsedSeed)) {
          payload.seed = parsedSeed;
        }
      }

      const res = await fetch("http://localhost:8000/api/voices/random", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Lỗi tạo giọng nói");
      }

      const data: RandomVoiceResult = await res.json();
      setRandomResult(data);
      currentRandomFileRef.current = data.filename;

      // Đặt tên gợi ý thông minh
      const genderLabel = data.gender === "female" ? "Nữ" : "Nam";
      const styleLabel = data.style && data.style !== "normal" ? TAG_LABELS[data.style] : "";
      const ageLabel = TAG_LABELS[data.age] || "";
      const trait = styleLabel || ageLabel;
      setRandomName(`Giọng ${genderLabel} ${trait ? trait + " " : ""}#${data.seed % 1000}`);
      setSeedInput(String(data.seed));

      toast.success("Tạo giọng thành công! Hãy nghe thử.", { id: toastId });
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`, { id: toastId });
    } finally {
      setIsGeneratingRandom(false);
    }
  };

  const handleRerollSeed = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 10000;
    setSeedInput(String(newSeed));
    toast.info(`Đã đổi hạt giống Seed mới: #${newSeed}`);
  };

  const handleResetSeed = () => {
    setSeedInput("");
    toast.info("Đã xóa hạt giống Seed (Sẽ tạo hoàn toàn ngẫu nhiên mỗi lần)");
  };

  const handleDiscardRandom = async () => {
    if (currentRandomFileRef.current) {
      const fn = currentRandomFileRef.current;
      currentRandomFileRef.current = null;
      await discardRandomPreview(fn);
    }
    setRandomResult(null);
    setRandomName("");
    toast.info("Đã bỏ qua giọng ngẫu nhiên.");
  };

  const handleSaveRandom = async () => {
    if (!randomResult) return;
    if (!randomName.trim()) return toast.error("Vui lòng nhập tên cho giọng này.");
    setIsSavingRandom(true);
    const toastId = toast.loading("Đang lưu giọng...");
    try {
      const formData = new FormData();
      formData.append("name", randomName.trim());
      formData.append("description", `Giọng ngẫu nhiên (${randomResult.instruct})`);
      formData.append("gender", randomResult.gender);
      formData.append("icon", "casino");
      formData.append("filename", randomResult.filename);
      formData.append("instruct", randomResult.instruct);

      const res = await fetch("http://localhost:8000/api/voices/save-random", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Lỗi lưu giọng");
      }
      toast.success(`Đã lưu giọng "${randomName.trim()}" thành công!`, { id: toastId });
      currentRandomFileRef.current = null;
      setRandomResult(null);
      setRandomName("");
      await fetchVoices();
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`, { id: toastId });
    } finally {
      setIsSavingRandom(false);
    }
  };

  return (
    <div className="w-full max-w-[1600px] 2k:max-w-[2000px] mx-auto flex flex-col gap-6 md:gap-8 2k:gap-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 2k:gap-5 px-2">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
          <span className="material-symbols-outlined text-primary text-2xl">
            voice_selection
          </span>
        </div>
        <div>
          <h1 className="font-display text-headline-sm md:text-headline-md text-on-surface tracking-tight flex items-center gap-2.5">
            Voice Cloning
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-mono-data font-semibold">
              Multi-Sample 24kHz
            </span>
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Tự tạo giọng AI cá nhân hóa đỉnh cao: Hỗ trợ nạp 1 đến 5 mẫu âm thanh khác nhau để mô hình học dải âm vực phong phú, tự nhiên.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Cột trái: Tạo giọng từ mẫu âm thanh (Multi-Sample) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <form
            onSubmit={handleSubmit}
            className="glass-card rounded-2xl p-6 md:p-8 flex flex-col gap-6 shadow-2xl border border-white/5 relative overflow-hidden"
          >
            {/* Header Form */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="font-label-caps text-label-caps text-on-surface flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Mẫu Âm Thanh Tham Chiếu (Reference Audio)
                </h3>
                <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
                  Tải lên hoặc ghi âm nhiều câu nói khác nhau (khuyên dùng tổng 10s - 25s)
                </p>
              </div>
              <span className="text-xs font-mono-data px-2.5 py-1 rounded-lg bg-surface-dim border border-white/10 text-primary font-bold">
                {samples.length}/5 mẫu
              </span>
            </div>

            {/* Vùng Quản lý Đa Mẫu (Multi-Sample Manager) */}
            <div className="flex flex-col gap-4">
              {/* Khu vực Dropzone khi chưa có mẫu hoặc muốn thêm */}
              <div
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all text-center ${
                  isDragging
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-white/10 bg-surface-dim/50 hover:bg-surface-dim/80 hover:border-white/20"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-on-surface text-sm font-semibold mb-0.5">
                    Kéo thả các file âm thanh vào đây (hỗ trợ chọn nhiều file)
                  </p>
                  <p className="text-on-surface-variant/70 text-xs">
                    Hỗ trợ .wav, .mp3, .m4a. Khuyên dùng mỗi mẫu 3 - 8 giây với các ngữ điệu tự nhiên
                  </p>
                </div>

                <div className="flex items-center gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-on-surface text-xs font-semibold transition-all border border-white/10 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 text-primary" />
                    Chọn file từ máy
                  </button>

                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                      isRecording
                        ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                        : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Dừng ghi âm
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5" />
                        Ghi âm trực tiếp
                      </>
                    )}
                  </button>
                </div>

                <input
                  type="file"
                  multiple
                  accept="audio/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Thanh hiển thị tổng thời lượng tham chiếu (Smart Quality Indicator) */}
              {samples.length > 0 && (
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-surface-dim border border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-primary">
                        timer
                      </span>
                      Tổng thời lượng tham chiếu:
                      <strong className="text-primary font-mono-data ml-1">
                        {totalDuration}s
                      </strong>
                    </span>

                    {totalDuration < 6 ? (
                      <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Nên thêm mẫu (mục tiêu: 10s - 25s)
                      </span>
                    ) : totalDuration <= 25 ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Độ dài lý tưởng cho OmniVoice
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-indigo-300 font-medium">
                        <Sparkles className="w-3.5 h-3.5" />
                        Dồi dào (hệ thống sẽ tối ưu 25s đầu)
                      </span>
                    )}
                  </div>

                  {/* Progress bar trực quan */}
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        totalDuration < 6
                          ? "bg-amber-400"
                          : totalDuration <= 25
                          ? "bg-gradient-to-r from-primary to-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]"
                          : "bg-gradient-to-r from-primary via-emerald-400 to-indigo-400"
                      }`}
                      style={{ width: `${Math.min(100, (totalDuration / 25) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Danh sách các card mẫu đã nạp */}
              {samples.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                      <FileAudio className="w-3.5 h-3.5 text-primary" />
                      Danh sách các mẫu âm thanh ({samples.length} mẫu)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        samples.forEach((s) => URL.revokeObjectURL(s.audioUrl));
                        setSamples([]);
                        stopSamplePreview();
                      }}
                      className="text-[11px] text-error hover:underline transition-colors"
                    >
                      Xóa tất cả
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {samples.map((s, idx) => {
                      const isPlaying = playingSampleId === s.id;
                      return (
                        <div
                          key={s.id}
                          className="flex flex-col gap-2 p-3 rounded-xl bg-surface-dim/70 border border-white/10 hover:border-white/20 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                              {/* Play preview button */}
                              <button
                                type="button"
                                onClick={(e) => handleTogglePlaySample(s, e)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                                  isPlaying
                                    ? "bg-primary text-black"
                                    : "bg-white/10 hover:bg-white/20 text-on-surface"
                                }`}
                                title={isPlaying ? "Dừng nghe" : "Nghe thử mẫu này"}
                              >
                                {isPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                )}
                              </button>

                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-on-surface flex items-center gap-2 truncate">
                                  <span className="px-1.5 py-0.2 rounded bg-primary/15 text-primary text-[10px] font-mono-data shrink-0">
                                    #{idx + 1}
                                  </span>
                                  <span className="truncate" title={s.name}>
                                    {s.name}
                                  </span>
                                </div>
                                <div className="text-[10px] text-on-surface-variant/70 mt-0.5 font-mono-data">
                                  Thời lượng: {s.duration}s
                                  {s.source === "record" && " • Thu trực tiếp"}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveSample(s.id)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
                              title="Xóa mẫu này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Ô nhập transcript riêng cho từng mẫu */}
                          <input
                            type="text"
                            value={s.transcript}
                            onChange={(e) => handleUpdateTranscript(s.id, e.target.value)}
                            placeholder={`Văn bản mẫu #${idx + 1} (Tùy chọn, để trống Whisper sẽ tự nhận diện câu thoại)...`}
                            className="w-full bg-black/30 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Thông tin cấu hình giọng nói */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="font-label-caps text-xs text-on-surface-variant">
                  Tên giọng đọc AI
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Giọng MC Minh Quân (Truyền cảm)..."
                  className="bg-surface-dim border border-white/10 rounded-xl px-4 py-2.5 text-on-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-caps text-xs text-on-surface-variant">
                  Mô tả phong cách
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="VD: Giọng đọc tin tức, ấm áp, rõ ràng..."
                  className="bg-surface-dim border border-white/10 rounded-xl px-4 py-2.5 text-on-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-caps text-xs text-on-surface-variant">
                  Giới tính
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="bg-surface-dim border border-white/10 rounded-xl px-4 py-2.5 text-on-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                >
                  <option value="all">Không xác định / Đa dạng</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>

              {/* Tùy chọn Tách nhạc nền & Lọc tạp âm */}
              <div className="md:col-span-2 bg-surface-dim/70 border border-primary/20 rounded-2xl p-3.5 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Tách nhạc nền & lọc tạp âm (Chỉ giữ Voice sạch)</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant/80">
                    Tự động loại bỏ tiếng nhạc nền (BGM), tiếng ồn môi trường và chuẩn hóa âm lượng giọng nói trước khi học giọng AI.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={separateVocals}
                    onChange={(e) => setSeparateVocals(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>

            {/* Nút Submit */}
            <button
              type="submit"
              disabled={isUploading || isRecording || samples.length === 0}
              className={`w-full py-3.5 px-6 font-label-caps text-label-caps rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
                isUploading || isRecording || samples.length === 0
                  ? "bg-surface-variant text-on-surface-variant/60 cursor-not-allowed border border-white/5"
                  : "bg-primary text-black font-bold hover:brightness-110 shadow-primary/20 hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
              {isUploading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    sync
                  </span>
                  <span>ĐANG TRÍCH XUẤT ĐẶC TRƯNG ĐA MẪU...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    KHỞI TẠO GIỌNG ĐỌC MỚI ({samples.length} MẪU • {totalDuration}s)
                  </span>
                </>
              )}
            </button>
          </form>

          {/* ── Card Khám Phá & Thiết Kế Giọng AI (Chức năng 3.2) ─────────────────────────────── */}
          <div className="glass-card rounded-2xl p-6 md:p-7 flex flex-col gap-5 shadow-2xl border border-white/5 relative overflow-hidden">
            {/* Header và Tab chuyển chế độ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <h3 className="font-label-caps text-label-caps text-on-surface flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-secondary/15 text-secondary">
                    <Sliders className="w-4 h-4" />
                  </span>
                  Khám phá & Thiết kế Giọng AI
                </h3>
                <p className="text-xs text-on-surface-variant/70 mt-0.5">
                  Tùy biến thuộc tính âm sắc, cảm xúc hoặc quay số ngẫu nhiên theo Seed
                </p>
              </div>

              {/* Mode switch pills */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setRandomMode("guided")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-label-caps transition-all flex items-center gap-1.5 ${
                    randomMode === "guided"
                      ? "bg-secondary/20 text-secondary font-semibold shadow-sm border border-secondary/30"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Thiết kế phong cách
                </button>
                <button
                  type="button"
                  onClick={() => setRandomMode("random")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-label-caps transition-all flex items-center gap-1.5 ${
                    randomMode === "random"
                      ? "bg-secondary/20 text-secondary font-semibold shadow-sm border border-secondary/30"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <Dices className="w-3.5 h-3.5" />
                  Xổ số ngẫu nhiên
                </button>
              </div>
            </div>

            {/* Các bộ chọn thuộc tính trong chế độ Guided */}
            {randomMode === "guided" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-label-caps text-on-surface-variant flex items-center gap-1">
                    <span>Giới tính giọng nói</span>
                  </label>
                  <select
                    value={guidedGender}
                    onChange={(e) => setGuidedGender(e.target.value)}
                    className="bg-surface-dim border border-white/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none transition-colors"
                  >
                    <option value="random">🎲 Ngẫu nhiên (Random)</option>
                    <option value="female">Nữ (Female)</option>
                    <option value="male">Nam (Male)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-label-caps text-on-surface-variant flex items-center gap-1">
                    <span>Độ tuổi / Nhóm tuổi</span>
                  </label>
                  <select
                    value={guidedAge}
                    onChange={(e) => setGuidedAge(e.target.value)}
                    className="bg-surface-dim border border-white/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none transition-colors"
                  >
                    <option value="random">🎲 Ngẫu nhiên (Random)</option>
                    <option value="child">Trẻ em (Child)</option>
                    <option value="teenager">Thiếu niên (Teenager)</option>
                    <option value="young adult">Thanh niên (Young adult)</option>
                    <option value="middle-aged">Trung niên (Middle-aged)</option>
                    <option value="elderly">Cao tuổi (Elderly)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-label-caps text-on-surface-variant flex items-center gap-1">
                    <span>Cao độ / Pitch</span>
                  </label>
                  <select
                    value={guidedPitch}
                    onChange={(e) => setGuidedPitch(e.target.value)}
                    className="bg-surface-dim border border-white/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none transition-colors"
                  >
                    <option value="random">🎲 Ngẫu nhiên (Random)</option>
                    <option value="very low pitch">Rất trầm (Very low pitch)</option>
                    <option value="low pitch">Trầm ấm (Low pitch)</option>
                    <option value="moderate pitch">Vừa phải (Moderate pitch)</option>
                    <option value="high pitch">Cao sáng (High pitch)</option>
                    <option value="very high pitch">Rất cao (Very high pitch)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-label-caps text-on-surface-variant flex items-center gap-1">
                    <span>Cảm xúc & Phong cách</span>
                  </label>
                  <select
                    value={guidedStyle}
                    onChange={(e) => setGuidedStyle(e.target.value)}
                    className="bg-surface-dim border border-white/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none transition-colors"
                  >
                    <option value="random">🎲 Ngẫu nhiên (Random)</option>
                    <option value="normal">Tự nhiên / Thường</option>
                    <option value="warm">Ấm áp (Warm)</option>
                    <option value="cheerful">Vui tươi (Cheerful)</option>
                    <option value="calm">Điềm tĩnh (Calm)</option>
                    <option value="serious">Nghiêm túc (Serious)</option>
                    <option value="enthusiastic">Nhiệt huyết (Enthusiastic)</option>
                    <option value="mysterious">Bí ẩn (Mysterious)</option>
                    <option value="whisper">Thì thầm (Whisper)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-secondary/5 border border-secondary/15 flex items-center gap-3 text-xs text-on-surface-variant">
                <Dices className="w-5 h-5 text-secondary shrink-0" />
                <span>
                  Chế độ <strong>Xổ số ngẫu nhiên</strong> sẽ tự động kết hợp ngẫu nhiên tất cả các đặc tính (giới tính, độ tuổi, cao độ và cảm xúc) để mang đến những giọng đọc bất ngờ độc đáo.
                </span>
              </div>
            )}

            {/* Tùy biến câu đọc thử nghiệm (Preview Text) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-label-caps text-on-surface-variant flex items-center gap-1.5">
                  <Quote className="w-3.5 h-3.5 text-secondary" />
                  Câu đọc thử nghiệm (Preview Text)
                </label>
                {customPreviewText && (
                  <button
                    type="button"
                    onClick={() => setCustomPreviewText("")}
                    className="text-[11px] text-on-surface-variant hover:text-secondary underline transition-colors"
                  >
                    Dùng câu mặc định
                  </button>
                )}
              </div>

              {/* Quick prompt suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {PREVIEW_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCustomPreviewText(p.text)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface border border-white/5 transition-all flex items-center gap-1"
                  >
                    <span className="font-semibold text-secondary">#{p.label}</span>
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={customPreviewText}
                onChange={(e) => setCustomPreviewText(e.target.value)}
                placeholder="Nhập câu đọc bạn muốn nghe thử (hoặc chọn mẫu nhanh phía trên)..."
                className="w-full bg-surface-dim border border-white/10 rounded-xl px-3.5 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/40 transition-colors"
              />
            </div>

            {/* Quản lý Hạt giống (Seed) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-black/20 border border-white/5">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-white/5 text-on-surface-variant">
                  <Hash className="w-3.5 h-3.5 text-secondary" />
                </span>
                <div>
                  <span className="text-xs font-label-caps text-on-surface">Hạt giống Seed</span>
                  <p className="text-[10px] text-on-surface-variant/70">
                    Cùng thuộc tính & Seed sẽ luôn tạo ra cùng một âm sắc
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  placeholder="Ngẫu nhiên"
                  className="w-24 bg-surface-dim border border-white/10 rounded-lg px-2.5 py-1 text-xs text-on-surface font-mono-data focus:border-secondary focus:outline-none text-center"
                />
                <button
                  type="button"
                  onClick={handleRerollSeed}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-on-surface text-xs font-medium border border-white/5 transition-colors flex items-center gap-1"
                  title="Đổi Seed ngẫu nhiên mới"
                >
                  <RotateCcw className="w-3 h-3" />
                  Đổi
                </button>
                {seedInput && (
                  <button
                    type="button"
                    onClick={handleResetSeed}
                    className="p-1 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                    title="Bỏ ghim Seed (Random mỗi lần)"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Nút Khởi tạo Preview */}
            <button
              type="button"
              onClick={handleGenerateRandom}
              disabled={isGeneratingRandom}
              className={`w-full py-3 px-5 rounded-xl font-label-caps text-xs flex items-center justify-center gap-2 transition-all duration-200 shadow-md ${
                isGeneratingRandom
                  ? "bg-surface-variant text-on-surface-variant/60 cursor-not-allowed border border-white/5"
                  : "bg-secondary text-slate-900 font-bold hover:brightness-110 shadow-secondary/20 hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
              {isGeneratingRandom ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    sync
                  </span>
                  <span>ĐANG TỔNG HỢP GIỌNG ĐỌC AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {randomResult ? "TẠO & NGHE THỬ PHIÊN BẢN KHÁC" : "TẠO & NGHE THỬ GIỌNG AI (PREVIEW)"}
                  </span>
                </>
              )}
            </button>

            {/* Kết quả sau khi tạo preview thành công */}
            {randomResult && (
              <div className="flex flex-col gap-3.5 p-4 rounded-xl bg-secondary/5 border border-secondary/25 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-label-caps text-secondary font-semibold flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" />
                    Bản nghe thử (Preview Audio)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono-data bg-white/10 text-on-surface-variant">
                    Seed #{randomResult.seed}
                  </span>
                </div>

                {/* Các tags thuộc tính đã áp dụng */}
                <div className="flex flex-wrap gap-1.5">
                  {randomResult.instruct.split(", ").map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-label-caps bg-secondary/15 text-secondary border border-secondary/30"
                    >
                      {TAG_LABELS[tag] ?? tag}
                    </span>
                  ))}
                </div>

                {/* Đoạn text preview đã đọc */}
                {randomResult.preview_text && (
                  <div className="text-xs italic text-on-surface/80 bg-black/30 p-2.5 rounded-lg border border-white/5">
                    "{randomResult.preview_text}"
                  </div>
                )}

                {/* Audio player */}
                <audio
                  key={randomResult.audio_url}
                  src={randomResult.audio_url}
                  controls
                  autoPlay
                  className="w-full rounded-lg h-9"
                  style={{ colorScheme: "dark" }}
                />

                {/* Form lưu giọng đã tạo */}
                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                  <p className="text-xs font-label-caps text-on-surface-variant">
                    Ưng ý giọng này? Lưu vào danh sách giọng đọc của bạn:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={randomName}
                      onChange={(e) => setRandomName(e.target.value)}
                      placeholder='VD: "Giọng Nữ Ấm Áp Studio"'
                      className="flex-1 bg-surface-dim border border-white/10 rounded-xl px-3 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/50 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleSaveRandom}
                      disabled={isSavingRandom || !randomName.trim()}
                      className="px-4 py-2 rounded-xl font-label-caps text-xs flex items-center gap-1.5 transition-all bg-secondary text-slate-900 font-bold hover:brightness-110 shadow-sm"
                    >
                      {isSavingRandom ? (
                        <span className="material-symbols-outlined text-[14px] animate-spin">
                          sync
                        </span>
                      ) : (
                        <span className="material-symbols-outlined text-[14px]">
                          save
                        </span>
                      )}
                      Lưu lại
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardRandom}
                      className="px-3 py-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 border border-white/5 transition-all"
                      title="Bỏ qua"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        close
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cột phải: Danh sách giọng tự tạo */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-card rounded-2xl p-6 shadow-2xl border border-white/5 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  library_music
                </span>
                <h3 className="font-label-caps text-label-caps text-on-surface font-semibold">
                  Giọng của tôi
                </h3>
              </div>
              <span className="text-xs font-mono-data px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-on-surface-variant">
                {customVoices.length} giọng
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
              {customVoices.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant font-mono-data text-xs border border-dashed border-white/10 rounded-xl bg-surface-dim">
                  Bạn chưa tạo giọng nào. Hãy nạp mẫu âm thanh ở bên trái để clone giọng đầu tiên!
                </div>
              ) : (
                customVoices.map((voice) => (
                  <div
                    key={voice.id}
                    className="flex flex-col gap-3 p-4 rounded-xl bg-surface-dim border border-white/5 hover:border-white/15 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 mr-2">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <span className="material-symbols-outlined text-[20px]">
                            {voice.icon || "person"}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-label-caps text-on-surface font-semibold truncate">
                            {voice.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-on-surface-variant/70 font-mono-data">
                              ID: {voice.id.replace("custom_", "")}
                            </span>
                            {voice.samples_count && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/30 font-semibold font-mono-data">
                                {voice.samples_count} mẫu ({voice.duration || 0}s)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(voice.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
                        title="Xoá giọng này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <audio
                      src={voice.url}
                      controls
                      className="w-full h-8 rounded"
                      style={{ colorScheme: "dark" }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
