---
owner: platform
status: canonical
last_reviewed: 2026-09-11
supersedes: []
---

# 12 — Slice B.6: blocked on the required environment

**Status: BLOCKED.** The slice mandates a slotted lane with live certification.
Three of the five required conditions are absent, and both "lane is not slotted"
and "live Attendance suite cannot run" are named stop conditions.

## The environment gate, measured

| Requirement | Observed |
|---|---|
| `ALLOY_WORKTREE_SLOT` present | **UNSET** |
| Managed development port | **unset** |
| Certification database available | **port 54322 CLOSED** |
| Live Attendance tests runnable | **No** — 5 suites present, none executable |
| Mounted browser automation | **No** — follows from the above |

The instruction: *"If any of those are unavailable, stop before production
rewiring or UI implementation and report PARTIAL/BLOCKED."*

So none of the following was attempted: the ingestion rewire, producer
conversion, legacy-table retirement, admin APIs, or any UI. Doing the ingestion
rewire here would repeat exactly what B.5 correctly refused — changing production
attendance authority while the suite that guards it cannot run.

## What was done, because it is neither rewiring nor UI

### 1. The operator's correction: Organization, not Settings

The run opened with *"Ensure we're not using settings but using organization."*
That is correct, and my earlier documents were wrong.

| Evidence | Says |
|---|---|
| `web/app/adminV2/components/Sidebar.tsx:269` | `title="Organization"`, `aria-label="Organization"` |
| `web/app/adminV2/settings/SettingsHierarchyBreadcrumb.tsx:26` | breadcrumb root is `"Organization"` |
| Configuration doctrine | *"Organization is the sole canonical Catalog Runtime."* |

`/adminV2/settings/*` is the **route path and shell**. The word an operator
actually reads is **Organization**. I named the product surface after its URL —
in Slice A and again in B.4 — and that has been corrected: the journey now reads
**Organization → Integrations**, and the ratified IA says "one configuration
domain named Integrations, reached from the Organization catalog".

The correction is recorded in place rather than silently rewritten, because the
mistake is instructive: naming a surface after its path is how a route becomes a
product noun nobody chose.

### 2. Legacy consumer analysis — a Gate 1 fact worth having early

Static analysis of production code (`web/lib`, `web/app`, excluding tests and
migrations):

| Legacy table | Production consumers |
|---|---|
| `attendance_integration_producers` | `producerAuthority.ts` only |
| `attendance_integration_producer_sites` | `producerAuthority.ts` only |
| `attendance_integration_mappings` | `externalMapping.ts` → `ingestExternalAttendance.ts` |

**And `ingestExternalAttendanceEvent` has no production route.** Nothing under
`web/app` reaches it; its only callers are the live tests.

This materially de-risks the slotted run: **the rewire has no production traffic
to break.** The legacy path is library code with no request-reachable entry
point, so Gate 1's "zero production credential resolution from the legacy
producer table" is already structurally true in the only sense that matters to a
running system — a request cannot get there.

It does not make the rewire safe to do blind. The live suites exist precisely
because the ingestion's *domain* behaviour — idempotency, corrections, provenance
— is what must not regress, and that is proven against a database or not at all.

`attendanceAuthorityAdapter.ts` was checked and does **not** read the legacy
table; its only mention is a header comment explaining the divergence.

## G-14 status — unchanged from B.5

Still **reduced, not closed**. The model is converged and certified at unit
level; the legacy tables remain bridges with their removal triggers recorded in
schema comments. Closure requires the rewire and the conversion, both of which
need the certification database.

## Exactly what the slotted run should do

1. `ingestExternalAttendanceEvent(authority, event)` — accept resolved authority,
   stop resolving credentials, sites and mappings inside the domain. The seam is
   specified in [`11-slice-b5-convergence.md`](11-slice-b5-convergence.md).
2. Run the five live Attendance suites as the gate. Not unit tests.
3. Convert producers to installations on `producer_key`; leave any ambiguous
   producer explicitly unresolved rather than synthesizing identity.
