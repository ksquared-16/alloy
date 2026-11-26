---
owner: product
status: sprint
last_reviewed: 2026-08-14
sprint: records-roster-completion-phase0
base: origin/staging @ 7fe3a99af
---

# Records + Roster Completion — Phase 0 Product/Truth Audit

Evidence-backed inventory of what the platform already owns, and the smallest
non-duplicative product work needed to finish Records, Add Child / Add Staff,
Roster Studio, and Attendance Capture / Kiosk.

**Method:** every claim below cites a file in this worktree at `a38c1a260`. Where
a responsibility already exists, the recommendation is to *place* or *compose*
it, never to re-own it.

---

## 0. What the platform already owns (the short answer)

| Responsibility | Owner today | Verdict |
|---|---|---|
| Person identity + duplicate gate | `lib/identity` + `lib/staff/resolveStaffPersonCandidates.ts` | **Exists — reuse** |
| Child identity | `lib/admin/person/findOrCreateChildPersonInOrg.ts` | Exists, but **no operator gate** (see B) |
| Household child membership | `customer_members` | **Exists — reuse** |
| Enrollment participation | `process_instances` via `createEnrollmentProcessInstance` | **Exists — reuse** |
| Employment | `employments` + `lib/employment/*` | **Exists — reuse** |
| Person↔child relationships (guardian, pickup, emergency) | `person_child_relationships` + `lib/fields/relationship/relationshipDefinitions.ts` | **Exists — reuse** |
| Ratio / capacity / operating windows | `childcare_ratio_rules`, `childcare_capacity_rules`, `childcare_operating_windows`, authored in **Organization → Locations** | **Exists — do not duplicate** |
| Rooms / sites / programs | `locations` (+ `LocationRoomDetailPanel`, `LocationProgramDetailPanel`) | **Exists — do not duplicate** |
| Child attendance facts | `child_attendance_events` (append-only) | **Exists — reuse** |
| Staff presence facts | `staff_presence_events` (append-only) | **Exists — reuse** |
| Public tokenized access | `form_public_links` + `lib/public/forms/tokenHash.ts`, tour-booking tokens | **Exists — pattern to reuse** |
| Record open (attention) | Focus Panel targets, `lib/runtime/focus/operatorFocusCards.ts` | **Exists — reuse** |
| Search | Search Platform V2, `SearchSubjectKind = person \| child \| household \| location` | **Exists — extend, don't fork** |
| **PIN / OTP / device credential** | — | **DOES NOT EXIST** |
| **Durable idempotency** | — | **DOES NOT EXIST** (in-process only) |
| **Child attendance as a registered command** | — | **DOES NOT EXIST** (REST-only) |

---

## Audit A — Records

### A.1 Staff, as it stands

`/organization/staff` is a rewrite onto `app/adminV2/settings/organization/staff/page.tsx`
(`web/next.config.ts:270-272`). The page loads employment positions, active `site`
locations, and today's org service date, then renders
`components/adminV2/settings/staff/StaffDirectoryPage.tsx`.

What the directory is:

- a flat list of **employment periods**, not people — the row key is `employmentId`
  (`StaffDirectoryPage.tsx:140`)
- fields: display name, position, employment type, primary location, active/ended,
  start or end date
- one filter: *Include former staff* → `/api/admin/staff/directory?include_ended=`
- one command: **Add staff** → `AddStaffModal` → `staff.add`

The file's own doctrine comment (`StaffDirectoryPage.tsx:11-12`) is the important
part and it is correct:

> Selecting a staff member opens the canonical Person surface. There is no staff
> record, no staff drawer, and no staff view model.

**This is asserted but not implemented.** The row links to
`/organization/staff?personId=…` (`StaffDirectoryPage.tsx:143`), and **nothing
reads `personId`** — not `page.tsx` (no `searchParams` at all), not
`StaffDirectoryPage`. Clicking a staff member reloads the same list. Record-open
for staff does not exist today.

The destination it *should* reach already exists:
`OPERATOR_FOCUS_CARDS.employment` (`lib/runtime/focus/operatorFocusCards.ts:41`),
backed by `buildPersonEmploymentComposition` and rendered by
`components/admin/focusPanel/cards/EmploymentCard.tsx`. The composition already
carries `is_staff`, `current`, `periods[]`, `configured_facts[]`, `never_employed`.

**Configurable employment facts already exist:** `lib/employment/employmentConfiguredFacts.ts`
+ `employmentFieldRegistry.ts`, read into the composition and written by `staff.add`.

