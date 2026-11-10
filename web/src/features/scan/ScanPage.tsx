import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Images, RotateCcw, Send, Sparkles, Square } from 'lucide-react';
import {
  AI_MAX_PHOTO_BYTES,
  MAX_SCAN_PHOTOS,
  MIN_SCAN_PHOTOS,
  type ScanJob,
  type ScanList,
  type ScanMethod,
  type ScanPurpose,
  type ScanQuality,
} from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { sq } from '../../i18n/sq';
import { navigate, type Route } from '../../model/router';
import { AppShell } from '../shell/AppShell';
import {
  photoCountProblem,
  pickRecorderMime,
  RECORD_BITS_PER_SECOND,
  RECORD_LIMITS,
  checkPhoto,
  shrinkPhoto,
  stepAt,
  videoExtension,
  type CaptureStep,
  type PhotoWarning,
} from './capture';

interface Upload {
  blob: Blob;
  filename: string;
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'recording' }
  | { kind: 'review'; upload: Upload; url: string; seconds: number }
  | { kind: 'aiPhoto'; upload: Upload; url: string; warnings: PhotoWarning[] }
  | { kind: 'photos'; files: File[] }
  | { kind: 'uploading'; progress: number }
  | { kind: 'sent' };

type Problem =
  | 'noCamera'
  | 'cameraDenied'
  | 'cameraLost'
  | 'sendError'
  | 'tooLarge'
  | 'nameMissing'
  | 'tooFew'
  | 'tooMany';

const canRecord = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined';

const problemText = (p: Problem): string =>
  p === 'tooFew'
    ? sq.scan.tooFewPhotos(MIN_SCAN_PHOTOS)
    : p === 'tooMany'
      ? sq.scan.tooManyPhotos(MAX_SCAN_PHOTOS)
      : sq.scan[p];

/** Texts that differ between scanning a decoration and scanning a whole hall. */
/** The time range shown to the agent, per purpose and quality (estimates). */
const TIME_RANGE: Record<ScanPurpose, Record<ScanQuality, string>> = {
  decor: { quick: '10–15', detailed: '20–30' },
  hall: { quick: '15–20', detailed: '30–40' },
};

const TEXT: Record<
  ScanPurpose,
  {
    title: string;
    back: string;
    intro: string;
    tips: readonly string[];
    name: string;
    placeholder: string;
    sent: (range: string) => string;
    done: string;
    home: Route;
  }
> = {
  decor: {
    title: sq.scan.pageTitle,
    back: sq.scan.back,
    intro: sq.scan.intro,
    tips: sq.scan.tips,
    name: sq.scan.name,
    placeholder: sq.scan.namePlaceholder,
    sent: sq.scan.sent,
    done: sq.scan.toLibrary,
    home: { name: 'library' },
  },
  hall: {
    title: sq.scan.hallPageTitle,
    back: sq.scan.hallBack,
    intro: sq.scan.hallIntro,
    tips: sq.scan.hallTips,
    name: sq.scan.hallName,
    placeholder: sq.scan.hallNamePlaceholder,
    sent: sq.scan.hallSent,
    done: sq.scan.toHalls,
    home: { name: 'halls' },
  },
};

/**
 * "Skano një dekor" / "Skano sallën": film (or photograph) a decoration or an empty hall and
 * send it to the GPU worker.
 */