4. Retire the three bridges against their recorded triggers.
5. **Then** Gate 2 — the Integrations product, entered from **Organization**.

## Remaining gaps and blockers — unchanged

G-14 reduced · G-15 closed · G-16 no deletion feed · G-17 `attendance.write` in
the catalog with no route.

Mutation blockers: **SEC-0c · SEC-0 (D-3) · generic idempotency runtime ·
approved first mutation contract.** No public mutation added.

**Classroom Coach:** untouched. No adapter, no seeded Application, no claimed
capability. **D-1 remains unanswered.**

## Verified provisioning recipe (B.7 follow-up, 2026-09-11)

A later run was asked to provision the lane itself. Two of three prerequisites
are now precisely known, and a **third was discovered** that no prior slice had
identified.

### Corrected endpoint facts

| Fact | Value |
|---|---|
| Certification Postgres | `127.0.0.1:54422` |
| Certification **API** (kong) | **`127.0.0.1:54421`** |
| `CERT_SUPABASE_URL` should be | `http://127.0.0.1:54421` — the **API** URL, not the database port |
| `CERT_SERVICE_ROLE_KEY` | `SERVICE_KEY` on the `supabase_storage_alloy-cert` container |
| JWT secret | the standard local-dev default |

Verified working: `GET /rest/v1/` returns **200** with those credentials.

### The third prerequisite — the real Gate 1 blocker

**None of the Developer Platform schema exists on the certification database.**
All eight tables return 404, and all six migrations from B.1–B.5 are unapplied
there:

```
20260910190000_developer_platform_trust_foundation.sql
20260910200000_external_request_boundary.sql
20260910210000_external_locations_read.sql
20260911130000_external_locations_updated_since.sql
20260911190000_administrative_audit_attempted.sql
20260911150000_integration_resource_refs.sql
```

`attendance_integration_producers` **does** exist there, so the attendance lane's
migration is applied and the stack is otherwise healthy.

**Consequence:** the live Attendance suites cannot certify the converged ingestion
no matter what environment this lane is given, because the rewired path depends on
`app_installations` and `integration_resource_refs`, and neither exists on the
certification database. A slot and credentials are necessary and **not
sufficient**.

Applying them is a privileged write to infrastructure other sessions are actively
using, and is a Director-owned governed action — not something a worker lane
should fire on its own initiative against shared state.

### Unblock recipe, complete

1. Slot and managed port from `alloy-sprint-start` — see the caveat below.
2. `CERT_SUPABASE_URL=http://127.0.0.1:54421` and `CERT_SERVICE_ROLE_KEY=<storage SERVICE_KEY>`.
3. **Apply the six migrations above to `alloy-cert`** via the governed migration action.

### Caveat on `alloy-sprint-start`

It **creates** a branch and worktree from `origin/staging` and **opens a provider
session** on it. It does not slot an existing worktree. Running it from this lane
would spawn a second agent session and produce a worktree without the ten
unpromoted B.1–B.6 commits, which is the opposite of preserving the certified
lineage. Slotting this worktree is an operator action, not a worker one.

### Slot availability — measured 2026-09-11, and it is not a permissions problem

`alloy-worktree-adopt <slot> <name>` is the correct tool: it "registers an
existing worktree into the slot registry", reads the branch from Git, and
"creates no Git objects, no branch, no worktree, no tmux session, no server".
It is exactly what this lane needs and it does not create a second worktree.

**But the slot pool is full.** `ALLOY_MAX_AGENTS=12`, and `alloy-worker-status`
shows all twelve assigned to other sprints — work-unit-grade-a, financials,
communications-inbound, enrollment-phase2, vacilando, surfaces, payments,
troubleshooting, ui-vac, access-identity, attendance, work-items. Several are
`active` with running servers. Adopting slot 13 is refused:
`invalid slot '13' (expected 1-12)`.

