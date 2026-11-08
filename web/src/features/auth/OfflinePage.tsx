import { useEffect } from 'react';
import { Power } from 'lucide-react';
import { sq } from '../../i18n/sq';
import { bootstrap } from '../../model/bootstrap';
import { savedStartLink } from '../../model/offline';

/** How often the page checks whether the server is back. */
const RETRY_MS = 10_000;

/**
 * Shown when the server does not answer (the on/off server is stopped). Offers the agency's
 * start link and opens the app by itself as soon as the server answers again.
 * `client`: a client's share link – no start button, just "try again later".
 */
export function OfflinePage({ client = false }: { client?: boolean }) {
  const link = client ? null : savedStartLink();

  useEffect(() => {
    if (client) return;
    const timer = setInterval(() => {
      void fetch('/api/health', { cache: 'no-store' })
        .then((r) => {
          if (r.ok) void bootstrap();
        })
        .catch(() => undefined);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [client]);

  return (
    <main className="offline-page">
      <h1 className="title-serif">{client ? sq.app.name : sq.offline.title}</h1>
      {client ? (
        <p>{sq.offline.client}</p>
      ) : (
        <>
          <p>{sq.offline.body}</p>
          {link ? (
            // A new tab: this page keeps waiting and opens the app when the server is up.
            <a className="btn btn-primary" href={link} target="_blank" rel="noopener noreferrer">
              <Power size={18} />
              <span>{sq.offline.start}</span>
            </a>
          ) : (
            <p className="muted">{sq.offline.noLink}</p>
          )}
          <p className="muted small" role="status">
            {sq.offline.waiting}
          </p>
        </>
      )}
    </main>
  );
}
