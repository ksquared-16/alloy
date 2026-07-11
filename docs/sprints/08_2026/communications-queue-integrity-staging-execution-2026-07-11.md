# Communications Queue Integrity — Staging Execution Record

**Date:** 2026-07-11  
**Environment:** Firefly Early Learning staging (Supabase project `ikaxilmwmrmbagoidedu`)  
**Deployment SHA:** `5c96efe7963533a11020214f3a831c8150643b3e` (PR #154 merge)  
**Hotfix commit:** `9b4f07a822a6a298e3888abdf5707a8f75140a11`

---

## Promotion

| Item | Value |
|------|-------|
| PR #154 | **MERGED** @ 2026-07-11T00:26:12Z |
| Pre-merge `origin/staging` SHA | `61aefff37` |
| Rebase required | **Yes** (PR #152 landed) |
| Rebased branch SHA | `9b4f07a82` |
| Merge commit | `5c96efe7963533a11020214f3a831c8150643b3e` |
| Final `origin/staging` SHA | `5c96efe79` |

### Pre-merge validation

- Focused queue integrity tests: **35/35**
- `npm run typecheck`: **passed**
- `npm run verify:module-imports`: **passed**
- GitHub CI: Production graph + Full graph **SUCCESS**

---

## Deployment

| Item | Value |
|------|-------|
| Staging app project | `firefly-early-learning` (Vercel) |
| Deployment URL | `https://firefly-early-learning-p99qwmh0s-kellys-projects-2fc9d5eb.vercel.app` |
| Deployed SHA | `5c96efe79635` |
| GitHub deployment status | **success** (Preview – firefly-early-learning) |
| Health | Deployment completed; preview requires Vercel SSO for browser access |

---

## Supabase access

| Item | Value |
|------|-------|
| Method | `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `/Users/Kelly/Alloy/web/.env.local` |
| Alternate | `@supabase/supabase-js` service client (verified) |
| Project ref | `ikaxilmwmrmbagoidedu` |
| Org resolution | `DEV_QUEUE_ORG_ID` from `.env.local` |

No secrets logged in this document.

---

## Organization

| Field | Value |
|-------|-------|
| Org ID | `93667019-bd28-49b5-a688-acc9bb1e0a19` |
| Org name | Firefly Early Learning |
| Locations | 21 site labels (North/South/West Campus, Infant A/B, Toddler 1/2, Preschool 1/2, Pre-K, etc.) |

---

## Audit scope

Total `communication_threads` for org: **6**

### Classification counts

| Classification | Count |
|----------------|------:|
| valid canonical row | 3 |
| valid family with multiple topics | 1 family / 2 topic channels (email + sms) |
| duplicate same-family/same-topic projection | 1 pair (`8f31f723` + `ea450c33`, sms/general) |
| uniquely repairable missing customer linkage | 1 |
| invalid test/demo record | 2 |
| ambiguous participant-to-family linkage | 0 |
| orphaned message | 0 |
| legacy/provider-only record | 1 (`communications_unknown` inbound) |
| inactive/deleted reference | 0 |
| duplicate customer records | 0 |
| cross-tenant-invalid reference | 0 |

### Problem records (sanitized)

| Thread ID | Customer | Entity anchor | Channel | Classification | Resolution |
|-----------|----------|---------------|---------|----------------|------------|
| `d2ef6890-656f-45df-8434-62a1a54e91c4` | `06d52eeb…` Kurzman Family | `persons` / `1624a9ea…` | email | valid canonical row | `person_customer` |
| `8f31f723-671b-4c74-bcea-509328a7a071` | `06d52eeb…` Kurzman Family | `persons` / `1624a9ea…` | sms | valid canonical row (deduped in queue) | `person_customer` |
| `ea450c33-5f2a-4ccc-a322-c15cdbc86d84` | `06d52eeb…` Kurzman Family | `opportunities` / `df771481…` | sms | duplicate same-family/same-topic projection | `opportunity_customer`; 0 messages |
| `4de7b8e8-ef5c-4609-b4b0-0e611dcd4600` | *(repaired)* `06d52eeb…` | `communications_unknown` / provider surrogate | sms | uniquely repairable → **repaired** | `metadata_customer` |
| `cc1fa74c-b685-4029-b2f9-1705649bf9e7` | — | `staging_live_validation` | sms | invalid test/demo record | quarantine |
| `0aa38de2-9d18-4b20-a3c4-f25d8f05ecf3` | — | `staging_live_validation` | email | invalid test/demo record | quarantine |

### Kurzman customer graph

| Record | ID |
|--------|-----|
| Customer | `06d52eeb-42a2-4e63-9454-f1355f3de330` (Kurzman Family) |
| People | `1624a9ea…` (Kelly), `0e850943…` (Kristi) |
| Children | `05cf9138…` (Lennon), `2049414a…` (Wrigley) |
| Opportunity | `df771481…` (open) |

**Kurzman determination:** `ONE FAMILY — MULTIPLE VALID TOPICS`

- One `customer_id` (`06d52eeb…`)
- Post-hotfix queue projects **2 loadable topic rows**: sms (newest inbound) + email
- Duplicate sms/general projection (`8f31f723` vs `ea450c33`) deduped by code; empty older opp thread remains in DB but not in queue
- Pre-hotfix “two Kurzman entries” symptom = duplicate sms/general projection + separate entity anchors (person vs opportunity), not duplicate customers

---

## Queue projection (post-repair simulation)

| Section | Thread IDs | Titles |
|---------|------------|--------|
| All conversations | `4de7b8e8…`, `d2ef6890…` | Kurzman Family, Kurzman Family |
| Needs resolution | `cc1fa74c…`, `0aa38de2…` | Unresolved conversation ×2 |

| Metric | Value |
|--------|------:|
| Distinct families (canonical) | 1 |
| Needs resolution count | 2 |
| Generic `Family` labels | 0 |
| Loadable rows | 2 |

---

## Repairs

### Previewed

1. **Entity reassignment** (`communications_unknown` → `persons`/`1624a9ea…`) — **rejected** by `communication_threads_identity_uq` (`org_id, primary_entity_type, primary_entity_id, channel, recipient_key`).

2. **Metadata `customer_id` stamp** — preview + execute approved.

### Executed

```sql
UPDATE communication_threads
SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('customer_id', '06d52eeb-42a2-4e63-9454-f1355f3de330'),
    updated_at = NOW()
WHERE id = '4de7b8e8-ef5c-4609-b4b0-0e611dcd4600'
  AND org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19';
```

| Field | Value |
|-------|-------|
| Timestamp | 2026-07-11T00:41:52Z |
| Affected rows | 1 |
| Evidence | Same `recipient_key` as person-anchored Kurzman sms threads; person `1624a9ea…` uniquely maps to customer `06d52eeb…` |

### Rollback

```sql
UPDATE communication_threads
SET metadata = metadata - 'customer_id',
    updated_at = NOW()
WHERE id = '4de7b8e8-ef5c-4609-b4b0-0e611dcd4600'
  AND org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19';
```

### Remaining manual-review records

| Thread ID | Reason |
|-----------|--------|
| `cc1fa74c-b685-4029-b2f9-1705649bf9e7` | `staging_live_validation` test anchor |
| `0aa38de2-9d18-4b20-a3c4-f25d8f05ecf3` | `staging_live_validation` test anchor |
| `ea450c33-5f2a-4ccc-a322-c15cdbc86d84` | Empty duplicate sms thread (deduped in queue; optional archive) |
| `8f31f723-671b-4c74-bcea-509328a7a071` | Superseded sms thread after dedupe (optional archive) |

---

## Browser QA

**Status:** Blocked by Vercel SSO on preview URL. Database + projection simulation confirm expected behavior after PR #154 + repair.

### Expected (verified via projection)

- [x] Normal rows loadable (`4de7b8e8…`, `d2ef6890…`)
- [x] Needs resolution section (2 test threads)
- [x] Unresolved rows labeled “Unresolved conversation” (not generic Family)
- [x] Kurzman: 1 family, 2 topics (sms + email)
- [x] Deduped duplicate sms projection
- [ ] Live browser screenshots (requires authenticated Vercel preview session)

---

## Post-repair validation

| Check | Before | After |
|-------|-------:|------:|
| Unresolved in normal queue | 3+ symptoms | 0 |
| Needs resolution | 3 | 2 |
| Loadable Kurzman rows | 2–3 (with dupes) | 2 |
| `metadata.customer_id` on unknown thread | null | `06d52eeb…` |

---

## Recommendation

**STAGING CERTIFIED WITH MANUAL RECORD REVIEW REMAINING**

Code + one deterministic metadata repair certified via staging data and projection replay. Two `staging_live_validation` test threads and two superseded/empty Kurzman sms threads remain for optional human cleanup.
