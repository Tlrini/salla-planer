import { useState, type FormEvent } from 'react';
import type { SessionUser } from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { sq } from '../../i18n/sq';
import { useSession } from '../../model/session';
import { loadCatalog } from '../../model/bootstrap';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<SessionUser>('/api/auth/login', { username, password });
      await loadCatalog();
      useSession.getState().set({ user, status: 'auth' });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? sq.auth.tooMany
          : err instanceof ApiError && err.status === 401
            ? sq.auth.invalid
            : sq.errors.offline,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <h1 className="title-serif">{sq.app.name}</h1>
          <p className="muted">{sq.auth.tagline}</p>
        </div>
        <div className="field">
          <label htmlFor="login-user">{sq.auth.username}</label>
          <input
            id="login-user"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-pass">{sq.auth.password}</label>
          <input
            id="login-pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {sq.auth.submit}
        </button>
      </form>
    </main>
  );
}
