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

### Beta (AGENTS.md §16)

| Sub-phase                   | What works                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Beta 0 Cloud                | Caddy HTTPS in docker-compose, proxy-aware login limit, `/uploads` behind login, strong first-admin password, S3/Blob backup script, AWS guide                                                                           |
| Beta 1 Decor library        | **Biblioteka**: any agent uploads a `.glb` from a phone scan app, sets it upright + real height, thumbnails; shared by the whole agency                                                                                  |
| Beta 2 Table decor, options | "Dekori i tavolinës" per table or for all tables of a type, priced per piece; **Opsioni A / B / C** with side-by-side totals and a final choice                                                                          |
| Beta 3 Walk mode            | **Ec nëpër sallë**: Street-View-style eye-level walk (tap the floor, drag to look, WASD), viewpoints; **E lartë** adds ambient occlusion, evening glow and edge smoothing                                                |
| Beta 4 Presentation         | **Prezantim** full screen for the client, **360°** panorama JPEG (photo-sphere metadata), **tour video** (MP4/WebM), PDF with eye-level views and option comparison                                                      |
| Beta 5 In-page scanning     | **Skano një dekor**: film (or photograph) a decor in the browser; an on-demand AWS GPU VM (Meshroom) builds the 3D model; crop box, then the usual library setup. Setup: [docs/deploy-cloud.md §4](docs/deploy-cloud.md) |

### More features (after the beta)

| Feature                    | Where                                                           | What it does                                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guests and seating         | Editor → _Projekti_ → _Të ftuarit dhe ulja_                     | Paste / CSV import, groups, RSVP, tap-to-seat, automatic seating by group, "T1 · 8/10" on the plan, seating chart + alphabetical list in the PDF                                                                                                                                                         |
| Inventory                  | _Administrimi_ → _Stoku_ (and library setup)                    | Stock per item; the warnings badge shows shortages including other confirmed events on the same date                                                                                                                                                                                                     |
| Calendar                   | _Kalendari_                                                     | Month view of all events; days where booked events need more than the stock are flagged                                                                                                                                                                                                                  |
| Team checklist             | _Projekti_ → _Lista e punës_                                    | Loaded / installed / returned per line, tasks with assignee, "mark installed", loading sheet PDF                                                                                                                                                                                                         |
| Contract                   | _Projekti_ → _Kontrata_; _Administrimi_ → _Agjencia_            | Contract PDF of the client's final option with the agency details (payments are not handled in the app); quote total in the project list                                                                                                                                                                 |
| Version history            | _Projekti_ → _Historiku_                                        | Automatic snapshots (≤ 1 per 10 min or when someone else edits), restore keeps the status and the team checklist                                                                                                                                                                                         |
| Client share link          | _Projekti_ → _Ndaj me klientin_                                 | Private 30-day link: the client walks the 3D hall on their phone without an account, compares options with totals, approves and comments; badges in the project list                                                                                                                                     |
| Floor-plan photo           | Hall settings → _Plani i sallës (foto)_                         | Photo/scan of the real plan under the blueprint, opacity, two-point scale calibration                                                                                                                                                                                                                    |
| Plan annotations           | Ruler / T / dashed-square buttons on the plan                   | Measurements, texts and coloured zones; editable, undoable, printed in the PDF                                                                                                                                                                                                                           |
| Dashboard                  | _Paneli_ (admins)                                               | Contracted vs. collected per month, open offers, conversion, top decor, agents, upcoming events                                                                                                                                                                                                          |
| Bin ("Koshi")              | _Projektet_ → _Koshi_                                           | Deleted projects can be restored for 30 days; confirmed events can only be deleted by their creator or an admin                                                                                                                                                                                          |
| Profit                     | Summary panel → _Shpenzimet e agjencisë_ (admins); _Paneli_     | Cost per catalog item (Administrimi → Katalogu, column _Kostoja_) and per-event costs → profit and margin per event and per year; agents never see costs                                                                                                                                                 |
| Client notices             | Bell in the header                                              | Clients approving an option or commenting on a share link; click opens the project                                                                                                                                                                                                                       |
| Server off                 | Opening the app while the on/off server is stopped              | The app still opens (cached by `web/public/sw.js`), offers _Ndize serverin_ (start link from Administrimi → Agjencia) and opens by itself when the server is up                                                                                                                                          |
| Edit in 3D                 | 3D view → _Rregullo_                                            | Tap an item to select it (Shift adds), drag it; decor can be dragged onto a wall or the ceiling, and catalog items can be dragged straight into 3D. Properties → _Vendosja_: Dysheme / Mur / Tavan and the height on the wall. Same selection, snapping and undo as the 2D plan (one undo step per drag) |
| Ceiling decor              | Catalog → _Tavan me drita_ / _Tavan me perde_                   | Strings of lights or draped fabric over the whole ceiling or part of it. Properties: _Forma_ (Rreshta / Yll), spacing, _Varja_, _Mbulo gjithë tavanin_; with nothing selected, _Dekori i tavanit_ selects them. Seen from inside the hall (fabric is hidden in the view from above)                      |
| Outdoor events             | Hall settings → _Lloji i sallës_: _Jashtë_ or _Pavijon me xham_ | Open air on grass, stone, gravel or sand with a real sky; or a tent-shaped hall with glass walls. Times _Ditë / Perëndim / Mbrëmje_. Outdoors the catalog adds _Tendë e vogël_, _Pergolë_, _Çadër_; string lights stand on poles. Scans: _Vend i jashtëm_                                                |
| Hall from a scan           | _Sallat_ → _Skano sallën_                                       | Film the empty hall or tent; after processing, stand the model up, turn the walls onto the grid, type the ceiling height → a hall template with the measured size, the scan itself as the room in 3D, and its floor plan as the plan photo                                                               |
| Hall kinds                 | Hall settings → _Lloji i sallës_                                | _Sallë_ (normal room), _Tendë_ (white frame tent with poles; sides closed or open), _Nga skanimi_ (the scanned room)                                                                                                                                                                                     |
| Your own chairs and tables | _Biblioteka_ → armchair button (admins)                         | Makes a scanned chair or table the 3D model of that catalog item in every project; a lighter copy is made automatically                                                                                                                                                                                  |
| Quick scan                 | _Skano një dekor_ / _Skano sallën_                              | _Shpejt_ (estimated 10–15 min for a decor) or _Me detaje_ (20–30 min)                                                                                                                                                                                                                                    |

