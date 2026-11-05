import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash } from 'lucide-react';
import { UserRole, type User, type UserCreate } from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { useSession } from '../../model/session';
import { ConfirmDialog } from '../editor/ConfirmDialog';
import { SelectField, TextField } from '../editor/fields';

const ROLE_OPTIONS = UserRole.options.map((r) => ({ value: r, label: sq.admin.users.roles[r] }));

function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.body?.error === 'username_taken') return sq.admin.users.taken;
    if (err.body?.error === 'last_admin') return sq.admin.users.lastAdmin;
    if (err.status === 400) return sq.admin.users.invalid;
  }
  return sq.errors.generic;
}

function UserRow({
  user,
  me,
  onChanged,
  onError,
  onDelete,
}: {
  user: User;
  me: boolean;
  onChanged: () => void;
  onError: (m: string) => void;
  onDelete: () => void;
}) {
  const [password, setPassword] = useState('');
  const update = async (
    patch: Partial<Pick<User, 'displayName' | 'role' | 'active'>> & { password?: string },
  ) => {
    try {
      await api.put(`/api/users/${user.id}`, patch);
      onChanged();
    } catch (err) {
      onError(errorText(err));
      onChanged();
    }
  };
  return (
    <tr>
      <td>
        <input
          aria-label={sq.admin.users.displayName}
          defaultValue={user.displayName}
          onBlur={(e) =>
            e.target.value.trim() &&
            e.target.value !== user.displayName &&
            void update({ displayName: e.target.value.trim() })
          }
        />
      </td>
      <td className="mono">
        {user.username} {me && <span className="muted small">{sq.admin.users.you}</span>}
      </td>
      <td>
        <select
          aria-label={sq.admin.users.role}
          value={user.role}
          onChange={(e) => void update({ role: e.target.value as User['role'] })}
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={sq.admin.users.active}
          checked={user.active}
          onChange={(e) => void update({ active: e.target.checked })}
        />
      </td>
      <td>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length >= 6) void update({ password }).then(() => setPassword(''));
            else onError(sq.admin.users.invalid);
          }}
        >
          <input
            type="password"
            autoComplete="new-password"
            aria-label={sq.admin.users.newPassword}
            placeholder={sq.admin.users.newPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!password}>
            {sq.admin.save}
          </button>
        </form>
      </td>
      <td>
        {!me && (
          <button
            type="button"
            className="icon-btn btn-danger"
            onClick={onDelete}
            aria-label={sq.admin.users.delete}
            title={sq.admin.users.delete}
          >
            <Trash size={16} />
          </button>
        )}
      </td>
    </tr>
  );
}

export function UsersAdmin() {
  const me = useSession((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<UserCreate>({
    username: '',
    displayName: '',
    password: '',
    role: 'agent',
  });
  const [toDelete, setToDelete] = useState<User | null>(null);

  const load = useCallback(async () => setUsers(await api.get<User[]>('/api/users')), []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/users', draft);
      setCreating(false);
      setDraft({ username: '', displayName: '', password: '', role: 'agent' });
      setError(null);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.del(`/api/users/${toDelete.id}`);
    } catch (err) {
      setError(errorText(err));
    }
    setToDelete(null);
    await load();
  };

  return (
    <section>
      <div className="section-head">
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          <span>{sq.admin.users.create}</span>
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{sq.admin.users.displayName}</th>
              <th>{sq.admin.users.username}</th>
              <th>{sq.admin.users.role}</th>
              <th>{sq.admin.users.active}</th>
              <th>{sq.admin.users.password}</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                me={u.id === me?.id}
                onChanged={() => void load()}
                onError={setError}
                onDelete={() => setToDelete(u)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={creating}
        title={sq.admin.users.createTitle}
        onClose={() => setCreating(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              {sq.common.cancel}
            </button>
            <button type="submit" form="new-user" className="btn btn-primary">
              {sq.admin.users.create}
            </button>
          </>
        }
      >
        <form id="new-user" className="form-grid" onSubmit={create}>
          <TextField
            label={sq.admin.users.displayName}
            value={draft.displayName}
            live
            onCommit={(displayName) => setDraft({ ...draft, displayName })}
          />
          <TextField
            label={sq.admin.users.username}
            value={draft.username}
            live
            onCommit={(username) => setDraft({ ...draft, username })}
          />
          <TextField
            label={sq.admin.users.password}
            type="password"
            value={draft.password}
            live
            onCommit={(password) => setDraft({ ...draft, password })}
          />
          <SelectField
            label={sq.admin.users.role}
            value={draft.role}
            options={ROLE_OPTIONS}
            onChange={(role) => setDraft({ ...draft, role })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={sq.admin.users.deleteTitle}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
        confirmLabel={sq.admin.users.delete}
        danger
      >
        <p>{toDelete ? sq.admin.users.deleteBody(toDelete.displayName) : ''}</p>
      </ConfirmDialog>
    </section>
  );
}
