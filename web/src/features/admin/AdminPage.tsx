import { useState } from 'react';
import { sq } from '../../i18n/sq';
import { useSession } from '../../model/session';
import { AppShell } from '../shell/AppShell';
import { CatalogAdmin } from './CatalogAdmin';
import { UsersAdmin } from './UsersAdmin';

export function AdminPage() {
  const user = useSession((s) => s.user);
  const [tab, setTab] = useState<'catalog' | 'users'>('catalog');
  if (user?.role !== 'admin') {
    return (
      <AppShell active="admin">
        <p className="muted">{sq.errors.notFound}</p>
      </AppShell>
    );
  }
  return (
    <AppShell active="admin">
      <div className="page-head">
        <h1 className="title-serif">{sq.admin.title}</h1>
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'catalog'}
            aria-pressed={tab === 'catalog'}
            onClick={() => setTab('catalog')}
          >
            {sq.admin.catalogTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'users'}
            aria-pressed={tab === 'users'}
            onClick={() => setTab('users')}
          >
            {sq.admin.usersTab}
          </button>
        </div>
      </div>
      {tab === 'catalog' ? <CatalogAdmin /> : <UsersAdmin />}
    </AppShell>
  );
}
