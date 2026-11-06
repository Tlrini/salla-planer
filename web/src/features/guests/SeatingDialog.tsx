import { useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { ClipboardPaste, FileUp, Plus, Search, Sparkles, Trash, UserX, X } from 'lucide-react';
import {
  autoSeat,
  occupancy,
  parseGuestText,
  seatingIssues,
  seatingTables,
  type Guest,
} from '@salla/shared';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { catalogMap, useEditor } from '../../model/store';
import { foldText } from '../catalog/CatalogSidebar';
import { ConfirmDialog } from '../editor/ConfirmDialog';

const GUEST_MIME = 'application/x-salla-guest';
const RSVP: Array<NonNullable<Guest['rsvp']>> = ['pritet', 'po', 'jo'];
/** Stable empty list: a selector must not return a new array on every read. */
const NO_GUESTS: Guest[] = [];

/**
 * "Të ftuarit dhe ulja": guest list and seating plan. Tap a guest, then a table (tablet), or
 * drag a guest onto a table (desktop). Every change is one undo step and autosaves.
 */
export function SeatingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title={sq.guests.title} onClose={onClose} wide>
      {open && <Seating onClose={onClose} />}
    </Modal>
  );
}

function Seating({ onClose }: { onClose: () => void }) {
  const items = useEditor((s) => s.project.items);
  const guests = useEditor((s) => s.project.guests ?? NO_GUESTS);
  const tables = useMemo(() => seatingTables(items, catalogMap), [items]);
  const occ = useMemo(() => occupancy(guests), [guests]);
  const issues = useMemo(() => seatingIssues(guests, tables), [guests, tables]);
  const capacity = tables.reduce((s, t) => s + t.capacity, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = (next: Guest[]) => useEditor.getState().updateProject({ guests: next });
  const patchGuest = (id: string, patch: Partial<Guest>) =>
    save(guests.map((g) => (g.id === id ? clean({ ...g, ...patch }) : g)));
  const seat = (guestId: string, tableId: string | undefined) => {
    patchGuest(guestId, { tableId });
    setSelected(null);
  };
  const addMany = (list: Guest[]) => list.length && save([...guests, ...list]);

  const q = foldText(query.trim());
  const visible = (g: Guest) =>
    !q || foldText(g.name).includes(q) || foldText(g.group ?? '').includes(q);
  const unseated = guests.filter((g) => !g.tableId && visible(g));
  const sel = guests.find((g) => g.id === selected) ?? null;
  const declined = guests.filter((g) => g.rsvp === 'jo').length;

  const importFile = async (file: File) => {
    addMany(parseGuestText(await file.text(), () => nanoid(8)));
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="seating">
      <div className="seating-stats" data-testid="seating-stats">
        <span className="pill">{sq.guests.count(guests.length)}</span>
        <span className="pill">{sq.guests.seated(guests.length - issues.unseated - declined)}</span>
        <span className={`pill${issues.unseated ? ' pill-warn' : ''}`}>
          {sq.guests.unseated(issues.unseated)}
        </span>
        {declined > 0 && <span className="pill">{sq.guests.declined(declined)}</span>}
        <span className="pill">{sq.guests.capacity(capacity)}</span>
        {issues.overfull.map((o) => (
          <span key={o.tableId} className="pill pill-danger">
            {sq.guests.overfull(o.label, o.count, o.capacity)}
          </span>
        ))}
      </div>

      <div className="seating-toolbar">
        <label className="search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder={sq.guests.search}
            aria-label={sq.guests.search}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="button" className="btn" onClick={() => setPasting(true)}>
          <ClipboardPaste size={18} />
          <span>{sq.guests.paste}</span>
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <FileUp size={18} />
          <span>{sq.guests.importCsv}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          hidden
          data-testid="guests-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!tables.length || !issues.unseated}
          onClick={() => save(autoSeat(guests, tables))}
        >
          <Sparkles size={18} />
          <span>{sq.guests.autoSeat}</span>
        </button>
        <button
          type="button"
          className="btn"
          disabled={!guests.some((g) => g.tableId)}
          onClick={() => setConfirmClear(true)}
        >
          <UserX size={18} />
          <span>{sq.guests.clearSeats}</span>
        </button>
      </div>

      <form
        className="seating-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          addMany([clean({ id: nanoid(8), name: newName.trim(), group: newGroup.trim() })]);
          setNewName('');
        }}
      >
        <input
          value={newName}
          placeholder={sq.guests.name}
          aria-label={sq.guests.name}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          value={newGroup}
          placeholder={sq.guests.group}
          aria-label={sq.guests.group}
          list="guest-groups"
          onChange={(e) => setNewGroup(e.target.value)}
        />
        <datalist id="guest-groups">
          {[...new Set(guests.map((g) => g.group).filter(Boolean))].map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <button type="submit" className="btn">
          <Plus size={18} />
          <span>{sq.guests.add}</span>
        </button>
      </form>

      {sel && (
        <div className="guest-edit" role="group" aria-label={sq.guests.editTitle}>
          <input
            value={sel.name}
            aria-label={sq.guests.name}
            onChange={(e) => e.target.value.trim() && patchGuest(sel.id, { name: e.target.value })}
          />
          <input
            value={sel.group ?? ''}
            placeholder={sq.guests.group}
            aria-label={sq.guests.group}
            list="guest-groups"
            onChange={(e) => patchGuest(sel.id, { group: e.target.value })}
          />
          <select
            value={sel.rsvp ?? 'pritet'}
            aria-label={sq.guests.rsvp}
            onChange={(e) => patchGuest(sel.id, { rsvp: e.target.value as Guest['rsvp'] })}
          >
            {RSVP.map((r) => (
              <option key={r} value={r}>
                {sq.guests.rsvpValues[r]}
              </option>
            ))}
          </select>
          <input
            value={sel.note ?? ''}
            placeholder={sq.guests.note}
            aria-label={sq.guests.note}
            onChange={(e) => patchGuest(sel.id, { note: e.target.value })}
          />
          <button
            type="button"
            className="icon-btn btn-danger"
            aria-label={sq.guests.remove(sel.name)}
            title={sq.guests.remove(sel.name)}
            onClick={() => {
              save(guests.filter((g) => g.id !== sel.id));
              setSelected(null);
            }}
          >
            <Trash size={18} />
          </button>
          <span className="muted small">{sq.guests.tapTable}</span>
        </div>
      )}

      <div className="seating-body">
        <section
          className="seating-pool"
          aria-label={sq.guests.unseatedTitle}
          onDragOver={(e) => e.dataTransfer.types.includes(GUEST_MIME) && e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(GUEST_MIME);
            if (id) seat(id, undefined);
          }}
          onClick={() => sel?.tableId && seat(sel.id, undefined)}
        >
          <h3>{sq.guests.unseatedTitle}</h3>
          {guests.length === 0 && <p className="muted small">{sq.guests.empty}</p>}
          <ul className="guest-chips">
            {unseated.map((g) => (
              <GuestChip
                key={g.id}
                guest={g}
                selected={g.id === selected}
                onSelect={() => setSelected(g.id === selected ? null : g.id)}
              />
            ))}
          </ul>
        </section>

        <section className="seating-tables" aria-label={sq.guests.tablesTitle}>
          {tables.length === 0 && <p className="muted">{sq.guests.noTables}</p>}
          {tables.map((t) => {
            const count = occ.get(t.id) ?? 0;
            const here = guests.filter((g) => g.tableId === t.id && visible(g));
            return (
              <div
                key={t.id}
                className={`seat-table${count > t.capacity ? ' over' : ''}${sel ? ' target' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={sq.guests.seatAt(t.label)}
                onClick={() => sel && seat(sel.id, t.id)}
                onKeyDown={(e) => e.key === 'Enter' && sel && seat(sel.id, t.id)}
                onDragOver={(e) => e.dataTransfer.types.includes(GUEST_MIME) && e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(GUEST_MIME);
                  if (id) seat(id, t.id);
                }}
              >
                <div className="seat-table-head">
                  <strong>{t.label}</strong>
                  <span className="mono small">
                    {count}/{t.capacity}
                  </span>
                </div>
                <ul className="guest-chips">
                  {here.map((g) => (
                    <GuestChip
                      key={g.id}
                      guest={g}
                      selected={g.id === selected}
                      onSelect={() => setSelected(g.id === selected ? null : g.id)}
                      onUnseat={() => seat(g.id, undefined)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {sq.common.close}
        </button>
      </div>

      <Modal
        open={pasting}
        title={sq.guests.paste}
        onClose={() => setPasting(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setPasting(false)}>
              {sq.common.cancel}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!pasteText.trim()}
              onClick={() => {
                addMany(parseGuestText(pasteText, () => nanoid(8)));
                setPasteText('');
                setPasting(false);
              }}
            >
              {sq.guests.add}
            </button>
          </>
        }
      >
        <p className="muted small">{sq.guests.pasteHint}</p>
        <textarea
          className="paste-area"
          rows={10}
          value={pasteText}
          aria-label={sq.guests.paste}
          onChange={(e) => setPasteText(e.target.value)}
        />
      </Modal>
      <ConfirmDialog
        open={confirmClear}
        title={sq.guests.clearSeats}
        confirmLabel={sq.guests.clearSeats}
        danger
        onConfirm={() => {
          save(guests.map(({ tableId: _t, ...g }) => g));
          setConfirmClear(false);
        }}
        onClose={() => setConfirmClear(false)}
      >
        <p>{sq.guests.clearBody}</p>
      </ConfirmDialog>
    </div>
  );
}

function GuestChip({
  guest,
  selected,
  onSelect,
  onUnseat,
}: {
  guest: Guest;
  selected: boolean;
  onSelect: () => void;
  onUnseat?: () => void;
}) {
  return (
    <li
      className={`guest-chip${selected ? ' selected' : ''}${guest.rsvp === 'jo' ? ' declined' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(GUEST_MIME, guest.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button
        type="button"
        className="guest-name"
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {guest.name}
        {guest.group && <span className="guest-group">{guest.group}</span>}
      </button>
      {onUnseat && (
        <button
          type="button"
          className="guest-x"
          aria-label={sq.guests.unseat(guest.name)}
          onClick={(e) => {
            e.stopPropagation();
            onUnseat();
          }}
        >
          <X size={14} />
        </button>
      )}
    </li>
  );
}

/** Drop empty optional fields so the saved JSON stays small and valid. */
function clean(g: Guest): Guest {
  const out: Guest = { id: g.id, name: g.name.slice(0, 120) };
  if (g.group?.trim()) out.group = g.group.trim().slice(0, 60);
  if (g.tableId) out.tableId = g.tableId;
  if (g.note?.trim()) out.note = g.note.slice(0, 200);
  if (g.rsvp && g.rsvp !== 'pritet') out.rsvp = g.rsvp;
  return out;
}
