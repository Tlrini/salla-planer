import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Camera, RotateCcw, Ruler, Scissors, Sparkles, Trash } from 'lucide-react';
import {
  formatDateTime,
  isScanActive,
  scanMinutesLeft,
  type CatalogItem,
  type ScanJob,
  type ScanList,
  type ScanPurpose,
} from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { sq } from '../../i18n/sq';
import { navigate } from '../../model/router';
import { useSession } from '../../model/session';
import { ConfirmDialog } from '../editor/ConfirmDialog';
// Both dialogs carry three.js: load them only when a scan is finished (the halls page is part
// of the main bundle).
const CropDialog = lazy(() => import('./CropDialog').then((m) => ({ default: m.CropDialog })));
const HallScanDialog = lazy(() =>
  import('./HallScanDialog').then((m) => ({ default: m.HallScanDialog })),
);

/** How often the list refreshes while a scan waits or is being processed. */
const POLL_MS = 15_000;

const STATUS_PILL: Record<ScanJob['status'], string> = {
  queued: 'pill',
  processing: 'pill pill-warn',
  ready: 'pill pill-ok',
  failed: 'pill pill-danger',
  done: 'pill',
};

const TEXT: Record<ScanPurpose, { section: string; start: string; empty: string; finish: string }> =
  {
    decor: {
      section: sq.scan.section,
      start: sq.scan.start,
      empty: sq.scan.empty,
      finish: sq.scan.finish,
    },
    hall: {
      section: sq.scan.hallSection,
      start: sq.scan.hallStart,
      empty: sq.scan.hallEmpty,
      finish: sq.scan.hallFinish,
    },
  };

/** The reason of a failure in words, when it is one an agent can act on. */
function failureText(job: ScanJob): string {
  if (job.method !== 'ai' || !job.error) return job.error ?? '';
  const known = (sq.scan.aiErrors as Record<string, string>)[job.error];
  return known ?? sq.scan.aiServiceError;
}

/**
 * The scans of one kind: "Skanimet me kamerë" in the library (decor) or "Skanimet e sallave" on
 * the halls page. Scans waiting for the GPU worker, ready ones to finish, failed ones to retry.
 * A finished decor opens its setup dialog (`onDecorCreated`); a finished hall opens the editor.
 */
export function ScanJobs({
  purpose = 'decor',
  onDecorCreated,
}: {
  purpose?: ScanPurpose;
  onDecorCreated?: (item: CatalogItem) => void;
}) {
  const text = TEXT[purpose];
  const user = useSession((s) => s.user);
  const [list, setList] = useState<ScanList | null>(null);
  const [finishing, setFinishing] = useState<ScanJob | null>(null);
  const [toDelete, setToDelete] = useState<ScanJob | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await api.get<ScanList>('/api/scans'));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = list?.jobs.some((j) => isScanActive(j.status)) ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  if (!list) return null;
  const jobs = list.jobs.filter((j) => j.status !== 'done' && j.purpose === purpose);
  const canDelete = (j: ScanJob) => user?.role === 'admin' || j.createdById === user?.id;

  const retry = async (j: ScanJob) => {
    try {
      await api.post(`/api/scans/${j.id}/retry`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
    await refresh();
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.del(`/api/scans/${toDelete.id}`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setToDelete(null);
    }
    await refresh();
  };

  return (
    <section className="scan-jobs" aria-labelledby={`scan-jobs-title-${purpose}`}>
      <div className="scan-jobs-head">
        <h2 id={`scan-jobs-title-${purpose}`}>{text.section}</h2>
        {(list.enabled || list.aiEnabled) && (
          <button
            type="button"
            className="btn"
            onClick={() => navigate({ name: purpose === 'hall' ? 'scanHall' : 'scan' })}
          >
            <Camera size={18} />
            <span>{text.start}</span>
          </button>
        )}
      </div>
      {!list.enabled && !list.aiEnabled ? (
        <p className="muted small">{sq.scan.disabled}</p>
      ) : jobs.length === 0 ? (
        <p className="muted small">{text.empty}</p>
      ) : (
        <ul className="scan-job-list">
          {jobs.map((j) => (
            <li key={j.id} className="scan-job" data-testid="scan-job">
              <div className="scan-job-main">
                <span className="library-name">{j.name}</span>
                <span className="muted small">
                  {j.source === 'video' ? sq.scan.sourceVideo : sq.scan.sourcePhotos(j.fileCount)} ·{' '}
                  {j.method === 'ai' ? sq.scan.methodTag : sq.scan.qualityOption[j.quality]} ·{' '}
                  {sq.scan.by(j.createdBy, formatDateTime(j.createdAt))}
                </span>
                {j.status === 'processing' && (
                  <>
                    <progress className="scan-progress" max={100} value={j.progress} />
                    <span className="muted small mono">
                      {j.progress}% {j.stage ? `· ${sq.scan.stage[j.stage]}` : ''}
                      {` · ${sq.scan.minutesLeft(scanMinutesLeft(j) ?? 1)}`}
                    </span>
                  </>
                )}
                {j.status === 'queued' && (
                  <span className="muted small">
                    {j.method === 'ai' ? sq.scan.aiWait : sq.scan.waitHint}
                  </span>
                )}
                {j.status === 'failed' && j.error && (
                  <span className="muted small mono">{failureText(j)}</span>
                )}
              </div>
              <span className={STATUS_PILL[j.status]}>
                {j.status === 'ready' && j.method === 'ai'
                  ? sq.scan.aiReady
                  : sq.scan.status[j.status]}
              </span>
              <div className="scan-job-actions">
                {j.status === 'ready' && (
                  <button type="button" className="btn btn-primary" onClick={() => setFinishing(j)}>
                    {j.method === 'ai' ? (
                      <Sparkles size={18} />
                    ) : purpose === 'hall' ? (
                      <Ruler size={18} />
                    ) : (
                      <Scissors size={18} />
                    )}
                    <span>{j.method === 'ai' ? sq.scan.aiFinish : text.finish}</span>
                  </button>
                )}
                {j.status === 'failed' && (
                  <button type="button" className="btn" onClick={() => void retry(j)}>
                    <RotateCcw size={18} />
                    <span>{sq.scan.retry}</span>
                  </button>
                )}
                {canDelete(j) && (
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`${sq.scan.remove}: ${j.name}`}
                    title={sq.scan.remove}
                    onClick={() => setToDelete(j)}
                  >
                    <Trash size={18} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {finishing && (
        <Suspense fallback={null}>
          {purpose === 'hall' ? (
            <HallScanDialog
              job={finishing}
              onClose={() => setFinishing(null)}
              onCreated={(template) => {
                setFinishing(null);
                navigate({ name: 'hall', id: template.id });
              }}
            />
          ) : (
            <CropDialog
              job={finishing}
              onClose={() => setFinishing(null)}
              onFinished={(item) => {
                setFinishing(null);
                void refresh();
                onDecorCreated?.(item);
              }}
              onRegenerated={() => {
                setFinishing(null);
                void refresh();
              }}
            />
          )}
        </Suspense>
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={sq.scan.deleteTitle}
        confirmLabel={sq.scan.remove}
        danger
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      >
        <p>{toDelete ? sq.scan.deleteBody(toDelete.name) : ''}</p>
      </ConfirmDialog>
    </section>
  );
}
