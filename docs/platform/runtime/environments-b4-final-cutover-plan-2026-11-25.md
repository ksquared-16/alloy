---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Final cutover plan for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (slice B4), for the owner's approval at briefing step 6b. It orders the first-promotion briefing into one timed list and records the local dress rehearsal. Nothing here authorizes a live action, and no calendar date is fixed (D8).
---

# Environments and promotion — final cutover plan (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice B4. This is the
[first-promotion briefing](environments-p1s-first-promotion-briefing-2026-11-25.md) turned into **one ordered list** for
the owner's approval: for every step it gives the time, who acts, the exact command or dashboard action, the pass
condition, and where the go/no-go and rollback points are. Decisions D1–D11 are the briefing's, and none is reopened here. The
commands are the briefing's §4.1 and §5.6.1 and the runbook `release runbook` prints. Where this plan and the briefing
differ, the reason is a dress-rehearsal finding, and the briefing has been corrected to match (§5).

**Status: proven only locally.** Every row below says whether the B4 dress rehearsal ran it (**L**), or whether it needs a
hosted service, a dashboard or a person and so could not be rehearsed (**—**). Nothing has touched staging, production,
hosted Supabase, Vercel, Render or a GitHub remote. The evidence is in
[`environments-b4-dress-rehearsal-evidence-2026-11-25/`](environments-b4-dress-rehearsal-evidence-2026-11-25/).

**Who acts.**

- **Owner**: Kelly. Holds every production credential, and is present with Vercel, Render and Supabase for the whole
  window (D8). In the window the owner types only credentials (`read -rs`, never echoed) and the step-8 approval, and
  acts in the dashboards.
- **Operator**: the Developer, through the release tool and the tenant commands, in the Mac mini operator session with
  the transcript recording on (D11). The Operator runs the commands exactly as approved. Nothing is improvised in the
  window.
- **Development Lead** and **Database Engineer**: the step-6 reviewers. The Development Lead also confirms the
  prerequisites closed at step 6b.

**Shell names** (as in the briefing §4.1): `REL="node scripts/release/alloy-release.mjs"`, `SHA` = the step-2 candidate,
`NEW` = the new project's ref, `DIR=releases/<date>-${SHA:0:12}`, `C="--config $DIR/release-config.json"`,
`M="--manifest $DIR/manifest.json"`, `A="--audit $DIR/audit.jsonl $M --approval $DIR/approval.json"`.
`$PRODUCTION_DB_URL` and `$PRODUCTION_DB_URL_READONLY` are the **new** project's `postgres` and read-only roles on port
5432; `$STAGING_DB_URL_READONLY` is staging's read-only role. They exist only in the session.

## 1. The dress rehearsal, in one table

`b4-dress-rehearsal.sh` ran the whole first promotion locally: steps 1–3, 5, the step-6 export, 7–9 and 11–17, and the
§7 rollback branches. It ran against a throwaway Supabase Postgres standing in for the new project, which sat on an
internal Docker network with no egress, so the chain's staging fallback could reach nothing. Every release-tool and tenant
command ran from a scratch worktree of the simulated candidate, as the window will run them from the rebuilt candidate's
checkout. Only the database and HTTP targets were stand-ins. The final run is `rehearsal-run.txt`, on branch head `9725de629` and candidate `e33220afe711`, with timings in
`timings.tsv`. The generated runbook is kept as `release/runbook.txt`. Teardown removed every container, network, scratch database and the scratch worktree.

