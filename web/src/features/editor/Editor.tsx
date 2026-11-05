import { lazy, Suspense, useEffect } from 'react';
import { X } from 'lucide-react';
import { sq } from '../../i18n/sq';
import { useAutosave } from '../../model/autosave';
import { useCatalogVersion, useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { CatalogSidebar } from '../catalog/CatalogSidebar';
import { BlueprintStage } from '../editor2d/BlueprintStage';
import { useEditorKeys } from '../editor2d/useEditorKeys';
import { ConflictDialog } from './ConflictDialog';
import { EditorTopBar } from './EditorTopBar';
import { PropertiesPanel } from './PropertiesPanel';

// three.js is only downloaded when the 3D view is first opened.
const Viewer3D = lazy(() => import('../viewer3d/Viewer3D'));

function DrawerClose() {
  return (
    <button
      type="button"
      className="icon-btn drawer-close"
      onClick={() => useUi.getState().set({ drawer: 'none' })}
      aria-label={sq.common.close}
    >
      <X size={20} />
    </button>
  );
}

export function Editor({ kind }: { kind: 'project' | 'hall' }) {
  useCatalogVersion();
  useAutosave();
  useEditorKeys();
  const drawer = useUi((s) => s.drawer);
  const view = useUi((s) => s.view);
  const hasSelection = useEditor((s) => s.selection.length > 0);

  // On narrow screens, open the properties drawer when something gets selected.
  useEffect(() => {
    if (
      hasSelection &&
      window.matchMedia('(max-width: 900px)').matches &&
      useUi.getState().drawer === 'none'
    ) {
      useUi.getState().set({ drawer: 'properties' });
    }
  }, [hasSelection]);

  return (
    <div className="editor" data-drawer={drawer}>
      <EditorTopBar kind={kind} />
      <aside className="sidebar sidebar-left">
        <DrawerClose />
        <CatalogSidebar kind={kind} />
      </aside>
      <main className="canvas-area" data-view={view}>
        {view !== '3d' && (
          <div className="pane pane-2d">
            <BlueprintStage />
          </div>
        )}
        {view !== '2d' && (
          <div className="pane pane-3d">
            <Suspense fallback={<p className="viewer-loading">{sq.viewer.loading}</p>}>
              <Viewer3D />
            </Suspense>
          </div>
        )}
      </main>
      <aside className="sidebar sidebar-right">
        <DrawerClose />
        <PropertiesPanel kind={kind} />
      </aside>
      {kind === 'project' && <ConflictDialog />}
      <div className="drawer-backdrop" onClick={() => useUi.getState().set({ drawer: 'none' })} />
    </div>
  );
}
