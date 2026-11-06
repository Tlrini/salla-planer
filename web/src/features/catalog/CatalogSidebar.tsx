import { useState } from 'react';
import { Search, WandSparkles } from 'lucide-react';
import { formatEUR, type CatalogCategory } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalog, useCatalogVersion, useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { ITEM_DRAG_MIME } from '../editor2d/units';
import { CatalogIcon } from './CatalogIcon';
import { AutoLayoutDialog } from '../editor/AutoLayoutDialog';

const PROJECT_CATEGORIES: CatalogCategory[] = ['tables', 'stage', 'floral', 'lighting', 'other'];
const HALL_CATEGORIES: CatalogCategory[] = ['structure'];

/** Lowercase without accents, so "pista" finds "Pistë" and "karrige" finds "Karrigë". */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function CatalogSidebar({ kind }: { kind: 'project' | 'hall' }) {
  useCatalogVersion();
  const categories = kind === 'hall' ? HALL_CATEGORIES : PROJECT_CATEGORIES;
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = foldText(query.trim());
  const matches = (name: string) => !q || foldText(name).includes(q);
  // Scanned decor from the agency library comes first, in its own group.
  const library = catalog.filter((c) => c.source === 'library' && c.active && !c.draft);
  const groups = [
    ...(kind === 'project'
      ? [
          {
            key: 'library',
            title: sq.library.sidebarGroup,
            entries: library.filter((c) => matches(c.name)),
          },
        ]
      : []),
    ...categories.map((category) => ({
      key: category,
      title: sq.categories[category],
      entries: catalog.filter((c) => c.category === category && c.active && c.source !== 'library'),
    })),
  ];
  const add = (type: string) => {
    const ui = useUi.getState();
    const { hall } = useEditor.getState().project;
    const at = ui.viewCenter ?? { x: hall.width / 2, y: hall.length / 2 };
    useEditor.getState().addItem(type, at);
    if (ui.drawer === 'catalog') ui.set({ drawer: 'none' });
  };

  return (
    <nav className="catalog" aria-label={sq.catalog.title}>
      {kind === 'project' && (
        <>
          <button type="button" className="btn auto-layout-btn" onClick={() => setLayoutOpen(true)}>
            <WandSparkles size={18} />
            <span>{sq.autoLayout.button}</span>
          </button>
          <AutoLayoutDialog open={layoutOpen} onClose={() => setLayoutOpen(false)} />
        </>
      )}
      <label className="search catalog-search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder={sq.catalog.search}
          aria-label={sq.catalog.search}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="catalog-hint">{sq.catalog.hint}</p>
      {q && groups.every((g) => g.entries.length === 0) && (
        <p className="muted small">{sq.catalog.noResults}</p>
      )}
      {groups.map(({ key, title, entries }) => {
        if (!entries.length) return null;
        return (
          <section key={key} className="catalog-group">
            <h3>{title}</h3>
            <ul>
              {entries.map((cat) => (
                <li key={cat.id}>
                  <button
                    type="button"
                    className="catalog-item"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(ITEM_DRAG_MIME, cat.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => add(cat.id)}
                    aria-label={sq.catalog.addItem(cat.name)}
                  >
                    <CatalogIcon cat={cat} />
                    <span className="catalog-name">{cat.name}</span>
                    {cat.price > 0 && (
                      <span className="catalog-price mono">{formatEUR(cat.price)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
