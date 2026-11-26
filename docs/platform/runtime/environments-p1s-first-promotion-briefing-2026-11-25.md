---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Briefing for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (slice P1S) — the owner's runbook for the first promotion, not doctrine. Nothing here authorizes a live action. Revised 2026-11-25 for the Development Lead review.
---

# Environments and promotion — first-promotion briefing (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P1S. This is the ordered runbook
for the first promotion of staging's code to production. It applies the owner's settled decisions D1–D8, and the owner's
instruction for a governed config-only Firefly transfer (§5.6). It builds on the
[settings checklist](environments-p1s-settings-checklist-2026-11-25.md) (P1S), the
[release procedure](../governance/production-release-procedure.md) and its [rehearsal](environments-p6-release-rehearsal-2026-11-25.md) (P6),
the [rebuild rehearsal](environments-p4-rebuild-and-integration-rehearsal-2026-11-25.md) (P4),
[P1](environments-p1-production-census-2026-11-25.md), [P2](environments-p2-production-snapshot-restore-2026-11-25.md),
[P3](environments-p3-staging-classification-2026-11-25.md) and
[deployment and environments](../governance/deployment-and-environments.md).

**How this was written.** From the repository only. No dashboard, service, database, credential or environment dump was
read, and no runtime setting was changed. The offline evidence (git objects and the release tool run on local refs, no
fetch) is in [`environments-p1s-briefing-evidence-2026-11-25/`](environments-p1s-briefing-evidence-2026-11-25/). Refs are
as last fetched on 2026-11-25 10:14 local: `origin/staging` `8321949771f7`, `origin/main` `bbfbec76d779`. They were not
re-fetched.

**No setting value appears here.** Where a step says what to set, it names the value the code defines (`production`, "the
production origin") or says where to copy it from ("staging's value"). Credentials stay in the platforms and in the
owner's own secret store.

## The plan in one paragraph

ALY-14 E1–E4 go into staging first, and the candidate is rebuilt from the new staging head (D1). Production moves to a
**new** Supabase project in AWS `us-west-2`, built from nothing by applying the full migration chain (D2). The **existing
production project (`vslwnntzzgpnmrpjipat`) is left exactly as it is** and is the rollback target (D2). Its org is not a
real tenant, so nothing is carried from it, and no tenant is configured before cutover (D3). Production runs the same clock
as staging, `pg_cron` + `pg_net` in the database (D4). The W-17 self-test org is retired (D5). Production's flags copy
staging's values (D6). Firefly is configured after cutover, by a governed config-only transfer applied after production
verification (D7, §5.6). The operation runs on **Tuesday 1 December 2026, 09:00–12:00 PT (17:00–20:00 UTC)**, with the
owner and the Vercel, Render and Supabase operators present (D8).

## Settled owner decisions

These are decisions, not open questions and not missing information. Nothing below re-asks them.

| ID | Decision | Where it lands in this runbook |
|---|---|---|
| **D1** | Integrate ALY-14 E1–E4 into staging, then rebuild the candidate | Step 1 (the first step), then step 2. P4's candidate `ea06c21f3401` is retired |
| **D2** | New Supabase project in `us-west-2`; the existing project is retained untouched for rollback | Steps 5 and 9 (§4); rollback §7. Region matches the `pdx1` functions (checklist A.1) |
| **D3** | The existing production org is not a real tenant; no tenant before cutover | Nothing is read or carried from the old project. Steps 1–15 create no tenant. Closes P3 **B1** |
| **D4** | Same clock as staging: `pg_cron` + `pg_net` | Steps 12–14 (§5.4). Vault URL, then Vault credential, unconditionally |
| **D5** | Retire W-17 | Step 1 carries the retirement change; checks in steps 9, 15 and 16. The method is open choice **OPEN-B** |
| **D6** | Mirror staging's flag values | Step 6 copies each F flag staging sets, with staging's value (§5.5) |
| **D7** | Configure the Firefly tenant after the cutover | Step 16: governed config-only transfer, only after step 15 passes (§5.6) |
| **D8** | Tuesday 1 December 2026, 09:00–12:00 PT; owner plus Vercel, Render and Supabase operators | The times in §3 |

## 1. Open choices (only these need the owner)

Labelled **OPEN-A/B/C** so they are not confused with D1–D8. Each is a method question inside a settled decision.

| ID | Choice | Options | Recommendation | Needed by |
|---|---|---|---|---|
| **OPEN-A** | How the full schema is applied to the empty new project (D2). P6's planner **blocks** an empty ledger: `contract_not_last`, 45 contract files among 557, the first `20260329210000` (`plan-empty-ledger-p4-candidate.json`). Its preflight also expects the old project ref (M3) | **First-promotion mode**: add an empty-ledger mode to `scripts/release/` that waives `contract_not_last` only for a project with an empty ledger and checks the new ref, rehearsed non-live, so `prepare`, `approve`, `emit-apply`, `record` and the hash-chained audit cover the apply. **Runbook as record**: apply P4's procedure with `wrapMigrationForApply` text (`release-lib.mjs`) per file, and the owner signs a hand-written manifest in the release directory; no tool change, no audit chain | First-promotion mode | Step 7 (the mode must be rehearsed before the window) |
| **OPEN-B** | How W-17 is retired (D5). P4 F3: every rebuild creates `_w17_selftest_<hex>` with status `active` (`20260912010000_w17_additive_role_assignment.sql`), plus 6 role definitions, 158 grants, 10 document categories and 13 document types. A plain delete fails on the `document_category_in_use` guard; `status='retired'` works (`rebuild/w17-removal-trial.txt`) | **Retire by migration**: a guarded migration sets `_w17_selftest_%` orgs to `retired`. Trialled. Passes `check-production` (`release-lib.mjs:429`), but the org row and its dependents stay, so the step-16 check "no W-17 org" is not met as written. **Remove by migration**: a guarded migration scoped to `_w17_selftest_%` deletes the org's own document types, categories, grants and role definitions, then the org. Meets both checks as written. Not yet trialled | Remove by migration | Step 1 (the migration must reach staging with E1–E4: production may only receive migrations staging ran, `release-lib.mjs:149`) |
| **OPEN-C** | How the candidate passes `release identify` (§2) | **Align staging's copy**: step 1's merge also gives staging main's `vacilando-tier2.yml`, so the candidate's tree equals staging's and identify passes with no allowance. **Per-run allowance**: keep the difference and pass `--allow-tree-diff .github/workflows/vacilando-tier2.yml` to `identify` and `prepare`, recorded in the release directory | Align staging's copy | Step 1 |

## 2. Candidate prerequisite: `release identify` and the workflow difference

**Measured, offline, on P4's candidate** (`refs/candidates/aly-14-p4-staging-to-main`, `ea06c21f3401`, against
`origin/staging` `8321949771f7` and `origin/main` `bbfbec76d779`):