**Status/lifecycle:** `employmentTypes.ts` owns `isOpenEmploymentStatus`; the
composition renders operator language (`"Active"` / `"Ending 30 Sep 2026"` /
`"Ended"`), not enums. `employment.update` / `employment.end` are registered
actions (`capabilityRegistry.ts:22-37`).

**Assignment / schedule context** is *not* on the person surface — it is on the
roster and assignment surfaces, and `AttendanceWorkspace` already offers
`onOpenStaff` as a record gesture (`AttendanceWorkspace.tsx:112-114`).

### A.2 Children, as it stands

Canonical child truth is **two rows, deliberately**:

1. `persons` — the durable human identity (`findOrCreateChildPersonInOrg.ts`)
2. `customer_members` (`relationship: 'child'`) — membership of a household

Enrollment participation is a **third, separate** thing: `process_instances` with
`subject_id = customer_member_id`, `context_id = opportunity_id`
(`createLeadChildOcmPersistence.ts:205-212`). The comment there is explicit that
the OCM bridge write was removed and `process_instances` is the sole runtime owner.

Child record composition already exists as a first-class surface:
`lib/adminV2/viewModel/drawer/child/composeChildDrawerViewModel.ts`, with an
authoring seed in `childNestedSurfaceRuntime.ts` — default fields
`child.display_name`, `child.date_of_birth`, `child.age`, `inquiry_child.program`,
`child.room`, `inquiry_child.schedule_type`, `child.start_date`,
`child.readiness_summary`, plus **domain-locked evidence sections**: Medical,
Documents, **Pickup instructions**.

Household relationships: `person_child_relationships` with an *open* role
vocabulary (`OperationalRoleKey = PersonChildOperationalRoleKey | (string & {})`),
platform-fixed roles including `guardian`, `emergency_contact`, **`authorized_pickup`**
(`relationshipDefinitions.ts:224, 274, 320`).

Search already treats a child as a first-class subject:
`SearchSubjectKind = "person" | "child" | "household" | "location"`
(`lib/search/searchContracts.ts:28`), and `GlobalRecordSearchGroupKey` is
`children | parents | leads | locations`. Search destinations are **Focus Panel
targets, never routes** (`lib/search/searchDestinations.ts:14-21`).

**There is no children directory surface.** There is no `/organization/children`,
no children list page, and `app/adminV2/components/records/` is a *mock* panel
(`mockRecordsData.ts`) wired only to the department zoom in `AdminV2Shell.tsx:309`.
It is not a Records product and must not be mistaken for one.

### A.3 Recommendation — Records V1

**IA.** Records is a **workspace modal peer** of Assignments and Roster in the left
sidebar (`SidebarModalNavItems.tsx`, `Sidebar.tsx:239-243`) — the same shell
Processing / Communications / Work Items / Roster use. It is *not* an Organization
chapter: Organization is where you configure the business; Records is where you
find a human.

```
Records  (workspace modal)
  Work
    People      — every person, filterable: Staff · Guardians · All
    Children    — every child, filterable: Enrolled · In process · All
```

Two sections, no third level — the same restraint `rosterSections.ts` applies.

**Staff views.** The Staff filter of *People*, carrying the existing directory
columns (position · type · primary location · active/ended · since). Reuse
`/api/admin/staff/directory` unchanged.

**Child views.** A *Children* list is genuinely new **presentation**, but no new
store: it reads `customer_members` joined to `persons`, with participation state
from `process_instances`. `buildCombinedRoster` and the child drawer view model
already prove every join needed.

**Record-open behavior.** One gesture, one adapter — **Focus Panel target**, never
`router.push`. A staff row names `OPERATOR_FOCUS_CARDS.employment`; a child row
names `children` or `currentWork`. This is the same contract `AttendanceWorkspace`
already honours, including its honest failure mode: the gesture resolves **false**
when no active Work Unit hosts the record, and the surface stops offering it rather
than inventing a destination (`AttendanceWorkspace.tsx:108-114`).

**What moves from `/organization/staff`:** the directory list, the filter, and the
**Add staff** command. `/organization/staff` becomes a rewrite to Records → People
→ Staff. The dead `?personId=` link is retired in the same move — it is replaced by
the Focus Panel gesture, not repaired.

**What does NOT belong in Records:**

- employment *configuration* (positions, employment types, configured staff fields) — Organization
- access, roles, sign-in — Organization → Access (the boundary `StaffDirectoryPage.tsx:6-9` exists to protect)
- rooms, programs, ratios, capacity — Organization → Locations
- attendance and presence facts — Roster → Attendance
- any new person or child store

