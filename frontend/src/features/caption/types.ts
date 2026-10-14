import { Upload, FileText, Download } from "lucide-react";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface CaptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordTiming[];
  customPositionY?: number; // Vị trí dọc riêng cho đoạn này (10% - 90%)
}

export interface StyleConfig {
  font_name: string;
  font_size: number;
  primary_color: string;
  highlight_color: string;
  outline_color: string;
  outline_size: number;
  position_y: number; // Phần trăm từ đỉnh xuống đáy (10% - 90%)
}

export const DEFAULT_STYLE: StyleConfig = {
  font_name: "Be Vietnam Pro",
  font_size: 26,
  primary_color: "#FFFFFF",
  highlight_color: "#ec6f09",
  outline_color: "#000000",
  outline_size: 3,
  position_y: 85,
};

export const SYSTEM_FONTS = [
  { name: "Be Vietnam Pro", label: "Be Vietnam Pro (Chuẩn tiếng Việt)" },
  { name: "Montserrat", label: "Montserrat (Hiện đại, sang trọng)" },
  { name: "Anton", label: "Anton (Chữ to, Shorts/Reels hot)" },
  { name: "Inter", label: "Inter (Sạch sẽ, tinh tế)" },
  { name: "Roboto", label: "Roboto (Rõ nét, chuẩn mực)" },
  { name: "Lexend", label: "Lexend (Dễ đọc lướt)" },
  { name: "Playfair Display", label: "Playfair Display (Nghệ thuật)" },
  { name: "Arial", label: "Arial Bold (Cơ bản)" },
];

export const DRAFT_STORAGE_KEY = "autocaption_latest_draft";

export const STEPS = [
  {
    id: 1 as const,
    title: "1. Nạp Video & Kịch bản",
    desc: "Tải file & bóc tách AI",
    icon: Upload,
  },
  {
    id: 2 as const,
    title: "2. Biên tập & Kiểu dáng",
    desc: "Chỉnh từ, timeline, font & vị trí Y",
    icon: FileText,
  },
  {
    id: 3 as const,
    title: "3. Xem trước & Xuất Video",
    desc: "Render video MP4 & tải SRT/VTT",
    icon: Download,
  },
];