Taking a slot would require `--force` over a live registration, evicting another
session's lane. That is not a call a worker lane makes.

**So the unblock is not "grant this lane a slot" — it is either raise
`ALLOY_MAX_AGENTS` above 12, or free one with `alloy-sprint-finish <slot>`.**
Then `alloy-worktree-adopt <slot> documentation-api --provider claude` binds
this worktree, with its lineage, in one command.

### What actually needs a slot

Only **Gate 2**. The dev server and browser automation are the slot-dependent
parts. **Gate 1 — the ingestion rewire and the five live Attendance suites —
needs the certification database and credentials, not a slot**, and vitest has
been routed successfully through the governed broker from this unslotted lane all
session. So Gate 1 becomes executable the moment the six migrations land, even
before a slot exists.

### Governed migration — the exact input contract (learned the hard way)

`database.apply_migration` accepts `environment` of **`staging | certification |
cert`**. `certification` is correct for `alloy-cert`.

Do **not** use `development_certification`. That value appears in
`DIRECTOR_ELIGIBLE_ENVIRONMENTS` (`lib/vacilando/director-authority.mjs`), which
is Director *authority* eligibility and a different layer from the action's input
validation. Filing it returns `environment_not_allowed`.

Verified inputs:

```json
{ "action_key": "database.apply_migration",
  "inputs": { "environment": "certification",
              "expectedSha": "<branch HEAD>",
              "migrations": ["20260910190000", "...", "20260911150000"] } }
```

### Why three migration requests failed — the authoritative answer

All three `database.apply_migration` requests **failed**; none was ever pending.
The gateway's own record is at
`~/.local/state/alloy-dev/gateway/vacilando/governed-actions/requests.json`, and
only one of the three failures was ever surfaced to the lane as a notification.

| Request | `failure_code` |
|---|---|
| `gar_5a2bf7ecb186fe` | `source_sha_not_reachable` |
| `gar_45807eabb8fa95` | `environment_not_allowed` |
| `gar_21028bc35a23f3` | `source_sha_not_reachable` |

> *expected_sha is not origin/staging and is not an ancestor of origin/staging;
> and it is not reachable from any sanctioned certification ref
> (`refs/remotes/origin/staging`, `refs/remotes/origin/agent/**`,
> `refs/remotes/origin/promotion/**`)*

**The branch had never been pushed.** The trusted host could not see the six
migrations at all. Resolved by governed push `gar_4e3c317bf317bc`:
`agent/api-thread5-slice-b6` is now on origin at
`5c10b70bec113e15b6fb719a9407ae38e78a6474`, which is reachable from the
sanctioned `agent/**` pattern, and all six migration files are present on that
ref.

**The lesson, recorded because it cost three runs:** a governed request that does
not execute within a few minutes has usually *failed*, and elapsed time proves
nothing. Read `requests.json`. And before any governed action naming an
`expectedSha`, push the branch so the SHA is reachable.

### Migration attempt 5 — validation finally passed, the apply did not

`gar_12a5c207cdcf6e` is the first request to get past validation. Its state
progression was `requested → awaiting_operator → failed`, where the three before
it failed immediately on input or source checks.

| Field | Value |
|---|---|
| `status` | `failed` |
| `failure_code` | `execution_failed` |
| `failure_reason` | `apply_failed` |

So the two defects previously diagnosed are genuinely fixed — the SHA was
reachable, the object-shaped migration items resolved, the environment was
accepted, and the collision was gone. What failed is the **apply step itself**,
and the record carries no SQL-level detail. No `tha_` artifact was produced.

**Verified after the failure, not inferred:**

- **No partial apply.** All eight Developer Platform tables still 404.
- **No damage.** `attendance_integration_producers`,
  `attendance_integration_mappings` and `child_attendance_events` all 200.

