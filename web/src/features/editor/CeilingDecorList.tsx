import { isCanopy } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalogMap, useEditor } from '../../model/store';

/** Direct way to select ceiling decor, which only its outline can do on the plan. */
export function CeilingDecorList() {
  const items = useEditor((s) => s.project.items);
  const canopies = items.filter((i) => isCanopy(i.type));
  if (!canopies.length) return null;
  return (
    <section className="panel-section">
      <h2>{sq.canopy.listTitle}</h2>
      <ul className="assign-list">
        {canopies.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              className="btn"
              onClick={() => useEditor.getState().setSelection([i.id])}
            >
              {i.label?.trim() || catalogMap.get(i.type)?.name || i.type}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
