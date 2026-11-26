---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Briefing for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (slice P1S) — the owner's single cutover plan for the first promotion, not doctrine. Nothing here authorizes a live action. Revised 2026-11-25 (second Development Lead review; owner decisions D1–D11).
---

# Environments and promotion — first-promotion briefing (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P1S. This is **one cutover
plan** for the first promotion of staging's code to production, written for a single owner approval. It applies the
owner's settled decisions **D1–D11** and nothing else. It builds on the
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

**No setting value appears here.** Where a step says what to set, it names the value the code defines (`production`, `1`,
"the production origin") or says where to copy it from ("staging's value"). Credentials stay in the platforms and in the
owner's own secret store.

## The plan in one paragraph

First, ALY-14 E1–E4 and a small W-17 retirement migration go into staging, and the candidate is rebuilt from the new
staging head (D1, D10). Production moves to a **new** Supabase project in AWS `us-west-2`, built from nothing by applying
the full migration chain as P4 rehearsed (D2), through a narrow **first-promotion mode** of the release tool that keeps the
normal owner approval and the tamper-evident audit (D9). The **existing production project (`vslwnntzzgpnmrpjipat`) is not
changed in any way** and is the rollback target (D2). Its org is not a real tenant, so nothing is read or carried from it,
and no tenant exists before the operation (D3). Production runs staging's clock, `pg_cron` + `pg_net` (D4), and copies
staging's flag values (D6). The W-17 self-test org is retired (D5, D10). Only after production verifies, Firefly is created
and configured from a reviewed configuration-only allowlist export, with no household or person data, in one recorded
step run from the Mac mini operator session with the owner present (D7, D11). The operation runs on **Tuesday 1 December
2026, 09:00–12:00 PT (17:00–20:00 UTC)**, owner present with Vercel, Render and Supabase (D8).

## Settled owner decisions

These are decisions, not open questions, assumptions or missing information. Nothing below re-asks them.

| ID | Decision | Where it lands |
|---|---|---|
| **D1** | Integrate ALY-14 E1–E4 into staging first, then rebuild the candidate | **Step 1** (the first operation step), then step 2. P4's candidate `ea06c21f3401` is retired |
| **D2** | New Supabase project in `us-west-2`, rebuilt as rehearsed in P4; the existing project is left unchanged as rollback | Steps 5 and 9 (§4); rollback §7. Region matches the `pdx1` functions (checklist A.1) |
| **D3** | The current production org is not a real tenant; no tenant is created before the operation | Nothing is read or carried from the old project. Steps 1–15 create no tenant. Closes P3 **B1** |
| **D4** | Match staging's clock: `pg_cron` + `pg_net` | Steps 12–14 (§5.4). Vault URL, then Vault credential, unconditionally |
| **D5** | Retire W-17 | Carried out by D10; checked in steps 9, 15 and 16 |
| **D6** | Mirror staging's flag values | Step 6 copies every F key staging sets, at staging's value; step 10 enters them; the drawer-strip pair is set explicitly (§5.5) |
| **D7** | After production verifies, create and configure Firefly from the reviewed configuration-only allowlist export. No customers, leads, contacts, children, records, transactions or other household or person data | Step 16, only after step 15 passes (§5.6) |
| **D8** | Tuesday 1 December 2026, 09:00–12:00 Pacific; owner present with Vercel, Render and Supabase | The times in §3 |
| **D9** | Add a narrow first-promotion mode to the release tool, tested offline, preserving the normal approval and the tamper-evident audit | Built before the window (M3); used at steps 7–9, 15 and 17 (§4) |
| **D10** | Retire W-17 through a small migration, run through staging with E1–E4, and the same file chain to production | Written and merged to staging in step 1 (M2); applied in version order in step 9 |
| **D11** | The tenant helper plus the configuration-only Firefly import is **one recorded step** after production verifies. It runs from the Mac mini operator session during the window, with the owner present. The owner does not type commands. The transcript is recorded. It is **not** an agent run against production | Step 16 (§5.6) |

## 1. Prerequisites that must close before the window

Each is something the plan needs that **does not exist yet**. None is closed by this document, and none may be reported
closed without the evidence in the last column. Any open row at 09:00 is a no-go (step 7).

