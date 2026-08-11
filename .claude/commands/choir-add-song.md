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
   - **Tags** — comma-separated, e.g. `Slot 4, Christmas` (optional)
   - **Notes** — free text shown to choir members (optional)
   - **Lyrics** — plain text, line breaks preserved (optional)
   - **Pre-Release** — if yes, the song is hidden from the choir app until unset (default no)
   - **Source folder** — local path containing audio files and/or sheet music to upload

2. Slugify the title to generate the song `id` (lowercase, hyphens, no special chars). Check `docs/data/songs.json` for a collision — if the slug already exists, append `-2` (or `-3`, etc.) and inform the user.

3. For each audio file in the source folder:
   - Upload the original file as-is — do NOT compress, normalize, or convert it. Preserve the original format and extension (.mp3, .m4a, .wav, etc.)
   - Determine the voice part from the filename (match against `demo`, `soprano`, `alto`, `tenor`, `bass`, plus the abbreviations `sop`, `alt`, `ten`, and `full mix`/`all parts` → Demo — case-insensitive, whole-word match). If nothing matches, fall back to the file name and confirm with the user.
   - Upload via GitHub Contents API PUT to `docs/audio/<id>/<part-slug>.<original-ext>`
   - Track array order is the tab order in the app — put Demo first, then Soprano, Alto, Tenor, Bass.

4. For each sheet music file (PDF or image) in the source folder:
   - Upload it **as-is, under its own file name**. Do not resize, convert, or add a timestamp.
   - Upload to `docs/images/<id>/<original-file-name>`
   - **The choir sees the file name minus its extension as the name.** So if the name should read `Music - How Great Thou Art`, the file must be `Music - How Great Thou Art.pdf`. Rename the source file before uploading if needed. Spaces and apostrophes are fine; only characters illegal in a path (`\ / : * ? " < > |`) must be replaced.

5. Build the new song entry:
   ```json
   {
     "id": "<slug>",
     "title": "<title>",
     "tags": ["<tag1>", "<tag2>"],
     "notes": "<notes>",
     "lyrics": "<lyrics>",
     "preRelease": false,
     "tracks": [ { "part": "Demo", "file": "audio/<id>/demo.mp3" } ],
     "sheetMusic": [ { "file": "images/<id>/Music - <title>.pdf" } ],
     "links": []
   }
   ```
   All nine keys are always present; use `""` / `[]` / `false` rather than omitting them.

   **There is no `composer` field** — it was removed in Aug 2026. **`sheetMusic` entries carry only `file`** — there is no `label`; the name is derived from the file path.

6. Remember the two-path rule: the Contents API needs `docs/audio/...`, but `songs.json` stores the app path without the `docs/` prefix.

7. Read `docs/data/songs.json` via the GitHub Contents API, append the new entry to the `songs` array, and PUT the updated file back. Always back up first by running `/choir-backup-songs-json`.

   **Fetch songs.json immediately before writing.** The admin tool writes it constantly, so a copy read even minutes earlier may be stale and would silently revert the user's other additions.

8. If any app-shell file was touched as part of the change, bump `SHELL_CACHE` in `docs/sw.js`.

9. Report: which files were uploaded, the final entry as it appears in songs.json, and any files that were skipped (unrecognized filenames, unsupported types).

## Config

- Repo: `baldguy-s/choir-vault`, branch `main`
- Token: read from `localStorage` key `gh_pat_choir_music` — if not available in this context, ask the user to provide it as a CLI argument or environment variable `GH_PAT`
- GitHub Contents API base: `https://api.github.com`

## Error handling

- If a voice part can't be inferred from the filename, ask the user to confirm the part manually before uploading.
- If any upload fails, report the error and continue with remaining files — do not abort the whole batch.
- If `songs.json` PUT fails after files are already uploaded, tell the user exactly what to add to songs.json manually so no data is lost.
- On a 409/422 from the PUT, re-fetch songs.json for a fresh blob SHA and retry once.
