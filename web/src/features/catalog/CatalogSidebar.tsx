import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { formatEUR, type CatalogCategory } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalog, useCatalogVersion, useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { ITEM_DRAG_MIME } from '../editor2d/units';
import { CatalogIcon } from './CatalogIcon';
import { AutoLayoutDialog } from '../editor/AutoLayoutDialog';

const PROJECT_CATEGORIES: CatalogCategory[] = ['tables', 'stage', 'floral', 'lighting', 'other'];
const HALL_CATEGORIES: CatalogCategory[] = ['structure'];

export function CatalogSidebar({ kind }: { kind: 'project' | 'hall' }) {
  useCatalogVersion();
  const categories = kind === 'hall' ? HALL_CATEGORIES : PROJECT_CATEGORIES;
  const [layoutOpen, setLayoutOpen] = useState(false);
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
      <p className="catalog-hint">{sq.catalog.hint}</p>
      {categories.map((category) => {
        const entries = catalog.filter((c) => c.category === category && c.active);
        if (!entries.length) return null;
        return (
          <section key={category} className="catalog-group">
            <h3>{sq.categories[category]}</h3>
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
