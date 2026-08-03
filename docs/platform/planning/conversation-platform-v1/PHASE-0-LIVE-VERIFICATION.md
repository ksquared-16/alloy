---
title: Phase 0 — Live Verification Evidence
status: verified
date: 2026-07-30
environment: Supabase project `ikaxilmwmrmbagoidedu` (the tenant every managed worktree writes)
method: read-only psql via DATABASE_URL, `SET default_transaction_read_only = on`
---

# Phase 0 — Live Verification Evidence

**Method.** All queries executed against the live tenant inside a `default_transaction_read_only = on` session. **No writes, no DDL, no migrations applied.** Query text is reproducible from `scratchpad/p0verify.sql` and `p0verify2.sql`.

---

## 0. Headline: the environment is pre-production, which re-ranks Phase 0

| Signal | Live value |
|---|---|
| Orgs with documents | **1** |
| `communication_threads` | **6** (1 org) |
| `communication_messages` | **7 total** — 6 outbound (2 sent, 2 delivered, 2 failed), 1 inbound |
| `communication_templates` | **1** |
| `announcements` | **0** |
| `communication_preferences` rows | **0** |
| `communication_preference_events` rows | **0** |
| `field_values` for `communication_opt_out` | **0 rows — the field has never been set for anyone** |
| `persons.metadata` with `email_opt_in`/`sms_opt_in` explicitly `false` | **0 / 0** |
| `communication_messages` whose `body` contains `{{` | **0** |
| `communication_identity_grants` | **0** |
| `documents` | 73 rows, 1 org |
| `storage.objects` in `org_documents` | 107 |

### This materially corrects my discovery framing

In the discovery report I wrote *"Today: an opted-out person keeps receiving messages, and replying STOP changes nothing."* That was an accurate statement about the **code path** and it remains true. It was **not** an accurate statement about the **live environment**, and I should have qualified it.

**Verified: nobody is opted out anywhere in this tenant** — zero `communication_preferences` rows, zero `communication_opt_out` field values, zero explicit `opt_in:false` metadata. **No person is currently receiving communications against a recorded preference. No raw-token message has ever been delivered.** Total outbound volume across the tenant's life is six messages.

P0-1, P0-2 and P0-3 are therefore **latent defects, not active harm**. They are exactly the right things to fix now — before real families are loaded — but the urgency is "must land before production volume," not "we are violating TCPA today."

**P0-4 is the exception and is the inversion of my earlier ranking: it is broken in production right now.** Detail in §2.

---

## 1. P0-2 — Storage and signed-URL authorization

### 1.1 Bucket visibility — **PRIVATE**

```
      id       |     name      | public | file_size_limit | allowed_mime_types
---------------+---------------+--------+-----------------+--------------------
 org_documents | org_documents | f      |                 |
```

`public = false`. The discovery report's worst case — *"if that bucket is public in any environment, every tenant's documents are enumerable"* — is **disproven for this environment**. There is exactly one bucket and it is private. No size limit and no MIME allowlist are configured at the bucket level, so those remain application-layer concerns only.

### 1.2 Storage RLS — **enabled, and fail-closed**

```
 relname | rls_enabled | rls_forced
---------+-------------+------------
 buckets | t           | f
 objects | t           | f

policies on schema `storage`: (0 rows)
```

RLS is **enabled** on both `storage.objects` and `storage.buckets`, and there are **zero policies**. With RLS on and no permissive policy, PostgREST/`anon`/`authenticated` receive **no rows at all**. Only `service_role` (which bypasses RLS) can read.

**This is accidentally the correct posture.** The discovery finding "zero Storage RLS in the repository" was true of the *repo* and I inferred risk from it; the live database is fail-closed regardless, because no policy means no access rather than open access.

> **Conclusion, per your direction:** live verification does **not** demonstrate that a broad storage redesign is necessary. **Phase 0 will not perform one.** What Phase 0 will do is (a) fix the application routes, (b) re-path the non-conforming objects, and (c) add an explicit `storage.objects` deny-by-default policy + a bucket-visibility assertion test so this posture becomes *intentional and enforced* rather than *incidental*.

### 1.3 Path convention — 6 verified violations