| Step | Window slot | Budget | Measured | Result |
|---|---|---|---|---|
| 1 staging merge (simulated: `git merge-tree` + `commit-tree` onto `origin/staging`, no push) | before | — | 0 s | merge-tree exit 0 |
| 2 rebuild (P4 `build-candidate.sh`) + `identify` **without** `--allow-tree-diff` | before | — | 4 s | exit 0, `tree_diff_from_staging: []`, `main` fast-forwards |
| 3 recount (P4 `migration-counts.sh`) + recheck | before | — | 1 s | 558 files, head `20261223090000` (the W-17 migration, the one file step 1 adds); no `schedule:` in any workflow; `DrawerSummaryStripBoundary` outside `web/tests/` only in its definition, `featureFlag.ts` |
| 5 config copy (`first-promotion-config --new-ref`) | before | — | 0 s | exit 0 |
| 6 export (`tenant:config:export`, from the E2 Firefly seed) | before | — | 0 s | sites 3, rooms 17, household role types 6, Enrollment process 1 |
| 7 identify, staging verification, plan, `prepare --first-promotion`, runbook | T+0:00–0:25 | 25 min | 19 s | `prepare` exit 0 |
| 8 `approve` + `record owner.approval` | T+0:25–0:30 | 5 min | 0 s | exit 0 (rehearsal environment; production `approve` needs the owner's terminal) |
| 9 `fp_target`, `pg_dump`, `check-ledger`, ledger table, the chain, census, `check-production --stage schema` | T+0:30–1:30 | 60 min | 90 s | 558/558 applied in 89 s; fingerprint equals the staging stand-in's; orgs: only `_w17_selftest_<hex>` `retired`; exit 0 |
| 10 platform settings | T+1:30–1:45 | 15 min | — | dashboards only: not rehearsable |
| 11 deploy (the candidate's own `/api/build-info` handler with a production deployment's environment) | T+1:45–2:00 | 15 min | 4 s | build-info serves the candidate, `main`, `production`, on the new ref |
| 12 Vault `scheduled_work_wake_url` | T+2:00–2:03 | 3 min | 1 s | reads back as the production-origin stand-in. Before it, the job resolved to `https://staging.workwithalloy.com/…` and a tick by hand sent nothing |
| 13 Vault `scheduled_work_wake_credential` | T+2:03–2:05 | 2 min | 0 s | present |
| 14 observe a **real** `pg_cron` tick | T+2:05–2:10 | 10 min | 103 s | the wait is to the next `*/5` boundary (275 s in the run before this one). `wake_count` 0 → 1; `net._http_response` 200 from the production stand-in; 0 non-2xx; no staging target; Vercel-Cron-shaped calls (no bearer, any bearer with `CRON_SECRET` unset, a wrong `x-cron-token`) all 401 and wake nothing |
| 15 §8 post-checks that need no hosted service | T+2:10–2:20 | 10 min | 1 s | build-info and the backend's `/build-info` serve the candidate; `check-production --stage final` exit 0; orgs: only the retired W-17 org. **T+2:20: keep** |
| 16 Firefly: `tenant:create` dry run and run, import plan and apply, census, verify | T+2:25–2:50 | 25 min | 3 s | 27 items written; `verify` 9/9 PASS; orgs: Firefly `active` and the W-17 org `retired` |
| 17 `record schema.contract skip`, `record release.record`, `verify-audit` | T+2:50–3:00 | 10 min | 1 s | `verify-audit` exit 0, 568 entries |
| R1 step 16 fails → 16.R | inside T+2:25–2:50 | — | 1 s | refused while a customer row exists (`window_closed`); after it is removed, rollback exit 0; census equals the pre-step-16 baseline; orgs equal step 9's |
| R2 T+2:20 roll back: clock, then code, then record | T+2:20 onward | — | 3 s | credential deleted; a tick by hand sends nothing; build-info serves old `main` on the old ref; `record code.rollback` and `verify-audit` exit 0 |
| R2b the next real tick after the rollback | — | — | 290 s | the cron run happens; `wake_count` and responses unchanged |
| R3 step 9 fails mid-chain | T+0:30–1:30 | — | 16 s | 40 files applied, the 41st fails (injected): ledger keeps 40 rows, the failing file left nothing; `check-ledger` refuses to resume; `plan --first-promotion` refuses the partial project (`first_promotion_ledger_not_empty`) |

**What the timings mean.** The local commands use about 4 minutes of the window's 180. Most of it is step 9 (90 s) and
the wait for a `*/5` tick at step 14 (103 s; at worst five minutes). The rest of the window is set by what could not be rehearsed: the owner's dashboard work
(step 10), a real Vercel production build and a Render deploy (step 11), the hosted chain over the network (step 9), and
the typed confirmations at steps 16.3 and 16.5. **The T+ times below are deadlines, not start times.** Each step starts as
soon as the one before it passes. Step 9 will finish well before T+1:30, which gives step 11 the room it needs (§4, F4).

## 2. The ordered plan

**L** = run in the B4 dress rehearsal (local stand-ins only). **—** = not rehearsable locally. **GO/NO-GO** and
**ROLLBACK** rows are decision points.

### 2.1 Before the window (no calendar date: each starts when the one before it is done)

| # | Who | Command or dashboard action | Pass condition | Rehearsed |
|---|---|---|---|---|
| **1** | Owner authorizes; Developer pushes | Merge `objective/environments-and-promotion` into `staging`, as a merge that keeps staging's commits (never a reset). Apply `20261223090000_w17_selftest_org_retirement.sql` to hosted staging through staging's normal migration path | Staging `/api/build-info` serves the merge SHA (allow 15–20 minutes after the merge); staging CI green; staging's ledger holds `20261223090000`; staging's orgs read Firefly and the two ZZ Alloy QA fixtures `active`, Alloy Bend `retired`, `_w17_selftest_0bbaad43` `retired` | L (merge simulated with git objects) |
| **2** | Developer | Freeze merges to `staging` until step 17. `git fetch origin`; `bash docs/platform/runtime/environments-p4-evidence-2026-11-25/candidate/build-candidate.sh origin/staging origin/main`; `$REL identify --candidate "$SHA"` with **no** `--allow-tree-diff` | `identify` exit 0, `tree_diff_from_staging: []`, fast-forward. Otherwise stop (briefing §2): fix staging, back to step 1 | L |
| **3** | Developer | `migration-counts.sh origin/staging origin/main "$SHA"`; `git grep -E '^\s*schedule:' "$SHA" -- .github/workflows/`; `git grep DrawerSummaryStripBoundary "$SHA" -- web` | 558 files (557 plus the W-17 migration), head `20261223090000`; no `schedule:`; no reader outside `web/tests/` except `featureFlag.ts` | L |
| **4** | Owner authorizes; Developer pushes | Push `$SHA` to a non-deploying branch (the Vercel ignored-build step skips any branch but `staging` and `main`); open its PR to `main` marked *do not merge*; read the real check-run names | Every `release-config.json` `required_checks` name has a `success` check-run on `$SHA` (M6) | — |
| **5** | Owner (Supabase); Developer | Owner: create the new project in `us-west-2`, record its ref, create the read-only role, choose the backup/PITR tier (M7). Developer: `$REL first-promotion-config --new-ref "$NEW" --out "$DIR/release-config.json"` | Ref, role, tier and `$DIR` recorded; the config copy names the new ref and `previous_supabase_project_ref` `vslwnntzzgpnmrpjipat`. **The old project is not touched** | L (config copy) |
| **6** | Owner; Operator; Development Lead; Database Engineer | Owner: the dashboard reads into the owner's secret store (C-FLAG-1 with every F value and `NEXT_PUBLIC_APP_ENV`, C-CLOCK-1, C-CLOCK-2, C-MSG-1, C-O-1, C-RB-1, C-RB-2, C-RB-3, C-REN-1, C-REN-2), and the name of Firefly's first admin account. Operator: the export from staging, read-only (briefing §5.6.1, *Step 6*). Reviewers: the export, line by line, and the step-16 command list | Every §6 row of the briefing marked. The export approved by its sha256 (`<export-sha256>`), with the owner's keep/drop answer on the 17 rooms added after the 2026-09-19 capture (P3 C5) and no lane work units in the file. Both reviewers' approval recorded | L (export from the seed) |
| **6b** | Development Lead; Owner | The Development Lead confirms every §3 item below closed, with evidence. The owner approves **this plan**, filled in with `$SHA`, `$NEW` and `<export-sha256>`, and books **T**: the earliest three-hour slot at which the owner can be present with all three dashboards. A weekend slot is allowed | Approval and T recorded in `$DIR` | — |

### 2.2 The window (T = the booked start)

| T+ (deadline) | # | Who | Command or dashboard action | Pass condition | Rehearsed |
|---|---|---|---|---|---|
| 0:00 | **7** | Operator; Owner | `git fetch origin`; `$REL identify --candidate "$SHA"`; staging build-info, check-runs, staging ledger, fingerprint and orgs; production build-info, the new project's ledger (`ledger-if-present`) and fingerprint; `plan --first-promotion`; `prepare --first-promotion $C …`; `runbook $M $C > $DIR/runbook.md` (briefing §4.1, *Step 7*). Owner re-reads C-RB-1 and C-RB-2 | Every §3 item closed; `identify` exit 0 with no allowance; staging serves the head `$SHA` was built from, on `ikaxilmwmrmbagoidedu`; production serves old `main` on `vslwnntzzgpnmrpjipat`; new project `tables\|0` and an empty ledger; `prepare` exit 0 with `mode: first_promotion` and chain 558 | L |
| 0:25 | **GO/NO-GO 1** | Owner | Read `$DIR/runbook.md` | Any step-7 failure is a **no-go**: nothing has been touched. Cancel and book the next window (6b) | — |
| 0:25 | **8** | Owner | `$REL approve $M $C --approver Kelly --confirm <12> --ttl-hours 4` at the **owner's own terminal** (refused from an agent session); then the Operator runs `$REL record $C $A --step owner.approval --status pass --detail '{}'` | Approval in the chain, covering the window; scopes include `snapshot`, `schema_contract`, `code_rollback` | L (rehearsal environment) |
| 0:30 | **9** | Operator; Owner types `$PRODUCTION_DB_URL` | Runbook sections 5–6: `fp_target "$PRODUCTION_DB_URL"`; `pg_dump -Fc` of the empty project and `record production.snapshot`; `check-ledger`; `emit-sql ledger-table`; for each version of `apply-order`: `emit-apply … \| psql "$PRODUCTION_DB_URL" --single-transaction …` with the `ON_ERROR_STOP` variable on then `record schema.expand --status applied`, stopping at the first failure; the census; `check-production --stage schema … --census`; `record schema.expand --status pass` | `fp_target` accepts only the new ref on port 5432; 558/558 applied; `check-production --stage schema` exit 0: ledger is the candidate's versions, fingerprint equals **hosted staging's** from step 7, `rls_disabled` 0, orgs only `_w17_selftest_<hex>` `retired`, six extensions, bucket `org_documents` | L (local; hosted latency not measured) |
| 1:30 | **HOLD point** | Owner | — | Step 9 not passed by T+1:30, or any file failed: **hold** (§4 R-B). Production still serves the old build on the old project | L (R3) |
| 1:30 | **10** | Owner (dashboards) | Supabase §5.1 (exposed schemas, Auth provider, Site URL, redirects, pooling); Vercel Production scope §5.2 (R rows on the new project, `CRON_SECRET` **unset**, F rows at staging's values, both drawer-strip keys, S and X rows absent, L rows unset; Vercel Cron Jobs disabled if the dashboard allows); Render §5.3 saved **without deploying** (if C-REN-2 says a save redeploys, Render's values move to just before step 11's Render deploy) | Every §5.1–§5.3 row set and re-read; `NEXT_PUBLIC_*` in place before step 11's build | — |
| 1:45 (start as soon as step 10 passes) | **11** | Operator; Owner (Render) | Runbook section 7: `git ls-remote origin main` equals step 2's base; `git push origin "$SHA":refs/heads/main` (fast-forward, never `--force`); poll `https://www.workwithalloy.com/api/build-info` until it serves `$SHA` on `$NEW`; `record code.deploy`. Then the owner deploys Render on `$SHA` | build-info: `gitSha` `$SHA`, `gitBranch` `main`, `vercelEnv` `production`, `supabaseProjectRef` `$NEW`; Render `/build-info` `git_commit` `$SHA` | L (route handler with a production deployment's environment) |
| 2:00 | **12** | Owner (Supabase Vault) | Create `scheduled_work_wake_url` = the production origin + `/api/scheduled-work/wake`. **Unconditional, and first** | Reads back as the production origin | L |
| 2:03 | **13** | Owner (Supabase Vault) | Create `scheduled_work_wake_credential` = production's `INTERNAL_CRON_TOKEN`, only after step 12 reads back | Secret present | L |
| 2:05 | **14** | Operator | Watch for up to ten minutes: `select wake_count, last_wake_at from public.scheduled_work_clock`; `select status_code, error_msg from net._http_response order by id desc limit 5`; `cron.job_run_details`; Vercel's cron log, if any | `wake_count` advances; 2xx from production; no request to staging; any Vercel Cron call is 401 | L (a real tick) |
| 2:10 | **15** | Operator; Owner (dashboard re-read) | Runbook section 8: build-info, ledger, fingerprint and orgs, read-only; `check-production $C $M --build-info … --stage final`; `record production.verify`. Owner re-reads I-2, I-3, I-10, I-11, I-13; checks `/login` renders; confirms the old project unchanged | Every briefing §8 *Step 15* row passes | L (build-info, backend build-info, `check-production`, orgs, clock) — (settings, `/login`, old project) |
| **2:20** | **KEEP / ROLL BACK** | Owner decides | Keep if every step-15 row passed and no §4 trigger fired. Otherwise **roll back now** (§4 R-C) | — | L (R2) |
| 2:20 | **15b** | Operator | `$REL emit-sql census \| psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > "$DIR/census-before-step16.txt"`; `diff "$DIR/census-extras.txt" "$DIR/census-before-step16.txt"` | The diff names only `scheduled_work_attempts`, `scheduled_work_occurrences` and `scheduled_work_clock` rows (the first tick's one-time `clock_activation_certification`, P4 F8). Anything else written between step 9 and here: stop and do not start step 16 | L |
| 2:25 | **16** | Operator; Owner (Auth dashboard) | Briefing §5.6.1, 16.0–16.6: 16.0 the session (`read -rs ALLOY_OPERATOR_SERVICE_ROLE_KEY`); 16.1 the owner adds the named admin in Authentication → Users; 16.2 `tenant:create … --dry-run`; 16.3 `tenant:create` (type the slug); 16.4 `tenant:config:import plan … --expect-sha256 <export-sha256>`; 16.5 `apply` (type the org id's first 8); 16.6 the census, then `verify … --baseline "$DIR/census-before-step16.txt"` | 16.2 lists only the retired W-17 org; 16.4 every line `create`, `<N> to create, 0 to complete, 0 already present, 0 present but different`; 16.5 `✓ wrote <N> item(s)`; 16.6 `✓ all 9 checks passed`; orgs: Firefly `active` and the W-17 org `retired` | L |
| 2:50 | **STOP point** | Owner | — | Step 16 not passed by T+2:50: stop (§4 R-D). Production stays verified with no tenant; step 16 moves to a later session with the owner present | L (R1) |
| 2:50 | **17** | Operator | Runbook sections 9–10: `record schema.contract --status skip`; `record release.record`; `verify-audit "$DIR/audit.jsonl"`; the transcript and every log into `$DIR` | `verify-audit` exit 0 | L |
| 3:00 | — | — | The window closes. The staging freeze and the staging migration restriction lift. `$DIR` is committed afterwards as the release's evidence | — | — |

## 3. Prerequisites still open before the window

Nothing below is closed by this document. Built and rehearsed on this branch (locally only): the W-17 migration (B1, M2),
main's retired workflow file (B1, M9), the first-promotion mode and the config generator (B2, M3, M4), the step-16
commands, the export and the removal (B3, M5, M8), and this dress rehearsal (B4). Each of them **closes only when step 1
puts it on `staging`**.

**Owner dashboard actions**

1. Step 5, Supabase: create the `us-west-2` project and record its ref; create its read-only role; choose its
   backup/PITR tier (M7).
2. Step 6, dashboard reads into the owner's secret store: C-FLAG-1 (every F key staging's Vercel Preview scope sets,
   with its value, and `NEXT_PUBLIC_APP_ENV`), C-CLOCK-1 (staging's `last_wake_at` advancing), C-CLOCK-2 (whether
   Vercel lets Cron Jobs be disabled), C-MSG-1 (staging's Render cron, if any), C-O-1, C-RB-1 (production's current
   Vercel deployment id), C-RB-2 (Render's current values and deploy), C-RB-3 (Instant Rollback reaches that deployment),
   C-REN-1 (Render deploy branch and auto-deploy), C-REN-2 (whether saving Render's environment redeploys).
3. Step 6: name Firefly's first admin account (email and full name), and give the keep/drop answer on the 17 rooms
   added after the 2026-09-19 capture (P3 C5).
4. Before step 10: generate production's new values into the secret store: `INTERNAL_CRON_TOKEN` (shared by Vercel and
   Render) and the three signing secrets, each distinct (I-2). They are not copied from staging.
5. Step 6b: approve this plan in its final form and book T.

**Owner-approved repository steps**

1. Step 1: the merge of `objective/environments-and-promotion` into `staging` (a push), and the W-17 migration applied to
   hosted staging through staging's normal path.
2. Step 2: the staging freeze, held from step 2 until step 17 (every other lane holds its staging merges).
3. Step 4: the push of the candidate to a non-deploying branch and its *do not merge* PR to `main`, for CI (M6).
4. In the window, step 11's push of `$SHA` to `main` is authorized by the step-8 approval; nothing else is pushed.

**Anything else**

1. Step 6: the Development Lead and the Database Engineer review and approve the staging export by hash, and the step-16
   command list (M5, M8).
2. Step 6: the Operator runs the export against staging's read-only role. The B4 export came from the local E2 seed, so
   the real item counts are not known until then.
3. Step 6b: the Development Lead confirms M1–M9 and the C-rows closed with evidence.
4. The Mac mini operator session: a worktree of `$SHA`, transcript recording on, `psql` and `node`, a clean shell with no
   `SUPABASE_*` variables set (the tenant commands refuse otherwise).
5. After the window: the committed `scripts/release/release-config.json` moves to the new ref in the next release (M4).

## 4. Rollback points and triggers

**R-A, steps 7–8 (no-go).** Nothing has been touched. Cancel the window and book the next feasible one (6b).

**R-B, step 9 (hold).** A failed file leaves nothing, and production still serves the old build on the old project. The
dress rehearsal (R3) showed that a partly built project **cannot be resumed or re-planned**: `check-ledger` refuses the
moved ledger, and `plan --first-promotion` refuses any non-empty ledger (`first_promotion_ledger_not_empty`). So the
hold ends in one way only: delete and recreate the new project (step 5), fix forward with a new candidate if a file was at
fault (back to step 1), and repeat from step 7 in a later window.

**R-C, T+2:20 (roll back production to the old project).** In this order, as R2 rehearsed:

1. **Clock first.** Owner deletes `scheduled_work_wake_credential` from the **new** project's Vault. The job then sends
   nothing (R2: a tick by hand sent nothing, and the next real tick left `wake_count` unchanged). The old build carries no
   `vercel.json` cron.
2. **Vercel.** Owner: Instant Rollback to the C-RB-1 deployment. Operator: poll build-info until it serves `main`
   `bbfbec76d779` on `vslwnntzzgpnmrpjipat`.
3. **Render.** Owner: restore the C-RB-2 values and roll back to the recorded deploy.
4. **Record.** Operator: `record production.verify --status fail`, then `record code.rollback --status pass`, then
   `verify-audit` (R2: both exit 0).
5. `main` stays at the candidate. Fix forward, never force-push. Undo Instant Rollback only with a fixed candidate.

**R-D, step 16 fails its checks (16.R; production stays live and verified).** `tenant:rollback-sql | psql
"$PRODUCTION_DB_URL" -v org_id=… -v org_name='Firefly Early Learning'`. Then the census must equal
**`census-before-step16.txt`** (not step 9's census, §5 F2), and the orgs must equal step 9's. If either differs, or the
rollback refuses, the other branch applies: recreate the new project and repeat from step 9 in a later window.

**Roll back at T+2:20 when** (briefing §7):

1. production `/api/build-info` does not serve `$SHA` on the new ref, or is not `vercelEnv` `production` on `main`;
2. `check-production --stage final` fails (ledger, fingerprint versus staging, a table without RLS, a QA or
   staging-seed org, a self-test org not `retired`);
3. `/login` or `/api/build-info` returns 5xx, or the Vercel build fails;
4. step 14 sees no tick within ten minutes, or any `pg_net` request targets staging;
5. the backend `/build-info` does not serve `$SHA`, or its Supabase project differs from Vercel's.

**Hold, not roll back**, when step 9 fails (R-B). **Stop, not roll back**, when step 16 fails or runs past T+2:50 (R-D).
If step 11's Vercel build fails, production keeps serving the old deployment on the old project. Render is then not
deployed, and the release is recorded as failed at `code.deploy`.

**When rollback stops being possible.** Rolling back after step 16 discards only Firefly's configuration, which the
reviewed export can re-apply. The window really closes when the first real record (a customer, lead, contact, child or
transaction) is written: 16.R then refuses (`window_closed`, rehearsed in R1). From then on, recovery is the new project's
backups/PITR and P6's *Data damage* row, with a new owner approval.

## 5. Dress-rehearsal findings

- **F1. The release CLI exited 0 silently when started through a symlinked path** (macOS `/tmp` is `/private/tmp`). It
  compared `import.meta.url` with `argv[1]` as strings, so from a worktree under `/tmp` it ran no command and printed
  nothing. Fixed: it now compares real paths, and a test starts it through a symlinked directory (`9725de629`). In the
  window, a silent exit 0 would have read as a pass.
- **F2. Step 16's baseline is the census after step 15, not step 9's.** The first `pg_cron` tick runs the chain's one-time
  `clock_activation_certification` (P4 F8) and writes one `scheduled_work_attempts` row and one
  `scheduled_work_occurrences` row. In the first dress run, `verify` against step 9's census failed `census_write_set` on
  exactly those two rows (that run's output was replaced; the final run's `release/census-step9-to-before-step16.diff`
  shows the two rows). The plan adds step 15b: take the census at T+2:20 and check that only the clock moved, then use
  it as the baseline for 16.6 and for 16.R. Briefing §5.6.1 and §7 are corrected to match.
- **F3. `apply-order` throws an unhandled `EPIPE` when its reader closes early** (`… | head`). This is harmless: the
  runbook's loop reads the whole list. The rehearsal now reads it from a file.
- **F4. Step 11's slot is shorter than staging's observed deploy latency.** Staging takes 15–20 minutes to serve a
  merged commit, and step 11's slot is 15 minutes, plus a Render deploy. Locally, step 9 used 90 s of its 60 minutes. So
  the T+ times are deadlines: step 10 starts when step 9 passes, and step 11 when step 10 passes. If step 11 has not passed
  by T+2:20, that is trigger 1.
- **F5. Hosted step 9 will be slower than 89 s.** There are 558 `psql` sessions over TLS to `us-west-2`, each followed by a
  `record`. This was not measured. At even 1–2 s per file it is 10–20 minutes, well inside T+1:30.

## 6. What is proven only locally

Proven locally (stand-ins: the database, Auth/REST, the deployment's HTTP handlers and the production origin): the
candidate build and `identify` with no allowance, the counts, the config copy, `prepare`, `approve`, the hash-chained
audit, the 558-file chain and its census, the fingerprint against a staging stand-in built by staging's path, the clock
from a real `pg_cron` tick through Vault and `pg_net`, the refused Vercel-Cron-shaped calls, `check-production --stage
final`, the whole of step 16, 16.R, the clock-and-code rollback, and the step-9 failure path.

**Not proven anywhere yet**: a hosted Supabase project's platform schemas before the chain (the rehearsal ran GoTrue and
Storage migrators, which must **not** be run on a hosted project); hosted latency at step 9; the real staging
fingerprint and orgs; real CI check-run names (M6); the owner's dashboard settings (step 10); a real Vercel production
build, `web/vercel.json` cron registration and Instant Rollback (C-RB-3); a Render deploy and its environment save
(C-REN-2); the real staging export's content; `/login` rendering; and that the old project is unchanged.

## 7. Earliest feasible window

The window can be booked once 6b is done, and 6b waits on the slowest prerequisite chain:

| Chain | Elapsed, once started |
|---|---|
| Step 1 authorized → merge → staging serves it (15–20 min) → staging migration applied → staging CI green | about 1–2 hours |
| Steps 2–3 | about 15 minutes |
| Step 4 authorized → push → PR CI green on `$SHA` | the length of one CI run (not measured here) |
| Step 5 (owner, Supabase) and the step-6 reads (owner, dashboards) | about 1–2 hours of owner time, in parallel with the above |
| Step 6 export, then the reviews by the Development Lead and the Database Engineer | the reviewers' availability |
| 6b approval | minutes |

**Estimate:** if the owner authorizes steps 1 and 4 and the two reviewers are available the same day, every
prerequisite can close within **one working day**. The earliest feasible window is then **the first three-hour slot
after 6b** at which the owner can be present with all three dashboards: the next day at the earliest, and a weekend slot
is allowed. A short gap also keeps the staging freeze, which starts at step 2, short. The date is booked at 6b (D8), not
here.
