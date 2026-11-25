---
owner: platform
status: proposed
last_reviewed: 2026-11-25
supersedes: []
---

# Firefly staging QA profile and runbook (ALY-14 E3)

**Status: proposed — hosted step 1 (read-only census) has run; steps 2–6 have not.** This records the profile E3 asks for, the exact
commands, and what was measured locally. Every step that reads or writes hosted staging needs the
staging service-role credential and changes hosted data, so it waits for an explicit owner go-ahead
*for those steps* and for the decisions in §2. Nothing here touches production or creates a tenant.

**Held at §5 step 0 (2026-11-25, after the Development Lead review).** Neither precondition is met: the
owner has approved the ALY-14 plan but not, in so many words, the hosted steps 1–6 of this runbook, and
§2.1–§2.3 are undecided. Independently, this worker's environment holds no staging connection string or
service-role credential (`$STAGING_DB` and `$TRUSTED_ENV` are not set for it). §8 lists each review finding
and what it now waits on.

**Re-checked at the third and fourth review rounds (2026-11-25): unchanged.** No owner answer to §2.1–§2.3
or go-ahead for steps 1–6 is recorded in this branch or reached this worker, and `$STAGING_DB`,
`$TRUSTED_ENV`, `$SUPABASE_DB_URL` and a staging service-role key are still unset here. The objective's
preview (`127.0.0.1:4412`) is up, but the hosted seed has not been applied, so there are no `[Staging seed]`
rows for step 6 to show. Nothing was run, edited or loosened. Three owner inputs unblock all seven §8 rows:
(1) "go" for steps 1–6, (2) `a` or `b` for §2.1, (3) the operator running steps 1–6 from a shell holding the
staging credential (or handing that credential to the run).

**Owner decisions and step 1 (2026-11-25).** The owner chose **§2.1 (a)**, confirmed the **§2.2** three
logins exactly as §3 names them, and decided **§2.3**: existing older slot logins that already hold Firefly
roles are left untouched and recorded, not deleted. The owner then ran **step 1 only**, from the Mac mini
operator session (`BEGIN READ ONLY`, read-only session); the result is in §6.1. **The runbook stops before
step 2**: step 1 has FAIL rows that are not `firefly_managed_qa_members` (§6.1), so by §5's own rule step 2
may not start until the seed binds to a Firefly department with an active enrollment process, its six
stages and six queues (§6.2, §6.4; the repo's evidence is that hosted Firefly keeps them under key
`lead_management`, not `enrollment`), and no write, identity provision or access change has been prepared or made by this worker.

## 1. The profile

| | |
|---|---|
| Staging school and QA target | **Firefly Early Learning**, org `93667019-bd28-49b5-a688-acc9bb1e0a19` — the existing tenant; no other tenant is created |
| Hosted project | `ikaxilmwmrmbagoidedu` (staging). Production `vslwnntzzgpnmrpjipat` is refused by every tool used here |
| Deployed host | `staging.workwithalloy.com` (Vercel **Preview** scope); deployed QA target key `alloy_staging_web` |
| Synthetic data | the E2 seed — 60 households in the `f17e0000-0000-4000-8000-` namespace ([`firefly-staging-seed.md`](firefly-staging-seed.md)) |
| QA identities | exactly **three** managed identities (§3), provisioned with the installed toolkit |
| Outbound | E1 guard: staging mail and SMS reach only test recipients or the owner allowlist (§4) |

## 2. Decisions this needs first (decided by the owner 2026-11-25: 1 → (a), 2 → the §3 three, 3 → leave and record)

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

   What each answer changes, so it can be given in one word:

   | | (a) slot identities only | (b) every plan |
   |---|---|---|
   | `web/lib/qa/sharedQaRegistry.ts` `FORBIDDEN_QA_ORG_IDS` | stays; its comment *"never a QA target"* is narrowed to *"never a shared-QA plan target; the managed slot identities' staging org"* | Firefly removed; `QA_ORGS` re-pinned to Firefly; `sharedQaSafety.ts`, `ensureSharedQaTenant.ts` and four test files follow |
   | installed toolkit `lib/qa-plan-registry.mjs:55-57` (and its `DEV_QUEUE_ORG_ID` execution-time refusal) | unchanged | a toolkit release — outside this repository and this worktree |
   | [`authorization-qa-personas.md`](authorization-qa-personas.md) §2 | one sentence naming the slot-identity exception | the contract rewritten |
   | ZZ Alloy QA orgs | kept, still the plans' tenant | retired as a target (not deleted — this objective deletes nothing) |
   | Is Firefly "the only staging school/QA target"? | the only **school**; the only target of the managed QA identities. ZZ Alloy QA remains a synthetic, non-school plan tenant | yes, literally |

   The acceptance line "Firefly is the only staging school/QA target" is met literally only by (b). Under
   (a) it is met for the three E3 identities; the owner's answer decides which reading E3 is held to.
   The fence is not edited before that answer: loosening it is the direction that can put QA traffic
   into a tenant with live provider bindings and merchants.
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
households must be visible in their stage lanes and every seeded household, case and child must read
`[Staging seed]` (e.g. `Alder Family [Staging seed]`, `[Staging seed] Alder Family — Ada`,
`Ada Alder [Staging seed]`); a real family's name must not. Search `Staging seed` in the household list:
expected 60 results. Save the screenshots with the run's artifacts.

