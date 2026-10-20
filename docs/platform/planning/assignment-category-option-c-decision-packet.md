# Assignment Category — Option C Decision Packet

Status: **PROPOSED — Director decision required. No implementation authorized.**
Evidence base: staging `3416e3952`; code paths cited are under `web/` and `supabase/migrations/`.

The goal: an operator selects the actual assignment **target** (a room, or a configured service),
and Alloy resolves the assignment **category** (purpose) from configuration wherever that is
unambiguous — without confusing category with the **primary** designation, and without a second
taxonomy, room identity, pricing engine or assignment writer.

---

## 1. Current canonical entities and relationships

| Entity | Storage | Owner | Notes |
|---|---|---|---|
| Assignment Category | `operational_assignment_types` (org-level: `key`, `label`, `subject_types[]`, `default_behavior jsonb`, `billing_/attendance_/staffing_participation`) | Configuration (Operations → Studio) | Seeded: primary_classroom, before_care, after_care, enrichment, transportation, therapy, recurring_service. **Seed sets no `default_behavior`.** |
| Category behavior | `default_behavior` → `AssignmentTypeBehavior` (`lib/operationalAssignments/assignmentTypeBehavior.ts`) | Configuration | `primaryEligible`, `allowsOverlap`, `programRequirement`, `roomRequirement`, `eligibleSpaceMode` (any/selected/program_match), `eligibleRoomIds`, `locationIds`, `billingExpectation`, `eligibleCatalogCategories` |
| Room | `locations` (`location_type='unit'`, `unit_role` operational_group / physical_space / shared_space) | Location | Carries ≤1 `metadata.program_category_id`. **No category.** |
| Program | `location_program_categories` | Programs | Room → program via room metadata. |
| Program offering / variant | `program_offerings` (`program_key`, `attendance_type`), `program_offering_variants` | Programs → Commercial | Prices attach to variants. **No category link.** |
| Service / product | `financial_services`, `commercial_products` | Commercial / Financials | **No category link.** Not selectable in the assignment flow. |
| Assignment | `schedule_assignments` (`subject_type`, `site_location_id`, `room_location_id`, `program_category_id`, `operational_assignment_type_id`, `is_primary`, effective dates, status) | Enrollment / Placement + Operations Temporal | Child home room/program also in `child_placements`. |
| Accepted tuition | `enrollment_pricing_terms` | Financials | Pricing reads program/schedule/days/site — **not category.** |

Relationships that exist: room → program (one); category → rooms (`eligibleRoomIds`, optional,
empty by default, browser-only). Relationships that **do not** exist: room → category,
offering/service → category, org default primary category.

## 2. Confirmed inconsistencies and server-enforcement gaps

Classification: (a) missing invariant enforcement · (b) deliberate client guidance ·
(c) enforced via another canonical path · (d) needs a product decision.

| Rule | Server today | Class |
|---|---|---|
| `primaryEligible` | Not read by any writer or trigger; not even by a picker. Seeds read `false` (Primary Classroom included); Studio-created categories default `true`. | (d) first (seed backfill + meaning), then (a) |
| `allowsOverlap` | Not enforced; conflicts hard-coded 0. Inventory doc: Calculations own binding, Assignments warn. | (b)/(d) |
| `roomRequirement` | Not enforced by the service; `change_room` demands *some* room even for not_used; Card treats optional as required, Workspace modal as optional. | (a) + (d) for "optional" meaning |
| `programRequirement` | Not enforced (DB checks program ∈ site only). | (a) |
| `eligibleSpaceMode` `program_match` | Picker shows misses for override — documented intent. | (b) |
| `eligibleSpaceMode` `selected` / `eligibleRoomIds` | Picker filter only. | (a) or (d) if override intended |
| `locationIds` | Never read anywhere; inactive categories not rejected on write. | (a) |
| `subject_types` | DB trigger. | (c) |
| Category required on secondary | Command layer (`assignment.create` / `change_room` eligibility). | (c) |
| Category on primary | Every primary writer writes **null** (first schedule, materialization, `/api/admin/schedule-assignments`, `/api/v1/schedule-assignments`). Inventory doc lists an org default primary type as future work. | (d) |
| Assignment room is an operational group | Enforced for `child_placements` only (trigger); `schedule_assignments.room_location_id` accepts any org location. | (a) |
| Assignment room belongs to the assignment site | Placement validates; assignment checks org only. A staff row's room drives attendance capture scope. | (a) |
| Child primary uniqueness | Unique index (one operational primary per agreement) + overlap trigger. | (c) |
| Supersession, primary | Atomic RPC / `set_primary` with compensation. | (c) |
| Supersession, secondary edit / `change_room` | Prior row closed, **then** successor inserted, no compensation; prior row lookup not scoped to the subject. | (a) |

Side findings: `set_primary` promote leaves the promoted secondary live; the Card's promote sends
an effective date the service refuses (≤ current primary start). Projection labels a typeless
committed primary "No billing"; attention counts every typeless primary as missing a type; a
room-less child service row *displays the home classroom* (projection falls back to placement).