---

## Audit B — Add Child

### B.1 Every existing path

| Path | Entry | What it writes |
|---|---|---|
| Create Lead | `CreateLeadModal` → `create_lead` | persons + customers + customer_members + enrollment `process_instances` |
| Relationship action `add_child` | opportunity drawer / person drawer / BOS rail → `executeRelationshipAction` | see below |
| Relationship action `link_existing_child` | same surfaces | links an existing household child to an opportunity |
| Focus Panel | `CurrentWorkAddChildPanel.tsx` | same `add_child` action |
| Processing commit | `IDENTITY_COMMAND_KEYS.createChild` (`create_child`) + `linkChildToHousehold` | semantic commit-plan ops, gated review |
| Forms intake | `lib/forms/intake/applyIntakeChildToOpportunity.ts` | intake → opportunity child |

### B.2 What Alloy creates today when an operator adds a Child outside Create Lead

`executeRelationshipAction.ts:300-379`, three distinct outcomes:

1. **`scope = this_opportunity`, child not yet a member** →
   `findOrCreateChildPersonInOrg` (persons) → `applyCreateLeadChildParticipationFromIdentity`
   → `customer_members` **and** an Enrollment `process_instances` row
   (`createLeadChildOcmPersistence.ts:205-212`). **Adding a child on a lead
   already creates enrollment participation.**
2. **`scope = household`** → persons → a bare `customer_members` insert
   (`relationship: 'child'`, `metadata.source: 'relationship_action'`). **No
   participation, no process instance.** This is the existing "child not in an
   enrollment process" case, and it already works.
3. **child already a member, `scope = this_opportunity`** →
   `ensureOpportunityCustomerMemberLink` only.

**Evidence discrepancy to fix:** the registry declares
`writeTargets: ["persons", "customer_members", "opportunity_customer_members"]`
(`relationshipActionRegistry.ts:138`), but the OCM bridge write was removed —
`createLeadChildOcmPersistence.ts:200-203` states `process_instances` is the sole
owner and *no OCM row is created*. The declaration is stale.

### B.3 The real gap — identity is resolved silently

Add Staff has a hard gate: `resolveStaffPersonCandidates` runs the **same** canonical
candidate generator and six-band classification Processing uses, and adds one rule —
**a match is never resolved silently**; the operator must pick a person or override
with a reason (`resolveStaffPersonCandidates.ts:1-17`, `addStaffService.ts:66-77`).

Add Child has **no gate**. `findOrCreateChildPersonInOrg` matches a household member
by name+dob, then falls back to an org-wide `ilike` first/last name match (dob only
if supplied) and **returns the match silently**. Two children named Emma Chen in one
org, one without a dob on file, silently collapse into one person.

### B.4 Recommendation — canonical Add Child semantics

**Add Child is NOT Create Lead.** The authority proves they are separable: path 2
above creates a child with no opportunity, no lead, and no process instance, and it
is already shipped. Nothing in the current code requires an opportunity except the
explicit guard on `scope === "this_opportunity"` (`executeRelationshipAction.ts:302`).

Canonical semantics — one command, `child.add`, promoted to a **registered action**
so it is reachable from Records (today `add_child` is reachable only from
`opportunity_drawer` / `person_drawer` / `bos_rail`):

| Case | Behaviour |
|---|---|
| New sibling in an existing household | household is the anchor; persons + `customer_members`. Participation only if the operator asks for it. |
| Existing Child / person linkage | operator picks the candidate explicitly — reuse the Add Staff gate, do not silently match |
| Imported Child | `external_source` / `metadata.source` carries provenance, same shape as `staff_add` |
| Child requiring Enrollment after creation | creation and participation are **two steps**; participation is `createEnrollmentProcessInstance`, offered as a follow-on |
| Child not currently in an Enrollment process | **already supported** — path 2. This is the normal steady state for an enrolled child whose process has closed. |

**Exact reusable actions:** `resolveStaffPersonCandidates` (rename to a
kind-agnostic `resolvePersonCandidates` — it is already generic),
`findOrCreateChildPersonInOrg` (behind the gate, not in front of it),
`applyCreateLeadChildParticipationFromIdentity`, `createEnrollmentProcessInstance`,
`ensureOpportunityCustomerMemberLink`, `applyCanonicalChildScopedRelationships`.

**No new table. No new identity model.**

---