## 6. Measured so far (2026-11-25)

### 6.1 Hosted step 1 — read-only tenant census (owner, 2026-11-25)

Run by the owner on hosted staging (`ikaxilmwmrmbagoidedu`) from the Mac mini operator session, inside
`BEGIN READ ONLY` in a read-only session, with `supabase/seed/firefly_staging_tenant_census.sql` as
committed on this branch. Nothing was written. The raw output is held by the owner; it is not committed
here (it names member emails). Result as reported: **60 rows, 22 PASS.**

| Verdict | Section | Key | Expected (seed assumption) | Actual (hosted staging) |
|---|---|---|---|---|
| WARN | programs | `north:kindergarten @ North Campus` | `present` | see note 1 |
| WARN | programs | `north:school_age @ North Campus` | `present` | see note 1 |
| FAIL | enrollment | `active_process_id` | `set` | absent (`<none>`) |
| FAIL | queues | `lifecycle_wu_decision` | `active` | absent |
| FAIL | queues | `lifecycle_wu_enrolled` | `active` | absent |
| FAIL | queues | `lifecycle_wu_enrolling` | `active` | absent |
| FAIL | queues | `lifecycle_wu_lead` | `active` | absent |
| FAIL | queues | `lifecycle_wu_tour` | `active` | absent |
| FAIL | queues | `lifecycle_wu_waitlist` | `active` | absent |
| FAIL | process | `stage_decision` | `in active process` | absent |
| FAIL | process | `stage_enrolled` | `in active process` | absent |
| FAIL | process | `stage_enrolling` | `in active process` | absent |
| FAIL | process | `stage_lead` | `in active process` | absent |
| FAIL | process | `stage_tour` | `in active process` | absent |
| FAIL | process | `stage_waitlist` | `in active process` | absent |
| FAIL | qa_identities | `firefly_managed_qa_members` | `3` | **`6`** |

