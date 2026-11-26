---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Evidence record for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 — not doctrine.
---

# Environments and promotion — P4 rebuild rehearsal and staging-to-main candidate (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P4. Builds on
[P1](environments-p1-production-census-2026-11-25.md), [P2](environments-p2-production-snapshot-restore-2026-11-25.md)
and [P3](environments-p3-staging-classification-2026-11-25.md).
Run window: 2026-11-25 22:40–23:05 UTC. Evidence: [`environments-p4-evidence-2026-11-25/`](environments-p4-evidence-2026-11-25/)
(`rebuild/` and `candidate/`), with its checksums in
[`environments-p4-evidence-2026-11-25.sha256`](environments-p4-evidence-2026-11-25.sha256).

## Outcome in one paragraph

The staging migration chain rebuilds a working database from nothing. All **557** migrations applied in order to a
fresh, network-less throwaway in about 29 s, with no edits and no workarounds. That only works once the Supabase Auth and
Storage schemas exist first, which is how a real Supabase project is ordered anyway. The rebuild turned up six facts
P3 did not have (F3–F8). The one that most affects the plan: **a fresh rebuild re-creates the W-17 self-test org**, and
several "comes with the code" defaults are per-org backfills that a newly created org never receives. The staging-to-main
candidate is commit **`ea06c21f3401527a7374febef2156dba9121ee3e`**. It is a merge of `staging` and `main` whose tree
is staging's except for one file, and `main` fast-forwards to it. **Nothing was pushed.** Fast-forwarding `main` to it would
deploy staging's code to production against production's older schema, so promotion has to wait for the production
database step (H1). Every remaining step is the owner's.

## Inputs

| Ref | SHA | Note |
|---|---|---|
| `origin/staging` | `8321949771f7fb6b2f04de6feb1fdd6ccb8e1484` (2026-11-16, PR #1647) | local remote-tracking ref, last fetched 2026-11-25 10:14 local. **Not re-fetched:** this slice uses no external host. |
| `origin/main` | `bbfbec76d7795cc3392b0c61e1c8ce829adaf9d2` (2026-09-15) | same |
| merge base | `6ac8d3a85` (2026-07-01) | |

**Scope of "configuration the owner approved in P3".** This slice was dispatched as approved, so R1–R4 are taken as
confirmed. The repo records no owner answers to P3 decisions 2–10. So the rehearsal loads exactly what needs no
open answer: the staging migration chain (R2) and the KEEP-CODE items it carries (K1–K7). **No KEEP-CONFIG item was loaded.**
R1 forbids row copies, and R1's source, the STG-CENSUS listing, is run by the owner against hosted staging. This slice
may not touch hosted staging. The rehearsal does show which KEEP-CODE items arrive and which do not (F4), and what a newly
created org provisions by itself (F5). Those two facts frame the KEEP-CONFIG step.

## Rebuild rehearsal

### Procedure (`rebuild/rehearse.sh`, re-runnable)

1. `git archive origin/staging supabase/migrations` into `/tmp/alloy-p4-rehearsal/src` (557 files). Nothing was read from the worktree.
2. Start container `alloy-p4-rehearsal-20261125` from the **local** image `public.ecr.aws/supabase/postgres:17.6.1.165`
   (no pull). The data dir is tmpfs only, with no mounts and no published ports. It is labelled `alloy.purpose=p4-throwaway-rebuild`. This is not
   the shared `alloy-cert` stack. No `supabase` CLI was used, and no other container was touched.
3. Platform service schemas first, as on a real project: run the local GoTrue `v2.196.0` image's `auth migrate` (70
   migrations) and the local storage-api `v1.70.3` image's `migrate-call.js` (63 migrations). Both run over an
   **`--internal`** Docker network, which has no route off the host. The network is then disconnected and removed
   (`networks_attached=[]`). The role passwords these need are throwaway literals inside a container that no longer
   exists. No credential for any real environment was created or used.
4. Create `supabase_migrations.schema_migrations`. Then apply each migration file as role `postgres` with
   `psql -v ON_ERROR_STOP=1 --single-transaction`, recording its ledger row in the same transaction.