```
   bucket_id   | first_seg_is_uuid | objects
---------------+-------------------+---------
 org_documents | f                 |       6
 org_documents | t                 |     101

   bucket_id   | first_segment | objects
---------------+---------------+---------
 org_documents | vendors       |       6
```

Six objects are stored under `vendors/…` with **no `{org_id}/` prefix**, exactly as predicted from `web/lib/vendors/publicVendorApplication.ts:352-353`. Per the earlier finding these paths carry insurance certificates and driver's licenses, and they are written by the **unauthenticated** `web/app/api/vendor-application/route.ts`.

All 73 rows in `public.documents` **do** satisfy the convention:

```
 path_prefix_matches_org | count
-------------------------+-------
 t                       |    73
```

Note the arithmetic: **107 storage objects vs 73 `documents` rows → 34 objects are not tracked in `documents`** (the 6 vendor objects plus 28 others). Any policy or lifecycle rule written against `documents` alone will not cover them.

### 1.4 The actual defect — application layer, intra-org

`web/app/api/admin/documents/[id]/signed-url/route.ts` verified in full:

- `getAdminContextCached()` → the only check is `if (!ctx.ok)` (`:10-16`)
- `createAdminClient()` — **service role, bypasses the `documents` RLS entirely** (`:21`)
- Row fetch **is** org-scoped: `.eq("id", id).eq("org_id", ctx.orgId)` (`:25-26`)
- `createSignedUrl(path, 600)` — 10-minute URL (`:54`)

`getAdminContextCached` returns `ok:true` for **any** caller with an org-role bundle, deriving a compatibility `role` from `roleKeys` (`lib/admin/getAdminContext.ts:50-52`); it returns 403 only when there is no org membership at all.

**Verified severity: HIGH, and specifically an intra-organization privilege-escalation, not a cross-tenant or public exposure.**

- ❌ **Not** cross-org — `.eq("org_id", ctx.orgId)` holds the tenant boundary
- ❌ **Not** publicly enumerable — bucket private, storage RLS fail-closed
- ✅ **Yes** — any authenticated member of an org, including the lowest-privilege role, can mint a 10-minute unauthenticated URL for **any** document in that org by guessing or enumerating a document id, bypassing the `documents` RLS that restricts SELECT to `owner|admin|ops|manager`
- ✅ **Yes** — no relationship/record scope: a member with access to one child can read another child's documents
- Live blast radius today is bounded by the tenant having a single org and 73 documents

**Three routes share the pattern** (all `createSignedUrl` callers):

| Route | Auth today |
|---|---|
| `app/api/admin/documents/[id]/signed-url/route.ts:10-16` | `ctx.ok` only, org-scoped |
| `app/api/admin/vendors/[id]/documents/signed-url/route.ts:14-15` | `ctx.ok` only |
| `app/api/admin/persons/[id]/profile-photo/route.ts` | to be confirmed during implementation |

---

## 2. P0-4 — `announcement_targets` — **CONFIRMED BROKEN IN PRODUCTION**

### 2.1 Live schema is the PKG-05 shape

```
   column_name   |        data_type         | is_nullable |  column_default
-----------------+--------------------------+-------------+-------------------
 id              | uuid                     | NO          | gen_random_uuid()
 org_id          | uuid                     | NO          |
 announcement_id | uuid                     | NO          |
 target_spec     | jsonb                    | NO          | '{}'::jsonb
 resolved_count  | integer                  | YES         |
 created_at      | timestamp with time zone | NO          | now()
```

**`target_type`, `target_ref`, and `rule` do not exist.** Only `announcement_targets_pkey` and the two FKs are present — the B4 CHECK constraint is absent, confirming B4's `CREATE TABLE` never executed.

### 2.2 Both migrations are recorded as applied

```
 20260430254100
 20260619150000   <- PKG-05, created the table (this shape won)
 20260622120000
 20260622123000   <- B4, CREATE TABLE IF NOT EXISTS -> NO-OP
 20260622130000
 20260623130000
 20260623140000
 20260715120000
```

