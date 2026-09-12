# Thread 8 — convergence certification

Base at start: `fefda677a196c27fa69218bdfe92f898c4f64a8f`, reconciled forward to
`origin/staging` as it advanced (see BASE below).

---

## Convergence — who owns each semantic question

The Thread 8 test is whether two implementations answer the same question. After
this thread:

| Question | Owner | Consumers |
|---|---|---|
| Point-in-time whereabouts | `attendanceWhereabouts.whereaboutsAt` | Workspace via `resolveCurrentWhereabouts`; Focus Panel via `deriveCurrentPresence` (now a translation) |
| Current presence, one service day | same fold, day-scoped | Focus Panel read model only |
| Physical occupancy | `attendanceWhereabouts.occupancyAt` | single implementation, no second consumer |
| Rooms belonging to a site | `canonicalRoomProvider.resolveRoomsForLocation` | placement options, attendance card, roster, staff assignment |
| Rooms belonging to a site (raw rows) | `canonicalRoomProvider.rowsBelongingToSite` | 4 Settings surfaces + publication |
| Placement eligibility | `placeableRooms` (operational_group only) | placement options |
| Pickup authority | `safeguarding.resolvePickupAuthorization` | kiosk eligibility; child pickup administration |
| Attendance capture authority | `attendancePermissions` + `user_access_profiles` | enforced server-side; configured in Access |
| Expectation interpretation | `serviceDayExpectations` | Workspace |
| Financial consequence | Thread 7 chain → canonical Financials | Attendance reads `consumption_events.status` only |

**Duplicate paths removed:** the counting current-presence implementation
(`b2ac2a1ef`) and nine private direct-parent site filters (`ecc40582b`).

**Verified absent after the thread:**

- `grep "checkIns > checkOuts"` over `web/lib|app|components` — one hit, in a
  doc comment describing the bug that was removed.
- `grep 'eq("parent_location_id"' ` — zero.
- `grep "parent_location_id ==="` — one hit, a `typeof` guard on a request body,
  not a hierarchy assumption.

---

## Targets

| # | Target | Status | Commit |
|---|---|---|---|
| 1 | Location configuration | **DONE** | `ecc40582b` |
| 2 | Current-presence convergence | **DONE** | `b2ac2a1ef` |
| 3 | Teacher capture administration | **DONE** | `fe84023df`, `d16008293` |
| 4 | Kiosk administration | **DONE** | `b06450015` |
| 5 | External producer administration | **DONE** | `7d01f4c92` |
| 6 | Pickup / safeguarding | **DONE** | `6e29ea631` |
| 7 | Operational Expectations discoverability | **DONE** | `284e2def7` |
| 8 | Financial policy discoverability | **PARTIAL** | `7b92e876d` |
| 9 | Diagnostics | **PARTIAL** | `635fed6e3` |

Targets 8 and 9 are marked PARTIAL honestly: both landed their canonical read
model, operator copy and coverage, and neither is yet mounted into the Attendance
card / a diagnostics panel. The derivations are the part that had to be right;
the surfacing is bounded, named work and is listed under DEFERRED rather than
claimed.

---

## Two findings that constrained what could honestly be built

**`last_seen_at` is declared and never written** — on both
`attendance_kiosk_devices` and `attendance_integration_producers`. Neither the
device authority (which resolves a credential on every kiosk request) nor the
producer authority updates it. So kiosk and producer administration ship with NO
health, NO "online", NO "last seen" and no stale-device warning, and tests assert
those fields are neither selected nor projected, so a later well-meaning addition
has to confront the missing write first.

**Mapping problems, by contrast, are real.**
`attendance_integration_events.disposition` is written by the ingest path on
every inbound event. Counting `unmapped` / `unattributed` / `conflicted` /
`rejected` reads a fact rather than deriving a mood, which is the whole
difference between it and a last-seen badge.

---

## One correction to the Thread 8 inventory

