# Communications V2 — Announcement Audience Target Classification (B6 correction)

**Path:** `docs/sprints/06_2026/communications-v2/communications_v2_audience_target_classification.md`
**Status:** CRM audience-model audit + B6 resolver classification. Planning/reference.
**Date:** 2026-06-22
**Scope owner:** Claude (POS / Documents / Communications / Sprint packages)

## Product requirement (locked)

Announcements must support these audience target types: **All**, **Active families**, **Waitlist families**, **Location**, **Program**, **Room/classroom**. All six stay in the product model and the UI. None is removed because resolution is currently unclear. Where a target cannot be resolved safely yet, it stays in the UI/model and the resolver returns **unresolved with a clear reason** — no guessed joins, no faked counts, no hardcoded statuses unless the schema proves them.

This classification is also encoded in code as `REQUIRED_ANNOUNCEMENT_TARGETS` in `web/lib/communications/v2/audienceResolver.ts` (testable), so the UI and resolver share one source of truth.

## Verification basis

Columns verified against `supabase/baselines/prod_baseline.sql` and migrations: `customers` (no `archived_at`; has `status_key`), `status_definitions` (org-scoped vocab; `entity_type`, `status_key`, `status_label`, `metadata`), `opportunities` (`org_id`, `customer_id`, `location_id`, `status_key`), `opportunity_customer_members` (`opportunity_id`, `desired_program_category_id`, **`program_room_cohort_key text`**), `locations` (`customer_id` — per-family addresses, not shared sites), `location_program_categories` (program option source). Existing read-only option endpoints: `GET /api/admin/location-options` (`{locations:[{id,label}]}`), `GET /api/admin/location-program-categories`. **No** room/classroom/cohort table or option endpoint exists; the only room signal is the free-text `program_room_cohort_key` + a field-catalog option source named `rooms_for_location_program`.

## Classification

Categories: **(1) Supported now** · **(2) Existing schema, needs an option endpoint** · **(3) Existing schema, needs a resolver join** · **(4) Blocked by missing/ambiguous model**.

| Target | Category | Resolved in B6? | Basis |
|---|---|---|---|
| **All families** | **1 — Supported now** | ✅ Yes | `customers` by `org_id`. No option list, no join. |
| **Location** | **1 — Supported now** | ✅ Yes | Option endpoint `location-options` exists; resolver joins `opportunities.location_id = ref` → distinct `customer_id`. *Semantic caveat below.* |
| **Program** | **1 — Supported now** | ✅ Yes | Option endpoint `location-program-categories` exists; resolver joins `opportunity_customer_members.desired_program_category_id = ref` → `opportunities.customer_id`. Schema-proven FK. |
| **Active families** | **D — BLOCKED on a product definition** | ❌ No — returns unresolved | `'active'` is NOT a canonical enrollment operator stage (`lead/qualification/tour/waitlist/enrolling/enrolled`). It could mean a Business-Process stage cohort, an open-case household (`opportunities.status_key`), or the person identity track (`persons.status_key='active'`). Per doctrine the resolver returns **unresolved with a clear reason** until the product defines it — no `metadata.active` guess. |
| **Waitlist families** | **3 — Existing schema, CONFIG-DRIVEN resolver** | ✅ Yes (conditional) | Same enrollment-disposition path, selecting status_keys where `metadata.stage_key='waitlist'` (canonical category key seeded by the enrollment status matrix; legacy `metadata.enrollment_operator_stage` also honored). **Unresolved-with-reason** when no status is configured to the waitlist stage. A status merely *labeled* "Waitlist" is NOT matched. |
| **Room/classroom** | **4 — Blocked by missing/ambiguous model** | ❌ No — **unresolved with reason** | No room table / stable room id / option endpoint. Rooms are a free-text `program_room_cohort_key` scoped per location+program; `announcement_targets.target_ref` is a `uuid` and cannot hold a text key. |

