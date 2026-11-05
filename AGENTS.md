# AGENTS.md — Salla Planner (event hall decoration planner)

You are building a web app for an event decoration agency in Albania/Kosovo that decorates halls
for weddings (dasma) and company events. Read this whole file before writing code. Build it phase
by phase (see "Build phases"). After each phase, stop, summarize what works, and tell the user how
to run it.

---

## 1. The problem in one paragraph

While an agent talks with a client, the agent opens the client's hall in the app, drags decorations
(tables, chairs, flower arches, backdrops, stage, lights, etc.) onto a top-down floor plan, and moves
them around until the client is happy. At the end the app produces a **blueprint** (2D plan with
measurements) and a **3D view** of how the hall will look, so the client approves it before the team
installs the decor. The result can be exported as a PDF (blueprint + 3D image + item list + price).

## 2. Hard constraints

- **Users:** internal tool, max ~10 people at the same time. No public sign-up.
- **Language:** the entire UI is in **Albanian (shqip)**. Every user-facing string lives in
  `web/src/i18n/sq.ts`. Code, comments, and identifiers are in English.
- **Currency:** EUR (€). Number format: `1.250,00 €` (Albanian/European style).
- **Units:** meters everywhere in the data model. Show measurements as `12,5 m`.
- **Devices:** laptop and **tablet with touch** are the main devices. Phone should work but can be
  cramped.
- **Self-hosted:** must run on one small server or an office PC on the local network. No paid
  cloud services, no external APIs, no CDNs at runtime (fonts and libraries are bundled).
- **Cost:** only free, open-source libraries (MIT/Apache/BSD).

## 3. Tech stack (use exactly this unless the user approves a change)

| Area | Choice |
|---|---|
| Language | TypeScript everywhere (strict mode) |
| Repo | npm workspaces: `web/`, `server/`, `shared/` |
| Frontend | React 19 + Vite |
| 2D editor | Konva + react-konva |
| 3D view | three.js + @react-three/fiber + @react-three/drei |
| State | Zustand, with zundo for undo/redo |
| Validation / shared types | zod (schemas in `shared/`, used by both web and server) |
| Server | Node.js 22 LTS + Fastify |
| Database | SQLite via better-sqlite3 (one file, easy backup) + simple SQL migrations |
| Auth | username + password (bcrypt), httpOnly session cookie |
| PDF export | jsPDF, with an embedded Unicode TTF font (e.g. Noto Sans) so ë, ç and € render |
| Fonts | self-hosted via @fontsource: Figtree (UI), JetBrains Mono (measurements), Cormorant Garamond (titles only) |
| Tests | Vitest for pure logic, Playwright for one end-to-end smoke test |
| Deploy | Dockerfile + docker-compose.yml; SQLite file and uploads in a mounted `data/` volume |

Pin exact dependency versions in every `package.json` (no `^` or `~`).

Approved additions (by the user): tsx, concurrently, nanoid, lucide-react, @fastify/cookie,
@fastify/static, @fastify/multipart, ESLint/Prettier configs.

## 4. Folder structure

```
salla-planner/
  AGENTS.md
  package.json            # workspaces + root scripts: dev, build, test, lint
  docker-compose.yml
  Dockerfile
  data/                   # gitignored: app.db, uploads/ (GLB models, images)
  shared/src/
    schemas.ts            # zod schemas: Hall, Item, Project, CatalogItem, User
    catalog-defaults.ts   # default catalog (section 6)
    geometry.ts           # pure functions: seats, bounds, snapping, auto-layout
  server/src/
    index.ts              # Fastify app, serves built web/ in production
    db.ts, migrations/
    routes/ auth.ts, projects.ts, halls.ts, catalog.ts, users.ts, uploads.ts
  web/src/
    main.tsx, App.tsx
    i18n/sq.ts
    model/store.ts        # Zustand store = single source of truth for the open project
    features/editor2d/    # Konva blueprint editor
    features/viewer3d/    # R3F scene, one builder per catalog type
    features/catalog/     # sidebar palette + admin catalog/price editor
    features/projects/    # project list, new project form, autosave
    features/halls/       # hall templates
    features/export/      # PDF + PNG export
    styles/
```

## 5. Data model (define in `shared/src/schemas.ts` with zod)

