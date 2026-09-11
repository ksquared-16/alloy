# Attendance Productization V1 — Thread 8 convergence inventory

Evidence-backed inventory of the promoted Attendance product, taken on the
Thread 8 base.

| | |
|---|---|
| Base | `fefda677a196c27fa69218bdfe92f898c4f64a8f` (`origin/staging`) |
| Thread 7 handoff | `f5f2d257a` — verified an ancestor of this base |
| Lane | `agent/attendance` |

Classifications are the Thread 8 scale: **A** exists and works · **B** exists but
hidden or unusable · **C** duplicated · **D** partial · **E** missing ·
**F** deferred by design · **G** wrong owner.

Everything below was read from the tree at that base. Where a capability is
claimed absent, the grep that found nothing is named, because "no surface exists"
is the claim most easily made by not looking.

---

## Baseline note — the base was wrong before it was right

The lane branch was **0 ahead / 38 behind** `origin/staging`, and the Thread 7
merge `f5f2d257a` was *not* an ancestor of it. The Attendance tree was
nevertheless byte-identical to staging's, because `f5f2d257a` is the merge of
*this branch* into staging — the content was authored here. Only the merge
commit was missing.

That is the failure mode the repository's own `CLAUDE.md` warns about: being in
the right repository is not being on the right base. The lane was fast-forwarded
to `fefda677a` before any code was written.

---

## 8A. Attendance Workspace — **A**

Attendance composes the canonical shell; it did not invent module chrome.

`RosterWorkspace.tsx:26,626` mounts `OperationsWorkspaceShell`, which is built on
`@/components/workspace/WorkspaceShell`. `AttendanceWorkspace.tsx:44` draws from
`@/components/workspace/workspaceTokens`. `components/workspace/doctrine.ts:6`
names Attendance as one of the modules the doctrine is for, with Processing as
the reference implementation.

No action. The instruction's "do not invent custom module chrome or KPI
architecture" is already satisfied.

## 8B. Focus Panel — was **C**, now **A**

The Focus Panel read path is
`buildAttendanceCardVM.ts:287` → `buildChildAttendanceReadModel` →
`deriveCurrentPresence`.

`deriveCurrentPresence` was **independently authoritative** — answer 1 of the
four the instruction offered. It reconstructed presence by counting a day's
check-ins against its check-outs, while the Workspace went through
`resolveCurrentWhereabouts` → the certified `whereaboutsAt` fold.

Counting has no opinion about **order**, and that is where the two surfaces
actually disagreed:

| Day | Counting said | Fold said |
|---|---|---|
| check-in, then absence | `present` | `absent` |
| check-out at noon, check-in at one | `checked_out` | `present` |
| check-in, check-out, then absence | `checked_out` | `absent` |

Converged in `b2ac2a1ef`. `deriveCurrentPresence` now translates the fold's
answer; day scope is preserved by filtering the day's facts *before* the fold, so
yesterday's un-closed check-in cannot leak into today. The published
`CurrentPresenceState` shape is unchanged.

`surfaceWhereaboutsConvergence.test.ts` no longer describes two implementations
and gained those three days as regression guards. They **fail** against the
counting implementation and pass against the fold — verified by reverting the
source and re-running, which is the evidence that this changed behaviour rather
than moving code.

## 8C. Settings / configuration ownership

`lib/adminV2/configurationWorkspaceDomains.ts` enumerates the configuration
domains: Organization (Programs & Locations, Access, Communications,
Departments), Data Model, Operations (Automation, Processes, Waitlist ranking,
Tour availability), Experience, Business (Financials).

| # | Concern | Owner today | Class |
|---|---|---|---|
| 1 | Locations | `settings/locations/` — 20+ panels | A |
| 2 | Physical-space hierarchy | `settings/locations/` | A |
| 3 | Operational groups | `settings/locations/` | A |
| 4 | Shared spaces | `settings/locations/` | D |
| 5 | Teacher/user access | `settings/access/AccessUsersConfigurationPage` | A |
| 6 | Staff assignment | `lib/operationalAssignments/` services only | **B** |
| 7 | User ↔ Person linkage | `user_person_links` — no surface | **B** |
| 8 | Relationships | canonical Person + relationship edges | A |
| 9 | Authorized pickup | relationship roles, child-scoped | A |
| 10 | Safeguarding | `child_safeguarding_screenings` — no surface | **B** |
| 11 | Kiosk / device configuration | **nothing** | **B** |
| 12 | Attendance capture settings | was **nothing**, now Access | B → A |
| 13 | Integration producers | **nothing** | **B** |
| 14 | Producer site grants | **nothing** | **B** |
| 15 | Mappings | **nothing** | **B** |
| 16 | Operational Expectations | API route only | **B** |
| 17 | Financial / commercial policy | `settings/financials/` | A |

The headline: for kiosk, producers and expectations the configuration is not
*spread across owners* — it is **absent from Settings entirely**, while the
runtime substrate is promoted and working.

`grep -rln -i "kiosk\|attendance_capture\|integration_producer"` over
`web/components/adminV2/settings` and `web/app/adminV2/settings` returns nothing.
A `grep -rln` for `user_person_links` and for `child_safeguarding_screenings`
over all of `web/components` and `web/app` likewise returns nothing: both are
schema that no surface reads. Staff assignment has services
(`operationalAssignmentService.ts`, `setPrimaryOperationalAssignment.ts`) and no
administration UI — which matters for Target 3, because `assigned` capture is
only as good as the assignments behind it.