| Command | Exit | Result | Evidence |
|---|---|---|---|
| `release identify --candidate <ref>` | **1** | `candidate tree differs from staging's outside the allowed paths: .github/workflows/vacilando-tier2.yml` | `identify-p4-candidate-no-allowance.json` |
| `release identify --candidate <ref> --allow-tree-diff .github/workflows/vacilando-tier2.yml` | 0 | Fast-forward; 557 migrations; tree differs only in that file | `identify-p4-candidate-with-allowance.json`; P6 rehearsal table |

**What this means.** The difference itself is deliberate (P4: main's copy drops the retired Vacilando `schedule`, and
taking staging's copy would re-arm it, because GitHub runs schedules from `main`). But the **gate** (`candidate.identify`,
P6 step 1, `release-lib.mjs:146-148`) only accepts a tree difference that the operator names on the command line.
`release-config.json` has no allowed-path entry, and the tool reads the allowance only from `--allow-tree-diff`
(`alloy-release.mjs:74`). So, as committed, **identify fails on this candidate**, and nothing in the repository records
the exception. The earlier draft of this briefing both called the difference expected and wrote identify's pass condition
with the flag, as if that were the default. That was inconsistent, and is corrected here.

**Resolution.** OPEN-C. With *Align staging's copy*, the rebuilt candidate's tree equals staging's and step 2 passes
identify with no flag. Staging loses a `schedule:` block that never fired off the default branch
(`deployment-and-environments.md:128`, `:131-133`). With *Per-run allowance*, step 2 passes only with the flag, on both
`identify` and `prepare`, and the release directory must record why. Either way, step 2's "done when" is the exit code
actually measured. Nothing was changed in the repository to resolve it.

## 3. Ordered steps

Steps 1–6 come before the window; 7–17 are the window. **11:20 is the last keep/roll-back decision.** After it, only
rollback, or a hold that leaves production verified.

