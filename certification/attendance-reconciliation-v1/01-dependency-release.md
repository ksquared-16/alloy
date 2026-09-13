---
owner: platform
status: canonical
last_reviewed: 2026-09-13
---

# Attendance current-state reconciliation + dependency release

Run: `erun_c7a5149c66da17d9`. Read-only reconciliation. No Attendance code changed.

## 1. Authoritative current state

| Fact | Measured |
|---|---|
| `origin/staging` | `52d0f3cffbd19ee396127f60ac958d9e6707765b` |
| Attendance lane | `lane_a96c3444b253`, branch `agent/attendance` |
| Lane HEAD | `a6acba2e31bc1a99ffd535d70838bb322b592268` (= PR 878 merge SHA) |
| HEAD reachable in staging | YES |
| Commits unreachable from any remote | 0 |
| Ahead of staging / behind | 0 / 51 |
| `current_run_id` | none; last run `erun_3743ac1f9ec9e80a` COMPLETE |
| Open Attendance PRs | 0 (of 22 open repo-wide) |
| Lane classification | CLEAN_COMPLETE |

Merged Attendance threads: PR 824 (`4699602ab`), PR 834 (`f5f2d257a`),
PR 848 (`ec434db6a9f4`), PR 869 (`7f8c381e0e30`), PR 878 (`a6acba2e31bc`).

Ledger discrepancy to reconcile separately: PR 869 is titled "Thread 8 —
promotion record" while the dispatch ledger calls it Thread 9.

## 2. Drift — is the tested tree representative of staging?

Between lane HEAD and `origin/staging`:

- `web/tests/childcareOperational/attendance/**` — **0 files changed**
- `web/lib/childcareOperational/**`, `web/lib/attendance/**` — **0 files changed**
- `supabase/migrations/` — 1 file: `20260913030000_admin_holds_financials_write.sql`,
  a financials RBAC migration with **0 attendance mentions**, not applied in the
  certification database.

The Attendance surface under test is byte-identical to staging.

## 3. Environment — the blocker doc mis-measured it

`12-slice-b6-blocked.md` recorded *"Certification database available — port
54322 CLOSED"*. That is the default Supabase port, not this topology's.

| Probe | Result |
|---|---|
| `supabase_db_alloy-cert` (Docker) | UP 41h, healthy, `pg_isready` accepting |
| Kong → `127.0.0.1:54421` | OPEN (this is the certification endpoint) |
| Postgres → `127.0.0.1:54422` | OPEN |
| `127.0.0.1:54322` | CLOSED — never this stack's port |

The certification database was available the whole time. The condition was
recorded as absent because the wrong port was probed.

## 4. Dependency proof — the five live Attendance suites

Commanded from `/Users/vacilando/Code/alloy-worktrees/attendance/web`, each file
run **alone** (two live files in one run destroy each other's tenant), cert env
published to `process.env` (the attendance writer builds its own client from it):

```
set -a; . ./.env.certification.local; set +a
export CERT_SUPABASE_URL="$SUPABASE_URL"            # http://127.0.0.1:54421
export CERT_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
./node_modules/.bin/vitest run tests/childcareOperational/attendance/live/<suite>.live.test.ts
```

| Suite | Tests | Result |
|---|---|---|
| `externalProducerIngestion.live.test.ts` | 21 | **PASS** |
| `assignedScopeAuthority.live.test.ts` | 18 | **PASS** |
| `crossChannelConvergence.live.test.ts` | 8 | **PASS** |
| `doorAccessNegative.live.test.ts` | 5 | **PASS** |
| `parentTokenizedIntent.live.test.ts` | 18 | **PASS** |
| **Total** | **70** | **70 passed, 0 failed, 0 skipped** |

`externalProducerIngestion` is the suite that guards
`ingestExternalAttendanceEvent` — the exact function Thread 5 rewires.

### The green was proven live, not vacuous

Green alone is not evidence when a suite self-skips. Three independent checks:

1. **No mocks.** All five files: `createClient` present, 7–30 `.from()`/`.rpc()`
   calls each, `vi.mock`/`vi.fn` count **0**. No suite uses `fetch()`.
2. **Negative controls fail closed.** Same suite, tampered service key →
   `1 failed, 21 skipped`. Unreachable URL (`:54999`) → `1 failed, 21 skipped`.
   The environment is load-bearing; the pass could not have come from a skip.
3. **Writes landed.** 15 rows in `child_attendance_events` created in the
   15 minutes covering the run.

### Adjacent suites, outside the gate

| Suite | Result |
|---|---|
| `operationalConsumption/live/attendanceConsumptionReactor.live.test.ts` | 4/4 **PASS** |
| `attendance/kiosk/live/kioskRotation.live.test.ts` | 0/3 — **environment, not defect** |

Kiosk rotation drives HTTP: `CERT_APP_URL ?? "http://localhost:3011"`, and 3011
has no listener, so all three fail `ECONNREFUSED` before asserting anything. It
is not one of the five gate suites, and no gate suite uses HTTP at all. Decidable
by re-running with a cert app server on 3011; not an Attendance product defect.

## 5. The dependency, condition by condition

Thread 5's gate is five conditions. **Attendance owns exactly one of them.**

| Condition | Owner | Then | Now |
|---|---|---|---|
| `ALLOY_WORKTREE_SLOT` present | control plane | UNSET | Thread 5 lane must be slotted |
| Managed development port | control plane | unset | follows slotting |
| Certification database available | infrastructure | "54322 CLOSED" | **AVAILABLE** — mis-probed |
| **Live Attendance tests runnable** | **Attendance** | "5 suites, none executable" | **RUNNABLE — 70/70 PASS** |
| Mounted browser automation | Browser Auth | No | closed at `52d0f3cffbd1` |

The only condition Attendance owed is discharged.

### Attendance owes nothing further

The blocker doc assigns producer conversion and bridge retirement to *the slotted
run* (Thread 5 steps 3–4), not to Attendance. All three bridges carry their
recorded removal triggers in schema comments, each attributed to Thread 5 B.5:

- `attendance_integration_producers` — trigger: all rows converged to installations
- `attendance_integration_producer_sites` — trigger: as above
- `attendance_integration_mappings` — read-only until producers converge

In the certification database: **0 producer rows, 1 installation.** The recorded
removal trigger is already satisfied there.

The seam is present and stable at
`web/lib/childcareOperational/attendance/integration/ingestExternalAttendance.ts:116`.

## 6. Statuses

**ATTENDANCE_PRODUCT_STATUS: COMPLETE_NO_REPAIR_REQUIRED.** Lane CLEAN_COMPLETE,
HEAD in staging, 0 unreachable commits, 0 open PRs, no current run. 74/74 live
tests pass across the five gate suites plus the consumption reactor. The single
adjacent failure is an unmet HTTP precondition outside the gate. No defect found;
no Attendance PR manufactured.

**THREAD5_ATTENDANCE_DEPENDENCY: READY — RELEASED.** The one condition Attendance
owned is proven discharged against staging-identical code, with negative controls.
Thread 5 is no longer blocked *by Attendance*. Its remaining precondition is a
slotted lane with a managed port — a control-plane action, not an Attendance one.
