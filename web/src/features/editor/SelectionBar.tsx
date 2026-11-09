import { Copy, RotateCw, SlidersHorizontal, Trash, X } from 'lucide-react';
import { sq } from '../../i18n/sq';
import { catalogMap, useEditor } from '../../model/store';
import { useUi } from '../../model/ui';

/**
 * Phones and tablets in portrait: what to do with the selected items, without covering the
 * view. The properties drawer opens only on request, so selecting never interrupts a drag.
 */
export function SelectionBar() {
  const selection = useEditor((s) => s.selection);
  const items = useEditor((s) => s.project.items);
  // Walking and presenting have their own controls in that space.
  const busy = useUi((u) => u.walk || u.present);
  if (!selection.length || busy) return null;
  const chosen = items.filter((i) => selection.includes(i.id));
  if (!chosen.length) return null;
  const first = chosen[0]!;
  const name =
    chosen.length === 1
      ? (catalogMap.get(first.type)?.name ?? first.type)
      : sq.props.multiSelected(chosen.length);
  const allLocked = chosen.every((i) => i.locked);
  const canRotate = chosen.some((i) => !i.locked && i.mount !== 'wall');
  const s = useEditor.getState;
  const button = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
    danger = false,
  ) => (
    <button
      type="button"
      className={`icon-btn${danger ? ' danger' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
  return (
    <div className="selection-bar" role="toolbar" aria-label={name} data-testid="selection-bar">
      <span className="selection-name">{name}</span>
      {button(sq.topbar.properties, <SlidersHorizontal size={18} />, () =>
        useUi.getState().set({ drawer: 'properties' }),
      )}
      {button(
        sq.props.rotateRight,
        <RotateCw size={18} />,
        () => s().rotateItems(selection, 15),
        !canRotate,
      )}
      {button(sq.props.duplicate, <Copy size={18} />, () => s().duplicateItems(selection))}
      {button(
        sq.props.delete,
        <Trash size={18} />,
        () => s().removeItems(selection),
        allLocked,
        true,
      )}
      {button(sq.props.deselect, <X size={18} />, () => s().setSelection([]))}
    </div>
  );
}
