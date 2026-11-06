import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Pencil, Plus, Star, StarOff, Trash } from 'lucide-react';
import { sq } from '../../i18n/sq';
import { activeOption, allOptions, useEditor } from '../../model/store';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { TextField } from './fields';

/**
 * "Opsioni A | Opsioni B | +": design options of the project, over the plan / 3D view, so the
 * agent can show the client alternatives (e.g. white roses vs. scanned peonies) side by side.
 */
export function OptionsBar() {
  const project = useEditor((s) => s.project);
  const options = allOptions(project);
  const active = activeOption(project);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(active.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const isFinal = project.finalOptionId === active.id;
  const s = useEditor.getState;

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  return (
    <div className="options-bar" ref={wrap} role="toolbar" aria-label={sq.options.title}>
      <div className="segmented options-tabs">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === active.id}
            onClick={() => o.id !== active.id && s().switchOption(o.id)}
          >
            {project.finalOptionId === o.id && (
              <Star size={14} className="final-star" aria-label={sq.options.final} />
            )}
            {o.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="icon-btn"
        onClick={() => s().addOption()}
        aria-label={sq.options.add}
        title={`${sq.options.add} – ${sq.options.addHint}`}
      >
        <Plus size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={sq.options.menu(active.name)}
        title={sq.options.menu(active.name)}
        onClick={() => setMenu((m) => !m)}
      >
        <Ellipsis size={18} />
      </button>
      {menu && (
        <div className="menu options-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setName(active.name);
              setRenaming(true);
              setMenu(false);
            }}
          >
            <Pencil size={18} />
            <span>{sq.options.rename}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              s().setFinalOption(isFinal ? undefined : active.id);
              setMenu(false);
            }}
          >
            {isFinal ? <StarOff size={18} /> : <Star size={18} />}
            <span>{isFinal ? sq.options.unmarkFinal : sq.options.markFinal}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            disabled={options.length < 2}
            onClick={() => {
              setConfirmDelete(true);
              setMenu(false);
            }}
          >
            <Trash size={18} />
            <span>{sq.options.delete}</span>
          </button>
        </div>
      )}

      <Modal
        open={renaming}
        title={sq.options.renameTitle}
        onClose={() => setRenaming(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setRenaming(false)}>
              {sq.common.cancel}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim()}
              onClick={() => {
                s().renameOption(active.id, name);
                setRenaming(false);
              }}
            >
              {sq.options.rename}
            </button>
          </>
        }
      >
        <TextField label={sq.options.newName} value={name} onCommit={setName} live />
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title={sq.options.deleteTitle}
        confirmLabel={sq.options.delete}
        danger
        onConfirm={() => {
          s().deleteOption(active.id);
          setConfirmDelete(false);
        }}
        onClose={() => setConfirmDelete(false)}
      >
        <p>{sq.options.deleteBody(active.name)}</p>
      </ConfirmDialog>
    </div>
  );
}
