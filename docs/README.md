# Choir

An offline-capable web app for choir practice tracks, sheet music, a rolling
service calendar, and news from the director. Static site, no backend, no build
step. Hosted on GitHub Pages, same as your other projects.

## How it's organized

- `data/songs.json` — the list of every song. This is the only file you edit
  to add or change a song.
- `data/calendar.json` — upcoming services (date + service type, with per-song
  Slot and Soloist) plus the Choir News panel content.
- `audio/<song-id>/` — practice tracks for that song.
- `images/<song-id>/` — sheet music scans/photos or PDFs for that song.
- `index.html`, `css/`, `js/`, `sw.js`, `manifest.json` — the app itself. You
  shouldn't need to touch these.

## What choir members see

The song list opens **collapsed into first-letter groups** (A, B, C…) so it fits
on a phone; tap a letter to open it, or search to jump straight to a match. On a
wide screen the Choir News and Calendar panels sit in a column on the left; on a
phone they stack above the songs, with a **Jump to songs** button in the toolbar.
Both panels collapse, and the choice is remembered per device.

Each song page has the practice-track tabs, a player with speed control and an
A/B loop for drilling a hard passage, a **Download** button for the selected
voice part, and download links for every sheet music file.

The calendar shows the current service plus the next two weeks. Past dates drop
off on their own. Any service or song without a title shows **To Be Determined**.

## Adding a new song — with the admin app (recommended)

`choir-admin.html` is a form-based editor that writes directly to this repo
using the GitHub API, so you never have to hand-edit `songs.json` or push
files manually.

**One-time setup:**

1. Create a fine-grained GitHub personal access token:
   - Go to github.com → your profile photo → **Settings** →
     **Developer settings** → **Personal access tokens** →
     **Fine-grained tokens** → **Generate new token**
   - Under **Repository access**, select **Only select repositories**
     and choose `choir-vault` **and `bbcff-serv-sched`** (the second one is
     what lets the choir calendar keep the Service Schedule in sync — see
     "Service Schedule sync" below)
   - Under **Permissions → Repository permissions**, set
     **Contents** to **Read and write** — nothing else is needed
   - Copy the token (you only see it once)
2. Open `choir-admin.html` on GitHub Pages. On first load it asks for
   the token — paste it in. It's stored only in that browser's local
   storage, on that device, never in the repo.

**Using it:** three tabs across the top.

- **Songs** — add a song, upload/rename/reorder/remove practice tracks, upload
  sheet music, add reference links, and set Pre-Release. Removing a track, a
  sheet music file, or a whole song **deletes the actual files from the repo**,
  not just the reference.
- **Calendar** — add services (date + Sunday Morning / Sunday Evening /
  Wednesday / Special), then add songs to each with a **Slot** (1 or 4) and a
  **Soloist**. Songs come from a dropdown of the catalog, or type a title that
  isn't in it yet. Reorder songs within a service with the arrows.
- **Choir News** — paste the director's email straight in. Bold, italic, lists,
  headings, quotes and links survive; images, scripts and inline styling are
  stripped out so a messy email can't break the layout.

Everything saves immediately to the repo. The member-facing app (`index.html`)
picks up changes next time it loads.

Keep the admin page's link private — anyone with the token entered on their
device can edit the repo. Hand out the plain `index.html` link to the choir.

## Service Schedule sync

This app is the **source of truth** for the choir's slot and solo status. Every
calendar save writes into `bbcff-serv-sched/schedule-data.json`:

- `choir.slot` ← the Slot set on that service's songs
- `choir.solo` ← `Y` if any song in that service has a Soloist, otherwise `N`

Only Sunday services are synced, because the schedule app has no choir field on
Wednesdays. Dates you haven't added to the choir calendar are left completely
untouched, so the sync never clobbers anything you set over there by hand.

