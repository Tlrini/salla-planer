import { catalogMap } from '../../model/store';
import { DROP_OFFSET_Y, useCatalogDrag } from './touchDrag';
import { CatalogIcon } from './CatalogIcon';

/** What follows the finger during a touch drag; its center is where the item will land. */
export function CatalogDragGhost() {
  const drag = useCatalogDrag((s) => s.drag);
  const cat = drag ? catalogMap.get(drag.type) : undefined;
  if (!drag || !cat) return null;
  return (
    <div
      className="catalog-ghost"
      style={{ left: drag.x, top: drag.y - DROP_OFFSET_Y }}
      data-testid="catalog-ghost"
      aria-hidden
    >
      <CatalogIcon cat={cat} />
      <span>{cat.name}</span>
    </div>
  );
}