## Audit C — Add Staff / Onboarding boundary

### C.1 Current command

`staff.add` is a registered action (`lib/adminV2/actions/definitions/staffAddAction.ts`)
in the capability registry (`capabilityRegistry.ts:159-169`), executing
`lib/staff/addStaffService.ts`. Order is fixed and documented:

```
resolve identity → link or (explicitly) create Person → create Employment
```

By construction it **never** creates an auth user, sends an invitation, assigns a
role, grants a permission, or touches an access-scope table
(`addStaffService.ts:14-17`). `POST /api/admin/persons` is deliberately not used
because it has no duplicate detection.

`/api/admin/staff/resolve-person` exposes the same gate read-only for UI reuse;
`staff.add` re-runs it server-side.

### C.2 Recommendation

**Moves into Records immediately:** the `staff.add` command and its modal, placed on
Records → People → Staff. Nothing about the command changes — only where it is
offered. Configured employment facts stay owned by
`employmentConfiguredFacts` / `employmentFieldRegistry`.

**What future Staff Onboarding would own:** a *process*, not a creation —
background checks, credential and certification expiry, required documents,
training, orientation tasks, first-day readiness. That is a
`process_instances` subject with a business process, exactly like Enrollment. It
composes over the employment `staff.add` creates; it does not replace it.

**What direct Add Staff must remain possible for:** backfilling existing employees
at go-live, importing from an HR system, a substitute or volunteer who must be
roster-eligible today, and any tenant that does not run an onboarding process at
all. Roster and presence both hard-require employment coverage
(`staffPresenceService.ts:9-11`), so an org with no onboarding process must still
be able to make someone rosterable in one step.

**Naming:** keep `staff.add`. It is honest — it adds a staff member, and onboarding
will be `staff_onboarding.*`, a different noun. Renaming now in anticipation would
churn the capability registry, the ledger, and the tests for a change that has not
been designed.

---

## Audit D — Roster Studio

### D.1 Roster vs its peers

Roster (`app/adminV2/roster/`) is a workspace modal peer of Assignments
(`SidebarModalNavItems.tsx:255-276`), on the canonical `WorkspaceShell`, with two
sections and **one mode**:

```
Roster       Day / Week × Rooms / Staff
Attendance   who is actually here, today
```

`RosterWorkspaceShell.tsx:7-9` states the current position plainly: *"Roster only
runs, so a mode switch with one mode in it would be furniture."* The mode rail is
explicitly opted out (`showModeRail={false}`), not inferred.

Assignments, by contrast, is Work | Studio with
`SCHEDULING_STUDIO_TABS = Assignment Categories · Patterns · Validation`.

### D.2 Configuration Roster and Attendance already consume

| Configuration | Store | Authored today in |
|---|---|---|
| Ratio rules + stepped tiers | `childcare_ratio_rules` (+ tiers) | **Organization → Locations** (`LocationOperationalRulesPanel`, `RatioTierFields`, `ConfigRuleAuthoringGroup`) |
| Capacity (physical / licensed / operational) | `childcare_capacity_rules` | same |
| Operating windows | `childcare_operating_windows` | same |
| Schedule / eligibility rules | config-rule tables | same |
| Sites, rooms, programs | `locations` | **Organization → Locations** |
| Room ↔ program ↔ age-group scope | derived by `roomConfigResolvers.ts` | derived, not authored |
| Assignment categories / patterns / validation | Assignments Studio | Assignments |
| Attendance vocabulary (kinds, actors, sources) | code constants (`attendanceVocabulary.ts`) | **not configurable** |
| Kiosk / capture configuration | — | **does not exist** |

Writes go through `configRuleAuthoringService.ts` — versioned, effective-dated,
never overwritten, prior version linked via `metadata.supersedes_id`. The only
client is `components/adminV2/settings/locations/useLocationOperationalRules.ts`.

### D.3 Recommendation

**Do not build a Roster Studio in V1.** Every rule Roster reads is already authored
by a real owner, versioned and effective-dated, on a surface where it is scoped to
the location it belongs to. A Studio tab that re-presented ratios and capacity would
be a second authoring path over the same effective-dated tables — the exact
duplication this audit is meant to prevent.

Roster earns a Studio only when it owns configuration nobody else does. Today there
is exactly one candidate, and it belongs to Kiosk:

| Recommended section | Justification |
|---|---|
| **Capture** (later) | kiosk sites/devices, which rooms a device may capture, whether guardians may self-check-in, correction window. **Genuinely new — no owner exists.** |

