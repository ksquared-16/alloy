---
owner: platform
status: proposed
last_reviewed: 2026-11-25
supersedes: []
---

# Firefly staging QA profile and runbook (ALY-14 E3)

**Status: proposed — the hosted steps have not run.** This records the profile E3 asks for, the exact
commands, and what was measured locally. Every step that reads or writes hosted staging needs the
staging service-role credential and changes hosted data, so it waits for an explicit owner go-ahead
*for those steps* and for the decisions in §2. Nothing here touches production or creates a tenant.

## 1. The profile

| | |
|---|---|
| Staging school and QA target | **Firefly Early Learning**, org `93667019-bd28-49b5-a688-acc9bb1e0a19` — the existing tenant; no other tenant is created |
| Hosted project | `ikaxilmwmrmbagoidedu` (staging). Production `vslwnntzzgpnmrpjipat` is refused by every tool used here |
| Deployed host | `staging.workwithalloy.com` (Vercel **Preview** scope); deployed QA target key `alloy_staging_web` |
| Synthetic data | the E2 seed — 60 households in the `f17e0000-0000-4000-8000-` namespace ([`firefly-staging-seed.md`](firefly-staging-seed.md)) |
| QA identities | exactly **three** managed identities (§3), provisioned with the installed toolkit |
| Outbound | E1 guard: staging mail and SMS reach only test recipients or the owner allowlist (§4) |

## 2. Decisions this needs first (not made here)

1. **Reversing the Firefly fence.** Three reviewed places say Firefly is *never* a QA target:
   `web/lib/qa/sharedQaRegistry.ts` (`FORBIDDEN_QA_ORG_IDS`), the installed toolkit's
   `lib/qa-plan-registry.mjs` (excluded from every plan by id), and
   [`authorization-qa-personas.md`](authorization-qa-personas.md) §2. The reason recorded in the toolkit's
   own evidence (`proveHostedQaTarget`, 2026-11-05): **provider bindings and payment merchants exist for
   Firefly only** on staging, and every email and SMS in the prior 30 days went through a Firefly org
   binding. E3 makes Firefly the QA target; this change leaves those fences as they are, because they
   guard the shared-QA plans (`authz_q1`, `bp_v2`) and the toolkit copy is installed, not edited from here.
   The owner should decide: (a) Firefly is the target **for E3's managed slot identities only** and the
   ZZ Alloy QA plans keep their fence (recommended — it is what the toolkit already does, §3), or
   (b) Firefly replaces ZZ Alloy QA for every plan, which is a re-pin of the personas contract and the
   toolkit registry, not an E3 edit.
2. **Which three identities.** The approved plan says three; it does not name them. §3 proposes three.
3. **Existing members.** The toolkit's access step already targets Firefly (§3), so earlier slot
   identities may already be Firefly admins. "Exactly three" may then need a removal, and this objective
   forbids deleting records. The census (§5 step 1) answers whether it applies.

## 3. The three managed identities

**What the toolkit can provision.** The installed trusted children (`~/bin/alloy-dev/bin/`) accept only a
managed slot alias `qa-slot<N>-<name>@example.com` within the host's slots, never a caller-chosen
address:

- `vac-qa-identity-provision.mjs` creates the auth account (email confirmed, a throwaway password nobody
  holds, `app_metadata.managed_by = alloy`, `purpose = qa`, `environment = staging`), sends no mail, and is
  idempotent (`already_exists`, nothing mutated).
- `vac-qa-access-assign.mjs` grants **only `admin`**, in the org named by `DEV_QUEUE_ORG_ID` in the trusted
  env. **On this host that is Firefly** (`DEV_QUEUE_ORG_ID=93667019-…`, read 2026-11-25). It first creates a
  person fixture *"QA Operator · Slot N"* (`external_source = alloy_qa_fixture`) and links it, then the role
  and a `department_scope = all`, `site_scope = all` access profile. Idempotent.

**Proposed three** (all already configured on this host, `~/.config/alloy-dev/config`):