| # | When (PT) | Step | Done when | Who |
|---|---|---|---|---|
| **1** | before 30 Nov | **D1: integrate into `staging`.** One **merge** of the branch carrying E1–E4 (`2e2f0acf8`, `d0bccd81d`, `a092757a1`, `4972595ae`), the W-17 change (OPEN-B, M2) and, per OPEN-C, main's `vacilando-tier2.yml`. This branch merges into `origin/staging` cleanly (`git merge-tree` exit 0); it is 8 commits behind staging, so it is a merge that keeps staging's commits, never a reset (`staging-integration-check.txt`) | Staging `/api/build-info` serves the merge; staging CI green; staging's W-17 org in the OPEN-B end state | Developer; the push is an authorized action (CLAUDE.md *Git / deploy*) |
| **2** | before 30 Nov | **Freeze `staging`, rebuild the candidate, identify it.** No merges to staging until 12:00 on 1 Dec (P4 O7). Re-fetch; P4 `candidate/build-candidate.sh <origin/staging> <origin/main>`; `release identify` (§2) | New candidate SHA recorded; `main` fast-forwards to it; identify exit 0 as OPEN-C defines it | Developer |
| **3** | before 30 Nov | **Recount and recheck the candidate.** P4 `candidate/migration-counts.sh` (557 plus what step 1 adds); no `schedule:` in any candidate workflow; `git grep DrawerSummaryStripBoundary` still shows no caller outside `web/lib/layout/featureFlag.ts` and `web/tests/` (§5.5) | Count and head version recorded: this is the list step 9 applies | Developer |
| **4** | before 30 Nov | **Green CI on the candidate (M6).** Push it to a non-deploying branch, open the PR to `main` marked *do not merge* (P4 *Integration through a pull request*); confirm the `required_checks` names against real check-runs (P6 owner action 4) | Every `required_checks` name has a `success` check-run on the candidate SHA | Developer; authorized push/PR |
| **5** | before 30 Nov | **New Supabase project, `us-west-2`.** Record its ref. Read-only role and backup/PITR tier (M7). Release directory `releases/<date>-<sha12>/` with a config copy naming the new ref (M4). OPEN-A's tool path rehearsed if chosen (M3). The old project is not touched | Ref, role, tier and directory recorded | Owner / Supabase operator |
| **6** | before 30 Nov | **Collect what is copied or restored.** Into the owner's secret store, not the repo: each F flag staging's Vercel Preview scope sets, **with its value** (D6, §5.5); staging's clock is ticking (C-CLOCK-1); staging's Render cron (C-MSG-1); O-row values (C-O-1); production's current Vercel deployment id and Render values and deploy (C-RB-1, C-RB-2). **The Firefly listing** (§5.6) is written and reviewed by the Development Lead and the Database Engineer | Every §6 row marked; listing approved by both reviewers | Owner, operators, Development Lead, Database Engineer |
| **7** | 09:00 | **Go/no-go**, then **candidate identification** (P6 step 1) after a fetch, and **staging verification** (P6 step 2): staging serves the head the candidate was built from, on `ikaxilmwmrmbagoidedu`; check-runs green; ledger equals the candidate's migrations; tenancy passes. **Production before**: `/api/build-info` serves `main` on the old project; C-RB-1 and C-RB-2 re-read | All M closed; identify exit 0; staging passes; production unchanged | Owner, Developer |
| **8** | 09:25 | **Owner approval** (P6 step 4), as OPEN-A decides | Approval recorded; P6 TTL (4 h default) covers the window | Owner |
| **9** | 09:30 | **Schema apply on the new project** (§4), then the census (§4 item 6) | Census passes by 10:30, or hold | Supabase operator, Developer |
| **10** | 10:30 | **Platform settings.** Supabase §5.1; Vercel Production scope §5.2 (with the D6 flags); Render §5.3, saved without deploying where Render allows (C-REN-2). `NEXT_PUBLIC_*` before step 11's build | §5.1–5.3 rows set and re-read | Operators |
| **11** | 10:45 | **Release** (P6 step 7). `git ls-remote origin main` equals step 2's base; fast-forward `main` to the candidate, never `--force`; poll production `/api/build-info` until it serves the candidate on the **new** ref; then deploy Render on the candidate commit. This first `main` deploy also registers the `web/vercel.json` Vercel Cron (§5.4) | Both services serve the candidate | Developer, Render operator |
| **12** | 11:00 | **Vault `scheduled_work_wake_url`** in the new project = the production origin + `/api/scheduled-work/wake` (§5.4) | Secret present, names the production origin | Supabase operator |
| **13** | 11:03 | **Vault `scheduled_work_wake_credential`** = production `INTERNAL_CRON_TOKEN`, only after step 12 is verified (§5.4) | Secret present | Supabase operator |
| **14** | 11:05 | **Observe the clock** (§5.4): `pg_cron` tick reaches production; Vercel Cron calls refused | `wake_count` advances; 2xx from production in `net._http_response`; no staging target | Developer |
| **15** | 11:10 | **Production verification** (P6 step 8): §8 post-checks; `release check-production --stage final --config <new-ref config>`. **11:20: keep, or roll back now (§7)** | All §8 rows pass | Owner decides |
| **16** | 11:25 | **Firefly config-only transfer** (D7, §5.6): apply the reviewed listing, then the post-apply checks. Only after step 15 passed. If it cannot finish by 11:50, stop; production stays verified with no tenant and the transfer moves to a later session | §5.6 checks pass | Developer, Database Engineer, owner |
| **17** | 11:50 | **Record** (P6 step 10): evidence into the release directory; `verify-audit`. 12:00 window closes; staging freeze lifts | Directory complete | Developer |

