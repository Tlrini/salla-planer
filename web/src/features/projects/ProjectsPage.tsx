import { useCallback, useEffect, useState } from 'react';
import { Copy, FolderOpen, Plus, Search, Trash } from 'lucide-react';
import {
  formatDate,
  formatDateTime,
  formatMeters,
  ProjectStatus,
  type Project,
  type ProjectSummary,
} from '@salla/shared';
import { api } from '../../api/client';
import { sq } from '../../i18n/sq';
import { navigate } from '../../model/router';
import { useDebounced } from '../../model/useDebounced';
import { ConfirmDialog } from '../editor/ConfirmDialog';
import { AppShell } from '../shell/AppShell';
import { NewProjectDialog } from './NewProjectDialog';

export function ProjectsPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | ProjectStatus>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const q = useDebounced(query, 250);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('query', q.trim());
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      setRows(await api.get<ProjectSummary[]>(`/api/projects?${params}`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [q, status, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const duplicate = async (p: ProjectSummary) => {
    await api.post<Project>(`/api/projects/${p.id}/duplicate`, {
      name: `${p.name}${sq.project.copySuffix}`,
    });
    await load();
  };

  const remove = async () => {
    if (!toDelete) return;
    await api.del(`/api/projects/${toDelete.id}`);
    setToDelete(null);
    await load();
  };

  const filtered = q || status || from || to;

  return (
    <AppShell active="projects">
      <div className="page-head">
        <h1 className="title-serif">{sq.projects.title}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          <span>{sq.projects.newProject}</span>
        </button>
      </div>

      <div className="filters">
        <label className="search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder={sq.projects.search}
            aria-label={sq.projects.search}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | ProjectStatus)}
          aria-label={sq.project.status}
        >
          <option value="">{sq.projects.allStatuses}</option>
          {ProjectStatus.options.map((s) => (
            <option key={s} value={s}>
              {sq.statuses[s]}
            </option>
          ))}
        </select>
        <label className="date-filter">
          <span>{sq.projects.from}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="date-filter">
          <span>{sq.projects.to}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {error && <p className="form-error">{sq.errors.offline}</p>}
      {rows === null && !error && <p className="muted">{sq.errors.loading}</p>}
      {rows?.length === 0 && (
        <p className="muted empty">{filtered ? sq.projects.noResults : sq.projects.empty}</p>
      )}

      <ul className="card-list">
        {rows?.map((p) => (
          <li key={p.id} className="card">
            <button
              type="button"
              className="card-main"
              onClick={() => navigate({ name: 'project', id: p.id })}
            >
              <span className="card-title">{p.name}</span>
              <span className="card-sub">
                {p.clientName || sq.topbar.noClient} · {sq.eventTypes[p.eventType]} ·{' '}
                {p.eventDate ? formatDate(p.eventDate) : sq.projects.noDate}
              </span>
              <span className="card-meta muted small">
                {p.hall.name} ·{' '}
                <span className="mono">
                  {formatMeters(p.hall.width)} × {formatMeters(p.hall.length)}
                </span>{' '}
                · {sq.projects.items(p.itemCount)}
              </span>
              <span className="card-meta muted small">
                {sq.projects.updated(p.updatedBy, formatDateTime(p.updatedAt))}
              </span>
            </button>
            <div className="card-side">
              <span className={`status status-${p.status}`}>{sq.statuses[p.status]}</span>
              {p.clientApproved !== undefined && (
                <span className="pill pill-ok">{sq.share.badgeApproved(p.clientApproved)}</span>
              )}
              {p.clientComments ? (
                <span className="pill pill-warn">{sq.share.badgeComments(p.clientComments)}</span>
              ) : null}
              {p.paid > 0 && p.quoteTotal > 0 && (
                <span className={`pill${p.paid >= p.quoteTotal ? ' pill-ok' : ''}`}>
                  {sq.payments.badge(Math.min(100, Math.round((p.paid / p.quoteTotal) * 100)))}
                </span>
              )}
              <div className="card-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => navigate({ name: 'project', id: p.id })}
                  title={sq.projects.open}
                  aria-label={sq.projects.open}
                >
                  <FolderOpen size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void duplicate(p)}
                  title={sq.projects.duplicate}
                  aria-label={sq.projects.duplicate}
                >
                  <Copy size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn btn-danger"
                  onClick={() => setToDelete(p)}
                  title={sq.projects.delete}
                  aria-label={sq.projects.delete}
                >
                  <Trash size={18} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={!!toDelete}
        title={sq.projects.deleteTitle}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
        confirmLabel={sq.projects.delete}
        danger
      >
        <p>{toDelete ? sq.projects.deleteBody(toDelete.name) : ''}</p>
      </ConfirmDialog>
    </AppShell>
  );
}
