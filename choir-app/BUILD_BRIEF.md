# Choir Music Repository App — Build Brief for Claude Code

## What this is

A GitHub-hosted admin app for managing a choir's music repository (practice
tracks, sheet music, reference links) — built on the same architecture as the
BBCFF Scheduling App, retargeted from scheduling data to music files. Give
this whole document to Claude Code as the spec.

There are already two related pieces in this repo ecosystem:

1. **BBCFF Scheduling App** (`schedule-admin.html` / `schedule-display.html`)
   — the reference architecture this brief adapts. Read it before starting;
   the patterns below (auth, write strategy, guard rails) should match it
   file-for-file where the domain allows.
2. **Choir Materials app** (existing, already built) — a read-only,
   offline-first PWA that displays songs from `data/songs.json`, plays
   SATB practice tracks, shows sheet music, and lists reference links. It
   currently requires hand-editing `songs.json` and manually pushing files
   to GitHub to add a song.

**This build is the missing piece: an admin interface that writes to the
repo the Choir Materials app already reads from**, so adding a song stops
requiring manual JSON editing and manual file uploads.

---

## 1. Architecture to replicate from the BBCFF Scheduling App

- **Two-page split**: an authenticated admin page for writes, and a public
  page for reads. The admin page is the new build here. The public/display
  side already exists as the Choir Materials app — don't rebuild it, extend
  it if needed.