| ID | Missing | Why it blocks | Evidence today | Closed when, by whom |
|---|---|---|---|---|
| **M1** | **ALY-14 E1–E4 are not on `staging`.** All 19 commits whose message names ALY-14 are on this branch only: E1 `2e2f0acf8`, `d0bccd81d`; E2 from `a092757a1` (with `456fcafff`, `583156942`); E3 from `a31cc8294` to `9d194f40c` (including `2ac3bccd3`, `3376e5618`, `f4d0b3a50`); E4 `4972595ae`. None of the four anchors is an ancestor of `origin/staging` | D1. `ALLOY_ENVIRONMENT` and its fail-closed outbound guard exist only because of E1 | `staging-integration-check.txt` | Step 1: staging `/api/build-info` serves the merge. Developer; the push is an authorized action |
| **M2** | **No W-17 retirement migration exists.** No committed file sets `_w17_selftest_%` orgs to `retired` | D10. `check-production` fails on an unretired self-test org (`release-lib.mjs:429`); production may only receive migrations staging ran (`release-lib.mjs:149`) | P4 F3; `rebuild/w17-removal-trial.txt` (a plain delete fails on `document_category_in_use`; `status='retired'` works) | Step 1: the migration is merged with E1–E4 and staging's W-17 org reads `retired`. Developer |
| **M3** | **The release tool has no first-promotion mode.** `plan` over an empty ledger is **blocked** (`contract_not_last`, 45 contract files among 557, the first `20260329210000`), and `production.preflight` expects production to serve the old `main` on the project named in `release-config.json` | D9. Without it, `prepare` writes no manifest, so `approve`, `emit-apply`, `record` and the hash-chained audit have nothing to bind | `plan-empty-ledger-p4-candidate.json`; P6 procedure *Limits* | The mode is committed with offline tests (`npm run test:release-procedure`) and rehearsed non-live. Developer, before step 5 |
| **M4** | **`release-config.json` names the old production project** (`vslwnntzzgpnmrpjipat`) | Every check against production after cutover must expect the new ref (`checkBuildInfo` compares `supabaseProjectRef`) | `scripts/release/release-config.json`; `alloy-release.mjs:73` (`--config` overrides the file for one run) | Step 5: a config copy naming the new ref in the release directory. The committed file follows in the next release |
| **M5** | **No production tenant helper exists.** The only org-creation paths are the dev helper `web/lib/dev/createOrgAndAssignAdmin.ts` (used by `web/scripts/ensureSharedQaTenant.ts`) and `/api/admin/dev/create-org`, which needs `DEV_TENANT_SPINUP_ENABLED`, a key that must never be set on production (checklist X row) | D11. Step 16 cannot create the Firefly org without it | P4 F6 | A reviewed helper, committed and tested offline, that creates one org and nothing else, without that key. Developer and Database Engineer, before step 6 |
| **M6** | **No green CI run on the rebuilt candidate.** P6 step 2 requires each `required_checks` entry to succeed on the candidate SHA; the check names still need confirming against real check-runs (P6 owner action 4) | Staging verification cannot pass without it | P4 *Integration through a pull request*; P6 owner action 4 | Step 4. Developer; the push and PR are authorized actions |
| **M7** | **No read-only role on any project; the new project's backup/PITR tier is not chosen** (P6 owner actions 5–6) | Observations need a read path that cannot write; after step 16, backups are the new project's only recovery | P6 owner actions 5–6 | Step 5. Owner in Supabase |
| **M8** | **The configuration-only allowlist export and its import do not exist.** P3 R1 requires re-authoring through the app's write paths from a reviewed configuration-only listing, never a row dump; the repo's only Firefly configuration capture is defective (P3 C14); several Firefly configuration counts were never observed on hosted staging (P3 C2, C13, C14, C16: BLOCKED on STG-CENSUS) | D7, D11. Step 16 has nothing reviewed to import | P3 §C, R1 | The export and the import procedure exist and are approved by the Development Lead and the Database Engineer (step 6) |
| **M9** | **The candidate fails `release identify` as committed** (§2) | P6 step 1 is a hard gate | `identify-p4-candidate-no-allowance.json` (exit 1) | Step 2: `identify` exits 0 **with no `--allow-tree-diff`** |
| **C-…** | Dashboard-only reads: C-FLAG-1, C-CLOCK-1, C-MSG-1, C-O-1, C-RB-1/2/3, C-REN-1/2 (§6) | Each is an input a step needs | Not readable from the repository | Steps 6–7. Owner |

## 2. The `release identify` gate and the workflow difference (M9)

**Measured, offline, on P4's candidate** (`refs/candidates/aly-14-p4-staging-to-main`, `ea06c21f3401`, against
`origin/staging` `8321949771f7` and `origin/main` `bbfbec76d779`):

| Command | Exit | Result | Evidence |
|---|---|---|---|
| `release identify --candidate <ref>` | **1** | `candidate tree differs from staging's outside the allowed paths: .github/workflows/vacilando-tier2.yml` | `identify-p4-candidate-no-allowance.json` |
| the same with `--allow-tree-diff .github/workflows/vacilando-tier2.yml` | 0 | Fast-forward; 557 migrations | `identify-p4-candidate-with-allowance.json` |

**The facts.** P4's `build-candidate.sh` takes staging's tree except that file, where it keeps main's retired copy (main's
copy drops the Vacilando nightly `schedule:`; staging's still has it; `environments-p4-evidence-2026-11-25/candidate/staging-to-candidate.diff`).
The gate (`release-lib.mjs:146-148`) fails on any tree difference not named by `--allow-tree-diff` on the command line
(`alloy-release.mjs:74`), and `release-config.json` has no allowance. So, as committed, identify **fails** on a candidate
built this way. This plan does not treat the difference as accepted, and it does not use `--allow-tree-diff`.