**Hosted managed QA identities are 6, not 3.** Six `qa-slot<N>-…@example.com` accounts already hold a
Firefly role (from earlier runs of the toolkit's access step, whose `DEV_QUEUE_ORG_ID` is Firefly). Owner
decision (§2.3): **leave all six untouched and record them** — no removal, no role change. Which six, and
whether `qa-slot1-product`, `qa-slot5-refactor` and `qa-slot12-work-items` are among them, is in the census's
`firefly_member:<email>` rows (owner-held output); it is not recorded here and is needed before step 3.
Consequence for §5: step 5's `firefly_managed_qa_members = 3` can no longer hold without a removal, which is
refused; that check becomes "the six recorded here plus any of the three not already among them".

Notes, so the record is not over-read:

1. *Program WARNs.* Reported as programs `north:kindergarten` and `north:school_age` at North Campus,
   "present in hosted staging but absent from seed assumptions". Against the census SQL the direction is
   the other way: a `programs` row is WARN only when `actual` is not `present`, i.e. the seed assumes the key
   at the site it binds `north` to (North Campus) and the tenant has no active category with that key there.
   Either reading leaves a seeded North child of that program with its program unbound, which is what WARN
   allows. The `tenant_keys_at_north` INFO row in the raw output settles which; the owner should confirm.
2. *Row count.* The SQL emits 50 fixed rows plus one `firefly_member:` row per member, i.e. **56 data rows**
   for 6 members. 56 + psql's header and `(56 rows)` footer + the `BEGIN`/`ROLLBACK` lines = 60 printed lines,
   so "60 rows" is most likely the line count. The verdicts are consistent with 56: 22 PASS + 2 WARN +
   14 FAIL + 18 INFO. The 22 PASS are, by the SQL, `firefly_org`, `retired_separate_staging_org`,
   `tenant_active_sites` (≥ 3), the three `bound_*` sites, the other 14 program keys,
   `enrollment_department` (= 1) and `shared_qa_accounts_in_firefly` (= 0).
3. *What the FAILs mean.* The Enrollment department exists (PASS), but it has no active process, so no
   process stage exists for any open case, and none of the six open-stage queues exists. Every seeded open
   case would be unbound. `lifecycle_wu_closed*` / `stage_closed*` are INFO by design.
4. *ZZ fence.* `shared_qa_accounts_in_firefly = 0`: no ZZ Alloy QA identity holds a Firefly role.
5. *Which department.* The census (and the seed) bind to the Firefly department keyed `enrollment`.
   Repo evidence says Firefly's published Enrollment process is in a **different** department, keyed
   `lead_management` (§6.4). So these FAILs may describe a process-less `enrollment` department rather than
   a Firefly with no process at all. §6.4 resolves this before anything is written.

### 6.2 What step 1 decides

Step 2 (seed) is **not** run: §5 stops on any FAIL other than `firefly_managed_qa_members`, and thirteen
FAIL rows (`active_process_id`, six queues, six stages) say the department the seed binds to has no process. How Firefly staging should receive
the active enrollment process, its six stages and its six queues is a separate owner decision; the
recommendation and its write footprint are in §6.4. Nothing in it has been prepared as a write or applied.

### 6.3 Local measurements (before step 1)

- Census on the shared local stack (`alloy-cert`, no Firefly): exit 0, 50 rows; `firefly_org absent`
  → FAIL, every binding row FAIL/absent, as it must.
- Census on a throwaway clone (`firefly_seed_scratch_e3census`) after the E2 proof
  `--tenant configured` (52/52 PASS): exit 0 — 28 PASS, 8 WARN, 10 INFO, 0 FAIL. The modelled tenant has
  two sites (`Firefly Main`, `Firefly East`; west wraps to Main) and program keys
  `infant,preschool,toddler` only, so `pre_k`, `school_age` and North `kindergarten` are WARN; the
  Enrollment department, its six `lifecycle_wu_<stage>` units and its six process stages all PASS;
  `lifecycle_wu_closed*` are absent (INFO — closed cases are in no lane). Scratch database dropped.
- These are the repository's *model* of Firefly, not Firefly. (Hosted step 1, §6.1, has since read the
  hosted keys: hosted Firefly has three or more sites but no active process or lifecycle queues.)
- After the `[Staging seed]` marker (seed sha256 `0021a4a78db207a81c6a87093b7e62efe5414a18cf4dc63b34ef78d1ad51f9f4`):
  `npm run staging:seed:firefly -- check` clean; `tests/staging/fireflyStagingSeed.test.ts` 74/74;
  scratch proof on fresh `alloy-cert` clones `firefly_seed_scratch_e3mark_{configured,bare}`: **52/52 PASS,
  0 FAIL in both shapes**; fingerprints `44135fdac203819c62a812f9d7b8ec2b` (configured, this clone) and
  `ae08a864d7cff5370c5d0733ce56f302` (bare); tenant rows (185 / 163) and ZZ rows (329 across 272 tables)
  byte-identical; fence held, tampered copy rolled back (exit 3). Both scratch databases dropped.

### 6.4 How Firefly staging should get its enrollment process, stages and queues: recommendation

**Recommendation: neither (1) nor (2) yet.** The repository cannot show that either is safe, and its
strongest evidence says the configuration may already exist. Run the **read-only department census**
first (below). Option (2) is ruled out on the repo's own constraints. If the census shows hosted Firefly
really has no active Enrollment process, use the **app's own publish path** in the existing department.
That is option (1) with the platform Enrollment template as the reviewed source, not a production export.

**Evidence that the configuration may already be there, under a different key:**

- Hosted staging census of 2026-10-23 (`alloy_deployed_primary` = `ikaxilmwmrmbagoidedu`),
  `certification/business-processes-v2/d2d5/enrollment-decision-config-census.sql.results.json`:
  Firefly's one staged-lifecycle process `enrollment` sits in department key **`lead_management`**. Its
  stages are `lead, tour, decision, waitlist, offered, enrolling, enrolled`, which covers all six the seed
  needs. The `enrollment`-keyed department in that output belongs to QA Shared, not Firefly.
- That department is `3933ac47-077a-4de8-aaac-8aed48d80413` with active process `42be9074-…` (key
  `enrollment`). Sources: `docs/handoffs/one-family-certification-handoff.md:21-22`;
  `docs/product/records-roster-completion/firefly-enrollment-qa-configuration-proposal.md:27-29` (published
  revision 12, 2026-08-13). Five Firefly migrations hard-code that id and only UPDATE it
  (`20260621120000`, `20260621130000`, `20260622150000`, `20260622205001`, `20260724000000`).