### Caveats on the "supported" targets

- **Location** resolves "families with an opportunity at this location." `locations` rows are per-customer addresses, so the resolver deliberately uses `opportunities.location_id` (the site reference) rather than `locations.customer_id`. The count is deterministic and honest; if `opportunities.location_id` is sparsely populated for an org, counts may be low — that is a data-coverage reality, not a resolver guess.
- **Active/Waitlist** are resolved **config-driven** from the enrollment-disposition definitions (`status_definitions` for `opportunity_customer_members`), reading the configured `metadata.stage_key` / `metadata.active` fields — never literal status strings or labels. Canonical stage keys (`waitlist`, `enrolled`, `lead`) are schema-proven by the enrollment status-matrix seed. When an org has no status configured to a group, the target is returned unresolved rather than guessed. The same config-driven rule extends to future lifecycle groups (Leads, Enrolled) via `selectStatusKeysForGroup`.

## Recommendation for the blocked target (Room/classroom) — smallest addition

Resolution needs three small pieces; **no `announcement_targets` schema change is required**:

1. **Option endpoint (Category-2 piece).** Add a read-only, org-scoped `GET /api/admin/rooms-for-location-program?location_id=&program_category_id=` that returns room cohort keys + labels from the existing field-catalog option source `rooms_for_location_program`. (Rooms are scoped by location+program, so the endpoint must take that scope.)
2. **Target ref convention (no schema change).** Because rooms are identified by a **text** cohort key and `target_ref` is `uuid`, store the chosen room in the target's `rule` jsonb (e.g. `rule.room_cohort_key`, plus `rule.location_id`/`rule.program_category_id` for scope), leaving `target_ref` null. `validateAnnouncementTargets` would need a small allowance so `room` accepts a `rule`-based ref instead of a uuid `target_ref`.
3. **Resolver join (Category-3 piece).** Count distinct `opportunities.customer_id` where an `opportunity_customer_members` row has `program_room_cohort_key = <key>`, **scoped by the room's location+program** to avoid cross-location key collisions.

Until those land, Room stays a visible (disabled) UI affordance and the resolver returns: *"room/classroom targeting is not resolvable yet — no room directory / stable room id … needs a rooms option endpoint + a resolver join on `opportunity_customer_members.program_room_cohort_key`."*

### Optional hardening for Waitlist (if customer-level status is insufficient)

If orgs track waitlist on opportunities/placement rather than customers, add an opportunity-level resolver branch: map `status_definitions` (entity_type=`opportunities` or `opportunity_customer_members`) to waitlist keys and count distinct `opportunities.customer_id` with those `status_key`s. This is purely additive (existing tables) and would upgrade Waitlist from conditional to robust.

## What changed in B6 for this correction

- `audienceResolver.ts` — added `REQUIRED_ANNOUNCEMENT_TARGETS` (all six types + support classification + notes) and `TargetSupportClass`. `SUPPORTED_TARGET_TYPES` now documents the *resolvable-now* set (five), distinct from the *required product model* (six).
- `resolveAnnouncementAudience.ts` — explicit unresolved reasons for `room` and `custom`; active/waitlist unresolved reasons now name the org-config / placement-level ambiguity.
- `AnnouncementsWorkspace.tsx` — Room/classroom is now a **preserved, clearly-disabled affordance** (`data-target-room`, with the blocked reason in its tooltip) instead of a passing "coming next" note. All six target types are represented in the UI.
- Tests updated: resolver test asserts all six required targets are present and classified (room=blocked, not removed); workspace test asserts all six affordances exist and Room's control is disabled.

## Doctrine honored

No guessed joins (every join is schema-verified); no faked counts (unresolvable targets return `unresolved`, never a fabricated number); no hardcoded statuses (active/waitlist read the org's `status_definitions`); all six required targets preserved in UI + model; blocked targets carry a clear reason and a smallest-addition path.