**Resolution (a prerequisite, not a choice).** Step 1's staging merge also brings main's retired
`.github/workflows/vacilando-tier2.yml` to staging. Staging then loses only a `schedule:` block that never fired off the
default branch (`deployment-and-environments.md:128`, `:131-133`; the Vacilando lanes are retired), and keeps
`workflow_dispatch`. Main's copy is also the only safe one to promote: `main` is the default branch, so staging's copy
reaching `main` at step 11 would start the nightly schedule there (main's file header says the schedule was removed for
exactly that reason). The rebuilt candidate's tree then equals staging's, and identify passes with no allowance. Nothing in
`release-config.json` or `scripts/release/` changes for this.

**Stop condition.** If, at step 2 or step 7, `identify` without `--allow-tree-diff` exits non-zero for any reason, stop.
Do not add the flag, do not edit `release-config.json`; fix staging and rebuild the candidate (back to step 1). If that
cannot happen before 30 November, the operation moves to a later date.

## 3. Ordered steps — the single cutover plan

Steps 1–6 come before the window; 7–17 are the window. **11:20 is the last keep/roll-back decision** before tenant work.

| # | When (PT) | Step | Done when | Who |
|---|---|---|---|---|
| **1** | before 30 Nov | **D1 + D10: integrate into `staging`.** One **merge** of the branch carrying all of E1–E4 (M1), the W-17 retirement migration (M2) and main's retired `vacilando-tier2.yml` (§2). This branch merges into `origin/staging` cleanly (`git merge-tree` exit 0, re-run offline at this revision); it is 8 commits behind staging, so it is a merge that keeps staging's commits, never a reset (`staging-integration-check.txt`). The migration is applied to staging through staging's normal migration path | Staging `/api/build-info` serves the merge; staging CI green; staging's W-17 org reads `retired`; staging's ledger holds the new migration | Developer; the push is an authorized action (CLAUDE.md *Git / deploy*) |
| **2** | before 30 Nov | **Freeze `staging`, rebuild the candidate, identify it.** No merges to staging until 12:00 on 1 Dec (P4 O7). Re-fetch; P4 `candidate/build-candidate.sh <origin/staging> <origin/main>`; `release identify` **without** `--allow-tree-diff` (§2) | New candidate SHA recorded; `main` fast-forwards to it; identify exit 0. Otherwise the §2 stop condition | Developer |
| **3** | before 30 Nov | **Recount and recheck the candidate.** P4 `candidate/migration-counts.sh` (557 plus what step 1 adds, including the W-17 migration as the highest-numbered new file it introduces); no `schedule:` in any candidate workflow; `git grep DrawerSummaryStripBoundary` re-run (§5.5) | Count and head version recorded: this is the list step 9 applies | Developer |
| **4** | before 30 Nov | **Green CI on the candidate (M6).** Push it to a non-deploying branch, open the PR to `main` marked *do not merge* (P4 *Integration through a pull request*); confirm `required_checks` names against real check-runs | Every `required_checks` name has a `success` check-run on the candidate SHA | Developer; authorized push/PR |
| **5** | before 30 Nov | **New Supabase project, `us-west-2`.** Record its ref. Read-only role and backup/PITR tier (M7). Release directory `releases/<date>-<sha12>/` with the config copy naming the new ref (M4). The first-promotion mode (M3) rehearsed non-live against an empty local ledger. **The old project is not touched** | Ref, role, tier, directory and rehearsal output recorded | Owner in Supabase; Developer for the rehearsal |
| **6** | before 30 Nov | **Collect and review.** Into the owner's secret store, not the repo: every F key staging's Vercel Preview scope sets, **with its value**, and the drawer-strip pair's staging behaviour (D6, §5.5); staging's clock ticking (C-CLOCK-1); staging's Render cron (C-MSG-1); O-row values (C-O-1); production's current Vercel deployment id and Render values and deploy (C-RB-1, C-RB-2). The tenant helper (M5) and the allowlist export with its import procedure (M8) are approved by the Development Lead and the Database Engineer, and written as the step-16 command list | Every §6 row marked; both reviewers' approval recorded | Owner, Developer, Development Lead, Database Engineer |
| **7** | 09:00 | **Go/no-go**: M1–M9 closed with evidence. Then **candidate identification** (P6 step 1) after a fetch, no allowance; **staging verification** (P6 step 2): staging serves the head the candidate was built from, on `ikaxilmwmrmbagoidedu`; check-runs green; ledger equals the candidate's migrations; tenancy passes. **Production before**: `/api/build-info` serves `main` on the old project; C-RB-1 and C-RB-2 re-read | All M closed; identify exit 0; staging passes; production unchanged | Owner, Developer |
| **8** | 09:25 | **Owner approval** (P6 step 4) through the first-promotion mode's manifest (D9) | Approval recorded in the audit chain; P6 TTL (4 h default) covers the window | Owner |
| **9** | 09:30 | **Schema apply on the new project** (§4), then the census (§4 item 6) | Census passes by 10:30, or hold | Developer through the release tool; owner present |
| **10** | 10:30 | **Platform settings.** Supabase §5.1; Vercel Production scope §5.2 (with the D6 flags and the drawer-strip pair); Render §5.3, saved without deploying. If C-REN-2 shows that saving Render's environment redeploys the service, Render's values move to step 11 and are saved immediately before its Render deploy, so the old backend never runs against the new project. `NEXT_PUBLIC_*` before step 11's build | §5.1–5.3 rows set and re-read | Owner in the dashboards |
| **11** | 10:45 | **Release** (P6 step 7). `git ls-remote origin main` equals step 2's base; fast-forward `main` to the candidate, never `--force`; poll production `/api/build-info` until it serves the candidate on the **new** ref; then deploy Render on the candidate commit. This first `main` deploy also registers the `web/vercel.json` Vercel Cron (§5.4) | Both services serve the candidate | Developer; owner in Render |
| **12** | 11:00 | **Vault `scheduled_work_wake_url`** in the new project = the production origin + `/api/scheduled-work/wake` (§5.4). Unconditional | Secret present, names the production origin | Owner in Supabase |
| **13** | 11:03 | **Vault `scheduled_work_wake_credential`** = production `INTERNAL_CRON_TOKEN`, after step 12 reads back correctly (§5.4). Unconditional | Secret present | Owner in Supabase |
| **14** | 11:05 | **Observe the clock** (§5.4): the `pg_cron` tick reaches production; Vercel Cron calls are refused | `wake_count` advances; 2xx from production in `net._http_response`; no staging target | Developer |
| **15** | 11:10 | **Production verification** (P6 step 8): §8 post-checks; `release check-production --stage final --config <new-ref config>`. **11:20: keep, or roll back now (§7)** | All §8 rows pass | Owner decides |
| **16** | 11:25 | **D7 + D11: create and configure Firefly, one recorded step.** From the Mac mini operator session, owner present, transcript recorded: the tenant helper (M5) creates the Firefly org, then the reviewed configuration-only import (M8) runs, then the §5.6 checks. The owner does not type commands. Not an agent run against production. Only after step 15 passed. If it cannot finish by 11:50, stop; production stays verified with no tenant, and step 16 moves to a later session | §5.6 checks pass; transcript in the release directory | Owner present; the operator at the Mac mini session |
| **17** | 11:50 | **Record** (P6 step 10): evidence and the step-16 transcript into the release directory; `verify-audit`. 12:00 window closes; staging freeze lifts | Directory complete; `verify-audit` exit 0 | Developer |