- Step 1 still found exactly one Firefly department keyed `enrollment` (PASS), with no active process.
  Its origin is not in the repo.
- `firefly_staging_tenant_census.sql`, `renderSql.ts:297,390`, `verifySql.ts:96,103` and the scratch
  proof's `configured` tenant (`scratchProof.ts:106-120`) all assume `key = 'enrollment'`. The repo's model
  of Firefly therefore has the wrong department key. That is why the local proof went green and the hosted
  census went red.

**Why option (2), seed-created records in the seed's own namespace, is unsafe:**

- `departments` is `UNIQUE (org_id, key)` (`20260329165048_remote_schema.sql:3925`). A seed-namespaced
  second `enrollment` department in Firefly cannot exist beside the tenant's own.
- Adding a process to the tenant's existing department would mean writing a non-seed row. The seed's fence
  (`renderSql.ts:201-280`) refuses that by design: "0 rows changed outside the seed rows".
- `trg_departments_lifecycle_projection_guard` (`20260730130000…write_guard.sql:73-131`) rejects a direct
  change to a non-null `lifecycle_builder_v1` that is not made through the publish write token.
- The seed's own configuration branch writes `new_leads`, `enrollment_pipeline` and `tours`. It never
  writes `lifecycle_wu_<stage>` (`renderSql.ts:350-380`), so it would not satisfy the census either.
- Even with a new key, a second Enrollment process in Firefly would compete with `lead_management`'s
  process for one tenant's cases (D-98's "only one publishing Enrollment" precondition).

**Why a production import, option (1) as literally framed, is not available:** the repo has no reviewed
production export and no importer. `docs/sprints/active/assets/firefly-config/` is a July 2026 API capture
from a local dev server against an unrecorded database. It is marked "structural only; do not treat as
current state" (`docs/handoffs/bp-config-integrity-handoff.md:331`), and `builder.ts:7-10` refuses it for
its certified defects (a dangling `qualification` target). The brief also forbids copying production data.

**Smallest read-only follow-up (committed, not run on staging):**
`supabase/seed/firefly_staging_department_census.sql`. It returns one row per Firefly department (key, id,
name, active flag, builder present, `active_process_id`, the active process's key and stage keys, latest
published revision, work-unit count) and one per Firefly work unit (department/key, active flag, stage). It
reads configuration only: no names, contacts or amounts. It is `BEGIN READ ONLY … ROLLBACK`. On the local
shared stack it exits 0 (0 rows, since there is no Firefly). Run against the local stack's representative
org it returns 3 departments and 3 work units as expected. Operator command, same shape as step 1:

```bash
psql "$STAGING_DB" -X -v ON_ERROR_STOP=1 -P pager=off -A -F ' | ' \
  -f supabase/seed/firefly_staging_department_census.sql
```

**What its answer decides:**

