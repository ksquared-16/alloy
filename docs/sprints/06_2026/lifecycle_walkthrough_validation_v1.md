# Full Lifecycle Walkthrough Validation v1

**Path:** `docs/sprints/06_2026/lifecycle_walkthrough_validation_v1.md`  
**Status:** Phase 7 — validation checklist (May 2026)  
**Doctrine path:** Lead → Qualification → Tour → Waitlist → Enrollment → Enrolled

---

## Automated validation (this sprint)

| Check | Result |
|-------|--------|
| `move_to_waitlist` preflight (child, program, schedule, start) | **Pass** — `evaluateEffectiveRequirements.test.ts` |
| `move_to_waitlist` execute + `waitlist_date` stamp | **Pass** — `lifecycleActionsRuntimePreflight.test.ts` |
| Lifecycle progression doctrine catalog | **Pass** — `lifecycleProgressionRequirementsCatalog.test.ts` |
| `cd web && npx tsc --noEmit` | **Pass** |

---

## Manual pilot walkthrough (operator)

Run on enrollment pilot org after applying migrations `20260603100000` + `20260603110000`.

| Step | Action | Expected | Status |
|------|--------|----------|--------|
| 1 | Create lead (parent only) | Lead in **New Leads** queue | Manual |
| 2 | Move to qualification | Status `qualification`; **Follow Up** queue | Manual |
| 3 | Add child + program | Inquiry children row populated | Manual |
| 4 | Schedule tour | Status `tour_scheduled`; **Tours** queue | Manual |
| 5 | Record tour outcome | Tour substate updates | Manual |
| 6 | **Move to waitlist** | Status `waitlisted`; **Waitlist** queue; `waitlist_date` set | Manual — **was blocked before activation** |
| 7 | Set classroom, schedule, start on child | Placement fields on OCM | Manual |
| 8 | Approve enrollment | Status `enrolled`; preflight panel if blocked | Manual |
| 9 | Verify enrolled queue | **Enrolled** child-grain queue | Manual |

---

## Alignment checklist (post-sprint)

| Layer | Aligned? | Notes |
|-------|----------|-------|
| Work units | **Yes** | v2 domains map to doctrine stages |
| Statuses | **Partial** | `qualification` canonical; legacy `contact_attempted` retained |
| Actions | **Partial** | Waitlist activated; `create_task` / `send_form` placement still operator-dependent |
| Needs Attention | **Partial** | Lifecycle bucket seed; no per-field NA codes yet |
| BOS | **Partial** | Uses `evaluateEffectiveRequirements` for canonical actions |
| Settings | **Partial** | Lifecycle progression panel (read-only MVP); placements editable |

---

## Remaining gaps (not this sprint)

| Gap | Priority |
|-----|----------|
| `create_task` capture modal | P1 |
| `send_form` default placement seed | P1 |
| `remove_from_waitlist` / offer spot | P1 |
| Editable requirement policy (not read-only catalog) | P1 |
| `condition_config` builder in Settings | P2 |
| Quote-era resolver codes (`stale_quote_followup`) on enrollment-only orgs | P2 |
| Tour-not-confirmed attention reason | P2 |
| Recurring tasks / checklist platform | Future sprint |