**One incidental finding worth keeping:** the audit's `failed_notified` event
carries `error: provider_prompt_not_ready`. That is the *notification* path
failing, not the apply — and it is a plausible explanation for why several of
these governed failures never reached the lane as notifications, which is the
silent-failure trap already recorded above. Reading `requests.json` remains the
reliable way to know.

**What is now unknown and needs operator-side visibility:** why the apply failed.
The lane can see that it failed but not the SQL error, and diagnosing further
would mean applying the migrations by hand against a shared stack — which is the
thing the governed action exists to prevent.

## Investigation of `gar_12a5c207cdcf6e` — and a safety finding

### The headline: `environment: "certification"` does not retarget the database

`CERTIFICATION_ENVIRONMENTS` is referenced in exactly two places, both in
`trusted-host-migrate.mjs`: line 315 relaxes SHA reachability so an `agent/**`
ref counts, and line 452 exempts a migration absent from staging. **Neither
selects a database.**

`resolveTrustedServerEnvSource()` takes no environment argument. It returns
`ALLOY_SERVER_ENV_SOURCE` or `<canonical>/web/.env.local`, and
`trusted-host-apply-migration.sh` then runs
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <migration>` against whatever that
file holds. The script never mentions certification.

On this host that `DATABASE_URL` resolves to
**`aws-0-us-west-2.pooler.supabase.com:6543`** — a remote hosted Supabase pooler,
not the local `alloy-cert` stack on `127.0.0.1:54422`. Every audit event for the
request also records `target: staging`, and the spawn env clears
`ALLOY_BLOCK_REMOTE_SUPABASE`.

> **Had this apply succeeded, it would have written six unpromoted Developer
> Platform migrations to the deployed database rather than to the certification
> stack.** The failure prevented that. Retrying this action for a certification
> goal would repeat the attempt.

### Why it failed: the psql child was never spawned

Every event — `operator_approved`, `executing`, `grant_consumed`, `failed`,
`failed_notified` — carries the identical timestamp `2026-09-11T16:00:42.301Z`,
and `execution_ended_at` was never set. Six migrations creating ten tables cannot
succeed or fail in zero milliseconds.

Confirmed independently: the apply child writes an `.out` and `.err` file per
migration into the store's `tmp` directory. That directory holds files for other
lanes' migrations and **none for any of the six**, with nothing newer than 15:55.
The child never ran, so no SQL reached any database.

### Answers

1. **Which migration failed** — none. No per-migration result was recorded.
2. **SQL error code** — none captured.
3. **Database error message** — none. `failure_reason` is the literal string `apply_failed`; `result_ref` is null.
4. **Statement/object being applied** — none reached.
5. **When** — before the first migration, at dispatch.
6. **Transaction model** — migration-by-migration. The runner loops per entry and returns `{ok:false, stopped:true}` on the first failure; each file is its own `psql -f` invocation, so each migration is its own transaction. There is no single transaction across the set.
7. **Migration-history contribution** — none evidenced. A ledger path exists (`defaultInspectLedger`, and an `already applied` skip) but nothing executed.
8. **Already-applied / conflicting / out-of-order** — nothing was classified; no results array was produced. The set was ordered ascending with the collision removed.
9. **Trusted-host artifact** — none. `result_ref: null`, and no `tha_*` record references the request.
10. **`provider_prompt_not_ready`** — a *notification delivery* state, not an apply cause. The delivery record reads `state: PENDING_PROMPT_READINESS`, `attempts: 1`, `last_readiness_state: busy`, `reason: busy`, `delivered_at: null`. The worker session was mid-turn, so delivery deferred. **Yes — this is why failure detail did not reach the lane, and it explains the earlier apparently-silent failures.**

### Diagnosis

Two independent problems. The apply never dispatched, so the immediate failure is
in the runner composition/dispatch layer above psql — and `apply_failed` came back
unclassified precisely because `classifySqlChildFailure` had no child stderr to
classify. Separately and more importantly, this action is wired to the deployed
database and cannot target `alloy-cert`, so fixing the dispatch alone would make
it succeed against the wrong database.
