import type { ReactNode } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { sq } from '../../i18n/sq';
import { logout } from '../../model/bootstrap';
import { navigate, type Route } from '../../model/router';
import { useSession } from '../../model/session';
import { useTheme } from '../../styles/theme';
import { NoticeBell } from './NoticeBell';

/** Header with navigation for the list/admin pages (the editor has its own top bar). */
export function AppShell({ active, children }: { active: Route['name']; children: ReactNode }) {
  const user = useSession((s) => s.user);
  const [theme, toggleTheme] = useTheme();
  const links: Array<{ route: Route; label: string; match: Array<Route['name']> }> = [
    { route: { name: 'projects' }, label: sq.nav.projects, match: ['projects', 'project'] },
    { route: { name: 'halls' }, label: sq.nav.halls, match: ['halls', 'hall', 'scanHall'] },
    { route: { name: 'calendar' }, label: sq.nav.calendar, match: ['calendar'] },
    { route: { name: 'library' }, label: sq.nav.library, match: ['library', 'scan'] },
  ];
  if (user?.role === 'admin') {
    links.push({ route: { name: 'dashboard' }, label: sq.nav.dashboard, match: ['dashboard'] });
    links.push({ route: { name: 'admin' }, label: sq.nav.admin, match: ['admin'] });
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-brand title-serif">{sq.app.name}</span>
        <nav className="shell-nav">
          {links.map((l) => (
            <button
              key={l.route.name}
              type="button"
              className="nav-link"
              aria-current={l.match.includes(active) ? 'page' : undefined}
              onClick={() => navigate(l.route)}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <NoticeBell />
        <span className="shell-user muted small">{user?.displayName}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={sq.topbar.themeToggle}
          title={sq.topbar.themeToggle}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button type="button" className="btn" onClick={() => void logout()}>
          <LogOut size={18} />
          <span className="hide-narrow">{sq.auth.logout}</span>
        </button>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
