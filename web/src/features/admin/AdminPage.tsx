import { useState } from 'react';
import { sq } from '../../i18n/sq';
import { useSession } from '../../model/session';
import { AppShell } from '../shell/AppShell';
import { AgencyAdmin } from './AgencyAdmin';
import { CatalogAdmin } from './CatalogAdmin';
import { UsersAdmin } from './UsersAdmin';

export function AdminPage() {
  const user = useSession((s) => s.user);
  const [tab, setTab] = useState<'catalog' | 'users' | 'agency'>('catalog');
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
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'agency'}
            aria-pressed={tab === 'agency'}
            onClick={() => setTab('agency')}
          >
            {sq.agency.tab}
          </button>
        </div>
      </div>
      {tab === 'catalog' ? <CatalogAdmin /> : tab === 'users' ? <UsersAdmin /> : <AgencyAdmin />}
    </AppShell>
  );
}