The apply is not timed by any record (P4's 29 s was a local container). If step 9 has not passed by **10:30**, hold.
Production still serves the old build on the old project, so holding costs nothing but the date.

## 4. Step 9: the schema on the new project

P4 rebuilt a working database from nothing: **557/557** migrations, in version order, one transaction per file with its
ledger row, no edits (P4 *Results*). Step 9 does the same against the new project, by the method OPEN-A picks:

1. **Platform schemas first.** A hosted Supabase project already has `auth` and `storage`, the precondition P4 F1 found (the
   chain fails on a bare database at `20260912010000` and `20261207181600`). Do **not** run P4's GoTrue and Storage migrators
   against a hosted project.
2. **Ledger table.** If `supabase_migrations.schema_migrations` is absent, create it as P4 step 4 did (`version`,
   `statements`, `name`).
3. **Apply.** Every committed file of the rebuilt candidate, ascending version, as role `postgres` over the **session pooler
   (port 5432, not 6543)** (checklist C.2; P6 owner action 5), each with `psql -v ON_ERROR_STOP=1 --single-transaction` and
   its ledger row in the same transaction. The text is `wrapMigrationForApply` (`release-lib.mjs`), which `release
   emit-apply` prints and the P6 rehearsal applied. Not `supabase db push` (P6 *Ground rules*).
4. **Why expand/contract order does not apply.** P6 runs destructive files after the new code because an old build reads the
   same database. The new project serves nothing until step 11, so the chain runs in version order. That is why the planner
   blocks it (M3), and why OPEN-A must handle the block explicitly, not silently.
5. **Stop rule.** If a file fails, stop. It left nothing (single transaction), and nothing user-facing has changed. Fix
   forward with a new candidate (back to step 1), or delete the new project and recreate it.
6. **Census**, read-only, with P6's `LEDGER_SQL`, `FINGERPRINT_SQL`, `ORGS_SQL` (`release-lib.mjs`):
   - the ledger equals the candidate's versions; `rls_disabled` is 0;
   - the fingerprint equals **hosted staging's**, taken in the same window (P4's rebuilt fingerprints are a reference, not
     the gate);
   - orgs: the W-17 org in OPEN-B's end state (absent, or `retired`), and nothing else. Zero ZZ Alloy QA orgs and zero
     `f17e0000-…` ids (the QA tenants and the Firefly seed come from scripts and `supabase/seed`, not migrations);
   - `scheduled_work` holds `clock_activation_certification` (P4 F8: deliberate; accept);
   - the six required extensions are present and bucket `org_documents` exists (checklist C.1);
   - the table row counts, kept as the baseline that step 16's checks compare against.

## 5. Owner-side steps by platform

### 5.1 Supabase (new project only)

| Setting | Value the code expects | Source |
|---|---|---|
| Region | `us-west-2` | D2; checklist A.1 |
| API exposed schemas | `public` | checklist C.2 |
| Authentication → Email provider | enabled, password sign-in | checklist C.2 |
| Authentication → Site URL | the production origin (same as `NEXT_PUBLIC_APP_URL`) | checklist C.2 |
| Authentication → Redirect URLs | `<production origin>/reset-password`, `<production origin>/login` | checklist C.2 |
| Authentication → SMTP | a **delivering** sender for invite and recovery mail, before the first invite (after step 16) | checklist C.2; deployment doc *Supabase Auth mail* |
| Database → pooling | release applies on port 5432 | checklist C.2 |
| Backups / PITR | the tier from step 5 (M7) | P6 owner action 6 |
| Vault | steps 12–13 only (§5.4) | checklist C.1 |

**The old project:** no migration, setting, Vault secret, Auth change or pause. It stays exactly as it is (D2).

### 5.2 Vercel (Production scope)

Set at step 10, **before** step 11. `NEXT_PUBLIC_*` are inlined by `next build` (checklist *How to read*, F.1).

