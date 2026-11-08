import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  FileSignature,
  History,
  Share2,
  Users,
} from 'lucide-react';
import { sq } from '../../i18n/sq';

type DialogProps = { open: boolean; onClose: () => void };

interface Tool {
  id: string;
  label: string;
  icon: typeof Users;
  dialog: ComponentType<DialogProps>;
}

// Each tool's screen is loaded on first use.
const SeatingDialog = lazy(() =>
  import('../guests/SeatingDialog').then((m) => ({ default: m.SeatingDialog })),
);

const ChecklistDialog = lazy(() =>
  import('../checklist/ChecklistDialog').then((m) => ({ default: m.ChecklistDialog })),
);

const ContractDialog = lazy(() =>
  import('../contract/ContractDialog').then((m) => ({ default: m.ContractDialog })),
);

const HistoryDialog = lazy(() =>
  import('../history/HistoryDialog').then((m) => ({ default: m.HistoryDialog })),
);

const ShareDialog = lazy(() =>
  import('../share/ShareDialog').then((m) => ({ default: m.ShareDialog })),
);

/** Tools that act on the whole project; one menu keeps the tablet top bar uncluttered. */
export const PROJECT_TOOLS: Tool[] = [
  { id: 'guests', label: sq.guests.menu, icon: Users, dialog: SeatingDialog },
  { id: 'checklist', label: sq.checklist.menu, icon: ClipboardCheck, dialog: ChecklistDialog },
  { id: 'contract', label: sq.contractDialog.menu, icon: FileSignature, dialog: ContractDialog },
  { id: 'share', label: sq.share.menu, icon: Share2, dialog: ShareDialog },
  { id: 'history', label: sq.history.menu, icon: History, dialog: HistoryDialog },
];

export function ProjectMenu() {
  const [menu, setMenu] = useState(false);
  const [openTool, setOpenTool] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const active = PROJECT_TOOLS.find((t) => t.id === openTool);

  return (
    <div className="export-menu" ref={wrap}>
      <button
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
      >
        <BriefcaseBusiness size={18} />
        <span className="hide-narrow">{sq.projectMenu.title}</span>
        <ChevronDown size={16} />
      </button>
      {menu && (
        <div className="menu" role="menu">
          {PROJECT_TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpenTool(id);
                setMenu(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      {active && (
        <Suspense fallback={null}>
          <active.dialog open onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
    </div>
  );
}