### Using the beta features

- **Scanned decor:** _Biblioteka → Ngarko skanim (.glb)_. Export the scan as `.glb` from the
  phone app (e.g. Scaniverse, Polycam). In the setup dialog turn it upright (_Ngrije_), type the
  real height, tick _Vendoset mbi tavolinë_ for centerpieces, save. It then appears for every
  agent in the editor under _Dekoret e skanuara_.
- **Scanning in the app:** _Biblioteka → Skano një dekor_. Type the name, film slowly around
  the decor (one circle at chest height, one from above, 60–90 s) or pick 20–200 photos, send.
  After 20–30 minutes the scan shows _Gati, duhet pastruar_: open it, shrink the gold box until
  only the decor is left, save, and finish the setup as for an uploaded scan. Needs
  `SCAN_WORKER_TOKEN` and the GPU worker (`worker/`, see the deploy guide); without them the
  section says scanning is off and `.glb` uploads work as before.
- **Decor on tables:** select a table → _Dekori i tavolinës_ → pick the decor →
  _Apliko te të gjitha tavolinat e këtij lloji_. Select several tables (Ctrl+A or Shift+drag) to
  set them at once.
- **Options:** the bar above the plan: `+` copies the current layout to a new option; switch
  between them; `…` renames, deletes or marks the client's choice (star). The summary compares
  the totals; the PDF gets a comparison page.
- **Walk with the client:** 3D → _Ec nëpër sallë_. Tap the floor to walk, drag to look around,
  use the viewpoint chips, _Ruaj këtë pamje_ to save a view, _Regjistro video të turit_ for a
  video. _Prezantim_ shows only the 3D walk in full screen (Esc to leave).
- **360°:** export menu (arrow next to _Eksporto PDF_) → _Shkarko 360° (panoramë)_, taken from
  where you stand in walk mode (or the entrance).

## Requirements

Node.js 22 LTS or newer (this PC has Node 24 in `C:\Program Files\nodejs`). `npm install` /
`npm ci` work without Visual Studio: `.npmrc` skips native build scripts because
better-sqlite3 and bcrypt ship prebuilt binaries.

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

## Production with Docker (cloud, HTTPS)

```bash
cp .env.example .env        # set DOMAIN and a strong ADMIN_PASSWORD (12+ characters)
docker compose up -d --build
```

Caddy serves the app on `https://<DOMAIN>` with an automatic Let's Encrypt certificate (ports 80
and 443 must be open). On AWS the server runs only while it is used: agents start it with a
bookmarked link and it powers itself off after an idle hour (about $25 / month with scanning;
see [docs/deploy-cloud.md](docs/deploy-cloud.md)). With `DOMAIN=localhost` you can try it on your own PC
(`https://localhost`, Caddy's local certificate).

Everything persistent is in `data/` (mounted as a volume): `app.db` (SQLite), `uploads/models/`
(GLB files) and `backups/app-YYYY-MM-DD.db` (one copy per day, last 14 kept).
`deploy/backup-sync.sh` copies backups and uploads to S3 or Azure Blob; run it daily from cron.

## Notes

- PDF fonts: the bundled Figtree / Cormorant Garamond WOFF files are converted to TTF in the
  browser and embedded, so ë, ç and € print correctly; nothing is downloaded at runtime.
- 3D quality: _Normale_ is the plain renderer (tablets). _E lartë_ adds ambient occlusion
  (n8ao), bloom on lights in _Mbrëmje_ and SMAA edge smoothing at 1× resolution (~19 ms per
  frame for 20 tables on an Intel Iris Xe). PDF/PNG renders always use these effects; the 360°
  panorama does not (screen-space effects would show seams between the cube faces). Floors have
  generated relief and roughness maps, tablecloths have soft folds.
- Reflections use the bundled HDRI `web/public/env/ballroom_1k.hdr` ("Ballroom" by Sergej
  Majboroda, [Poly Haven](https://polyhaven.com/a/ballroom), CC0).
- Uploaded `.glb` models are scaled to the item's width × depth × height. Draco-compressed GLB
  files are not supported (the decoder would need a CDN).
- Editor shortcuts: Delete/Backspace remove · Ctrl+D duplicate · Ctrl+Z undo · Ctrl+Shift+Z /
  Ctrl+Y redo · R rotate 15° · arrows nudge 10 cm (Shift = 1 m) · Esc deselect · Shift+click /
  Shift+drag multi-select · wheel or pinch to zoom.