5. Census the result (`rebuild/row-census.sql`, `k-items.sql`, P2's `catalog-counts.sql` and `schema-fingerprint.sql`).
   Run two **rolled-back** trials (`new-org-trial.sql`, `w17-removal-trial.txt`).
6. Tear down (`teardown.log`). The container is auto-removed. Afterwards no container or network carries the label, and no volume exists.

The first exploratory pass ran on a container with `--network none` (`isolation-evidence-pass1.txt`: `lo` only, no
routes, DNS and TCP egress fail). It skipped step 3 and stopped at `20260912010000_w17_additive_role_assignment.sql`
on `auth.users.email_change_token_new` (`apply-pass1-without-gotrue.log`). That is F1.

### Results

| Measure | Result |
|---|---|
| Migrations applied | **557 / 557**, exit 0 each (`apply.log`). Ledger 557 rows, head `20261222090000` |
| Ledger parity with hosted staging | 533 files ≤ `20261129090000`. The staging ledger recorded **533 rows at head `20261129090000`** on 2026-10-20 (P3 S7). The counts match. Version-set identity is not proven: that needs a fresh ledger read. |
| public tables / views / columns | 334 / 3 / 4,816 |
| RLS enabled / forced | **334 of 334** / 40 |
| policies / FK / other constraints / non-constraint indexes | 835 / 945 / 1,182 / 976 |
| triggers / functions | 283 / 320 |
| fingerprints (`rebuilt-fingerprint.txt`) | columns `893e1369…`, policies `0a9cdb9e…`, functions `cf52fff7…`, indexes `0c8be0f9…` |
| non-empty public tables | 21 (`rebuilt-row-census.txt`) |

Production, for contrast (P2): 134 tables, 1,604 columns, 362 policies. That is the older schema generation P3 S18
describes.

### Findings

| ID | Finding | Evidence | Consequence |
|---|---|---|---|
| **F1** | The chain assumes Supabase's own Auth and Storage schemas exist. A bare database fails at `20260912010000` (needs GoTrue's `auth.users` columns) and at `20261207181600` (`storage.buckets`). | `apply-pass1-without-gotrue.log` | Not a defect: a Supabase project provides both. A rebuild onto anything else must run the Auth and Storage migrators first (step 3). |
| **F2** | Ledger count parity with hosted staging (533 at `20261129090000`). | above | Good sign. The owner's STG-CENSUS should also read the ledger versions to prove identity. |
| **F3** | **Every fresh rebuild creates the "W-17 self-test" org** (`_w17_selftest_<8 hex>`, status `active`). `20260912010000_w17_additive_role_assignment.sql` runs an in-migration self-test. It deletes its auth user and access profile afterwards, but not the org. Later backfills then give that org 6 role definitions, 158 grants, 10 document categories and 13 document types. | `rebuilt-row-census.txt`, migration lines 257–321 | P3 L6 says LEAVE, but the chain re-creates it on every rebuild. **Deleting it fails** (`document_category_in_use` guard). **Retiring it works** (`status='retired'`). Both trials were rolled back (`w17-removal-trial.txt`). Owner decision O3. |
| **F4** | **Corrections to P3's KEEP-CODE list.** K1: `permission_keys` and `permissions` no longer exist (dropped by `20260729120000`). Only `permission_definitions` (99) carries over. **K4 `metric_placements`, K6 global `entity_layouts` and K7 `customer_person_role_types` are 0 on a fresh database.** Their seeds are per-org backfills (`… FROM public.orgs`, childcare orgs) that wrote rows only for orgs that existed when the migration ran. K2 (role-definition seeding), K3 (62 action definitions, 40 placements), K4 metric definitions (7) and visualizations (9), K5 (2), K6 entity labels (8) and record layouts (4) do arrive. | `k-items.txt` | For a rebuilt tenant, metric placements, entity layouts and household role types are **KEEP-CONFIG, not KEEP-CODE**. They have to be authored through the admin APIs (`/api/admin/analytics/placements`, `/api/admin/customer-person-role-types`, surface layout routes) under R1. |
| **F5** | Inserting one org provisions, through `orgs` triggers alone, 4 system role definitions, 160 role-permission grants, 10 document categories, 13 document types and 13 document type versions, and nothing else. | `new-org-trial.txt` (rolled back) | This is the floor a re-created Firefly starts from. Everything else in P3's C-items, plus F4's three, is authored afterwards. |
| **F6** | **The app has no production org-creation write path.** Orgs are created only by `web/lib/dev/createOrgAndAssignAdmin.ts`, a dev helper that `web/scripts/ensureSharedQaTenant.ts` uses with service-role credentials, and by `supabase/seed/local_representative_seed.sql`. | repo search at `origin/staging` | R1 says "re-author through the app's own write paths", but there is none for the org itself. Owner decision O4. |
| **F7** | The chain installs a **pg_cron job (`*/5 * * * *`)** that calls `net.http_post` to the vault secret `scheduled_work_wake_url`, **falling back to `https://staging.workwithalloy.com/api/scheduled-work/wake`**, with the vault secret `scheduled_work_wake_credential` as bearer and `x-cron-token`. Without the credential secret it sends nothing. In the rehearsal it ran once, succeeded and queued **0** requests. | `cron-and-net.txt`, `20261002120000`/`20261003120000` | Inert on a rebuild until the credential is provisioned. **Hazard:** if a rebuilt production gets the credential but not the URL secret, every 5 minutes it sends production's credential to staging. Set `scheduled_work_wake_url` per environment **before** the credential (owner step O5). |
| **F8** | One global `scheduled_work` row, `clock_activation_certification` (`financials.periodic_billing.evaluate`, `one_time`, due in the past), is seeded by `20261001120000`. | `rebuilt-row-census.txt` | Certification residue by name, but deliberate. Its migration documents it as non-mutating and converging once. **Accept.** Nothing to do. |