| Identity | Slot | Why |
|---|---|---|
| `qa-slot1-product@example.com` | 1 | the identity the deployed target `alloy_staging_web` mints sessions for (`deployed-target-registry.mjs`) — required for any hosted session |
| `qa-slot5-refactor@example.com` | 5 | the slot whose Firefly Work Views the access step was built against |
| `qa-slot12-work-items@example.com` | 12 | the Work Items lane identity |

Each is `admin` in Firefly only — one membership, forever (a second membership resolves to no access).
Restricted roles would need toolkit support it does not have (`role_not_permitted`).

## 4. Required runtime configuration (operator-owned, outside this repository)

| Where | Setting |
|---|---|
| Vercel project, **Preview** scope (serves `staging.workwithalloy.com`) | `ALLOY_ENVIRONMENT=staging` |
| Staging backend service (Python dispatcher) | `ALLOY_ENVIRONMENT=staging` |
| Vercel **Production** scope and production backend | `ALLOY_ENVIRONMENT=production` — before the E1 guard reaches `main` |
| Both staging runtimes | `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST` / `_SMS_ALLOWLIST`: owner addresses only, or unset |
| Staging Supabase project `ikaxilmwmrmbagoidedu` | **Authentication → Emails → SMTP Settings → custom SMTP pointed at a capture-only sandbox** (accepts and stores, delivers nothing — e.g. a Mailtrap *Email Testing* inbox). Not Resend/SendGrid/SES; not Supabase's built-in mailer |
| Any operator shell running the seed | `ALLOY_ENVIRONMENT=staging` (the seed refuses a staging apply without it) |

Why the SMTP setting is load-bearing for QA: the public `/forgot-password` page calls Supabase Auth from
the browser with the anon key, so no Alloy guard is on that path
([`deployment-and-environments.md`](deployment-and-environments.md) → *Supabase Auth mail*). The managed
identities are `@example.com` and need no mail (sessions come from the magic-link mint), but Firefly's real
staff accounts share that project. The canonical trusted env (`/Users/vacilando/Alloy/web/.env.local`)
carries no `ALLOY_ENVIRONMENT`; a local server built from it is therefore *restricted*, which is intended.

None of these are verified from here. Record each with who set it and when before step 2.

## 5. Runbook (in order; each step stops the run on a failure)

`$STAGING_DB` is the operator-held staging connection string (never committed or printed);
`$TRUSTED_ENV` is the trusted env file holding the staging URL and service-role key.

**0. Preconditions.** Owner go-ahead for steps 1–6 recorded; §2 decided; §4 set and recorded.

**1. Read-only tenant census** — sites, program keys, Enrollment department, queue work units, process
stages, and which managed QA identities already hold Firefly roles:

```bash
psql "$STAGING_DB" -X -v ON_ERROR_STOP=1 -P pager=off -A -F ' | ' \
  -f supabase/seed/firefly_staging_tenant_census.sql
```

