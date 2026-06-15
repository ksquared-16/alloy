# Communications V2 — Staging Command Center Checkpoint

**Updated:** 2026-06-15  
**Branch context:** `staging` — Command Center live on real Alloy staging (`staging.workwithalloy.com`).

## What works on staging today

- **Command Center opens** from TopNav Inbox when `comms_v2_command_center` is enabled (core flag defaults ON).
- **Queue hydrates** from `GET /api/admin/communications/conversations` — threads with null/unknown `attention_state` land in **All Conversations** (not hidden).
- **Auto-select** picks the first visible queue row and loads the Family Communication Workspace when `comms_v2_live_workspace` is on and `customer_id` resolves.
- **Background prefetch** warms the conversations API ~1.5s after AdminV2 shell mount; Inbox click triggers an additional prefetch.
- **Coherent reveal:** one branded loading overlay until queue + first workspace selection are ready (no piecemeal KPI → queue → empty center pane).
- **Queue cards** use real enrichment fields only; unclassified threads show **Unclassified** (not fake “On track”).
- **Timeline bubbles** wrap long URLs/text inside bubble borders.

## Load flow (after this pass)

```
AdminV2Shell mount
  └─ scheduleCommandCenterPrefetch() → GET /conversations (cached 90s)

TopNav Inbox click
  └─ prefetchCommandCenterConversations() (reuse cache if fresh)
  └─ InboxModal opens → CommandCenterShell
       ├─ seed state from warm cache (if hit)
       ├─ refresh conversations (background if cache hit)
       ├─ auto-select first visible row
       └─ GET /family-workspace?customer_id=… (or thread messages fallback)
```

**Root cause of clunky reveal (fixed):** Command Center mounted only when modal opened; fetch started cold on mount; KPI/queue rendered while workspace still loading; no shared prefetch cache unlike legacy inbox warm load.

## Queue card fields in use

| UI slot | Source field(s) | Notes |
|--------|------------------|-------|
| Primary title | `family_label`, `primary_contact_name` | Never prefers raw email when contact name exists |
| Recipient line | `recipient_key` | Shown when distinct from title |
| Secondary line | `child_names`, `stage_label`, `program_label`, else channel | From enrichment |
| Preview | `last_message_preview` | Latest message body (truncated) |
| Meta | `channel`, `last_activity_at` / `last_message_at`, unread | `relTime()` formatting |
| Status pill | `attention_state`, `sla_state` | **Unclassified** when attention unknown |

## Data audit

### Available now

| Field | Status |
|-------|--------|
| household/customer label | Partial — `customers.name` via entity anchor |
| recipient contact | Available — `communication_threads.recipient_key` |
| channel | Available — thread |
| last message preview | Available — enrichment from `communication_messages` |
| last activity time | Available — preview `created_at` or `last_message_at` |
| unread count | Available — inbound without read row for viewer |
| assignment state | Available — thread |
| attention_state | Available — mostly null on staging |
| customer_id | Partial — resolved from opportunity/customer/person anchor |
| child names | Partial — `customer_members` (relationship=child) when customer resolves |
| stage label | Partial — opportunity `status_key` (formatted) when opp-anchored |
| owner name | **Not shown** — only `assigned_user_id` exists; no user lookup yet |
| program/location | **Not shown** — `location_id` on thread; no location label lookup |

### Missing but capturable (next enrichment passes)

| Field | Gap |
|-------|-----|
| why this is in queue | Needs workflow/rules to set `attention_state` |
| next recommended action | Not modeled |
| SLA due/overdue | `sla_state` exists but rarely populated on staging |
| last inbound/outbound direction | `last_message_direction` now enriched; not yet on card UI |
| needs-response reason | Derived from attention_state when set |
| operational source record | `primary_entity_type/id` available; not on card |
| owner display name | Lookup `assigned_user_id` → staff user/profile |
| program/location label | Lookup `location_id` / opportunity location |

### Missing — future model/workflow

| Field | Notes |
|-------|-------|
| provider admin status | Out of scope this pass |
| consent status | Out of scope |
| thread classification/backfill | Bulk set `attention_state` for staging threads |
| queue-specific work ownership | Beyond assignment_state |

## Files touched (staging polish pass)

- `web/lib/communications/v2/commandCenterPrefetchCache.ts` — warm cache
- `web/app/adminV2/components/AdminV2Shell.tsx` — schedule prefetch on mount
- `web/app/adminV2/components/TopNavBar.tsx` — prefetch on Inbox open
- `web/app/adminV2/communications/CommandCenterShell.tsx` — cache seed, overlay reveal, queue cards
- `web/lib/communications/v2/commandCenterConversationEnrichment.ts` — previews, children, stage, recipient split
- `web/lib/communications/v2/commandCenterViewModel.ts` — presentation helpers, status pills
- `web/app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx` — bubble wrap CSS

## Explicitly out of scope (this pass)

- Provider/binding admin
- Email inbound
- BOS rail / Announcements builder

## Handoff to Claude — source of truth

1. **Flags:** `web/lib/communications/v2/flags.ts` — core V2 flags default ON; env tokens override.
2. **Queue visibility:** `OTHER_QUEUE_KEY` + `visibleCommandCenterQueues()` — never hide unclassified threads.
3. **Prefetch pattern:** mirror `inboxWarmLoadCache.ts`; cache TTL 90s.
4. **Selection:** `resolveCommandCenterSelection()` + auto-select effect in `CommandCenterShell`.
5. **Enrichment boundary:** server-only in `commandCenterConversationEnrichment.ts`; extend there, not in UI.
6. **Staging reality:** ~119 threads, most with null `attention_state` → All Conversations bucket.

## Next pass after staging polish

1. **Provider/binding admin readiness** — Twilio/Resend binding UI, status callback verification in prod-like env.
2. **Email inbound** — normalize + thread assignment for unclassified email threads.
3. **Production QA** — classification backfill, SLA population, owner name lookup, consent gates.

## Verification commands

```bash
cd web
npm run test -- tests/communications
npm run test -- tests/adminV2/commsV2CommandCenterLive.contract.test.ts
npx tsc --noEmit
```