No other tenant row appears. The K-section watch item (`20260506120000` medication-form demo seed, the two cleaning-org
migrations) wrote nothing on a fresh database, because their target orgs are absent. That confirms P3's recommendation to
leave them untouched.

## Staging-to-main integration candidate

### The candidate

| | |
|---|---|
| Commit | **`ea06c21f3401527a7374febef2156dba9121ee3e`** |
| Parents | `8321949771f7…` (staging), `bbfbec76d779…` (main) |
| Tree | `d24317165163ebf5a659d7c94af7539563052412` |
| Local ref | `refs/candidates/aly-14-p4-staging-to-main`. Local only, so the object survives gc. **Not pushed.** |
| Built by | `candidate/build-candidate.sh`. It uses a temporary index (no checkout) with pinned identity and dates. Two runs gave the same SHA. |
| `main` → candidate | fast-forward (`git merge-base --is-ancestor origin/main <candidate>` holds) |
| staging → candidate | **1 file**: `.github/workflows/vacilando-tier2.yml`, +23 −5 (`candidate/staging-to-candidate.diff`) |
| main → candidate | 22,933 paths: 15,375 added, 5,086 deleted, 2,472 modified (`candidate/main-to-candidate-summary.txt`; full list `main-to-candidate.name-status.gz`, sha256 `19cfe9b4…5ce5b`). This is staging's tree, plus that one file. |

### Migration counts by ref

Added by slice E6R so the relaunch agenda quotes the right number for the right question. Source: `candidate/migration-counts.sh`,
which reads git objects only, output in `candidate/migration-counts.txt`. **557 is the total on staging. It is not the
staging-only count, and it is not the number production is behind.**

Provenance of the counts. Every count in this record comes from git objects in this repository: `origin/staging`
`8321949771f7` and `origin/main` `bbfbec76d779` as last fetched on 2026-11-25 at 10:14 local, not re-fetched, plus the local
candidate ref. The exceptions are the rebuild's 557-row ledger (`rebuild/ledger-summary.txt`) and hosted staging's 533 rows
(S7, read by `tha_22182e4b963fce` on 2026-10-20, file `certification/documents-v1/d0-storage-census.sql.results.json` on
staging). E6R could not re-read the Henry report that accepted this slice. Henry's state is off limits to development
runs. So this section is checked against the repository, not against that report's text.

