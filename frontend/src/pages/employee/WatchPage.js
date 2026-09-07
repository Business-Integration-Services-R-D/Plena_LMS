import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, fmtTime } from "@/lib/api";
import VideoPlayer from "@/components/VideoPlayer";
import PdfPlayer from "@/components/PdfPlayer";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, PartyPopper } from "lucide-react";

const btnPrimary = "px-8 py-3 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";

// Sınav cevapları gönderilene kadar tarayıcıda tutulur; sayfa yenilenirse kaybolmaz.
const draftKey = (assignmentId) => `plena.quiz-draft.${assignmentId}`;

const readQuizDraft = (assignmentId) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(draftKey(assignmentId)));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeQuizDraft = (assignmentId, answers) => {
  try {
    if (Object.keys(answers).length === 0) localStorage.removeItem(draftKey(assignmentId));
    else localStorage.setItem(draftKey(assignmentId), JSON.stringify(answers));
  } catch {}
};

export default function WatchPage() {
  const { assignmentId } = useParams();
  const [data, setData] = useState(null);
  const [stage, setStage] = useState(null); // content | quiz | result | done
  const [quizAnswers, setQuizAnswers] = useState(() => readQuizDraft(assignmentId));
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get(`/learn/${assignmentId}`);
    setData(res.data);
    const { progress, training, assignment } = res.data;
    if (assignment.status === "completed") setStage("done");
    else if (progress.video_completed && training.quiz) setStage("quiz");
    else setStage("content");
  }, [assignmentId]);

  useEffect(() => { load().catch(() => toast.error("Eğitim yüklenemedi")); }, [load]);

  // Başka bir eğitime geçildiğinde o eğitimin taslağı yüklenir.
  useEffect(() => { setQuizAnswers(readQuizDraft(assignmentId)); }, [assignmentId]);

  // Sorular değişmişse (havuz güncellenmiş olabilir) artık geçersiz cevaplar atılır.
  useEffect(() => {
    const questions = data?.training?.quiz?.questions;
    if (!questions?.length) return;
    const ids = new Set(questions.map((q) => q.question_id));
    setQuizAnswers((prev) => {
      const kept = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
      return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
    });
  }, [data]);

  useEffect(() => { writeQuizDraft(assignmentId, quizAnswers); }, [assignmentId, quizAnswers]);

  const onHeartbeat = useCallback(async (position, playing) => {
    const res = await api.post(`/learn/${assignmentId}/heartbeat`, { position, playing });
    return res.data;
  }, [assignmentId]);

  const onEvent = useCallback((type, position) => {
    api.post(`/learn/${assignmentId}/event`, { type, position }).catch(() => {});
  }, [assignmentId]);

  const onCheckpoint = useCallback(async (cp, answer, timedOut) => {
    const res = await api.post(`/learn/${assignmentId}/checkpoint`, {
      checkpoint_id: cp.id,
      answer_index: answer.index,
      answer_text: answer.text || null,
      timed_out: timedOut,
    });
    return res.data;
  }, [assignmentId]);

  const onEnded = useCallback(async () => {
    try {
      const res = await api.post(`/learn/${assignmentId}/video-complete`);
      if (res.data.has_quiz) {
        toast.success("Eğitim içeriği tamamlandı! Şimdi sınav zamanı.");
        // Sınav soruları içerik tamamlandıktan sonra erişilebilir olur;
        // veriyi yeniden yükleyerek soruları al (stage'i load belirler).
        await load();
      } else {
        toast.success("Eğitim tamamlandı!");
        setStage("done");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Eğitim içeriği tamamlanamadı");
    }
  }, [assignmentId, load]);

  const submitQuiz = async () => {
    setSubmitting(true);
    try {
      const answers = data.training.quiz.questions.map((q) => ({
        question_id: q.question_id,
        answer_index: quizAnswers[q.question_id]?.index ?? null,
        answer_text: quizAnswers[q.question_id]?.text ?? null,
      }));
      const res = await api.post(`/learn/${assignmentId}/quiz`, { answers });
      setQuizAnswers({});
      setResult(res.data);
      setStage("result");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sınav gönderilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) return <div className="w-6 h-6 border-2 border-slate-200 border-t-navy-900 rounded-full animate-spin" />;

  const { training } = data;
  const quiz = training.quiz;
  const allAnswered = quiz?.questions.every((q) =>
    q.qtype === "multiple_choice" ? quizAnswers[q.question_id]?.index != null : (quizAnswers[q.question_id]?.text || "").trim()
  );

  return (
    <div
      className={`fade-up ${training.content_type === "pdf" ? "w-full max-w-none" : "max-w-4xl"}`}
      data-testid="watch-page"
    >
      <Link to="/trainings" data-testid="back-to-my-trainings" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-navy-950 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Eğitimlerim
      </Link>
      <p className="text-xs uppercase tracking-[0.2em] font-medium text-brand-600 mb-2">Eğitim</p>
      <h1 className="text-3xl font-semibold tracking-tight text-navy-950 mb-2">{training.title}</h1>
      {training.description && <p className="text-base text-slate-500 mb-8 max-w-2xl">{training.description}</p>}

      {stage === "content" && (
        <div>
          {training.content_type === "pdf" ? (
            <PdfPlayer
              trainingId={training.training_id}
              pageCount={training.pdf_page_count}
              checkpoints={training.checkpoints}
              initialProgress={data.progress}
              onHeartbeat={onHeartbeat}
              onCheckpoint={onCheckpoint}
              onEnded={onEnded}
            />
          ) : (
            <VideoPlayer
              trainingId={training.training_id}
              duration={training.duration}
              checkpoints={training.checkpoints}
              initialProgress={data.progress}
              onHeartbeat={onHeartbeat}
              onEvent={onEvent}
              onCheckpoint={onCheckpoint}
              onEnded={onEnded}
            />
          )}
          <div className="mt-6 n-card p-6 flex items-center gap-6 flex-wrap">
            <p className="text-sm text-slate-500">
              <span className="font-medium text-navy-950">{training.checkpoints.length}</span> kontrol noktası
            </p>
            <p className="text-sm text-slate-500">
              {training.content_type === "pdf" ? (
                <>Uzunluk: <span className="font-medium text-navy-950">{training.pdf_page_count} sayfa</span></>
              ) : (
                <>Süre: <span className="font-medium text-navy-950">{fmtTime(training.duration)}</span></>
              )}
            </p>
            {quiz && <p className="text-sm text-slate-500">İçerik sonunda <span className="font-medium text-navy-950">{quiz.question_count ?? quiz.questions.length} soruluk sınav</span> var</p>}
            <p className="text-xs text-slate-400 ml-auto">
              {training.content_type === "pdf" ? "Sayfalar sırayla ilerler" : "İleri sarma kapalıdır"} · İlerlemeniz kayıt altına alınır
            </p>
          </div>
        </div>
      )}

      {stage === "quiz" && quiz && (
        <div className="space-y-5" data-testid="quiz-view">
          <div className="n-card p-6 flex items-center gap-3 flex-wrap">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <p className="text-sm text-slate-700">Eğitim içeriği tamamlandı. Sınavı bitirerek eğitimi tamamlayın.{quiz.pass_score ? ` Geçme notu: %${quiz.pass_score}` : ""}</p>
            <p className="w-full text-left text-xs text-slate-400">Cevaplarınız bu tarayıcıda saklanır; sayfayı yenilerseniz kaybolmaz</p>
          </div>
          {quiz.questions.map((q, i) => (
            <div key={q.question_id} className="n-card p-8" data-testid={`quiz-question-${i}`}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs uppercase tracking-[0.2em] font-medium text-slate-400">Soru {i + 1} / {quiz.questions.length}</p>
                {quiz.scoring_mode === "per_question" && (
                  <span className="text-xs font-medium text-slate-500 bg-[#F5F8FA] px-2.5 py-1 rounded-full" data-testid={`quiz-q${i}-points`}>
                    {q.points} puan
                  </span>
                )}
              </div>
              <p className="text-lg font-medium tracking-tight text-navy-950 mb-5">{q.text}</p>
              {q.qtype === "multiple_choice" ? (
                <div className="space-y-2">
                  {q.options.map((o, j) => (
                    <button
                      key={j}
                      data-testid={`quiz-q${i}-option-${j}`}
                      onClick={() => setQuizAnswers({ ...quizAnswers, [q.question_id]: { index: j } })}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${quizAnswers[q.question_id]?.index === j ? "border-brand-500 bg-brand-50/60 text-navy-950" : "border-navy-900/10 text-slate-700 hover:bg-slate-50"}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  data-testid={`quiz-q${i}-text-input`}
                  className="w-full px-4 py-3 rounded-xl border border-navy-900/10 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Cevabınızı yazın..."
                  value={quizAnswers[q.question_id]?.text || ""}
                  onChange={(e) => setQuizAnswers({ ...quizAnswers, [q.question_id]: { text: e.target.value } })}
                />
              )}
            </div>
          ))}
          <button data-testid="quiz-submit-btn" className={btnPrimary} disabled={!allAnswered || submitting} onClick={submitQuiz}>
            {submitting ? "Gönderiliyor..." : "Sınavı Tamamla"}
          </button>
        </div>
      )}

      {stage === "result" && result && (
        <div className="n-card p-12 text-center max-w-lg" data-testid="quiz-result">
          <div className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center ${result.passed ? "bg-emerald-50" : "bg-red-50"}`}>
            {result.passed ? <PartyPopper className="w-7 h-7 text-emerald-500" /> : <span className="text-2xl">↺</span>}
          </div>
          <p className="text-4xl font-semibold tracking-tight text-navy-950 mb-2" data-testid="quiz-score">%{result.score}</p>
          <p className="text-sm text-slate-500 mb-8">
            {result.passed
              ? "Tebrikler! Eğitimi başarıyla tamamladınız."
              : `Geçme notunun (%${result.pass_score}) altında kaldınız. Sınavı tekrar deneyebilirsiniz.`}
          </p>
          {result.passed ? (
            <Link to="/trainings" data-testid="result-back-btn" className={btnPrimary + " inline-block"}>Eğitimlerime Dön</Link>
          ) : (
            <button data-testid="quiz-retry-btn" className={btnPrimary} onClick={() => { setQuizAnswers({}); setResult(null); setStage("quiz"); }}>
              Sınavı Tekrar Dene
            </button>
          )}
        </div>
      )}

      {stage === "done" && (
        <div className="n-card p-12 text-center max-w-lg" data-testid="training-done">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 mx-auto mb-5 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-xl font-semibold tracking-tight text-navy-950 mb-2">Bu eğitimi tamamladınız</p>
          <p className="text-sm text-slate-500 mb-8">İlerleme ve sınav kayıtlarınız denetim için saklandı.</p>
          <Link to="/trainings" data-testid="done-back-btn" className={btnPrimary + " inline-block"}>Eğitimlerime Dön</Link>
        </div>
      )}
    </div>
  );
}