Everything else is a **link**, not a section: Roster's health band should deep-link
to `/organization/locations` for the room whose ratio produced the verdict.

**Gaps that genuinely require new config** (all Kiosk-scoped, all deferrable past
Roster V1): device registration, per-device room scope, self-service permission,
correction window.

**Explicitly out of Studio:** staff and children record lists (those are Records),
and anything already owned by Organization → Locations.

---

## Audit E — Attendance Capture / Kiosk

### E.1 Every existing entry surface

Operator capture is `components/adminV2/scheduling/screens/AttendanceWorkspace.tsx`,
hosted in Roster → Attendance. It is **already tablet-shaped** — its own comment
reads *"attendance is used standing up, on a tablet"*, with 40px minimum touch
targets (`AttendanceWorkspace.tsx:184-187`).

It authors both fact streams, and it authors them **through two different paths**:

```
staff   →  POST /api/admin/actions/execute   { action_key: "staff_presence.record" }
child   →  POST /api/admin/childcare-attendance
```

(`AttendanceWorkspace.tsx:301-360`)

### E.2 The asymmetry that matters

| | Staff presence | Child attendance |
|---|---|---|
| Store | `staff_presence_events` | `child_attendance_events` |
| Append-only at DB level | yes | yes |
| Correction / reversal by new row | yes | yes |
| Written by | `staff_presence.record` / `.correct` | `recordAttendanceEvent` / `correctAttendanceEvent` |
| **Registered action** | **yes** | **no** |
| **In the capability registry** | **yes** (`capabilityRegistry.ts:35-36`) | **no — `attendance` does not appear at all** |
| Route guard | action execution pipeline | `requireAdminOrOps()` on the REST route |

Both fact tables are otherwise near-identical in shape: `entry_type`
(original/correction/reversal), `corrects_event_id`, `actor_type`, `source_type`,
`source_key`, room constraints, no-self-reference constraint.

**The child attendance fact model already anticipates the kiosk.**
`ATTENDANCE_ACTOR_TYPES = staff | parent | guardian | emergency_contact | system`
and `ATTENDANCE_SOURCE_TYPES = operator_action | staff_workspace | parent_portal |
processing_import | system` (`attendanceVocabulary.ts:19-34`). Nothing new is needed
in the vocabulary to record a guardian check-in.

### E.3 Public / tokenized primitives that exist

- **Token minting + hashing:** `generateSecureFormLinkPlaintext` (32 random bytes,
  base64url) and `hashFormLinkToken` (SHA-256) with `timingSafeEqualHex`
  (`lib/admin/forms/formPublicLinkToken.ts`, `lib/public/forms/tokenHash.ts`).
  Plaintext is never stored — `form_public_links.token_hash` is.
- **Public route shape:** `app/api/public/forms/[token]/{resolve,submissions}` and
  `app/api/public/tour-booking/[token]/{resolve,book,confirm,cancel,…}` — service-role
  client, origin check (`requestEmbedOrigin`), uniform `publicOk` / `publicErr`.
- **Public page shape:** `app/forms/embed/[token]`.

### E.4 What does NOT exist

- **No PIN, OTP, or one-time code capability anywhere.** A search across `lib/` and
  `app/` for `otp`, `one_time_code`, `pin_code`, `verificationCode` returns nothing.
- **No device registration, no device identity, no kiosk site config.**
- **No durable idempotency.** `runPlatformTransaction`'s idempotency key is an
  in-process `Map` of in-flight promises (`platformTransaction.ts:227-249`), and
  `executeCommandInvocation.ts:7` says so outright: *"Exactly-once guarantee is per
  route/invocation guard — not distributed idempotency."* Neither fact table has a
  unique constraint or unique index on `source_key`. **A kiosk that retries after a
  dropped connection double-authors a check-in today.**
- **No pickup-authority enforcement at capture.** `authorized_pickup` exists as a
  canonical role on `person_child_relationships`, and the child surface has a
  domain-locked *Pickup instructions* section — but nothing reads either at
  check-out.

### E.5 Recommendation — smallest safe Kiosk V1

**Kiosk V1 is a placement, and to be a placement it needs one shared command path
first.** Today "the existing fact-authoring commands" is not one thing — staff goes
through the action pipeline, children go through REST. Building a kiosk on that
split would make the kiosk the second child-attendance backend by accident.

So the prerequisite is: **promote child attendance to registered actions**
`attendance.record` / `attendance.correct`, delegating to the *unchanged*
`recordAttendanceEvent` / `correctAttendanceEvent`. The existing REST route stays as
a thin caller. This mirrors `staffPresenceActions.ts` exactly and adds no store.