| Question | Count | Ref |
|---|---|---|
| Migrations on staging (the rebuild chain) | **557** files, 557 distinct versions, head `20261222090000` | `origin/staging` `8321949771f7` |
| Migrations on main | **229** files but only **225** distinct versions, head `20260709120000`. Main adds none after the merge base `6ac8d3a85`, which has the same 229. | `origin/main` `bbfbec76d779` |
| In both, same file name | **225** | |
| Staging-only by file name | **332** | |
| Main-only by file name | **4** | |
| Staging-only by content (`git diff -M main staging`) | **328** new files. The other 4 of the 332 are main's 4 files renumbered: 3 byte-identical (R100), 1 renamed and edited (`commercial_tuition_rates`, R058). | |
| Changed in place, same name | **2**: `20260630150000_update_child_enrollment_status_action_seed`, `20260701200000_bpep_action_catalog_seeds` | |
| Main-only by content | **0**. Every main file is on staging, under the same name or a renumbered one. | |
| Candidate vs staging under `supabase/migrations/` | **0** paths differ, so the candidate carries 557 | `ea06c21f3401` |
| Staging files ≤ hosted staging's ledger head of 2026-10-20 | **533**, matching that ledger's 533 rows (count only, see Results) | P3 S7 |

The 4 main-only names are why main has 229 files but 225 versions. Main has three version collisions: `20260630120000` ×3,
`20260630130000` ×2, `20260707120000` ×2. A Supabase ledger keys on version, so main's chain cannot record all 229.
Staging gave 4 of those files new versions (`…120100`, `…121000`, `…131000`, `…707120100`).

**What this does not say about production.** Production's applied set is unknown. P2 could not read
`supabase_migrations`, so "production is 332 (or 328) migrations behind" is **not established**. That would hold only if
production's ledger equals main's chain, and main's chain cannot be recorded as-is. Before H1, a ledger read on production
has to show which of main's colliding versions it holds. Staging's renumbered copies of those files carry new versions, so
`db push` would treat them as pending and apply them a second time.

A plain `git merge-tree origin/staging origin/main` conflicts on 7 paths (`candidate/merge-tree.out`). It changes no
other path, so main holds nothing else that staging lacks.

### Disposition of the seven main-only commits

| Commit | Subject | Paths | Disposition | Proof |
|---|---|---|---|---|
| `4fc021df1` | Merge branch 'staging' (2026-04-06) | 74 (book-v2, pricing, workflowRun …) | **Absorbed. No net content.** | Both parents are in staging, and no path it touched differs between the merged tree and staging. |
| `ed168d83b` | Merge branch 'staging' (2026-04-06) | 11 (pricing, book-v2) | **Absorbed. No net content.** | Same: second parent `5f9313c53` is in staging, and no residual diff. |
| `753a99764` | Queue Row Builder V2 + Financial Config centered expansion (2026-07-01) | 6 | **Duplicate. Take staging.** | Same `patch-id --stable` (`61312678deed`) as staging's `f5d388659`, landed 43 min later. Staging then evolved every file (QueueRowBuilderV2.tsx 17 commits, FocusPanelCardRenderer 26, SurfacesConfigurationPage 13, coordination model 13, test 6). It deleted `BillingPreviewCard.tsx` in `704ca302b` (2026-09-06) and mounts the builder from `QueueRowSurfaceEditor.tsx`. |
| `80ff5bf59` | Merge PR #56 (2026-07-01) | carries only `753a99764` | **Take staging.** | As above. |
| `7204dff44` | chore(repo-ops): promote repository-operational metadata (2026-09-14) | `vacilando-tier2.yml` | **Superseded by `bbfbec76d`.** | Intermediate version of one file. |
| `4e920e4f0` | same (2026-09-14) | `vacilando-tier2.yml` | **Superseded by `bbfbec76d`.** | Same. |
| `bbfbec76d` | same (2026-09-15) | `vacilando-tier2.yml` | **Keep main's copy.** This is the one path where the candidate is not staging. | Main's copy is staging's plus a retirement header, minus `on: schedule` (`cron: "0 11 * * *"`). GitHub runs schedules only from the default branch, `main`, so taking staging's copy would re-arm a retired Vacilando nightly. The candidate's copy parses, with triggers `[workflow_dispatch]` only. |

