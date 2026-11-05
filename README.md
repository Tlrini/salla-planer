# Salla Planner

Event hall decoration planner (internal tool, Albanian UI). Full spec: [AGENTS.md](AGENTS.md).

## Status

All phases from AGENTS.md §14 are built:

| Phase       | What works                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0 Scaffold  | npm workspaces (`shared`, `server`, `web`), strict TypeScript, ESLint, Prettier, Vitest                                         |
| 1 2D editor | Konva blueprint, tap/drag to add, move/rotate/resize, multi-select, undo/redo, auto chairs, table labels, hall + summary panels |
| 2 3D view   | Procedural model per catalog type, instanced chairs, Ditë/Mbrëmje, camera presets, 2D \| 3D \| 2D + 3D                          |
| 3 Server    | Fastify + SQLite, login, projects/halls/catalog/users API, autosave with version check and conflict dialog                      |
| 4 Export    | 3-page A4 PDF (plan, two 1920×1080 3D renders, priced list), PNG of plan and 3D                                                 |
| 5 Polish    | GLB upload per catalog item, auto-layout of tables, warnings badge, Docker, nightly backups, Playwright smoke test              |

## Requirements

Node.js 22 LTS. On this PC it is installed per user in
`%LOCALAPPDATA%\Programs\node-v22.23.4-win-x64` and added to the user PATH (open a new terminal
after installing). Git is in `%LOCALAPPDATA%\Programs\Git`.

## Development

```bash
npm install
npm run dev
```

Opens the web app on http://localhost:5173 (API on :3001 behind the Vite proxy). Tablets on the
same network can use `http://<this-PC-IP>:5173`.

On the first start with an empty database the server creates a **development** admin
`admin` / `admin123` (only when `ADMIN_USER` / `ADMIN_PASSWORD` are not set and not in
production). Change it under Administrimi → Përdoruesit.

```bash
npm test          # unit + API tests (Vitest)
npm run lint
npm run build     # shared, server and web
npm run e2e       # build + Playwright smoke test (uses the installed Microsoft Edge)
```

## Production on an office PC (no Docker)

```bash
copy .env.example .env      # then set ADMIN_PASSWORD
npm install
npm run build
npm start                   # http://<this-PC-IP>:3000
```

## Production with Docker

```bash
cp .env.example .env        # set ADMIN_PASSWORD
docker compose up -d --build
```

Everything persistent is in `data/` (mounted as a volume): `app.db` (SQLite), `uploads/models/`
(GLB files) and `backups/app-YYYY-MM-DD.db` (one copy per day, last 14 kept). To back up the whole
app, copy the `data/` folder.

## Notes

- PDF fonts: the bundled Figtree / Cormorant Garamond WOFF files are converted to TTF in the
  browser and embedded, so ë, ç and € print correctly; nothing is downloaded at runtime.
- Uploaded `.glb` models are scaled to the item's width × depth × height. Draco-compressed GLB
  files are not supported (the decoder would need a CDN).
- Editor shortcuts: Delete/Backspace remove · Ctrl+D duplicate · Ctrl+Z undo · Ctrl+Shift+Z /
  Ctrl+Y redo · R rotate 15° · arrows nudge 10 cm (Shift = 1 m) · Esc deselect · Shift+click /
  Shift+drag multi-select · wheel or pinch to zoom.