export function ScanPage({ purpose = 'decor' }: { purpose?: ScanPurpose }) {
  const text = TEXT[purpose];
  const [available, setAvailable] = useState<{ scan: boolean; ai: boolean } | null>(null);
  const [chosenMethod, setChosenMethod] = useState<ScanMethod>('ai');
  const [name, setName] = useState('');
  const [quality, setQuality] = useState<ScanQuality>('quick');
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [problem, setProblem] = useState<Problem | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const aiPhotoRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const aiOffered = purpose === 'decor' && !!available?.ai;
  // Both are on the page only when both services are connected.
  const bothOffered = aiOffered && !!available?.scan;
  const method: ScanMethod = !aiOffered ? 'photogrammetry' : bothOffered ? chosenMethod : 'ai';
  const enabled = available === null ? null : method === 'ai' ? available.ai : available.scan;

  useEffect(() => {
    api
      .get<ScanList>('/api/scans')
      .then((r) => setAvailable({ scan: r.enabled, ai: r.aiEnabled }))
      .catch(() => setAvailable({ scan: false, ai: false }));
  }, []);

  // Free the recorded video when it is no longer shown.
  const reviewUrl = phase.kind === 'review' || phase.kind === 'aiPhoto' ? phase.url : null;
  useEffect(() => {
    if (!reviewUrl) return;
    return () => URL.revokeObjectURL(reviewUrl);
  }, [reviewUrl]);

  /** Before capturing: afterwards the name field is no longer on the screen. */
  const nameReady = () => {
    if (name.trim()) return true;
    setProblem('nameMissing');
    nameRef.current?.focus();
    return false;
  };

  const pickAiPhoto = async (list: FileList | null) => {
    const file = list?.[0];
    if (aiPhotoRef.current) aiPhotoRef.current.value = '';
    if (!file) return;
    const blob = await shrinkPhoto(file);
    if (blob.size > AI_MAX_PHOTO_BYTES) {
      setProblem('tooLarge');
      return;
    }
    setProblem(null);
    setPhase({
      kind: 'aiPhoto',
      upload: { blob, filename: 'foto.jpg' },
      url: URL.createObjectURL(blob),
      warnings: await checkPhoto(blob),
    });
  };

  const send = async (uploads: Upload[], back: Phase) => {
    if (!name.trim()) {
      setProblem('nameMissing');
      return;
    }
    setProblem(null);
    const form = new FormData();
    form.append('name', name.trim());
    form.append('purpose', purpose);
    form.append('quality', quality);
    form.append('method', method);
    for (const u of uploads) form.append('file', u.blob, u.filename);
    setPhase({ kind: 'uploading', progress: 0 });
    try {
      await api.uploadWithProgress<ScanJob>('/api/scans', form, (f) =>
        setPhase({ kind: 'uploading', progress: Math.round(f * 100) }),
      );
      setPhase({ kind: 'sent' });
    } catch (err) {
      setProblem(err instanceof ApiError && err.status === 413 ? 'tooLarge' : 'sendError');
      setPhase(back);
    }
  };

  const pickPhotos = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (photoRef.current) photoRef.current.value = '';
    if (!files.length) return;
    setProblem(photoCountProblem(files.length));
    setPhase({ kind: 'photos', files });
  };

  const restart = () => {
    setProblem(null);
    setPhase({ kind: 'intro' });
  };

  return (
    <AppShell active={purpose === 'hall' ? 'scanHall' : 'scan'}>
      <div className="page-head">
        <h1 className="title-serif">{text.title}</h1>
        <button type="button" className="btn" onClick={() => navigate(text.home)}>
          <ArrowLeft size={18} />
          <span>{text.back}</span>
        </button>
      </div>

      {enabled === false ? (
        <p className="notice">{sq.scan.disabled}</p>
      ) : (
        <div className="scan-page">
          {problem && (
            <p className="form-error" role="alert">
              {problemText(problem)}
            </p>
          )}

          {phase.kind === 'intro' && (
            <>
              <p>{method === 'ai' ? sq.scan.aiIntro : text.intro}</p>
              {bothOffered && (
                <div className="field">
                  <span className="field-label">{sq.scan.method}</span>
                  <div className="segmented" role="group" aria-label={sq.scan.method}>
                    {(['ai', 'photogrammetry'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={method === m}
                        onClick={() => setChosenMethod(m)}
                      >
                        {sq.scan.methodOption[m]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <section className="scan-tips" aria-label={sq.scan.tipsTitle}>
                <h2>{sq.scan.tipsTitle}</h2>
                <ul>
                  {(method === 'ai' ? sq.scan.aiTips : text.tips).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </section>
              <div className="field">
                <label htmlFor="scan-name">{text.name}</label>
                <input
                  ref={nameRef}
                  id="scan-name"
                  type="text"
                  value={name}
                  maxLength={120}
                  placeholder={text.placeholder}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {method === 'photogrammetry' && (
                <div className="field">
                  <span className="field-label">{sq.scan.quality}</span>
                  <div className="segmented" role="group" aria-label={sq.scan.quality}>
                    {(['quick', 'detailed'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        aria-pressed={quality === q}
                        onClick={() => setQuality(q)}
                      >
                        {sq.scan.qualityOption[q]}
                      </button>
                    ))}
                  </div>
                  <p className="muted small" data-testid="scan-quality-hint">
                    {sq.scan.qualityHint[quality](TIME_RANGE[purpose][quality])}
                  </p>
                </div>
              )}
              {method === 'ai' ? (
                <div className="scan-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={enabled !== true}
                    onClick={() => nameReady() && aiPhotoRef.current?.click()}
                  >
                    <Sparkles size={18} />
                    <span>{sq.scan.aiPick}</span>
                  </button>
                  <input
                    ref={aiPhotoRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    hidden
                    data-testid="scan-ai-photo"
                    onChange={(e) => void pickAiPhoto(e.target.files)}
                  />
                </div>
              ) : (
                <div className="scan-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={enabled !== true}
                    onClick={() => {
                      if (!nameReady()) return;
                      if (!canRecord()) {
                        setProblem('noCamera');
                        return;
                      }
                      setProblem(null);
                      setPhase({ kind: 'recording' });
                    }}
                  >
                    <Camera size={18} />
                    <span>{sq.scan.record}</span>
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={enabled !== true}
                    onClick={() => nameReady() && photoRef.current?.click()}
                  >
                    <Images size={18} />
                    <span>{sq.scan.photos}</span>
                  </button>
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    multiple
                    hidden
                    data-testid="scan-photos"
                    onChange={(e) => pickPhotos(e.target.files)}
                  />
                </div>
              )}
            </>
          )}

          {phase.kind === 'recording' && (
            <Recorder
              purpose={purpose}
              onDone={(blob, seconds) =>
                setPhase({
                  kind: 'review',
                  upload: { blob, filename: `skanim.${videoExtension(blob.type)}` },
                  url: URL.createObjectURL(blob),
                  seconds,
                })
              }
              onFail={(p) => {
                setProblem(p);
                setPhase({ kind: 'intro' });
              }}
            />
          )}

          {phase.kind === 'review' && (
            <>
              <h2>{sq.scan.review}</h2>
              <video className="scan-video" src={phase.url} controls playsInline />
              <p className="muted small mono">
                {Math.round(phase.seconds)} s · {(phase.upload.blob.size / 1_048_576).toFixed(0)} MB
              </p>
              <div className="scan-actions">
                <button type="button" className="btn" onClick={restart}>
                  <RotateCcw size={18} />
                  <span>{sq.scan.retake}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void send([phase.upload], phase)}
                >
                  <Send size={18} />
                  <span>{sq.scan.send}</span>
                </button>
              </div>
            </>
          )}

          {phase.kind === 'aiPhoto' && (
            <>
              <h2>{sq.scan.aiReview}</h2>
              <img className="scan-video" src={phase.url} alt={name} />
              {phase.warnings.map((w) => (
                <p key={w} className="notice" role="status">
                  {sq.scan.aiWarning[w]}
                </p>
              ))}
              <div className="scan-actions">
                <button type="button" className="btn" onClick={restart}>
                  <RotateCcw size={18} />
                  <span>{sq.scan.aiOther}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void send([phase.upload], phase)}
                >
                  <Send size={18} />
                  <span>{sq.scan.send}</span>
                </button>
              </div>
            </>
          )}

          {phase.kind === 'photos' && (
            <>
              <p className="mono">{sq.scan.photosSelected(phase.files.length)}</p>
              <div className="scan-actions">
                <button type="button" className="btn" onClick={restart}>
                  <RotateCcw size={18} />
                  <span>{sq.common.cancel}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={photoCountProblem(phase.files.length) !== null}
                  onClick={() =>
                    void send(
                      phase.files.map((f) => ({ blob: f, filename: f.name })),
                      phase,
                    )
                  }
                >
                  <Send size={18} />
                  <span>{sq.scan.send}</span>
                </button>
              </div>
            </>
          )}

          {phase.kind === 'uploading' && (
            <div className="scan-uploading" role="status">
              <p>{sq.scan.uploading(phase.progress)}</p>
              <progress className="scan-progress" max={100} value={phase.progress} />
            </div>
          )}

          {phase.kind === 'sent' && (
            <>
              <p className="notice" role="status">
                {method === 'ai' ? sq.scan.aiSent : text.sent(TIME_RANGE[purpose][quality])}
              </p>
              <div className="scan-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(text.home)}
                >
                  {text.done}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setName('');
                    restart();
                  }}
                >
                  {sq.scan.another}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

/** Live camera with the recording guide; reports the finished video or why it could not start. */
const STEP_TEXT: Record<CaptureStep, string> = {
  ring1: sq.scan.stepRing1,
  ring2: sq.scan.stepRing2,
  details: sq.scan.stepDetails,
  walls: sq.scan.stepWalls,
  corners: sq.scan.stepCorners,
  middle: sq.scan.stepMiddle,
};

function Recorder({
  purpose,
  onDone,
  onFail,
}: {
  purpose: ScanPurpose;
  onDone: (blob: Blob, seconds: number) => void;
  onFail: (problem: 'noCamera' | 'cameraDenied' | 'cameraLost') => void;
}) {
  const limits = RECORD_LIMITS[purpose];
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState(false);
  // The effect runs once; it calls the latest callbacks through refs.
  const done = useRef(onDone);
  const fail = useRef(onFail);
  useEffect(() => {
    done.current = onDone;
    fail.current = onFail;
  });

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const chunks: Blob[] = [];

    // Waits a moment, because asking for the camera twice and releasing one (React's dev mode
    // mounts twice) can end the other stream too.
    const begin = setTimeout(() => void openCamera(), 0);
    const openCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (err) {
        if (!cancelled)
          fail.current(
            err instanceof DOMException && err.name === 'NotAllowedError'
              ? 'cameraDenied'
              : 'noCamera',
          );
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        void video.play().catch(() => undefined);
      }
      const mime = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t));
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          ...(mime ? { mimeType: mime } : {}),
          videoBitsPerSecond: RECORD_BITS_PER_SECOND[purpose],
        });
      } catch {
        fail.current('noCamera');
        return;
      }
      const started = Date.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || 'video/webm';
        const length = (Date.now() - started) / 1000;
        // Too short means the camera was taken away (a call, the app switched): not a scan.
        if (length < RECORD_LIMITS[purpose].min) fail.current('cameraLost');
        else done.current(new Blob(chunks, { type }), length);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setLive(true);
      timer = setInterval(() => {
        const s = (Date.now() - started) / 1000;
        setSeconds(s);
        if (s >= RECORD_LIMITS[purpose].max && recorder.state === 'recording') recorder.stop();
      }, 250);
    };

    return () => {
      cancelled = true;
      clearTimeout(begin);
      clearInterval(timer);
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') {
        // Leaving the page while recording: drop the video.
        r.onstop = null;
        r.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
    // The purpose never changes while recording (the page is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hint = STEP_TEXT[stepAt(seconds, purpose)];
  const left = Math.ceil(limits.min - seconds);

  return (
    <div className="scan-camera">
      <video ref={videoRef} className="scan-video" muted playsInline autoPlay />
      <div className="scan-overlay" aria-live="polite">
        <span className="scan-rec mono">
          <span className="scan-dot" aria-hidden /> {sq.scan.recording} {Math.floor(seconds)} s
        </span>
        <span className="scan-hint">{hint}</span>
      </div>
      <progress
        className="scan-progress"
        max={limits.target}
        value={Math.min(seconds, limits.target)}
      />
      <div className="scan-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!live || left > 0}
          onClick={() => {
            const r = recorderRef.current;
            if (r && r.state === 'recording') r.stop();
          }}
        >
          <Square size={18} />
          <span>{left > 0 && live ? sq.scan.minHint(left) : sq.scan.stop}</span>
        </button>
      </div>
    </div>
  );
}
