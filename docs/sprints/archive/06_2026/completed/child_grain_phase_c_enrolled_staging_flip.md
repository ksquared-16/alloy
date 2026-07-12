# Child-Grain Phase C — Enrolled Lane Staging Flip

**Path:** `docs/sprints/archive/06_2026/completed/child_grain_phase_c_enrolled_staging_flip.md`  
**Date:** 2026-06-06  
**Status:** **Staging flip — Enrolled lane only**  
**Preflight:** [`child_grain_phase_c_preflight.md`](../child_grain_phase_c_preflight.md)  
**Code base:** Phase B `e4a13673` on `staging` branch

---

## Env configuration

| Environment | `ALLOY_QUEUE_CHILD_GRAIN_LANES` | Production |
|-------------|----------------------------------|------------|
| **Staging** (`staging.workwithalloy.com`) | `enrollment_completed` | **Do not set** |
| **Production** | unset | unset |
| **Local dev** (optional QA) | `enrollment_completed` in `web/.env.local` | — |

### Vercel setup (staging only)

1. Vercel project → **Settings** → **Environment Variables**
2. Add:
   - **Key:** `ALLOY_QUEUE_CHILD_GRAIN_LANES`
   - **Value:** `enrollment_completed`
   - **Environment:** **Preview** (and/or custom staging target — **not Production**)
3. **Redeploy** staging branch (`staging`) without cache if env was added after last deploy.

**Note:** Vercel CLI was not authenticated in the automation session; env must be confirmed in the Vercel dashboard.

### Rollback

Remove `ALLOY_QUEUE_CHILD_GRAIN_LANES` or clear value → redeploy staging. Enrolled lane reverts to case-grain `opportunities.status_key = enrolled`.

---

## Deploy commit

| Item | Value |
|------|--------|
| Phase B commit | `e4a13673` |
| Phase A commit | `cca53e7a` |
| Branch | `staging` |
| Staging URL | https://staging.workwithalloy.com |

---

## Before / after counts

### SQL preflight (`childGrainPhaseCPreflight.ts`)

Org: `93667019-bd28-49b5-a688-acc9bb1e0a19` · WU: `76b21da2-702e-4439-9002-dc1486e3e105`

| Lane | Case / current path count | OCM / flag path count | Delta |
|------|---------------------------|------------------------|-------|
| **Enrolled** | 0 (`opportunities.status_key=enrolled`) | 0 (`OCM outcome_status_key=enrolled`) | **0** |
| Enrolling (Card 8) | 0 | 0 (broader enrolling set) | 0 |
| Tour | 0 | 0 | 0 |
| Waitlist (Card 6) | 24 candidates | 0 OCM waitlisted ref | — |

**Interpretation:** On this org, Enrolled flip is a **behavior smoke test** (routing + row shape) with **no count change**. Orgs with enrolled children will see count shift from households → OCM tracks.

### QueueService verify (`childGrainPhaseCEnrolledLaneVerify.ts`, `NODE_ENV=test`)

| Metric | Flag unset | `enrollment_completed` | Delta |
|--------|------------|------------------------|-------|
| Enrolled total | 0 | 0 | 0 |
| `ocmrow` in page | 0 | 0 | 0 |
| Bare `opportunity_id` rows | 0 | 0 | 0 |

**Other lanes (new_leads, qualification, tours, enrollment_offers, waitlist):** all **0 → 0** (no delta).

### Sample rows

No `ocmrow:` or case enrolled rows on sample org. When data exists, expect:

```
ocmrow:{opportunity_id}:{ocm_id}
_queue_row_context.row_subject.subject_type = "child"
drawer_open.active_subject.stage_key = "enrolled"
```

---

## QA results

### Automated / API

| Check | Result |
|-------|--------|
| Preflight script | **Pass** — counts recorded above |
| Lane verify script (flag toggle) | **Pass** — Enrolled delta 0; other lanes delta 0 |
| Staging site HTTP | **200** — https://staging.workwithalloy.com |
| QueueService path with flag | OCM builder engaged for `enrollment_completed` when env set (code review + verify script) |

### Manual UI (operator sign-off pending)

Use enrollment pipeline work unit on staging after Vercel env + redeploy:

| Check | Expected | Sign-off |
|-------|----------|----------|
| Enrolled rows `ocmrow:*` | When OCM enrolled data exists | ☐ |
| Count = OCM enrolled tracks | Not households when children differ | ☐ |
| Queue card child subject line | Phase B honest context | ☐ |
| Placement when `location_id` set | On card / context | ☐ |
| Drawer opens case shell | `entity_id` = opportunity | ☐ |
| Focus strip + `subject_highlight` | Child enrolled context | ☐ |
| Lifecycle rail **Enrolled** stage | Stage override | ☐ |
| Related children summary | Siblings not in lane | ☐ |
| Lead / Qualification / Tour unchanged | Case-grain counts | ☐ |
| Enrolling still Card 8 | Not Phase A enrolling builder | ☐ |
| Waitlist still Card 6 | 24 candidates on dev org | ☐ |

**Local dev:** `web/.env.local` may already include `ALLOY_QUEUE_CHILD_GRAIN_LANES=enrollment_completed` for UI QA against shared Supabase.

---

## Rollback verification

| Step | Result |
|------|--------|
| Unset `ALLOY_QUEUE_CHILD_GRAIN_LANES` locally | `childGrainPhaseCEnrolledLaneVerify.ts` shows same counts (0/0 on sample org) |
| Code path | `resolveOcmEnrollmentTrackLaneContext` returns null → case-grain opportunity query for Enrolled |
| Staging rollback | Remove env in Vercel + redeploy |

---

## Bugs / fixes in this sprint

| Item | Action |
|------|--------|
| `attachQueueRowContextToItems` referenced flag without import on intermediate commit | Fixed in Phase B `e4a13673` |
| Verify script: multiple `enrollment_pipeline` WUs | Use `.limit(1)` |
| Verify script: `unstable_cache` outside Next | Run with `NODE_ENV=test` |
| Vercel env not set by automation | **Manual Vercel dashboard step required** |

---

## Safe to keep enabled on staging?

**Yes** — for `enrollment_completed` only:

- No count delta on empty Enrolled orgs (smoke-safe).
- Other lanes unchanged in verify script.
- Rollback is env-only, no migration.
- Phase B already provides honest UI on existing grain rows.

**Do not** add `all`, `tours`, or `enrollment_offers` until next preflight/flip.

---

## Recommended next lane

**Enrolling** — only after staging count diff for `enrollment_offers` (Card 8 vs Phase A enrolling disposition superset) on an org with enrolling OCM data. Then **Tour**.

---

## Tooling

```bash
cd web
source .env.local
npx tsx scripts/childGrainPhaseCPreflight.ts
NODE_ENV=test npx tsx scripts/childGrainPhaseCEnrolledLaneVerify.ts
```

---

## Related

- [`child_grain_queue_conversion_design.md`](../child_grain_queue_conversion_design.md) §13
- [`work-unit-surface-context-contract.md`](../../system/work-unit-surface-context-contract.md)
