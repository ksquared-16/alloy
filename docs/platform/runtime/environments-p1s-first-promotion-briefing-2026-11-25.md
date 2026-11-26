---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Briefing for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (slice P1S) — the owner's single cutover plan for the first promotion, not doctrine. Nothing here authorizes a live action. Revised 2026-11-25 (third Development Lead review; owner decisions D1–D11, D8 timing as the earliest feasible approved window). Revised 2026-11-27 (slice RO1): M7's backups are daily, kept 7 days, with no PITR (owner, 2026-11-26), and the read-only role has a script. The ordered, timed form for the step-6b approval is the B4 final cutover plan.
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

**The final plan.** Slice B4 rehearsed the whole operation locally and ordered this briefing into one timed list for the
step-6b approval: the [final cutover plan](environments-final-cutover-plan-2026-11-26.md) (it replaces the [2026-11-25 plan](environments-b4-final-cutover-plan-2026-11-25.md) and carries the owner's window and other decisions of 2026-11-25), with its evidence in
[`environments-b4-dress-rehearsal-evidence-2026-11-25/`](environments-b4-dress-rehearsal-evidence-2026-11-25/) and the second run's
[`environments-b4-dress-rehearsal-evidence-2026-11-26/`](environments-b4-dress-rehearsal-evidence-2026-11-26/). Its one
correction to this briefing is step 16's census baseline (§5.6.1 16.6 and 16.R, §7).

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
staging's flag values (D6). The W-17 self-test org is retired by a migration that staging runs first (D5, D10). Only after
production verifies, the **existing** org helper creates Firefly and Firefly's reviewed configuration-only allowlist export
is imported, with no customer, lead, child, person or transactional data, as one recorded step run from the Mac mini
operator session with the owner present (D7, D11). The operation runs in the **earliest feasible three-hour window** after
every prerequisite has closed, the reviews are recorded and the owner has approved this plan in its final form; weekends
are allowed, and the owner is present with Vercel, Render and Supabase (D8). No calendar date is fixed in this document.

## Settled owner decisions

These are decisions, not open questions, assumptions or missing information. Nothing below re-asks them.

| ID | Decision | Where it lands |
|---|---|---|
| **D1** | **Decided.** Integrate ALY-14 E1–E4 into staging first, then rebuild the candidate | **Step 1** (the first operation step), then step 2. P4's candidate `ea06c21f3401` is retired |
| **D2** | **Decided.** New Supabase project in `us-west-2`, rebuilt as rehearsed in P4; the existing project is left untouched as the rollback target | Steps 5 and 9 (§4); rollback §7. Region matches the `pdx1` functions (checklist A.1) |
| **D3** | **Decided.** No tenant exists before the operation; the current production org is not a real tenant | Nothing is read or carried from the old project. Steps 1–15 create no tenant. Closes P3 **B1** |
| **D4** | **Decided.** The same clock setup as staging: `pg_cron` + `pg_net` | Steps 12–14 (§5.4). Vault URL, then Vault credential, unconditionally |
| **D5** | **Decided.** Retire W-17 by migration | Carried out as D10 says; checked in steps 9, 15 and 16 |
| **D6** | **Decided.** Match staging's flag values | Step 6 copies every F key staging sets, at staging's value; step 10 enters them; the drawer-strip pair is set explicitly (§5.5) |
| **D7** | **Decided.** The first Firefly tenant is created only after the operation, from the approved configuration-only export. No customers, leads, contacts, children, persons, records, transactions or other household or transactional data | Step 16, only after step 15 passes (§5.6) |
| **D8** | **Decided.** The earliest feasible window after every prerequisite (M1–M9, the C-rows), the step-6 reviews and the owner's final approval of this plan (step 6b). Not held to any earlier date. Weekends allowed. Owner present with Vercel, Render and Supabase | Step 6b books it; the window clock in §3 counts from its start, **T** |
| **D9** | **Decided.** Before the cutover, add a narrow first-promotion mode to the release tool, tested offline, keeping the owner approval and the tamper-evident audit | Built and rehearsed before the window (M3); used at steps 7–9, 15 and 17 (§4) |
| **D10** | **Decided.** W-17 is retired by a migration that runs through staging first (step 1); production then receives it through the same migration chain, in version order | Written and merged to staging in step 1 (M2); applied in its place in the chain at step 9 |
| **D11** | **Decided.** During the window, after production verifies, the **existing** org helper (`createOrgAndAssignAdmin`, M5) creates Firefly and Firefly's reviewed configuration-only allowlist export is imported, as **one recorded step**, run from the Mac mini operator session with the owner present. The owner does not type commands. The session transcript is recorded. No customers, leads, children, persons or transactional data | Step 16 (§5.6) |

## 1. Prerequisites that must close before the window

Each is something the plan needs that **does not exist yet**. None is closed by this document, and none may be reported
closed without the evidence in the last column. Until all are closed, no window is booked (D8, step 6b); any row found
open at T+0:00 is a no-go (step 7).

| ID | Missing | Why it blocks | Evidence today | Closed when, by whom |
|---|---|---|---|---|
| **M1** | **ALY-14 E1–E4 are not on `staging`.** All 19 commits whose message names ALY-14 are on this branch only: E1 `2e2f0acf8`, `d0bccd81d`; E2 from `a092757a1` (with `456fcafff`, `583156942`); E3 from `a31cc8294` to `9d194f40c` (including `2ac3bccd3`, `3376e5618`, `f4d0b3a50`); E4 `4972595ae`. None of the four anchors is an ancestor of `origin/staging` | D1. `ALLOY_ENVIRONMENT` and its fail-closed outbound guard exist only because of E1 | `staging-integration-check.txt` | Step 1: staging `/api/build-info` serves the merge. Developer; the push is an authorized action |
| **M2** | **The W-17 retirement migration is written but not on `staging`.** Slice B1 committed `supabase/migrations/20261223090000_w17_selftest_org_retirement.sql` on this branch, numbered after `origin/staging`'s head `20261222090000`. For every org whose slug starts with `_w17_selftest_` it sets `status` `retired` and `name` to the slug. Rows are kept: the org's 6 role definitions, 158 grants, 10 document categories and 13 document types stay, unchanged, as configuration of an org with no members. The migration fails if the org has any role or access-profile row. It is forward-only and re-runnable, a no-op where no such org exists, and release-lib classifies it `expand`. **Why the name changes too:** release-lib recognises a self-test org by `name` (`ORGS_SQL` lists `id\|status\|name`, `release-lib.mjs:412`, `:429`), but the self-test names it `W-17 self-test`. With that name, staging verification fails it as "neither Firefly nor a ZZ Alloy QA fixture", and `:429` passes it whatever its status | D10. `check-production` must see a retired self-test org (`release-lib.mjs:429`); production may only receive migrations staging ran (`release-lib.mjs:149`) | P4 F3; `rebuild/w17-removal-trial.txt` (a plain delete fails on `document_category_in_use`). B1, on throwaway local Supabase Postgres ([`environments-b1-w17-evidence-2026-11-25/`](environments-b1-w17-evidence-2026-11-25/)): the full 558-file step-1 merge tree applied from nothing exits 0 and leaves the org `retired` (`A-apply.log`, `A-after-chain-census.txt`). Staging's state (chain to `20261222090000`, org `active`) becomes `retired` with every owned row count unchanged (`B1-…`, `B2-…-census.txt`). Re-applying it changes nothing (`B3-reapply.txt`), and neither does a database with no W-17 org (`B4-no-org-trial.txt`). release-lib's two tenancy checks pass on every post-migration listing and fail staging's current one (`release-checks.txt`). Release and migration-ordering suites are green (`test-runs.txt`) | Step 1: the migration is merged with E1–E4, staging's ledger holds `20261223090000`, and staging's W-17 org reads `retired` with name `_w17_selftest_0bbaad43`. Developer |
| **M3** | **The release tool has no first-promotion mode.** `plan` over an empty ledger is **blocked** (`contract_not_last`, 48 contract files among 557, the first `20260329210000`; 45 before the B4 TRUNCATE-in-`DO`-block classifier fix, which moved `20260804210000`, `20260818123000` and `20260818140000`), and `production.preflight` expects production to serve the old `main` on the project named in `release-config.json` | D9. Without it, `prepare` writes no manifest, so `approve`, `emit-apply`, `record` and the hash-chained audit have nothing to bind | `plan-empty-ledger-p4-candidate.json`; P6 procedure *Limits*. **Built by slice B2** (`f60f1ae66`): `--first-promotion` on `plan`/`prepare` (§4); procedure *First promotion (opt-in mode)*. Offline tests 44/44 (with the §9 retired-org list, `5ea249e5b`) and Docker rehearsal suite 26/26 (9 first-promotion scenarios), and the full-chain rehearsal against an empty local ledger, re-run on `5ea249e5b`: 558/558 applied, census pass, `verify-audit` exit 0 (568 entries), staging verification passing with Alloy Bend `retired` and refusing it `active` ([`environments-b2-first-promotion-evidence-2026-11-25/`](environments-b2-first-promotion-evidence-2026-11-25/)) | The mode is committed with offline tests (`npm run test:release-procedure`) and rehearsed non-live. Developer, before step 5. **Built and rehearsed on this branch (B2)**; it closes when it reaches `staging` with step 1's merge |
| **M4** | **`release-config.json` names the old production project** (`vslwnntzzgpnmrpjipat`) | Every check against production after cutover must expect the new ref (`checkBuildInfo` compares `supabaseProjectRef`) | `scripts/release/release-config.json`; `alloy-release.mjs` `loadConfig` (`--config` overrides the file for one run). **B2** added the generator: `release first-promotion-config --new-ref <ref> --out releases/<date>-<sha12>/release-config.json` writes the copy (production on the new ref, `previous_supabase_project_ref` the old one, the committed policy otherwise, `derived_from_sha256`). A first-promotion manifest binds both refs; `approve`, `record`, `check-production` and `runbook` refuse any config naming others, and `prepare --first-promotion` refuses the committed file (rehearsal `refusals/`). The committed file's production ref is unchanged; its only B2 change is the §9 list `tenancy.staging_retired_orgs`, which the copy inherits | Step 5: a config copy naming the new ref in the release directory, written by that command (§4). The committed file follows in the next release |
| **M5** | **The existing org helper has no reviewed production invocation.** D11 uses the existing helper `web/lib/dev/createOrgAndAssignAdmin.ts`; no new helper is written. It inserts one `orgs` row (industry `childcare`, seeded by `20260430211000`), one `admin` membership through `create_membership_with_access_profile`, and the relationship-field configuration (`field_section_definitions`, `option_sets`, `option_set_items`, `field_definitions`); it needs an existing `auth.users` id. Its current callers are not usable here: `/api/admin/dev/create-org` needs `DEV_TENANT_SPINUP_ENABLED`, which must never be set on production (checklist X row); `web/scripts/ensureSharedQaTenant.ts` creates only the frozen QA orgs (and refuses the production ref it knows); `npm run dev:tenant:childcare` also seeds demo opportunities, which D7 forbids | D11. Step 16 has no approved command without it | P4 F6; the files named. **Built by slice B3:** `npm run tenant:create` (`web/scripts/tenantCreate.ts`) calls the existing helper, unchanged, with explicit arguments and an org id it chooses before writing. It refuses an inexplicit target, staging and the previous production project, a duplicate slug or name, an admin id that is not an Auth user or whose email differs, and an unnamed admin. It prints the planned writes, asks for the slug to be typed, and logs every line. Rehearsed locally on a project built from the chain (§5.6.1; [`environments-b3-tenant-evidence-2026-11-25/`](environments-b3-tenant-evidence-2026-11-25/)) | The exact step-16 invocation (a direct call of `createOrgAndAssignAdmin` from `web/`, with the new project's URL and service-role key in the Mac mini session only, never in a file) is written into the step-16 command list and approved by the Development Lead and the Database Engineer at step 6. Developer |
| **M6** | **No green CI run on the rebuilt candidate.** P6 step 2 requires each `required_checks` entry to succeed on the candidate SHA; the check names still need confirming against real check-runs (P6 owner action 4) | Staging verification cannot pass without it | P4 *Integration through a pull request*; P6 owner action 4 | Step 4. Developer; the push and PR are authorized actions |
| **M7** | **No read-only role on any project; backups are decided (owner, 2026-11-26, replacing the 2026-11-25 PITR decision): daily backups, kept 7 days, no PITR.** Follow-up: turn on 7-day PITR before the first tenant with live customer data (families, attendance or billing) goes live (P6 owner actions 5–6) | Observations need a read path that cannot write; after step 16, the daily backups are the new project's only recovery, and a restore can lose up to a day | P6 owner actions 5–6. The role's script: [`environments-readonly-role-2026-11-27.sql`](environments-readonly-role-2026-11-27.sql), proven locally ([RO1 evidence](environments-ro1-evidence-2026-11-27/README.md)) | Step 5. Owner in Supabase: the script run on the new project and on staging (check rows 1–9 `ok`), both read-only URLs kept; daily backups listed, kept 7 days |
| **M8** | **The configuration-only allowlist export and its import do not exist.** P3 R1 requires re-authoring through the app's write paths from a reviewed configuration-only listing, never a row dump; the repo's only Firefly configuration capture is defective (P3 C14); several Firefly configuration counts were never observed on hosted staging (P3 C2, C13, C14, C16: BLOCKED on STG-CENSUS) | D7, D11. Step 16 has nothing reviewed to import | P3 §C, R1. **Built by slice B3:** `tenant:config:export` (read-only; the allowlist `web/lib/tenancy/configTransfer/allowlist.ts`: sites, rooms, household role types, the `lead_management` Enrollment process; every other kind refused by name), `tenant:config:import plan\|apply\|verify` (re-authors through the app's write paths; idempotent; dry run), `tenant:rollback-sql` (§7). The July 2026 capture is retired as a source (`docs/sprints/active/assets/firefly-config/README.md`). Rehearsed locally from the E2 seed: §5.6 checks 9/9 PASS, re-run a no-op, the step-16 removal proven against the step-9 census (§5.6.1; [`environments-b3-tenant-evidence-2026-11-25/`](environments-b3-tenant-evidence-2026-11-25/)). **Open:** lane work units cannot be derived without C14's status definitions (§5.6.1 16.4) | The export and the import procedure exist and are approved by the Development Lead and the Database Engineer (step 6) |
| **M9** | **The candidate fails `release identify` as committed** (§2) | P6 step 1 is a hard gate | `identify-p4-candidate-no-allowance.json` (exit 1). Cause: `.github/workflows/vacilando-tier2.yml` only (§2), fixed on this branch by B1 (`e53a318cb`). **B2 measured it:** a simulated step-1 merge of this branch into `origin/staging`, then P4's `build-candidate.sh`, gives a candidate that `identify` passes with no allowance (exit 0, `tree_diff_from_staging: []`, fast-forward; B2 `identify-no-allowance.json`, re-measured on `5ea249e5b`). No code or config change is needed: steps 1–2 must only merge this branch into `staging` (so `vacilando-tier2.yml` equals `main`'s) and rebuild the candidate from that merge, and step 2 must not add an allowance | Step 2: `identify` exits 0 **with no `--allow-tree-diff`** |
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
Do not add the flag, do not edit `release-config.json`; fix staging and rebuild the candidate (back to step 1). No window
is booked until step 2 passes; if it fails at step 7, the window is cancelled and the next feasible one is booked (D8).

**On this branch (slice B1).** `.github/workflows/vacilando-tier2.yml` is now byte-identical to `origin/main`'s retired
copy (no `schedule:`, `workflow_dispatch` kept). The offline step-1 merge (`git merge-tree --write-tree HEAD
origin/staging`, exit 0) has the same file as `origin/main`, so P4's `build-candidate.sh` override becomes a no-op after
the merge. The merge tree's migrations are 558, with head `20261223090000`, the W-17 migration
([`environments-b1-w17-evidence-2026-11-25/test-runs.txt`](environments-b1-w17-evidence-2026-11-25/test-runs.txt)).
`identify` itself can only be measured for real at step 2, on the rebuilt candidate.

**Measured by slice B2, offline.** The cause is that one file and nothing else: the release tool's tree gate is right to
fail it, and `release-config.json` needs no allowance. B2's rehearsal builds the candidate exactly as steps 1–2 will, from
git objects only: `git merge-tree --write-tree <this branch> origin/staging`, committed as a merge onto `origin/staging`, then
P4 `build-candidate.sh <that merge> origin/main`. `release identify` with **no** `--allow-tree-diff` exits 0, fast-forward,
558 migrations, `tree_diff_from_staging: []`
([`environments-b2-first-promotion-evidence-2026-11-25/identify-no-allowance.json`](environments-b2-first-promotion-evidence-2026-11-25/identify-no-allowance.json)).
What steps 1–2 must do to keep it that way: step 1 merges this branch (it carries main's retired workflow file), with
no other change to `.github/workflows/vacilando-tier2.yml` on staging before or after; step 2 rebuilds with the same two
commands and runs `identify` as in §4 below. Any non-empty `tree_diff_from_staging` is the stop condition above.

## 3. Ordered steps — the single cutover plan

Steps 1–6b come before the window, in order, with no calendar date: each starts when the one before it is done. Steps 7–17
are the window, timed from its start **T** (D8: the earliest feasible slot booked at step 6b; weekends allowed; three hours).
**T+2:20 is the last keep/roll-back decision** before tenant work.

**Staging migration restriction (kept until the ALY-14 cutover).** The owner's restriction on staging migrations stays in
force until step 17 closes the window. The only migrations that reach staging before then are the ones step 1 carries
(E1–E4's and the D10 W-17 retirement). Any other migration waits until after the cutover. The step-2 freeze on merges to
staging is stricter still and runs over the same period.

| # | When | Step | Done when | Who |
|---|---|---|---|---|
| **1** | before the window | **D1 + D10: integrate into `staging`.** One **merge** of the branch carrying all of E1–E4 (M1), the W-17 retirement migration (M2) and main's retired `vacilando-tier2.yml` (§2). This branch merges into `origin/staging` cleanly (`git merge-tree` exit 0, re-run offline at this revision); it is 8 commits behind staging, so it is a merge that keeps staging's commits, never a reset (`staging-integration-check.txt`). The migration is applied to staging through staging's normal migration path | Staging `/api/build-info` serves the merge; staging CI green; staging's W-17 org reads `retired`; staging's ledger holds the new migration | Developer; the push is an authorized action (CLAUDE.md *Git / deploy*) |
| **2** | after step 1 | **Freeze `staging`, rebuild the candidate, identify it.** No merges to staging from here until step 17 closes the window (P4 O7); the staging migration restriction above holds over the same period. Re-fetch; P4 `candidate/build-candidate.sh <origin/staging> <origin/main>`; `release identify` **without** `--allow-tree-diff` (§2) | New candidate SHA recorded; `main` fast-forwards to it; identify exit 0. Otherwise the §2 stop condition | Developer |
| **3** | after step 2 | **Recount and recheck the candidate.** P4 `candidate/migration-counts.sh` (557 plus what step 1 adds, including the W-17 migration as the highest-numbered new file it introduces); no `schedule:` in any candidate workflow; `git grep DrawerSummaryStripBoundary` re-run (§5.5) | Count and head version recorded: this is the list step 9 applies | Developer |
| **4** | after step 3 | **Green CI on the candidate (M6).** Push it to a non-deploying branch, open the PR to `main` marked *do not merge* (P4 *Integration through a pull request*); confirm `required_checks` names against real check-runs | Every `required_checks` name has a `success` check-run on the candidate SHA | Developer; authorized push/PR |
| **5** | after step 4 | **New Supabase project, `us-west-2`.** Record its ref. Read-only role on it and on staging (the RO1 script), and daily backups kept 7 days, no PITR (M7). Release directory `releases/<date>-<sha12>/` with the config copy naming the new ref (M4). The first-promotion mode (M3) rehearsed non-live against an empty local ledger. **The old project is not touched** | Ref, role, backups (daily, 7 days), directory and rehearsal output recorded. **Done 2026-11-26:** ref `tjziptdknxdajzauctha`, `us-west-2`, Auth SMTP through Resend | Owner in Supabase; Developer for the rehearsal |
| **6** | after step 5 | **Collect and review.** Into the owner's secret store, not the repo: every F key staging's Vercel Preview scope sets, **with its value**, and the drawer-strip pair's staging behaviour (D6, §5.5); staging's clock ticking (C-CLOCK-1); staging's Render cron (C-MSG-1); O-row values (C-O-1); production's current Vercel deployment id and Render values and deploy (C-RB-1, C-RB-2). Firefly's first admin is decided (Q1): the owner's own existing Auth account (its `auth.users` id is what M5's helper needs); the owner invites Firefly's staff afterwards. The helper invocation (M5) and the allowlist export with its import procedure (M8) are approved by the Development Lead and the Database Engineer, and written as the step-16 command list | Every §6 row marked; both reviewers' approval recorded | Owner, Developer, Development Lead, Database Engineer |
| **6b** | after step 6 | **Final plan approval and window booking (D8).** The Development Lead confirms M1–M9 and the C-rows closed with evidence. The owner approves this plan in its final form (with the rebuilt candidate SHA, the new ref and the step-16 command list) and books the earliest three-hour slot at which the owner can be present with Vercel, Render and Supabase; a weekend slot is allowed. The slot's start is **T** | Approval and T recorded in the release directory | Owner; Development Lead |
| **7** | T+0:00 | **Go/no-go**: M1–M9 closed with evidence. Then **candidate identification** (P6 step 1) after a fetch, no allowance; **staging verification** (P6 step 2): staging serves the head the candidate was built from, on `ikaxilmwmrmbagoidedu`; check-runs green; ledger equals the candidate's migrations; tenancy passes. **Production before**: `/api/build-info` serves `main` on the old project; C-RB-1 and C-RB-2 re-read | All M closed; identify exit 0; staging passes; production unchanged | Owner, Developer |
| **8** | T+0:25 | **Owner approval** (P6 step 4) through the first-promotion mode's manifest (D9) | Approval recorded in the audit chain; P6 TTL (4 h default) covers the window | Owner |
| **9** | T+0:30 | **Schema apply on the new project** (§4), then the census (§4 item 6) | Census passes by T+1:30, or hold | Developer through the release tool; owner present |
| **10** | T+1:30 | **Platform settings.** Supabase §5.1; Vercel Production scope §5.2 (with the D6 flags and the drawer-strip pair); Render §5.3, saved without deploying. If C-REN-2 shows that saving Render's environment redeploys the service, Render's values move to step 11 and are saved immediately before its Render deploy, so the old backend never runs against the new project. `NEXT_PUBLIC_*` before step 11's build | §5.1–5.3 rows set and re-read | Owner in the dashboards |
| **11** | T+1:45 | **Release** (P6 step 7). `git ls-remote origin main` equals step 2's base; fast-forward `main` to the candidate, never `--force`; poll production `/api/build-info` until it serves the candidate on the **new** ref; then deploy Render on the candidate commit. This first `main` deploy also registers the `web/vercel.json` Vercel Cron (§5.4) | Both services serve the candidate | Developer; owner in Render |
| **12** | T+2:00 | **Vault `scheduled_work_wake_url`** in the new project = the production origin + `/api/scheduled-work/wake` (§5.4). Unconditional | Secret present, names the production origin | Owner in Supabase |
| **13** | T+2:03 | **Vault `scheduled_work_wake_credential`** = production `INTERNAL_CRON_TOKEN`, after step 12 reads back correctly (§5.4). Unconditional | Secret present | Owner in Supabase |
| **14** | T+2:05 | **Observe the clock** (§5.4): the `pg_cron` tick reaches production; Vercel Cron calls are refused | `wake_count` advances; 2xx from production in `net._http_response`; no staging target | Developer |
| **15** | T+2:10 | **Production verification** (P6 step 8): §8 post-checks; `release check-production --stage final --config <new-ref config>`. **T+2:20: keep, or roll back now (§7)** | All §8 rows pass | Owner decides |
| **16** | T+2:25 | **D7 + D11: create and configure Firefly, one recorded step.** Only after step 15 passed. In the Mac mini operator session, owner present, transcript recorded, the step-6 command list runs as approved: the owner adds Firefly's named admin account in the new project's Supabase Auth (a dashboard action, not a command), the existing helper (M5) creates the Firefly org and that account's admin membership, then the reviewed configuration-only import (M8) runs, then the §5.6 checks. The owner does not type commands. If it cannot finish by T+2:50, stop; production stays verified with no tenant, and step 16 moves to a later session with the owner present | §5.6 checks pass; transcript in the release directory | The Mac mini operator session runs it; owner present |
| **17** | T+2:50 | **Record** (P6 step 10): evidence and the step-16 transcript into the release directory; `verify-audit`. T+3:00 the window closes; the staging freeze and the staging migration restriction lift | Directory complete; `verify-audit` exit 0 | Developer |

The apply is not timed by any record (P4's 29 s was a local container). If step 9 has not passed by **T+1:30**, hold.
Production still serves the old build on the old project, so holding costs nothing but the window; the next feasible
window is booked as in step 6b.

## 4. Step 9: the schema on the new project (D2, D9)

P4 rebuilt a working database from nothing: **557/557** migrations, in version order, one transaction per file with its
ledger row, no edits (P4 *Results*). Step 9 does the same against the new project, through the first-promotion mode (D9):

1. **What the mode must do (M3's acceptance).** Accept an empty ledger only for a project whose ledger is empty; waive
   `contract_not_last` only in that case (the chain runs in version order, item 5); check the **new** ref through the
   `--config` copy (M4); and keep everything else as in a normal release: `prepare` writes the manifest, the owner's
   `approve` binds it, `emit-apply` prints each file's `wrapMigrationForApply` text (`release-lib.mjs`), `record` and
   `verify-audit` keep the hash-chained audit. It is tested offline with the rest of `scripts/release/tests/`.
   **As built (B2, `f60f1ae66`):** `--first-promotion` on `plan` and `prepare`; the manifest then carries
   `"mode": "first_promotion"`, both refs and `destructive_in_chain`, and every later command follows the manifest. A
   target ledger with any version refuses the plan (`first_promotion_ledger_not_empty`), and `check-ledger` and `execute`
   refuse again if it is no longer empty when the chain starts. `contract_not_last` is the only waiver. The 45
   destructive files run in their place in the chain, so the approval must also grant `schema_contract`.
   `production.preflight` expects the old `main` on the **previous** ref and `tables|0` on the new project. The census
   (item 6) is `check-production --stage schema` and gates `code.deploy`. Without the flag nothing changes (a routine
   plan is byte-identical; rehearsal `refusals/plan-routine-empty-ledger.json` still blocks on `contract_not_last`).
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

The census's pass/fail half is the ledger, the fingerprint, `rls_disabled`, the orgs, the six extensions and the bucket.
`clock_activation_certification` and the row counts are recorded in `census-extras.txt`, not judged.

### 4.1 The exact commands (steps 5, 7–11, 15, 17)

Run from the worktree root of the rebuilt candidate's checkout. The rehearsal ran every one of these against throwaway
Postgres, with only the database target swapped
([`environments-b2-first-promotion-evidence-2026-11-25/`](environments-b2-first-promotion-evidence-2026-11-25/)). Connection
strings live in the owner's session only, never in a file: `$STAGING_DB_URL_READONLY` is staging's read-only role;
`$PRODUCTION_DB_URL_READONLY` and `$PRODUCTION_DB_URL` are the **new** project's read-only role and `postgres`, both on port
**5432** (M7).

**Step 5**: the release directory and the config copy (M4).

```bash
REL="node scripts/release/alloy-release.mjs"
SHA=<step-2 candidate SHA>; NEW=<the new project's ref>
DIR=releases/<date>-${SHA:0:12}
$REL first-promotion-config --new-ref "$NEW" --out "$DIR/release-config.json"   # refuses an existing different file
C="--config $DIR/release-config.json"
```

**Step 7**: identify, then the observations `prepare` reads, then the manifest and its runbook.

```bash
git fetch origin
$REL identify --candidate "$SHA" > "$DIR/identify.json"            # exit 0; never --allow-tree-diff (§2)
curl -fsS https://staging.workwithalloy.com/api/build-info > "$DIR/staging-build-info.json"
gh api "repos/ksquared-16/alloy/commits/$SHA/check-runs" > "$DIR/check-runs.json"
$REL emit-sql ledger      | psql "$STAGING_DB_URL_READONLY" -At -X -f - > "$DIR/staging-ledger.txt"
$REL emit-sql fingerprint | psql "$STAGING_DB_URL_READONLY" -At -X -f - > "$DIR/staging-fingerprint.txt"
$REL emit-sql orgs        | psql "$STAGING_DB_URL_READONLY" -At -X -f - > "$DIR/staging-orgs.txt"
curl -fsS https://www.workwithalloy.com/api/build-info > "$DIR/production-build-info.json"   # old main, old ref
$REL emit-sql ledger-if-present | psql "$PRODUCTION_DB_URL_READONLY" -At -X -q -f - > "$DIR/production-ledger.txt"   # empty
$REL emit-sql fingerprint | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > "$DIR/production-fingerprint.txt"       # tables|0
$REL plan --first-promotion --candidate "$SHA" --production-ledger "$DIR/production-ledger.txt" > "$DIR/plan.json"
$REL prepare --first-promotion $C --candidate "$SHA" --out-dir "$DIR" \
  --staging-build-info "$DIR/staging-build-info.json" --check-runs "$DIR/check-runs.json" \
  --staging-ledger "$DIR/staging-ledger.txt" --staging-fingerprint "$DIR/staging-fingerprint.txt" --staging-orgs "$DIR/staging-orgs.txt" \
  --production-build-info "$DIR/production-build-info.json" --production-ledger "$DIR/production-ledger.txt" \
  --production-fingerprint "$DIR/production-fingerprint.txt"
$REL runbook --manifest "$DIR/manifest.json" $C > "$DIR/runbook.md"
```

`staging-orgs.txt` must list exactly Firefly and the two ZZ Alloy QA fixtures `active`, Alloy Bend
(`7803388d-cdee-4afb-89cf-23a137f39423`) `retired`, and `_w17_selftest_0bbaad43` `retired` (§9, M2). Alloy Bend in any
other status, or any other org, fails staging verification and `prepare` exits 1: a no-go.

`prepare` exits 0 and prints `mode: first_promotion`, the new ref, `chain` (558 plus anything step 1 added), the first and
last versions and `destructive_in_chain`. Any other result is a no-go. From here every command is in `$DIR/runbook.md`,
which prints them with `<release-dir>` for `$DIR` and with the manifest's confirm code filled in. The steps map as follows:

| Briefing step | Runbook section | What it runs |
|---|---|---|
| **8** owner approval | 4 | `$REL approve $C --manifest $DIR/manifest.json --approver Kelly --confirm <12> --ttl-hours 4` at the owner's terminal (refused from an agent session), then `record --step owner.approval` |
| **9** schema apply | 5, 6 | the `fp_target` guard (refuses port 6543, the old ref, and any URL not naming the new ref); `pg_dump` of the empty project; `check-ledger` (still empty); `emit-sql ledger-table`; then, per version of `apply-order`, `emit-apply … \| psql "$PRODUCTION_DB_URL" --single-transaction …` with the `ON_ERROR_STOP` variable on, and `record --step schema.expand --status applied`, stopping at the first failure; then the census and `check-production --stage schema … --census`, and `record --step schema.expand --status pass` |
| **10** platform settings | 7 (preamble) | nothing from the tool; §5.1–5.3 before the deploy |
| **11** release | 7 | `git ls-remote` equals the approved base; `git push origin <candidate>:refs/heads/main` (fast-forward, never `--force`); poll build-info until it serves the candidate **on the new ref**; `record --step code.deploy`. Render is deployed after this, in its dashboard |
| **15** production verification | 8 | the four observations, `check-production --stage final $C`, `record --step production.verify`. On failure, code rollback as printed, to the old deployment on the untouched old project (§7) |
| **17** record | 9, 10 | `record --step schema.contract --status skip`, `record --step release.record`, `verify-audit`; commit `$DIR` |

`check-production --stage final` passes only while the one org is the retired self-test org (D3), so it is run at step
15, before step 16 creates Firefly; it is not re-run after step 16, whose own checks are §5.6.

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
| Backups / PITR | Daily backups, kept 7 days; no PITR (M7, owner 2026-11-26). Turn on 7-day PITR before the first tenant with live customer data goes live | P6 owner action 6 |
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

### 5.6 Firefly: the existing org helper and the configuration-only import (D7, D11) — step 16

1. **When.** Only after step 15 passes, inside the window, as **one recorded step**: helper, import, checks.
2. **Where and how.** In the Mac mini operator session, with the owner present. The owner does not type commands; the
   session runs the step-6 command list exactly as the Development Lead and the Database Engineer approved it, and nothing
   is improvised in the window. The session transcript is recorded and filed in the release directory at step 17.
3. **What is created, in order.**
   1. Firefly's first admin account, the owner's own existing Auth account (Q1), added by the owner in the new project's
      Supabase Auth dashboard (the helper needs its `auth.users` id). It is a sign-in identity, not a `persons` row or
      household record.
   2. The existing helper `createOrgAndAssignAdmin` (M5), called directly with that id, industry `childcare` and Firefly's
      name: one `orgs` row, one `admin` membership, and the relationship-field configuration. Not `dev:tenant:childcare`
      (it seeds demo opportunities) and not `/api/admin/dev/create-org` (`DEV_TENANT_SPINUP_ENABLED` stays unset). The
      helper prints the new org id.
   3. The import (M8): Firefly's **configuration** re-authored from the reviewed allowlist export, bound to the new org id,
      through the app's write paths (P3 R1), never as a raw row copy. The allowlist is drawn from P3 §C's KEEP-CONFIG
      items.
4. **What is never carried** (D7, D11): customers, leads, contacts, children, persons, records, transactions, or any
   other household, person or transactional data (P3 L1–L4, L12: households, guardians, children, cases, participations, tasks, work items, charges,
   agreements, payments, documents and storage objects, threads, messages, outbox, process instances, audit and mutation
   events). Also never: anything from the old project (D3), the ZZ Alloy QA orgs (L5), QA identities and run fixtures (L8,
   L9), demo and seed rows (L10, L11). Provider bindings and merchants are re-provisioned per environment, never
   transferred (P3 C15).
5. **Checks after the import** (all must pass, recorded in the transcript):
   - Firefly's configuration is present: each allowlisted table holds the rows the export names;
   - every table the export classifies as record or transaction holds exactly its baseline count (the census taken after step 15, §5.6.1);
   - orgs: Firefly, plus the `retired` W-17 org (D10), and nothing else; no ZZ Alloy QA org (`release-config.json`
     `tenancy.qa_fixture_orgs`); no `f17e0000-…` seed id;
   - Firefly has exactly one membership, the named admin's `admin` row; Auth has exactly that one user.

Nothing else is in this step. Provider bindings, merchants, Auth mail, further users and invites are tenant setup that
follows it.

### 5.6.1 The step-16 command list (M5, M8): exact commands, expected output, stop conditions

Built and rehearsed locally by slice B3
([`environments-b3-tenant-evidence-2026-11-25/`](environments-b3-tenant-evidence-2026-11-25/)): the same commands, with
`--target local` and a loopback URL in place of `--target production` and the new project. The commands are
`web/scripts/tenantCreate.ts` (M5: calls the existing `web/lib/dev/createOrgAndAssignAdmin.ts`, unchanged, and nothing
else under `lib/dev`), `web/scripts/tenantConfigExport.ts` and `web/scripts/tenantConfigImport.ts` (M8; the allowlist is
`web/lib/tenancy/configTransfer/allowlist.ts`), and `web/scripts/tenantRollbackSql.ts` (§7).

**Placeholders.** The operator types these in the session; none is in a file. `<new-ref>`: the new project's ref.
`<release-dir>`: step 5's `$DIR`. `<admin-user-id>`, `<admin-email>`, `<admin-full-name>`: the owner's own existing
Auth account (Q1, decided: it is Firefly's first admin; the owner invites Firefly's staff afterwards). `<export-sha256>`: the reviewed file's hash
the reviewers approved at step 6. `<ORG_ID>`: what step 16.3 prints. The service-role key is read with `read -rs`, never
echoed, never in argv.

**Every command refuses** (exit 3 or 4, nothing written) when: the target is not explicit; the URL names staging
(`ikaxilmwmrmbagoidedu`) or the previous production project (`vslwnntzzgpnmrpjipat`); `--project-ref` is not the URL's
ref; `ALLOY_ENVIRONMENT` is not `production`; the key's own project is another ref; or the shell already sets
`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` (start a clean shell). **Every command logs**
each printed line, timestamped, to its `--log` file in the release directory (filed at step 17).

**Step 6, before the window: the export, from staging, read-only.** The operator runs it from `web/` with staging's
read-only role:

```bash
cd web
read -rs TENANT_CONFIG_EXPORT_DATABASE_URL && export TENANT_CONFIG_EXPORT_DATABASE_URL   # staging's read-only role URL, typed
ALLOY_ENVIRONMENT=staging npm run -s tenant:config:export -- --target staging --confirm-project-ref ikaxilmwmrmbagoidedu \
  --org-id 93667019-bd28-49b5-a688-acc9bb1e0a19 --out "../<release-dir>/firefly-config-export.json"
```

Expected: `items: {"sites":…,"rooms":…,"household_role_types":…,"enrollment_process":1}`, the `left behind` list (label and
marker only), the metadata keys dropped, `✓ wrote …` and `sha256 …`. The read is one `BEGIN READ ONLY … ROLLBACK`
statement in a session with `default_transaction_read_only=on`, over five tables only (`orgs`, `locations`,
`customer_person_role_types`, `departments`, `work_units`). **Stop** on a non-zero exit. The Development Lead and the
Database Engineer then review the file: every item, every `left behind` row, every dropped key. They may delete items
(P3 C5: the 17 rooms added after 2026-09-19 are OWNER until the owner keeps or drops them). They approve the file by its
hash, re-taken after any edit: `shasum -a 256 <release-dir>/firefly-config-export.json`. That hash is
`<export-sha256>`. The transferable kinds are sites, rooms, household role types and the `lead_management` Enrollment
process. Every other kind is refused by name with its reason: records, persons, staff, messages, documents, bindings,
merchants, secrets, and the KEEP-CONFIG items that have no working write path yet or wait on an owner answer (programs,
catalog rates, charge templates, financial policies, forms, control plane, communication templates; see
`NOT_TRANSFERRED`).

**Step 16.0: the session.** A new shell on the Mac mini, transcript recording on, from the release candidate's worktree:

```bash
cd web
export ALLOY_ENVIRONMENT=production
read -rs ALLOY_OPERATOR_SERVICE_ROLE_KEY && export ALLOY_OPERATOR_SERVICE_ROLE_KEY   # the NEW project's service-role key
NEW=<new-ref>; DIR=../<release-dir>; REL="node ../scripts/release/alloy-release.mjs"
T=(--target production --supabase-url "https://$NEW.supabase.co" --project-ref "$NEW")
ADM=<admin-user-id>        # 16.1: from the Auth dashboard, after the owner adds the account
A=(--name "Firefly Early Learning" --slug firefly-early-learning --industry childcare \
   --admin-user-id "$ADM" --admin-email "<admin-email>" --admin-full-name "<admin-full-name>")
```

**16.1 (owner, dashboard).** The owner adds the named account in the new project's Authentication → Users ("Add user",
email confirmed). The operator copies its id into `ADM`. No command.

**16.2: helper, dry run.**

```bash
npm run -s tenant:create -- "${T[@]}" "${A[@]}" --log "$DIR/step16-tenant-create.log" --dry-run
```

Expected: `target: production project <new-ref> (https://<new-ref>.supabase.co)`. `orgs now (1):` with exactly the
line `<id>|retired|_w17_selftest_<hex>`. `admin <admin-user-id> (<admin-email>) holds 0 membership(s) today`. The plan:
the admin account's name, `insert orgs: id <uuid>, name "Firefly Early Learning", slug firefly-early-learning, status
active, industry childcare (…)`, one admin membership, the person-child relationship field configuration, `nothing else`.
Then `dry run: nothing was written`. **Stop** on any `✗ refused (…)`, or if `orgs now` lists anything but the retired
W-17 org (step 15 said there is no tenant yet). `--admin-full-name` is needed because the database refuses an admin's
money-capable grants to an unnamed login (`money_capable_grant_requires_named_operator`). If the account already has a
name, the command uses it and refuses a different `--admin-full-name`.

**16.3: helper.** The same command without `--dry-run`. It prints the plan again and asks the operator to type
`firefly-early-learning`.

```bash
npm run -s tenant:create -- "${T[@]}" "${A[@]}" --log "$DIR/step16-tenant-create.log"
ORG=<the ORG_ID it printed>
```

Expected: `confirmed: "firefly-early-learning"`, `admin account named "…"`, `created org <ORG_ID> slug
firefly-early-learning`, `memberships in the new org: <admin-user-id>|admin`, the `ORG_ID` line with that id, `done`. **Stop** on a
non-zero exit. `helper failed before inserting the org` means nothing is in `orgs`; fix and repeat 16.3.
`helper failed after inserting org <id>` means go to 16.R. A re-run is refused (`duplicate_slug`, `duplicate_name`).

**16.4: import, dry run.**

```bash
I=("${T[@]}" --org-id "$ORG" --admin-user-id "$ADM" --file "$DIR/firefly-config-export.json" --expect-sha256 <export-sha256>)
npm run -s tenant:config:import -- plan "${I[@]}" --log "$DIR/step16-import.log"
```

Expected: `file: … sha256 <export-sha256>`, `export of "Firefly Early Learning" (staging, …)`, `org: <ORG_ID>|active|Firefly
Early Learning`. Every plan line is `create`, and the summary reads `<N> to create, 0 to complete, 0 already present,
0 present but different`, where N is the approved file's item count. `dry run: nothing was written`. **Stop** on
`refused (file_changed)` (not the approved file), `refused (outside the allowlist or malformed)`, `refused
(seed_config)`, any `present_differs`, or a `blocked` item. `blocked` means the file names lane work units
(`derived_work_unit_keys`) that the new org cannot derive. The app's work-unit repair takes a lane's status filters only
from opportunity status definitions assigned to its stage (P3 C14, not transferred), and a fresh org has none. The
reviewers settle this at step 6, not in the window: either the reviewed file names no lane work units (the lanes are then
tenant setup, saved in the Work Unit Queue screen after step 16), or C14's status definitions join the allowlist first.

**16.5: import.** The same with `apply`. It asks the operator to type the org id's first 8 characters.

```bash
npm run -s tenant:config:import -- apply "${I[@]}" --log "$DIR/step16-import.log"
```

Expected: `written site:…` / `room:…` / `role_type:…` lines; for the process, `published revision 1 (…)`, `opportunity
drawer override: provisioned`, `work units: the export names no lane work units; none derived` (or, if the file
names lanes and the org can derive them, `work units: lifecycle_wu_…`; P3 C2: derived by the app's work-unit repair,
never copied), `written process:lead_management/enrollment`, then `✓ wrote <N> item(s); run verify next`.
**Stop** on any `✗`: go to 16.R. (A re-run only creates what is absent; the B3 rehearsal's second apply printed
`nothing to write: every item is already present (no-op)`.)

**The step-16 baseline (B4), taken at T+2:20 before 16.0.** Not step 9's census: the first `pg_cron` tick at step 14
runs the chain's one-time `clock_activation_certification` (P4 F8) and writes one `scheduled_work_attempts` and one
`scheduled_work_occurrences` row, which `census_write_set` would otherwise fail (B4 dress rehearsal, F2). Take it, and
check that only the clock moved since step 9:

```bash
$REL emit-sql census | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > "$DIR/census-before-step16.txt"
diff "$DIR/census-extras.txt" "$DIR/census-before-step16.txt"   # only scheduled_work_attempts / _occurrences / _clock rows
```

**Stop** before 16.0 if the diff names any other table.

**16.6: the §5.6 item-5 checks.** Take the census again with step 9's command, then verify against that baseline:

```bash
$REL emit-sql census | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > "$DIR/after-step16-census-extras.txt"
npm run -s tenant:config:import -- verify "${I[@]}" --log "$DIR/step16-verify.log" \
  --baseline "$DIR/census-before-step16.txt" --after-census "$DIR/after-step16-census-extras.txt" --release-config "$DIR/release-config.json"
```

Expected, every line `PASS`, ending `✓ all <n> checks passed`:

| Check | Pass |
|---|---|
| `config_present` | `<N> item(s) present and equal` (re-planning the file finds every item present and equal) |
| `work_units:lead_management` | every lane work unit the export names is active |
| `baseline_counts` | every record, transaction and binding table, and every other table outside the import's write set, at its baseline count |
| `import_write_set` | (listing) the write-set tables that grew. Rehearsed: 20 tables: `orgs` +1, `user_roles` +1, `user_access_profiles` +1, `role_definitions` +4, `role_permission_grants` +160, the org's database defaults (`document_categories` +10, `document_types` +13, `document_type_versions` +13), the relationship fields (`field_section_definitions` 1, `option_sets` 1, `option_set_items` 10, `field_definitions` 9), `locations`, `customer_person_role_types`, `departments` 1, `business_process_drafts` 1, `business_process_revisions` 1, `configuration_publications` 1, `workflow_events` 1, `record_drawer_layouts` 1, plus `work_units` when lanes are derived |
| `census_write_set` | every table whose count moved since the baseline is in the write set (this also sees tables empty at the baseline) |
| `orgs` | exactly `<ORG_ID>\|active\|Firefly Early Learning` and `<id>\|retired\|_w17_selftest_<hex>`; no ZZ Alloy QA or retired staging org |
| `no_seed_ids` | no `f17e0000-…` id in any written table |
| `memberships` | exactly `<admin-user-id>\|admin` |
| `auth_users` | `1 user(s): <admin-user-id>` |

Then the release tool's own org read, for the transcript:
`$REL emit-sql orgs | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > "$DIR/after-step16-orgs.txt"` lists the same
two orgs. **Stop** on any `FAIL`: step 16 fails, go to 16.R.

**16.R: if step 16 fails its checks (§7).** Remove what it wrote, in one transaction, as `postgres` (step 9's
connection):

```bash
npm run -s tenant:rollback-sql | psql "$PRODUCTION_DB_URL" -X -v org_id="$ORG" -v org_name='Firefly Early Learning' -f - \
  > "$DIR/step16-rollback.txt" 2>&1; echo "rollback rc=$?"
$REL emit-sql census | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > "$DIR/after-rollback-census-extras.txt"
diff "$DIR/census-before-step16.txt" "$DIR/after-rollback-census-extras.txt" && echo "census equals the step-16 baseline"
$REL emit-sql orgs | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - | diff "$DIR/census-orgs.txt" - && echo "orgs equal step 9"
```

Expected: `rollback rc=0`, a `removed org <ORG_ID> ("Firefly Early Learning") from <k> table(s) …; <t> trigger(s)
restored` notice, then the `equals the step-16 baseline` and `equal step 9` lines. The SQL refuses before any change if the org is missing, not named as
given, not `active`, or is the W-17 org. It also refuses once any record or transaction table holds a row for the org
(`window_closed`: the rollback window has closed, §7). It lifts only the enabled user triggers of the tables holding the
org's rows (the guards that refuse deleting a used document category, an immutable revision or publication, a
membership's profile), restores exactly those, keeps foreign keys enforced, and checks that no row is left before it
commits. Any error leaves the transaction aborted and nothing removed. The Auth user is kept: step 16 can be repeated
from 16.2 in this window if the cause is fixed and time allows (B3 rehearsed this), or the owner deletes the account in
the dashboard. **Stop, and take the other §7 branch** (recreate the project, repeat from step 9 in a later window) if
`rollback rc` is not 0 or either `diff` prints a line.

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

**Roll back when, at the T+2:20 decision:**

1. production `/api/build-info` does not serve the candidate on the new ref, or is not `vercelEnv` `production` on `main`;
2. `check-production` fails (ledger, fingerprint versus staging, a table without RLS, a QA or staging-seed org, a
   self-test org not `retired`);
3. `/login` or `/api/build-info` returns 5xx, or the build fails;
4. step 14 does not see a tick within ten minutes, or any `pg_net` request targets staging;
5. the backend `/build-info` does not serve the candidate, or its Supabase project differs from Vercel's.

**Hold, do not roll back**, when step 9 fails (§4 item 7). Nothing user-facing has changed.

**If step 16 fails its checks.** Production is already verified. Stop. Either remove what step 16 wrote (the export names
every row; the helper wrote one org, one membership and the relationship-field configuration; Auth holds one user) with §5.6.1 16.R, which is complete only when
the census equals the step-16 baseline (taken after step 15) and the org list equals step 9's, or, if that cannot be shown complete, recreate the new project and repeat
from step 9 in a later window booked as in step 6b.
Rolling back to the old project is not needed for a step-16 failure.

**When the rollback window closes.** Rolling back after step 16 discards only Firefly's configuration, which the reviewed
export can re-apply. It really closes when the first real record (a customer, lead, contact, child or transaction) is
written to the new project. From then on, recovery is the new project's last daily backup (step 5, M7), which can lose up to a day
of writes, and P6's *Data damage* row: restore first, then decide, with a new owner approval.

## 8. Pre- and post-checks

**Pre (step 7):** M1–M9 closed with their evidence; step 6b's final approval and T recorded; step 2's freeze and the
staging migration restriction held; `main` unmoved; identify exit 0 with no
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
(`release-lib.mjs:429`), which matches on the org's `name`, so the B1 migration gives the org its slug as its name (M2); the identify gate and its measured failure (§2); the drawer-flag readers, defaults and lack of
runtime callers (§5.5); the planner block on an empty ledger (`plan-empty-ledger-p4-candidate.json`); the org-creation
paths and what `createOrgAndAssignAdmin` writes (P4 F6; M5); P3's classification of configuration and records.

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
  export names each table as configuration, record/transaction or platform, and the check compares against the baseline taken after step 15 (§5.6.1).
- **Firefly's org id on the new project.** The helper's output names it; the export's rows are bound to it, not to the
  staging id. The import procedure takes it as an input rather than a constant.
- **Alloy Bend on staging: resolved by B2 (`5ea249e5b`).** P3 lists a third staging org, Alloy Bend
  (`7803388d-cdee-4afb-89cf-23a137f39423`, slug `alloy-bend`, `retired`, LEAVE L7), which staging verification failed as
  "neither Firefly nor a ZZ Alloy QA fixture" whatever its status. `release-config.json` now carries a reviewed list,
  `tenancy.staging_retired_orgs`, naming Alloy Bend by id (the org listing carries `id|status|name`, no slug; slug and
  name are recorded for the reviewer), and each entry must say `status: "retired"` or the config is refused.
  `checkStagingTenancy` accepts a listed org only while the observed org is `retired`. Retired orgs are not accepted in
  general: a retired org that is not listed fails, as does a lookalike named Alloy Bend under another id, and an active
  org outside the known set still fails. `checkProductionTenantIsolation` fails if a listed org appears in production
  at all, so Alloy Bend is never migrated: production's expected orgs stay the retired W-17 org before step 16 (D3,
  `checkNoTenantYet`), then that org plus Firefly. Tests: `release-procedure.test.mjs` (Alloy Bend retired passes, active
  fails, unknown retired fails, entry without `retired` refused, present in production fails). Rehearsal: staging
  verification passes with Alloy Bend `retired` and no warnings, and `prepare` refuses it `active`
  (`environments-b2-first-promotion-evidence-2026-11-25/refusals/prepare-staging-alloy-bend-active.json`). Adding an org
  to the list is a reviewed change to the committed config, like any other policy change.

## 10. Owner actions, and what is still open

**No decision is open.** D1–D11 are decided and none is re-opened here. What remains on the owner's side is work and
presence, in plan order:

1. Authorize the step-1 staging merge and the step-4 candidate push and PR (CLAUDE.md *Git / deploy*).
2. Step 5: create the `us-west-2` project (done: `tjziptdknxdajzauctha`) and the read-only role on it and on staging;
   backups are daily, kept 7 days, no PITR (M7, decided).
3. Step 6: the dashboard reads (C-FLAG-1, C-CLOCK-1, C-MSG-1, C-O-1, C-RB-1/2/3, C-REN-1/2) into the owner's secret store.
   Firefly's first admin is the owner's own existing Auth account (Q1, M5).
4. Step 6b: approve this plan in its final form and book T, the earliest feasible slot (D8).
5. The window: be present with Vercel, Render and Supabase; give the step-8 approval; set §5.1–§5.3 at step 10 and the
   Vault secrets at steps 12–13; make the T+2:20 keep or roll-back call; watch step 16 without typing.

## 11. What this briefing does not do

- It authorizes nothing. The P5 owner approval gate is unchanged, and no setting may be changed because this document lists
  it (checklist F).
- No push, PR, merge, deploy or fetch, and no hosted service of any kind. The rebuilt candidate does not exist yet.
- As first written, no migration was written (M2), and no change was made to the app, the release tool,
  `release-config.json` or any workflow file (M3, M4, M9). Slice B1 later added the W-17 migration (M2) and main's
  `vacilando-tier2.yml` (§2) on this branch. Slice B2 then added the release tool's first-promotion mode and the config-copy generator (M3, M4; `f60f1ae66`) and measured M9 offline (§2); the committed `release-config.json` keeps its production ref; B2's one change to it is the reviewed retired-org list (§9, `5ea249e5b`). The helper invocation and the export (M5, M8) were not written, and the helper was not run. Slice B3 then wrote them, with the step-16 removal, and rehearsed them locally only (§5.6.1, [`environments-b3-tenant-evidence-2026-11-25/`](environments-b3-tenant-evidence-2026-11-25/)); nothing was run against staging or production, and the real staging export is the operator's, at step 6.
- It fixes no calendar date. The window is booked at step 6b (D8).