The apply is not timed by any record (P4's 29 s was a local container). If step 9 has not passed by **10:30**, hold.
Production still serves the old build on the old project, so holding costs nothing but the date.

## 4. Step 9: the schema on the new project (D2, D9)

P4 rebuilt a working database from nothing: **557/557** migrations, in version order, one transaction per file with its
ledger row, no edits (P4 *Results*). Step 9 does the same against the new project, through the first-promotion mode (D9):

1. **What the mode must do (M3's acceptance).** Accept an empty ledger only for a project whose ledger is empty; waive
   `contract_not_last` only in that case (the chain runs in version order, item 5); check the **new** ref through the
   `--config` copy (M4); and keep everything else as in a normal release: `prepare` writes the manifest, the owner's
   `approve` binds it, `emit-apply` prints each file's `wrapMigrationForApply` text (`release-lib.mjs`), `record` and
   `verify-audit` keep the hash-chained audit. It is tested offline with the rest of `scripts/release/tests/`.
2. **Platform schemas first.** A hosted Supabase project already has `auth` and `storage`, the precondition P4 F1 found (the
   chain fails on a bare database at `20260912010000` and `20261207181600`). Do **not** run P4's GoTrue and Storage
   migrators against a hosted project.
3. **Ledger table.** If `supabase_migrations.schema_migrations` is absent, create it as P4 step 4 did (`version`,
   `statements`, `name`).
4. **Apply.** Every committed file of the rebuilt candidate, ascending version, as role `postgres` over the **session pooler
   (port 5432, not 6543)** (checklist C.2; P6 owner action 5), each with `psql --single-transaction` and its `ON_ERROR_STOP` variable on, and
   its ledger row in the same transaction. Not `supabase db push` (P6 *Ground rules*). The W-17 migration (D10) runs in its
   place in the chain, after `20260912010000` creates the self-test org.
5. **Why expand/contract order does not apply.** P6 runs destructive files after the new code because an old build reads the
   same database. The new project serves nothing until step 11, so the chain runs in version order. That is the one waiver
   the mode makes, and only for an empty ledger.
6. **Census**, read-only, with P6's `LEDGER_SQL`, `FINGERPRINT_SQL`, `ORGS_SQL` (`release-lib.mjs`):
   - the ledger equals the candidate's versions; `rls_disabled` is 0;
   - the fingerprint equals **hosted staging's**, taken in the same window (P4's rebuilt fingerprints are a reference, not
     the gate);
   - orgs: exactly one, the `_w17_selftest_<hex>` org, with status `retired` (D10). Zero ZZ Alloy QA orgs and zero
     `f17e0000-…` ids (the QA tenants and the Firefly seed come from scripts and `supabase/seed`, not migrations);
   - `scheduled_work` holds `clock_activation_certification` (P4 F8: deliberate; accept);
   - the six required extensions are present and bucket `org_documents` exists (checklist C.1);
   - the table row counts, kept as the baseline step 16 compares against.
7. **Stop rule.** If a file fails, stop. It left nothing (single transaction), and nothing user-facing has changed. Hold;
   fix forward with a new candidate (back to step 1), or delete the new project and recreate it.

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
- **F rows**: every key from step 6's copy of staging, at staging's value, plus the drawer-strip pair set explicitly
  (§5.5).
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

**The documented design.** The clock interface is the wake endpoint, not the mechanism
(`deployment-and-environments.md:107-111`). Staging's clock is an external scheduler (`:113-114`), which is `pg_cron` +
`pg_net` in its database (`:129`, installed by `20261002120000` and `20261003120000`). Production may use the same contract
(`:116-117`). Two clocks are safe, because a duplicate wake converges on `(scheduled_work_id, due_at)` (`:119-121`). Vercel
Cron never registered on staging, because staging is `VERCEL_ENV=preview` and `main` carries no `vercel.json` (`:127`).
D4 means production runs the same single clock: `pg_cron` + `pg_net`.

**What the new project has after step 9.** The chain installs job `scheduled-work-clock` (`*/5 * * * *`). It posts to the
Vault secret `scheduled_work_wake_url`, **falling back to `https://staging.workwithalloy.com/api/scheduled-work/wake`**
when that secret is absent (`supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:48`, rescheduled with the
same fallback at `20261003120000_scheduled_work_clock_dual_header.sql:38-39`). It sends `scheduled_work_wake_credential` as
both `Authorization: Bearer` and `x-cron-token` (`20261003120000:41-44`), and sends nothing while that secret is absent
(P4 F7). Until step 13 the job is inert.

**Step 12 — Vault URL, always, and first.** Create `scheduled_work_wake_url` = the production origin +
`/api/scheduled-work/wake`. Pass: the secret reads back as the production origin. This is unconditional. Without it,
step 13 would send production's credential to staging every five minutes (`20261002120000:48`; P4 F7/H3/O5).

**Step 13 — Vault credential, always, and second.** Create `scheduled_work_wake_credential` = production's
`INTERNAL_CRON_TOKEN`. The route admits it on `x-cron-token` (`web/app/api/scheduled-work/wake/route.ts:45-53`). Never
before step 12 has passed. Using `INTERNAL_CRON_TOKEN` keeps the credential independent of `CRON_SECRET`.

**The Vercel Cron that the first `main` deploy registers, and how duplicate scheduling is prevented.** `web/vercel.json`
declares a cron on `/api/scheduled-work/wake` every five minutes. `main` has no `vercel.json` today, so step 11's deploy is
the first Production deployment carrying one, and **Vercel registers that cron then**. Vercel Cron sends
`Authorization: Bearer $CRON_SECRET`, and only when `CRON_SECRET` is set; the route admits a bearer only against a
non-empty `CRON_SECRET` (`route.ts:46-48`). So with **`CRON_SECRET` unset on production** (§5.2), every Vercel Cron call is a
401 and wakes nothing, and `pg_cron` + `pg_net` is the only clock that wakes production, exactly as on staging. If the
Vercel project's settings allow disabling Cron Jobs, do so at step 10 as well, which removes the 401s; either way
`CRON_SECRET` stays unset (C-CLOCK-2). This is consistent with the design: if a stray wake were ever authorized, `:119-121`
says it would converge rather than double-execute, but the plan does not rely on that.

**Step 14 — observe.** Within ten minutes of step 13, on the new project: `scheduled_work_clock.last_wake_at` and
`wake_count` advance; `net._http_response` shows a 2xx; no request targets staging. Vercel's cron log, if any, shows 401s.
A config file is not evidence (`deployment-and-environments.md:133-135`).

### 5.5 Flags: copy staging's values (D6)

**Every F key staging sets, at staging's value.** For each class **F** key (68 web keys, checklist A.2) that staging's
Vercel **Preview** scope sets, production's **Production** scope gets **staging's value**. A key staging leaves unset stays
unset, except the drawer-strip pair below. The values live only in the Vercel dashboard (C-FLAG-1), so step 6 copies them
key by key into the owner's secret store, and step 10 enters them. The 34 `NEXT_PUBLIC_*` flags must be in place before
step 11's build. This is a copy, not a decision.

**Set explicitly: `DRAWER_SUMMARY_STRIP_BOUNDARY` and `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY`.** These are the only F
keys whose unset default differs by environment, so leaving them unset would not mirror staging. The readers are
`featureFlag.ts:283-291` (`readFlag(process.env.DRAWER_SUMMARY_STRIP_BOUNDARY, …)` at `:287`,
`readFlag(process.env.NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY, …)` at `:291`); unset takes the default (`:10-11`), which is
off for production signals and on for `NEXT_PUBLIC_APP_ENV` `staging` or `VERCEL_ENV` `preview` (`:266-276`). Production
therefore sets **both** keys:

- if staging sets the key, to staging's value;
- if staging leaves it unset, to `1`, staging's default under its preview deployment (`:272-273`).

One nuance, recorded so step 6 reads it rather than assumes it: `VERCEL_ENV` is not inlined into the browser bundle
(`web/next.config.ts` `env` exposes only `NEXT_PUBLIC_BUILD_SHA`), so in the browser staging's unset client default is on
only if staging's `NEXT_PUBLIC_APP_ENV` is `staging`. Step 6 records that value beside the pair. If it is not `staging`,
staging itself reads the client key as on in server code and off in the browser, which no single production value can
copy; the plan still sets `1`, staging's server-side reading, and records the difference. No runtime code calls
either reader today (callers only in `web/tests/`; `drawer-strip-flag-readers.txt`), so neither reading changes what a user
sees now; setting them explicitly keeps production on staging's behaviour if a caller lands. Step 3 re-runs the search on
the rebuilt candidate.

The class **O** business settings (`ALLOY_CANCELLATION_FEE_CENTS`, `ALLOY_CANCELLATION_FEE_WITHIN_HOURS`,
`ALLOY_DEFAULT_BUSINESS_TIMEZONE`, `NEXT_PUBLIC_BOOKING_PATH`) are not flags, so D6 does not cover them (C-O-1).

### 5.6 Firefly: tenant helper and configuration-only import (D7, D11) — step 16

1. **When.** Only after step 15 passes, inside the window, as **one recorded step**: helper, import, checks.
2. **Where and how.** From the Mac mini operator session, with the owner present. The owner does not type commands. The
   session transcript is recorded and filed in the release directory at step 17. It is not an agent run against
   production. The commands are the step-6 list, reviewed in advance; nothing is improvised in the window.
3. **What is created.** The tenant helper (M5) creates the Firefly org and nothing else. The import (M8) then re-authors
   Firefly's **configuration** from the reviewed allowlist export, through the app's write paths (P3 R1), never as a raw row
   copy. The allowlist is drawn from P3 §C's KEEP-CONFIG items.
4. **What is never carried** (D7): customers, leads, contacts, children, records, transactions, or any other household or
   person data (P3 L1–L4, L12: households, guardians, children, cases, participations, tasks, work items, charges,
   agreements, payments, documents and storage objects, threads, messages, outbox, process instances, audit and mutation
   events). Also never: anything from the old project (D3), the ZZ Alloy QA orgs (L5), QA identities and run fixtures (L8,
   L9), demo and seed rows (L10, L11). Provider bindings and merchants are re-provisioned per environment, never
   transferred (P3 C15).
5. **Checks after the import** (all must pass, recorded in the transcript):
   - Firefly's configuration is present: each allowlisted table holds the rows the export names;
   - every table the export classifies as record or transaction holds exactly its step-9 baseline count;
   - orgs: Firefly, plus the `retired` W-17 org (D10), and nothing else; no ZZ Alloy QA org (`release-config.json`
     `tenancy.qa_fixture_orgs`); no `f17e0000-…` seed id.

Nothing else is in this step. Provider bindings, merchants, Auth mail, users and invites are tenant setup that follows it.

## 6. Checklist issues carried forward

Label: **OWNER CHECK** (the owner verifies or sets it, with a pass condition), **SETTLED** (D1–D11 settle it), **N/A** (does
not arise in this operation). Paths are repository-relative.

| ID | Issue | Label | What to do / why | Evidence |
|---|---|---|---|---|
| **I-1** | `scheduled_work_wake_url` falls back to **staging** | SETTLED (D4) + OWNER CHECK | Step 12, always before step 13. Pass: the secret names the production origin, and `pg_net` responses come from production | `supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:48`; checklist C.1, D; P4 F7 |
| **I-2** | Three web signing secrets fall back to `INTERNAL_CRON_TOKEN`, which Render shares | OWNER CHECK | Set `COMMUNICATION_UNSUBSCRIBE_SECRET`, `COMMAND_DESTRUCTIVE_PREVIEW_SECRET`, `DOCUMENT_API_UPLOAD_SECRET`, each a new secret, none equal to `INTERNAL_CRON_TOKEN`. Pass: four distinct values | `web/lib/communications/preferences/unsubscribeToken.ts:82-83`; `web/lib/documents/external/externalDocumentWrites.ts:91`; checklist D |
| **I-3** | Unset defaults differ from staging for the two drawer-summary-strip keys | SETTLED (D6) + OWNER CHECK | §5.5: both set explicitly, staging's value or `1`. Pass: both keys present on Production | `web/lib/layout/featureFlag.ts:266-291`; `drawer-strip-flag-readers.txt` |
| **I-4** | `backend/README_MESSAGES_SENDER.md` lists `TWILIO_FROM_NUMBER`; no backend code reads it | OWNER CHECK | Not carried to production. The README is stale (a follow-up doc fix) | `backend/README_MESSAGES_SENDER.md:13`; checklist E.2 |
| **I-5** | Staging's flag values exist only in the Vercel dashboard (**C-FLAG-1**) | SETTLED (D6) + OWNER CHECK | Step 6 copies every F key staging sets with its value. Pass: every F row marked *staging sets (value copied)* or *staging unset*, and Production matches | checklist E.1, A.2 F rows |
| **I-6** | Platform-only settings with no environment name | OWNER CHECK | Vercel A.1 rows plus Instant Rollback (**C-RB-3**). Render B.1 rows (**C-REN-1** branch and auto-deploy; **C-REN-2** whether saving environment changes redeploys). Supabase C.2 rows | checklist A.1, B.1, C.2; P6 owner actions 5–7 |
| **I-7** | Secret names stored as data (`env:NAME` in binding `secret_ref`; org `vault:` credentials) | N/A for steps 1–16; OWNER CHECK at tenant setup | Bindings are never transferred (§5.6). When they are provisioned: any `env:` key other than `RESEND_API_KEY` or `TWILIO_AUTH_TOKEN` needs that key on both platforms; `vault:` credentials are provisioned per org (P3 B4) | checklist E.3; P3 C15, B4 |
| **I-8** | Provider webhook URLs and signing secrets are set at the providers | OWNER CHECK | Per capability going live: Stripe → `/api/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`); Resend → `/api/webhooks/resend` (`RESEND_WEBHOOK_SECRET`); Twilio → the backend's `/sms/*` and the web status webhook. Pass: none points at staging | checklist E.5 |
| **I-9** | Render schedule for `/internal/messages/process` is not in the repo (**C-MSG-1**) | OWNER CHECK | Mirror staging's: if staging has a Render Cron Job for its backend, production gets one with production's URL and token; if not, none. Pass: recorded; no production job calls staging | checklist B.1; `backend/README_MESSAGES_SENDER.md:61-68` |
| I-10 | `ALLOY_ENVIRONMENT` must be `production` on both runtimes before E1's guard reaches `main` | OWNER CHECK | Step 10, before step 11. Unset, production refuses every real recipient | deployment doc *Promotion order*; checklist D |
| I-11 | One Supabase project for every URL and key, on both platforms | OWNER CHECK | Pass: Vercel `supabaseProjectRef` = new ref; Render `SUPABASE_URL` names the same project | checklist D |
| I-12 | `NEXT_PUBLIC_*` are build-time | OWNER CHECK | Set before step 11; later changes need a redeploy | checklist F.1 |
| I-13 | S and X rows absent on production scopes | OWNER CHECK | §5.2, §5.3 | checklist F.5 |
| I-14 | Function region `pdx1` beside the database | SETTLED (D2) | Check the region at step 5 | checklist A.1 |
| I-15 | Vercel Cron vs `pg_cron` (P4 H2) | SETTLED (D4) + OWNER CHECK | §5.4. **C-CLOCK-1**: staging's clock is ticking (`scheduled_work_clock.last_wake_at` advancing), read at step 6. **C-CLOCK-2**: production `CRON_SECRET` unset (and Vercel Cron Jobs disabled if the dashboard allows), recorded | P4 H2; `deployment-and-environments.md:113-127` |
| I-16 | Production's single org: real tenant or not (P3 B1) | SETTLED (D3) | Not a real tenant. Nothing carried; the old project is not read | P3 B1 |
| I-17 | L rows are per-database ids | SETTLED (D3, D7) | Unset at cutover; set after step 16 only if the legacy routes are used | checklist A.2 L rows |
| I-18 | O business settings (**C-O-1**) | OWNER CHECK | Not flags, so not D6. Carry staging's value only where it is a real business setting; else code default | checklist A.2 O rows |
| I-19 | Supabase Auth mail must deliver in production | OWNER CHECK | §5.1 SMTP, before the first invite | checklist C.2 |
| I-20 | Schema-level settings (extensions, bucket, Vault) | OWNER CHECK | §4 item 6; steps 12–13 | checklist C.1 |

