# Venue Timeline V3.2 safe rollout

## Runtime flags

Load `window.BANQUET_ERP_RUNTIME_CONFIG` before `src/constants.js`.

```js
window.BANQUET_ERP_RUNTIME_CONFIG = {
  environment: "production",
  features: {
    venueTimelineEnabled: true,
    venueTimelineEditingEnabled: false,
  },
};
```

- Initial rollout: timeline enabled, editing disabled.
- Emergency rollback: set both flags to `false`. If timeline was active the board returns to `operations`.
- Editing disabled removes color inputs, cell editor controls, drag/drop and turnover actions. Mutation handlers are not bound, and `persistTimelinePlan` also rejects calls.
- These client flags are rollout controls, not a database security boundary. A caller can still send REST requests directly while the current RLS permits anon writes.

## Credentials

Never add credentials to Git. Use process environment variables:

```powershell
$env:BANQUET_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:BANQUET_SUPABASE_ANON_KEY = "<anon-key>"
```

`.env`, `.env.*` and `backups/` are ignored.

## Read-only backup

```powershell
node scripts/backup-operation-board.mjs
```

The script performs GET requests only and writes JSON plus SHA-256 manifests under `backups/`.

## Partial restore

First run a GET-only plan:

```powershell
node scripts/restore-operation-board-item.mjs --snapshot backups/<snapshot> --item-key "<exact-item-key>"
```

Record `currentSha`, review the target, then execute only with the exact project ref and current hash:

```powershell
node scripts/restore-operation-board-item.mjs `
  --snapshot backups/<snapshot> `
  --item-key "<exact-item-key>" `
  --execute `
  --allow-project-ref "<project-ref>" `
  --expected-current-sha "<currentSha>" `
  --confirm V32_PARTIAL_RESTORE
```

The restore never truncates a table. If the row changed after the dry run, it aborts. Deleting a row absent from the snapshot additionally requires `--delete-if-absent`, and only rows tagged `metadata.source=v32_canary` are eligible.

## Canary

Default invocation is no-write:

```powershell
node scripts/v32-canary-operation-board.mjs
```

After explicit approval only:

```powershell
node scripts/v32-canary-operation-board.mjs `
  --execute `
  --allow-project-ref "<project-ref>" `
  --confirm V32_CANARY_WRITE
```

The canary:

1. backs up both operation board tables;
2. creates one unique `v32-canary:<uuid>` row on `2099-12-31` with no event order;
3. verifies planned date, multi-day range, turnover, segments, order and color;
4. verifies completed, pinned and memo remain intact;
5. deletes only the tagged row;
6. reports other concurrent row changes without restoring or overwriting them.

## RLS follow-up

Current migrations allow `anon` full access. Do not interpret feature flags as authorization. RLS hardening requires Supabase Auth/role integration and remains a separate change. No RLS migration is included in V3.2.
