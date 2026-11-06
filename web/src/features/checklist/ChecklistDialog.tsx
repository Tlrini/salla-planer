import { useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { Check, FileDown, Plus, Trash } from 'lucide-react';
import {
  summarize,
  type CatalogCategory,
  type Checklist,
  type ChecklistEntry,
} from '@salla/shared';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { catalog, catalogMap, useEditor } from '../../model/store';

export type Stage = keyof ChecklistEntry;
export const STAGES: Stage[] = ['loaded', 'installed', 'returned'];
const CATEGORY_ORDER: CatalogCategory[] = ['tables', 'stage', 'floral', 'lighting', 'other'];

/** Share of lines done per stage (0–1). Pure, for the progress bars. */
export function stageProgress(types: readonly string[], checklist: Checklist | undefined) {
  const out = {} as Record<Stage, number>;
  for (const s of STAGES) {
    const done = types.filter((t) => checklist?.lines?.[t]?.[s]).length;
    out[s] = types.length ? done / types.length : 0;
  }
  return out;
}

/**
 * "Lista e punës": the team ticks every decor line when it is loaded on the truck, installed in
 * the hall and brought back, plus free tasks. Big touch targets for use on a tablet on site.
 */
export function ChecklistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title={sq.checklist.title} onClose={onClose} wide>
      {open && <ChecklistBody onClose={onClose} />}
    </Modal>
  );
}

function ChecklistBody({ onClose }: { onClose: () => void }) {
  const items = useEditor((s) => s.project.items);
  const checklist = useEditor((s) => s.project.checklist);
  const status = useEditor((s) => s.project.status);
  const lines = useMemo(() => summarize(items, catalog).lines, [items]);
  const progress = stageProgress(
    lines.map((l) => l.type),
    checklist,
  );
  const [task, setTask] = useState('');
  const [assignee, setAssignee] = useState('');
  const [exporting, setExporting] = useState(false);

  const save = (next: Checklist) => useEditor.getState().updateProject({ checklist: next });
  const toggle = (type: string, stage: Stage) => {
    const entry = { ...(checklist?.lines?.[type] ?? {}) };
    if (entry[stage]) delete entry[stage];
    else entry[stage] = true;
    save({ ...checklist, lines: { ...checklist?.lines, [type]: entry } });
  };
  const tasks = checklist?.tasks ?? [];

  const groups = CATEGORY_ORDER.map((c) => ({
    category: c,
    lines: lines.filter((l) => (catalogMap.get(l.type)?.category ?? 'other') === c),
  })).filter((g) => g.lines.length);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const ex = await import('../export/exporter');
      await ex.exportChecklistPdf(useEditor.getState().project);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="checklist">
      <div className="checklist-progress">
        {STAGES.map((s) => (
          <div key={s} className="progress-item">
            <span className="small">
              {sq.checklist.stages[s]} · {Math.round(progress[s] * 100)}%
            </span>
            <div className="progress-bar" aria-hidden>
              <span style={{ width: `${progress[s] * 100}%` }} />
            </div>
          </div>
        ))}
        {progress.installed === 1 && status !== 'instaluar' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => useEditor.getState().updateProject({ status: 'instaluar' })}
          >
            <Check size={18} />
            <span>{sq.checklist.markInstalled}</span>
          </button>
        )}
      </div>

      {lines.length === 0 && <p className="muted">{sq.checklist.empty}</p>}
      {groups.map((g) => (
        <section key={g.category} className="checklist-group">
          <h3>{sq.categories[g.category]}</h3>
          {g.lines.map((l) => (
            <div key={l.type} className="checklist-row">
              <span className="checklist-name">
                <span className="mono qty">{l.quantity}×</span> {l.name}
              </span>
              {STAGES.map((s) => {
                const done = !!checklist?.lines?.[l.type]?.[s];
                return (
                  <button
                    key={s}
                    type="button"
                    className={`check-toggle${done ? ' done' : ''}`}
                    aria-pressed={done}
                    aria-label={`${sq.checklist.stages[s]}: ${l.name}`}
                    onClick={() => toggle(l.type, s)}
                  >
                    {done && <Check size={16} />}
                    <span>{sq.checklist.stagesShort[s]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </section>
      ))}

      <section className="checklist-group">
        <h3>{sq.checklist.tasks}</h3>
        {tasks.map((t) => (
          <div key={t.id} className="checklist-row">
            <button
              type="button"
              className={`check-toggle${t.done ? ' done' : ''}`}
              aria-pressed={t.done}
              aria-label={t.text}
              onClick={() =>
                save({
                  ...checklist,
                  tasks: tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                })
              }
            >
              <Check size={16} />
            </button>
            <span className={`checklist-name${t.done ? ' struck' : ''}`}>
              {t.text}
              {t.assignee && <span className="muted small"> · {t.assignee}</span>}
            </span>
            <button
              type="button"
              className="icon-btn btn-danger"
              aria-label={sq.checklist.removeTask(t.text)}
              onClick={() => save({ ...checklist, tasks: tasks.filter((x) => x.id !== t.id) })}
            >
              <Trash size={16} />
            </button>
          </div>
        ))}
        <form
          className="seating-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!task.trim()) return;
            save({
              ...checklist,
              tasks: [
                ...tasks,
                {
                  id: nanoid(8),
                  text: task.trim().slice(0, 200),
                  done: false,
                  ...(assignee.trim() ? { assignee: assignee.trim().slice(0, 60) } : {}),
                },
              ],
            });
            setTask('');
          }}
        >
          <input
            value={task}
            placeholder={sq.checklist.taskPlaceholder}
            aria-label={sq.checklist.taskPlaceholder}
            onChange={(e) => setTask(e.target.value)}
          />
          <input
            value={assignee}
            placeholder={sq.checklist.assignee}
            aria-label={sq.checklist.assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
          <button type="submit" className="btn">
            <Plus size={18} />
            <span>{sq.checklist.addTask}</span>
          </button>
        </form>
      </section>

      <div className="dialog-actions">
        <button type="button" className="btn" disabled={exporting} onClick={() => void exportPdf()}>
          <FileDown size={18} />
          <span>{exporting ? sq.export.preparing : sq.checklist.pdf}</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {sq.common.close}
        </button>
      </div>
    </div>
  );
}