## 7. Rollback

**The P2 snapshot is not the rollback path.** It is a schema-only dump of the old project's `public` schema, with no rows
(P2 *Outcome*). It cannot restore the new project (which starts empty and is built from the chain), and the old project
needs no restoring because D2 leaves it unchanged. Rollback **points production back at the untouched old project**:

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
2. `check-production` fails (ledger, fingerprint versus staging, a table without RLS, a QA or staging-seed org, a
   self-test org not `retired`);
3. `/login` or `/api/build-info` returns 5xx, or the build fails;
4. step 14 does not see a tick within ten minutes, or any `pg_net` request targets staging;
5. the backend `/build-info` does not serve the candidate, or its Supabase project differs from Vercel's.

**Hold, do not roll back**, when step 9 fails (§4 item 7). Nothing user-facing has changed.

**If step 16 fails its checks.** Production is already verified. Stop. Either remove what step 16 wrote (the export names
every row, and the helper created one org), or, if that cannot be shown complete, recreate the new project and repeat from
step 9 in a later session. Rolling back to the old project is not needed for a step-16 failure.

**When the rollback window closes.** Rolling back after step 16 discards only Firefly's configuration, which the reviewed
export can re-apply. It really closes when the first real record (a customer, lead, contact, child or transaction) is
written to the new project. From then on, recovery is the new project's backups/PITR (step 5) and P6's *Data damage* row:
restore into a new project first, then decide, with a new owner approval.

