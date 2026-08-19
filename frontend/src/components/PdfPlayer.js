import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contentUrl } from "@/lib/api";
import { ChevronLeft, ChevronRight, FileCheck2, Lock } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfPlayer({
  trainingId,
  pageCount,
  checkpoints,
  initialProgress,
  onHeartbeat,
  onCheckpoint,
  onEnded,
}) {
  const initialPage = Math.max(
    1,
    Math.min(pageCount, Math.floor(initialProgress.current_position || 1)),
  );
  const passedRef = useRef(new Set(initialProgress.checkpoints_passed || []));
  const activeCpRef = useRef(null);
  const pageContainerRef = useRef(null);
  const [page, setPage] = useState(initialPage);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageReady, setPageReady] = useState(false);
  const [activeCp, setActiveCp] = useState(null);
  const [answer, setAnswer] = useState({ index: null, text: "" });
  const [countdown, setCountdown] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryMsg, setRetryMsg] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const pdfFile = useMemo(
    () => ({ url: contentUrl(trainingId), withCredentials: true }),
    [trainingId],
  );

  useEffect(() => {
    const container = pageContainerRef.current;
    if (!container) return undefined;
    const updateWidth = () => setPageWidth(Math.floor(container.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const acknowledgePage = useCallback(async () => {
    try {
      const progress = await onHeartbeat(page, false);
      const acceptedPage = Math.max(1, Math.floor(progress?.current_position || page));
      if (acceptedPage < page) {
        setBlocked(true);
        setPage(acceptedPage);
        return;
      }
      setPageReady(true);
    } catch {
      setPageReady(false);
    }
  }, [onHeartbeat, page]);

  useEffect(() => {
    setPageReady(false);
    acknowledgePage();
  }, [acknowledgePage]);

  useEffect(() => {
    if (!activeCp || countdown == null || countdown <= 0) return;
    const timer = setTimeout(() => {
      if (countdown === 1) submitCheckpoint(true);
      else setCountdown((value) => value - 1);
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCp, countdown]);

  const openCheckpoint = (cp) => {
    activeCpRef.current = cp;
    setActiveCp(cp);
    setAnswer({ index: null, text: "" });
    setRetryMsg(null);
    setCountdown(cp.timeout_seconds ?? null);
  };

  const submitCheckpoint = async (timedOut = false) => {
    const cp = activeCpRef.current;
    if (!cp || submitting) return;
    setSubmitting(true);
    try {
      const result = await onCheckpoint(cp, answer, timedOut);
      if (result.passed) {
        passedRef.current.add(cp.id);
        activeCpRef.current = null;
        setActiveCp(null);
      } else if (result.retry) {
        setAnswer({ index: null, text: "" });
        setCountdown(cp.timeout_seconds ?? null);
        setRetryMsg(
          result.remaining != null
            ? `Yanlış cevap. Kalan deneme hakkı: ${result.remaining}`
            : "Yanlış cevap, tekrar deneyin.",
        );
      } else {
        const rewindPage = Math.max(1, Math.floor(result.rewind_to || 1));
        activeCpRef.current = null;
        setActiveCp(null);
        setPage(rewindPage);
        setBlocked(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const advance = async () => {
    const checkpoint = checkpoints.find(
      (cp) => cp.time === page && !passedRef.current.has(cp.id),
    );
    if (checkpoint) {
      openCheckpoint(checkpoint);
      return;
    }
    if (page >= pageCount) {
      await onEnded();
      return;
    }
    setBlocked(false);
    setPage((value) => value + 1);
  };

  const q = activeCp?.question;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 shadow-[0_20px_60px_rgba(14,32,51,0.18)]" data-testid="pdf-player">
      <div
        ref={pageContainerRef}
        className="w-full bg-slate-100 flex items-start justify-center p-2 sm:p-5 overflow-hidden"
        data-testid="pdf-page-frame"
      >
        <Document
          file={pdfFile}
          loading={<div className="py-24 text-sm text-slate-500">PDF yükleniyor...</div>}
          error={<div className="py-24 text-sm text-red-500">PDF görüntülenemedi.</div>}
          className="flex justify-center w-full"
        >
          {pageWidth > 0 && (
            <Page
              pageNumber={page}
              width={Math.max(280, Math.min(pageWidth - 16, 1400))}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="max-w-full shadow-lg"
            />
          )}
        </Document>
      </div>

      <div className="sticky bottom-0 z-20 flex items-center gap-3 px-3 sm:px-5 py-3 sm:py-4 bg-navy-950 text-white">
        <button
          type="button"
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          disabled={page <= 1 || Boolean(activeCp)}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
          aria-label="Önceki sayfa"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm tabular-nums">
          Sayfa {page} / {pageCount}
        </span>
        {blocked && (
          <span className="flex items-center gap-1.5 text-xs text-amber-300 ml-2">
            <Lock className="w-3 h-3" /> Sayfalar sırayla görüntülenmelidir
          </span>
        )}
        <button
          type="button"
          onClick={advance}
          disabled={!pageReady || Boolean(activeCp)}
          className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-navy-950 text-sm font-medium hover:bg-cyan-50 disabled:opacity-40"
          data-testid="pdf-next-btn"
        >
          {page >= pageCount ? (
            <>
              <FileCheck2 className="w-4 h-4" /> PDF'yi Tamamla
            </>
          ) : (
            <>
              İleri <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {activeCp && q && (
        <div className="absolute inset-0 bg-navy-950/75 backdrop-blur-sm flex items-center justify-center p-6 z-10" data-testid="checkpoint-modal">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs uppercase tracking-[0.2em] font-medium text-brand-600">Kontrol Noktası</p>
              {countdown != null && (
                <span className={`text-sm font-semibold tabular-nums px-3 py-1 rounded-full ${countdown <= 10 ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-600"}`}>
                  {countdown}s
                </span>
              )}
            </div>
            <p className="text-lg font-medium tracking-tight text-navy-950 mb-6">{q.text}</p>
            {retryMsg && <p className="text-sm font-medium text-red-500 -mt-3 mb-5">{retryMsg}</p>}
            {q.qtype === "multiple_choice" ? (
              <div className="space-y-2 mb-6">
                {q.options.map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setAnswer({ ...answer, index })}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm ${answer.index === index ? "border-brand-500 bg-brand-50/60" : "border-navy-900/10"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                className="w-full px-4 py-3 rounded-xl border border-navy-900/10 text-sm min-h-[90px] mb-6"
                placeholder="Cevabınızı yazın..."
                value={answer.text}
                onChange={(event) => setAnswer({ ...answer, text: event.target.value })}
              />
            )}
            <button
              type="button"
              disabled={submitting || (q.qtype === "multiple_choice" ? answer.index === null : !answer.text.trim())}
              onClick={() => submitCheckpoint(false)}
              className="w-full py-3 rounded-full bg-navy-900 text-white text-sm font-medium disabled:opacity-40"
            >
              Cevapla ve Devam Et
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