## 3. Proposed target relationships

1. **Every assignment carries a category** — primary included. "Primary" stays a separate
   designation (`is_primary`), never inferred from a category.
2. **Category ↔ room: eligibility, not identity.** A room may list the categories it serves
   (`eligibleCategoryKeys` on the room, or reuse category `eligibleRoomIds` as the single
   direction). One direction only — recommended: keep it on the **category**
   (`eligibleSpaceMode`/`eligibleRoomIds`, already authored in Studio) and add a
   **room default** only where Directors want one.
3. **Category ↔ service/offering:** a service assignment's category comes from the offering it
   delivers. Requires an explicit `program_offerings.assignment_type_key` (or on
   `financial_services`) — new, opt-in.
4. **Org default primary category** (already planned): the first/primary assignment of a child
   defaults to it (normally Primary Classroom).

## 4. Proposed operator interaction

- **Add Assignment** opens the target picker: rooms (operational groups at the site) and, when
  configured, services. Not a category list.
- Choosing a target resolves eligible categories:
  - exactly one → shown as a chip ("Before Care"), editable;
  - several → an inline required choice among *those* categories only (no arbitrary inference);
  - none → the operator chooses from all active child categories (today's picker, inline).
- The first assignment for a child resolves to the org default primary category and the
  primary designation; later assignments are secondary unless explicitly promoted.

### Examples

| Scenario | Target | Category resolution | Room | Notes |
|---|---|---|---|---|
| Infant B, primary | Room Infant B | Org default primary category (Primary Classroom) | Required, operational group | Primary designation by first-assignment rule, not by category name. Tuition from program/offering as today. |
| Soccer Shots | Service "Soccer Shots" (offering/service with `assignment_type_key = recurring_service`) | Recurring Service | Optional — any eligible space or none | Independent schedule; commercial terms from the service, not tuition. Requires §5 link + a space policy (shared spaces are not placement targets). |
| Before Care | Room "Toddler 2" | Room serves Primary Classroom **and** Before Care → inline choice | Same room as primary allowed | Secondary; distinct schedule; no change to home placement. |
| One room, many categories | Any multi-purpose room | Inline choice limited to that room's eligible categories | — | Never inferred by name or position. |

## 5. Minimum configuration / schema changes (each needs approval)

1. Backfill `default_behavior.primaryEligible` for seeded categories (data, no schema).
2. Org setting: default primary category key (setting row; planned in inventory doc).
3. Optional: room default category (location metadata key) — only if §3.2 room defaults are wanted.
4. Optional, for services: `assignment_type_key` on `program_offerings` or `financial_services`
   (one column + validation) — only if service-first selection is wanted now.
5. No new tables, no new assignment writer, no pricing change.

## 6. Existing-record compatibility and migration

- Null-category primaries remain **valid**. Options: (a) leave null and resolve the org default at
  read time for display; (b) one-time backfill to the org default primary category (data
  migration, reversible, audited). Recommend (b) only after §5.1–5.2 land.
- Typed secondaries unchanged. Supersession already carries category forward.
- No change to `child_placements`, accepted tuition, attendance or pricing history.

## 7. Downstream impacts

- Staffing supply / qualifications read category: correct categories improve them; a wrong
  inference would change staff supply — hence "never infer arbitrarily".
- Projection/attention: a typed primary stops reading "No billing" / "missing type".
- Pricing and attendance: no change (they do not read category).

## 8. Authorization and temporal implications

- Category changes on committed assignments must supersede (effective-dated), never patch; the
  secondary supersede path needs to become atomic first (§2).
- `primaryEligible` enforcement belongs in the command layer and `set_primary`, not the browser.
- Server must validate room ∈ site and room role for assignments (today placement-only).

## 9. Complexity assessment and code that can be removed

- Removes: the separate `pick-type` screen/mode; the Card vs Workspace disagreement on
  "optional"; the browser-only `scopeRoomsForAssignmentPicker` becomes server-backed validation
  plus a picker hint.
- Adds: one resolver (target → eligible categories, pure, server and client shared), command
  validations, an org setting. Moderate.

## 10. Recommended phases and approval boundaries

| Phase | Scope | Approval needed |
|---|---|---|
| 0 | Fix confirmed gaps that are invariants regardless of UX: room ∈ site and room role on assignment writes; atomic secondary supersession. | Engineering approval (no product semantics). |
| 1 | Decide primaryEligible meaning; backfill seeds; org default primary category setting. | **Director:** semantics + data migration. |
| 2 | Primary assignments carry the default category (new + optional backfill). | **Director:** migration consequences. |
| 3 | Target-first picker with category resolved from category→room eligibility; inline choice when several. | **Director:** UX sign-off. |
| 4 | Services as targets (offering/service → category link). | **Director:** schema + commercial boundary. |

Open Director decisions: (1) primaryEligible meaning and seed backfill; (2) org default primary
category; (3) direction of the room↔category link (category list vs room default); (4) whether
services become assignment targets now; (5) backfill vs read-time default for existing primaries;
(6) whether `selected` space mode is a hard rule or overridable guidance.