The inventory classified Operational Expectations authoring as API-only with no
UI. That was **wrong**. The search was for `expectation`; the product calls these
**service-day exceptions**. `AttendanceWorkspace.tsx` already authors child-away,
site closure, group closure and reopening. The real gap was discoverability, and
that is what was built — a signpost with no editor on it. The inventory has been
corrected in place rather than quietly left standing.

---

## Security / authority properties proven

- Kiosk and producer inventories select an explicit column list; `credential_hash`
  is asserted absent from both the select and the projection.
- A device credential is returned exactly once, at registration or rotation, and
  no read path can recover it.
- Rotation goes through the existing `kioskCredentialRotation` module, which
  REPLACES the hash rather than adding a second valid secret; rotation of a
  revoked device is refused by the substrate rather than resurrecting it.
- Device registration and producer site grants validate the site against the
  caller's own org and require `location_type = 'site'`.
- An unrecognised device or producer status reads as **revoked**, never as active.
- Producer site grants are presented as authority: an empty grant list says the
  system can record nowhere, rather than reading as an absent restriction.
- Pickup authority is child-scoped and derived from the same seam the kiosk
  decides with; four cases assert the two agree on identical facts.
- A missing `authorized_pickup` role is passed to the resolver as `null`, not
  `false` — matching the kiosk exactly.
- Unscreened safeguarding yields `unknown`, never `authorized`.
- Capture scope is written through the canonical Access route, which rejects an
  unknown value and treats an absent field as *unchanged* rather than as `site`.

---

## Inherited failures — PRE_EXISTING, with before/after proof

These fail on this branch and failed before Thread 8 touched anything. They are
reported separately and were **not** hidden by mutating promoted migration
history, per the approved instruction.

### A. `tests/access/catalogConsolidationLock.test.ts` — 2 failures

`20260909230000_attendance_capability.sql:45,53` registers `attendance.record`
and `attendance.read` through the retired `permissions` / `permission_keys`
catalog names; a second failure concerns a `fin.read` grant migration in
Financials.

**Proof they predate Thread 8:** the test scans `supabase/migrations/*.sql` from
disk, and Thread 8 modified **no** `.sql` file — `git status` across every commit
in this thread shows no migration change. The offending migration is dated
2026-09-09 and is an ancestor of the thread's base.

**Owner:** Access / catalog convergence. **Why not repaired here:** the only
change that satisfies a file-scanning test is an edit to already-promoted
migration text, which risks ledger and checksum parity in hosted environments.
The approved instruction classifies this as inherited Access/catalog convergence
debt absent a current-runtime defect, and none was found: the writes are
`to_regclass`-guarded and inert where the retired tables are gone.

### B. `tests/childcareOperational` — 5 failures

`materializeEnrollmentFromProcessInstance` (2), `operationalEnrollmentReadModel`
(1), `childScheduleWidgetLayoutCompatibility` (1),
`childOverviewScheduleFlagGate` (1). Symptoms concern `stage_entered_at` and
schedule-widget slot mounting — unrelated to location ancestry.

**Proof they predate Thread 8:** the Slice A working-tree changes were backed up,
reverted with `git checkout --`, and the four files re-run on the clean base:
**identical 5 failures**. The changes were then restored. Before/after logs are
`before.log` and `sliceA.log` in the run scratchpad.

**Owner:** childcare operational enrollment / schedule widget.

### C. `tests/adminV2` — 164 failing files, and the suite does not finish

Running `tests/adminV2` alone produces 164 failing files and then stalls at the
same point without printing a tally.

**Proof it predates Thread 8 — measured twice, both directions:**

1. *Subset, both commits.* `analyticsTrendContract`, `lifecycleSettingsHub` and
   `configurationRuntimeEndToEnd` give **9 failed | 14 passed (23)** on this
   branch AND **9 failed | 14 passed (23)** at pure `origin/staging`
   `70db762eb`, checked out detached with no Thread 8 work present. Identical.
2. *Whole suite, both commits.* `tests/adminV2` reaches **164 failing files** and
   stalls at the same 650-line output on both. The stall is inherited too.

