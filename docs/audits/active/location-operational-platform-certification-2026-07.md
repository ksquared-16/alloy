# Operational Location Platform — Architecture Certification Audit

**Status:** Architectural discovery & certification. **Read-only.** Not an implementation sprint, not a redesign, not an RFC.
**Audit base:** `origin/staging` @ `25bc25c7ef581fa8500aef6ad70198a3229c4ce4` (latest staging; merge of PR #182, "operational-expansion-wave1-closeout"). Confirmed via `git fetch` + checkout.
**Date:** 2026-07-13.
**Mission:** Determine whether Alloy already possesses the foundations to become a complete operational **location** platform (Location · Rooms · Programs · Capacity · Scheduling · Tours · Waitlists · Placement · Multi-location · Communications). Classify every capability as **Exists complete / Exists partial / Exists duplicated / Exists disconnected / Missing** — nothing else. **Discover, do not invent.**

**Method:** Full read of platform doctrine under `/docs` (foundation, core, operator, modules, schema) + first-hand schema verification (`docs/schema/schema-columns.md`, 201 base tables) + five independent parallel code-verification passes (Location/Multi-location; Rooms/Programs/Capacity; Tours/Waitlists/Scheduling; Communications/Forms/Documents/AI; Processing/Actions/Configuration/Current-Work). Every claim carries table/column or `file:line` evidence.

**Relationship to the prior audit:** This certifies a *different axis* than `operational-expansion-architecture-audit-2026-07.md` (@ `a3fdc946f`), which certified the **truth-flow spine** (Enrollment→Scheduling→Attendance→Capacity→Billing→Forecasting as L1→L5). That audit's verdict — *"consume, don't rebuild"* — is confirmed and reused here. This audit adds the **location/spatial + customer-acquisition** axis (Location, Rooms, Programs, Tours, Waitlists, Multi-location, public self-scheduling) that the truth-flow audit did not center.

---

## 1. Executive Summary

**Alloy is already an operational location platform. The next phase is consolidation and connection, not construction.**

The decisive finding is that **every headline capability of an "operational location platform" already exists in the code at 70–100% form** — most of them built, several of them complete and production-shaped, a handful only disconnected from operator surfaces. The genuine greenfield is small and specific: **date-based closures/holidays, per-location branding, a Transfer-Location action, and a capacity-aware placement decision layer.** Everything else is *hardening, consolidation, or wiring* of systems that already exist.

**The spatial model in one sentence:** a `locations` row is a self-referential hierarchy (`parent_location_id`) with a stringly-typed triad `location_type ∈ {address, site, unit}` — **site = campus/center**, **unit = room/classroom** (parent = site), **address = service address** (a co-resident cleaning/home-services vertical). There is **no separate `rooms` table**; a room *is* a `location` of type `unit`. This overloading is both the platform's greatest reuse win and its most important source of entity/attribute duplication.

**The platform is fundamentally multi-location.** Households (`customers`) and operators (`person_locations`, `user_site_access`) are natively **N:N** to locations. Single-location is the *degenerate* `sites.length === 1` case, handled by a graceful UI branch — never hardcoded. The operator story explicitly requires cross-site families. There is **no** one-household→one-location or one-operator→one-location constraint anywhere.

**Where the real work is (in priority order):**
1. **Consolidate the four "program" representations** and the **EAV-vs-config-table duplication** of room capacity/ratio/age/timezone.
2. **Connect** a complete-but-headless capacity/occupancy engine to operator surfaces (its metric packs are empty `coming_soon` shells).
3. **Converge** the ~5 duplicate "Schedule Tour" and ~6 duplicate "Enroll" action definitions onto one canonical each.
4. **Wire** the opportunity→location resolution gap in the outbound communications send path (the location-first identity platform exists; the runtime under-feeds it).
5. **Add** the four genuinely-missing primitives: closures/holidays, per-location branding, Transfer-Location action, capacity-aware placement routing.

**Bottom line for the next implementation phase:** the risk is not that these capabilities are absent — it is that a builder unaware of them will *accidentally create a second copy*. This document is the map that prevents that.

---

## 2. Documentation Reviewed

**Canonical doctrine (`docs/platform/`):**
- `core/placement-system.md` — **the canonical ownership doctrine** (School→Program→Room→Schedule cascade; lead-vs-child location authority).
- `core/entity-model.md`, `core/operational-truth-flow-doctrine.md`, `core/configuration-ownership-and-inheritance.md`, `core/business-process-system.md`, `core/status-and-state-system.md`, `core/operational-calculations.md`.
- `foundation/architecture.md`, `platform-capabilities.md`, `platform-event-catalog.md`, `product-roadmap.md`.
- `modules/communications-identity-platform.md`, `communications-platform.md`, `configuration-platform.md`, `attendance-system.md`, `operational-consumption-platform.md`, `actions-and-workflows.md`, `ai-platform.md`, `documents-and-forms.md`.
- `operator/current-work-surface.md`, `operator/operator-story.md`, `operator/action-system.md`.
- `product/bos-foundation.md` (AI/BOS doctrine; `product/ai-system.md` is a stub redirect).

**Schema references (`docs/schema/`):** `schema-tables.md` (201 base tables, 7 views), `schema-columns.md` (2,568 columns) — first-hand verified.

**Prior audits (`docs/audits/active/`):** `operational-expansion-architecture-audit-2026-07.md` (truth-flow spine, reused), `supabase-schema-alignment-audit.md`, `legacy-messages-retirement-plan.md`.

**Doctrine self-contradiction noted:** `placement-system.md` frames `child_placements` as both "future" and "already-committed"; the code confirms it exists. (Recorded — no change made.)

---

## 3. Code Areas Inspected

- **Location:** `web/lib/admin/{resolveOrgSiteLocations,accessScope,resolveAdminAccessCore,locationDisplayLabel}.ts`, `web/lib/adminV2/locationsHierarchyTablePresentation.ts`, `web/lib/bookingLocations.ts`, `web/lib/fields/enrollmentPlacementDoctrine.ts`, `web/components/adminV2/settings/locations/*`, `web/app/api/admin/locations/**`.
- **Rooms/Programs/Capacity:** `web/lib/childcareOperational/config/{capacityRules,ratioRules,roomConfigResolvers,resolveConfigRule,configRuleTypes,childcareConfigRuleService}.ts`, `.../expectations/{scheduleExpectationCore,buildScheduleExpectations,resolveExpectationAgeGroups}.ts`, `.../attendance/actualCompliance.ts`, `web/lib/programs/programOfferings.ts`, `web/lib/metrics/packs.ts`.
- **Tours/Waitlists/Scheduling:** `web/lib/tours/**` (~4,950 LOC: bookings, availability, comms, opportunity integration, ICS), `web/lib/orchestration/placement/**` (~40 modules), `web/lib/queues/candidateGrainWaitlistQueue.ts`, `web/app/api/public/tour-booking/**`, `web/app/adminV2/settings/{tours,placement-priority}/**`.
- **Communications/Forms/Docs/AI:** `web/lib/communications/identity/{resolveSenderIdentity,inboundResolveIdentity,executeCommunicationsSend}.ts`, `web/lib/communications/templateTokens.ts`, `web/lib/announcements/*`, `web/lib/agent/**`, `web/lib/bos/**`.
- **Processing/Actions/Config/Current-Work:** `web/lib/admin/actions/{resolveActionsForContext,canonicalActionRegistry}.ts`, `web/lib/platform/{actions/platformActionCatalog,commands/operationalIntent}.ts`, `web/lib/mutations/{runtime,domainRegistry,domains/enrollmentStatus}.ts`, `web/lib/pos/processingCase/**`, `web/lib/process/{engine,definitions/enrollment}/**`, `web/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork.ts`.
- **Migrations:** `20260329165048_remote_schema.sql` (baseline), `20260511143000_tour_scheduling_v1_foundation.sql`, `20260512140000_tour_public_booking_links.sql`, `20260504103000_user_access_scope_tables_v1.sql`, `20260610140001_location_program_categories.sql`, `20260616120000_waitlist_placement_foundation.sql`, `20260625120000_childcare_operational_enrollment_slice1.sql`, `20260628120000_childcare_config_rules_phase1.sql`, `20260702000000_program_offerings.sql`, `20260715120000_communications_identity_platform_foundation.sql`, `20260529160000_location_metadata_field_definitions_convergence.sql`, `20260602160000_canonical_action_catalog_v1_stubs.sql`, `20260713000000_process_instances.sql`, and ~30 others cited inline.

---

## 4. Existing Location Capabilities

**Model — Exists and complete.** `locations` (`remote_schema.sql:2117-2150`): self-referential hierarchy via `parent_location_id`; `location_type ∈ {address, site, unit}` (CHECK :2145); owner XOR check customer/vendor (:2146); full postal address (`address1..country`, `lat`/`lng`); `access_*` fields; `status_key`; `metadata jsonb`. Programs hang off site via `location_program_categories`. Rooms are `unit` rows under a `site`.

**Access/permissions — Exists and complete (app layer), Exists but partial (RLS/API leak).** Two orthogonal scope axes: **site scope** (`user_site_access`, N:N; trigger enforces `location_type='site'`) and **department scope** (`user_department_access`). Mature app-layer enforcement: `resolveAdminAccessCore.ts:107,178-191`, `accessScope.ts:79-220` (`resolveEffectiveSiteLocationId`, `locationAllowedUnderSiteScope`, `expandLocationIdsUnderSites`). **Gap:** `locations` RLS is org/role-only (`admin_ops_full_access`, `remote_schema.sql:6979`) — site-scope lives in the app, not the DB; and `/api/admin/locations` + `/location-options` are org-scoped only (`route.ts:32-48`), so a site-restricted operator sees *all* org sites in dropdowns (the filter arg exists but isn't passed).

**Config UI — Exists and complete.** `LocationsConfigurationPage.tsx` with sections Locations / Programs / Rooms / Schedule Templates / Operational Rules; per-panel detail editors; EAV field-definitions (`entity_type='location'`, sections `site_metadata`/`room_metadata`).

**Links out — Scheduling / Tours / Comms / Metrics / Consumption all carry `location_id` (complete);** Documents / AI do not (see below).

**Absent as first-class typing/runtime — Missing.** No generated Supabase `Database` type, no canonical `Location` TS type (~5 divergent row shapes; `location_type` typed as loose `string|null`), no repository/service abstraction (**95 raw `.from("locations")` call sites across 62 files**). This is a *hardening* gap, not a capability gap.

---

## 5. Existing Room Capabilities

**Rooms are operational entities — but modeled as a projection over `locations`, not a table. → Exists but partial (as an entity); their operational concerns are Exists and complete.**

- **Identity/hierarchy:** `locations` where `location_type='unit'`, `parent_location_id`=site. Enforced by `validate_childcare_config_scope()` (`20260628120000:39-84`) which rejects a `room_location_id` that isn't a `unit` and a `site_location_id` that isn't a `site`.
- **Capacity → `childcare_capacity_rules`** (scope `room`). **Ratios/staffing-req → `childcare_ratio_rules` + `_tiers`.** **Hours → `childcare_operating_windows`.** **Schedule eligibility → `childcare_schedule_rules`.** All scoped `org→site→program→room`, effective-dated.
- **Occupancy → derived** (expected from placements; actual from `child_attendance_events`, incl. `room_transfer`).
- **Age band → EAV** on location `field_values` (`classroom_age_group`/`childcare_program_type`) — **not** a typed column (`resolveExpectationAgeGroups.ts:60-104`).
- **Licensing → partial:** only as `capacity_kind='licensed'` + `childcare_ratio_rules.jurisdiction_key`; **no** license entity/number/expiry/inspection tracking.

**Duplication flag:** room capacity/ratio/age/director/timezone are written **both** to `locations.metadata` EAV (via `LocationRoomDetailPanel.tsx` forms + `20260529160000` convergence migration) **and** to the first-class `childcare_*` rule tables. Migration comments say the tables "retire" the EAV; both paths remain live.

---

## 6. Existing Program Capabilities

**Programs are first-class — but represented four ways that are not FK-reconciled. → Exists but duplicated.**

| # | Representation | Role | Key issue |
|---|---|---|---|
| 1 | **`location_program_categories`** (`20260610140001`) | **Canonical operational/age program** — the capacity/ratio scope target (`program_category_id` FK on all 4 config tables) + placement target (`child_placements.program_category_id`) | The real one |
| 2 | **`program_offerings` + `program_offering_variants`** (`20260702000000`) | **Purchasable offering** (Full/Part/Drop-In → 2-day/5-day variants); commercial tuition attaches to `variant_id` | `program_key` is **free text, NO FK** to #1 (`route.ts:103-129`) |
| 3 | **`childcare_program_type` option set** (EAV) | Inquiry/classroom/enrollment program key | Coexists with deprecated `classroom_age_group` (dual-key resolver) |
| 4 | **`placement_candidates.program_room_cohort_key`** (text) | Waitlist program+room cohort | Loose combined string, no FK to program or room |

Scheduling, age groups, capacity, enrollment, and pricing are all wired to programs (via #1 for operations, #2 for pricing). Documents/forms/actions/comms are generic, not program-scoped. **The operational program (#1) is genuinely first-class and drives the entire capacity engine;** the fragmentation is the debt.

---

## 7. Existing Capacity Capabilities

**A mature, well-factored, pure (never-persisted, derived) capacity/ratio/occupancy engine already exists — `web/lib/childcareOperational/`. Do NOT build a capacity model.**

| Capability | Classification | Evidence |
|---|---|---|
| **Capacity** | **Exists and complete** | `childcare_capacity_rules` (kinds `physical`/`licensed`/`operational`) + `resolveCapacityBreakdown` → `binding = min(physical, licensed, operational, ratioLimited)` (`capacityRules.ts:42-58`) |
| **Ratios** | **Exists and complete** | `childcare_ratio_rules` + `_tiers` + tiered resolver `requiredStaffForChildren`/`ratioLimitedCapacity` (`ratioRules.ts:32-64`) |
| **Room / Program / Schedule limits** | **Exists and complete** | `scope_type ∈ {org,site,program,room}` config; `childcare_schedule_rules` (min/max days, eligible types) |
| **Occupancy** | **Exists but disconnected** | Expected (`scheduleExpectationCore.ts:188-205`) + actual (`actualCompliance.ts:78-108`) both computed; reachable only via `/api/admin/operational-expectations`, **no operator surface** |
| **Forecasting** | **Exists but partial** | `buildScheduleExpectations` projects occupancy+staffing over a future window (default 14d) — a schedule-expansion forecast, not demand/enrollment-trend forecasting; not surfaced |
| **Open seats** | **Exists but partial** | Derivable as `binding − childCount`; only materialized *negatively* as `capacity_exceeded`/`overCapacity` warnings, never as a positive "N seats open" value |
| **Availability (capacity sense)** | **Missing** | No open-seat/availability projection surface (the "availability" hits in code are tour-booking, unrelated) |
| **Age limits** | **Exists but partial** | `age_group_key` on rules + eligible-age keys, but the age band itself is dual-key EAV |
| **Licensing** | **Exists but partial** | `capacity_kind='licensed'` + `jurisdiction_key` only; no license entity |
| **Staffing constraints** | **Exists but partial** | *Required* staff fully derived; `staffOnHand` is an explicit placeholder — no staff-scheduling supply source, so `staffingGap` is null / `staff_data_unavailable` (matches prior-audit gap **G3**) |

**Disconnection signal:** metric packs `capacity`, `attendance`, `staffing` are all `domainStatus:"coming_soon"` with `metricKeys: []` (`web/lib/metrics/packs.ts:54-76`). A complete backend engine with **zero** operator-facing analytics consumption.

---

## 8. Existing Tour Capabilities

**Tours are a first-class, near-complete operational subsystem with genuine customer-facing self-scheduling. → Exists and complete (with one config-UI gap).**

- **Entities (`20260511143000`, `20260512140000`):** `tour_availability_rules` (recurring weekly windows: `day_of_week`, `start/end_time`, `timezone`, `slot_duration_minutes`, `buffer_minutes`, `max_bookings_per_slot`, `approval_required`, per-location or org-wide); `tour_bookings` (SoT — status `requested→pending_approval→confirmed→rescheduled→canceled→completed→no_show`; `source ∈ admin|public_link|form_submission|automation`; reschedule lineage; single-active-booking partial unique index; deliberately **not** reusing job `schedules`); `tour_public_booking_links` (SHA-256 token, `location_id NOT NULL`, expiry, full RLS).
- **Slot engine — complete:** `availability/internalCompute.ts` (pure UTC half-open slot expansion, buffer-as-gap, `max_bookings_per_slot` counting blocking bookings, TZ-correct); re-validated on write (`isSlotOffered`).
- **Lifecycle service — complete:** `bookings/tourBookingService.ts` (create/confirm/reschedule/cancel/complete/no-show), each enforcing availability + single-active rule, emitting 7 lifecycle events, mirroring to `opportunities.status_key` (`tour_scheduled/completed/no_show`).
- **Public self-scheduling — complete:** `web/app/api/public/tour-booking/[token]/{resolve,slots,book}` (service-role, rate-limited, token-hash) + public page `TourBookingPublicClient.tsx`.
- **Comms — complete (config-driven, default OFF):** `tourCommsConfig.ts` (org→location merge; per-channel email/SMS; `reminder_offsets` default 24h+2h; quiet hours; ICS policy); `tourCommsTemplates.ts` with ~20 merge tokens (`{{parent_name}}`, `{{tour_date_label}}`, `{{location_name}}`, `{{reschedule_url}}`, `{{add_to_calendar_url}}`, …); reminders via `communication_scheduled_sends` (`source='tour_scheduling'`); ICS + Google/Outlook links.
- **Stage/work integration — complete:** bound enrollment `stage_key='tour'` with work templates.
- **Builder UI — complete for availability** (`TourAvailabilitySettingsClient.tsx`); **Missing** for comms config (metadata-JSON only).

---

## 9. Existing Waitlist Capabilities

**Waitlist is BOTH a lifecycle status AND a true operational entity, with a config-driven placement/ranking engine. → Exists and complete (core); Missing (offer/availability comms).**

- **Status side:** `waitlisted` canonical status; `move_to_waitlist` action ACTIVE (`update_status`, `20260603100000`), placed across stages; `add_to_waitlist_placeholder` retired.
- **Entity side (`20260616120000`):** `placement_candidates` (child × `program_room_cohort_key`; `wait_since`, `desired_start_date`, `status ∈ active|paused|withdrawn|placed`; one-active-per-OCM×cohort unique index; heavy consistency trigger). `placement_link_groups` + `_members` (sibling/household linking; `link_mode ∈ independent|preferred_together|strictly_together`). `placement_overrides` (`pin|tier_boost|temporary` with reason/expiry/release audit).
- **Ranking engine — complete, config-driven, layered:** `evaluatePlacementPriority.ts` (pure: buckets, ordered fact-predicate rules `all/any/not/fact_present/fact_eq/fact_in`, tie-breakers, deterministic sort tuple, fact-digest snapshot); `placementConfigSchema.ts` (Zod `metadata.placement_priority_v1`, department→work-unit layered merge, v1 opportunity-only vs v2 candidate+family-rollup, `shadow_mode`, `evaluation_cap`, `missing_fact_behavior`). Config UI: `placement-priority/page.tsx`.
- **Queue/Current-Work — complete:** `candidateGrainWaitlistQueue.ts` wired into `QueueService` (`countWaitlistCandidateGrainItems`, `loadWaitlistCandidateGrainQueueItems`); env rollback gate.
- **Caveats:** demo scaffolding (`waitlistDemoScenarios.ts`, `placementPriorityDemoPatch.ts`) suggests the feature was demo-driven — verify production seeding. **No waitlist-specific offer/availability comms** (Missing).

---

## 10. Existing Scheduling Capabilities

**Three deliberately-isolated scheduling substrates. Do not conflate them.**

1. **Tour availability / self-scheduling** — `tour_availability_rules` → slot engine → public token booking. Recurrence = weekly rule rows. **Exists and complete.**
2. **Childcare enrollment scheduling** (`20260625120000`) — `schedule_patterns` (site-scoped catalog: `weekdays smallint[]`, `schedule_type_key`) + `schedule_assignments` (effective-dated pattern binding per agreement, supersede-not-patch). Plus L1 policy: `childcare_operating_windows` + `childcare_schedule_rules`. **Exists but partial** (schema + config + expectation projection built; no daily-roster materialization runtime in this slice — matches prior-audit **G4**, "no scheduling *process*").
3. **Legacy field-service job `schedules` / `recurrence_plans` / `schedule_statuses`** — `schedules.job_id NOT NULL`; consumed by `web/lib/rrs/*`. **Exists but disconnected** (intentional; the cleaning/home-services vertical — do NOT converge with tour/childcare scheduling).

Availability (booking sense): `tour_availability_rules` with org-wide fallback → **Exists and complete**.

---

## 11. Existing Multi-Location Capabilities

**The platform is architecturally multi-location; single-location is the degenerate case. → Exists and complete.** Operator story mandates cross-site families (`operator-story.md:93-95`); UI branches on `sites.length > 1` (`TopNavBar.tsx:113-121`, `site-filter/route.ts:26`) and never auto-selects `locations[0]`/`is_primary`.

| Entity | Location relationship | Multiple? |
|---|---|---|
| **Households (`customers`)** | **No `location_id`** — org-scoped | **Multi (unbounded)** — spans sites via children |
| **Children (`opportunity_customer_members`)** | single `location_id`; agreements unique on `(org, member, site)` | 1 site/child at a time; siblings differ; child may hold multiple agreements |
| **Applications (`opportunities`)** | single `location_id` = family default preferred site | 1:1 **default only** (not authority — child site overrides) |
| **Tours (`tour_bookings`)** | `location_id NOT NULL` | 1/booking; many bookings/lead across sites |
| **Waitlist (`placement_candidates`)** | `site_id` nullable | 1/candidate; multiple candidates/child |
| **Documents (`documents`)** | **No `location_id`** | Not location-scoped at all (**Missing link**) |
| **Communications (`communication_threads`)** | `location_id` nullable; identity bindings **N:N** per site | thread=1 site; identities N:N |
| **Permissions (`user_site_access`)** | **join table, N:N** | **Multi** |
| **Operators (`person_locations`)** | **join table, N:N** (`relationship_type`, `is_primary`) | **Multi** |

**No one-household→one-location or one-operator→one-location constraint exists.** The only true 1:1 columns are lead-level defaults and per-agreement/per-tour child-grain site (correctly single by design, effective-dated for transfer-over-time).

---

## 12. Existing Communications Integration

**A location-first Communications Identity Platform exists (`20260715120000`); the runtime under-feeds it. → Exists but partial, with one high-leverage wiring gap.**

- **Sender identity — location routing built (partial feed):** `communication_identities.scope ∈ {tenant,location,department,system}` + `communication_identity_location_bindings` (`location_id`, `priority`, `inbound_routing_enabled`, `outbound_sending_enabled`); resolver `resolveSenderIdentity.ts` selects `location_default → location_priority → location-scoped → tenant default`. **Gap:** `executeCommunicationsSend.resolveContextLocationId()` only derives `location_id` for `entityType==='jobs'` — returns `null` for opportunities/families, so most family-facing sends bypass the location tier despite full resolver support.
- **Inbound routing — Exists and complete** (location-aware: `inboundResolveIdentity.ts` filters on `inbound_routing_enabled`, multi-location disambiguation).
- **Tokens — Exists and complete** (location-aware): `templateTokens.ts` has dedicated `location`, `program`, `enrollment`, `schedule`, `org` groups.
- **Templates — Exists but partial:** `communication_templates` (org-global, versioned) has **no `location_id`** — per-location differentiation only via tokens, not template scoping.
- **Announcements — Exists but partial:** location is a first-class *audience filter* (`LocationFilter`, plus program/room filters) but not a column.
- **Scheduled sends — Exists but partial:** `communication_scheduled_sends` (worker-claimed) has no `location_id` (transitive via opportunity); sources constrained to `task_assist` + `tour_scheduling`.
- **Booking — Exists and complete (fully location-native):** `tour_public_booking_links.location_id NOT NULL`.
- **Branding — Missing:** only identity `display_name` + `location.name` token; no per-location logo/color/from-name.

**Customer self-scheduling substrate:** present end-to-end **for tours** (booking links + availability + scheduled reminders + tokens). Generalizing the tour pattern is the template for "customer books any service."

---

## 13. Existing Processing Integration

**Two distinct "process" systems; neither does location/capacity/program routing. → routing decision layer = Missing (substrate exists).**

- **POS Processing Cases** (`processing_cases`/`processing_case_sources`, `20260612120100`) — a thin **document/form intake envelope** (status `received→completed`, polymorphic source refs). Its only "routing" is document-type *classification* (`subsidy_contract`, `immunization_record`, `enrollment_document`, …) + a `route_for_review` recommendation verb. **Not** location/capacity/program-aware; the wrong home for placement logic.
- **Process Engine** (`lib/process/*`, `process_instances`) — generic subject·context·stage·state runtime, grep-proven agnostic. Location/program are carried as *participation payload* (`EnrollmentParticipationMetadata { program_category_id, location_id, program_room_cohort_key }`), **stored not routed**. The engine has a generic `scopeId` documented as "Enrollment→work_unit, Compliance→location" — confirming location is a first-class scope concept it already understands.

**Verdict:** capacity/program/location-aware *routing* is Missing as a decision layer, but the substrate is built. It belongs in the **Process Engine / placement engine** (which already carries location/program/room and understands location scope), **not** in POS Processing.

---

## 14. Existing Current-Work Integration

**Current Work is config-driven and process-agnostic; the five target hooks resolve through the action registry.** Composition: `work_units` (queue/cohort, `queue_definition` JSON) → queue rows → open record → Current Work Focus Panel (`projectCurrentWork.ts`) projecting the stage operating plan, whose work templates declare `primary_action`/`helpful_actions`/`outcome_refs` resolved by `resolveActionsForContext` (filtered surface+slot+entity_type+work_unit_id+stage).

| Target hook | Mechanism | Classification |
|---|---|---|
| **Schedule Tour** | Action (`open_form` → collect date/time → `start_workflow` → `update_status` tour_scheduled) | **Exists but duplicated** (~5 definitions, conflicting `action_type`) |
| **Move to Waitlist** | Transition (`move_to_waitlist`→status) **and** Mutation command (`waitlist_child`→enrollment_status domain) | **Exists but duplicated** |
| **Enroll** | Transition (`approve_enrollment`) + Mutation command (`enroll_child`/`update_child_enrollment_status`) + legacy header (`mark_won`) | **Exists but duplicated** (~6 variants) |
| **Assign Location** | Configuration/hardcoded — set implicitly at Create-Lead (`resolveCreateLeadDefaultLocation.ts`); carried on `process_instances.metadata.location_id` | **Exists but disconnected** |
| **Transfer Location** | Nothing (`reassign` exists only for conversations/staff) | **Missing** |

Adjacent placement verbs partially cover "Assign": `assign_classroom`/`assign_schedule`/`set_start_date` are ACTIVE `ui_intent`; `assign_room`/`assign_program` are **planned intents only** (`operationalIntent.ts:118-145`). Current Work is already **location-scoped for visibility** (`queueMembershipLocationScope.ts` filters by `ocm_site`/`placement_site`/`case_site`).

---

## 15. Existing Actions

Actions are a three-tier config layer: **DB seeds** (`action_definitions` + `action_placements`, `org_id IS NULL` global vs org override) → **canonical catalog metadata** (`payload_schema.catalog.implementation_status ∈ missing|partial|existing|stub`) → **TS registries/executors**. `action_type ∈ navigate|open_drawer|update_status|update_field|start_workflow|external_link|ui_intent|open_form|mutation_command`.

**Inventory (ACTIVE unless noted):**
- **Tours:** `schedule_tour`, `reschedule_tour`, `confirm_tour`, `record_tour_outcome`.
- **Waitlists:** `move_to_waitlist` (case grain), `waitlist_child` (child grain, mutation_command); `remove_from_waitlist`/`collect_waitlist_fee`/`waive_waitlist_fee` = INACTIVE stubs.
- **Enrollment:** `approve_enrollment`, `enroll_child`, `update_child_enrollment_status`, `update_enrollment_status` (wizard), `review_enrollment_packet`, `request_missing_information`, `send_enrollment_packet`; `mark_won` legacy; `reserve_spot`/`withdraw_child`/`reenroll_child` = INACTIVE stubs.
- **Programs/Rooms/Scheduling:** `assign_classroom`, `assign_schedule`, `set_start_date` (ACTIVE ui_intent); `assign_room`/`assign_program` = planned only.
- **Location/Transfers:** **none** — no `assign_location`, `transfer_location`, `room_transfer`, `move_child`.

**Reuse-before-duplicate hotspots (do NOT re-create):** `schedule_tour` is defined **5 ways** with conflicting `action_type` (converge to one `open_form`); `Enroll` is fragmented across ~6 (converge on the Mutation Runtime `enrollment_status` domain); two catalog authorities (DB `action_definitions` vs `platformActionCatalog.ts`) disagree on label casing/grain.

---

## 16. Existing Configuration

Config lives in three planes: **Settings control plane / Builders** (Fields, Sections, Surfaces, Actions, Statuses, Processes); **Commercial** (`location_program_categories` + `commercial_tuition_rates`); **Childcare operational-truth L1** (the effective-dated `childcare_*` rule family under Settings→Locations). `org_settings` is a thin legacy bag — operational config does **not** live there (only `metadata.timezone`, `config_locked`).

| Capability | Classification | Owner |
|---|---|---|
| **Tour availability** | Exists and complete | `tour_availability_rules` + API + slot engine + UI |
| **Capacity rules** | Exists and complete | `childcare_capacity_rules` (scoped, effective-dated) + reader/writer/UI |
| **Scheduling rules** | Exists and complete | `childcare_schedule_rules` + `childcare_ratio_rules`/`_tiers` |
| **Business hours** | Exists and complete | `childcare_operating_windows` |
| **Programs** | Exists but duplicated | `location_program_categories` vs `program_offerings` |
| **Rooms** | Exists but partial | `locations.location_type='unit'`; no dedicated table |
| **Placement rules** | Exists but partial | facts/engine exist; no first-class placement-*rules* config table (eligibility partly in `childcare_schedule_rules`) |
| **Closures / Holidays** | **Missing** | none (explicitly deferred, `20260628120000:232`) |

**The shared `scope_type` org→site→program→room + effective-dated pattern (with validation trigger) is the correct home for all new operational config.** New capabilities should extend this family, not add `org_settings` keys. Two open seams: `tour_availability_rules` uses an older `location_id`/`user_id` scope model not yet reconciled with the unified `childcare_*` scope shape; Programs are duplicated.

---

## 17. Duplicate Concepts Discovered

1. **"Program" ×4** — `location_program_categories` (operational, canonical) vs `program_offerings`/`_variants` (commercial, no FK to #1) vs `childcare_program_type` option set (EAV) vs `placement_candidates.program_room_cohort_key` (text). *Highest-priority consolidation.*
2. **Room attributes: EAV vs config tables** — capacity/ratio/age-range/timezone stored **both** on `locations.metadata` (forms write here) **and** in first-class `childcare_*` rule tables. Migration comments claim retirement; both live.
3. **"Schedule Tour" action ×5** — legacy `update_status` seed, per-org `start_workflow`, canonical `open_form`, platform catalog, base-action catalog — conflicting `action_type`.
4. **"Enroll" action ×6** — `approve_enrollment`, `update_enrollment_status`, `update_child_enrollment_status`, `mark_won`, `enroll_child`, `update_status_add_note` alias.
5. **Timezone ×5+** — no location column; scattered on `schedules`, `tour_availability_rules`, `tour_bookings`, `contacts`, `user_profiles`, plus `locations.metadata.timezone`.
6. **Age group** — `location_program_categories.key` / `age_group_key` config vs `locations.metadata.age_range_from/to/unit` EAV vs deprecated-but-live `classroom_age_group`.
7. **Two action-catalog authorities** — DB `action_definitions` vs `platformActionCatalog.ts` (label/grain drift).
8. **Three scheduling substrates** — tour vs childcare vs legacy job (this one is *intentional* isolation, not debt — flag so nobody "unifies" them).
9. **Capacity** — first-class `childcare_capacity_rules` vs legacy `locations.metadata.capacity`/`license_capacity` EAV.

---

## 18. Architectural Assumptions Discovered

1. **`location_type` is stringly-typed** (`{address, site, unit}`), enforced by CHECK + triggers, not by the type system. A room is a `unit` location; the "rooms table" is a query convention.
2. **Rooms have no independent identity** — age band and attributes split between `locations` + `field_values`/`metadata`.
3. **Child site is authority; lead location is fallback only** (`placement-system.md:41-42`) — deliberate, enables cross-site families.
4. **Effective-dated supersede-not-patch** is the universal L2 discipline (placements, schedules, rates) — transfer-over-time is modeled as a new dated row, not a mutation.
5. **Expectations are derived, never persisted** (truth-flow Law 2) — occupancy/staffing are pure functions; no "expected occurrence" table.
6. **Site-scope is enforced in the app layer, not RLS** — `locations` RLS is org/role-only; security depends on every query path calling the scope helpers (one known leak in location list/option APIs).
7. **`customers` (household) has no `location_id`** — households are intentionally location-agnostic; site membership is derived from children.
8. **`is_primary` on `locations`** is legacy cleaning-vertical residue, not consumed as a global current-location selector.
9. **AI/BOS is org+entity scoped and deliberately paused** — no per-location/program AI context by design.
10. **POS Processing is document intake, not routing** — placement/capacity routing intentionally does not belong there.

---

## 19. Hardcoded Behavior Discovered

1. **Assign-Location is implicit at lead creation** (`resolveCreateLeadDefaultLocation.ts`: workspace site → single permitted site) — no explicit action, no re-assignment path.
2. **`executeCommunicationsSend.resolveContextLocationId()` hardcodes `entityType==='jobs'`** as the only location-resolving branch — opportunities/families fall through to `null`.
3. **Tour comms default `enabled: false`** and are edited only via metadata JSON (no config UI).
4. **Scheduled-send sources hardcoded** to `task_assist` + `tour_scheduling` (CHECK constraint).
5. **`staffOnHand` is a placeholder input** in actual-staffing compliance — no supply source wired, so `staffingGap` is always null.
6. **Metric packs `capacity`/`attendance`/`staffing` hardcoded `coming_soon` with empty `metricKeys`** — engine output not surfaced.
7. **Dual program-key resolver** (`desired_program_category_id` with `desired_program_type` fallback) — legacy-string branch persists in read paths.
8. **`/api/admin/locations` + `/location-options` ignore `user_site_access`** — org-scoped despite the filter arg existing.

---

## 20. Missing Capabilities

Genuinely absent (conservatively — nothing at ≥70% listed here):

1. **Closures / Holidays** — no table; explicitly deferred (`20260628120000:232`). The one clearly-missing config primitive.
2. **Per-location Branding** — no logo/color/from-name/theme per site.
3. **Transfer-Location action** — no `transfer_location`/`move_child`; only implicit set at creation.
4. **Capacity-aware placement routing (decision layer)** — substrate (config rules + placement facts/engine + process location-scope) is built; the routing decision that consumes capacity to place/waitlist is not.
5. **Positive open-seats / availability surface** — only negative over-capacity warnings exist.
6. **Staff-scheduling supply source** — required-staff derived, actual-staff not (prior-audit G3).
7. **Documents location link** — `documents` is org-scoped, no `location_id`.
8. **Location-scoped AI context** — no per-location/program AI config (deliberately paused).
9. **Tour comms config UI** and **waitlist offer/availability comms** — narrow UX gaps.
10. **Canonical Location TS type + repository abstraction** — untyped, 95 raw table touches (hardening, not capability).

---

## 21. Recommended Canonical Ownership Model

*Prove-what-exists model — extend, do not redesign. Each row names the **existing** home.*

| Domain owns | Canonical entity (exists today) | References only |
|---|---|---|
| **Location (site)** | `locations` (`location_type='site'`): address, geo, status, access, org/vendor ownership | — |
| **Room** | `locations` (`location_type='unit'`, parent=site): identity/hierarchy — **promote age band from EAV to a typed attribute** | site (`parent_location_id`) |
| **Program** | `location_program_categories` (operational/age, canonical) — **`program_offerings` references it by FK, not free text** | site (`location_id`) |
| **Scheduling** | `schedule_patterns` (catalog, per-site) + `schedule_assignments` (committed, per-agreement, effective-dated) | site, agreement |
| **Capacity** | `childcare_capacity_rules` + `childcare_ratio_rules`/`_tiers` (scope org→site→program→room, effective-dated) — **sole owner; retire `locations.metadata` capacity EAV** | site/program/room, age_group |
| **Availability (booking)** | `tour_availability_rules` → slot engine | location |
| **Availability (capacity/open-seats)** | derived projection over capacity − occupancy (**surface it; do not table it**) | rules + facts |
| **Placement** | `child_placements` (committed, effective-dated) + `placement_candidates` (waitlist) + `placement_overrides`/`link_groups` | site, program, room, agreement |
| **Waitlist** | `placement_candidates` + config-driven ranking engine | program_room cohort, site |
| **Tours** | `tour_bookings` + `tour_availability_rules` + `tour_public_booking_links` | opportunity, location |
| **Applications** | `opportunities` (lead default location) + `opportunity_customer_members` (child site authority) | location (default), location (authority) |
| **Enrollment** | `child_enrollment_agreements` (per child×site) | site, member |
| **Attendance** | `child_attendance_events` (immutable, incl. room transfer) | site, room, member |
| **Hours** | `childcare_operating_windows` (scoped, effective-dated) | site/program/room |
| **Timezone** | **should be** `locations` (site) — **currently duplicated; consolidate to a first-class site column** | — |
| **Closures/Holidays** | **new** companion table in the `childcare_*` scoped/effective-dated family (do not invent a new pattern) | site |
| **Operator permissions** | `user_site_access` (site, N:N) + `user_department_access` (function) | user, location |
| **Communication identity** | `communication_identities` + `communication_identity_location_bindings` (N:N per site) | location |
| **Branding** | **new** per-location config (extend identity/location config; not a new module) | location |
| **Public presence** | `tour_public_booking_links` (per-site page) — extend for a location public profile | location |
| **Reporting / Metrics** | metric scope filter + per-site snapshots (`org\|site\|department\|work_unit`) | site (filter dimension) |
| **Forecasting** | derived over L3+L4+snapshots (Planning plane) — **register as Operational Calculations, do not table** | facts |
| **Documents / Forms** | `documents` (**add `location_id` link**) / `field_definitions entity_type='location'` + forms scoped by `selectedSiteId` | entity → location |
| **AI context** | BOS proposals (org+entity) — **connect location/program context through existing tokens/scope** | entity → location |

**Principle:** Location owns *place, address, hierarchy, identity binding, branding, public presence*. Rooms/Programs are location-typed children that **anchor** capacity/ratio/schedule config. Capacity/Availability/Occupancy/Forecast are **derived projections, never entities** (Law 2). Placement/Waitlist/Tours/Enrollment **reference** Location; they do not re-own it.

---

## 22. Recommended Implementation Roadmap

Each item tagged **[Hardening] / [Consolidation] / [Connection] / [New]**. Ordered to remove duplication risk *before* net-new build, and to make existing value visible cheaply. **Prefer extending existing systems over creating new ones.**

**Phase 0 — Reconcile & de-duplicate (no new capability).**
- **[Consolidation]** Reconcile the four "program" representations: make `program_offerings.program_key` an FK to `location_program_categories`; converge the `childcare_program_type` EAV and waitlist cohort key onto the canonical program id.
- **[Consolidation]** Pick one owner for room capacity/ratio/age/timezone (the `childcare_*` config tables) and stop the `locations.metadata` EAV write path; migrate reads.
- **[Consolidation]** Collapse `schedule_tour` (×5) → one canonical `open_form` action; collapse `Enroll` (×6) → the Mutation Runtime `enrollment_status` domain. Unify the two action-catalog authorities.

**Phase 1 — Connect what's already built (highest value / lowest cost).**
- **[Connection]** Populate the empty `capacity`/`attendance`/`staffing` metric packs from the existing occupancy/expectation engine; add a positive **open-seats** surface (derive `binding − occupancy`).
- **[Connection]** Fix `executeCommunicationsSend.resolveContextLocationId()` to resolve `location_id` for `opportunities` (not just `jobs`) — activates the location-first sender identity/branding tier already built.
- **[Connection]** Pass the existing site-scope filter into `/api/admin/locations` + `/location-options` (close the dropdown leak).

**Phase 2 — Harden the Location substrate.**
- **[Hardening]** Introduce a canonical `Location` TS type + a thin repository over the 95 raw `.from("locations")` touches; type `location_type` as a union.
- **[Hardening]** Promote room **age band** and site **timezone** from EAV/metadata to first-class typed columns; keep effective-dated where operational.

**Phase 3 — Fill the genuine gaps (new, but on existing patterns).**
- **[New]** **Closures/Holidays** table in the `childcare_*` scoped + effective-dated family (reuse the `scope_type` + validation-trigger pattern; do not invent).
- **[New]** **Transfer-Location** action as a `mutation_command` that supersedes the current `child_placements` row (reuse effective-dated supersede; place it on Current Work + Focus Panel).
- **[New]** **Per-location branding** config as an extension of the communications-identity/location config (from-name, logo, colors) — not a new module.

**Phase 4 — Capacity-aware placement & generalized self-scheduling.**
- **[New]** **Capacity-aware placement routing** as a decision layer in the Process Engine / placement engine (consume `resolveCapacityBreakdown` + occupancy to auto-suggest placement vs waitlist) — proposed via BOS, committed by operator.
- **[Connection/New]** Generalize the tour self-scheduling pattern (booking links + availability + scheduled reminders + tokens) into a reusable "customer books any service" primitive; add tour comms config UI + waitlist offer comms.
- **[Connection]** Link `documents` to `location_id`; thread location/program context into BOS proposals via existing tokens.

**Explicitly do NOT add:** a `rooms` table (rooms are `locations`), a second capacity engine, a fourth program model, a new scheduling substrate, a new config store outside the `scope_type` family, a parallel action catalog, or a new AI runtime. Each already exists once.

---

## Appendix — Classification Roll-up

| # | Capability | Classification |
|---|---|---|
| 1 | Location DB model (site/room/address hierarchy) | Exists and complete |
| 2 | Site-scope access (app layer) | Exists and complete; **API/RLS leak = partial** |
| 3 | Multi-location household/operator model | Exists and complete |
| 4 | Rooms (as entity) | Exists but partial (no table; EAV age band) |
| 5 | Programs | Exists but duplicated (×4) |
| 6 | Capacity / Ratios / Room-Program-Schedule limits | Exists and complete |
| 7 | Occupancy | Exists but disconnected |
| 8 | Open-seats / capacity-availability | Missing (positive surface) |
| 9 | Tours (booking + self-scheduling + comms) | Exists and complete (config-UI gap) |
| 10 | Waitlists + placement/ranking engine | Exists and complete (offer comms missing) |
| 11 | Scheduling (tour / childcare / legacy job) | complete / partial / disconnected (by design) |
| 12 | Communications identity (location-first) | Exists but partial (runtime feed gap) |
| 13 | Tokens (location-aware) | Exists and complete |
| 14 | Templates / Announcements / Scheduled sends (location column) | Exists but partial |
| 15 | Current Work hooks (Tour/Waitlist/Enroll) | Exists but duplicated |
| 16 | Assign Location | Exists but disconnected |
| 17 | Transfer Location | Missing |
| 18 | Capacity/program/location routing | Missing (substrate built) |
| 19 | Config pattern (scope_type, effective-dated) | Exists and complete |
| 20 | Closures / Holidays | Missing |
| 21 | Per-location Branding | Missing |
| 22 | Documents location link | Missing |
| 23 | AI/BOS location context | Exists but disconnected |
| 24 | Timezone ownership | Exists but duplicated |
| 25 | Canonical Location type / repository | Missing (hardening) |

**Certification verdict:** Alloy **already possesses the foundations** for a complete operational location platform. The next phase is **consolidation + connection + four small new primitives on existing patterns** — not construction. Build on these systems; do not compete with them.