- **R rows** (checklist A.2): `ALLOY_ENVIRONMENT` (`production`); `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL` (the **new**
  project, the same URL in both); `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (new project);
  `NEXT_PUBLIC_APP_URL`; `INTERNAL_CRON_TOKEN` (new, equal to Render's); `INTERNAL_MESSAGES_PROCESS_URL` (the production
  Render service + `/internal/messages/process`); the three signing secrets, each its own (I-2).
- **`CRON_SECRET`: leave unset** (D4, §5.4).
- **C rows** for each capability going live: Stripe, Resend, Twilio, OpenAI, `MARKETING_DEMO_FROM`, Meta pixel. Inert with
  no tenant, but in place before the first tenant send.
- **F rows**: the step-6 copy of staging's flags (§5.5).
- **S and X rows** confirmed **absent** (checklist F.5): `APP_ENV` and `NEXT_PUBLIC_APP_ENV` must not say `staging`;
  `DEV_TENANT_SPINUP_ENABLED` and `ALLOY_CERTIFICATION` must not be set.
- **L rows**: `ALLOY_PUBLIC_ORG_ID` and the three `BOOK_V2_*_STAGE_ID` unset. They are per-database ids; Firefly's ids on
  the new project exist only after step 16, so any legacy-route use is set then. `NEXT_PUBLIC_API_BASE_URL` unset.
- **Project settings** (checklist A.1): Root Directory `web`; Ignored Build Step `bash scripts/vercel-ignored-build.sh`;
  production branch `main`; *Automatically expose System Environment Variables* on.

### 5.3 Render (production backend service)

- **R rows** (checklist B.2): `ALLOY_ENVIRONMENT` (`production`); `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the **new**
  project); `INTERNAL_CRON_TOKEN` (equal to Vercel's).
- **C rows** if SMS/email go live: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`,
  `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL` (the backend's public origin), `PUBLIC_TWILIO_STATUS_CALLBACK_BASE`,
  Resend.
- **S rows absent**: `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SUPABASE_URL`, `VERCEL_ENV`, both staging allowlists.
- **Not carried**: `TWILIO_FROM_NUMBER` (I-4).
- **Service settings** (checklist B.1): `uvicorn backend.main:app`, Python 3.10.5, `pip install -r backend/requirements.txt`.
  No `render.yaml` exists, so the deploy branch and auto-deploy are dashboard-only (C-REN-1).
- **Render cron**: mirror staging's (C-MSG-1), pointed at production's URL and token.

### 5.4 Clock: `pg_cron` + `pg_net`, as on staging (D4) — steps 12–14

**What staging runs.** Staging's clock is the external-scheduler contract (`deployment-and-environments.md:113-114`),
implemented as `pg_cron` + `pg_net` in its database, installed by `20261002120000` and `20261003120000`. Staging is a Vercel
Preview deployment, so it has never registered a Vercel Cron (`deployment-and-environments.md:127`). The clock interface is
the endpoint, not the mechanism (`:107-111`, `:116-117`).

**What the new project already has after step 9.** The chain installs job `scheduled-work-clock` (`*/5 * * * *`). It posts
to the Vault secret `scheduled_work_wake_url`, **falling back to
`https://staging.workwithalloy.com/api/scheduled-work/wake`** when that secret is absent
(`supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:48`, rescheduled with the same fallback at
`20261003120000_scheduled_work_clock_dual_header.sql:38-39`). It sends `scheduled_work_wake_credential` as both
`Authorization: Bearer` and `x-cron-token`, and sends nothing while that secret is absent (P4 F7). So until step 13 the job
is inert.

**Step 12 — Vault URL, always first.** Create `scheduled_work_wake_url` = the production origin +
`/api/scheduled-work/wake`. Pass: the secret reads back as the production origin. This is unconditional: without it, step
13 would send production's credential to staging every five minutes (P4 F7/H3/O5).

**Step 13 — Vault credential, always second.** Create `scheduled_work_wake_credential` = production's
`INTERNAL_CRON_TOKEN`. The route admits it on `x-cron-token` (`web/app/api/scheduled-work/wake/route.ts:45-53`). Never
create it before step 12 has passed. The `INTERNAL_CRON_TOKEN` choice is what makes the credential independent of
`CRON_SECRET` (next paragraph); it is also the arrangement `20261003120000:14-21` records staging converging on.

**The Vercel Cron that the first `main` deploy registers.** `web/vercel.json` declares a cron on `/api/scheduled-work/wake`
every five minutes. `main` carries no `vercel.json` today (`deployment-and-environments.md:127`; P4 H2), so step 11's deploy
is the first Production deployment with one, and **Vercel registers it then**. It does not replace or disable the
`pg_cron` job; the two are independent wake sources for the same endpoint. Vercel Cron sends `Authorization: Bearer
$CRON_SECRET`, and only when `CRON_SECRET` is set; the route admits a bearer only against a non-empty `CRON_SECRET`
(`route.ts:45-48`). With **`CRON_SECRET` unset on production** (§5.2), every Vercel Cron call is a 401 and wakes nothing,
so the only working clock is `pg_cron` + `pg_net`, exactly as on staging. The doctrine also says two clocks would be safe
(at-least-once delivery, convergence on `(scheduled_work_id, due_at)`, `deployment-and-environments.md:119-121`), so a
stray authorized Vercel wake would not corrupt work; but it would no longer be staging's arrangement, so it is not the
plan. The 401s are expected noise. If the Vercel operator can disable the project's Cron Jobs, that removes them too;
either way `CRON_SECRET` stays unset (C-CLOCK-2).

**Step 14 — observe.** Within ten minutes of step 13, on the new project: `scheduled_work_clock.last_wake_at` and
`wake_count` advance; `net._http_response` shows a 2xx; no request targets staging. Vercel's cron log, if any, shows 401s.
A config file is not evidence (`deployment-and-environments.md:133-135`).

### 5.5 Flags: copy staging's values (D6)

D6 settles the values: each class **F** key (68 web keys, checklist A.2) that staging's Vercel **Preview** scope sets is set
in **Production** to **staging's value**. A key staging leaves unset stays unset. The values live only in the Vercel
dashboard, so step 6 copies them, key by key, into the owner's secret store; step 10 enters them. This is a copy, not a
decision. The 34 `NEXT_PUBLIC_*` flags must be in place before step 11's build.

**Where unset defaults differ: `DRAWER_SUMMARY_STRIP_BOUNDARY` and `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY`.** They are the
only F keys whose default depends on the environment (every F row's file was searched for `VERCEL_ENV`, `APP_ENV` and
`ALLOY_ENVIRONMENT`; only `web/lib/layout/featureFlag.ts` matched). `readFlag` takes the default when the key is unset
(`featureFlag.ts:10-16`); the default is off for production signals and on for `NEXT_PUBLIC_APP_ENV=staging` or
`VERCEL_ENV=preview` (`:266-276`); the server and client readers are at `:286-287` and `:290-291`. **They do not need
explicit setting to preserve staging's behaviour**, because no runtime code calls either reader: on both `origin/staging`
and this branch the only callers are `web/tests/layout/drawerSummaryStripBoundaryFlag.test.ts`
(`drawer-strip-flag-readers.txt`). A different default changes nothing a user sees. So they follow the D6 rule like every
other F key: staging's value if staging sets one, unset otherwise. Step 3 re-runs the search on the rebuilt candidate; if a
runtime caller has appeared, and staging leaves the key unset, production sets it to `1` to keep staging's effective
behaviour.

The class **O** business settings (`ALLOY_CANCELLATION_FEE_CENTS`, `ALLOY_CANCELLATION_FEE_WITHIN_HOURS`,
`ALLOY_DEFAULT_BUSINESS_TIMEZONE`, `NEXT_PUBLIC_BOOKING_PATH`) are not flags, so D6 does not cover them (C-O-1).

### 5.6 Firefly: the governed config-only transfer (D7) — step 16

The owner's instruction, applied as given:

1. **What moves.** Firefly's **configuration** only, from staging, by a governed transfer defined by an **allowlist** (what
   is carried) and a **denylist** (what never is). Not carried: customer, lead, contact and child records, and every
   transactional record (P3 L1–L4, L12: households, guardians, children, cases, participations, tasks, work items, charges,
   agreements, payments, documents and storage objects, threads, messages, outbox, process instances, audit and mutation
   events). Also never carried: anything from the old project (D3), the ZZ Alloy QA orgs (L5), the W-17 org (L6), QA
   identities and run fixtures (L8, L9), demo and seed rows (L10, L11). The allowlist is drawn from P3 §C's KEEP-CONFIG
   items; provider bindings and merchants are re-provisioned per environment, never transferred (P3 C15).
