/**
 * Simple ordered SQL migrations. Never edit a migration that has shipped; add a new one.
 * Applied ids are recorded in schema_migrations.
 */
export const MIGRATIONS: ReadonlyArray<{ id: number; name: string; sql: string }> = [
  {
    id: 1,
    name: 'init',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'agent')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        client_name TEXT NOT NULL,
        client_phone TEXT,
        event_type TEXT NOT NULL,
        event_date TEXT,
        guest_target INTEGER,
        status TEXT NOT NULL,
        hall TEXT NOT NULL,      -- JSON (Hall snapshot)
        items TEXT NOT NULL,     -- JSON (Item[])
        notes TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL
      );
      CREATE INDEX projects_updated ON projects(updated_at);

      CREATE TABLE halls (
        id TEXT PRIMARY KEY,
        example INTEGER NOT NULL DEFAULT 0,
        hall TEXT NOT NULL,      -- JSON (Hall)
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE catalog (
        id TEXT PRIMARY KEY,
        sort INTEGER NOT NULL,
        data TEXT NOT NULL       -- JSON (CatalogItem)
      );
    `,
  },
];