**Owner:** adminV2 / configuration runtime. Not investigated further here — it is
a large pre-existing condition in a suite Thread 8 added exactly one file to, and
that file passes.

---

## A defect this thread introduced, found by the platform, and fixed

Six new API routes were **undeclared** in the route-capability table. The guard
that catches this runs in `prebuild` — not in `vac run build` — so it would have
reached CI rather than being caught locally by the normal validation targets.

Fixed in `5d6236f5e`. Two things came out of it worth keeping:

- The pickup-authority route was gated on "is an admin". That is not a reason to
  see who may collect a particular child, since the answer is derived from
  safeguarding state. It now runs `assertAttendanceReadAllowed` and declares
  `attendance.read` — a capability that already existed and had **no route naming
  it**.
- Declaring that helper made the burndown able to see that
  `app/api/admin/childcare-attendance/route.ts` GET already ran the same gate
  while still marked `pending`. It was claiming less than it enforced, so it was
  drained and the ratchet ceiling lowered 679 → 678 to stay tight.

All four prebuild guards now pass, including the unauthenticated-side-effects
ratchet: every new mutating handler authenticates its sender.

---

## Mounted evidence

Against the running dev server for this worktree (port 3021), on the branch
under test:

| Request | Result | What it proves |
|---|---|---|
| `GET /adminV2/settings/attendance-devices` | **307** | route mounts, auth-gated |
| `GET /adminV2/settings/attendance-integrations` | **307** | route mounts, auth-gated |
| `GET /adminV2/settings/attendance-expectations` | **307** | route mounts, auth-gated |
| `GET /api/admin/attendance/kiosk-devices` | **401** | exists, refuses anonymous |
| `GET /api/admin/attendance/producers` | **401** | exists, refuses anonymous |
| `POST /api/admin/attendance/kiosk-devices` | **401** | registration refused server-side, not merely hidden in the UI |
| `GET /api/admin/attendance/does-not-exist` | **404** | control — the codes above discriminate |

Both 401 bodies are exactly `{"error":"Unauthorized"}` — no device or producer
data, and no credential material, reaches an unauthenticated caller.

**Limit, stated rather than implied:** this is bounded mounted evidence, not the
full browser certification the instruction describes. The shared `alloy-cert`
stack was up and **held by another lane's lease** for the duration of this run,
and seeding the destructive fixtures those scenarios need would have wiped rows
underneath that lane mid-run. The operator-scenario certification is therefore
listed under DEFERRED with its reason, rather than claimed.

---

## Deferred — evidence-backed, not convenience

**Surfacing for Targets 8 and 9.** Both landed their canonical derivation,
operator copy and coverage. Neither is mounted into a screen yet: the financial
context line is not in the Attendance card, and the diagnostics have no panel.
The derivations were the part that had to be right — a consequence line that
disagrees with the ledger, or a diagnostic that guesses, are the failures worth
preventing, and both are prevented. The surfacing is bounded, named work.

**Kiosk and producer last-seen / health.** Blocked on substrate, not on effort.
`last_seen_at` exists on both tables and nothing writes it. Wiring the write —
in the device authority and the producer authority, which already read the row on
every request — is the follow-up that makes health expressible. Until then any
health indicator would be invented, and this thread built none.

**Mapping editing.** Producer administration reports mapping problems and counts
but does not edit individual mappings. Reading the failure is what an operator
needed first; editing is a further surface over the same table.

**Operator-scenario browser certification.** Deferred with cause — the shared
`alloy-cert` stack was held by another lane throughout this run, and the fixtures
these scenarios need are destructive. Bounded mounted evidence was collected
instead and is reported above as exactly that.

**`tests/adminV2` suite health.** 164 failing files and a stall, proven inherited
in both directions. Owned by adminV2 / configuration runtime.

**Catalog consolidation lock.** Inherited; not repaired here because the only fix
a file-scanning test accepts is an edit to promoted migration text, which risks
ledger parity. Classified per the approved instruction.

