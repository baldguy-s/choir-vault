# choir-deploy-check

Pre-push checklist: confirm the repo is in a clean, deployable state before pushing changes.

## Usage

```
/choir-deploy-check
```

## What this does

Run each check and report PASS / FAIL / WARN:

### 1. GH_PLACEHOLDERS guard

Read `docs/choir-admin.html`. Confirm that:
- `GH_OWNER` is not `'owner'`
- `GH_REPO` is not `'repo'`

FAIL if either is still a placeholder.

### 2. songs.json integrity

Run `/choir-validate-repo`. FAIL if any referenced file is missing. WARN (not fail) if orphaned files are found.

### 3. Service worker cache version

Read `docs/sw.js`. Extract the cache version string (look for `CACHE_NAME` or similar versioned constant).

Check git status / diff for changes to any of these files:
- `docs/index.html`
- `docs/css/style.css`
- `docs/js/app.js`
- `docs/sw.js`
- `docs/manifest.json`

If any app-shell file has uncommitted changes **and** the cache version string has not changed since the last commit, WARN: "App-shell files changed but service worker cache version was not bumped — existing users may get a stale cached copy."

### 4. Pending uncommitted changes

Run `git status`. WARN if there are unstaged or uncommitted changes that won't be in the next push.

### 5. GitHub Pages status

Call `GET https://api.github.com/repos/baldguy-s/choir-vault/pages` and report the current Pages status (built, building, errored). WARN if not built.

## Final output

```
choir-deploy-check results
  ✓  GH_PLACEHOLDERS — configured
  ✓  songs.json — 12 songs, all files present
  ⚠  Orphaned files — 2 files not referenced by any song
  ✓  Service worker — cache version bumped
  ✓  No uncommitted changes
  ✓  GitHub Pages — built

RESULT: READY TO PUSH (1 warning)
```

Do not push or commit automatically — this is a read-only diagnostic. Tell the user the results and let them decide.