- **Write path**: GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`)
  for every write — song metadata, audio files, images. No backend server.
- **Read path**: `raw.githubusercontent.com` for the public app, no auth.
- **Auth**: fine-grained GitHub Personal Access Token, entered once by the
  user and stored only in `localStorage` on that device — never in the repo,
  never transmitted anywhere but the GitHub API. Follow the same storage-key
  convention style as the scheduling app
  (`gh_pat_choir_schedule` → use `gh_pat_choir_music` here).
- **Config guard**: a `GH_PLACEHOLDERS` check exactly like the scheduling
  app's — if `GH_OWNER` or `GH_REPO` still hold default placeholder values,
  show a clear "Config not set" warning instead of silently failing or
  writing to the wrong place. This was added after a real incident on the
  scheduling app; don't skip it here.
- **Base64 handling**: all file writes through the Contents API require
  base64-encoded content. Encode/decode programmatically — never hand-paste
  or manually reconstruct base64 blobs, which is how a truncation bug
  previously broke an embedded logo on the scheduling app.

---

## 2. What's different: music files instead of schedule entries

The scheduling app's admin writes structured JSON only. This app also needs
to **upload binary files** (MP3s, images) through the same Contents API,
which the scheduling app never had to do. Key implications:

- File uploads go through a `<input type="file">` → `FileReader` → base64 →
  Contents API PUT pipeline.
- Large files (multi-MB audio, camera-resolution photos) need a visible
  upload progress state — GitHub's API has no chunked upload, so a single
  PUT can take a while on a slow connection.
- The GitHub Contents API caps individual file writes around 100MB via this
  endpoint in practice, well above what a compressed practice track or
  resized sheet-music photo needs, but validate file size client-side
  before attempting the PUT and warn the user if a file is unusually large
  (e.g. > 15MB) rather than letting the request fail silently.

---

## 3. Data model (matches the existing Choir Materials app — do not change the schema)

`data/songs.json`:

```json
{
  "songs": [
    {
      "id": "amazing-grace",
      "title": "Amazing Grace",
      "composer": "John Newton, arr. Choir",
      "tags": ["Hymn", "Sunday Service"],
      "notes": "Optional free text.",
      "tracks": [
        { "part": "Full Mix", "file": "audio/amazing-grace/full-mix.mp3" },
        { "part": "Soprano", "file": "audio/amazing-grace/soprano.mp3" },
        { "part": "Alto",    "file": "audio/amazing-grace/alto.mp3" },
        { "part": "Tenor",   "file": "audio/amazing-grace/tenor.mp3" },
        { "part": "Bass",    "file": "audio/amazing-grace/bass.mp3" }
      ],
      "sheetMusic": [
        { "label": "Page 1", "file": "images/amazing-grace/page-1.jpg" }
      ],
      "links": [
        { "label": "Reference recording", "url": "https://www.youtube.com/..." }
      ]
    }
  ]
}
```

`id` is derived from the title (slugified) when a song is created in the
admin UI, and used as the folder name under `audio/` and `images/`. The
admin app owns generating and validating this — reject or de-duplicate if a
slug collision would occur.

---

## 4. Admin page requirements (`choir-admin.html`)

**Auth gate**: same pattern as `schedule-admin.html` — PAT input on first
load, stored in `localStorage`, gated behind the `GH_PLACEHOLDERS` check.

**Song list view**:
- Search and tag filter (mirror the public app's filtering)
- Each row shows title, composer, track count, sheet music count, and a
  quick indicator if any referenced file is missing from the repo

**Add / edit song form**:
- Title, composer, tags (add/remove chips), notes
- Auto-slugify `id` from title on creation, locked after first save

**Track manager** (per song):
- One upload slot per voice part (Full Mix, Soprano, Alto, Tenor, Bass) —
  match the Choir Materials app's part labels and color coding exactly
- Replace or remove an individual track without touching the others
- On upload: read file → base64 → PUT to `audio/<id>/<part-slug>.mp3` →
  update the track's `file` path in `songs.json` → PUT the updated JSON

**Sheet music manager** (per song):
- Multi-image upload, drag-to-reorder, editable label per image
- Same upload → PUT → update `sheetMusic` array pattern as tracks

**Links manager** (per song):
- Add/edit/remove `{label, url}` entries, basic URL validation

**Delete song**:
- Confirm dialog. Remove the entry from `songs.json`. Ask (checkbox,
  default unchecked) whether to also delete the song's files from
  `audio/<id>/` and `images/<id>/` via the Contents API's delete endpoint,
  since orphaned files aren't harmful but silent data loss is — default to
  leaving files in place unless the user opts in.

**Save feedback**: toast/status messages for every write, matching the
scheduling app's pattern — no silent successes or silent failures.

**Design system**: match the BBCFF brand exactly, same as the scheduling
app — Playfair Display for headings, Source Sans Pro for body text, the
red/gray/ink palette, the embedded transparent PNG logo. This intentionally
does *not* match the Choir Materials app's separate hymnal palette; the
**admin tool** should look and feel like the church's other internal tools
since only Scott and other admins use it, while the **member-facing** Choir
Materials app keeps its own identity. Flag this assumption to the user
before building in case they'd rather unify the two.

---

## 5. Carry-over lessons (do not relearn these the hard way)

- `window.storage` is a Claude-artifact-only API and does not exist on
  GitHub Pages — everything here is real GitHub Contents API calls.
- Never hand-reconstruct base64 content from pasted text; always
  programmatic encode/decode, and verify round-trip on anything large
  (especially the embedded logo, if reused from the scheduling app).
- iOS Safari requires 180×180 PNG for the home screen icon — SVG is
  ignored for `apple-touch-icon`.
- Large HTML builds: assemble via shell heredoc / proper file writes, not
  incremental manual pasting, to avoid silent truncation.
- The `GH_PLACEHOLDERS` guard is not optional — it's the difference between
  a clear config error and what looks like data loss.

---

## 6. Skills Claude Code should create for repeatable operational tasks

These are the recurring jobs Scott will ask Claude Code to do after the app
exists — build each as a proper skill (`SKILL.md` + any helper scripts) so
they're repeatable and don't need re-explaining each time.

### `choir-add-song`
Creates a new song end-to-end from raw source material: takes a title,
composer, and a folder of source files (audio takes, sheet music scans),
slugifies the id, creates `audio/<id>/` and `images/<id>/`, runs the
compress-audio and resize-sheet-music skills on the source files, uploads
everything via the Contents API, and appends the new entry to `songs.json`.

### `choir-compress-audio`
Takes a raw audio file (any format/bitrate) and outputs a practice-track
MP3 at 128kbps, normalized volume, with silence trimmed from the start and
end. Used before any track upload so file sizes stay reasonable on a weak
church-basement connection.

### `choir-resize-sheet-music`
Takes a raw image (phone photo or scan) and outputs a JPEG resized to a
sane max dimension (1600px long edge), auto-rotated based on EXIF, and
compressed to a reasonable file size, without visibly degrading legibility
of printed music notation.

### `choir-validate-repo`
Walks `songs.json`, checks that every referenced `file` path in `tracks`
and `sheetMusic` actually exists in the repo, checks every `id` is a valid
slug with no duplicates, and reports orphaned files in `audio/`/`images/`
that no song references. Run this before and after bulk changes.

### `choir-bulk-import`
Given a folder structured as `<song-title>/<part-or-page-files>`, infers
song boundaries and file roles (matches filenames like `soprano.mp3`,
`page-1.jpg` against known patterns), and runs `choir-add-song` for each
one — for the initial migration of an existing physical/digital music
library into the repo.

### `choir-backup-songs-json`
Snapshots the current `songs.json` (timestamped copy, e.g. to a
`backups/` folder in the repo or a local path) before any destructive
operation — bulk import, bulk delete, schema migration. Cheap insurance
against a bad batch edit.

### `choir-deploy-check`
Pre-push checklist: confirms `GH_PLACEHOLDERS` values are filled in both
`choir-admin.html` and the Choir Materials app's config, confirms
`choir-validate-repo` passes clean, and confirms the service worker cache
version has been bumped if app-shell files changed (so users actually get
the update instead of a stale cached copy).

---

## 7. Deliverables checklist

- [ ] `choir-admin.html` — the admin app described in section 4
- [ ] Confirms compatibility with the existing `data/songs.json` schema and
      existing `audio/`/`images/` folder conventions — no breaking changes
      to the Choir Materials app
- [ ] `GH_PLACEHOLDERS` guard in place and tested (deliberately leave a
      placeholder unfilled once to confirm the warning fires)
- [ ] The six skills in section 6, each as a proper skill definition
- [ ] A short README addition covering: how to get a fine-grained PAT with
      the right repo permissions, and what scopes it needs
