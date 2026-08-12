import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { api, videoUrl, fmtTime } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { ArrowLeft, UploadCloud, Trash2, Plus, CheckCircle2, Clock } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40";

export default function TrainingDetailPage() {
  const { trainingId } = useParams();
  const [training, setTraining] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [cpForm, setCpForm] = useState({ min: 0, sec: 30, question_id: "", timeout_seconds: 60, on_fail: "start" });
  const fileRef = useRef(null);

  const load = useCallback(() => {
    api.get(`/trainings/${trainingId}`).then((r) => setTraining(r.data));
    api.get("/questions").then((r) => setQuestions(r.data));
  }, [trainingId]);
  useEffect(() => { load(); }, [load]);

  const uploadVideo = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp4")) return toast.error("Sadece MP4 formatı destekleniyor");
    if (file.size > 250 * 1024 * 1024) return toast.error("Video 250MB sınırını aşıyor");
    const duration = await new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration || 0); };
      v.onerror = () => resolve(0);
      v.src = URL.createObjectURL(file);
    });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("duration", duration);
    setUploading(1);
    try {
      await api.post(`/trainings/${trainingId}/video`, fd, {
        onUploadProgress: (e) => setUploading(Math.max(1, Math.round((e.loaded / e.total) * 100))),
      });
      toast.success("Video yüklendi");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Video yüklenemedi");
    } finally {
      setUploading(0);
    }
  };

  const saveCheckpoints = async (checkpoints) => {
    const res = await api.put(`/trainings/${trainingId}`, { checkpoints });
    setTraining(res.data);
  };

  const addCheckpoint = async () => {
    const time = cpForm.min * 60 + Number(cpForm.sec);
    if (!cpForm.question_id) return toast.error("Bir soru seçin");
    if (training.duration && time >= training.duration) return toast.error("Süre video uzunluğunu aşıyor");
    await saveCheckpoints([...(training.checkpoints || []), { time, question_id: cpForm.question_id, timeout_seconds: Number(cpForm.timeout_seconds), on_fail: cpForm.on_fail }]);
    toast.success("Kontrol noktası eklendi");
  };

  const removeCheckpoint = async (id) => {
    await saveCheckpoints(training.checkpoints.filter((c) => c.id !== id));
    toast.success("Kontrol noktası silindi");
  };

  const toggleQuizQuestion = async (qid) => {
    const quiz = training.quiz || { question_ids: [], pass_score: null };
    const ids = quiz.question_ids.includes(qid) ? quiz.question_ids.filter((x) => x !== qid) : [...quiz.question_ids, qid];
    const res = await api.put(`/trainings/${trainingId}`, { quiz: { ...quiz, question_ids: ids } });
    setTraining(res.data);
  };

  const setPassScore = async (v) => {
    const quiz = training.quiz || { question_ids: [], pass_score: null };
    const res = await api.put(`/trainings/${trainingId}`, { quiz: { ...quiz, pass_score: v === "" ? null : Number(v) } });
    setTraining(res.data);
  };

  if (!training) return <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />;

  const qById = Object.fromEntries(questions.map((q) => [q.question_id, q]));
  const quizIds = training.quiz?.question_ids || [];

  return (
    <div className="fade-up" data-testid="training-detail-page">
      <Link to="/admin/trainings" data-testid="back-to-trainings" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Eğitimlere Dön
      </Link>
      <PageHeader overline="Eğitim Düzenleyici" title={training.title} subtitle={training.description} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* VIDEO */}
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-gray-900 mb-6">Eğitim Videosu</h2>
          {training.video_filename ? (
            <div>
              <video src={videoUrl(training.training_id)} controls className="w-full rounded-xl bg-black" data-testid="admin-video-preview" />
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-400">Süre: {fmtTime(training.duration)} · {(training.video_size / 1024 / 1024).toFixed(1)} MB</p>
                <button data-testid="replace-video-btn" onClick={() => fileRef.current?.click()} className="text-sm text-[#007AFF] font-medium hover:underline">Videoyu değiştir</button>
              </div>
            </div>
          ) : (
            <button
              data-testid="video-upload-area"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-16 flex flex-col items-center gap-3 hover:border-[#007AFF] hover:bg-blue-50/30 transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                <UploadCloud className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">MP4 video yükleyin</p>
              <p className="text-xs text-gray-400">Maksimum 250MB</p>
            </button>
          )}
          {uploading > 0 && (
            <div className="mt-4">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#007AFF] rounded-full transition-[width]" style={{ width: `${uploading}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">Yükleniyor... %{uploading}</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="video/mp4" className="hidden" data-testid="video-file-input" onChange={(e) => uploadVideo(e.target.files?.[0])} />
        </div>

        {/* CHECKPOINTS */}
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-gray-900 mb-1">Kontrol Noktaları</h2>
          <p className="text-sm text-gray-400 mb-6">Video belirtilen sürede durur ve soru sorar.</p>
          <div className="space-y-3 mb-6">
            {(training.checkpoints || []).length === 0 && <p className="text-sm text-gray-400">Henüz kontrol noktası yok.</p>}
            {(training.checkpoints || []).map((cp) => (
              <div key={cp.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#F7F7F5] border n-hairline" data-testid={`checkpoint-item-${cp.id}`}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900 tabular-nums"><Clock className="w-3.5 h-3.5 text-[#007AFF]" />{fmtTime(cp.time)}</span>
                <p className="flex-1 text-sm text-gray-600 truncate">{qById[cp.question_id]?.text || "Soru silinmiş"}</p>
                <span className="text-xs text-gray-400 whitespace-nowrap">{cp.timeout_seconds}sn · {cp.on_fail === "start" ? "Başa dön" : "Önceki nokta"}</span>
                <button data-testid={`delete-checkpoint-${cp.id}`} onClick={() => removeCheckpoint(cp.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="border-t border-black/5 pt-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input data-testid="cp-min-input" type="number" min="0" className={inputCls} value={cpForm.min} onChange={(e) => setCpForm({ ...cpForm, min: Number(e.target.value) })} />
                <span className="text-xs text-gray-400">dk</span>
                <input data-testid="cp-sec-input" type="number" min="0" max="59" className={inputCls} value={cpForm.sec} onChange={(e) => setCpForm({ ...cpForm, sec: Number(e.target.value) })} />
                <span className="text-xs text-gray-400">sn</span>
              </div>
              <div className="flex items-center gap-2">
                <input data-testid="cp-timeout-input" type="number" min="10" className={inputCls} value={cpForm.timeout_seconds} onChange={(e) => setCpForm({ ...cpForm, timeout_seconds: e.target.value })} />
                <span className="text-xs text-gray-400 whitespace-nowrap">sn süre</span>
              </div>
            </div>
            <select data-testid="cp-question-select" className={inputCls} value={cpForm.question_id} onChange={(e) => setCpForm({ ...cpForm, question_id: e.target.value })}>
              <option value="">Soru seçin...</option>
              {questions.map((q) => <option key={q.question_id} value={q.question_id}>{q.text.slice(0, 80)}</option>)}
            </select>
            <select data-testid="cp-onfail-select" className={inputCls} value={cpForm.on_fail} onChange={(e) => setCpForm({ ...cpForm, on_fail: e.target.value })}>
              <option value="start">Başarısızsa: Videonun başına dön</option>
              <option value="previous">Başarısızsa: Önceki kontrol noktasına dön</option>
            </select>
            <button data-testid="add-checkpoint-btn" className={btnPrimary + " w-full"} disabled={!training.video_filename} onClick={addCheckpoint}>
              <span className="flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Kontrol Noktası Ekle</span>
            </button>
            {!training.video_filename && <p className="text-xs text-amber-500">Önce video yükleyin.</p>}
          </div>
        </div>

        {/* QUIZ */}
        <div className="n-card p-8 xl:col-span-2">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="text-lg font-medium tracking-tight text-gray-900 mb-1">Eğitim Sonu Sınavı</h2>
              <p className="text-sm text-gray-400">Soru havuzundan sınava soru seçin. {quizIds.length} soru seçildi.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500">Geçme notu (%)</label>
              <input data-testid="quiz-pass-score-input" type="number" min="0" max="100" className={inputCls + " w-24"} placeholder="Yok"
                value={training.quiz?.pass_score ?? ""} onChange={(e) => setPassScore(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {questions.length === 0 && <p className="text-sm text-gray-400">Soru havuzu boş. Önce <Link to="/admin/questions" className="text-[#007AFF] hover:underline">soru ekleyin</Link>.</p>}
            {questions.map((q) => {
              const selected = quizIds.includes(q.question_id);
              return (
                <button
                  key={q.question_id}
                  data-testid={`quiz-question-toggle-${q.question_id}`}
                  onClick={() => toggleQuizQuestion(q.question_id)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-colors ${selected ? "border-[#007AFF] bg-blue-50/50" : "border-black/5 bg-[#F7F7F5] hover:bg-[#F1F1EF]"}`}
                >
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${selected ? "text-[#007AFF]" : "text-gray-300"}`} />
                  <span className="text-sm text-gray-800 flex-1">{q.text}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{q.qtype === "multiple_choice" ? "Seçmeli" : "Metin"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
