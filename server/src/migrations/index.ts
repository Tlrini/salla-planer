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
  {
    id: 2,
    name: 'project_extra',
    // JSON for project fields added in the beta (design options, saved viewpoints, ...), so new
    // optional fields don't need a migration each.
    sql: `ALTER TABLE projects ADD COLUMN extra TEXT NOT NULL DEFAULT '{}';`,
  },
  {
    id: 3,
    name: 'hall_versions',
    // Optimistic locking and "changed by" for hall templates, like projects.
    sql: `
      ALTER TABLE halls ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE halls ADD COLUMN updated_by TEXT;
    `,
  },
  {
    id: 4,
    name: 'settings',
    // Key/value JSON settings (agency details for contracts and PDF headers).
    sql: `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  },
  {
    id: 5,
    name: 'project_versions',
    // Automatic snapshots for "Historiku" (restore an earlier version of a project).
    sql: `
      CREATE TABLE project_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );
      CREATE INDEX project_versions_project ON project_versions(project_id, saved_at);
    `,
  },
  {
    id: 6,
    name: 'shares',
    // Client share links (read-only view, approval, comments).
    sql: `
      CREATE TABLE shares (
        token TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        approved_option_id TEXT,
        approved_option_name TEXT,
        approved_by TEXT,
        approved_at TEXT,
        seen_at TEXT
      );
      CREATE INDEX shares_project ON shares(project_id);
      CREATE TABLE share_comments (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        from_client INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX share_comments_token ON share_comments(token, created_at);
    `,
  },
  {
    id: 7,
    name: 'scan_jobs',
    // In-page scanning (Beta 5): the queue the GPU worker takes jobs from. Input files live in
    // data/scans/<id>/, the worker's result in data/uploads/scans/.
    sql: `
      CREATE TABLE scan_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('video', 'photos')),
        file_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'done')),
        progress INTEGER NOT NULL DEFAULT 0,
        stage TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        lease TEXT,
        heartbeat_at INTEGER,
        result_file TEXT,
        library_id TEXT,
        created_by TEXT NOT NULL,
        created_by_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX scan_jobs_status ON scan_jobs(status, created_at);
    `,
  },
  {
    id: 8,
    name: 'scan_jobs_purpose',
    // A scan is either a decoration (-> library) or a whole empty hall (-> hall template).
    sql: `
      ALTER TABLE scan_jobs ADD COLUMN purpose TEXT NOT NULL DEFAULT 'decor';
      ALTER TABLE scan_jobs ADD COLUMN hall_id TEXT;
    `,
  },
  {
    id: 9,
    name: 'project_bin',
    // Deleted projects wait in the bin ("Koshi") for 30 days before they are removed for good.
    sql: `
      ALTER TABLE projects ADD COLUMN deleted_at TEXT;
      ALTER TABLE projects ADD COLUMN deleted_by TEXT;
      CREATE INDEX projects_deleted ON projects(deleted_at);
    `,
  },
  {
    id: 10,
    name: 'scan_jobs_quality',
    // Quick or detailed reconstruction; scans from before this had the full pipeline.
    sql: `ALTER TABLE scan_jobs ADD COLUMN quality TEXT NOT NULL DEFAULT 'detailed';`,
  },
  {
    id: 11,
    name: 'scan_jobs_method',
    // AI scans run on a GPU service; its job id lets a restarted server pick them up again.
    sql: `
      ALTER TABLE scan_jobs ADD COLUMN method TEXT NOT NULL DEFAULT 'photogrammetry';
      ALTER TABLE scan_jobs ADD COLUMN provider_job TEXT;
      ALTER TABLE scan_jobs ADD COLUMN provider_started_at INTEGER;
    `,
  },
];
