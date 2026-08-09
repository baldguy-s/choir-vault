# choir-backup-songs-json

Snapshot the current songs.json before any destructive operation.

## Usage

```
/choir-backup-songs-json
```

## What this does

1. Fetch the current `docs/data/songs.json` from the repo via the GitHub Contents API.

2. Write a timestamped copy to `docs/data/backups/songs-<YYYY-MM-DD-HHmmss>.json` in the repo using a Contents API PUT with commit message `Backup songs.json before batch operation`.

3. Also write a local copy to `backups/songs-<YYYY-MM-DD-HHmmss>.json` relative to the project root (as a belt-and-suspenders fallback in case the repo write fails).

4. Confirm the backup was created and report the number of songs it contains.

## When to run

- Automatically called by `choir-add-song`, `choir-bulk-import`, and `choir-deploy-check` before any write that touches songs.json
- Run manually before hand-editing songs.json

## Cleanup

Backups accumulate over time. If there are more than 20 backup files in `docs/data/backups/`, list the oldest ones and ask whether to delete them to keep the repo tidy.