Stop on any `FAIL` other than `firefly_managed_qa_members` (expected `0` before step 4 on a clean
tenant; if it is already above 3, go back to §2.3). `WARN` rows mean a seeded child gets a coarser
binding (fewer than three sites → campuses wrap; a missing program key → that child's program unbound).

**2. Seed** ([`firefly-staging-seed.md`](firefly-staging-seed.md)):

```bash
cd web
npm run staging:seed:firefly -- plan
ALLOY_ENVIRONMENT=staging FIREFLY_STAGING_SEED_DATABASE_URL="$STAGING_DB" \
  npm run staging:seed:firefly -- apply --target staging --confirm-project-ref ikaxilmwmrmbagoidedu
ALLOY_ENVIRONMENT=staging FIREFLY_STAGING_SEED_DATABASE_URL="$STAGING_DB" \
  npm run staging:seed:firefly -- verify --target staging --confirm-project-ref ikaxilmwmrmbagoidedu
```

Required: gate line all `false`; `fence held — … 0 rows changed outside the seed rows`; every check `PASS`;
the same fingerprint after a second `apply`.

**3. Provision the three identities** (installed toolkit; prints metadata only):

```bash
~/bin/alloy-dev/bin/vac-qa-identity-provision.mjs --identity qa-slot1-product@example.com     --env-source "$TRUSTED_ENV" --slot 1  --lane aly14-e3
~/bin/alloy-dev/bin/vac-qa-identity-provision.mjs --identity qa-slot5-refactor@example.com    --env-source "$TRUSTED_ENV" --slot 5  --lane aly14-e3
~/bin/alloy-dev/bin/vac-qa-identity-provision.mjs --identity qa-slot12-work-items@example.com --env-source "$TRUSTED_ENV" --slot 12 --lane aly14-e3
```

Each must print `"ok":true` with `created` or `already_exists`, `occurrences: 1`, `email_sent: false`.

**4. Assign Firefly access** (confirm `DEV_QUEUE_ORG_ID` in `$TRUSTED_ENV` is the Firefly id first):

```bash
~/bin/alloy-dev/bin/vac-qa-access-assign.mjs --identity qa-slot1-product@example.com     --env-source "$TRUSTED_ENV" --slot 1  --role admin
~/bin/alloy-dev/bin/vac-qa-access-assign.mjs --identity qa-slot5-refactor@example.com    --env-source "$TRUSTED_ENV" --slot 5  --role admin
~/bin/alloy-dev/bin/vac-qa-access-assign.mjs --identity qa-slot12-work-items@example.com --env-source "$TRUSTED_ENV" --slot 12 --role admin
```

Each must print `org_id: 93667019-bd28-49b5-a688-acc9bb1e0a19`, `memberships_for_user: 1`.

**5. Re-run the census (step 1).** Required: `firefly_managed_qa_members` = `3`, one
`firefly_member:` row per proposed identity reading `admin`, `firefly_qa_person_fixtures` = 3,
`shared_qa_accounts_in_firefly` = `0`, `seed_rows_already_present` = 60.

**6. UI check.** Sign in to `staging.workwithalloy.com` as `qa-slot1-product` (deployed session for
`alloy_staging_web`), open Firefly's Enrollment lanes and the household list, and screenshot: seeded
households must be visible in their stage lanes and distinguishable from real families (§6).

## 6. Measured so far (local only, 2026-11-25)

- Census on the shared local stack (`alloy-cert`, no Firefly): exit 0, 50 rows; `firefly_org absent`
  → FAIL, every binding row FAIL/absent, as it must.
- Census on a throwaway clone (`firefly_seed_scratch_e3census`) after the E2 proof
  `--tenant configured` (52/52 PASS): exit 0 — 28 PASS, 8 WARN, 10 INFO, 0 FAIL. The modelled tenant has
  two sites (`Firefly Main`, `Firefly East`; west wraps to Main) and program keys
  `infant,preschool,toddler` only, so `pre_k`, `school_age` and North `kindergarten` are WARN; the
  Enrollment department, its six `lifecycle_wu_<stage>` units and its six process stages all PASS;
  `lifecycle_wu_closed*` are absent (INFO — closed cases are in no lane). Scratch database dropped.
- These are the repository's *model* of Firefly, not Firefly. **The hosted keys have not been read.**

## 7. Known gaps

- **Nothing hosted has run**: no census, seed apply, identity or access change on staging. Steps 1–6 are
  the work left, after §2 and §4.
- **Synthetic households are not visibly labelled.** They are marked in data (tree surnames such as
  "Alder Family", `@firefly-staging.invalid` emails, `555-01XX` phones, `external_source =
  firefly_staging_seed`, `metadata.seed`), but the household list shows only the name, and "Alder Family"
  reads like a real family. Recommended: a visible marker in the seeded household name (e.g.
  `Alder Family (staging seed)`), which is a dataset change to E2 — re-render, re-prove, new fingerprints.
  Not changed here; it was not confirmed in the UI either, because nothing is seeded on staging yet.
- **The repo's toolkit copy is behind the installed one.** `scripts/local-dev/vac-qa-access-assign.mjs`
  lacks the QA-person step; the runbook uses the installed copy, which is what would run.
- **Role breadth.** The three identities are full Firefly admins over a tenant with real provider
  bindings. Outbound safety then rests entirely on §4 being set.