2. **Review before the window.** The Development Lead and the Database Engineer review and approve the listing (step 6).
3. **Apply only after step 15 verification passes.**
4. **Post-apply checks** (all must pass):
   - Firefly's configuration is present: each allowlisted table holds the rows the listing names;
   - every record and transaction table is empty;
   - no ZZ Alloy QA org (ids in `release-config.json` `tenancy.qa_fixture_orgs`) and no W-17 org (`_w17_selftest_`
     prefix).

Nothing else is in this step. Provider bindings, merchants, Auth mail, users and invites are tenant setup that follows it.

## 6. Checklist issues carried forward

Label: **OWNER CHECK** (the owner or an operator verifies or sets it, with a pass condition), **SETTLED** (D1–D8 settle
it), **N/A** (does not arise in this operation). Paths are repository-relative.

| ID | Issue | Label | What to do / why | Evidence |
|---|---|---|---|---|
| **I-1** | `scheduled_work_wake_url` falls back to **staging** | SETTLED (D4) + OWNER CHECK | Step 12, always before step 13. Pass: the secret names the production origin, and `pg_net` responses come from production | `supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:48`; checklist C.1, D; P4 F7 |
| **I-2** | Three web signing secrets fall back to `INTERNAL_CRON_TOKEN`, which Render shares | OWNER CHECK | Set `COMMUNICATION_UNSUBSCRIBE_SECRET`, `COMMAND_DESTRUCTIVE_PREVIEW_SECRET`, `DOCUMENT_API_UPLOAD_SECRET`, each a new secret, none equal to `INTERNAL_CRON_TOKEN`. Pass: four distinct values | `web/lib/communications/preferences/unsubscribeToken.ts:82-83`; `web/lib/documents/external/externalDocumentWrites.ts:91`; checklist D |
| **I-3** | Flag defaults differ from staging for the two drawer-summary-strip keys | SETTLED (D6) | §5.5: no runtime caller, so the D6 copy rule alone preserves staging's behaviour; step 3 rechecks | `web/lib/layout/featureFlag.ts:266-291`; `drawer-strip-flag-readers.txt` |
| **I-4** | `backend/README_MESSAGES_SENDER.md` lists `TWILIO_FROM_NUMBER`; no backend code reads it | OWNER CHECK | Not carried to production. The README is stale (a follow-up doc fix) | `backend/README_MESSAGES_SENDER.md:13`; checklist E.2 |
| **I-5** | Staging's flag values exist only in the Vercel dashboard (**C-FLAG-1**) | SETTLED (D6) + OWNER CHECK | Step 6 copies each F key staging sets with its value. Pass: every F row marked *staging sets (value copied)* or *staging unset*, and Production matches | checklist E.1, A.2 F rows |
| **I-6** | Platform-only settings with no environment name | OWNER CHECK | Vercel A.1 rows plus Instant Rollback (**C-RB-3**). Render B.1 rows (**C-REN-1** branch and auto-deploy; **C-REN-2** whether saving environment changes redeploys). Supabase C.2 rows | checklist A.1, B.1, C.2; P6 owner actions 5–7 |
| **I-7** | Secret names stored as data (`env:NAME` in binding `secret_ref`; org `vault:` credentials) | N/A for steps 1–16; OWNER CHECK at tenant setup | Bindings are on the denylist (§5.6). When they are provisioned: any `env:` key other than `RESEND_API_KEY` or `TWILIO_AUTH_TOKEN` needs that key on both platforms; `vault:` credentials are provisioned per org (P3 B4) | checklist E.3; P3 C15, B4 |
| **I-8** | Provider webhook URLs and signing secrets are set at the providers | OWNER CHECK | Per capability going live: Stripe → `/api/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`); Resend → `/api/webhooks/resend` (`RESEND_WEBHOOK_SECRET`); Twilio → the backend's `/sms/*` and the web status webhook. Pass: none points at staging | checklist E.5 |
| **I-9** | Render schedule for `/internal/messages/process` is not in the repo (**C-MSG-1**) | OWNER CHECK | Mirror staging's: if staging has a Render Cron Job for its backend, production gets one with production's URL and token; if not, none. Pass: recorded; no production job calls staging | checklist B.1; `backend/README_MESSAGES_SENDER.md:61-68` |
| I-10 | `ALLOY_ENVIRONMENT` must be `production` on both runtimes before E1's guard reaches `main` | OWNER CHECK | Step 10, before step 11. Unset, production refuses every real recipient | deployment doc *Promotion order*; checklist D |
| I-11 | One Supabase project for every URL and key, on both platforms | OWNER CHECK | Pass: Vercel `supabaseProjectRef` = new ref; Render `SUPABASE_URL` names the same project | checklist D |
| I-12 | `NEXT_PUBLIC_*` are build-time | OWNER CHECK | Set before step 11; later changes need a redeploy | checklist F.1 |
| I-13 | S and X rows absent on production scopes | OWNER CHECK | §5.2, §5.3 | checklist F.5 |
| I-14 | Function region `pdx1` beside the database | SETTLED (D2) | Check the region at step 5 | checklist A.1 |
| I-15 | Vercel Cron vs `pg_cron` (P4 H2) | SETTLED (D4) + OWNER CHECK | §5.4. **C-CLOCK-1**: staging's clock is actually ticking (`scheduled_work_clock.last_wake_at` advancing), read at step 6. **C-CLOCK-2**: production `CRON_SECRET` unset (and Vercel Cron Jobs disabled if the dashboard allows), recorded | P4 H2; `deployment-and-environments.md:107-135` |
| I-16 | Production's single org: real tenant or not (P3 B1) | SETTLED (D3) | Not a real tenant. Nothing carried; the old project is not read | P3 B1 |
| I-17 | L rows are per-database ids | SETTLED (D3, D7) | Unset at cutover; set after step 16 only if the legacy routes are used | checklist A.2 L rows |
| I-18 | O business settings (**C-O-1**) | OWNER CHECK | Not flags, so not D6. Carry staging's value only where it is a real business setting; else code default | checklist A.2 O rows |
| I-19 | Supabase Auth mail must deliver in production | OWNER CHECK | §5.1 SMTP, before the first invite | checklist C.2 |
| I-20 | Schema-level settings (extensions, bucket, Vault) | OWNER CHECK | §4 item 6; steps 12–13 | checklist C.1 |

