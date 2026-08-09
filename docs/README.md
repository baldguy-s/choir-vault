# Choir Materials

An offline-capable web app for choir practice tracks, sheet music, and reference
links. Static site, no backend, no build step. Hosted on GitHub Pages, same as
your other projects.

## How it's organized

- `data/songs.json` — the list of every song. This is the only file you edit
  to add or change a song.
- `audio/<song-id>/` — MP3 practice tracks for that song.
- `images/<song-id>/` — sheet music scans/photos for that song (jpg or png).
- `index.html`, `css/`, `js/`, `sw.js`, `manifest.json` — the app itself. You
  shouldn't need to touch these.

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
     and choose `choir-vault`
   - Under **Permissions → Repository permissions**, set
     **Contents** to **Read and write** — nothing else is needed
   - Copy the token (you only see it once)
2. Open `choir-admin.html` on GitHub Pages. On first load it asks for
   the token — paste it in. It's stored only in that browser's local
   storage, on that device, never in the repo.

**Using it:** Add song, upload a track per voice part, upload sheet music
pages (drag to reorder, editable labels), add reference links — all saved
immediately to the repo. The member-facing app you open separately
(`index.html`) picks up the changes next time it loads `songs.json`.

Keep the admin page's link private — anyone with the token entered on their
device can edit the repo. Hand out the plain `index.html` link to the choir.

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
  "composer": "Stuart K. Hine",
  "tags": ["Hymn", "Sunday Service"],
  "notes": "Optional. Anything you want choir members to see at a glance.",
  "tracks": [
    { "part": "Full Mix", "file": "audio/how-great-thou-art/full-mix.mp3" },
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

Every field except `id`, `title`, and `tracks`/`sheetMusic`/`links` arrays is
optional — leave out `notes`, `composer`, `tags`, or any section your song
doesn't need (an empty or missing `sheetMusic` array just hides that section).

The sample entry already in `songs.json` (Amazing Grace) is a working example
with placeholder audio and sheet music, so you can see the app fully
functional before you replace it with real files.

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
- Practice tracks and sheet music are large, so they're **not** all
  downloaded automatically. Two ways they get cached for offline use:
  1. Simply opening a song and viewing its images / playing its tracks
     caches those specific files.
  2. Tapping "Save this song for offline" on a song's page pre-downloads
     everything for that song in one go — useful before a rehearsal
     somewhere with bad signal.
- A song already fully saved shows a checkmark next to its title in the list.

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