Coordinate system: origin = top-left corner of the hall as seen in the 2D plan. `x` goes right
(along hall width), `y` goes down (along hall length). In 3D: `x → x`, `y → z`, height → `y`.
Rotation in degrees, clockwise in 2D.

```ts
Hall {
  name: string                 // "Salla Kristal"
  width: number                // m, along x
  length: number               // m, along y
  height: number               // m, ceiling height
  floor: "parket" | "mermer" | "pllake" | "tapet"
  floorColor: string           // hex
  wallColor: string            // hex
  structure: Item[]            // columns, doors, windows (catalog category "structure")
}

Item {
  id: string                   // nanoid
  type: string                 // catalog id, e.g. "table_round_10"
  x: number; y: number         // center, m
  rotation: number             // deg
  width: number; depth: number // m (copied from catalog, editable only if resizable)
  height?: number              // m, optional override
  color: string                // main color (tablecloth, flowers, light color...)
  color2?: string              // secondary (chair covers, frame...)
  label?: string               // e.g. "T1", "Tavolina e çiftit"
  seats?: number               // for tables, overrides catalog default
  locked?: boolean             // cannot be moved by accident
}

Project {
  id: string
  name: string                 // "Dasma – 14 qershor"
  clientName: string
  clientPhone?: string
  eventType: "dasme" | "fejese" | "event_kompanie" | "ditelindje" | "tjeter"
  eventDate?: string           // ISO date
  guestTarget?: number
  status: "draft" | "konfirmuar" | "instaluar"
  hall: Hall                   // SNAPSHOT copied from a template; later template edits don't change old projects
  items: Item[]
  notes?: string
  createdBy: string; updatedBy: string
  createdAt: string; updatedAt: string
  version: number              // optimistic locking
}

CatalogItem {
  id: string; name: string                       // Albanian name
  category: "tables" | "stage" | "floral" | "lighting" | "other" | "structure"
  width: number; depth: number; height: number   // m
  shape2d: "circle" | "rect"
  resizable: "none" | "width" | "both"
  defaultSeats?: number
  seatRule?: "fixed" | "per_length"              // imperial table: 1 seat per 0.6 m on each side
  defaultColor: string; defaultColor2?: string
  price: number                                  // € per piece; 0 = not in quote
  modelFile?: string                             // optional uploaded .glb; replaces the procedural 3D model
  active: boolean
}
```

The catalog lives in the database (seeded from `catalog-defaults.ts`). The admin can edit names,
prices, sizes, and upload a `.glb` model for any item.

## 6. Default catalog (seed data, prices are placeholders the admin will change)

Sizes are width × depth × height in meters. Ø = diameter.

| id | Name (UI) | Category | Size | Resizable | Seats | Price € |
|---|---|---|---|---|---|---|
| table_round_10 | Tavolinë e rrumbullakët (10 vende) | tables | Ø1.8 × 0.75 | none | 10 | 25 |
| table_round_8 | Tavolinë e rrumbullakët (8 vende) | tables | Ø1.5 × 0.75 | none | 8 | 20 |
| table_rect | Tavolinë drejtkëndëshe | tables | 2.4 × 0.9 × 0.75 | none | 8 | 20 |
| table_imperial | Tavolinë mbretërore | tables | 6 × 1.2 × 0.75 | width | per_length | 60 |
| table_head | Tavolina e çiftit | tables | 3 × 0.8 × 0.75 | width | 2 (one side) | 80 |
| chair | Karrige | tables | 0.45 × 0.45 × 0.9 | none | 1 | 3 |
| lounge_sofa | Kënd lounge (divan) | tables | 2.2 × 0.9 × 0.8 | none | 3 | 40 |
| cake_table | Tavolina e tortës | tables | Ø0.9 × 0.75 | none | 0 | 30 |
| stage | Skenë / podium | stage | 6 × 3 × 0.5 | both | – | 150 |
| backdrop_curtain | Sfond me perde | stage | 4 × 0.3 × 3 | width | – | 120 |
| flower_wall | Mur me lule | stage | 3 × 0.3 × 2.6 | width | – | 200 |
| flower_arch | Hark me lule | stage | 2.4 × 0.5 × 2.6 | none | – | 150 |
| dance_floor | Pistë vallëzimi | stage | 6 × 6 × 0.02 | both | – | 200 |
| carpet_aisle | Tapet / rrugicë | stage | 1.2 × 10 × 0.01 | both | – | 40 |
| centerpiece | Kompozim lulesh (qendër tavoline) | floral | Ø0.4 × 0.5 | none | – | 35 |
| flower_stand | Shtyllë me lule | floral | Ø0.6 × 1.4 | none | – | 45 |
| candle_group | Grup qirinjsh | floral | Ø0.4 × 0.3 | none | – | 10 |
| balloon_cluster | Grup balonash | floral | Ø1 × 2.2 | none | – | 25 |
| plant | Bimë dekorative | floral | Ø0.7 × 1.5 | none | – | 15 |
| chandelier | Llambadar kristali | lighting | Ø1.2 × 1 (hangs from ceiling) | none | – | 60 |
| uplight | Dritë LED (uplight) | lighting | 0.3 × 0.3 × 0.2 | none | – | 8 |
| light_curtain | Perde me drita | lighting | 4 × 0.1 × 3 | width | – | 70 |
| photo_corner | Kënd fotografimi | other | 2.5 × 1.5 × 2.4 | none | – | 100 |
| dj_booth | Pult DJ | other | 2 × 0.8 × 1.1 | none | – | 0 |
| bar_counter | Banak pijesh | other | 3 × 0.8 × 1.1 | width | – | 0 |
| column | Kolonë | structure | 0.5 × 0.5 × (hall height) | both | – | 0 |
| door | Derë | structure | 1.8 × 0.15 × 2.4 | width | – | 0 |
| window | Dritare | structure | 2 × 0.15 × 1.6 (sill at 0.9) | width | – | 0 |

