---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Briefing for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (slice P1S) — the owner's runbook for the first promotion, not doctrine. Nothing here authorizes a live action.
---

# Environments and promotion — first-promotion briefing (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P1S. This is the ordered runbook
for the first promotion of staging's code to production, written for the plan the owner approved (D1–D8 below). It builds on
the [settings checklist](environments-p1s-settings-checklist-2026-11-25.md) (P1S), the
[release procedure](../governance/production-release-procedure.md) and its [rehearsal](environments-p6-release-rehearsal-2026-11-25.md) (P6),
the [rebuild rehearsal](environments-p4-rebuild-and-integration-rehearsal-2026-11-25.md) (P4),
[P1](environments-p1-production-census-2026-11-25.md), [P2](environments-p2-production-snapshot-restore-2026-11-25.md),
[P3](environments-p3-staging-classification-2026-11-25.md) and
[deployment and environments](../governance/deployment-and-environments.md).

**How this was written.** From the repository only. No dashboard, service, database, credential or environment dump was read,
and no runtime setting was changed. Two offline git checks back it, in
[`environments-p1s-briefing-evidence-2026-11-25/`](environments-p1s-briefing-evidence-2026-11-25/). Refs are as last fetched
on 2026-11-25 10:14 local: `origin/staging` `8321949771f7`, `origin/main` `bbfbec76d779`. They were not re-fetched.

