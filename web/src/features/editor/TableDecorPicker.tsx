import { useMemo } from 'react';
import { Ban, CopyCheck } from 'lucide-react';
import { formatEUR, isTabletop, type Item } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalog, useCatalogVersion, useEditor } from '../../model/store';
import { CatalogIcon } from '../catalog/CatalogIcon';

/**
 * "Dekori i tavolinës": choose the decor that stands on the selected table(s) — scanned library
 * arrangements first, then the built-in centerpieces — and copy it to all tables of the type.
 */
export function TableDecorPicker({ tables }: { tables: Item[] }) {
  const version = useCatalogVersion();
  const allItems = useEditor((s) => s.project.items);
  const decors = useMemo(
    () =>
      catalog
        .filter((c) => isTabletop(c) && c.active && !c.draft)
        .sort((a, b) => Number(b.source === 'library') - Number(a.source === 'library')),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog is mutated in place
    [version],
  );
  const first = tables[0]!;
  const same = tables.every((t) => t.tableDecor === first.tableDecor);
  const current = same ? first.tableDecor : null; // null = mixed selection
  const ids = tables.map((t) => t.id);
  const sameType = allItems.filter((i) => i.type === first.type && !i.locked);
  const set = (decor: string | undefined) => useEditor.getState().setTableDecor(ids, decor);

  return (
    <section className="decor-picker" aria-label={sq.decor.title}>
      <h3>{sq.decor.title}</h3>
      <p className="muted small">{sq.decor.hint}</p>
      <div className="decor-grid">
        <button
          type="button"
          className="decor-choice"
          aria-pressed={same && current === undefined}
          onClick={() => set(undefined)}
        >
          <span className="decor-none" aria-hidden>
            <Ban size={22} />
          </span>
          <span className="decor-name">{sq.decor.none}</span>
        </button>
        {decors.map((d) => (
          <button
            key={d.id}
            type="button"
            className="decor-choice"
            aria-pressed={current === d.id}
            aria-label={sq.decor.pick(d.name)}
            title={d.name}
            onClick={() => set(d.id)}
          >
            <CatalogIcon cat={d} />
            <span className="decor-name">{d.name}</span>
            {d.price > 0 && <span className="mono small muted">{formatEUR(d.price)}</span>}
          </button>
        ))}
      </div>
      {decors.length === 0 && <p className="muted small">{sq.decor.empty}</p>}
      {tables.length === 1 && sameType.length > 1 && (
        <button
          type="button"
          className="btn"
          onClick={() =>
            useEditor.getState().setTableDecor(
              sameType.map((t) => t.id),
              first.tableDecor,
            )
          }
        >
          <CopyCheck size={18} />
          <span>{sq.decor.applyType(sameType.length)}</span>
        </button>
      )}
    </section>
  );
}
