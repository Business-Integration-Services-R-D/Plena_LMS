import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { http } from "@/lib/api";

const LEGACY_MAX_BYTES = 1024 * 1024 * 1024;
const initialUpload = {
  status: "idle",
  courseId: null,
  fileName: "",
  progress: 0,
  error: "",
};

const VideoUploadContext = createContext(null);

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const waitUntilOnline = async () => {
  if (navigator.onLine) return;
  await new Promise((resolve) => window.addEventListener("online", resolve, { once: true }));
};

const shouldRetry = (error) => {
  const status = error.response?.status;
  return !status || status === 408 || status === 409 || status === 429 || status >= 500;
};

const withRetry = async (operation, attempts = 4) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await waitUntilOnline();
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === attempts - 1) throw error;
      await delay(Math.min(5000, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
};

const errorText = (error) =>
  error.response?.data?.error || error.response?.data?.detail || "Video yüklenemedi";

function UploadStatusCard({ upload, dismiss }) {
  const navigate = useNavigate();
  if (upload.status === "idle") return null;
  const active = upload.status === "uploading" || upload.status === "finalizing";
  const succeeded = upload.status === "completed";

  return (
    <div
      className="fixed z-[100] right-4 bottom-4 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-navy-900/10 bg-white p-4 shadow-[0_20px_55px_-20px_rgba(14,32,51,0.45)]"
      data-testid="background-video-upload"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${succeeded ? "bg-emerald-50 text-emerald-600" : upload.status === "error" ? "bg-red-50 text-red-500" : "bg-brand-50 text-brand-600"}`}>
          {succeeded ? <CheckCircle2 className="h-5 w-5" /> : upload.status === "error" ? <AlertCircle className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy-950">
                {upload.status === "finalizing" ? "Video hazırlanıyor" : succeeded ? "Video yüklendi" : upload.status === "error" ? "Yükleme durdu" : "Video yükleniyor"}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{upload.fileName}</p>
            </div>
            {!active && (
              <button type="button" onClick={dismiss} aria-label="Yükleme bildirimini kapat" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {active && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${upload.progress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                %{upload.progress} · Uygulamada gezinirken yükleme devam eder
              </p>
            </>
          )}
          {upload.status === "error" && <p className="mt-2 text-xs text-red-600">{upload.error}</p>}
          {!active && upload.courseId && (
            <button type="button" onClick={() => navigate(`/admin/trainings/${upload.courseId}`)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
              Eğitime git
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function VideoUploadProvider({ children }) {
  const [upload, setUpload] = useState(initialUpload);
  const activeRef = useRef(false);

  const dismiss = useCallback(() => {
    if (!activeRef.current) setUpload(initialUpload);
  }, []);

  const startVideoUpload = useCallback(({ courseId, file, durationSec }) => {
    if (activeRef.current) {
      toast.error("Önce devam eden video yüklemesinin tamamlanmasını bekleyin");
      return false;
    }
    activeRef.current = true;
    setUpload({
      status: "uploading",
      courseId,
      fileName: file.name,
      progress: 1,
      error: "",
    });

    const setProgress = (progress) =>
      setUpload((current) => ({ ...current, progress: Math.max(current.progress, Math.min(98, Math.round(progress))) }));

    const run = async () => {
      try {
        let session;
        try {
          const response = await http.post(`/admin/courses/${courseId}/video/uploads`, {
            fileName: file.name,
            fileSize: file.size,
            durationSec,
          });
          session = response.data;
        } catch (error) {
          const unavailable = error.response?.status === 501 && error.response?.data?.code === "CHUNKED_UPLOAD_UNAVAILABLE";
          if (!unavailable || file.size > LEGACY_MAX_BYTES) throw error;
          const formData = new FormData();
          formData.append("file", file);
          formData.append("duration", durationSec);
          const legacy = await http.post(`/admin/courses/${courseId}/video`, formData, {
            onUploadProgress: (event) => {
              if (event.total) setProgress((event.loaded / event.total) * 98);
            },
          });
          return legacy.data;
        }

        let uploadedBytes = 0;
        for (let index = 0; index < session.totalChunks; index += 1) {
          const start = index * session.chunkSize;
          const chunk = file.slice(start, Math.min(file.size, start + session.chunkSize));
          await withRetry(() =>
            http.put(
              `/admin/courses/${courseId}/video/uploads/${session.uploadId}/chunks/${index}`,
              chunk,
              {
                headers: { "Content-Type": "application/octet-stream" },
                onUploadProgress: (event) => {
                  setProgress(((uploadedBytes + event.loaded) / file.size) * 98);
                },
              },
            ),
          );
          uploadedBytes += chunk.size;
          setProgress((uploadedBytes / file.size) * 98);
        }

        setUpload((current) => ({ ...current, status: "finalizing", progress: 99 }));
        const completed = await withRetry(
          () => http.post(`/admin/courses/${courseId}/video/uploads/${session.uploadId}/complete`),
          12,
        );
        return completed.data;
      } catch (error) {
        const message = errorText(error);
        setUpload((current) => ({ ...current, status: "error", error: message }));
        toast.error(message);
        return null;
      } finally {
        activeRef.current = false;
      }
    };

    void run().then((result) => {
      if (!result) return;
      setUpload((current) => ({ ...current, status: "completed", progress: 100 }));
      toast.success(
        result.processingStatus === "QUEUED"
          ? "Video kullanıma hazır; arka planda optimize ediliyor"
          : "Video yüklendi",
      );
      window.dispatchEvent(
        new CustomEvent("video-upload-completed", { detail: { courseId } }),
      );
    });
    return true;
  }, []);

  return (
    <VideoUploadContext.Provider value={{ upload, startVideoUpload, dismiss }}>
      {children}
      <UploadStatusCard upload={upload} dismiss={dismiss} />
    </VideoUploadContext.Provider>
  );
}

export function useVideoUpload() {
  const value = useContext(VideoUploadContext);
  if (!value) throw new Error("useVideoUpload must be used inside VideoUploadProvider");
  return value;
}