## 8. Pre- and post-checks

**Pre (step 7):** M1–M9 closed with their evidence; step 2's freeze held; `main` unmoved; identify exit 0 with no
allowance; staging verified; production serves old `main` on the old ref; C-RB-1, C-RB-2, C-RB-3, C-REN-1, C-REN-2,
C-CLOCK-1, C-FLAG-1, C-MSG-1, C-O-1 recorded; step 16's command list approved.

**After step 9:** §4 item 6, all of it.

**Step 15, read-only:**

| Check | Pass |
|---|---|
| Vercel `/api/build-info` | candidate SHA, branch `main`, `vercelEnv` `production`, `supabaseProjectRef` = new ref |
| Render `/build-info` | candidate commit |
| `release check-production --stage final`, new-ref config | exit 0 |
| Orgs | only the W-17 org, `retired`; no tenant yet (D3) |
| Clock | step 14 passed; `CRON_SECRET` unset (C-CLOCK-2) |
| Settings | I-2, I-3, I-10, I-11, I-13 re-read after the deploy |
| `/login` | renders. Sign-in is not testable: the new project has no users |
| Old project | unchanged |

**Step 16:** §5.6 item 5.

## 9. Facts, settled decisions, assumptions, missing evidence

**Facts in the repository** (cited where used): the migration chain and its counts (P4); the `pg_cron` job, its staging
fallback and dual header (`20261002120000:48`, `20261003120000:38-44`); the wake route's two credentials (`route.ts:45-53`);
the `vercel.json` cron and its absence on `main` (P4 H2); the clock doctrine (`deployment-and-environments.md:107-135`);
the W-17 org and its delete/retire trial (P4 F3); `check-production`'s acceptance of a `retired` self-test org
(`release-lib.mjs:429`); the identify gate and its measured failure (§2); the drawer-flag readers, defaults and lack of
runtime callers (§5.5); the planner block on an empty ledger (`plan-empty-ledger-p4-candidate.json`); the dev-only org
creation paths (P4 F6); P3's classification of configuration and records.

