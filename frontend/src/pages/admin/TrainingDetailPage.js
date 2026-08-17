import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { api, videoUrl, fmtTime } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, UploadCloud, Trash2, Plus, CheckCircle2, Clock } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40";

export default function TrainingDetailPage() {
  const { trainingId } = useParams();
  const [training, setTraining] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [passEnabled, setPassEnabled] = useState(false);
  // Önizleme üzerinden kontrol noktası ekleme akışı
  const [previewTime, setPreviewTime] = useState(0);
  const [previewPaused, setPreviewPaused] = useState(true);
  const [cpPanelOpen, setCpPanelOpen] = useState(false);
  const [cpAnchor, setCpAnchor] = useState(0); // panel açıldığı anda seçilen saniye
  const [cpInline, setCpInline] = useState({
    question_id: "",
    has_timeout: false,
    timeout_seconds: 60,
    on_fail: "start",
    attempts: 3,
    retry_exhausted: "start",
  });
  const [cpAdding, setCpAdding] = useState(false);
  // Kontrol noktası için soru kaynağı: havuzdan seç / yeni soru yaz (popup)
  const [cpSource, setCpSource] = useState("pool");
  const [cpQModal, setCpQModal] = useState(false);
  const [cpQForm, setCpQForm] = useState({ text: "", options: ["", ""], correct_index: 0 });
  const [cpQSaving, setCpQSaving] = useState(false);
  const fileRef = useRef(null);
  const previewRef = useRef(null);

  const load = useCallback(() => {
    api.get(`/trainings/${trainingId}`).then((r) => setTraining(r.data));
    api.get("/questions").then((r) => setQuestions(r.data));
  }, [trainingId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setSelectedIds(training?.quiz?.question_ids || []);
    setPassEnabled(training?.quiz?.pass_score != null);
  }, [training]);

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

  const removeCheckpoint = async (id) => {
    try {
      await saveCheckpoints(training.checkpoints.filter((c) => c.id !== id));
      toast.success("Kontrol noktası silindi");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kontrol noktası silinemedi");
    }
  };

  // Önizlemede seçili ana kontrol noktası ekleme paneli aç/kapat.
  const openCpPanel = () => {
    setCpAnchor(Math.floor(previewRef.current?.currentTime || 0));
    setCpInline({
      question_id: "",
      has_timeout: false,
      timeout_seconds: 60,
      on_fail: "start",
      attempts: 3,
      retry_exhausted: "start",
    });
    setCpSource("pool");
    setCpPanelOpen(true);
  };

  // Popup'tan yeni soru: soru havuzuna eklenir ve kontrol noktası için seçilir.
  const saveCpQuestion = async () => {
    setCpQSaving(true);
    try {
      const res = await api.post("/questions", {
        text: cpQForm.text,
        qtype: "multiple_choice",
        options: cpQForm.options.filter((o) => o.trim()),
        correct_index: cpQForm.correct_index,
        category: "",
      });
      setQuestions((prev) => [...prev, res.data]);
      setCpInline((f) => ({ ...f, question_id: res.data.question_id }));
      setCpQModal(false);
      setCpSource("pool");
      toast.success("Soru havuza eklendi ve kontrol noktası için seçildi");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Soru kaydedilemedi");
    } finally {
      setCpQSaving(false);
    }
  };

  const setCpQOption = (i, v) => setCpQForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));

  const addCheckpointFromPreview = async () => {
    if (!cpInline.question_id) return toast.error("Bir soru seçin");
    if (training.duration && cpAnchor >= training.duration) return toast.error("Süre video uzunluğunu aşıyor");
    setCpAdding(true);
    try {
      await saveCheckpoints([
        ...(training.checkpoints || []),
        {
          time: cpAnchor,
          question_id: cpInline.question_id,
          // null = süre sınırı yok
          timeout_seconds: cpInline.has_timeout ? Number(cpInline.timeout_seconds) || 60 : null,
          on_fail: cpInline.on_fail,
          attempts: cpInline.on_fail === "retry_limited" ? Number(cpInline.attempts) || 3 : null,
          retry_exhausted: cpInline.retry_exhausted,
        },
      ]);
      toast.success(`Kontrol noktası eklendi (${fmtTime(cpAnchor)})`);
      setCpPanelOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kontrol noktası eklenemedi");
    } finally {
      setCpAdding(false);
    }
  };

  // Seçim önce yerelde tutulur; "Seçili Soruları Eğitime Ekle" ile kaydedilir.
  const toggleQuizQuestion = (qid) => {
    setSelectedIds((prev) => (prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]));
  };

  const saveQuizQuestions = async () => {
    setSavingQuiz(true);
    try {
      // Yalnızca soru listesi gönderilir; geçme notu ayrı akışta güncellenir.
      const res = await api.put(`/trainings/${trainingId}`, { quiz: { question_ids: selectedIds } });
      setTraining(res.data);
      toast.success(`Sınav güncellendi (${selectedIds.length} soru)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sınav soruları kaydedilemedi");
    } finally {
      setSavingQuiz(false);
    }
  };

  const setPassScore = async (v) => {
    try {
      // Yalnızca geçme notu gönderilir; soru listesi bu akışta değişmez.
      const res = await api.put(`/trainings/${trainingId}`, { quiz: { pass_score: v === "" ? null : Number(v) } });
      setTraining(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Geçme notu kaydedilemedi");
    }
  };

  if (!training) return <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />;

  const qById = Object.fromEntries(questions.map((q) => [q.question_id, q]));
  const savedIds = training.quiz?.question_ids || [];
  const quizDirty = selectedIds.length !== savedIds.length || selectedIds.some((id) => !savedIds.includes(id));

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
              <video
                ref={previewRef}
                src={videoUrl(training.training_id)}
                controls
                className="w-full rounded-xl bg-black"
                data-testid="admin-video-preview"
                onTimeUpdate={() => setPreviewTime(previewRef.current?.currentTime || 0)}
                onPause={() => setPreviewPaused(true)}
                onPlay={() => setPreviewPaused(false)}
              />

              {/* Kontrol noktası şeridi: sarı işaretlere tıklayınca o ana gider */}
              {(training.checkpoints || []).length > 0 && training.duration > 0 && (
                <div className="relative h-2 mt-3 rounded-full bg-gray-100" data-testid="cp-preview-strip">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-[#007AFF]/30" style={{ width: `${Math.min(100, (previewTime / training.duration) * 100)}%` }} />
                  {(training.checkpoints || []).map((cp) => (
                    <button
                      key={cp.id}
                      data-testid={`cp-preview-marker-${cp.id}`}
                      title={`${fmtTime(cp.time)} · ${qById[cp.question_id]?.text || "Soru silinmiş"}`}
                      onClick={() => {
                        const v = previewRef.current;
                        if (!v) return;
                        v.currentTime = cp.time;
                        v.pause();
                        setPreviewTime(cp.time);
                      }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-400 border-2 border-white shadow hover:scale-125 transition-transform"
                      style={{ left: `${Math.min(100, (cp.time / training.duration) * 100)}%` }}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-400">Süre: {fmtTime(training.duration)} · {(training.video_size / 1024 / 1024).toFixed(1)} MB</p>
                <button data-testid="replace-video-btn" onClick={() => fileRef.current?.click()} className="text-sm text-[#007AFF] font-medium hover:underline">Videoyu değiştir</button>
              </div>

              {/* Duraklatılan ana kontrol noktası ekleme */}
              {previewPaused && !cpPanelOpen && (
                <div className="flex items-center justify-between mt-3 px-4 py-3 rounded-xl bg-[#F7F7F5] border n-hairline fade-up">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-[#007AFF]" /> Seçilen an: <span className="font-medium text-gray-900">{fmtTime(Math.floor(previewTime))}</span>
                  </span>
                  <button data-testid="cp-preview-add-btn" className={btnPrimary + " !px-4 !py-2"} onClick={openCpPanel}>
                    <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Kontrol Noktası Ekle</span>
                  </button>
                </div>
              )}

              {cpPanelOpen && (
                <div className="mt-3 p-5 rounded-xl bg-[#F7F7F5] border n-hairline space-y-3 fade-up" data-testid="cp-preview-panel">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#007AFF]" /> {fmtTime(cpAnchor)} noktasına kontrol noktası
                    </p>
                    <button data-testid="cp-preview-cancel-btn" onClick={() => setCpPanelOpen(false)} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">Vazgeç</button>
                  </div>
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-source-new"
                        type="radio"
                        name="cp-question-source"
                        className="accent-black"
                        checked={cpSource === "new"}
                        onChange={() => { setCpSource("new"); setCpQForm({ text: "", options: ["", ""], correct_index: 0 }); setCpQModal(true); }}
                      />
                      Yeni bir soru yazmak istiyorum
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-source-pool"
                        type="radio"
                        name="cp-question-source"
                        className="accent-black"
                        checked={cpSource === "pool"}
                        onChange={() => setCpSource("pool")}
                      />
                      Soru havuzundan seçmek istiyorum
                    </label>
                  </div>
                  {cpSource === "pool" && (
                  <>
                  <select data-testid="cp-preview-question-select" className={inputCls} value={cpInline.question_id} onChange={(e) => setCpInline({ ...cpInline, question_id: e.target.value })}>
                    <option value="">Sorulacak soruyu seçin...</option>
                    {/* Serbest metin soruların doğru cevabı olmadığı için kontrol noktasında kullanılamaz */}
                    {questions.filter((q) => q.qtype === "multiple_choice").map((q) => <option key={q.question_id} value={q.question_id}>{q.text.slice(0, 80)}</option>)}
                  </select>
                  {cpInline.question_id && qById[cpInline.question_id] && (
                    <div className="space-y-1.5">
                      {(qById[cpInline.question_id].options || []).map((o, i) => {
                        const correct = i === qById[cpInline.question_id].correct_index;
                        return (
                          <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-black/5 bg-white text-gray-600"}`}>
                            <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${correct ? "text-emerald-500" : "text-gray-200"}`} />
                            {o}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-preview-no-timeout"
                        type="radio"
                        name="cp-timeout-mode"
                        className="accent-black"
                        checked={!cpInline.has_timeout}
                        onChange={() => setCpInline({ ...cpInline, has_timeout: false })}
                      />
                      Süre sınırı yok
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-preview-has-timeout"
                        type="radio"
                        name="cp-timeout-mode"
                        className="accent-black"
                        checked={cpInline.has_timeout}
                        onChange={() => setCpInline({ ...cpInline, has_timeout: true })}
                      />
                      Süre sınırı var
                    </label>
                  </div>
                  {cpInline.has_timeout && (
                    <div className="flex items-center gap-2 fade-up">
                      <input data-testid="cp-preview-timeout-input" type="number" min="5" max="600" className={inputCls + " w-28"} value={cpInline.timeout_seconds} onChange={(e) => setCpInline({ ...cpInline, timeout_seconds: e.target.value })} />
                      <span className="text-xs text-gray-400 whitespace-nowrap">saniye içinde cevaplanmalı</span>
                    </div>
                  )}
                  <select data-testid="cp-preview-onfail-select" className={inputCls} value={cpInline.on_fail} onChange={(e) => setCpInline({ ...cpInline, on_fail: e.target.value })}>
                    <option value="start">Başarısızsa: Başa dön</option>
                    <option value="previous">Başarısızsa: Önceki nokta</option>
                    <option value="retry_limited">Başarısızsa: Deneme hakkı olsun</option>
                    <option value="retry">Başarısızsa: Doğru yapana kadar deneyebilsin</option>
                  </select>
                  {cpInline.on_fail === "retry_limited" && (
                    <div className="space-y-3 fade-up">
                      <div className="flex items-center gap-2">
                        <input data-testid="cp-preview-attempts-input" type="number" min="1" max="20" className={inputCls + " w-28"} value={cpInline.attempts} onChange={(e) => setCpInline({ ...cpInline, attempts: e.target.value })} />
                        <span className="text-xs text-gray-400 whitespace-nowrap">deneme hakkı</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 whitespace-nowrap">Haklar bitince:</span>
                        <select
                          data-testid="cp-preview-retry-exhausted-select"
                          className={inputCls}
                          value={cpInline.retry_exhausted}
                          onChange={(e) => setCpInline({ ...cpInline, retry_exhausted: e.target.value })}
                        >
                          <option value="start">Video başa dönsün</option>
                          <option value="previous">Bir önceki kontrol noktasına dönsün</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <button data-testid="cp-preview-save-btn" className={btnPrimary + " w-full"} disabled={cpAdding || !cpInline.question_id} onClick={addCheckpointFromPreview}>
                    <span className="flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> {cpAdding ? "Ekleniyor..." : `${fmtTime(cpAnchor)} Noktasına Ekle`}
                    </span>
                  </button>
                  </>
                  )}
                </div>
              )}
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
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {cp.timeout_seconds != null ? `${cp.timeout_seconds}sn` : "Süresiz"} · {
                    { start: "Başa dön", previous: "Önceki nokta", retry: "Doğru yapana kadar", retry_limited: `${cp.attempts} deneme · sonra ${cp.retry_exhausted === "previous" ? "önceki nokta" : "başa dön"}` }[cp.on_fail] || "Başa dön"
                  }
                </span>
                <button data-testid={`delete-checkpoint-${cp.id}`} onClick={() => removeCheckpoint(cp.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Yeni kontrol noktası eklemek için soldaki önizlemede videoyu istediğiniz anda duraklatıp "Kontrol Noktası Ekle" butonunu kullanın.
          </p>
        </div>

        {/* QUIZ */}
        <div className="n-card p-8 xl:col-span-2">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="text-lg font-medium tracking-tight text-gray-900 mb-1">Eğitim Sonu Sınavı</h2>
              <p className="text-sm text-gray-400">
                Soru havuzundan sınava soru seçin. {selectedIds.length} soru seçildi.
                {quizDirty && <span className="text-amber-500"> · Kaydedilmemiş değişiklik var</span>}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
                <input
                  data-testid="quiz-pass-score-toggle"
                  type="checkbox"
                  className="accent-black"
                  checked={passEnabled}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setPassEnabled(true);
                    } else {
                      setPassEnabled(false);
                      if (training.quiz?.pass_score != null) setPassScore("");
                    }
                  }}
                />
                Geçme notu uygula
              </label>
              {passEnabled && (
                <div className="flex items-center gap-2">
                  <input data-testid="quiz-pass-score-input" type="number" min="0" max="100" step="10" list="pass-score-options"
                    className={inputCls + " w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"}
                    placeholder="%"
                    value={training.quiz?.pass_score ?? ""} onChange={(e) => setPassScore(e.target.value)} />
                  <datalist id="pass-score-options">
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => <option key={v} value={v} />)}
                  </datalist>
                  <span className="text-sm text-gray-400">%</span>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {questions.length === 0 && <p className="text-sm text-gray-400">Soru havuzu boş. Önce <Link to="/admin/questions" className="text-[#007AFF] hover:underline">soru ekleyin</Link>.</p>}
            {questions.map((q) => {
              const selected = selectedIds.includes(q.question_id);
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
          {questions.length > 0 && (
            <div className="flex items-center justify-end mt-6">
              <button
                data-testid="quiz-save-questions-btn"
                className={btnPrimary}
                disabled={savingQuiz || !quizDirty}
                onClick={saveQuizQuestions}
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {savingQuiz ? "Kaydediliyor..." : "Seçili Soruları Eğitime Ekle"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kontrol noktası için yeni soru popup'ı (soru havuzuna da eklenir) */}
      <Dialog open={cpQModal} onOpenChange={(o) => { if (!o) { setCpQModal(false); setCpSource("pool"); } }}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>Yeni Soru</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <textarea data-testid="cp-question-text-input" className={inputCls + " min-h-[80px]"} placeholder="Soru metni" value={cpQForm.text} onChange={(e) => setCpQForm({ ...cpQForm, text: e.target.value })} />
            <select data-testid="cp-question-type-select" className={inputCls} value="multiple_choice" disabled>
              <option value="multiple_choice">Çoktan Seçmeli</option>
            </select>
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Seçenekler — doğru cevabı işaretleyin</p>
              {cpQForm.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" data-testid={`cp-correct-option-${i}`} name="cp-q-correct" checked={cpQForm.correct_index === i} onChange={() => setCpQForm({ ...cpQForm, correct_index: i })} className="accent-emerald-600" />
                  <input data-testid={`cp-option-input-${i}`} className={inputCls} placeholder={`Seçenek ${i + 1}`} value={o} onChange={(e) => setCpQOption(i, e.target.value)} />
                  {cpQForm.options.length > 2 && (
                    <button onClick={() => setCpQForm({ ...cpQForm, options: cpQForm.options.filter((_, j) => j !== i), correct_index: 0 })} className="p-2 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
              <button data-testid="cp-add-option-btn" onClick={() => setCpQForm({ ...cpQForm, options: [...cpQForm.options, ""] })} className="text-sm text-[#007AFF] font-medium hover:underline">+ Seçenek ekle</button>
            </div>
            <button
              data-testid="cp-question-save-btn"
              className={btnPrimary + " w-full"}
              disabled={cpQSaving || !cpQForm.text.trim() || cpQForm.options.filter((o) => o.trim()).length < 2}
              onClick={saveCpQuestion}
            >
              {cpQSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