Color presets shown as swatches (plus a free color picker):
E bardhë `#FFFFFF`, Fildish `#F3EBDD`, Shampanjë `#E6D3B3`, Rozë pudër `#E8C4C4`, Bordo `#6E1E2B`,
Sherebelë `#9CAF88`, Ari `#C9A44C`, Argjend `#C0C0C8`, Blu e errët `#1F2A44`, E zezë `#1A1A1A`.

Built-in example hall templates (marked "Shembull"): 30 × 18 × 5 m, 22 × 14 × 4.5 m, 14 × 10 × 3.5 m.

## 7. Screens and layout

1. **Login** (`Hyr`).
2. **Projects list** (`Projektet`): search by client/name, filter by status and date, buttons
   `Projekt i ri`, open, duplicate (`Kopjo`), delete with an in-page confirm (no `window.confirm`).
3. **New project form**: name, client, phone, event type, date, guest target, choose a hall
   template or enter dimensions.
4. **Editor** (main screen):
   - Top bar: project name + client, save status (`U ruajt 21:14` / `Duke ruajtur…` / `Gabim gjatë ruajtjes`),
     undo/redo, view switch `2D | 3D | 2D + 3D`, `Eksporto PDF`.
   - Left sidebar: catalog grouped by category with small top-view icons, name, price. Drag onto the
     plan, or tap to add at the center of the current view (tap is essential on tablets).
   - Center: the 2D blueprint, the 3D view, or both side by side (split view updates 3D live).
   - Right panel: when an item is selected → its properties (name, size if resizable, rotation,
     colors, seats, label, lock, duplicate, delete). When nothing is selected → hall settings and
     the summary (guest capacity, counts per item, estimated total).
   - Below ~900 px width, panels collapse into drawers/tabs.
5. **Hall templates** (`Sallat`): create/edit halls with dimensions and structure items (columns,
   doors, windows) using the same 2D editor.
6. **Admin** (`Administrimi`, role admin only): catalog + prices + GLB upload, users.

## 8. 2D blueprint editor (react-konva)

Look: a real **blueprint** — deep blue paper (`#1D3B6A`), light grid every 1 m and stronger every
5 m, white/pale-blue line work, hall dimensions written along the top and left edges
(`24,0 m`). Items are drawn top-down in white outline with a soft fill of their chosen color.
Selected item: champagne-gold outline (`#C9A44C`) and its size shown next to it.

Implementation notes:
- Konva works in **centimeters** internally (1 unit = 1 cm) so text sizes stay reasonable;
  convert at the boundary to the meter-based model. Use `strokeScaleEnabled={false}`.
