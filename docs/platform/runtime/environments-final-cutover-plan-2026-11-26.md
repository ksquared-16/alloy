---
owner: runtime
status: proposed
last_reviewed: 2026-11-26
supersedes: [docs/platform/runtime/environments-b4-final-cutover-plan-2026-11-25.md]
status_note: Final cutover plan for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (slice B4), for the owner's approval at briefing step 6b. It orders the first-promotion briefing into one timed list, writes in the owner's 2026-11-25 decisions (PITR, Firefly's admin, the window date, the step-16 operator, no lanes carried, rooms at the export review), and records the second local dress rehearsal. The window is Tue Dec 1, 09:00–12:00 PT, if the owner approves this plan by Sun Nov 29; otherwise Tue Dec 8, 09:00–12:00 PT, with the same setup. Nothing here authorizes a live action.
---

# Environments and promotion — final cutover plan (2026-11-26)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice B4. ALY-14: the first promotion
of Alloy staging to a **new** Supabase production project in AWS `us-west-2`. The old project, `vslwnntzzgpnmrpjipat`, is
not touched, and it is the rollback target.

This is the [first-promotion briefing](environments-p1s-first-promotion-briefing-2026-11-25.md) as **one ordered list**
for the owner's approval. For each step it gives the T+ deadline, who acts, the exact command or dashboard action, the
pass condition and any go/no-go or rollback point. It replaces the
[2026-11-25 plan](environments-b4-final-cutover-plan-2026-11-25.md). The structure is the same. What changed: the owner's
decisions are now written in (§0), a CI blocker was found and fixed (F6, §5), the step-16 rollback is followed by a
re-run (R1b), and a fresh dress rehearsal was run on the fixed branch (§1). The commands are the briefing's §4.1 and §5.6.1,
plus the runbook that `release runbook` prints. Briefing decisions D1–D11 still stand, except that the owner has now fixed
D8's date (§0). D12, who types the operator commands, is new in this plan (§0).

**Status: proven only locally.** Each row says whether the dress rehearsal ran it (**L**), or whether it needs a hosted
service, a dashboard or a person and so could not be rehearsed locally (**—**). Nothing has touched staging, production,
hosted Supabase, Vercel, Render or a GitHub remote. Evidence:
[`environments-b4-dress-rehearsal-evidence-2026-11-26/`](environments-b4-dress-rehearsal-evidence-2026-11-26/).
The script is
[`environments-b4-dress-rehearsal-evidence-2026-11-25/b4-dress-rehearsal.sh`](environments-b4-dress-rehearsal-evidence-2026-11-25/b4-dress-rehearsal.sh).

## 0. Owner decisions written into this plan (2026-11-25)

| # | Decision | Where it lands |
|---|---|---|
| **O-PITR** | **Decided.** The new project uses **point-in-time recovery with 7 days of retention** (a paid add-on), enabled on the new project **before the window** | Step 5 (owner, Supabase dashboard). Pass: PITR is enabled with 7-day retention, and the project shows a restore point before T. This closes M7's backup half. It is not an open choice |
| **O-ADMIN** | **Decided (Q1).** **Firefly's first admin is the owner's own existing Auth account.** The owner invites Firefly's staff afterwards, from the app | Step 16.1: the owner adds that account in the new project's Authentication → Users. `<admin-user-id>`, `<admin-email>` and `<admin-full-name>` are the owner's own. They are typed in the session and not written in any repository file. Nobody else is named as first admin |
| **O-WHEN** | Window **Tue Dec 1 2026, 09:00–12:00 PT**, if the owner approves this plan (step 6b) **by the end of Sun Nov 29**. Otherwise **Tue Dec 8 2026, 09:00–12:00 PT** | T = 09:00 PT on the window day (17:00 UTC; `pg_cron` runs in UTC). §2.1 gives the deadline for each step before the window |
| **D12** | **A named human operator, `<operator-name>`** (to be named by the owner), runs the step-16 commands and any other operator-run command, while the owner watches. The session transcript is recorded | Step 16 (16.0, 16.2–16.6) and 16.R. That person types the §5.6.1 commands in the Mac mini operator session. Steps the Developer runs through the release tool stay with the Developer. The transcript is filed in `$DIR` at step 17 |
| **O-LANES** | **No work lanes are carried.** Lanes are set up in the **Work Unit Queue** screen right after step 16 | The reviewed export must name no lane work units (16.4 then plans no `blocked` items). New step **16L**: the owner, signed in as Firefly's admin, sets up the lanes in the app |
| **O-ROOMS** | Which rooms Firefly gets (the 17 rooms added after the 2026-09-19 capture, which may be test rooms) is **decided by the owner at the step-6 export review** | Step 6: keep/drop rooms one by one, then the export is re-hashed. `<export-sha256>` is the hash after the owner's edits |

**Who acts.**

- **Owner**: holds every production credential and is present with Vercel, Render and Supabase for the whole window.
  In the window, the owner types only credentials (`read -rs`, never echoed) and the step-8 approval, works in the
  dashboards, and does step 16.1 and step 16L in the app.
- **Developer (release tool)**: Claude Code, working through the release tool in the Mac mini operator session with the
  transcript recording on. It runs steps 2, 3, 5's config copy, 6's export, 7, 9, 11, 14, 15, 15b and 17 exactly as
  approved. Nothing is improvised in the window.
- **Operator, `<operator-name>`** (D12, to be named by the owner): a named human, not the Developer. Types step 16's
  commands (16.0, 16.2–16.6, and 16.R if needed) and any other operator-run command in the same session, while the
  owner watches. The transcript records every command.
- **Development Lead** and **Database Engineer**: review the export and the step-16 command list at step 6. The
  Development Lead also confirms at 6b that every prerequisite is closed.

**Shell names** (as in briefing §4.1): `REL="node scripts/release/alloy-release.mjs"`, `SHA` = the step-2 candidate,
`NEW` = the new project's ref, `DIR=releases/<date>-${SHA:0:12}`, `C="--config $DIR/release-config.json"`,
`M="--manifest $DIR/manifest.json"`, `A="--audit $DIR/audit.jsonl $M --approval $DIR/approval.json"`.
`$PRODUCTION_DB_URL` and `$PRODUCTION_DB_URL_READONLY` are the **new** project's `postgres` role and read-only role on
port 5432. `$STAGING_DB_URL_READONLY` is staging's read-only role. These exist only in the session.

## 1. The dress rehearsal (second run, 2026-11-26)

`b4-dress-rehearsal.sh` runs the whole first promotion locally: steps 1–3, 5, the step-6 export, 7–9 and 11–17, and the §3
rollback branches. The new project is a throwaway Supabase Postgres on an internal Docker network with no egress. Every
release-tool and tenant command runs from a scratch worktree of the simulated candidate. Only the database and the HTTP
targets are stand-ins. This run is on branch head `9d22f21f8`, which includes the F6 fix, and adds **R1b**, a re-run of
step 16 after its rollback. Full output: `rehearsal-run.txt`. Timings: `timings.tsv`. Teardown removed every container,
network, scratch database and the scratch worktree.

| Step | Window slot | Budget | Measured | Result |
|---|---|---|---|---|
| 1 staging merge (simulated: `git merge-tree` + `commit-tree` onto the local `origin/staging` ref, no fetch, no push) | before | — | 0 s | merge-tree exit 0; simulated staging `0990bc02ccc5` |
| 2 rebuild (P4 `build-candidate.sh`) + `identify` **without** `--allow-tree-diff` | before | — | 4 s | candidate `1927cab3495b`; exit 0, `tree_diff_from_staging: []`, `main` fast-forwards |
| 3 recount (P4 `migration-counts.sh`) + recheck | before | — | 1 s | **558** files, head `20261223090000`; no `schedule:` in any workflow; `DrawerSummaryStripBoundary` outside `web/tests/` only in `featureFlag.ts` |
| 5 config copy (`first-promotion-config --new-ref`) | before | — | 1 s | exit 0 |
| 6 export (`tenant:config:export`, from the E2 Firefly seed) | before | — | 0 s | sites 3, rooms 17, household role types 6, Enrollment process 1; no lane work units |
| 7 identify, staging verification (check-runs under the six F6 job names), plan, `prepare --first-promotion`, runbook | T+0:00–0:25 | 25 min | 18 s | `prepare` exit 0, manifest `4970f91b3a64` |
| 8 `approve` + `record owner.approval` | T+0:25–0:30 | 5 min | 0 s | exit 0 (rehearsal environment; production `approve` needs the owner's terminal) |
| 9 first-promotion apply: `fp_target`, `pg_dump`, `check-ledger`, ledger table, the chain, census, `check-production --stage schema` | T+0:30–1:30 | 60 min | 85 s | 558/558 applied in 85 s; fingerprint equals the staging stand-in's; orgs: only `_w17_selftest_<hex>` `retired`; exit 0 |
| 10 platform settings | T+1:30–1:45 | 15 min | — | dashboards only: not rehearsable |
| 11 deploy (the candidate's own `/api/build-info` handler with a production deployment's environment) | T+1:45–2:00 | 15 min | 4 s | build-info serves the candidate, `main`, `production`, on the new ref |
| 12 Vault `scheduled_work_wake_url` | T+2:00–2:03 | 3 min | 1 s | before it, the job resolved to `https://staging.workwithalloy.com/…` and a hand tick sent nothing; after it, reads back as the production-origin stand-in |
| 13 Vault `scheduled_work_wake_credential` | T+2:03–2:05 | 2 min | 0 s | present |
| 14 clock check, locally simulatable parts: a **real** `pg_cron` tick | T+2:05–2:10 | 10 min | 92 s | tick after 91 s (the wait is to the next `*/5`); `wake_count` 0 → 1; `net._http_response` 200 from the production stand-in; 0 non-2xx; no staging target; Vercel-Cron-shaped calls all 401 and wake nothing |
| 15 §8 checks that need no hosted service | T+2:10–2:20 | 10 min | 0 s | build-info and the backend's `/build-info` serve the candidate; `check-production --stage final` exit 0; orgs: only the retired W-17 org. **T+2:20: keep** |
| 15b census before step 16 | T+2:20 | — | (in 15) | diff from step 9: only `scheduled_work_attempts` +1 and `scheduled_work_occurrences` +1 |
| 16 Firefly via §5.6.1: `tenant:create` dry run and run, import plan and apply, census, verify | T+2:25–2:50 | 25 min | 4 s | 27 items written; `verify` 9/9 PASS; orgs: Firefly `active`, the W-17 org `retired` |
| 17 `record schema.contract skip`, `record release.record`, `verify-audit` | T+2:50–3:00 | 10 min | 0 s | `verify-audit` exit 0 |
| R1 step 16 fails → 16.R | inside T+2:25–2:50 | — | 1 s | refused while a customer row exists (`window_closed`); after it is removed, rollback exit 0; census equals the pre-step-16 baseline; orgs equal step 9's |
| **R1b** step 16 re-run after 16.R (same Auth user, same baseline) | inside T+2:25–2:50 | — | 4 s | 16.2 lists only the W-17 org; new org `b35c27ef`; 27 to create, 27 written; `verify` **9/9 PASS** |
| R2 T+2:20 roll back: clock, then code, then record | T+2:20 onward | — | 3 s | credential deleted; a hand tick sends nothing; build-info serves old `main` on the old ref; `record code.rollback` and `verify-audit` exit 0 |
| R2b the next real tick after the rollback | — | — | 300 s | cron runs 1 → 2; `wake_count` and responses unchanged (1 → 1) |
| R3 step 9 fails mid-chain | T+0:30–1:30 | — | 8 s | 40 files applied, the 41st fails (injected); the ledger keeps 40; `check-ledger` refuses to resume; `plan --first-promotion` refuses the partial project (`first_promotion_ledger_not_empty`) |

Window steps 7–17 used about 3½ minutes of local time in all, against 180 minutes. Teardown: `containers=[] networks=[]
scratch_db=[] scratch_worktree=[0]`; script exit 0.

**What the timings mean.** The local commands use a few minutes of the window's 180. Most of that is step 9 and the wait
for a `*/5` tick at step 14 (five minutes at most). The rest of the window goes to what could not be rehearsed: the
owner's dashboard work (step 10), a real Vercel production build and a Render deploy (step 11), the hosted chain over the
network (step 9, F5), and the typed confirmations in step 16. **The T+ times below are deadlines, not start times.** Each
step starts as soon as the one before it passes.

**Step 1 in detail (the candidate).** The step-1 merge was simulated with git objects only: `git merge-tree` of this
branch into the local `origin/staging` ref, then `commit-tree`. Nothing was fetched or pushed. P4's `build-candidate.sh`
rebuilt the candidate from that merge. `release identify` ran **without** `--allow-tree-diff`: exit 0,
`tree_diff_from_staging: []`, and `main` fast-forwards. `migration-counts.sh` counts **558** migration files with head
`20261223090000`, the W-17 migration, which is the only file step 1 adds.

**The `serviceClientPrincipalCheck` test does not block step 4.** `web/tests/access/serviceClientPrincipalCheck.test.ts`
fails on this branch and on `origin/staging` alike: `expected 29 to be 27`, 1 failed and 19 passed. Two later commits
raised the allowlist ceiling `max_subject_unresolved` from 27 to 29 (`dd1225f39`, `93e41ea8d`) but did not update the
test's pinned value. No required check runs that test file:

- `Prebuild gates (route capabilities)` runs `npm run prebuild`, which runs the check *script*
  (`check:service-client-principal`). The script exits 0 against the 29 ceiling.
- The typecheck jobs compile the test but do not run it.
- `Trust Adoption certification`, `Trust DB certification` and `Enrollment configuration certification` run fixed file
  lists that do not include `tests/access/`.

So step 4 is not blocked. The fix, if it is ever wanted, is a follow-up outside this cutover: change the test's pinned
value from 27 to 29, and add the two dated steps (27→28, 28→29) to its history comment.

**F6, found and fixed while checking this: the required check names could never match.** See §5. Before the fix, every
real check-run would have failed step 7.

## 2. The ordered plan

**L** = run in the dress rehearsal (local stand-ins only). **—** = not rehearsable locally. **GO/NO-GO**, **HOLD**,
**KEEP / ROLL BACK** and **STOP** rows are decision points.

### 2.1 Before the window

The deadlines are for the **Tue Dec 1** window. If 6b misses the end of Sun Nov 29, the window becomes Tue Dec 8, and
the staging freeze lifts and steps 2–4 are redone in the week of Dec 7, so staging is not frozen for nine extra days.
The Dec 8 window has the same setup, hours and T+ offsets. An earlier window would need the owner's separate decision.

| # | Deadline | Who | Command or dashboard action | Pass condition | Rehearsed |
|---|---|---|---|---|---|
| **1** | Fri Nov 27 | Owner authorizes; Developer pushes | Merge `objective/environments-and-promotion` into `staging` as a merge that keeps staging's commits (never a reset). Apply `20261223090000_w17_selftest_org_retirement.sql` to hosted staging through staging's normal migration path | Staging `/api/build-info` serves the merge SHA (allow 15–20 minutes after the merge). Staging CI is green. Staging's ledger holds `20261223090000`. Staging's orgs read Firefly and the two ZZ Alloy QA fixtures `active`, Alloy Bend `retired` and `_w17_selftest_0bbaad43` `retired`. **Done:** staging is `93c56aee7417` (PR #1649), which contains this branch's `afda81b77`. At 2026-11-26T12:41:45Z staging's build-info served `gitSha` `93c56aee7417`, `gitBranch` `staging`, `supabaseProjectRef` `ikaxilmwmrmbagoidedu` (HTTP 200). This read did not check CI, the ledger or the orgs | L (merge simulated with git objects) |
| **2** | Fri Nov 27 | Developer | Freeze merges to `staging` until step 17. Then `git fetch origin`; `bash docs/platform/runtime/environments-p4-evidence-2026-11-25/candidate/build-candidate.sh origin/staging origin/main`; `$REL identify --candidate "$SHA"` with **no** `--allow-tree-diff` | `identify` exit 0, `tree_diff_from_staging: []`, fast-forward. Otherwise stop (briefing §2): fix staging and go back to step 1<br>**Done 2026-11-26 (C1):** after `git fetch origin`, `origin/staging` = `93c56aee7417ea03038303a1bda24da03ae16583` (the PR #1649 merge, containing `afda81b77`), `origin/main` = `bbfbec76d7795cc3392b0c61e1c8ce829adaf9d2`. `build-candidate.sh` gave `SHA=195e9a282885429cb13629f4de23dc83437eb3c5` (tree `a0368a422bf1`, parents staging and main). `identify` exit 0, `fast_forward: true`, `tree_diff_from_staging: []`, 558 migrations, baseline 229. Staging `/api/build-info` served `93c56aee7417` on `ikaxilmwmrmbagoidedu` from 12:38:20Z (merge at 12:31:45Z; until then it served `8321949771f7`) | L |
| **3** | Fri Nov 27 | Developer | `migration-counts.sh origin/staging origin/main "$SHA"`; `git grep -E '^\s*schedule:' "$SHA" -- .github/workflows/`; `git grep DrawerSummaryStripBoundary "$SHA" -- web` | 558 files, head `20261223090000`. No `schedule:`. No reader outside `web/tests/` except `featureFlag.ts`<br>**Done 2026-11-26 (C1):** staging and `$SHA` each have 558 files, 558 distinct versions, head `20261223090000`; main 229 files; `differing_paths=0`. The `schedule:` grep finds nothing. `DrawerSummaryStripBoundary` is read only in `web/lib/layout/featureFlag.ts` and `web/tests/layout/drawerSummaryStripBoundaryFlag.test.ts` | L |
| **4** | Sat Nov 28 | Owner authorizes; Developer pushes | Push `$SHA` to a non-deploying branch (Vercel's ignored-build step skips every branch except `staging` and `main`). Open its PR to `main` marked *do not merge*. Save `gh api repos/ksquared-16/alloy/commits/$SHA/check-runs` as `$DIR/check-runs.json` | Each of the six `required_checks` (`Trust DB certification`, `Trust Adoption certification`, `Enrollment configuration certification`, `Prebuild gates (route capabilities)`, `Production graph`, `Full graph (tests + scripts)`) has a `completed`/`success` run on `$SHA` (M6). A name missing from the real check-runs is a stop: fix the config through step 1<br>**Prepared 2026-11-26 (C1), not pushed:** `objective/environments-and-promotion` fast-forwarded from `afda81b77` to `$SHA`; `git merge-base --is-ancestor origin/main $SHA` holds. Its PR to `main` is the *do not merge* CI PR. Push, PR and `check-runs.json` wait for the owner. This record is committed on top of `$SHA` on the local branch `objective/environments-and-promotion-c1-record`, so the PR head stays `$SHA`. `test:settings-checklist` failed on `$SHA` for `web:AUDIT_EVENT_MISMATCH`, an error code from PR #1647; the record commit lists it as not a setting. No workflow runs that test, so it does not block step 4 | — (names checked against the workflow files by a test, F6) |
| **5** | Sat Nov 28 | Owner (Supabase); Developer | Owner: create the new project in `us-west-2` and record its ref; create the read-only role; **enable PITR with 7-day retention** (O-PITR). Developer: `$REL first-promotion-config --new-ref "$NEW" --out "$DIR/release-config.json"` | Ref, role, PITR and `$DIR` are recorded. The config copy names the new ref, with `previous_supabase_project_ref` `vslwnntzzgpnmrpjipat`. **The old project is not touched** | L (config copy) |
| **6** | Sun Nov 29 | Owner; Developer; Development Lead; Database Engineer | Owner: the C-row dashboard reads into the owner's secret store (§4 a.3). Developer: the export from staging, read-only (briefing §5.6.1, *Step 6*); the owner types the staging read-only URL. Reviewers: the export line by line, and the step-16 command list. Owner: **keep or drop each of the 17 later rooms** (O-ROOMS). Firefly's first admin is already decided: the owner's own existing Auth account (O-ADMIN); the owner invites Firefly's staff after the window | The briefing's §6 rows are all marked. The file names **no lane work units** (O-LANES). The owner's room answers are applied and the file re-hashed: `<export-sha256>`. Both reviewers' approval is recorded | L (export from the seed) |
| **6b** | **end of Sun Nov 29** | Development Lead; Owner | The Development Lead confirms every §4 item closed, with evidence. The owner approves **this plan**, filled in with `$SHA`, `$NEW`, `<export-sha256>` and `<operator-name>`. The approval selects the window: Dec 1 or Dec 8 | Approval recorded in `$DIR` | — |
| **Nov 29** | **GO/NO-GO 0** (end of Sun Nov 29) | Owner | Read whether 6b is recorded | **Go:** 6b approved by the end of Sun Nov 29, so T = **Tue Dec 1, 09:00 PT**. **No-go:** T = **Tue Dec 8, 09:00 PT**, with the same setup; steps 2–4 are redone in the week of Dec 7, and 6b is still needed before Dec 8 | — |

### 2.2 The window (T = 09:00 PT on the window day)

| T+ (deadline) | # | Who | Command or dashboard action | Pass condition | Rehearsed |
|---|---|---|---|---|---|
| 0:00 | **7** | Developer; Owner | `git fetch origin`; `$REL identify --candidate "$SHA"`; staging build-info, check-runs, staging ledger, fingerprint and orgs; production build-info, the new project's ledger (`ledger-if-present`) and fingerprint; `plan --first-promotion`; `prepare --first-promotion $C …`; `runbook $M $C > $DIR/runbook.md` (briefing §4.1, *Step 7*). Owner re-reads C-RB-1 and C-RB-2 | Every §4 item closed. `identify` exit 0 with no allowance. Staging serves the head `$SHA` was built from, on `ikaxilmwmrmbagoidedu`. Production serves old `main` on `vslwnntzzgpnmrpjipat`. The new project reads `tables\|0` with an empty ledger. `prepare` exit 0 with `mode: first_promotion` and chain 558 | L |
| 0:25 | **GO/NO-GO 1** | Owner | Read `$DIR/runbook.md` | Any step-7 failure is a **no-go**. Nothing has been touched yet. Cancel: if T was Dec 1, the window moves to Dec 8 | — |
| 0:25 | **8** | Owner | `$REL approve $M $C --approver Kelly --confirm <12> --ttl-hours 4` at the **owner's own terminal** (it is refused from an agent session). Then the Developer runs `$REL record $C $A --step owner.approval --status pass --detail '{}'` | The approval is in the chain and covers the window. Its scopes include `snapshot`, `schema_contract` and `code_rollback` | L (rehearsal environment) |
| 0:30 | **9** | Developer; Owner types `$PRODUCTION_DB_URL` | Runbook sections 5–6, in order: `fp_target "$PRODUCTION_DB_URL"`; `pg_dump -Fc` of the empty project and `record production.snapshot`; `check-ledger`; `emit-sql ledger-table`; then, for each version in `apply-order`, `emit-apply … \| psql "$PRODUCTION_DB_URL" --single-transaction …` with the `ON_ERROR_STOP` variable on, followed by `record schema.expand --status applied`, stopping at the first failure. Then the census, `check-production --stage schema … --census`, and `record schema.expand --status pass` | `fp_target` accepts only the new ref on port 5432. 558/558 applied. `check-production --stage schema` exit 0: the ledger is the candidate's versions; the fingerprint equals **hosted staging's** from step 7; `rls_disabled` is 0; the only org is `_w17_selftest_<hex>`, `retired`; six extensions; bucket `org_documents` | L (local; hosted latency not measured) |
| 1:30 | **HOLD point** | Owner | — | If step 9 has not passed by T+1:30, or any file failed: **hold** (§3 R-B). Production still serves the old build on the old project | L (R3) |
| 1:30 | **10** | Owner (dashboards) | Supabase §5.1: exposed schemas, Auth provider, Site URL, redirects, pooling, SMTP. Vercel Production scope §5.2: R rows on the new project, `CRON_SECRET` **unset**, F rows at staging's values, both drawer-strip keys, S and X rows absent, L rows unset, Vercel Cron Jobs disabled if the dashboard allows. Render §5.3, saved **without deploying**. If C-REN-2 says a save redeploys, Render's values move to just before step 11's Render deploy | Every §5.1–§5.3 row is set and re-read. `NEXT_PUBLIC_*` are in place before step 11's build | — |
| 1:45 (start as soon as 10 passes) | **11** | Developer; Owner (Render) | Runbook section 7: check that `git ls-remote origin main` equals step 2's base; `git push origin "$SHA":refs/heads/main` (fast-forward, never `--force`); poll `https://www.workwithalloy.com/api/build-info` until it serves `$SHA` on `$NEW`; `record code.deploy`. Then the owner deploys Render on `$SHA` | Build-info shows `gitSha` `$SHA`, `gitBranch` `main`, `vercelEnv` `production`, `supabaseProjectRef` `$NEW`. Render `/build-info` shows `git_commit` `$SHA` | L (route handler with a production deployment's environment) |
| 2:00 | **12** | Owner (Supabase Vault) | Create `scheduled_work_wake_url` = the production origin + `/api/scheduled-work/wake`. **This always happens, and it comes first** | Reads back as the production origin | L |
| 2:03 | **13** | Owner (Supabase Vault) | Create `scheduled_work_wake_credential` = production's `INTERNAL_CRON_TOKEN`, only after step 12 reads back | The secret is present | L |
| 2:05 | **14** | Developer | Watch for up to ten minutes: `select wake_count, last_wake_at from public.scheduled_work_clock`; `select status_code, error_msg from net._http_response order by id desc limit 5`; `cron.job_run_details`; and Vercel's cron log, if there is one. *Locally simulatable parts, rehearsed:* the job's target before step 12 (staging), an inert hand tick before step 13, a real `*/5` tick after it, and Vercel-Cron-shaped calls refused | `wake_count` advances. 2xx from production. No request to staging. Any Vercel Cron call gets 401 | L (a real tick) |
| 2:10 | **15** | Developer; Owner (dashboard re-read) | Runbook section 8: build-info, ledger, fingerprint and orgs, read-only; `check-production $C $M --build-info … --stage final`; `record production.verify`. Owner re-reads I-2, I-3, I-10, I-11 and I-13, checks that `/login` renders, and confirms the old project is unchanged | Every row of briefing §8 *Step 15* passes | L (build-info, backend build-info, `check-production`, orgs, clock) — (settings, `/login`, old project) |
| **2:20** | **KEEP / ROLL BACK** | Owner decides | Keep if every step-15 row passed and no §3 trigger fired. Otherwise **roll back now** (§3 R-C) | — | L (R2) |
| 2:20 | **15b** | Developer | `$REL emit-sql census \| psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > "$DIR/census-before-step16.txt"`; `diff "$DIR/census-extras.txt" "$DIR/census-before-step16.txt"` | The diff names only `scheduled_work_attempts`, `scheduled_work_occurrences` and `scheduled_work_clock` rows: the first tick's one-time `clock_activation_certification` (F2). If anything else was written between step 9 and here, stop and do not start step 16 | L |
| 2:25 | **16** | Operator `<operator-name>` (D12); Owner watches, and does 16.1 in the Auth dashboard | Briefing §5.6.1, 16.0–16.6. **16.0** the session (`read -rs ALLOY_OPERATOR_SERVICE_ROLE_KEY`). **16.1** the owner adds **their own existing account** (`<admin-email>`) in Authentication → Users ("Add user", email confirmed, with a password so that 16L can sign in), and the operator copies its id, `<admin-user-id>`, into `ADM`. **16.2** `tenant:create … --dry-run`. **16.3** `tenant:create` (type the slug). **16.4** `tenant:config:import plan … --expect-sha256 <export-sha256>`. **16.5** `apply` (type the first 8 characters of the org id). **16.6** the census, then `verify … --baseline "$DIR/census-before-step16.txt"` | 16.2 lists only the retired W-17 org. In 16.4 every line is `create`, with `<N> to create, 0 to complete, 0 already present, 0 present but different` and no `blocked` item (no lanes, O-LANES). 16.5 prints `✓ wrote <N> item(s)`. 16.6 prints `✓ all 9 checks passed`. Orgs: Firefly `active` and the W-17 org `retired`. `memberships` and `auth_users` show exactly the owner's account | L |
| 2:50 | **STOP point** | Owner | — | If step 16 has not passed by T+2:50: stop (§3 R-D). Production stays verified, with no tenant, and step 16 moves to a later session with the owner and `<operator-name>` present | L (R1, R1b) |
| 2:50 | **16L** | Owner (in the app, as Firefly's admin) | Sign in at `https://www.workwithalloy.com/login` with the 16.1 account. Set up Firefly's lanes in the **Work Unit Queue** screen. No lanes are carried by the export (O-LANES); this is the owner's task right after step 16. Inviting Firefly's staff follows later (O-ADMIN) | Sign-in works; the lanes are saved and show in the queue. This is the first real sign-in to production | — |
| 2:50 | **17** | Developer | Runbook sections 9–10: `record schema.contract --status skip`; `record release.record`; `verify-audit "$DIR/audit.jsonl"`. File the transcript and every log in `$DIR` | `verify-audit` exit 0 | L |
| 3:00 | — | — | The window closes, 12:00 PT. The staging freeze and the staging migration restriction lift. `$DIR` is committed afterwards as the release's evidence | — | — |

## 3. Rollback (briefing §7): triggers and decision points

There are four decision points. Each one names its trigger, who decides, and what happens next.

**R-A, steps 7–8 (no-go).** Trigger: any step-7 check fails, or the owner withholds approval. Nothing has been touched.
Cancel the window and book the next one (Dec 8 if this was Dec 1; after that, the next date the owner gives).

**R-B, step 9 (hold).** Trigger: a migration file fails, or the step is not done by T+1:30. A failed file leaves nothing
behind, and production still serves the old build on the old project. The rehearsal (R3) showed that a partly built
project **cannot be resumed or re-planned**: `check-ledger` refuses the moved ledger, and `plan --first-promotion`
refuses any non-empty ledger (`first_promotion_ledger_not_empty`). So a hold ends one way only: delete and recreate the
new project (step 5, with PITR again), fix forward with a new candidate if a file was at fault (back to step 1), and
repeat from step 7 in a later window.

**R-C, T+2:20 (roll production back to the old project).** The owner decides. Roll back if any of these is true:

1. production `/api/build-info` does not serve `$SHA` on the new ref, or is not `vercelEnv` `production` on `main`;
2. `check-production --stage final` fails: the ledger, the fingerprint against staging, a table without RLS, a QA or
   staging-seed org, Alloy Bend's id, or a self-test org that is not `retired`;
3. `/login` or `/api/build-info` returns 5xx, or the Vercel build fails;
4. step 14 sees no tick within ten minutes, or any `pg_net` request targets staging;
5. the backend `/build-info` does not serve `$SHA`, or its Supabase project differs from Vercel's.

Order, as R2 rehearsed:

1. **Clock first.** The owner deletes `scheduled_work_wake_credential` from the **new** project's Vault. The job then
   sends nothing: in R2, a tick by hand sent nothing, and the next real tick left `wake_count` unchanged.
2. **Vercel.** The owner does an Instant Rollback to the C-RB-1 deployment. The Developer polls build-info until it
   serves `main` `bbfbec76d779` on `vslwnntzzgpnmrpjipat`.
3. **Render.** The owner restores the C-RB-2 values and rolls back to the recorded deploy.
4. **Record.** The Developer runs `record production.verify --status fail`, then `record code.rollback --status pass`,
   then `verify-audit` (R2: both exit 0).
5. `main` stays at the candidate. Fix forward, and never force-push. Undo the Instant Rollback only with a fixed
   candidate.

**Does B2's Alloy Bend check matter for rolling back to the old project? No.** B2's `checkProductionTenantIsolation`
fails whenever Alloy Bend's id (`7803388d-…`) is in a production org listing, retired or not, and that includes the old
project. Whether the old project holds that id is unknown: P3 B1 says its single org is unreadable under RLS. The check
runs only inside `check-production` (stage `schema` and `final`), and those stages always target the release config's
production project, which in a first promotion is the **new** one. The rollback path never runs them. It checks the old
project only through build-info (Instant Rollback, then a build-info poll) and records `code.rollback`. Step 7's
`production (before)` check reads build-info only, never orgs. `first-promotion-config --new-ref` refuses the old ref.
Probe output: `alloy-bend-rollback-probe.txt`. There is one consequence: **do not use `check-production` to "verify" the
old project after a rollback.** It may fail on Alloy Bend's id, and that would be a false alarm about a project D2 leaves
as it is. After a rollback, verify with build-info and the owner's dashboard read of the old project.

**R-D, step 16 fails its checks (16.R; production stays live and verified).** The operator, `<operator-name>` (D12), runs,
while the owner watches:
`tenant:rollback-sql | psql "$PRODUCTION_DB_URL" -v org_id=… -v org_name='Firefly Early Learning'`. Afterwards the
census must equal **`census-before-step16.txt`** and the orgs must equal step 9's. Then step 16 may be repeated from 16.2
in the same window if the cause is fixed and the STOP point has not passed: R1b rehearsed exactly this, with the same
Auth user and the same baseline, and got 9/9 again. If the rollback refuses, or either comparison differs, take the
other branch: recreate the new project and repeat from step 9 in a later window.

**When rollback stops being possible.** Rolling back after step 16 or 16L throws away only Firefly's configuration and
lanes. 16.R removes every row of the org from every table with an `org_id` column, so it removes the lanes too. That has
not been rehearsed with lanes, though, only without them. The window really closes when the first real record is written
(a customer, lead, contact, child or transaction): from then on 16.R refuses (`window_closed`, rehearsed in R1). After
that, recovery means a 7-day PITR restore into a new project (O-PITR) and P6's *Data damage* row, with a new owner
approval.

## 4. Prerequisites still open

Nothing below is closed by this document. Built and rehearsed **on this branch only**: the W-17 migration (B1), main's
retired workflow file (B1), the first-promotion mode and the config generator (B2), the step-16 commands, the export and
the removal (B3), this rehearsal and the F6 check names (B4). Each of them **closes only when step 1 puts it on
`staging`**.

**(a) Owner dashboard actions**

1. **Step 5, Supabase:** create the `us-west-2` project and record its ref; create its read-only role; enable PITR with
   7-day retention (O-PITR, decided), a paid add-on, on the new project before the window. PITR also needs a compute
   add-on, so add both at step 5.
2. **Step 5, Supabase:** confirm that the new project's region is `us-west-2`, beside Vercel's `pdx1` functions (I-14).
3. **Step 6, C-row reads into the owner's secret store:** C-FLAG-1 (every F key staging's Vercel Preview scope sets,
   with its value, plus `NEXT_PUBLIC_APP_ENV`); C-CLOCK-1 (staging's `last_wake_at` advancing); C-CLOCK-2 (whether Vercel
   lets Cron Jobs be disabled); C-MSG-1 (staging's Render cron, if any); C-O-1; C-RB-1 (production's current Vercel
   deployment id); C-RB-2 (Render's current values and deploy); C-RB-3 (whether Instant Rollback reaches that
   deployment); C-REN-1 (Render deploy branch and auto-deploy); C-REN-2 (whether saving Render's environment redeploys).
4. **Before step 10:** generate production's new secrets into the secret store: `INTERNAL_CRON_TOKEN` (shared by Vercel
   and Render) and the three signing secrets, each distinct (I-2). None is copied from staging.
5. **Before step 16:** Supabase Auth SMTP for production (I-19), if Firefly's admin will invite anyone. The owner's own
   16.1 account gets a password, so the window itself does not need SMTP.

**(b) Owner-approved repository steps**

1. **Step 1:** merge `objective/environments-and-promotion` into `staging` (a push), and apply the W-17 migration to
   hosted staging through staging's normal path.
2. **Step 2:** the staging freeze, held from step 2 until step 17. Every other lane holds its staging merges.
3. **Step 4:** push the candidate to a non-deploying branch and open its *do not merge* PR to `main`, for CI (M6).
4. In the window, step 11's push of `$SHA` to `main` is authorized by the step-8 approval. Nothing else is pushed.

**(c) Owner answers**

1. **Name the operator** (`<operator-name>`, D12). This person runs the step-16 commands while the owner watches, and
   must be available on the window day, 09:00–12:00 PT, with access to the Mac mini operator session.
2. **Rooms** (O-ROOMS): keep or drop each of the 17 rooms added after 2026-09-19, at the step-6 export review.
3. **Approval of this plan by the end of Sun Nov 29** (step 6b, GO/NO-GO 0) for the Tue Dec 1 window; otherwise Tue Dec 8.

Firefly's first admin is not an open item: it is the owner's own existing Auth account (O-ADMIN).

**After the window (owner task, not a prerequisite):** set up Firefly's lanes in the Work Unit Queue screen right after
step 16 (16L, O-LANES), then invite Firefly's staff.

**(d) Anything else**

1. **Step 6 reviews:** the Development Lead and the Database Engineer review the staging export by hash, and the step-16
   command list (M5, M8).
2. **Step 6 export, for real:** the Developer runs the export against staging's read-only role. The rehearsal's export
   came from the local E2 seed (3 sites, 17 rooms, 6 household role types, 1 process), so the real item counts are not
   known until then. The reviewers confirm that it names no lane work units.
3. **Step 6b:** the Development Lead confirms M1–M9 and the C-rows closed, with evidence.
4. **The Mac mini operator session:** a worktree of `$SHA`, transcript recording on, `psql` and `node`, and a clean shell
   with no `SUPABASE_*` variables set (the tenant commands refuse otherwise).
5. **After the window:** the committed `scripts/release/release-config.json` moves to the new ref in the next release
   (M4).
6. **Follow-up, not blocking:** the `serviceClientPrincipalCheck` test's pinned 27 (§1).

## 5. Dress-rehearsal findings

- **F1. The release CLI exited 0 silently when started through a symlinked path** (`9725de629`, first run). Fixed.
- **F2. Step 16's baseline is the census after step 15, not step 9's.** The first tick writes the one-time
  `clock_activation_certification` rows. This is step 15b.
- **F3. `apply-order` throws `EPIPE` when its reader closes early.** Harmless: the runbook's loop reads the whole list.
- **F4. Step 11's slot is shorter than staging's observed deploy latency** (15–20 minutes). The T+ times are deadlines,
  and step 11 starts as soon as step 10 passes. If step 11 has not passed by T+2:20, that is trigger 1.
- **F5. Hosted step 9 will be slower than the local run.** It runs 558 `psql` sessions over TLS to `us-west-2`. Not
  measured. At 1–2 s per file, that is 10–20 minutes, well inside T+1:30.
- **F6 (new). `required_checks` named workflow files, not jobs, so step 7 could never pass.** GitHub names a check-run
  after the job's `name:`, and `checkStaging` matches on exactly that name. The config listed `trust-db-certification`,
  `web-typecheck` and the other workflow file names. No real check-run carries those names, so staging verification
  would have failed at step 7 however green CI was. The rehearsals hid this because they generated their check-runs
  from the config. Fixed in `9d22f21f8`: the six job names (web-typecheck has two jobs), and a release-procedure test
  that requires each name to be a job run by a `pull_request`. The test fails on the old names. Step 4 still confirms the
  names against real check-runs (M6).
- **F7 (new). The `serviceClientPrincipalCheck` test is red on staging, and no required check runs it** (§1). It does
  not block anything, but it shows that a red test file can sit unseen on `staging`.

## 6. What is proven only locally

**Proven locally**, against stand-ins for the database, Auth/REST, the deployment's HTTP handlers and the production
origin:

- the candidate build and `identify` with no allowance, and the counts;
- the check names against the workflow files (F6);
- the config copy, `prepare`, `approve` and the hash-chained audit;
- the 558-file chain and its census, and the fingerprint against a staging stand-in built by staging's own path;
- the clock, from a real `pg_cron` tick through Vault and `pg_net`, and the refused Vercel-Cron-shaped calls;
- `check-production --stage final`;
- all of step 16, then 16.R, then the step-16 re-run (R1b);
- the clock-then-code rollback, and the step-9 failure path;
- that the Alloy Bend check stays out of the rollback path.

**Not proven anywhere yet:**

- the platform schemas a hosted Supabase project has before the chain runs (the rehearsal ran GoTrue and Storage
  migrators, which must **not** be run on a hosted project);
- hosted latency at step 9;
- the real staging fingerprint and orgs;
- real CI check-run names on `$SHA` (M6);
- PITR on the new project;
- the owner's dashboard settings (step 10);
- a real Vercel production build, `web/vercel.json` cron registration and Instant Rollback (C-RB-3);
- a Render deploy and its environment save (C-REN-2);
- the content of the real staging export;
- `/login` rendering, the first real sign-in, and lane setup (16L);
- whether the old project holds Alloy Bend's id, and that the old project is unchanged.

## 7. Summary for the owner (one page)

**What happens.** Alloy's production moves to a brand-new Supabase database in `us-west-2`, built from scratch from
staging's 558 migrations. The current production database (`vslwnntzzgpnmrpjipat`) is not changed at all. If anything
goes wrong before Firefly is set up, production points back at it.

**When.** **Tuesday Dec 1, 09:00–12:00 PT**, if you approve this plan by the end of **Sunday Nov 29**. Otherwise
**Tuesday Dec 8**, same hours. You need Vercel, Render and Supabase open for the whole three hours.

**Before Sunday, from you:**

1. Say yes to two pushes: merging this branch into staging (step 1), and a *do not merge* PR to `main` so CI runs (step 4).
2. In Supabase: create the new `us-west-2` project, its read-only role, and 7-day point-in-time recovery (step 5).
3. Read the dashboard settings listed in §4 (a) into your secret store (step 6).
4. At the Firefly export review: decide which of the 17 later rooms Firefly keeps (step 6).
5. Name the operator who will type the step-16 commands while you watch (D12).
6. Approve this plan (step 6b).

**In the window, from you.** Type the database credentials when asked. Approve the release at your own terminal
(T+0:25). Set the platform settings (T+1:30). Add the two Vault secrets (T+2:00). Decide **keep or roll back at T+2:20**.
Add your own existing account as Firefly's first admin (step 16.1), and watch the operator type step 16. After step 16,
sign in and set up Firefly's lanes in the Work Unit Queue screen (16L). Invite Firefly's staff afterwards.

**Decision points.** There are four. Something wrong before T+0:30 means nothing has been touched, and the window moves.
A failed migration means hold: production keeps running as now, and the new project is rebuilt another day. A failed
check at T+2:20 means you roll back with Instant Rollback, and the clock is switched off first. A failed Firefly setup
means it is removed and can be retried before T+2:50; production stays live without Firefly. Rollback stops being
possible once Firefly holds its first real record (a family, lead or payment). After that, recovery is the 7-day
point-in-time restore.

**How sure we are.** The whole operation, including three rollback paths and a second Firefly setup after a rollback,
ran end to end on local stand-ins and passed. Three local findings are fixed: a silent CLI exit, a wrong step-16
baseline, and CI check names that could never have matched. What could not be rehearsed is everything hosted: the real
dashboards, the Vercel and Render deploys, network speed to the new database, and the real staging export. Those are
checked live, step by step, against the pass conditions above.