| Census shows | Next step | Hosted writes |
|---|---|---|
| `lead_management` holds an active `enrollment` process with the six stages, and active `lifecycle_wu_<stage>` units for them | **A repository-only change.** Re-point the census, seed and verification from `key = 'enrollment'` to "the Firefly department whose active process key is `enrollment`". Also make the seed's `seed_enrollment` gate test for that process, not the key, and correct the scratch `configured` model to `lead_management`. Re-prove locally, then re-run step 1. | **none** beyond the already-approved seed rows of step 2 |
| `lead_management` holds the process but some `lifecycle_wu_<stage>` units are missing or inactive | The repo change above, plus the app's own work-unit repair for that department | `public.work_units`: insert/update `lifecycle_wu_<stage>` rows in that department only; may deactivate its `enrollment_pipeline` (`repairLifecycleWorkUnits`, `builderOwnedLifecycleRuntime.ts:247-407`, via `POST /api/admin/lifecycle-catalog/repair-work-units`) |
| No Firefly department has an active Enrollment process | Publish through the app into **one** existing Firefly department chosen by the owner. Source: the platform Enrollment template (`buildEnrollmentTemplateStageRecords`; the builder's `apply_enrollment_v2_template` action, `lifecycle-builder/route.ts:973-980`, which needs a process already in the draft), reviewed as a draft diff. Order: `saveDraft`, `validateBusinessProcessForPublish`, then `POST /api/admin/business-process/configuration/publish` (RPC `publish_business_process_revision_v1`, `20260810220000_restore_business_process_publish_guarded_write.sql`). Then run the work-unit repair. | `business_process_drafts`; `business_process_revisions` (one new revision); `workflow_events`; `configuration_publications`; the one `departments.metadata.lifecycle_builder_v1` (guarded write); then `public.work_units` × 6 `lifecycle_wu_<stage>` (plus `work_views_v1` inside the published process, whose `compat_queue_key` must match `lifecycle_<stage>`) |

**How the write paths stay inside Firefly:** each takes one `department_id` and one `org_id`, and runs as a
Firefly admin session: the publish RPC selects the department `WHERE id = p_department_id AND org_id = p_org_id` and raises otherwise (`20260810220000…:67-70`), and `repairLifecycleWorkUnits(supabase,
orgId, departmentId)` writes only `work_units` rows of that department. No path touches `orgs`, another
tenant, ZZ Alloy QA, auth or storage. Proof would be the same census before and after: step 1, this census,
and the seed doc's ZZ row-count comparison.

**Before any write in rows 2–3 (none prepared here):**

- **Owner approval.** An explicit go for a *configuration* write in Firefly staging. A publish creates a
  revision that real Firefly staff using staging will see. The go names the department id and the
  reviewed draft diff.
- **Who executes.** Who runs it, and as which Firefly admin session. A managed QA identity would need
  steps 3–4 first; an owner-held admin session would not.
- **Environment.** The deployed staging head carries `20260810220000` and the repair route (check
  `/api/build-info`). §4 is set and recorded (outbound guard; capture-only SMTP). `ALLOY_ENVIRONMENT=staging`
  is set on both staging runtimes.
- **The census above has run and is recorded here.**

## 7. Known gaps

- **Only step 1 has run on staging** (read-only, §6.1): no seed apply, identity or access change. Steps
  2–6 are the work left, after the enrollment process/stages/queues exist (§6.4) and §4 is set.
- **Six managed identities already hold Firefly roles**, not three (§6.1). They stay, by owner decision;
  E3's "exactly three" now reads as "these three are provisioned; the earlier six are recorded, not removed".
- **Synthetic households are now visibly labelled, but not yet seen in the UI.** Every name the app
  shows on its own carries `[Staging seed]`: `customers.name` (`Alder Family [Staging seed]`),
  `opportunities.name/title` (`[Staging seed] Alder Family — Ada`) and `customer_members.display_name`
  (`Ada Alder [Staging seed]`). Guardians keep plain names; they appear inside their household. This is
  the E2 dataset change the first version of this profile recommended: re-rendered (seed sha256
  `0021a4a7…`), unit-tested (a rendered script with any unmarked `'<Name> Family'` fails), and re-proven
  in-database (§6). Confirming it on screen is step 6, which needs the hosted seed.
- **The repo's toolkit copy is behind the installed one.** `scripts/local-dev/vac-qa-access-assign.mjs`
  lacks the QA-person step; the runbook uses the installed copy, which is what would run.
- **Role breadth.** The three identities are full Firefly admins over a tenant with real provider
  bindings. Outbound safety then rests entirely on §4 being set.

## 8. Development Lead review (2026-11-25) — status per finding

| Finding | Status | Waits on |
|---|---|---|
| Run §5 steps 1–6 on hosted staging | step 1 **run by the owner** (read-only, §6.1); **held before step 2** | step 1's FAIL rows: the `enrollment`-keyed department has no process/stages/queues; read-only department census (§6.4), then the owner's choice of row; §4 set and recorded |
| Make seeded households visibly distinguishable, then confirm in the UI | **done in the dataset** (§7, §6); UI confirmation **not done** | hosted seed (step 2), then step 6 |
| Resolve the Firefly fence per §2.1 | **(a) chosen**; implemented as the narrowed `sharedQaRegistry.ts` comment and one personas §2 sentence; `FORBIDDEN_QA_ORG_IDS` and every refusal unchanged | — |
| Firefly is the only staging school/QA target | under (a): the only school; target of the managed identities only | steps 3–5 |
| Exactly three managed identities documented and provisioned | the three confirmed (§3); **not provisioned**; six earlier managed identities already in Firefly, kept and recorded (§6.1) | the six emails from the owner-held census output; steps 3–5 |
| Compare hosted site/program/queue keys with the seed | **done** (§6.1): sites PASS, two North program WARNs, process/stage/queue FAILs | §6.4 decision |
| Synthetic households identifiable in the UI | labelled in data; not seen on screen | step 6 |

Once the go-ahead and §2 answers exist, steps 1–6 are one session: the census output decides whether any
binding needs a seed change before step 2 (a `WARN` is acceptable, a `FAIL` stops it), and step 5's census
plus step 6's screenshots close the last four rows.

