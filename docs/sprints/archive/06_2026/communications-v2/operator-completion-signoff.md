# Communications V2 — Operator Completion Sprint Signoff

**Date:** 2026-06-16  
**Status:** Implemented locally — **not pushed** (awaiting review)

---

## Phase 0 — Audit Summary

### Notes
- **Canonical model:** `communication_messages` with `channel=in_app`, `metadata.kind=note`
- **No separate notes table**
- **Write path:** `POST /api/admin/communications/send` (in_app) — now wrapped by `POST /api/admin/communications/family-note`
- **Legacy parallel:** `opportunities.metadata.notes`, `follow_up_notes` field — not unified

### Tasks
- **Canonical model:** `operational_tasks` (entity link: `opportunities` only, or unlinked)
- **APIs reused:** `POST/PATCH /api/admin/communications/operational-tasks` via `taskAssistV11OpportunityApi`
- **Comms gap closed:** Tasks tab now creates/completes via same API

### Queue triage
- **Field:** `communication_threads.attention_state` (nullable text)
- **Operational values:** `awaiting_parent_reply`, `needs_follow_up`, `documents_missing`, `re_enrollment_outreach`, `waitlist_update`
- **New operator values:** `null` (Needs review), `resolved` (Resolved)
- **New route:** `POST /api/admin/communications/conversations/[id]/triage`

### Preferences
- **Table:** `communication_preferences` + audit `communication_preference_events`
- **Categories:** `email_transactional`, `sms_transactional`, `email_marketing`, `sms_marketing`
- **Legacy person fields:** `sms_consent`, `email_consent`, `communication_opt_out` in `field_values` — **not** duplicated
- **New route:** `GET/PATCH /api/admin/communications/preferences?person_id=`

---

## Implementation Summary

| Phase | Delivered |
|-------|-----------|
| 1 Note compose | Notes tab + composer → `family-note` → `in_app` message |
| 2 Tasks | New task form + Complete action → `operational_tasks` |
| 3 Triage | Queue state label + Needs review / Needs response / Resolved actions |
| 4 Preferences | 4-field editable panel in Command Center |
| 5 Person layout | `PersonCommunicationPreferencesSection` on parent drawer operating surface |

---

## Preference Data Model (operator-facing)

| UI label | DB category | Row key |
|----------|-------------|---------|
| Email messages | `email_transactional` | `(org_id, person_id, category)` |
| Text messages | `sms_transactional` | same |
| Email marketing | `email_marketing` | same |
| Text marketing | `sms_marketing` | same |

States: `opted_in` → Allowed · `opted_out` → Blocked · missing/`unset` → Unknown

---

## Tests

```bash
cd web && npm run test -- tests/communications tests/adminV2/commsV2CommandCenterLive.contract.test.ts
# 50 files, 278 tests — all passed
```

New: `commsV2OperatorCompletion.test.ts`

---

## Remaining Gaps

1. Note compose from drawer Communications tab (Command Center only today)
2. Task creation when no opportunity linked (schema constraint)
3. Full operational queue admin (5 queue buckets beyond triage shortcuts)
4. `comms_v2_compliance` send-time enforcement still flag-gated
5. Legacy `field_values` consent not auto-synced to `communication_preferences`

---

## Freeze Recommendation

**YES** — with this sprint, Communications V2 reaches operator-complete for the bounded scope agreed before Provider Admin / Email Inbound.

Core operator actions (note, task, triage, preference edit, person visibility) are wired to canonical models without parallel systems.
