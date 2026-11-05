import { useState } from 'react';
import { autoLayoutTables, hasChairs } from '@salla/shared';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { catalog, catalogMap, useEditor } from '../../model/store';
import { NumberField, SelectField } from './fields';

/** "Vendos tavolinat automatikisht": choose a table type and count, place them in a grid. */
export function AutoLayoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tableTypes = catalog.filter(
    (c) => c.active && hasChairs(c) && c.chairLayout !== 'one_side',
  );
  const [type, setType] = useState(tableTypes[0]?.id ?? 'table_round_10');
  const [count, setCount] = useState<number | undefined>(20);
  const [result, setResult] = useState<string | null>(null);

  const place = () => {
    const { project, addItemsAt } = useEditor.getState();
    const asked = count ?? 0;
    const spots = autoLayoutTables(type, asked, project.hall, project.items, catalogMap);
    addItemsAt(type, spots);
    setResult(sq.autoLayout.placed(spots.length, asked));
    if (spots.length === asked) onClose();
  };

  return (
    <Modal
      open={open}
      title={sq.autoLayout.title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {sq.common.close}
          </button>
          <button type="button" className="btn btn-primary" onClick={place} disabled={!count}>
            {sq.autoLayout.place}
          </button>
        </>
      }
    >
      <p>{sq.autoLayout.hint}</p>
      <div className="form-grid">
        <SelectField
          label={sq.autoLayout.tableType}
          value={type}
          options={tableTypes.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setType}
        />
        <NumberField
          label={sq.autoLayout.count}
          value={count}
          decimals={0}
          min={1}
          max={200}
          onCommit={setCount}
        />
      </div>
      {result && (
        <p className="note" role="status">
          {result}
        </p>
      )}
    </Modal>
  );
}