**Settled by the owner, not assumptions:** D1–D11.

**Assumptions** (believed, not proven from the repository):

- Staging's wake credential equals staging's `INTERNAL_CRON_TOKEN`. Inferred from `20261003120000:3-21` (the bearer-only
  job got 401s). It does not change step 13, which works either way.
- Vercel Instant Rollback reaches the step-7 deployment and keeps its original environment (C-RB-3).
- A hosted project has `auth` and `storage` before the chain runs (P4 F1; true of Supabase projects generally, not
  measured).
- Staging is a Vercel Preview deployment with `VERCEL_ENV` `preview` (`deployment-and-environments.md:127`); the
  drawer-strip `1` rests on it.

**Missing evidence:** M1–M9 and the C-rows (§1). Two items the step-6 reviewers must settle inside the export, because the
§5.6 checks have no single reading without them:

- **Which tables are record or transaction tables.** The chain itself writes rows: P4's rebuilt census shows
  `mutation_events` 5 and `scheduled_work` 2, besides platform catalog tables (`rebuild/rebuilt-row-census.txt`). The
  export names each table as configuration, record/transaction or platform, and the check compares against step 9's
  baseline.
- **Firefly's org id on the new project.** The helper's output names it; the export's rows are bound to it, not to the
  staging id.

## 10. Owner decisions still open

**None of D1–D11 is re-opened here.** One point falls outside them: D11 fixes *where* step 16 runs (the Mac mini
operator session), that the owner is present and does not type, that the transcript is recorded and that it is not an
agent run, but it does not name **who operates the keyboard**. Step 6's command list needs that name on its operator
line. This is the only owner question left; everything else in §1 is work or evidence, not a choice.

## 11. What this briefing does not do

- It authorizes nothing. The P5 owner approval gate is unchanged, and no setting may be changed because this document lists
  it (checklist F).
- No push, PR, merge, deploy or fetch, and no hosted service of any kind. The rebuilt candidate does not exist yet.
- No migration was written (M2), and no change was made to the app, the release tool, `release-config.json` or any
  workflow file (M3, M4, M9). The tenant helper and the export (M5, M8) were not written or run.
