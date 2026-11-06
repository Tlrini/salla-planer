import { useMemo, useRef, useState } from 'react';
import { Box, RotateCcw, Search, SlidersHorizontal, Trash, Upload } from 'lucide-react';
import { formatDecimal, formatEUR, type CatalogCategory, type CatalogItem } from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { sq } from '../../i18n/sq';
import { loadCatalog } from '../../model/bootstrap';
import { useSession } from '../../model/session';
import { catalog, useCatalogVersion } from '../../model/store';
import { ConfirmDialog } from '../editor/ConfirmDialog';
import { AppShell } from '../shell/AppShell';
import { ModelSetup } from './ModelSetup';

const CATEGORIES: CatalogCategory[] = ['floral', 'stage', 'lighting', 'tables', 'other'];

function sizeText(c: CatalogItem): string {
  const footprint =
    c.shape2d === 'circle' && Math.abs(c.width - c.depth) < 0.01
      ? `Ø${formatDecimal(c.width)}`
      : `${formatDecimal(c.width)} × ${formatDecimal(c.depth)}`;
  return `${footprint} × ${formatDecimal(c.height)} ${sq.common.meters}`;
}

/** "Biblioteka e dekoreve": the agency's scanned decorations, shared by all agents. */
export function LibraryPage() {
  const catalogVersion = useCatalogVersion();
  const user = useSession((s) => s.user);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'' | CatalogCategory>('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [toDelete, setToDelete] = useState<CatalogItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<'uploadError' | 'archivedNotice' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const all = useMemo(
    () => catalog.filter((c) => c.source === 'library'),
    // The catalog array is mutated in place; its version says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogVersion],
  );
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((c) => showArchived || c.active)
      .filter((c) => !category || c.category === category)
      .filter(
        (c) => !q || c.name.toLowerCase().includes(q) || c.createdBy?.toLowerCase().includes(q),
      )
      .sort((a, b) => Number(!!b.draft) - Number(!!a.draft) || a.name.localeCompare(b.name, 'sq'));
  }, [all, query, category, showArchived]);

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    setNotice(null);
    try {
      const created = await api.upload<CatalogItem>('/api/library', form);
      await loadCatalog();
      setEditing(created);
    } catch {
      setNotice('uploadError');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      const res = await api.del<{ archived?: boolean }>(`/api/library/${toDelete.id}`);
      if (res.archived) setNotice('archivedNotice');
      await loadCatalog();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setToDelete(null);
    }
  };

  const restore = async (c: CatalogItem) => {
    await api.put(`/api/library/${c.id}`, { active: true });
    await loadCatalog();
  };

  const canDelete = (c: CatalogItem) => user?.role === 'admin' || c.createdById === user?.id;

  return (
    <AppShell active="library">
      <div className="page-head">
        <h1 className="title-serif">{sq.library.title}</h1>
        <button
          type="button"
          className="btn btn-primary"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={18} />
          <span>{uploading ? sq.library.uploading : sq.library.upload}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          data-testid="library-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
      <p className="muted library-intro">{sq.library.intro}</p>
      {notice && (
        <p className={notice === 'uploadError' ? 'form-error' : 'notice'} role="status">
          {sq.library[notice]}
        </p>
      )}

      <div className="filters">
        <label className="search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder={sq.library.search}
            aria-label={sq.library.search}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          value={category}
          aria-label={sq.library.category}
          onChange={(e) => setCategory(e.target.value as '' | CatalogCategory)}
        >
          <option value="">{sq.library.allCategories}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {sq.categories[c]}
            </option>
          ))}
        </select>
        <label className="check-row">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>{sq.library.showArchived}</span>
        </label>
      </div>

      {items.length === 0 ? (
        <p className="muted empty">{all.length ? sq.library.noResults : sq.library.empty}</p>
      ) : (
        <ul className="library-grid">
          {items.map((c) => (
            <li key={c.id} className={`library-card${c.active ? '' : ' archived'}`}>
              <button type="button" className="library-open" onClick={() => setEditing(c)}>
                <span className="library-thumb">
                  {c.thumbnail ? (
                    <img src={c.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <Box size={40} />
                  )}
                </span>
                <span className="library-name">{c.name}</span>
                <span className="muted small mono">{c.draft ? sq.library.draft : sizeText(c)}</span>
                <span className="library-meta small">
                  {c.price > 0 && <span className="mono">{formatEUR(c.price)}</span>}
                  {c.createdBy && <span className="muted">{sq.library.by(c.createdBy)}</span>}
                </span>
                <span className="library-badges">
                  {c.draft && <span className="pill pill-warn">{sq.library.draft}</span>}
                  {!c.active && <span className="pill">{sq.library.archived}</span>}
                  {c.tabletop && !c.draft && (
                    <span className="pill">{sq.library.tabletopBadge}</span>
                  )}
                </span>
              </button>
              <div className="library-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${sq.library.edit}: ${c.name}`}
                  title={sq.library.edit}
                  onClick={() => setEditing(c)}
                >
                  <SlidersHorizontal size={18} />
                </button>
                {!c.active ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${sq.library.restore}: ${c.name}`}
                    title={sq.library.restore}
                    onClick={() => void restore(c)}
                  >
                    <RotateCcw size={18} />
                  </button>
                ) : (
                  canDelete(c) && (
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`${sq.library.delete}: ${c.name}`}
                      title={sq.library.delete}
                      onClick={() => setToDelete(c)}
                    >
                      <Trash size={18} />
                    </button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ModelSetup item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={sq.library.deleteTitle}
        confirmLabel={sq.library.delete}
        danger
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      >
        <p>{toDelete ? sq.library.deleteBody(toDelete.name) : ''}</p>
      </ConfirmDialog>
    </AppShell>
  );
}