Of staging's 11 workflow files, only `vacilando-tier2.yml` declares a schedule. One workflow,
`enrollment-configuration-certification.yml`, also triggers on pushes to `main`. That is expected.

### Promotion hazards (why the candidate is not promotable on its own)

| ID | Hazard | Evidence |
|---|---|---|
| **H1** | **`main` auto-deploys production.** `web/vercel.json` enables `main`, and `web/scripts/vercel-ignored-build.sh` proceeds for `main`. So fast-forwarding `main` builds staging's code for www.workwithalloy.com against production's Supabase project (`vslwnntzzgpnmrpjipat`), which holds the 134-table schema. The app expects 334 tables. | `deployment-and-environments.md`, P2 |
| **H2** | `web/vercel.json` is absent on `main` today, and it carries a Vercel Cron (`*/5 * * * *` → `/api/scheduled-work/wake`). Vercel registers crons only from a Production deployment, so the **first** `main` deploy of the candidate starts a production clock. Staging, a Preview deployment, has never registered one. | `web/vercel.json`, deployment doc §Scheduled work |
| **H3** | F7's pg_cron fallback URL is staging's, so the production database's vault needs `scheduled_work_wake_url` before its wake credential. | F7 |
| **H4** | `data.sql` (P3 X1a, auth session and refresh-token rows) is on both `main` and `staging`. The candidate neither adds nor removes it. A history purge is still separate. | P3 X1a |

## Checks run, and outcomes

