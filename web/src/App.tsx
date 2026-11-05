import { useEffect } from 'react';
import { sq } from './i18n/sq';
import { bootstrap } from './model/bootstrap';
import { parseRoute, useHash } from './model/router';
import { useSession } from './model/session';
import { AdminPage } from './features/admin/AdminPage';
import { LoginPage } from './features/auth/LoginPage';
import { HallsPage } from './features/halls/HallsPage';
import { HallEditorPage, ProjectEditorPage } from './features/projects/ProjectEditorPage';
import { ProjectsPage } from './features/projects/ProjectsPage';

export function App() {
  const status = useSession((s) => s.status);
  const route = parseRoute(useHash());

  useEffect(() => {
    void bootstrap();
  }, []);

  if (status === 'loading') return <main className="center-message">{sq.errors.loading}</main>;
  if (status === 'anon') return <LoginPage />;

  switch (route.name) {
    case 'project':
      return <ProjectEditorPage id={route.id} />;
    case 'hall':
      return <HallEditorPage id={route.id} />;
    case 'halls':
      return <HallsPage />;
    case 'admin':
      return <AdminPage />;
    default:
      return <ProjectsPage />;
  }
}