Both `20260619150000` and `20260622123000` are in `supabase_migrations.schema_migrations`. The ledger says "applied"; the schema says PKG-05 won. **This is the predicted `CREATE TABLE IF NOT EXISTS` no-op, now confirmed with evidence rather than inference.** Unlike the templates pair, no repair migration followed.

### 2.3 The live API writes columns that do not exist

`app/api/admin/communications/announcements/[id]/targets/route.ts:78-85` inserts `{org_id, announcement_id, target_type, target_ref, rule}`.

Against this schema that insert fails on three unknown columns, and `target_spec NOT NULL` has no default supplied by the route. Corroborating evidence:

```
announcement_targets row count: 0
announcements row count:        0
```

**Zero rows — nobody has ever successfully saved an announcement target.** The feature is not "dark", it is **broken**, and the 0/0 counts are consistent with it having never worked in this environment.

> **This inverts the discovery ranking.** P0-1, P0-2 and P0-3 are latent. **P0-4 is the only one of the four that is actually broken right now**, and it is also the cheapest to fix.

### 2.4 Migration-replay implication

A **fresh** database replaying `20260619150000 → 20260622123000` in file order reaches the **same** PKG-05 shape, because the `IF NOT EXISTS` guard fires identically. So fresh and existing environments currently converge — on the shape the API does *not* write. The repair must therefore change the schema in **both** directions (fresh + existing), which makes an idempotent, shape-agnostic `ALTER` the correct instrument.

---

## 3. P0-1 — live consent state

```
communication_preferences rows:       0
communication_preference_events rows: 0
field_values(communication_opt_out):  0
persons.metadata email_opt_in=false:  0
persons.metadata sms_opt_in=false:    0
communication_messages.category:      column does not exist
```

**Confirmed:** the `category` column is absent, so `enforceConsentForSend` has no classification input — the discovery finding holds exactly.

**Also confirmed:** no preference truth exists anywhere in this tenant yet. That is good news for urgency and *bad* news for migration planning — there is no existing preference data to migrate, so the "connect the operator-visible toggle to canonical truth" work is a **greenfield wiring job with a zero-row backfill**, not a data reconciliation. Phase 0 should assert that emptiness before writing a backfill, and fail loudly if it is ever non-empty in another environment.

---

## 4. Corroboration of two discovery findings

| Finding | Live evidence |
|---|---|
| `communication_message_recipients` is never INSERTed by runtime | **0 recipient rows** against **6 outbound messages created after the 2026-06-19 backfill.** Confirmed. |
| Identity platform has no write path | **2 identities** (both from the migration backfill), **0 grants.** Confirmed — and because grants fail open, all 2 identities are usable by every operator with `communications.send`. |

---

## 5. Verified severity, restated

| ID | Discovery claim | Verified severity | Change |
|---|---|---|---|
| **P0-4** | High — schema divergence risk | **HIGH — actively broken; feature has never worked** | ⬆ raised, and now the most urgent |
| **P0-2** | Critical — possible public enumeration of all tenants' documents | **HIGH — intra-org privilege escalation via 3 app routes; storage layer is fail-closed** | ⬇ lowered; **no storage redesign warranted** |
| **P0-1** | Critical — active TCPA/CAN-SPAM violation | **HIGH — latent; zero opted-out people exist, so no violation is occurring** | ⬇ lowered in urgency, unchanged in necessity |
| **P0-3** | High — templates ship raw tokens to families | **MEDIUM-HIGH — latent; 0 delivered messages contain `{{`, 1 template exists** | ⬇ lowered |

**Nothing found during verification requires a new architectural decision.** All four repairs stay inside existing canonical ownership boundaries.

---

## 6. Residual questions verification could not answer

1. **Does the Python Resend path send `body` as HTML?** Determines whether missing template escaping is exploitable. Requires reading `backend/app/integrations/resend_client.py` against a real send, not a DB query. Carried into the P0-3 work.
2. **What drives `process-due` and `/internal/messages/process` in production?** Not answerable from the DB. Two `communication_scheduled_sends` rows exist; whether anything would drain them is unknown.
3. **Is open/click tracking enabled in the Resend dashboard?** Out-of-band setting. Affects Phase 4 only.
4. **`persons/[id]/profile-photo` signed-URL auth** — third route in the family; to be read during P0-2 implementation.
