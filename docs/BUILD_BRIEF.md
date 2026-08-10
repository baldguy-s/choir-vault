# BBCFF Choir App — Build Brief

## What this is

A GitHub-hosted app for the BBCFF choir: a member-facing PWA plus an admin tool
that writes to the same repo. No backend, no build step, no framework. Part of a
family of church apps that share information with each other.

This document describes **what is actually built** as of August 2026. It is the
reference for anyone (human or Claude Code) picking the project up.

Related repos in the ecosystem:

1. **`bbcff-serv-sched`** (`schedule-admin.html` / `schedule-display.html`) — the
   service schedule. Its header design is the shared visual identity, and the
   choir app **pushes** choir slot/solo into its `schedule-data.json`. See
   §6 Service Schedule sync.
2. **`choir-vault`** (this repo) — the choir app and admin, served from `docs/`
   on `main` via GitHub Pages.

---

## 1. Architecture

- **Two-page split**: `index.html` is the public read-only PWA;
  `choir-admin.html` is the authenticated write tool. Both live in `docs/`.
- **Write path**: GitHub Contents API (`PUT`/`DELETE /repos/{owner}/{repo}/contents/{path}`)
  for every write — JSON, audio, sheet music. No server.
- **Read path**: plain relative fetches from GitHub Pages, no auth.
- **Auth**: fine-grained GitHub PAT, entered once, stored only in `localStorage`
  under `gh_pat_choir_music`. Never in the repo, never sent anywhere but GitHub.
  An optional second token (`gh_pat_sched_sync`) covers the schedule repo if the
  main token doesn't.
- **Config guard**: the `GH_PLACEHOLDERS` check stays — if `GH_OWNER`/`GH_REPO`
  hold placeholder values, show a clear config warning rather than writing to the
  wrong place. This was added after a real incident; do not remove it.
- **Base64**: all binary writes go `<input type="file">` → `FileReader` → base64
  → Contents API. Always programmatic, never hand-pasted (a truncation bug once
  broke an embedded logo on the scheduling app).

### The two-path rule

- **Repo paths** (Contents API): `docs/audio/<id>/bass.m4a`
- **App paths** (stored in JSON, relative to `docs/index.html`): `audio/<id>/bass.m4a`

JSON always stores the app path. Prefix with `docs/` only when calling the API.

---

## 2. Data model

### `data/songs.json`

```json
{
  "songs": [
    {
      "id": "how-great-thou-art",
      "title": "How Great Thou Art",
      "tags": ["Slot 4", "Christmas"],
      "notes": "Optional free text.",
      "lyrics": "Optional. Plain text, line breaks preserved.",
      "preRelease": false,
      "tracks": [
        { "part": "Demo", "file": "audio/how-great-thou-art/demo.mp3" },
        { "part": "Bass", "file": "audio/how-great-thou-art/bass.m4a" }
      ],
      "sheetMusic": [
        { "label": "Music - How Great Thou Art", "file": "images/how-great-thou-art/music-...-1786251172010.pdf" }
      ],
      "links": [
        { "label": "Reference recording", "url": "https://www.youtube.com/..." }
      ]
    }
  ]
}
```

- **There is no `composer` field.** It was removed in August 2026. Don't add it back.
- `id` is slugified from the title on creation and used as the folder name under
  `audio/` and `images/`. The admin rejects slug collisions.
- `tracks` array order **is** the tab order in the app. `part` is a free-form
  custom name — Demo/Soprano/Alto/Tenor/Bass are quick-picks, not a fixed set.
- `preRelease: true` hides the song from the public list so files and notes can be
  loaded before it goes live. A direct `#/song/<id>` link still works, for preview.
- `lyrics` renders in a collapsible panel on the song page and is searchable.

### `data/calendar.json`

```json
{
  "news": { "subject": "", "date": "", "html": "", "updated": "" },
  "services": [
    {
      "id": "2026-08-16-sunday_am",
      "date": "2026-08-16",
      "type": "sunday_am",
      "specialName": "",
      "songs": [
        { "songId": "my-tribute", "title": "My Tribute", "slot": "4", "soloist": "J. Smith" }
      ]
    }
  ]
}
```