**No setting value appears here.** Where a step says what to set, it names the value the code defines (`production`, "the
production origin"). Credentials stay in the platforms and in the owner's own secret store.

## The plan in one paragraph

Production moves to a **new** Supabase project in AWS `us-west-2`, built from nothing by applying the staging migration chain
the way P4 rehearsed it. The **existing production project (`vslwnntzzgpnmrpjipat`) is left exactly as it is** and is the
rollback target. Production's only org there is not a real tenant, so nothing is carried from it and **no first tenant is created
before or during the operation**. It is configured afterwards. The candidate is rebuilt after ALY-14 E1–E4 reach staging. Production
gets staging's clock arrangement and staging's flag values. The W-17 self-test org that the chain re-creates is retired. The
operation runs on **Tuesday 1 December 2026, 09:00–12:00 PST (17:00–20:00 UTC)**, with the owner present and signed in to Vercel,
Render and Supabase.

## Owner decisions this briefing implements

| ID | Decision (as given) | What it settles here | What it does not settle |
|---|---|---|---|
| **D1** | Integrate ALY-14 E1–E4 into staging, then rebuild the candidate | P4's candidate `ea06c21f3401` is **retired**. A new candidate is built from the new staging head with P4's `build-candidate.sh` (P4 O7) | The push to `staging` is itself an authorized action (CLAUDE.md §Git / deploy) |
| **D2** | New Supabase project in `us-west-2`, rebuilt as rehearsed in P4; existing project preserved unchanged for rollback | Schema step = P4's procedure against the new project (§3). Region matches `pdx1` (checklist A.1). Rollback = the untouched old project (§7) | The P2 snapshot is **not** the rollback path (§7) |
| **D3** | Production's current org is not a real tenant; no first tenant exists before the operation | P3 **B1** is closed: nothing is carried from the old project. No org is created in the new project by hand | — |
| **D4** | Same clock setup as staging | `pg_cron` in the database is the clock; the Vercel Cron is not used (§5.4) | Whether staging's clock is actually ticking is an owner check (C-CLOCK-1) |
| **D5** | Retire W-17 | The `_w17_selftest_` org the chain creates ends `retired`, which `check-production` requires (`release-lib.mjs` `checkProductionTenantIsolation`) | The retirement migration does not exist yet (**M2**) |
| **D6** | Match staging flag values | Every class **F** row takes staging's value, including explicitly setting flags whose unset default differs (§5.5) | Staging's values live only in the Vercel dashboard (C-FLAG-1) |
| **D7** | Configure the first tenant after the operation | The operation ends with zero tenant orgs. Tenant work (provider bindings, Auth mail, the org itself) is a later session | The app has no production org-creation path (P4 F6, **M5**) |
| **D8** | Tuesday 1 December 2026, 09:00–12:00 PT, owner present with Vercel, Render and Supabase | The timetable in §4 | — |

## 1. Missing prerequisites (must be closed before 1 December)

Each is something this plan needs that does not exist yet. None can be closed by this document.

| ID | Missing | Why it blocks | Evidence | Who |
|---|---|---|---|---|
| **M1** | **ALY-14 E1–E4 on `staging`.** They are on this branch only. `2e2f0acf8`, `d0bccd81d` (E1), `a092757a1` (E2) and `4972595ae` (E4) are not ancestors of `origin/staging` | D1. Also, `ALLOY_ENVIRONMENT` exists only because of E1 | `staging-integration-check.txt` | Authorized push/PR to `staging` |
| **M2** | **A W-17 retirement migration.** No committed file retires `_w17_selftest_%`. P4 F3: deleting fails on the `document_category_in_use` guard; setting `status` to `retired` works | D5. `check-production` fails on an unretired self-test org. Production receives only files staging ran, so it must land on staging with M1 | P4 F3, O3; `rebuild/w17-removal-trial.txt` | Developer, then staging |
| **M3** | **The P6 tool has no first-promotion path.** `production.preflight` checks that production serves the old `main` SHA *on the project named in `release-config.json`*, and `plan` over an empty ledger is **blocked**: `contract_not_last` (45 contract files among 557, the first `20260329210000`) | Without it, `prepare` writes no manifest, so `approve`, `emit-apply` and `record` cannot run, and the hash-chained audit has nothing to bind | `plan-empty-ledger-p4-candidate.json`; P6 procedure §Limits ("The first promotion is not a routine release") | Owner decision (see report) |
| **M4** | **`release-config.json` names the old production project** (`vslwnntzzgpnmrpjipat`). After cutover every check against production must expect the new ref | `checkBuildInfo` compares `supabaseProjectRef`. `--config <file>` overrides it for one run; the committed file must follow in the next release | `scripts/release/release-config.json`, `alloy-release.mjs` `loadConfig` | Developer, after the ref exists |
| **M5** | **No production org-creation path** for the first tenant. `/api/admin/dev/create-org` needs `DEV_TENANT_SPINUP_ENABLED`, which must never be set on production (checklist X row) | Not this operation (D7). It blocks the tenant session that follows | P4 F6 | Owner decision (see report) |
| **M6** | **A green CI run on the rebuilt candidate SHA.** P6 step 2 requires every `required_checks` entry to succeed *on the candidate*. That needs the candidate pushed to a non-deploying branch and a PR (P4 *Integration through a pull request*). The check names also still need confirming against real check-run names (P6 owner action 4) | Staging verification cannot pass without it | P4 §Integration…; P6 owner action 4 | Authorized push/PR |
| **M7** | **A read-only role and backups on the new project.** The runbook's observations use a read-only URL (P6 owner action 5). No such role exists on any project in the records. The new project's backup/PITR tier (P6 owner action 6) protects tenant data from D7 onward | Post-checks need a read path that cannot write; data written after D7 has no other rollback | P6 owner actions 5–6 | Owner |

## 2. Before the window (T−6 to T−1)

| # | Step | Done when |
|---|---|---|
| B1 | Close M2: the W-17 retirement migration, reviewed, on the branch that carries E1–E4 | Committed; a non-live rebuild (P4 `rehearse.sh`) ends with the self-test org `retired` |
| B2 | Close M1: integrate into `staging`. This branch merges into `origin/staging` cleanly (`git merge-tree` exit 0, tree `a2b52099…`). It is 8 commits behind staging, and staging's `20261222090000_documents_w_c1_audit_linkage.sql` is not on this branch, so it must be a **merge** that keeps staging's commits, never a reset to this branch. The branch also carries the P1–P6 records and `scripts/release/`; integrating the branch brings them too | Staging serves the merge (`/api/build-info` `gitSha`); staging CI green |
| B3 | Freeze `staging`: no merges from here until the window closes (P4 O7: a moved staging gives a new candidate SHA) | Announced |
| B4 | Re-fetch, then rebuild the candidate: P4 `candidate/build-candidate.sh <origin/staging> <origin/main>`. Confirm `main` still fast-forwards to it, and that the only path differing from staging is `.github/workflows/vacilando-tier2.yml` (main's copy, `workflow_dispatch` only) | New candidate SHA recorded; `release identify --candidate <sha> --allow-tree-diff .github/workflows/vacilando-tier2.yml` exits 0 |
| B5 | Recount the candidate's migrations with P4 `candidate/migration-counts.sh`. P4 measured **557** on staging; the rebuilt candidate has 557 plus whatever M1/M2 add | Count and head version recorded; this is the list §3 applies |
| B6 | Re-check workflows on the candidate: only `vacilando-tier2.yml` declared a `schedule` on staging (P4), and the candidate takes main's copy without it | No `schedule:` in any candidate workflow, or each one explained |
| B7 | Close M6: push the candidate to a non-deploying branch, open the PR to `main` marked *do not merge*, wait for green | Every `required_checks` name has a `success` check-run on the candidate SHA |
| B8 | Close M3 by the owner's choice (report, D-A) | Either the tool has a first-promotion path, rehearsed non-live, or the owner accepts this runbook as the record |
| B9 | Owner creates the new Supabase project in **`us-west-2`** (West US, Oregon). Region: checklist A.1, `deployment-and-environments.md` → *Compute placement*. Record its ref. Change nothing on the old project | New ref recorded in the release directory; old project untouched |
| B10 | Close M7 on the new project: read-only role; backup/PITR tier confirmed | Both recorded |
| B11 | Owner collects staging's dashboard-only values (C-FLAG-1, C-O-1, C-CLOCK-1, C-MSG-1 in §6) and the current production values needed for rollback (C-RB-1, C-RB-2) into their own secret store, **not** the repo | Each row in §6 marked |
| B12 | Prepare the release directory `releases/<date>-<sha12>/` (P6 owner action 8) with a config copy naming the new project ref (M4) | Directory exists |

## 3. The schema step: new project, P4's procedure, P6's apply text

P4 rebuilt a working database from nothing: **557/557** migrations, in version order, one transaction per file with its ledger
row, no edits (P4 *Results*). Do the same against the new project:

1. **Platform schemas first.** A real Supabase project already has `auth` and `storage`. That is the precondition P4 F1
   found (the chain fails on a bare database at `20260912010000` and `20261207181600`). Do **not** run P4's GoTrue and Storage
   migrators against a hosted project.
2. **Ledger table.** If `supabase_migrations.schema_migrations` is absent, create it as P4 step 4 did, with `version`,
   `statements` and `name`.
3. **Apply.** Every committed file of the rebuilt candidate, ascending version, as role `postgres` over the **session pooler
   (port 5432, not 6543)** (checklist C.2; P6 owner action 5), each with `psql -v ON_ERROR_STOP=1 --single-transaction`, and
   its ledger row in the same transaction. The text is `wrapMigrationForApply` (`release-lib.mjs`), which is what
   `release emit-apply` prints and what the P6 rehearsal applied. Not `supabase db push` (P6 *Ground rules*).
4. **Why expand/contract order does not apply here.** P6 runs destructive files after the new code because an old build is
   reading the same database. The new project serves nothing until §5.3, so the whole chain runs in version order. That is
   exactly why P6's planner blocks it (M3), and why that block must be waived explicitly for this one operation, not
   silently.
5. **Stop rule.** If any file fails, stop. That file left nothing (single transaction). Nothing user-facing has changed:
   production still serves the old build on the old project. Either fix forward with a new candidate (back to B1), or delete
   the new project and recreate it.
6. **Census.** Read-only, with P6's queries (`LEDGER_SQL`, `FINGERPRINT_SQL`, `ORGS_SQL` in `release-lib.mjs`):
   - The ledger equals the candidate's versions.
   - `rls_disabled` is 0.
   - The fingerprint equals **hosted staging's**, taken in the same window. P4's rebuilt fingerprints (columns `893e1369…`,
     policies `0a9cdb9e…`) are a reference, not the gate.
   - `orgs` holds exactly one row, `_w17_selftest_…` `retired` (M2). Zero ZZ Alloy QA orgs and zero `f17e0000-…` ids. The
     Firefly seed and the QA tenants come from `supabase/seed` and scripts, not migrations, so the chain cannot bring them.
   - `scheduled_work` holds `clock_activation_certification` (P4 F8: deliberate, converges once; accept).
   - Checklist C.1: the six required extensions are present and bucket `org_documents` exists.

## 4. Day-of timetable (Tuesday 1 December 2026, PST)

Times are targets. **11:15 is the last go/no-go:** after it, only rollback or a hold that leaves the old build serving.

| Time | Step | P6 control | Detail |
|---|---|---|---|
| 09:00 | **Go/no-go.** M1–M4, M6, M7 closed; staging frozen since B3; owner signed in to Vercel, Render and Supabase | — | Any open M is a no-go. Nothing has been touched yet |
| 09:05 | **Candidate identification** | step 1 | `release identify` on the B4 SHA, after a fetch. `main` unmoved since B4 |
| 09:10 | **Staging verification** | step 2 | Staging `/api/build-info` serves the staging head the candidate was built from, on `ikaxilmwmrmbagoidedu`; check-runs green on the candidate SHA; staging ledger equals the candidate's migration set; staging tenancy passes (Firefly present; only ZZ Alloy QA besides it; W-17 retired once M2 has run on staging) |
| 09:20 | **Production before** | step 3 (part) | Production `/api/build-info` serves `main` on the **old** project `vslwnntzzgpnmrpjipat`. Record the current Vercel production deployment id and the Render deploy (C-RB-1, C-RB-2) |
| 09:25 | **Owner approval** | step 4 | Per D-A: through the first-promotion path, or the owner signs this runbook's manifest record. P6 default TTL 4 h covers the window |
| 09:30 | **Schema step** on the new project | steps 5–6 analogue | §3. Step 5 (*snapshot*) does not apply to an empty new project. The old project is the rollback point and is not touched |
| 10:15 | **Supabase settings** on the new project | — | §5.1, then the Vault URL secret only (§5.4) |
| 10:30 | **Vercel Production scope** set | — | §5.2. A running Vercel deployment keeps the environment it was built with (C-RB-3), so the old build keeps serving the old project |
| 10:40 | **Render** prepared | — | §5.3, saved without deploying where Render offers that (C-REN-2) |
| 10:45 | **Release** | step 7 | `git ls-remote origin main` equals the B4 base; fast-forward `main` to the candidate (never `--force`); poll production `/api/build-info` until it serves the candidate on the **new** ref. Then deploy the Render service on the candidate commit |
| 11:00 | **Clock on** | — | Vault credential last (§5.4) |
| 11:05 | **Production verification** | step 8 | §8 post-checks; `release check-production --stage final --config <new-ref config>` |
| 11:15 | **Go/no-go: keep or roll back** | — | Any §7 condition → rollback now |
| 11:45 | **Record** | step 10 | Evidence into the release directory; `verify-audit`. No tenant work today (D7) |
| 12:00 | Window closes; staging freeze lifts | — | — |

The schema step is not timed by any record: P4's 29 s was a local container. If the apply is not finished and censused by
**10:30**, hold. Nothing is live yet, so holding costs nothing but the date.

## 5. Owner-side steps by platform

### 5.1 Supabase (new project only)

| Setting | Value the code expects | Source |
|---|---|---|
| Region | `us-west-2` | D2; checklist A.1 |
| API exposed schemas | `public` | checklist C.2 |
| Authentication → Email provider | enabled, password sign-in | checklist C.2 |
| Authentication → URL Configuration → Site URL | the production origin (same as `NEXT_PUBLIC_APP_URL`) | checklist C.2 |
| Authentication → Redirect URLs | `<production origin>/reset-password`, `<production origin>/login` | checklist C.2 |
| Authentication → SMTP | a **delivering** sender for invite and recovery mail. Needed before the first invite, so it may wait for D7, but nothing else stops a public `/forgot-password` call going through the default mailer | checklist C.2; deployment doc *Supabase Auth mail* |
| Database → pooling | release applies on port 5432 | checklist C.2 |
| Backups / PITR | the tier from M7 | P6 owner action 6 |
| Vault | §5.4 | checklist C.1 |

**The old project:** no migration, no setting, no Vault secret, no Auth change, no pause. It stays exactly as it is.

### 5.2 Vercel (Production scope)

Set **before** the 10:45 push. `NEXT_PUBLIC_*` are inlined by `next build`, so they must be in place before the build the push
starts (checklist *How to read*, F.1).

- **R rows** (checklist A.2): `ALLOY_ENVIRONMENT` (`production`), `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL` (the **new**
  project, the same URL in both), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (new project),
  `NEXT_PUBLIC_APP_URL`, `INTERNAL_CRON_TOKEN` (new, equal to Render's), `INTERNAL_MESSAGES_PROCESS_URL` (the production
  Render service + `/internal/messages/process`), `CRON_SECRET` (§5.4), and the three signing secrets, each its own (I-2).
- **C rows** for each capability going live: Stripe, Resend, Twilio, OpenAI, `MARKETING_DEMO_FROM`, Meta pixel. With no tenant
  until D7 they are inert, but they must be in place before the first tenant send.
- **F rows**: staging's values (§5.5).
- **S and X rows**: confirmed **absent** (checklist F.5). In particular `APP_ENV` and `NEXT_PUBLIC_APP_ENV` must not say
  `staging`, and `DEV_TENANT_SPINUP_ENABLED` and `ALLOY_CERTIFICATION` must not be set.
- **L rows**: `ALLOY_PUBLIC_ORG_ID` and the three `BOOK_V2_*_STAGE_ID` unset. They are per-database ids, and no tenant exists
  (D3, D7). `NEXT_PUBLIC_API_BASE_URL` unset.
- **Project settings** (checklist A.1): Root Directory `web`; Ignored Build Step `bash scripts/vercel-ignored-build.sh`;
  production branch `main`; *Automatically expose System Environment Variables* on; the Cron Jobs setting (§5.4).

### 5.3 Render (production backend service)

- **R rows** (checklist B.2): `ALLOY_ENVIRONMENT` (`production`), `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the **new**
  project), `INTERNAL_CRON_TOKEN` (equal to Vercel's).
- **C rows** if SMS/email go live: Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`),
  `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL` (the backend's public origin), `PUBLIC_TWILIO_STATUS_CALLBACK_BASE`,
  Resend.
- **S rows absent**: `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SUPABASE_URL`, `VERCEL_ENV`, both staging allowlists.
- **Not carried**: `TWILIO_FROM_NUMBER` (I-4).
- **Service settings** (checklist B.1): start `uvicorn backend.main:app`, Python 3.10.5, `pip install -r backend/requirements.txt`.
  The repository has no `render.yaml`, so the branch it deploys and whether it auto-deploys are dashboard-only (C-REN-1).

### 5.4 Clock: the same arrangement as staging (D4)

Staging's clock is `pg_cron` + `pg_net` in its database, installed by `20261002120000` and `20261003120000`. Staging is a Vercel
Preview deployment, so its Vercel Cron never fires (deployment doc *Scheduled work*; Director decision 2026-09-21, external
scheduler). Production is a Vercel **Production** deployment, so the `crons` block in `web/vercel.json` **would** register on the
first `main` deploy of the candidate (P4 H2). To match staging:

1. **Vault URL first.** In the new project's Vault, create `scheduled_work_wake_url` = the production origin +
   `/api/scheduled-work/wake`. Unset, the job falls back to `https://staging.workwithalloy.com/api/scheduled-work/wake`
   (`20261002120000_scheduled_work_clock_pg_cron.sql:48`; P4 F7/H3/O5). This happens at 10:15, while the job is still inert
   because the credential does not exist.
2. **Vercel Cron off.** Disable the project's Cron Jobs in Vercel before the 10:45 deploy, so the only clock is `pg_cron`, as on
   staging. If Vercel offers no switch on this plan, the code fallback still holds: the wake route authorizes only a matching
   `Bearer $CRON_SECRET` or `x-cron-token` (`web/app/api/scheduled-work/wake/route.ts` `isAuthorizedClock`), so with
   `CRON_SECRET` unset a Vercel Cron call is a 401 every five minutes and wakes nothing. Choose one and record it (C-CLOCK-2).
3. **Credential last (11:00).** Create `scheduled_work_wake_credential` = Vercel `CRON_SECRET`, or `INTERNAL_CRON_TOKEN` if
   `CRON_SECRET` stays unset. The job sends it as both headers (`20261003120000`). Never create it before step 1 is verified.
4. **Observe a tick.** Read `scheduled_work_clock.last_wake_at` and `wake_count` advancing on the new project within ten
   minutes. Read the `pg_net` responses (`net._http_response`) and see a 2xx. A config file is not evidence (deployment doc).

### 5.5 Flags: staging's values (D6)

For every class **F** row in checklist A.2 (68 web keys), read whether staging's Vercel **Preview** scope sets it, and set the
same in **Production**. Where staging leaves a flag unset, production normally leaves it unset too, with one exception the code
shows:

- `DRAWER_SUMMARY_STRIP_BOUNDARY` and `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY` default **on** in a Preview build and **off** in a
  Production build (`web/lib/layout/featureFlag.ts` `isDrawerSummaryStripBoundaryDefaultOn`). To match staging's behaviour,
  production must set both explicitly to `1` when staging leaves them unset. This is the only F key whose read site depends on
  the environment (checked: every F row's file was searched for `VERCEL_ENV`, `APP_ENV` and `ALLOY_ENVIRONMENT`, and only this
  one matched).
- The 34 `NEXT_PUBLIC_*` flags are build-time: before the push.

D6 names flags. The class **O** business settings (`ALLOY_CANCELLATION_FEE_CENTS`, `ALLOY_CANCELLATION_FEE_WITHIN_HOURS`,
`ALLOY_DEFAULT_BUSINESS_TIMEZONE`, `NEXT_PUBLIC_BOOKING_PATH`) are not flags. Their checklist rule stands: carry staging's only
if it is a real business setting (C-O-1).

## 6. Checklist issues carried forward

Label: **OWNER CHECK** (the owner verifies or sets it, with a pass condition), **RESOLVED BY PLAN** (D1–D8 settle it), **N/A**
(does not arise in this operation). Paths are repository-relative.

| ID | Issue | Label | What to do / why | Evidence |
|---|---|---|---|---|
| **I-1** | `scheduled_work_wake_url` falls back to **staging** | OWNER CHECK | §5.4 step 1, before the credential. Pass: the Vault URL names the production origin, and `pg_net` responses after 11:00 come from production, not staging | `supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:48`; checklist C.1, D; P4 F7 |
| **I-2** | Three web signing secrets fall back to `INTERNAL_CRON_TOKEN`, which Render shares | OWNER CHECK | Set `COMMUNICATION_UNSUBSCRIBE_SECRET`, `COMMAND_DESTRUCTIVE_PREVIEW_SECRET` and `DOCUMENT_API_UPLOAD_SECRET`, each a separate new secret, none equal to `INTERNAL_CRON_TOKEN`. Pass: four distinct values in Production scope | `web/lib/communications/preferences/unsubscribeToken.ts:82-83`; `web/lib/documents/external/externalDocumentWrites.ts:91`; checklist D |
| **I-3** | Production flag defaults differ from staging | RESOLVED BY PLAN (D6) + OWNER CHECK | §5.5. Pass: both drawer-summary-strip keys set in Production whenever staging leaves them unset | `web/lib/layout/featureFlag.ts:266-292`; checklist E.1 |
| **I-4** | `backend/README_MESSAGES_SENDER.md` lists `TWILIO_FROM_NUMBER` as required; no backend code reads it | OWNER CHECK | Do not carry it to the production service; its presence on staging means nothing. The README is stale (a follow-up doc fix; not changed here so the checklist's citation stays true) | `backend/README_MESSAGES_SENDER.md:13`; checklist E.2; B.2 has no such key |
| **I-5** | Flag values exist only in the Vercel dashboard (**C-FLAG-1**) | OWNER CHECK | B11: read staging's Preview scope for each F row before the day. Pass: every F row marked *staging sets / staging unset*, and Production matches per §5.5 | checklist E.1, A.2 F rows |
| **I-6** | Platform-only settings with no environment name | OWNER CHECK | Vercel: A.1 rows (§5.2), plus Instant Rollback availability (**C-RB-3**). Render: B.1 rows (**C-REN-1**: branch and auto-deploy recorded; **C-REN-2**: whether saving environment changes redeploys). Supabase: C.2 rows (§5.1) | checklist A.1, B.1, C.2; P6 owner actions 5–7 |
| **I-7** | Secret names stored as data (`env:NAME` in binding `secret_ref`; org-owned `vault:` credentials) | N/A for the operation; OWNER CHECK at D7 | The new project has no binding rows (P4 row census: none of the 21 non-empty tables is a binding table), and no tenant exists (D3). At tenant setup: any binding naming an `env:` key other than `RESEND_API_KEY` or `TWILIO_AUTH_TOKEN` needs that key on both Vercel and Render; `vault:` credentials are provisioned per org, never copied (P3 B4) | checklist E.3; `rebuild/rebuilt-row-census.txt`; P3 B4 |
| **I-8** | Provider webhook URLs and signing secrets are set at the providers | OWNER CHECK | For each capability going live: Stripe → `<production origin>/api/stripe/webhook` with its signing secret as `STRIPE_WEBHOOK_SECRET`; Resend → `/api/webhooks/resend` with `RESEND_WEBHOOK_SECRET`; Twilio inbound → the production backend's `/sms/*`, and the web status webhook. Pass: none points at staging; each secret came from that production endpoint | checklist E.5, A.2 C rows |
| **I-9** | Render schedule for `/internal/messages/process` is not in the repo (**C-MSG-1**) | OWNER CHECK (D4 read as covering it) | Read whether staging has a Render Cron Job calling its backend's `/internal/messages/process`, and mirror it for production with production's URL and token. If staging has none, production has none; the web's direct call through `INTERNAL_MESSAGES_PROCESS_URL` still sends. Pass: recorded either way; no production job calls staging | checklist B.1; `backend/README_MESSAGES_SENDER.md:61-68` |
| I-10 | `ALLOY_ENVIRONMENT` must be `production` on both runtimes **before** the E1 guard reaches `main` | OWNER CHECK | §5.2, §5.3, before 10:45. Unset, production refuses every real recipient | deployment doc *Promotion order*; checklist D |
| I-11 | One Supabase project for every URL and key, on both platforms | OWNER CHECK | Pass: Vercel `/api/build-info` `supabaseProjectRef` = new ref; Render `SUPABASE_URL` names the same project | checklist D |
| I-12 | `NEXT_PUBLIC_*` are build-time | OWNER CHECK | Set before 10:45; any later change needs a redeploy | checklist *How to read*, F.1 |
| I-13 | S and X rows absent on production scopes | OWNER CHECK | §5.2, §5.3 | checklist F.5 |
| I-14 | Function region `pdx1` must sit beside the database | RESOLVED BY PLAN (D2) | The new project is in `us-west-2`, which is `pdx1`. Check the region at creation (B9) | checklist A.1; deployment doc *Compute placement* |
| I-15 | Vercel Cron vs `pg_cron` as the production clock (P4 H2) | RESOLVED BY PLAN (D4) + OWNER CHECK | §5.4. **C-CLOCK-1**: staging's clock must actually be running (`scheduled_work_clock.last_wake_at` advancing on staging), or D4 has nothing to match; if it is not, stop and ask. **C-CLOCK-2**: Vercel Cron disabled, or `CRON_SECRET` unset, recorded | checklist A.1, C.1; P4 H2; deployment doc *Clock doctrine* |
| I-16 | Production's single org: real tenant or not (P3 B1) | RESOLVED BY PLAN (D3) | Nothing carried; the old project is not read for data | P3 B1; P1 *Database census* |
| I-17 | L rows (`ALLOY_PUBLIC_ORG_ID`, `BOOK_V2_*_STAGE_ID`) are per-database ids | RESOLVED BY PLAN (D3, D7) | Unset at cutover; set at tenant setup only if the legacy routes are used | checklist A.2 L rows |
| I-18 | O business settings (**C-O-1**) | OWNER CHECK | §5.5 last paragraph | checklist A.2 O rows |
| I-19 | Supabase Auth mail must deliver in production | OWNER CHECK | §5.1 SMTP, before the first invite (D7 at the latest) | checklist C.2; deployment doc *Supabase Auth mail* |
| I-20 | Schema-level settings (extensions, bucket, Vault) | OWNER CHECK | §3 step 6 and §5.4 | checklist C.1 |

## 7. Rollback: the actual path

**The P2 snapshot is not the rollback path.** It is a schema-only dump of the **old** project's `public` schema, with no rows
(P2 *Outcome*). D2 leaves the old project unchanged, so there is nothing to restore it from. And the new project starts empty,
so it has nothing to restore either. The real rollback is to **point production back at the untouched old project**:

| Layer | Rollback | Precondition (owner check) |
|---|---|---|
| Vercel | **Instant Rollback** to the production deployment recorded at 09:20. Vercel deployments keep the environment they were built with, and the old build's `NEXT_PUBLIC_SUPABASE_URL` and anon key are inlined, so it serves the old project again. Wait until `/api/build-info` serves the old `main` SHA on `vslwnntzzgpnmrpjipat` | **C-RB-1**: deployment id recorded. **C-RB-3**: Instant Rollback is available on the plan, reaches that deployment (on some plans only the immediately previous one, so no extra production deploys during the window), and the rolled-back deployment uses its original environment |
| Render | Restore the recorded `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `INTERNAL_CRON_TOKEN`, and roll back to the recorded deploy. Render settings are service-wide, not per deploy | **C-RB-2**: the current values and deploy are recorded in the owner's secret store before 10:40 |
| Clock | Delete `scheduled_work_wake_credential` from the **new** project's Vault. The job then sends nothing (P4 F7) | — |
| `main` | Stays at the candidate. Instant Rollback stops new `main` deploys taking production until it is undone (P6 *Rollback*). Fix forward with a new candidate. Never force-push `main` | — |
| New project | Keep for diagnosis, or delete and recreate for the next attempt | — |
| Old project | Nothing to do: it was never changed | — |

**Roll back when, before 11:15:**

1. production `/api/build-info` does not serve the candidate on the new ref, or reports anything but `vercelEnv`
   `production` and branch `main`;
2. `check-production` fails: ledger, fingerprint versus staging, any table without RLS, or any QA, staging-seed or
   unretired self-test org;
3. `/login` or `/api/build-info` returns 5xx, or the build fails;
4. the clock does not tick within ten minutes of 11:00, or any `pg_net` response targets staging;
5. the backend `/build-info` does not serve the candidate commit, or its Supabase project differs from Vercel's.

**Hold, do not roll back**, when the schema step fails before 10:45 (§3 step 5). Nothing user-facing has changed.

**The rollback window closes at D7.** After the first tenant is configured on the new project, rolling back to the old project
discards that tenant's data. From then on, data recovery is the new project's backups/PITR (M7) and P6's *Data damage*
row: restore into a new project first, then decide, with a new owner approval.

## 8. Pre- and post-checks

**Pre (by 09:25):** M1–M4, M6, M7 closed; B3 freeze held; `main` unmoved; candidate identified; staging verified; production
serves old `main` on the old ref; C-RB-1, C-RB-2, C-RB-3, C-REN-1, C-REN-2, C-CLOCK-1, C-FLAG-1, C-MSG-1, C-O-1 recorded.

**After the schema step (by 10:30):** §3 step 6, all of it.

**Post (11:05–11:15), read-only:**

| Check | Pass |
|---|---|
| Vercel `/api/build-info` | candidate SHA, branch `main`, `vercelEnv` `production`, `supabaseProjectRef` = new ref |
| Render `/build-info` | candidate commit |
| `release check-production --stage final` with the new-ref config | exit 0 |
| Orgs | exactly one, `_w17_selftest_…` `retired`; no tenant (D3, D7) |
| Clock | §5.4 step 4; Vercel Cron per C-CLOCK-2 |
| Settings | I-2, I-10, I-11, I-13 re-read in the dashboards after the deploy |
| `/login` | renders. Sign-in cannot be tested: the new project has no users until D7 |
| Old project | unchanged: no new migration, setting or secret |

## 9. What this briefing does not do

- It authorizes nothing. The P5 owner approval gate is unchanged, and no setting may be changed because this document lists it
  (checklist F).
- No push, PR, merge, deploy or fetch, and no hosted service of any kind. The candidate in B4 does not exist yet.
- No migration was written (M2 is open). No change was made to the app, the release tool or `release-config.json` (M3, M4 open).
- The tenant session after the operation (D7) is out of scope apart from the prerequisites it inherits (M5, I-7, I-17, I-19).
