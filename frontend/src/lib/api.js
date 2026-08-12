import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

export const videoUrl = (trainingId) => `${BACKEND_URL}/api/videos/${trainingId}`;

export const fmtTime = (s) => {
  if (s == null || isNaN(s)) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export const fmtDate = (iso) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

export const STATUS_TR = {
  assigned: "Atandı",
  in_progress: "Devam Ediyor",
  video_completed: "Video Bitti",
  completed: "Tamamlandı",
};

export const STATUS_COLOR = {
  assigned: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-50 text-blue-600",
  video_completed: "bg-amber-50 text-amber-600",
  completed: "bg-emerald-50 text-emerald-600",
};