---

## Convergence targets

### Target 1 — Location configuration · **D**

`settings/locations/` owns Site / room / group and is the correct owner. Shared
spaces are representable in the canonical hierarchy but not separately expressed
in the configuration UI. No second location model was found, and none was
created. Remaining work is vocabulary, not architecture.

### Target 2 — One current-presence implementation · **DONE** (was C)

See 8B. Commit `b2ac2a1ef`.

### Target 3 — Teacher capture administration · **DONE** (was B)

`attendance_capture_scope` lives on `user_access_profiles`
(`20260911110000_attendance_capture_scope_policy.sql:43`), is read by
`resolveAdminAccessCore.ts:118,446`, and is **enforced on every capture** at
`attendancePermissions.ts:193`.

Nothing could write it. The Access page edited department and site scope only;
the PATCH at `api/admin/users/[userId]/access-scope/route.ts` upserted a profile
without the field. So every membership sat on the column default `site` and the
`assigned` mode was **unreachable from the product** — a capability only a DBA
could grant.

Closed in `fe84023df`, on the Access owner rather than in an Attendance surface,
because it is an authority a person holds. The projection carries `unset`
alongside `site`/`assigned` for the reason that module already carries it for the
other scopes, and the editor refuses to save until an operator chooses — `site`
is the permissive answer and `assigned` can silently stop a teacher recording
anyone, so neither is a safe default.

### Target 4 — Kiosk administration · **B**, substrate is rich

`attendance_kiosk_devices` carries everything the target asks for: `label`,
`site_location_id`, `capabilities[]`, `status` active/revoked with
`revoked_at`/`revoked_by`, `credential_hash`, `credential_last_four`,
`rotated_at`, `last_seen_at`. Logic exists in
`attendance/kiosk/` — device authority, credential rotation, session gateway,
child eligibility, rate limit, service-day guard.

**There is no administration surface.** The only kiosk UI is `app/kiosk/page.tsx`,
which is the device itself.

Two findings that change what may honestly be built:

- **Credential rotation is real.** `rotated_at` is written by
  `kioskCredentialRotation.ts:79,138`. No parallel credential system is needed.
- **`last_seen_at` is declared but never written.** It appears only in the two
  migrations that define it; `kioskDeviceAuthority.ts` reads the device row and
  never updates it. A "Last seen" column would therefore render empty forever.
  Per the instruction's own rule, this is **classified, not fabricated**. The
  same is true of the producer table.

### Target 5 — External producer administration · **B**

`attendance_integration_producers`, `_producer_sites`, `_mappings`, `_events` are
promoted, with `producerAuthority.ts` and `externalMapping.ts`. No administration
surface, by the same grep as above. `last_seen_at` is unwritten here too.

Classroom Coach remains **REQUIRES_PROVIDER_WORK**. Nothing in the tree changes
that, and generic producer administration must not be allowed to imply it.

### Target 6 — Relationship / pickup / safeguarding · **A**

Correct as built, and worth not disturbing. `kioskChildEligibility.ts:63,65`
distinguishes check-in roles (`parent`, `guardian`, `authorized_pickup`) from the
checkout role (`authorized_pickup` alone), and resolves through
`resolvePickupAuthorization` per child. Authority is an edge, not a person flag,
and household membership implies nothing — exactly the Thread 5 invariant.

Improvement here is navigation and diagnostics, not new configuration.

### Target 7 — Expectations / closure discoverability · **B**

`api/admin/operational-expectations/route.ts` exists. A `find` for
`*expectation*` over `web/components` and `web/app` returns **only that route** —
there is no authoring or administration UI. Planned absence, vacation, sick,
site closure and group closure are API-only today.

No Attendance absence or closure table was created, and none should be.

### Target 8 — Financial policy discoverability · **E**

`buildAttendanceCardVM.ts` contains no reference to consequence, credit or
financials. The Thread 7 chain is promoted and working; Attendance simply says
nothing about it. This is a missing *quiet context line plus deep link*, which is
all the instruction permits — not a settings surface.

### Target 9 — Diagnostics · **E**

No surface answers "why isn't Attendance working for this person/device/child".
Every input the answer needs exists and is now partly reachable: capture scope
(Target 3), kiosk status and site binding, producer state and site grants,
mapping presence, pickup edges, active placement.

---

## Defect found outside the Thread 8 scope

`web/tests/access/catalogConsolidationLock.test.ts` **fails on this base**, and
failed before any Thread 8 change — the test scans `supabase/migrations/*.sql`
from disk and no migration was modified by this thread.

`20260909230000_attendance_capability.sql:45,53` registers `attendance.record`
and `attendance.read` by writing `public.permissions` and
`public.permission_keys`. The Access W-9/W-60 consolidation retired both in
favour of `permission_definitions`, which the same migration also writes at line
62. The writes are `to_regclass`-guarded, so they are inert where the retired
tables are gone — but the migration's own comment ("the RBAC catalog is spread
across up to three tables") records a belief about the catalog that the
consolidation had already made false.

This is an Attendance-authored migration violating ONE CONCEPT → ONE OWNER
against the Access catalog, so it is Thread 8's kind of defect. It is **not fixed
here**: the only change that satisfies a file-scanning test is an edit to an
already-promoted migration, and rewriting promoted migration text risks ledger
and checksum parity in hosted environments. That trade belongs to the Access
owner and to Kelly, not to this thread acting alone.

A second, unrelated pre-existing failure in the same file concerns a `fin.read`
grant migration in Financials.
