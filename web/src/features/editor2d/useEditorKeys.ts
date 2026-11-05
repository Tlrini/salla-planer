import { useEffect } from 'react';
import { history, useEditor } from '../../model/store';

const NUDGE = 0.1;
const NUDGE_BIG = 1;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Editor keyboard shortcuts (AGENTS.md §8). Ignored while typing in a field. */
export function useEditorKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useEditor.getState();
      const sel = s.selection;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        history.redo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        s.duplicateItems(sel);
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        s.setSelection(s.project.items.map((i) => i.id));
        return;
      }
      if (mod || e.altKey) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (sel.length) {
            e.preventDefault();
            s.removeItems(sel);
          }
          return;
        case 'Escape':
          s.setSelection([]);
          return;
        case 'r':
        case 'R':
          s.rotateItems(sel, e.shiftKey ? -15 : 15);
          return;
      }

      const step = e.shiftKey ? NUDGE_BIG : NUDGE;
      const dir: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = dir[e.key];
      if (d && sel.length) {
        e.preventDefault();
        s.nudgeItems(sel, d[0], d[1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
