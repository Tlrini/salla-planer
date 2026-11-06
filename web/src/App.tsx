import { lazy, Suspense, useEffect } from 'react';
import { sq } from './i18n/sq';
import { bootstrap } from './model/bootstrap';
import { parseRoute, useHash } from './model/router';
import { useSession } from './model/session';
import { AdminPage } from './features/admin/AdminPage';
import { LoginPage } from './features/auth/LoginPage';
import { HallsPage } from './features/halls/HallsPage';
import { HallEditorPage, ProjectEditorPage } from './features/projects/ProjectEditorPage';
import { ProjectsPage } from './features/projects/ProjectsPage';

// The library page carries the 3D model preview (three.js): load it only when opened.
const LibraryPage = lazy(() =>
  import('./features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);

const SharePage = lazy(() =>
  import('./features/share/SharePage').then((m) => ({ default: m.SharePage })),
);
const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const CalendarPage = lazy(() =>
  import('./features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);

export function App() {
  const status = useSession((s) => s.status);
  const route = parseRoute(useHash());

  useEffect(() => {
    void bootstrap();
  }, []);

  // Client share links work without an account.
  if (route.name === 'share')
    return (
      <Suspense fallback={<main className="center-message">{sq.errors.loading}</main>}>
        <SharePage token={route.token} />
      </Suspense>
    );
  if (status === 'loading') return <main className="center-message">{sq.errors.loading}</main>;
  if (status === 'anon') return <LoginPage />;

  switch (route.name) {
    case 'project':
      return <ProjectEditorPage id={route.id} />;
    case 'hall':
      return <HallEditorPage id={route.id} />;
    case 'halls':
      return <HallsPage />;
    case 'dashboard':
      return (
        <Suspense fallback={<main className="center-message">{sq.errors.loading}</main>}>
          <DashboardPage />
        </Suspense>
      );
    case 'calendar':
      return (
        <Suspense fallback={<main className="center-message">{sq.errors.loading}</main>}>
          <CalendarPage />
        </Suspense>
      );
    case 'library':
      return (
        <Suspense fallback={<main className="center-message">{sq.errors.loading}</main>}>
          <LibraryPage />
        </Suspense>
      );
    case 'admin':
      return <AdminPage />;
    default:
      return <ProjectsPage />;
  }
}