If your main token doesn't cover `bbcff-serv-sched`, the Calendar tab's
**Use a separate token** button lets you paste a second token just for the
schedule repo. **Sync now** re-runs it manually and prints what changed.

## Adding a new song — by hand (fallback)

If you ever need to bypass the admin app:

1. Pick a short id for the song, lowercase, hyphens instead of spaces.
   Example: `how-great-thou-art`.
2. Create the folders:
   - `audio/how-great-thou-art/`
   - `images/how-great-thou-art/`
3. Drop your MP3s and image files into those folders. Name them however you
   like, you'll reference the exact filenames in the next step.
4. Open `data/songs.json` and add a new entry to the `songs` array:

```json
{
  "id": "how-great-thou-art",
  "title": "How Great Thou Art",
  "tags": ["Hymn", "Sunday Service"],
  "notes": "Optional. Anything you want choir members to see at a glance.",
  "preRelease": false,
  "tracks": [
    { "part": "Demo",    "file": "audio/how-great-thou-art/demo.mp3" },
    { "part": "Soprano", "file": "audio/how-great-thou-art/soprano.mp3" },
    { "part": "Alto",    "file": "audio/how-great-thou-art/alto.mp3" },
    { "part": "Tenor",   "file": "audio/how-great-thou-art/tenor.mp3" },
    { "part": "Bass",    "file": "audio/how-great-thou-art/bass.mp3" }
  ],
  "sheetMusic": [
    { "label": "Page 1", "file": "images/how-great-thou-art/page-1.jpg" }
  ],
  "links": [
    { "label": "Reference recording", "url": "https://www.youtube.com/watch?v=..." }
  ]
}
```

Every field except `id` and `title` is optional — leave out `notes`, `tags`, or
any section your song doesn't need (an empty or missing `sheetMusic` array just
hides that section).

`"preRelease": true` keeps a song **hidden from the choir app** while you attach
its files and notes. Uncheck Pre-Release in the admin (or set it to `false`) when
you're ready for it to go live.

Track order in the array is the tab order in the app, so put the demo or your
most-used part first. Track names are free-form — `Demo`, `Soprano`, `Alto`,
`Tenor`, `Bass` are offered as quick-picks in the admin, but `Tenor 2` or
`Piano only` work just as well.

5. Commit and push. On mobile, the GitHub app is read-only for uploads — use
   github.com in Safari, or a desktop computer, to add files.

## Hosting on GitHub Pages

The app files live in the `docs/` folder of the `choir-vault` repo. GitHub
Pages is already configured to serve from `docs/` on the `main` branch —
just push and it deploys automatically. Public URL:
`https://baldguy-s.github.io/choir-vault/`

## Installing on iPhone

1. Open the GitHub Pages URL in Safari (must be Safari, not Chrome, for the
   home screen install to work correctly on iOS).
2. Tap the Share icon, then "Add to Home Screen."
3. It opens full-screen like a native app from then on.

## How offline works

- The app itself (the shell — pages, styles, code) caches automatically the
  first time anyone opens it, and works offline from then on.
- Practice tracks and sheet music are large, so they're **not** all downloaded
  automatically. They cache as they're used: opening a song and playing its
  tracks or viewing its sheet music saves those specific files for offline use.
- A song with all of its files cached shows a checkmark next to its title in
  the list.
- If you want a permanent copy on the device rather than a cached one, use the
  **Download** buttons on the song page — those save the actual file to the
  phone or computer.

## Notes on file sizes

Keep MP3s reasonably compressed (128kbps is plenty for practice tracks) and
sheet music images resized to something sane (1200–1600px on the long edge).
Full-resolution photos from a phone camera will work but will make "Save for
offline" slow on a weak connection.

## If you ever want to reset offline storage

There's no in-app button for this (deliberately — accidental data loss for
choir members isn't worth the convenience). If someone's cache gets into a
bad state: Settings → Safari → Advanced → Website Data → find the site →
Remove, then reopen the app.