| Check | Where | Outcome |
|---|---|---|
| Full staging migration chain on a fresh database | throwaway | **PASS**: 557/557 |
| Catalog census, fingerprints, K-items, row census, two rolled-back trials | throwaway | recorded above (F3–F8) |
| Root `npm run test:trust-db-certification` (`scripts/certify-trust-db.sh`) | `git archive` extract of the candidate (`certification`, `supabase`, `scripts`) in `/tmp`. Its suites use their own disposable `postgres:17-alpine`, not the shared stack. | **PASS**: 132 assertions across 9 suites (`candidate/trust-db-certification.log`) |
| `scripts/local-dev/tests/development-repository-metadata-promotion.test.mjs`, which reads `vacilando-tier2.yml` and asserts the tested-ref and lineage lines | candidate extract | **PASS**: 20/20 |
| `scripts/local-dev/tests/development-metadata-executor.test.mjs` | candidate extract | **PASS**: 29/29 |
| `scripts/local-dev/tests/development-registered-action-dispatch-contract.test.mjs` | candidate extract | **4 pass, 7 fail. Environment problem, not the candidate.** Every failure is the fixture's own `git push -q origin main` to a local test remote, refused by this session's injected `url.henry-blocked-push://.pushInsteadOf`. All 28 refusals in the log are that helper. The file is byte-identical on staging. Fixed on this branch in `f4f118707`, with the guard left untouched: the fixture seeds its bare origin by fetching into it instead of pushing, then checks without pushing whether the guard is active (`git remote get-url --push origin` differs from the fetch URL). When it is, D1/D1a/R1/R1a run the same real dispatch and check the refused push (`metadata_push_failed`, not `metadata_promote_threw`; origin `main` unmoved) and the built commit (one commit directly on the approved `main`, touching only the workflow file). Unguarded, the original success-path assertions run unchanged. Focused run there (`node <file>`): **11 cases, `# pass 11` / `# fail 0`**, exit 0. (`node --test <file>` wraps the file as one test and prints `# tests 1 / # pass 1`; that is the file, not the case count.) **R1's success-shape check is not measured under the guard**: a successful result needs a real push, so guarded R1 checks only the refusal result's fields and prints that it was not measurable. It stays measured only where no guard is injected. The candidate keeps staging's copy, which passes in CI, where no guard is injected. |
| Migration counts by ref (`candidate/migration-counts.sh`), added by E6R | git objects only | recorded in [Migration counts by ref](#migration-counts-by-ref) |
| YAML parse of the candidate's `vacilando-tier2.yml` | `backend/.venv` PyYAML | **PASS**: triggers `[workflow_dispatch]`, job `extended` |
| `web` lint / typecheck / vitest | not run | The candidate's tree equals staging's except for one YAML file that no web code reads, so a web run would re-test staging. Staging's own CI is the record for those. |

## Owner actions remaining

1. **O1 (P3 decisions 2–10).** Answer them, and run STG-CENSUS, which should also read the ledger *versions* (F2). Until then no
   KEEP-CONFIG item can be authored.
2. **O2 (F4).** Accept that metric placements, entity layouts and household role types move from KEEP-CODE to KEEP-CONFIG.
3. **O3 (F3).** Choose what to do about the W-17 org on every rebuild. Recommendation: a guarded follow-up migration that **retires**
   `_w17_selftest_%` orgs (delete is blocked by the document-category guard). Or accept it as a known, inert fixture.
4. **O4 (F6).** Choose how Firefly's org is re-created on a rebuilt staging, given that the app has no production org-creation path. The options are the
   dev helper under owner supervision, or building a governed path first.
5. **O5 (F7/H3).** Per environment, set vault `scheduled_work_wake_url` before `scheduled_work_wake_credential`.
6. **O6 (H1/H2), the promotion itself.** First, the PR with green CI (see below). Then sequence it as: production database brought to the staging schema (or rebuilt), with
   P2's snapshot as the fallback → decide whether production should run the Vercel Cron → only then fast-forward `main` to
   `ea06c21f3401…`. This is a push to `main` and a production deploy, so it needs Kelly's explicit authorization. It was not
   attempted.
7. **O7.** Before promoting, re-fetch and re-run `candidate/build-candidate.sh <new staging> <new main>`. A staging that has moved gives a
   new SHA, and the disposition above still holds as long as `main` has not moved.

## Integration through a pull request with green CI — open, gated

The slice's last criterion is a PR from the candidate to `main` with green CI. **It is not met.** There is no PR and no CI
run. Opening one needs a push, and both CLAUDE.md (§Git / deploy) and this run's push guard forbid that until Kelly authorizes
it. This record cannot close the criterion. Only an authorized run can.

What an authorized run does:

1. Re-run `candidate/build-candidate.sh <origin/staging> <origin/main>` after a fetch (O7). Confirm `main` still fast-forwards.
2. Push the candidate to a **non-protected** branch, e.g. `candidate/aly-14-p4-staging-to-main`. This is safe to do on its own:
   `web/scripts/vercel-ignored-build.sh` skips every ref except `staging`/`main`/`master`, so it starts no Vercel deploy.
3. Open the PR `candidate/aly-14-p4-staging-to-main` → `main`, marked **do not merge** until O6 is done.
4. Wait for green. The candidate's `pull_request` workflows are `enrollment-configuration-certification`,
   `trust-adoption-certification`, `trust-db-certification` and `web-prebuild-gates`, which are unfiltered. The path-filtered ones,
   which all match because the diff from `main` touches `web/**`, `backend/**`, `docs/**` and `supabase/migrations/**`, are
   `web-typecheck`, `backend-comms-tests`, `docs-lint`, `operational-expectations-gates`, `surfaces-focus-panel-certification`
   and `waitlist-ordering-gates`. `vacilando-tier2` is `workflow_dispatch` only and does not run.
5. **Merging** the PR is the production deploy (H1/H2). It stays behind O6, however green CI is.

A green PR is evidence about the code. It does not clear H1–H3.

## What was not done

- No push, merge, PR, deploy, fetch or branch switch. The candidate exists only as a local commit object and ref. So the slice's *PR with green CI* criterion is open (see above).
- No hosted database, credential, external host or live dataset was used. No staging or production row was read.
- No KEEP-CONFIG item was loaded (see Scope). No migration was written. F3's fix is an owner decision.
- `web` checks were not run, for the reason given in the table.