## 7. Rollback

**The P2 snapshot is not the rollback path.** It is a schema-only dump of the old project's `public` schema, with no rows
(P2 *Outcome*). D2 leaves the old project unchanged, so there is nothing to restore it from, and the new project starts
empty. Rollback **points production back at the untouched old project**:

| Layer | Rollback | Precondition (owner check) |
|---|---|---|
| Vercel | **Instant Rollback** to the deployment recorded at step 7. It keeps the environment it was built with (the old project's inlined `NEXT_PUBLIC_SUPABASE_URL` and anon key). Wait until `/api/build-info` serves the old `main` SHA on `vslwnntzzgpnmrpjipat` | **C-RB-1** id recorded. **C-RB-3** Instant Rollback reaches that deployment (on some plans only the immediately previous one: no extra production deploys in the window) |
| Render | Restore the recorded `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_CRON_TOKEN`; roll back to the recorded deploy | **C-RB-2** recorded before step 10 |
| Clock | Delete `scheduled_work_wake_credential` from the **new** project's Vault; the job then sends nothing (P4 F7). The old build carries no `vercel.json` cron | — |
| `main` | Stays at the candidate. Instant Rollback stops new `main` deploys taking production until undone (P6 *Rollback*). Fix forward; never force-push | — |
| New project | Keep for diagnosis, or delete and recreate | — |
| Old project | Nothing to do: never changed | — |

**Roll back when, at the 11:20 decision:**

1. production `/api/build-info` does not serve the candidate on the new ref, or is not `vercelEnv` `production` on `main`;
2. `check-production` fails (ledger, fingerprint versus staging, a table without RLS, a QA, staging-seed or W-17 org not in
   OPEN-B's end state);
3. `/login` or `/api/build-info` returns 5xx, or the build fails;
4. step 14 does not see a tick within ten minutes, or any `pg_net` request targets staging;
5. the backend `/build-info` does not serve the candidate, or its Supabase project differs from Vercel's.

**Hold, do not roll back**, when step 9 fails (§4 item 5). Nothing user-facing has changed.

**If step 16 fails its checks.** Production is already verified. Stop the transfer, and either remove what it wrote (the
listing names every row) or, if that cannot be shown complete, recreate the new project and repeat from step 9 in a later
session. Rolling back to the old project is not needed for a transfer failure.

**When the rollback window closes.** Rolling back after step 16 discards only the transferred configuration, which the
reviewed listing can re-apply. The window really closes when the first real record (a customer, lead, contact, child or
transaction) is written to the new project. From then on, recovery is the new project's backups/PITR (step 5) and P6's
*Data damage* row: restore into a new project first, then decide, with a new owner approval.

## 8. Pre- and post-checks

**Pre (step 7):** M2–M7 closed; step 2's freeze held; `main` unmoved; identify exit 0 as OPEN-C defines it; staging
verified; production serves old `main` on the old ref; C-RB-1, C-RB-2, C-RB-3, C-REN-1, C-REN-2, C-CLOCK-1, C-FLAG-1,
C-MSG-1, C-O-1 recorded; the §5.6 listing approved.

**After step 9:** §4 item 6, all of it.

**Step 15, read-only:**

| Check | Pass |
|---|---|
| Vercel `/api/build-info` | candidate SHA, branch `main`, `vercelEnv` `production`, `supabaseProjectRef` = new ref |
| Render `/build-info` | candidate commit |
| `release check-production --stage final`, new-ref config | exit 0 |
| Orgs | the W-17 org in OPEN-B's end state and nothing else; no tenant yet (D3) |
| Clock | step 14 passed; `CRON_SECRET` unset (C-CLOCK-2) |
| Settings | I-2, I-10, I-11, I-13 re-read after the deploy |
| `/login` | renders. Sign-in is not testable: the new project has no users |
| Old project | unchanged |

**Step 16:** §5.6 item 4.

## 9. Documented, assumed, missing

**Documented in the repository** (cited where used): the migration chain and its counts (P4); the `pg_cron` job, its staging
fallback and dual header (`20261002120000:48`, `20261003120000:38-44`); the wake route's two credentials (`route.ts:45-53`);
the `vercel.json` cron and its absence on `main` (P4 H2); the clock doctrine (`deployment-and-environments.md:107-135`);
the W-17 org and its delete/retire trial (P4 F3); the identify gate and its measured failure (§2); the drawer-flag defaults
and their lack of callers (§5.5); the planner block on an empty ledger (`plan-empty-ledger-p4-candidate.json`); P3's
classification of configuration and records.

**Settled by the owner, not assumptions:** D1–D8 and the §5.6 transfer instruction.

**Assumptions** (believed, not proven from the repository):

- Staging's wake credential equals staging's `INTERNAL_CRON_TOKEN`. Inferred from `20261003120000:3-21` (the bearer-only
  job got 401s). It does not change step 13, which works either way.
- Vercel Instant Rollback reaches the step-7 deployment and keeps its original environment (C-RB-3).
- A hosted project has `auth` and `storage` before the chain runs (P4 F1; true of Supabase projects generally, not measured).

**Missing evidence** (owner-side reads or artefacts that do not exist yet):

| ID | Missing | Closed at |
|---|---|---|
| **M2** | The W-17 change (OPEN-B) is not written. No committed file retires or removes `_w17_selftest_%` | Step 1 |
| **M3** | The release tool has no path for an empty ledger (OPEN-A) | Step 5 |
| **M4** | `release-config.json` names the old project ref; every production check must expect the new one (`--config` overrides for one run; the committed file follows in the next release) | Step 5 |
| **M5** | The §5.6 allowlist and denylist do not exist yet, and P3's Firefly configuration counts are unobserved (P3 C2, C13, C14, C16: BLOCKED on STG-CENSUS) | Step 6 |
| **M6** | No CI run exists on the rebuilt candidate | Step 4 |
| **M7** | No read-only role on any project; the new project's backup tier is not chosen | Step 5 |
| **C-…** | Dashboard-only reads: C-FLAG-1, C-CLOCK-1, C-MSG-1, C-O-1, C-RB-1/2/3, C-REN-1/2 | Steps 6–7 |

Two genuine unknowns that the §5.6 reviewers must settle in the listing, because the checks cannot be decided without them:

- **What counts as a "record or transaction table".** The chain itself writes rows: P4's rebuilt census shows
  `mutation_events` 5 and `scheduled_work` 2, besides platform catalog tables (`rebuild/rebuilt-row-census.txt`). The
  listing must name each table as configuration, record/transaction, or platform, so "every record/transaction table
  empty" has one reading.
- **Whether the Firefly `orgs` row itself is on the allowlist**, and under which id. Configuration rows need their org, and
  the app has no production org-creation path (P4 F6).

## 10. What this briefing does not do

- It authorizes nothing. The P5 owner approval gate is unchanged, and no setting may be changed because this document lists
  it (checklist F).
- No push, PR, merge, deploy or fetch, and no hosted service of any kind. The rebuilt candidate does not exist yet.
- No migration was written (M2), and no change was made to the app, the release tool, `release-config.json` or any
  workflow file (OPEN-A, OPEN-C, M3, M4).
- The tenant setup after step 16 (bindings, merchants, Auth mail, users) is out of scope apart from the prerequisites it
  inherits (I-7, I-17, I-19).
