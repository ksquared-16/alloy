# Forms Runtime Test 2A — Missing submitted intake in UI (debug)

**Status:** Root cause found + fix shipped (May 2026)  
**Scope:** Visibility only — no runtime submit changes.

---

## Symptom

Test 1C/1D submissions exist in DB (verified via psql + service-role script) but operator could not see them on `/adminV2/forms`.

---

## Audit — how the UI loads submissions

| Surface | Client | API |
|---------|--------|-----|
| **Workload hub** | `FormsHubClient` | `GET /api/admin/forms/submissions?limit=200` |
| **Form inbox** | `FormSubmissionsClient` | `GET /api/admin/forms/submissions?form_definition_id={id}&limit=200` |
| **Submissions tab** | `FormsSubmissionsHubClient` | same org-wide list |

**Server path:** `getAdminContextCached()` → `ctx.orgId` → `createAdminClient()` (service role) → `dbListSubmissions(supabase, orgId, filters)`.

### Filter checklist

| Check | Result |
|-------|--------|
| org_id filter | **Yes** — `.eq("org_id", ctx.orgId)` — **must match session org** |
| form_id filter | Only on form-scoped routes |
| status filter | Optional query param; UI does not pass it |
| date filter | **None** |
| CRM FK exclusion | **None** |
| Lane exclusion in API | **None** — lanes are client-side only |
| Same DB as verification | **Yes** — `web/.env.local` → Supabase project `ikaxilmwmrmbagoidedu` |
| RLS on admin API | **Bypassed** — service role; scoped by `ctx.orgId` in code |
| Caching | No route cache; React `cache()` on auth per request only |

---

## Verification output (Alloy Bend org)

**Org:** `7803388d-cdee-4afb-89cf-23a137f39423` (Alloy Bend)

| Submission | org_id | form_id | status | Lane |
|------------|--------|---------|--------|------|
| **1C** `c5e2e078-…` | Alloy Bend | medication demo | submitted | **needsReview** |
| **1D** `50ac6911-…` | Alloy Bend | medication demo | submitted | **recentlySubmitted** |

`dbListSubmissions` returns **4 rows** including both test IDs (script: `web/scripts/diagnoseFormsSubmissionVisibility.ts`).

**Direct URLs (local):**

- Test 1C: `/adminV2/forms/e68e0160-3157-44fd-b207-2c0f14d1764f/submissions/c5e2e078-97ee-4e17-9d66-1527a9f0c46b`
- Test 1D: `/adminV2/forms/e68e0160-3157-44fd-b207-2c0f14d1764f/submissions/50ac6911-5887-4934-9ae8-a221d61f81f6`
- Form inbox: `/adminV2/forms/e68e0160-3157-44fd-b207-2c0f14d1764f/submissions`

---

## Root causes

### 1. Primary — workload filter stuck on **Forms** after async load (UI bug)

`IntakeWorkspaceHubView` initialized `activeFilter` from `useState(() => defaultIntakeWorkspaceFilter(counts))` on **first mount while `submissions=[]`**.

Default with empty counts → **`forms`** catalog pill.

When submissions loaded, **`activeFilter` did not update** → operator saw form definitions, not intake rows.

Test 1C/1D were loaded but hidden behind the wrong pill.

**Fix:** `useEffect` syncs to `recommendedFilter` after load unless user manually picked a pill.

### 2. Secondary — prior OI-4 gap (already fixed)

`recentlySubmitted` lane had no **Recent** workload pill — Test 1D only visible on Submissions tab / form inbox, not main workload **Review** pill.

### 3. Tertiary — org mismatch (operational)

If session org ≠ Alloy Bend, API returns **0 rows** (correct behavior). Medication demo form also lives only in Alloy Bend org.

**Mitigation:** Operator notes now show **active org id** + submission count when expanded.

### 4. Silent submission fetch failure (fixed)

`FormsHubClient` previously set `submissions=[]` when `subRes.ok` was false without surfacing error.

**Fix:** throw on failed submissions fetch like forms fetch.

---

## Expected UI after fix

| Row | Workload pill | Form inbox lane |
|-----|---------------|-----------------|
| Test 1C | **Review** | Needs review |
| Test 1D | **Recent** | Recently submitted |

Both sorted newest-first (`submitted_at` desc).

---

## Manual re-check

1. Log into **Alloy Bend** org (expand Operator notes on `/adminV2/forms` — org should start with `7803388d`).
2. Open `/adminV2/forms` — should land on **Review** pill with Test 1C.
3. Click **Recent** — Test 1D visible.
4. Open form inbox URL — both in lane sections.
5. Open direct detail URLs — case file loads.

Run diagnostic:

```bash
cd web && set -a && source .env.local && set +a && npx tsx --tsconfig tsconfig.json scripts/diagnoseFormsSubmissionVisibility.ts
```

---

## Related

- [forms_intake_inbox_operationalization.md](./forms_intake_inbox_operationalization.md)
- [forms_runtime_test_2_submission_review_finalize.md](./forms_runtime_test_2_submission_review_finalize.md)
