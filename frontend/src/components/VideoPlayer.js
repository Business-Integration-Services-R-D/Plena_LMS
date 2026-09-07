import { useEffect, useRef, useState, useCallback } from "react";
import { videoUrl, fmtTime } from "@/lib/api";
import { Play, Pause, Volume2, VolumeX, Lock, Maximize, Minimize } from "lucide-react";

export default function VideoPlayer({ trainingId, duration, checkpoints, initialProgress, onHeartbeat, onEvent, onCheckpoint, onEnded }) {
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const maxRef = useRef(initialProgress.max_position || 0);
  const passedRef = useRef(new Set(initialProgress.checkpoints_passed || []));
  const activeCpRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(initialProgress.current_position || 0);
  const [maxPos, setMaxPos] = useState(initialProgress.max_position || 0);
  const [activeCp, setActiveCp] = useState(null);
  const [answer, setAnswer] = useState({ index: null, text: "" });
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [seekBlocked, setSeekBlocked] = useState(false);
  const [retryMsg, setRetryMsg] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const startedRef = useRef(false);

  const dur = duration || videoRef.current?.duration || 0;

  // heartbeat
  useEffect(() => {
    const iv = setInterval(async () => {
      const v = videoRef.current;
      if (!v || activeCpRef.current) return;
      try {
        const res = await onHeartbeat(v.currentTime, !v.paused);
        if (res && res.max_position > maxRef.current) {
          maxRef.current = res.max_position;
          setMaxPos(res.max_position);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [onHeartbeat]);

  // close event on unmount
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video && startedRef.current) {
        onEvent("video_closed", video.currentTime);
        onHeartbeat(video.currentTime, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    };
    const handleNativeFullscreenStart = () => setIsFullscreen(true);
    const handleNativeFullscreenEnd = () => setIsFullscreen(false);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    video?.addEventListener("webkitbeginfullscreen", handleNativeFullscreenStart);
    video?.addEventListener("webkitendfullscreen", handleNativeFullscreenEnd);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      video?.removeEventListener("webkitbeginfullscreen", handleNativeFullscreenStart);
      video?.removeEventListener("webkitendfullscreen", handleNativeFullscreenEnd);
    };
  }, []);

  // Fullscreen API sunmayan mobil tarayıcılarda oynatıcıyı viewport'a sabitle.
  useEffect(() => {
    if (!isFallbackFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsFallbackFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFallbackFullscreen]);

  // checkpoint countdown
  useEffect(() => {
    if (!activeCp || countdown == null || countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) submitCheckpoint(true);
      else setCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCp, countdown]);

  const openCheckpoint = useCallback((cp) => {
    const v = videoRef.current;
    v.pause();
    // iOS'un native video tam ekranında HTML checkpoint katmanı görünmez.
    // Soruyu gösterebilmek için kontrol noktasında native tam ekrandan çık.
    if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) {
      v.webkitExitFullscreen();
    }
    activeCpRef.current = cp;
    setActiveCp(cp);
    setAnswer({ index: null, text: "" });
    setRetryMsg(null);
    // null = süre sınırı yok (geri sayım gösterilmez)
    setCountdown(cp.timeout_seconds ?? null);
  }, []);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    // anti-skip guard
    if (t > maxRef.current + 1.2) {
      v.currentTime = maxRef.current;
      setSeekBlocked(true);
      setTimeout(() => setSeekBlocked(false), 2000);
      return;
    }
    if (t > maxRef.current) {
      maxRef.current = t;
      setMaxPos(t);
    }
    setCurrent(t);
    if (!activeCpRef.current) {
      const cp = checkpoints.find((c) => !passedRef.current.has(c.id) && t >= c.time);
      if (cp) openCheckpoint(cp);
    }
  };

  const handleSeeking = () => {
    const v = videoRef.current;
    if (v && v.currentTime > maxRef.current + 1.2) {
      v.currentTime = maxRef.current;
      setSeekBlocked(true);
      setTimeout(() => setSeekBlocked(false), 2000);
    }
  };

  const submitCheckpoint = async (timedOut = false) => {
    const cp = activeCpRef.current;
    if (!cp || submitting) return;
    setSubmitting(true);
    try {
      const res = await onCheckpoint(cp, answer, timedOut);
      const v = videoRef.current;
      if (res.passed) {
        passedRef.current.add(cp.id);
        activeCpRef.current = null;
        setActiveCp(null);
        v.play();
        setPlaying(true);
      } else if (res.retry) {
        // Video sarılmaz; soru tekrar sorulur.
        setAnswer({ index: null, text: "" });
        setCountdown(cp.timeout_seconds ?? null);
        setRetryMsg(
          res.remaining != null
            ? `Yanlış cevap. Kalan deneme hakkı: ${res.remaining}`
            : "Yanlış cevap, tekrar deneyin."
        );
      } else {
        maxRef.current = res.rewind_to;
        setMaxPos(res.rewind_to);
        v.currentTime = res.rewind_to;
        setCurrent(res.rewind_to);
        activeCpRef.current = null;
        setActiveCp({ failed: true, rewind_to: res.rewind_to, timedOut });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dismissFail = () => {
    setActiveCp(null);
    videoRef.current?.play();
    setPlaying(true);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (activeCpRef.current && !activeCp?.failed) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
      if (!startedRef.current) {
        startedRef.current = true;
        onEvent("video_started", v.currentTime);
      } else {
        onEvent("video_resumed", v.currentTime);
      }
    } else {
      v.pause();
      setPlaying(false);
      onEvent("video_paused", v.currentTime);
      onHeartbeat(v.currentTime, false);
    }
  };

  const toggleMute = () => {
    setMuted((value) => !value);
  };

  const handleVolumeChange = (e) => {
    const nextVolume = Number(e.target.value);
    const v = videoRef.current;
    if (v) v.volume = nextVolume;
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  };

  const toggleFullscreen = async () => {
    const player = playerRef.current;
    const video = videoRef.current;
    if (!player || !video) return;

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exitFullscreen =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.webkitCancelFullScreen;
      await exitFullscreen?.call(document);
      return;
    }

    if (video.webkitDisplayingFullscreen && video.webkitExitFullscreen) {
      video.webkitExitFullscreen();
      return;
    }

    if (isFallbackFullscreen) {
      setIsFallbackFullscreen(false);
      return;
    }

    const requestFullscreen =
      player.requestFullscreen ||
      player.webkitRequestFullscreen ||
      player.msRequestFullscreen;

    if (requestFullscreen) {
      try {
        await requestFullscreen.call(player);
        return;
      } catch {
        // Bazı mobil Safari sürümleri yalnızca video elementinin native
        // tam ekran yöntemine izin verir; aşağıdaki yola devam et.
      }
    }

    if (video.webkitEnterFullscreen) {
      try {
        video.webkitEnterFullscreen();
        return;
      } catch {
        // Metadata henüz hazır değilse veya tarayıcı yöntemi reddederse
        // viewport tabanlı yedek tam ekran kullanılır.
      }
    }

    setIsFallbackFullscreen(true);
  };

  const handleBarClick = (e) => {
    const v = videoRef.current;
    if (!v || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const target = ((e.clientX - rect.left) / rect.width) * dur;
    if (target <= maxRef.current) {
      v.currentTime = target;
      setCurrent(target);
    } else {
      setSeekBlocked(true);
      setTimeout(() => setSeekBlocked(false), 2000);
    }
  };

  const handleEnded = async () => {
    setPlaying(false);
    await onHeartbeat(dur, false);
    onEvent("video_ended", dur);
    onEnded();
  };

  const q = activeCp?.question;
  const fullscreenActive = isFullscreen || isFallbackFullscreen;

  return (
    <div
      ref={playerRef}
      className={`relative overflow-hidden bg-black shadow-[0_20px_60px_rgba(14,32,51,0.18)] ${isFallbackFullscreen ? "fixed inset-0 z-[100] flex h-[100dvh] items-center rounded-none" : isFullscreen ? "flex h-[100dvh] items-center rounded-none" : "rounded-2xl"}`}
      data-testid="video-player"
    >
      <video
        ref={videoRef}
        src={videoUrl(trainingId)}
        className="w-full max-h-full block"
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onEnded={handleEnded}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (initialProgress.current_position > 0) v.currentTime = Math.min(initialProgress.current_position, maxRef.current);
        }}
        onContextMenu={(e) => e.preventDefault()}
        muted={muted}
        playsInline
      />

      {/* controls */}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 backdrop-blur-xl px-3 py-3 sm:px-5 sm:py-4">
        <div className="relative h-2 rounded-full bg-white/20 cursor-pointer mb-3 group" onClick={handleBarClick} data-testid="video-progress-bar">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${dur ? Math.min(100, (maxPos / dur) * 100) : 0}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand-400" style={{ width: `${dur ? Math.min(100, (current / dur) * 100) : 0}%` }} />
          {checkpoints.map((cp) => (
            <div
              key={cp.id}
              className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-black/40 ${passedRef.current.has(cp.id) ? "bg-emerald-400" : "bg-amber-400"}`}
              style={{ left: `calc(${dur ? (cp.time / dur) * 100 : 0}% - 5px)` }}
              title={`Kontrol noktası ${fmtTime(cp.time)}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button data-testid="video-play-btn" onClick={togglePlay} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shrink-0">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <span className="text-xs sm:text-sm text-white/90 tabular-nums shrink-0" data-testid="video-time">{fmtTime(current)} / {fmtTime(dur)}</span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {seekBlocked && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/20 px-3 py-1.5 rounded-full" data-testid="seek-blocked-warning">
                <Lock className="w-3 h-3" /> İleri sarma kapalı
              </span>
            )}
            <button
              data-testid="video-mute-btn"
              onClick={toggleMute}
              className="text-white/70 hover:text-white transition-colors shrink-0"
              aria-label={muted || volume === 0 ? "Sesi aç" : "Sesi kapat"}
            >
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              data-testid="video-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              aria-label="Ses seviyesi"
              className="hidden sm:block w-20 h-1 accent-white cursor-pointer"
            />
            <button
              data-testid="video-fullscreen-btn"
              onClick={toggleFullscreen}
              className="text-white/70 hover:text-white transition-colors shrink-0"
              aria-label={fullscreenActive ? "Tam ekrandan çık" : "Tam ekran"}
              aria-pressed={fullscreenActive}
            >
              {fullscreenActive ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* checkpoint modal */}
      {activeCp && !activeCp.failed && q && (
        <div className="absolute inset-0 bg-navy-950/75 backdrop-blur-sm flex items-center justify-center p-6 z-10" data-testid="checkpoint-modal">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs uppercase tracking-[0.2em] font-medium text-brand-600">Kontrol Noktası</p>
              {countdown != null && (
                <span className={`text-sm font-semibold tabular-nums px-3 py-1 rounded-full ${countdown <= 10 ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-600"}`} data-testid="checkpoint-countdown">
                  {countdown}s
                </span>
              )}
            </div>
            <p className="text-lg font-medium tracking-tight text-navy-950 mb-6">{q.text}</p>
            {retryMsg && (
              <p className="text-sm font-medium text-red-500 -mt-3 mb-5" data-testid="checkpoint-retry-msg">{retryMsg}</p>
            )}
            {q.qtype === "multiple_choice" ? (
              <div className="space-y-2 mb-6">
                {q.options.map((o, i) => (
                  <button
                    key={i}
                    data-testid={`checkpoint-option-${i}`}
                    onClick={() => setAnswer({ ...answer, index: i })}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${answer.index === i ? "border-brand-500 bg-brand-50/60 text-navy-950" : "border-navy-900/10 text-slate-700 hover:bg-slate-50"}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                data-testid="checkpoint-text-input"
                className="w-full px-4 py-3 rounded-xl border border-navy-900/10 text-sm min-h-[90px] mb-6 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="Cevabınızı yazın..."
                value={answer.text}
                onChange={(e) => setAnswer({ ...answer, text: e.target.value })}
              />
            )}
            <button
              data-testid="checkpoint-submit-btn"
              disabled={submitting || (q.qtype === "multiple_choice" ? answer.index === null : !answer.text.trim())}
              onClick={() => submitCheckpoint(false)}
              className="w-full py-3 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40"
            >
              Cevapla ve Devam Et
            </button>
          </div>
        </div>
      )}

      {/* checkpoint fail */}
      {activeCp?.failed && (
        <div className="absolute inset-0 bg-navy-950/75 backdrop-blur-sm flex items-center justify-center p-6 z-10" data-testid="checkpoint-fail-modal">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl text-center">
            <p className="text-lg font-medium tracking-tight text-navy-950 mb-2">
              {activeCp.timedOut ? "Süre doldu" : "Yanlış cevap"}
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Video {activeCp.rewind_to === 0 ? "başa alındı" : `${fmtTime(activeCp.rewind_to)} noktasına geri alındı`}. Bu bölümü tekrar izlemeniz gerekiyor.
            </p>
            <button data-testid="checkpoint-fail-continue-btn" onClick={dismissFail}
              className="px-8 py-3 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 active:scale-[0.98] transition-[background-color,transform]">
              Tekrar İzle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
