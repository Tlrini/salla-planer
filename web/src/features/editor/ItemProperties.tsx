import { Copy, Lock, LockOpen, RotateCcw, RotateCw, Trash, X } from 'lucide-react';
import {
  acceptsTableDecor,
  autoLabels,
  formatEUR,
  formatMeters,
  hasChairs,
  normalizeAngle,
  seatCount,
  type Item,
} from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalogMap, useEditor } from '../../model/store';
import { ColorField, NumberField, TextField } from './fields';
import { TableDecorPicker } from './TableDecorPicker';

function Actions({ ids, locked }: { ids: string[]; locked: boolean }) {
  const s = useEditor.getState;
  return (
    <div className="actions-row">
      <button
        type="button"
        className="btn"
        onClick={() => s().rotateItems(ids, -15)}
        title={sq.props.rotateLeft}
        aria-label={sq.props.rotateLeft}
      >
        <RotateCcw size={18} />
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => s().rotateItems(ids, 15)}
        title={sq.props.rotateRight}
        aria-label={sq.props.rotateRight}
      >
        <RotateCw size={18} />
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={locked}
        onClick={() =>
          s().updateItems(Object.fromEntries(ids.map((id) => [id, { locked: !locked }])))
        }
      >
        {locked ? <Lock size={18} /> : <LockOpen size={18} />}
        <span>{locked ? sq.props.unlock : sq.props.lock}</span>
      </button>
      <button type="button" className="btn" onClick={() => s().duplicateItems(ids)}>
        <Copy size={18} />
        <span>{sq.props.duplicate}</span>
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => s().removeItems(ids)}
        disabled={locked}
      >
        <Trash size={18} />
        <span>{sq.props.delete}</span>
      </button>
    </div>
  );
}

function SingleItem({ item }: { item: Item }) {
  const cat = catalogMap.get(item.type);
  const items = useEditor((s) => s.project.items);
  const update = (patch: Partial<Item>) => useEditor.getState().updateItems({ [item.id]: patch });
  const autoLabel = hasChairs(cat)
    ? (autoLabels(items, catalogMap).get(item.id) ?? cat?.name ?? '')
    : '';
  const canWidth = cat?.resizable === 'width' || cat?.resizable === 'both';
  const canDepth = cat?.resizable === 'both';

  return (
    <>
      <div className="panel-heading">
        <h2>{cat?.name ?? item.type}</h2>
        {cat && cat.price > 0 && (
          <span className="mono muted">
            {sq.props.price}: {formatEUR(cat.price)}
          </span>
        )}
      </div>
      {item.locked && <p className="note">{sq.props.lockedHint}</p>}
      <Actions ids={[item.id]} locked={!!item.locked} />

      <TextField
        label={sq.props.label}
        value={item.label ?? ''}
        placeholder={hasChairs(cat) ? sq.props.labelPlaceholder(autoLabel) : undefined}
        onCommit={(v) => update({ label: v.trim() ? v.trim() : undefined })}
      />

      <div className="field-row">
        {canWidth ? (
          <NumberField
            label={sq.props.width}
            value={item.width}
            unit="m"
            min={0.1}
            max={50}
            onCommit={(v) => v !== undefined && update({ width: v })}
          />
        ) : (
          <ReadOnly label={sq.props.width} value={item.width} />
        )}
        {canDepth ? (
          <NumberField
            label={sq.props.depth}
            value={item.depth}
            unit="m"
            min={0.1}
            max={50}
            onCommit={(v) => v !== undefined && update({ depth: v })}
          />
        ) : (
          <ReadOnly label={sq.props.depth} value={item.depth} />
        )}
      </div>

      <div className="field-row">
        <NumberField
          label={sq.props.rotation}
          value={item.rotation}
          decimals={0}
          unit="°"
          onCommit={(v) => v !== undefined && update({ rotation: normalizeAngle(v) })}
        />
        {hasChairs(cat) && (
          <NumberField
            label={sq.props.seats}
            value={item.seats}
            decimals={0}
            min={0}
            max={60}
            allowEmpty
            placeholder={String(seatCount({ ...item, seats: undefined }, cat))}
            onCommit={(v) => update({ seats: v })}
          />
        )}
      </div>

      <ColorField
        label={sq.props.color}
        value={item.color}
        onChange={(c) => update({ color: c })}
      />
      {(cat?.defaultColor2 || item.color2) && (
        <ColorField
          label={sq.props.color2}
          value={item.color2 ?? cat?.defaultColor2 ?? '#FFFFFF'}
          onChange={(c) => update({ color2: c })}
        />
      )}
      {acceptsTableDecor(cat) && !item.locked && <TableDecorPicker tables={[item]} />}
    </>
  );
}

function ReadOnly({ label, value }: { label: string; value: number }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="readonly mono">{formatMeters(value, 2)}</span>
    </div>
  );
}

function MultiItems({ items }: { items: Item[] }) {
  const ids = items.map((i) => i.id);
  const allLocked = items.every((i) => i.locked);
  const first = items[0]!;
  // Decor can be set on all selected tables at once.
  const tables = items.filter((i) => !i.locked && acceptsTableDecor(catalogMap.get(i.type)));
  return (
    <>
      <div className="panel-heading">
        <h2>{sq.props.multiSelected(items.length)}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => useEditor.getState().setSelection([])}
          aria-label={sq.props.deselect}
          title={sq.props.deselect}
        >
          <X size={18} />
        </button>
      </div>
      <Actions ids={ids} locked={allLocked} />
      <ColorField
        label={sq.props.color}
        value={first.color}
        onChange={(c) =>
          useEditor.getState().updateItems(Object.fromEntries(ids.map((id) => [id, { color: c }])))
        }
      />
      {tables.length > 0 && <TableDecorPicker tables={tables} />}
    </>
  );
}

export function ItemProperties({ items }: { items: Item[] }) {
  if (items.length === 1) return <SingleItem key={items[0]!.id} item={items[0]!} />;
  return <MultiItems items={items} />;
}
