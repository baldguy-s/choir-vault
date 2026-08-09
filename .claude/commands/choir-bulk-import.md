# choir-bulk-import

Import an entire folder of songs into the repo in one batch.

## Usage

```
/choir-bulk-import <source-folder>
```

The source folder should contain one subfolder per song:

```
source-folder/
  Amazing Grace/
    full-mix.mp3
    soprano.mp3
    alto.mp3
    tenor.mp3
    bass.mp3
    page-1.jpg
    page-2.jpg
  How Great Thou Art/
    full-mix.wav
    soprano.wav
    page-1.png
```

## What this does

1. Run `/choir-backup-songs-json` before making any changes.

2. List all immediate subdirectories of `<source-folder>`. Each subfolder name becomes the song title.

3. For each subfolder, infer file roles from filenames:
   - Audio files (`.mp3`, `.wav`, `.m4a`, `.flac`, `.aiff`, `.ogg`):
     Match filename (case-insensitive) against known part names:
     - `full.mix`, `full-mix`, `fullmix`, `full` → Full Mix
     - `soprano`, `sop`, `s` → Soprano
     - `alto`, `alt`, `a` → Alto
     - `tenor`, `ten`, `t` → Tenor
     - `bass`, `bas`, `b` → Bass
     - No match → ask the user to classify it before continuing
   - Image files (`.jpg`, `.jpeg`, `.png`, `.tiff`, `.heic`):
     Sort alphabetically; assigned as page-1, page-2, etc. in that order
   - Other file types: skip and warn

4. For each song, call `/choir-add-song` logic (compress audio, resize images, upload files, update songs.json). Process songs sequentially to avoid GitHub API rate limits.

5. After all songs are processed, run `/choir-validate-repo` to confirm integrity.

6. Print a final report: songs added, files uploaded, any songs skipped or partially failed.

## Error handling

- If a song slug would collide with an existing entry in songs.json, skip that song and warn — do not overwrite existing songs without explicit confirmation.
- If an individual file upload fails, continue with the rest of that song; note the failure in the final report.
- If songs.json update fails mid-batch, stop and report. Do not continue adding more songs until songs.json is consistent.

## Config

Same as `choir-add-song` — repo `baldguy-s/choir-vault`, branch `main`, token from `GH_PAT` env var.