- Stage pan (drag empty area / two-finger on touch) and zoom (wheel / pinch / buttons `+ − Përshtat`).
- Drag to move; snap to a 10 cm grid (toggle `Ngjitje në rrjet`); keep items inside the hall.
- Konva `Transformer`: rotate for every item (snaps at 0/45/90…, hold Shift for free),
  resize only for resizable items (respect `resizable` rule). After transform, write the new
  width/depth into the model and reset node scale to 1.
- Multi-select with Shift+click or drag-rectangle; move/delete/duplicate the selection together.
- Tables draw their chairs automatically around them (round: evenly spaced ring; rect/imperial:
  along both long sides; head table: one side only). Seat count comes from `seats` or the catalog rule.
- Tables get automatic labels `T1, T2…` (by position, left-to-right, top-to-bottom) unless the
  user typed a label. Show the label in the table center.
- Keyboard: Delete/Backspace remove, Ctrl/Cmd+D duplicate, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or
  Ctrl+Y redo, R rotate 15°, arrows nudge 10 cm (Shift = 1 m), Esc deselect.
- `Vendos tavolinat automatikisht` (auto-layout): user chooses table type and count; place them in
  a grid in the free area, keeping 1.2 m aisles and avoiding existing items (pure function in
  `shared/geometry.ts`, unit tested).
- Warnings (non-blocking, small badge): items overlapping, aisle narrower than 0.9 m between tables,
  seats fewer than `guestTarget`.

## 9. 3D view (@react-three/fiber)

- Built from the **same store** as the 2D view. No separate 3D data. Changing anything in 2D
  updates 3D (debounce ~150 ms).
- Hall: floor with a procedural canvas texture per floor type (parquet planks, marble veins, tiles,
  carpet), walls as planes facing **inward** with front-side culling (dollhouse effect: from outside
  you see into the room through the near walls), ceiling plane facing down. Doors/windows as panels on
  or near walls.
- One builder function per catalog type in `features/viewer3d/builders/` producing simple but
  pleasant procedural models: tablecloth cylinders/boxes that reach the floor, Chiavari-style chairs,
  vase + flower sphere clusters, golden arch (half torus) with flowers along it, wavy curtain
  (displaced plane), flower wall (procedural flower texture), glossy dance floor, crystal chandelier
  (emissive), uplight (emissive base + additive gradient "light wash" plane on the nearest wall),
  balloons, plants, bar, DJ booth, photo corner, sofa, cake.
- If a catalog item has `modelFile` (.glb), load it with drei `useGLTF`, scale it to the item's
  width/depth/height bounding box, and use it instead of the procedural model.
- Performance (must stay smooth on a mid-range tablet with 40 tables / 400 chairs):
  - **InstancedMesh** for chairs (grouped by color) and other repeated small parts.
  - Share geometries and materials; never create them per render.
  - `frameloop="demand"`; max ~8 real lights, everything else emissive.
  - Shadows from one directional light only, modest shadow map.
- Lighting toggle: `Ditë` (bright, neutral) / `Mbrëmje` (dark ambient, warm chandeliers, colored uplights glow).
- Camera presets: `Nga lart` (top-down), `Perspektivë` (3/4 view), `Nga hyrja` (eye level 1.6 m
  from the entrance/door looking toward the stage). Orbit controls with limits so the camera
  doesn't go under the floor.
- 3D is view-only in Phase 2. (Selecting items in 3D is optional later.)

## 10. Export

`Eksporto PDF` produces an A4 landscape PDF:
1. **Page 1 – Blueprint:** agency header, project name, client, event date, hall name and
   dimensions, the 2D plan rendered at high resolution (Konva `toDataURL`, pixelRatio 2–3) with
   table labels and dimensions, a legend of item types.
2. **Page 2 – 3D:** two renders (perspective + eye level) taken from an offscreen render at
   1920×1080 (`preserveDrawingBuffer` or render-to-target, not a screenshot of the live canvas).
3. **Page 3 – Lista e dekoreve:** table with item, quantity, unit price, total; total chairs and
   guest capacity; grand total; notes; signature lines `Klienti` / `Agjencia`.
Also `Shkarko PNG` for the blueprint alone and for the 3D view alone.
Embed a Unicode TTF in jsPDF so `ë ç €` print correctly. File name: `Plan-<client>-<date>.pdf`.

## 11. Server API (Fastify, JSON, all routes except login need a session)