- `type` is `sunday_am | sunday_pm | wednesday | special` — the same vocabulary as
  the schedule repo. `id` is always `` `${date}-${type}` ``.
- **Slot and Soloist live on the calendar entry, not the song record**, because the
  same song can be Slot 1 one week and Slot 4 the next with a different soloist.
- `slot` is `''`, `'1'` or `'4'`. `songId` may be empty with a free-text `title`
  for a song not yet in the catalog.
- `news.html` is stored **already sanitized** (see §5).

---

## 3. Public app (`index.html`)

- **Header**: gray banner with the centered Bible Baptist Church logo
  (`icons/bbcff-logo.png`) above a Playfair Display uppercase `CHOIR` — matched to
  `bbcff-serv-sched/schedule-display.html`.
- **Layout**: two columns at `min-width: 980px` (Choir News + Calendar on the left,
  songs on the right); stacked on mobile with a **Jump to songs** button in the
  sticky toolbar. Fully usable on phone and desktop.
- **Song list**: collapses into **first-letter groups**, and that is the default
  view every time the app opens (`expandedLetters` starts empty each load).
  Searching auto-expands matching groups. Non-letter titles group under `#`.
- **Rolling calendar**: a plain list, not a grid of boxes. Shows services from
  today through `today + CALENDAR_DAYS_AHEAD` (20 days = current service plus the
  next two weeks). Past dates fall off with no intervention. A service with no
  songs, or a song with no title, renders **"To Be Determined"**.
- **Choir News**: the director's last email, rendered above the calendar.
- Both side panels collapse; the choice is remembered per device.
- **Song page**: part tabs, player with playback speed and an A/B loop, spacebar
  play/pause, a remembered "my part", a **Download** button for the selected
  track, a collapsible **Lyrics** panel (collapsed by default), and sheet music as
  **filename links with Download buttons — never a PDF thumbnail**. Images open a
  lightbox; PDFs open in a new tab.
- **Offline**: the shell precaches; media caches on demand as songs are played and
  viewed. There is deliberately **no "Save this song for offline" button** — it was
  removed in August 2026. A checkmark in the list still marks fully-cached songs.
- Dark mode toggle, remembered per device.

---

## 4. Admin (`choir-admin.html`)

Auth gate first, then three tabs.

**Songs**
- Search (title, tags, notes), tag filter, pre-release badge, per-song counts.
- Song info: title, tags, notes, lyrics, Pre-Release checkbox.
- **Practice tracks**: fully dynamic list — add, remove, rename, reorder with
  arrows, and replace the audio on an existing track. Voice-part quick-picks fill
  the name field; any custom name works. The name sets both the app tab label and
  the uploaded file name. Renaming later changes the label only, leaving the file
  in place.
- **Multi-file upload**: select every part at once and the track name is inferred
  from each file name (`BASS - Song.m4a` → Bass, including `sop`/`alt`/`ten`
  abbreviations and `full mix` → Demo). Files are staged in an **editable review
  list sorted into standard part order** so a wrong guess is corrected before
  anything uploads. Uploads run sequentially with progress, then one JSON save.
- **Sheet music**: upload with a custom label, edit labels, reorder, remove.
- **Links**: add/edit/remove `{label, url}`.

**Calendar**
- Add a service (date + service type), edit its date/type, delete it.
- Per service, add songs from a dropdown of the catalog or type a title that isn't
  in it, each with a **Slot** (1 or 4) and a **Soloist**; reorder with arrows.
- Every save also runs the schedule sync (§6).

**Choir News**
- Subject, date, and a `contenteditable` paste box. Paste straight from the email.

**Deletion is destructive by design.** Removing a track, a sheet music file, or a
whole song **deletes the real file from the repo**. Order is always: update the
JSON first, then delete files, so the app never points at a missing file. Files
that fail to delete are reported in a toast, not swallowed.

**Save feedback**: every write reports status; no silent successes or failures.

**Design**: same banner, palette and fonts as the public app and the schedule app —
the three tools read as one system. Dark mode included.

---

## 5. News sanitizing

Pasted email HTML is cleaned against an allowlist, both on paste and again on
render in the public app (defence in depth — the stored value is trusted only as
far as the sanitizer).

