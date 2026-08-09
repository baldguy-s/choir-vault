# choir-validate-repo

Validate the repo's data integrity: every file referenced in songs.json exists, every id is valid and unique, and no orphaned files are sitting in audio/ or images/.

## Usage

```
/choir-validate-repo
```

## What this does

### 1. Read songs.json

Fetch `docs/data/songs.json` from the repo (GitHub Contents API or local file if running locally).

### 2. Validate each song entry

For every song in the `songs` array:

- **id**: must match `/^[a-z0-9]+(-[a-z0-9]+)*$/` (lowercase slug, no leading/trailing hyphens)
- **id uniqueness**: no two songs share the same id
- **title**: must be non-empty
- **tracks**: for each track entry, fetch `docs/<file>` from the repo and confirm it exists (HTTP 200 or 404 check via raw.githubusercontent.com or Contents API)
- **sheetMusic**: same existence check for each `file` path
- **links**: each `url` should be a valid URL (basic regex check; do not make network requests to external URLs)

### 3. Check for orphaned files

List all files under `docs/audio/` and `docs/images/` in the repo (recursive Contents API tree walk). For each file found, check whether any song's `tracks` or `sheetMusic` arrays reference it. Files not referenced by any song are **orphaned** — list them.

### 4. Report

Print a structured report:

```
SONGS.JSON VALIDATION
  ✓  amazing-grace — OK (5 tracks, 2 pages)
  ✗  how-great-thou-art — MISSING: audio/how-great-thou-art/soprano.mp3

ORPHANED FILES (not referenced by any song)
  audio/old-song/full-mix.mp3
  images/old-song/page-1.jpg

SUMMARY
  Songs checked:   12
  Songs with errors:  1
  Missing files:  1
  Orphaned files:  2
```

Exit with a clear PASS or FAIL result.

## Config

- Repo: `baldguy-s/choir-vault`, branch `main`
- Token: read from environment variable `GH_PAT` if needed for private repos. The choir-vault repo is public, so most checks can use unauthenticated raw.githubusercontent.com URLs.