```
POST   /api/auth/login        { username, password }
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/projects?query=&status=        list (without items, for speed)
POST   /api/projects                        create
GET    /api/projects/:id
PUT    /api/projects/:id                    body includes version; 409 if version is stale
POST   /api/projects/:id/duplicate
DELETE /api/projects/:id
GET/POST/PUT/DELETE /api/halls[/:id]
GET    /api/catalog
PUT    /api/catalog/:id                     admin only
POST   /api/catalog/:id/model               admin only, .glb upload (max 20 MB)
GET/POST/PUT/DELETE /api/users[/:id]        admin only
```
- Validate every body with the zod schemas from `shared/`.
- Store `items` and `hall` as JSON columns.
- Seed the first admin from env vars `ADMIN_USER` / `ADMIN_PASSWORD` on first start.
- Serve the built frontend and `data/uploads` as static files in production.
- Nightly backup: copy `app.db` to `data/backups/app-YYYY-MM-DD.db`, keep 14 days.

## 12. Saving behavior

- Autosave the open project 1.5 s after the last change (one request per pause, never per drag
  event), plus a manual `Ruaj` button.
- Optimistic locking: send `version`; on 409 show `Ky projekt u ndryshua nga <name>. Ringarko?`
  with buttons to reload or save as a copy. Never silently overwrite.
- Undo/redo history is per editing session (max 100 steps), one step per finished drag/transform,
  not per pointer move.

## 13. Visual design

- Purpose: a calm, professional tool that the agent can turn toward the client on a tablet.
- The blueprint canvas is the hero (deep blue paper). The app chrome around it is quiet: cool
  off-white surfaces in light mode, deep slate in dark mode, ink-navy text, champagne gold
  (`#C9A44C`) as the only accent (selection, primary button).
- Typography: Figtree for UI, JetBrains Mono for measurements and prices, Cormorant Garamond only
  for the project title and PDF header.
- Touch targets at least 44 px. Visible keyboard focus. Light and dark theme via CSS variables.
- No emoji in the UI. Icons from lucide-react.

## 14. Build phases and acceptance criteria

Work in this order. Do not start a phase before the previous one builds and its checks pass.

**Phase 0 – Scaffold**
- Workspaces, TypeScript strict, ESLint + Prettier, Vitest, `npm run dev` starts web and server.
- Done when: `npm run build` and `npm test` pass on a clean clone.

**Phase 1 – 2D editor (frontend only, localStorage)**
- Store, catalog sidebar, example hall, drag/drop + tap-to-add, move/rotate/resize, multi-select,
  duplicate, delete, undo/redo, auto chairs, table labels, hall settings panel, summary panel.
- Done when: you can lay out a 200-guest wedding (20 round tables, head table, stage, dance floor,
  arch, backdrop, 6 flower stands) in under 5 minutes on a tablet, and reload keeps it.

**Phase 2 – 3D view**
- All catalog types have a procedural model; split view; day/evening; camera presets; instancing.
- Done when: the 200-guest layout renders in 3D and orbits smoothly (≥ 30 fps on a mid-range laptop).

**Phase 3 – Server, login, projects, halls, catalog**
- Fastify + SQLite, auth, CRUD, autosave with version check, hall templates, admin catalog/prices.
- Done when: two browsers logged in as different users can open the same project, and the
  second save gets the conflict dialog.

**Phase 4 – Export**
- PDF (3 pages) and PNG exports exactly as in section 10.
- Done when: the PDF opens in a normal PDF reader with correct Albanian characters and €.

**Phase 5 – Polish**
- GLB upload per catalog item, auto-layout of tables, warnings badge, Docker deploy, backups,
  Playwright smoke test (login → new project → add 3 items → switch to 3D → export PDF).

## 15. Rules for you (the coding agent)

- Ask before adding any dependency not listed in section 3.
- Keep the zod schemas in `shared/` as the single source of truth for types; never duplicate types.
- Put geometry and layout logic in pure functions with unit tests.
- Never put user-facing text directly in components; use `sq.ts`.
- Never use `alert`, `confirm`, or `prompt`; build in-page dialogs.
- Keep components small; one 3D builder per file.
- After each phase: run build + tests, fix failures, then give the user a short summary in the
  language they wrote to you in, with the exact commands to run the app.
- If something in this file is unclear or impossible, say so and propose an option instead of guessing.
