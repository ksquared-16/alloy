# Demo / Tenant Runtime Cleanup Workflow

Reusable org-scoped cleanup scripts for staging and demo tenant resets. All modes are **explicit** — nothing runs unless the matching `DEMO_CLEANUP_MODE` is set (except default demo-metadata cleanup when mode is unset).

Scripts live under `web/scripts/`:

- `npm run demo:cleanup:dry` — zero writes, visibility only
- `DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA npm run demo:cleanup:execute` — destructive

Required env:

- `DEMO_RESET_ORG_ID` (or `DEMO_SEED_ORG_ID`)
- `SUPABASE_SERVICE_ROLE_KEY`
- Refuses when `VERCEL_ENV=production`

## Cleanup modes (compose safely in sequence)

| Mode | `DEMO_CLEANUP_MODE` | Purpose |
|------|---------------------|---------|
| **Demo metadata cleanup** | *(unset / default)* | Delete rows tagged with demo seed metadata (`demo_seed_package`, `is_demo_data`, etc.). Narrow filters via `DEMO_SEED_PACKAGE` / `DEMO_SEED_RUN_ID` / `DEMO_SEED_FAMILY_KEY`. |
| **Enrollment runtime reset** | `enrollment_runtime_reset` | Clear lead/enrollment queue runtime for the org: opportunities in lead statuses or on enrollment work units, plus FK-expanded customers/persons/tasks. Excludes golden-path seeds. Does **not** delete locations, config, or non-demo work units. |
| **Communications orphan reset** | `communications_orphan_reset` | Delete communication rows with no valid primary entity (orphan threads/messages after entity deletes). Does **not** delete opportunities, customers, persons, locations, config, or work units. Excludes golden-path-linked threads. |

### Recommended tenant bootstrap reset sequence

Run dry-run before each step; execute only after counts look correct.

```bash
cd web

# 1. Clear demo-tagged seed rows (optional narrow package)
DEMO_RESET_ORG_ID=<org-uuid> npm run demo:cleanup:dry

# 2. Clear stale lead queue runtime (non-demo opps in New Leads)
DEMO_CLEANUP_MODE=enrollment_runtime_reset \
DEMO_RESET_ORG_ID=<org-uuid> \
npm run demo:cleanup:dry

# 3. Clear orphan Communications inbox rows
DEMO_CLEANUP_MODE=communications_orphan_reset \
DEMO_RESET_ORG_ID=<org-uuid> \
npm run demo:cleanup:dry

# 4. Re-seed golden path (if needed)
DEMO_SEED_ORG_ID=<org-uuid> npm run demo:seed:golden-path
```

Execute mirrors dry-run with `DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA`.

## Communications inbox source (audit)

Admin **Communications** inbox loads via:

- **API:** `GET /api/admin/inbox/threads?folder=inbox|unread|sent|scheduled|archived`
- **Service:** `listInboxThreads` in `web/lib/communications/inboxThreadsService.ts`
- **Tables:** `communication_threads` (list), `communication_messages` (previews/unread), `communication_message_reads` (unread flags), `communication_scheduled_sends` (scheduled folder)

Entity/family association:

- Each thread stores `primary_entity_type` + `primary_entity_id` (no FK — soft reference).
- Inbox enrichment (`loadEntityContext`) resolves labels from `opportunities`, `customers`, `persons`, `jobs`.
- When the primary entity row is missing, the thread still appears but shows a generic chip (e.g. "Opportunity") with no family name — **orphan thread**.
- Drawer-scoped threads also use `GET /api/admin/communications/threads?entity_type=&entity_id=`.

Orphan reset deletes threads whose primary entity is missing/invalid, plus attached messages/reads and unlinked scheduled sends.

## Golden-path protection

All explicit reset modes exclude records linked to `metadata.demo_seed_package = golden_path_enrollment_v1` or `metadata.seed_key LIKE golden_path%`.

## Protected infrastructure (never deleted)

- `locations` and location field values in default/demo modes
- Platform configuration tables
- Non-demo-tagged `work_units` / `departments` (demo-metadata `deleteByOr` only in default mode)

## FK-safe delete orders

**Default / enrollment modes:** see `DEMO_CLEANUP_TABLE_ORDER` in `web/scripts/lib/demoRuntimeCleanupScope.ts`.

**Communications orphan mode:**

1. `communication_message_reads`
2. `communication_messages`
3. `communication_scheduled_sends`
4. `messages_outbox` (workflow-run linkage to orphan entities/messages)
5. `communication_threads`
