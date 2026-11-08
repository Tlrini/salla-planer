import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDateTime, type ClientNotice } from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { sq } from '../../i18n/sq';
import { navigate } from '../../model/router';

/** How often the bell asks for new client activity. */
const POLL_MS = 60_000;

/**
 * The agency's bell: clients approving an option or commenting on a share link. Clicking a
 * notice opens the project and marks its client activity as seen for everyone.
 */
export function NoticeBell() {
  const [notices, setNotices] = useState<ClientNotice[]>([]);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setNotices(await api.get<ClientNotice[]>('/api/notifications'));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      // A hidden tab does not need to ask (and keeps the on/off server free to power off).
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const markSeen = async (projectId?: string) => {
    try {
      await api.post('/api/notifications/seen', projectId ? { projectId } : {});
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
    await refresh();
  };

  const n = notices.length;
  return (
    <div className="notice-bell" ref={wrap}>
      <button
        type="button"
        className={`icon-btn${n ? ' has-notices' : ''}`}
        aria-expanded={open}
        aria-label={`${sq.notices.bell}: ${n}`}
        title={sq.notices.bell}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={20} />
        {n > 0 && <span className="notice-count mono">{n > 9 ? '9+' : n}</span>}
      </button>
      {open && (
        <div className="menu notice-list" role="dialog" aria-label={sq.notices.bell}>
          <strong>{sq.notices.bell}</strong>
          {n === 0 && <p className="muted small">{sq.notices.none}</p>}
          {notices.map((x, i) => (
            <button
              key={`${x.projectId}-${x.at}-${i}`}
              type="button"
              className="menu-item notice-item"
              onClick={() => {
                setOpen(false);
                void markSeen(x.projectId);
                navigate({ name: 'project', id: x.projectId });
              }}
            >
              <span className="notice-project">{x.projectName}</span>
              <span>
                {x.kind === 'approved'
                  ? sq.notices.approved(x.by, x.text || '—')
                  : sq.notices.comment(x.by, x.text)}
              </span>
              <span className="muted small">{formatDateTime(x.at)}</span>
            </button>
          ))}
          {n > 0 && (
            <button type="button" className="btn" onClick={() => void markSeen()}>
              <CheckCheck size={16} />
              <span>{sq.notices.markAll}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