Then:

**Operator/user journey.** A guardian arrives at the entry tablet → picks their
household from a short scoped list (or scans their link) → sees their children with
today's expected room → taps Check in per child → confirmation → auto-return to idle.
Check-out is the same with a pickup-person confirmation.

**Authentication / authorization.** Reuse the tokenized-link pattern verbatim: a
kiosk session is a **device token**, minted server-side, stored hashed, resolved via
a `/api/public/kiosk/[token]/…` route family with `timingSafeEqualHex`. The **device**
is authenticated; the **person** is attested — the actor is recorded as
`actor_type: guardian` with `actor_person_id`, which the fact model already carries.
No PIN in V1: building a credential system is a larger commitment than this slice,
and the correction path (`entry_type: 'correction' | 'reversal'`) is the existing
answer to a mistaken tap.

**Site / device scope.** A kiosk token is scoped to exactly one `site_location_id`
and optionally a room set. Site scoping is already enforced in both services.

**Check-in / check-out behavior.** `check_in` requires a room (DB constraint);
`check_out` carries none. Both author through `attendance.record`. Nothing is edited
in place, ever.

**Minimum configuration.** One new concept only: a kiosk device (token hash, site,
optional room scope, active flag) — the direct analogue of `form_public_links`.

**Canonical shared command/fact path:**

```
operator tablet ─┐
                 ├─→ attendance.record / staff_presence.record
kiosk device ────┘        ↓
                   recordAttendanceEvent / recordStaffPresence
                          ↓
             child_attendance_events / staff_presence_events   (append-only)
                          ↓
                   attendanceFold / staffPresenceFold → roster read model
```

**Deferred from V1:** PIN/OTP, offline queueing, photo capture, signature capture,
pickup-authority *enforcement* (display first), staff self-service kiosk presence,
parent mobile app.

**Non-negotiable before any kiosk writes:** a unique index on
`(org_id, source_key)` where `source_key` is a client-supplied idempotency key.
`source_key` already exists on both tables with a non-empty check — the column is
there, the uniqueness is not.

---

## Implementation sequence

Ordered smallest-first; each slice is independently shippable and none reopens
architecture.

| # | Slice | Why it is first / small |
|---|---|---|
| **1** | **Records V1 — People + Children lists, Focus Panel record-open** | New presentation only. Moves the staff directory + Add staff off `/organization/staff`, adds a children list over existing joins, and **fixes the dead `?personId=` link** by replacing it with the Focus Panel gesture. No store, no command. |
| **2** | **Add Child identity gate + `child.add` registered action** | Generalize `resolveStaffPersonCandidates`, put it in front of `findOrCreateChildPersonInOrg`, promote `add_child` to a registered action so Records can offer it. Also corrects the stale `opportunity_customer_members` write-target declaration. |
| **3** | **`attendance.record` / `attendance.correct` registered actions** | Wraps existing services unchanged. Makes both fact streams one dispatch path and puts child attendance in the capability registry for the first time. Prerequisite for Kiosk. |
| **4** | **Durable idempotency on both fact tables** | Unique index on `(org_id, source_key)`; the actions accept and pass a client key. Small migration, unblocks any retrying client. |
| **5** | **Kiosk V1** | `kiosk_devices` (token hash, site, room scope, active) + `/api/public/kiosk/[token]/*` + the kiosk page, all modelled on `form_public_links`. Authors only through slice 3. |
| **6** | **Roster → Capture Studio (only if slice 5 ships)** | Device management and capture policy. The only configuration Roster would genuinely own. |
| **7** | *(deferred, not this program)* Staff Onboarding | A process over employment, designed separately. |

**Not in this sequence, deliberately:** a Roster Studio for ratios/capacity/rooms
(Organization → Locations owns it), any new attendance backend, any new identity or
relationship model, any PIN/credential system.

---

## Open questions for Kelly

1. **Records placement** — workspace modal peer of Assignments/Roster (recommended),
   or an Organization chapter? This decides whether `/organization/staff` becomes a
   rewrite or stays put.
2. **Kiosk person attestation without a PIN** — is device-token + guardian-selects-
   themselves acceptable for V1, with correction as the remedy? A PIN system is a
   materially larger slice.
3. **Slice 4 ordering** — durable idempotency is listed before Kiosk. Confirm it is
   not deferred: today a retried check-in double-authors.