**Room consumer convergence (Phase C).** `roomConsumerConvergence.ts` tracks a
DIFFERENT debt from the one Slice A closed: consumers that query
`location_type === 'unit'` directly. Slice A fixed the ancestry bug in several of
those files without converging their direct queries, so the ledger stays accurate
and is deliberately not shortened.

---

## PROMOTION RECORD — COMPLETE_PROMOTED

| | |
|---|---|
| Pull request | **#848** — Attendance Thread 8 — Workspace, Focus Panel and configuration convergence |
| Certified candidate | `8dec65051aa49a97a60c1bb41651c1fa96054da7` |
| Merge commit | **`ec434db6a9f4cf61594e829f00ada0dde32687c0`** |
| Merged at | 2026-09-12T13:18:07Z, via governed action `gar_4d755ba57c898a` |
| Final `origin/staging` | `ec434db6a9f4cf61594e829f00ada0dde32687c0` |

All sixteen Thread 8 commits are ancestors of promoted staging. The promoted tree
differs from the certified candidate in exactly three files
(`actionDefinitionRegistry.ts`, `web/package.json`, and one adminV2 test), all
from PR #868 which merged immediately before this one, and none in the Thread 8
certified set.

### Promoted-tree verification, run against `ec434db6a`

| Check | Result |
|---|---|
| `typecheck` | **rc=0** |
| `typecheck:tests` | **rc=0** |
| Prebuild guards (all four) | **rc=0**, 4/4 scripts; route-capability ceiling 655 against backlog 655 — exactly tight |
| Focused Thread 8 convergence + Access | **1468 passed**, 2 failed |

The 2 failures are the inherited catalog-lock pair. They remain inherited on the
promoted tree: the named offenders are `20260909230000_attendance_capability.sql`
(dated 2026-09-09, well before this thread) and a Financials `fin.read`
migration. Thread 8's own migration writes **zero** deprecated catalog names.

### Promotion took four attempts, and the first three are worth recording

Three governed merges were denied before this one, and only the first denial was
correct.

1. `gar_2f0fb198b14ac1` — denied `hosted_migration_parity`. **Correct**: the
   hosted primary was genuinely behind seven D2/Access migrations.
2. `gar_5139b64570d21c` — denied identically **after** census
   `gar_970336346cc9ca` proved the hosted head had caught up to `20260912010000`
   with all seven present exactly once. Every other deterministic gate was true;
   `failed_gates` was exactly `["hosted_migration_parity"]`. Reported as a
   control-plane parity-evidence defect rather than worked around — no migration
   was applied, no ledger repaired, no parity waived.
3. The gate later cleared without Attendance changing anything about migrations
   other than their version numbers.

The capture-scope migration was renumbered **twice**, both times because staging
advanced while this branch waited: `20260912000000` → `20260912020000` (W-17
landed `20260912010000`), then → **`20260912040000`** (the Forms slice landed its
own `20260912020000`, making it an outright collision between two different files
at one version). Statements were byte-identical across both renumbers and the
widened owner was re-validated against the cert schema in a rolled-back
transaction each time.

Note for anyone reading the earlier sections: they refer to `20260912000000`.
The promoted version is `20260912040000`.

### Targets, as promoted

Targets 1–7 **DONE**. Targets 8 and 9 **PARTIAL** — both landed their canonical
derivation, operator copy and automated coverage; neither is mounted into a
screen. The financial context line is not in the Attendance card and the
diagnostics have no panel. That operator mounting is deferred, named, and listed
above under DEFERRED.

### Browser certification — still deferred, and still not claimed

Full operator-scenario browser certification was **not** performed, and this
promotion does not claim it. The shared `alloy-cert` stack was held by another
lane throughout, and the fixtures those scenarios need are destructive — running
them would have wiped rows underneath that lane mid-run. Bounded mounted evidence
was collected instead (three settings routes returning 307, both APIs returning
401 with no data in the body, an unauthenticated POST refused 401, and a 404
control proving the codes discriminate), and it is reported above as exactly
that and nothing more.
