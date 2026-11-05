import {
  ArrowLeft,
  Moon,
  PanelLeft,
  Redo2,
  Save,
  SlidersHorizontal,
  Sun,
  Undo2,
} from 'lucide-react';
import { sq } from '../../i18n/sq';
import { flushSave } from '../../model/autosave';
import { navigate } from '../../model/router';
import { history, useEditor, useHistory } from '../../model/store';
import { useUi, type SaveStatus } from '../../model/ui';
import { useTheme } from '../../styles/theme';
import { ExportMenu } from '../export/ExportMenu';
import { WarningsBadge } from './WarningsBadge';

function saveText(s: SaveStatus): string {
  if (s.kind === 'saving') return sq.topbar.saving;
  if (s.kind === 'error') return sq.topbar.saveError;
  if (s.kind === 'conflict') return sq.topbar.saveConflict;
  const t = s.at.toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return sq.topbar.saved(t);
}

export function EditorTopBar({ kind }: { kind: 'project' | 'hall' }) {
  const name = useEditor((s) => (kind === 'hall' ? s.project.hall.name : s.project.name));
  const client = useEditor((s) => s.project.clientName);
  const canUndo = useHistory((h) => h.pastStates.length > 0);
  const canRedo = useHistory((h) => h.futureStates.length > 0);
  const save = useUi((s) => s.save);
  const drawer = useUi((s) => s.drawer);
  const view = useUi((s) => s.view);
  const set = useUi((s) => s.set);
  const [theme, toggleTheme] = useTheme();

  const toggleDrawer = (d: 'catalog' | 'properties') => set({ drawer: drawer === d ? 'none' : d });
  const back = async () => {
    await flushSave();
    navigate(kind === 'hall' ? { name: 'halls' } : { name: 'projects' });
  };

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn"
        onClick={() => void back()}
        aria-label={sq.nav.back}
        title={sq.nav.back}
      >
        <ArrowLeft size={20} />
      </button>
      <button
        type="button"
        className="icon-btn drawer-toggle"
        aria-pressed={drawer === 'catalog'}
        onClick={() => toggleDrawer('catalog')}
        aria-label={sq.topbar.catalog}
        title={sq.topbar.catalog}
      >
        <PanelLeft size={20} />
      </button>

      <div className="topbar-title">
        <h1 className="title-serif">{name || sq.project.defaultName}</h1>
        <span className="muted small">
          {kind === 'hall' ? sq.halls.title : client || sq.topbar.noClient}
        </span>
      </div>

      <span className={`save-status ${save.kind}`} role="status">
        {saveText(save)}
      </span>
      <button
        type="button"
        className="icon-btn"
        onClick={() => void flushSave()}
        aria-label={sq.save.button}
        title={sq.save.button}
      >
        <Save size={20} />
      </button>

      <div className="topbar-group">
        <button
          type="button"
          className="icon-btn"
          onClick={history.undo}
          disabled={!canUndo}
          aria-label={sq.topbar.undo}
          title={sq.topbar.undo}
        >
          <Undo2 size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={history.redo}
          disabled={!canRedo}
          aria-label={sq.topbar.redo}
          title={sq.topbar.redo}
        >
          <Redo2 size={20} />
        </button>
      </div>

      {kind === 'project' && <WarningsBadge />}

      <div className="segmented" role="group">
        <button type="button" aria-pressed={view === '2d'} onClick={() => set({ view: '2d' })}>
          {sq.topbar.view2d}
        </button>
        <button type="button" aria-pressed={view === '3d'} onClick={() => set({ view: '3d' })}>
          {sq.topbar.view3d}
        </button>
        <button
          type="button"
          aria-pressed={view === 'split'}
          onClick={() => set({ view: 'split' })}
          className="hide-narrow"
        >
          {sq.topbar.viewSplit}
        </button>
      </div>

      {kind === 'project' && <ExportMenu />}

      <button
        type="button"
        className="icon-btn hide-narrow"
        onClick={toggleTheme}
        aria-label={sq.topbar.themeToggle}
        title={sq.topbar.themeToggle}
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <button
        type="button"
        className="icon-btn drawer-toggle"
        aria-pressed={drawer === 'properties'}
        onClick={() => toggleDrawer('properties')}
        aria-label={sq.topbar.properties}
        title={sq.topbar.properties}
      >
        <SlidersHorizontal size={20} />
      </button>
    </header>
  );
}