- Kept: `p br b strong i em u ul ol li a h3 h4 blockquote`
- Renamed: `div`→`p`, `h1`/`h2`→`h3`, `h5`/`h6`→`h4`, `s`/`strike`→`em`
- Unwrapped (text kept, tag dropped): `span`, `font`, table elements, Word/Outlook
  wrappers and `mso`/`o:p` junk
- Removed outright: `script style iframe object embed link meta img svg form input
  button select textarea noscript title base`, and all comments
- All attributes stripped except `href` on `<a>`, which must be `http:`, `https:`,
  `mailto:` or `tel:` — anything else (notably `javascript:`) is dropped, keeping
  the link text. Surviving links get `target="_blank" rel="noopener noreferrer"`.

---

## 6. Service Schedule sync

**The choir app is the source of truth for the choir's slot and solo status.**
Every calendar save (and the Calendar tab's **Sync now** button) writes into
`bbcff-serv-sched/schedule-data.json`:

- `choir.slot` ← the first non-empty Slot among that service's songs (mixed slots
  are reported; the schedule only holds one value)
- `choir.solo` ← `'Y'` if **any** song in that service has a soloist, else `'N'`

Constraints discovered by reading that repo — don't relearn these:

- `choir` exists **only** on `sunday_am` and `sunday_pm` entries, never Wednesday
  or special. Its admin renders the choir controls behind `if (entry.choir)`, so
  creating the key on a Wednesday would make a phantom control appear. The sync
  **skips non-Sunday types entirely** and reports how many it skipped.
- `slot` is exactly `'1'` or `'4'`; `solo` is exactly `'Y'` or `'N'`.
- That admin saves with **`JSON.stringify(entries)`** — minified, no indentation,
  no trailing newline. The sync must serialize identically or every run produces a
  whole-file diff.
- Dates not present in the choir calendar are **left untouched**, so the sync never
  clobbers manual edits made over there.
- The sync skips the `PUT` entirely when nothing changed, so it is idempotent.

---

## 7. Service worker

Two caches in `docs/sw.js`:

- `choir-materials-shell-vN` — shell: `index.html`, `css/style.css`, `js/app.js`,
  `manifest.json`, icons **including `icons/bbcff-logo.png`**
- `choir-materials-media-vN` — audio and sheet music, cached on demand

**Bump `SHELL_CACHE` whenever any shell file changes**, or installed PWAs keep
serving stale files. `MEDIA_CACHE` is duplicated as a constant in `js/app.js` —
keep the two in step. Brand assets belong in `icons/`, not `images/`, because
`isMediaRequest()` routes `/images/` to the media cache.

`isDataJson()` makes **everything under `/data/`** network-first with
`cache: 'reload'`, so songs, calendar and news bypass the GitHub Pages CDN
(Fastly, `max-age=600`).

---

## 8. Carry-over lessons

- `window.storage` is a Claude-artifact-only API and does not exist on GitHub
  Pages — everything here is real Contents API calls.
- Never hand-reconstruct base64; always programmatic encode/decode.
- iOS Safari needs a 180×180 PNG for `apple-touch-icon` — SVG is ignored.
- Write large HTML files in one shot, not by incremental pasting, to avoid silent
  truncation.
- The `GH_PLACEHOLDERS` guard is not optional.
- **Guard array deletes against `findIndex() === -1`.** `splice(-1, 1)` silently
  removes the *last* item, so a double-clicked Delete button once deleted an
  unrelated song. Song delete and service delete both check for `-1` and disable
  the button while running.
- Parse `YYYY-MM-DD` as local time (`new Date(y, m-1, d)`). `new Date("2026-08-16")`
  is UTC and shifts the day in western time zones.
- `saveJsonWithRetry()` retries once on 409/422 by re-fetching the SHA — this
  happens whenever a `git push` lands while the admin page is open.

---

## 9. Skills

Built and living in `.claude/skills/`:

`choir-add-song`, `choir-bulk-import`, `choir-validate-repo`,
`choir-backup-songs-json`, `choir-deploy-check`, `choir-compress-audio`,
`choir-resize-sheet-music`.

**Note on audio:** the standing instruction is to upload practice tracks **as-is**
— never compress, normalize, or convert them first. `choir-compress-audio` exists
but should not be run on a track before upload unless explicitly asked for.
