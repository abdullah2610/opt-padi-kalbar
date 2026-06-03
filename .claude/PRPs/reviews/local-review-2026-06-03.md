# Local Code Review — 2026-06-03

**Reviewed:** 2026-06-03
**Branch:** main (uncommitted changes)
**Decision:** REQUEST CHANGES

## Summary

7 scripts had file permissions changed (0644 → 0755). 2 doc files updated (status tracking only). No new logic added — permission change makes previously-committed scripts directly executable. Content review surfaced 2 HIGH, 3 MEDIUM, 2 LOW issues in existing script content.

## Findings

### HIGH

**H1 — `setup_gh_secrets.sh:53` — Path injection in embedded Python**

`$TOKEN_CACHE` (derived from `$HOME`) interpolated directly into Python source code passed via `-c`. If `$HOME` contains a single-quote, arbitrary Python executes as calling user. CI runners can set `HOME` to unexpected values.

```bash
# Current — vulnerable
TOKEN=$(python3 -c "
import json, sys
data = json.load(open('$TOKEN_CACHE'))
...")

# Fix — pass as argument
TOKEN=$(python3 - "$TOKEN_CACHE" <<'PYEOF'
import json, sys
data = json.load(open(sys.argv[1]))
...
PYEOF
)
```

**H2 — `setup_gh_secrets.sh:74` — Empty secret set silently**

`gh secret set CDSE_CLIENT_SECRET --body "${CDSE_CLIENT_SECRET:-}"` — when var unset, pushes empty string to GitHub. Downstream workflows get empty credential, fail silently in auth, not at startup.

```bash
# Fix — guard like CDSE_CLIENT_ID above
if [[ -n "${CDSE_CLIENT_ID:-}" && -n "${CDSE_CLIENT_SECRET:-}" ]]; then
  gh secret set CDSE_CLIENT_ID --body "$CDSE_CLIENT_ID"
  gh secret set CDSE_CLIENT_SECRET --body "$CDSE_CLIENT_SECRET"
  echo "✓ CDSE_CLIENT_ID + CDSE_CLIENT_SECRET"
else
  echo "✗ CDSE_CLIENT_ID or CDSE_CLIENT_SECRET missing"
fi
```

### MEDIUM

**M1 — `seed_kabupaten_pg.mjs:43` + `run_migrations.mjs:72` — Incomplete password URL encoding**

`toPoolerUrl` puts raw password in URL without `encodeURIComponent`. `fixPasswordEncoding` only handles `@`. Supabase auto-generated passwords regularly include `%`, `#`, `?` — these silently truncate or corrupt the connection string. `probe_pooler_region.mjs:41` correctly uses `encodeURIComponent` — inconsistency across scripts.

```js
// Fix in toPoolerUrl (both files)
return `postgresql://${user}.${projectRef}:${encodeURIComponent(pass)}@${host}:5432${rest}`;
```

**M2 — `run_backfill_parallel.sh:35` + `run_backfill_v2.sh:32` — PID file captures subshell, not python**

`echo $!` after `( sleep ... && uv run python ... ) &` saves the subshell PID. After sleep phase, subshell exits and PID is released/reused. `kill $(cat ...pid)` — the advertised stop mechanism — is silently a no-op after stagger delay. Workers keep running.

```bash
# Fix — capture python PID inside the subshell
(sleep "$DELAY" && cd "$ROOT" && uv run python main.py backfill ... & echo $! > "$LOGDIR/backfill_${KAB}.pid") &
```

**M3 — `probe_pooler_region.mjs:74` — `.env.local` rewrite strips comments + blank lines**

`.filter(l => l.length > 0)` removes all comment lines and blank-line section separators. Re-running probe permanently destroys annotations.

```js
// Fix — preserve comments
.filter((l) => l.startsWith('#') || l.trim().length > 0)
```

### LOW

**L1 — `seed_kabupaten_pg.mjs:8` — Unused import**

`readFile` (callback form) imported from `node:fs` but never used. `readFileAsync` from `node:fs/promises` is used.

```js
// Fix
import { readFileSync } from 'node:fs'; // remove readFile
```

**L2 — `run_backfill_v2.sh` — Exit code not logged**

v1 appends `echo "EXIT:$?" >> "$LOGFILE"` after python exits. v2 does not. Harder to debug failures.

## Validation Results

| Check | Result |
|---|---|
| Type check | Skipped (shell/JS scripts, no tsconfig) |
| Lint | Skipped |
| Tests | Skipped |
| Build | N/A |

## Files Reviewed

| File | Change |
|---|---|
| PENDING.md | Modified (docs only) |
| PROGRESS.md | Modified (docs only) |
| infra/scripts/probe_pooler_region.mjs | Mode +x |
| infra/scripts/run_migrations.mjs | Mode +x |
| infra/scripts/seed_kabupaten_pg.mjs | Mode +x |
| infra/scripts/setup_gh_secrets.sh | Mode +x |
| infra/scripts/smoke_api.mjs | Mode +x |
| workers/etl/run_backfill_parallel.sh | Mode +x |
| workers/etl/run_backfill_v2.sh | Mode +x |
