# choir-add-song

Add a new song to the choir-vault repository end-to-end.

## Usage

```
/choir-add-song
```

Claude will prompt for the required inputs and then handle everything.

## What this does

1. Ask the user for:
   - **Title** (required)
   - **Composer** (optional)
   - **Tags** — comma-separated, e.g. `Hymn, Sunday Service` (optional)
   - **Notes** — free text shown to choir members (optional)
   - **Source folder** — local path containing audio files and/or image files to upload

2. Slugify the title to generate the song `id` (lowercase, hyphens, no special chars). Check `docs/data/songs.json` for a collision — if the slug already exists, append `-2` (or `-3`, etc.) and inform the user.

3. For each audio file in the source folder:
   - Run `/choir-compress-audio` on it to produce a 128kbps MP3 in a temp location
   - Determine the voice part from the filename (match against: `full-mix`, `soprano`, `alto`, `tenor`, `bass` — case-insensitive, partial match ok, e.g. `Soprano Take 2.wav` → soprano)
   - Upload via GitHub Contents API PUT to `docs/audio/<id>/<part-slug>.mp3`

4. For each image file in the source folder:
   - Run `/choir-resize-sheet-music` on it to produce a properly-sized JPEG
   - Upload via GitHub Contents API PUT to `docs/images/<id>/page-<n>.jpg` (sequential numbering)

5. Build the new song entry:
   ```json
   {
     "id": "<slug>",
     "title": "<title>",
     "composer": "<composer>",
     "tags": ["<tag1>", "<tag2>"],
     "notes": "<notes>",
     "tracks": [ ... ],
     "sheetMusic": [ ... ],
     "links": []
   }
   ```
   Omit `composer`, `tags`, `notes` if the user left them blank.

6. Read `docs/data/songs.json` via the GitHub Contents API, append the new entry to the `songs` array, and PUT the updated file back. Always back up first by running `/choir-backup-songs-json`.

7. Report: which files were uploaded, the final entry as it appears in songs.json, and any files that were skipped (unrecognized filenames, non-audio/image types).

## Config

- Repo: `baldguy-s/choir-vault`, branch `main`
- Token: read from `localStorage` key `gh_pat_choir_music` — if not available in this context, ask the user to provide it as a CLI argument or environment variable `GH_PAT`
- GitHub Contents API base: `https://api.github.com`

## Error handling

- If a voice part can't be inferred from the filename, ask the user to confirm the part manually before uploading.
- If any upload fails, report the error and continue with remaining files — do not abort the whole batch.
- If `songs.json` PUT fails after files are already uploaded, tell the user exactly what to add to songs.json manually so no data is lost.
