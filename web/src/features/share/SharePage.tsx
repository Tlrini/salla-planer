import { lazy, Suspense, useEffect, useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';
import { formatDate, formatEUR, type CatalogItem, type Project } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { activeOption, allOptions, catalogMap, setCatalog, useEditor } from '../../model/store';
import { renderBlueprint } from '../export/blueprintSnapshot';
import { Comments, type ShareComment } from './ShareDialog';

const Viewer3D = lazy(() => import('../viewer3d/Viewer3D'));

interface ShareData {
  agency: string;
  project: Project;
  totals: Record<string, number>;
  catalog: CatalogItem[];
  share: {
    expiresAt: string;
    approval?: { optionId: string; optionName: string; by: string; at: string };
  };
  comments: ShareComment[];
}

const base = (token: string) => `/api/public/share/${encodeURIComponent(token)}`;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

function rememberedName(): string {
  try {
    return localStorage.getItem('salla-client-name') ?? '';
  } catch {
    return '';
  }
}

/**
 * What the client sees through a share link (no account): the plan and the 3D walk of every
 * design option with its total, approving one, and comments to the agency.
 */
export function SharePage({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [view, setView] = useState<'plan' | '3d'>('3d');
  const [plan, setPlan] = useState<string | null>(null);
  const [name, setName] = useState(rememberedName);
  const [approval, setApproval] = useState<ShareData['share']['approval']>();
  const [comments, setComments] = useState<ShareComment[]>([]);
  const project = useEditor((s) => s.project);

  useEffect(() => {
    let alive = true;
    void fetch(base(token))
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as ShareData;
        if (!alive) return;
        setCatalog(d.catalog);
        // Read-only: no meta, so nothing is ever saved from this page.
        useEditor.setState({ project: d.project, selection: [], meta: null });
        useEditor.temporal.getState().clear();
        setData(d);
        setApproval(d.share.approval);
        setComments(d.comments);
        setState('ready');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [token]);

  // Static plan image of the visible option.
  useEffect(() => {
    if (state !== 'ready' || view !== 'plan') return;
    let alive = true;
    void renderBlueprint(project.hall, project.items, catalogMap, { pixelRatio: 2 }).then(
      (img) => alive && setPlan(img.url),
    );
    return () => {
      alive = false;
    };
  }, [state, view, project.items, project.hall]);

  const saveName = (v: string) => {
    setName(v);
    try {
      localStorage.setItem('salla-client-name', v);
    } catch {
      // Private mode: the name is just not remembered.
    }
  };

  if (state === 'loading') return <main className="center-message">{sq.errors.loading}</main>;
  if (state === 'missing' || !data)
    return (
      <main className="center-message">
        <p>{sq.share.missing}</p>
      </main>
    );

  const active = activeOption(project);
  const options = allOptions(project);
  const multi = options.length > 1;
  const approve = async () => {
    if (!name.trim()) return;
    setApproval(await post(`${base(token)}/approve`, { optionId: active.id, name: name.trim() }));
  };

  return (
    <div className="share-page">
      <header className="share-head">
        <span className="muted small">{data.agency || sq.app.name}</span>
        <h1 className="title-serif">{project.name}</h1>
        <span className="muted small">
          {project.clientName}
          {project.eventDate ? ` · ${formatDate(project.eventDate)}` : ''} · {project.hall.name}
        </span>
      </header>

      {multi && (
        <div className="segmented share-options" role="tablist">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-pressed={o.id === active.id}
              onClick={() => o.id !== active.id && useEditor.getState().switchOption(o.id)}
            >
              {approval?.optionId === o.id && <Star size={14} className="final-star" />}
              {o.name} · <span className="mono">{formatEUR(data.totals[o.id] ?? 0)}</span>
            </button>
          ))}
        </div>
      )}
      {!multi && (
        <p className="mono share-total">
          {sq.quote.total}: {formatEUR(data.totals[active.id] ?? 0)}
        </p>
      )}

      <div className="segmented" role="tablist">
        <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
          {sq.topbar.view3d}
        </button>
        <button type="button" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
          {sq.share.plan}
        </button>
      </div>

      <div className="share-stage">
        {view === '3d' ? (
          <Suspense fallback={<p className="viewer-loading">{sq.viewer.loading}</p>}>
            <Viewer3D readOnly />
          </Suspense>
        ) : plan ? (
          <img className="share-plan" src={plan} alt={sq.canvas.planLabel} />
        ) : (
          <p className="muted">{sq.errors.loading}</p>
        )}
      </div>

      <section className="share-approve">
        {approval ? (
          <p className="share-approved">
            <CheckCircle2 size={20} />
            {sq.share.approved(
              approval.by,
              approval.optionName || active.name,
              formatDate(approval.at),
            )}
          </p>
        ) : null}
        {approval?.optionId !== active.id && (
          <div className="share-approve-form">
            <span>{multi ? sq.share.likeThis(active.name) : sq.share.likeThisSingle}</span>
            <input
              value={name}
              placeholder={sq.share.yourName}
              aria-label={sq.share.yourName}
              onChange={(e) => saveName(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim()}
              onClick={() => void approve()}
            >
              <CheckCircle2 size={18} />
              <span>{multi ? sq.share.approve(active.name) : sq.share.approveSingle}</span>
            </button>
          </div>
        )}
      </section>

      <section className="share-comment-box">
        <h2>{sq.share.commentsTitle}</h2>
        <Comments
          comments={comments}
          askName={{ value: name, onChange: saveName }}
          onSend={async (text, n) => {
            setComments(await post(`${base(token)}/comments`, { name: n, text }));
          }}
        />
      </section>
      <footer className="muted small share-foot">
        {sq.share.validUntil(formatDate(data.share.expiresAt))}
      </footer>
    </div>
  );
}
