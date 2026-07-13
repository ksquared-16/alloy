---
owner: platform
status: proposed
last_reviewed: 2026-07-13
supersedes: []
---

# Location Operational Domain — Consumer Inventory & Migration Matrix

**Status:** DEFINITIVE consumer census (documentation only; freezes the implementation surface before coding). Not implementation.
**Governing authority (frozen):** [`location-operational-domain-convergence.md`](location-operational-domain-convergence.md) (RFC) · [`location-operational-domain-phase-a-implementation-plan.md`](location-operational-domain-phase-a-implementation-plan.md) (Phase A plan) · [`../../audits/active/location-operational-platform-certification-2026-07.md`](../../audits/active/location-operational-platform-certification-2026-07.md) (audit).
**Base:** `origin/staging` @ `542db595fcc57b57d2d2a9cad0426807e1625f3d` (2026-07-13; unchanged since the Phase A plan). Census taken over `web/{lib,app,components}` via four exhaustive parallel sweeps (Location+Room; Program+Placement+Tours; Timezone+Comms+Actions+surfaces; Capacity+Ratio+Config).

> **Purpose.** Before a single provider is written, prove every consumer. Nothing should discover a new consumer mid-implementation. Every row here is anchored to `file:line` evidence and assigned a target provider, adapter classification, migration phase, risk, and test owner.

---

## 1. Executive summary

The census confirms the RFC's premise and de-risks implementation with five decisive facts:

1. **This is a pre-Phase-A tree — nothing is mid-migration.** None of the seven target providers exist yet (`web/lib/location/canonicalLocationProvider`, `canonicalRoomProvider`, `timezoneResolution`; `web/lib/programs/canonicalProgramProvider`; `web/lib/childcareOperational/capacity/resolveOperationalCapacity`/`resolveRatio` — all absent). `resolveConfigRule` is pre-A7 (no id tiebreak, no licensing clamp). Every consumer below is a clean Phase-C/D/E target against contracts still to be authored in Phase A. **No consumer changes in Phase A.**

2. **The read surface is large but concentrated.** ~**61 files / 88 call-sites** read `locations` directly; ~**47** read `location_program_categories`; ~**63** touch `timezone`; ~**16** read the program option-set / categories directly. But two large false-positive classes shrink the *real* work dramatically (below).

3. **Two false-positive classes remove ~50 phantom migration tasks:**
   - **Room FK columns ≠ room reads.** ~40% of `room_location_id`/`site_location_id` hits are **FK columns stored on other tables** (agreements, placements, attendance, capacity/ratio/schedule/rate rules) — they never query `locations`. The *real* room-read surface is **~11 files**. Only their label lookups migrate.
   - **`location_type='address'` is a different domain.** ~15 booking/household sites read `locations` for the **field-service home-address** vertical, not childcare campus/room. These are **excluded** from the Location/Room providers — a hard scope boundary the childcare providers must not cross.

4. **Capacity/Ratio need no de-duplication — only a provider swap at one seam.** The engine is already single-sourced: the *only* binding math is `capacityRules.ts:55`, the *only* tier→staff lookup is `ratioRules.ts`, and both L3 (`buildScheduleExpectations`) and L4 (`actualCompliance`) reach them through one closure pair in `roomConfigResolvers.ts:91-108`. Swap those two closures in Phase D and every capacity/ratio consumer inherits the new providers. There is **no rogue capacity/ratio math** in the operational chain (one minor DRY smell at `buildScheduleExpectations.ts:143`).

5. **Two correctness defects are the highest-value work, and they are net-new capability, not migration:** (a) the comms send path resolves location **only for `jobs`** (`executeCommunicationsSend.ts:30-47`), so the *entire pre-enrollment opportunity/person pipeline* routes location-blind (wrong sender identity, missing `location.name` token, org-wide consent); (b) there is **no positive availability / capacity-aware placement gating** anywhere — placement computes option lists with no seat check.

**Verdict: the implementation surface is frozen.** Every consumer is enumerated, classified, and phased. Implementation may begin (Phase A, Workstream A1) immediately.

---

## 2. Consumer inventory (by subsystem)

~**90 consumer subsystems** across the four domains, consolidated. Grain = *subsystem* (the useful migration unit); file-level offenders are enumerated in §6. Columns: target provider, adapter?, phase, risk, test owner.

### 2.1 Location & Room consumers

| # | Subsystem | Key files | Target provider | Adapter | Phase | Risk | Owner |
|---|---|---|---|---|---|---|---|
| L1 | Settings/Locations config UI (hierarchy tree, site/room detail) | `settings/locations/*`, `locationsHierarchyTablePresentation.ts` | Location + Room | Yes (hierarchy VM) | C | H | Settings |
| L2 | Locations CRUD API + type catalog | `api/admin/locations/**`, `location-options`, `location-types` | Location (reads); writes stay | Yes (reads) | C reads / E filter | H | Platform API |
| L3 | **Site-scope / access-permissions core** | `accessScope.ts:96,151`, `resolveAdminAccessCore.ts:181,271`, `resolveQueueRecordScopeConstraints.ts:56` | Location (`resolveLocationHierarchy`); keep `user_site_access` direct | Yes | C | **H (security)** | Access/Perms |
| L4 | Queue/Workspace label projection | `QueueService.ts:1324,1362`, `enrichOpportunityQueueProjection.ts:106` | Location (batch id→label) | Yes | C | M | Queue |
| L5 | Record drawer / entity record | `api/admin/entity/**`, `api/admin/related/**`, `opportunityEntityRecord.ts`, `LocationDrawerContextPanel.tsx` | Location | Yes (drawer VM) | C | H | Record-drawer |
| L6 | Inquiry-child room selection | `inquiryChildPlacementOptions.ts`, `inquiryChildPlacementScope.ts`, `OpportunityInquiryChildrenSection.tsx` | **Room** | Yes | C | H | Placement/Childcare |
| L7 | Tours (booking/availability/comms location) | `api/admin/tours/**`, `tours/comms/*`, `tours/public/*` | Location (`resolveLocationById`) | Minimal | C | M | Tours |
| L8 | Communications audience + inbox | `communications/v2/audienceHierarchy.ts`, `audienceOptionLabels.ts`, `inboxThreadsService.ts:408` | Location + Room | Yes (audience tree) | C | M | Comms |
| L9 | Metrics/snapshots per-site scope | `metrics/snapshots/writeOrgMetricSnapshots.ts:25`, `scopeFilter.ts` | Location (`resolveSiteLocations`) | Yes | C | M | Metrics |
| L10 | Global search | `globalRecordSearchService.ts`, `globalRecordSearchLocationContext.ts` | Location | Yes | C | M | Search |
| L11 | Forms intake routing + outcome labels | `forms/intake/resolveOrgIntakeRoutingDefaults.ts`, `resolveOutcomeConfigLabelCatalog.ts`, `shareByLocationPresentation.ts` | Location | Yes | C | M | Forms |
| L12 | **Legacy `resolveOrgSiteLocationsForAdmin`** | `admin/resolveOrgSiteLocations.ts` + 3 callers | Location (`resolveSiteLocations` **subsumes it**) | Yes | C rewire / E delete | H | Platform API |
| L13 | Childcare op read-model label/validate | `operationalEnrollmentReadModel.ts:57,153`, `validateChildcareLocationRefs.ts` | Location + Room (label) | Yes | C | M | Childcare |
| L14 | Config scope pickers (site/room options) | `configurationRuntime/useScopeOptions.ts`, `ScopePicker.tsx`, `WorkViewConditionEditor.tsx`, `configurablePlacementFieldCatalog.ts` | Location + Room | Yes (option-set) | C | M | Config-runtime |
| L15 | Commercial/Programs config site pickers | `CommercialConfigWorkspace.tsx`, `ProgramsConfigWorkspace.tsx`, `tuition-rates/route.ts:138` | Location | Yes | C | M | Commercial |
| L16 | Person drawer / household (site/room label rows) | `person/attachPersonDrawerVisibility.ts`, `buildPersonEnrollmentMirrorRows.ts` | Location/Room (label rows only) | Yes | C | M | Person-drawer |
| L17 | Presentation catalogs (display helpers) | `locationDisplayLabel.ts`, `locationListPresentation.ts`, `entityPresentation.ts` | Location (fold into `canonicalLocationDisplay`) | Consolidate | C | L | Presentation |
| L18 | Action-link / task-assist / relationship label attach | `actionLinkDisplayDetails.ts`, `taskAssistEntitySearchService.ts`, `relationshipDisplayAttach.ts`, `assertEntityInOrg.ts` | Location | Minimal | C | L | Platform |
| L19 | **`location_type='address'` (field-service)** | `book-v2/**`, `bookingLocations.ts`, `patchHouseholdCustomerAddress.ts`, `jobs/**`, `schedules/**` | **none — excluded domain** | No | D isolate | L | Field-service |
| L20 | Dev/demo seeds + harness | `dev/seedChildcareDemo.ts`, `waitlistDemoCleanup.ts`, `layout-proof/**` | Location/Room (write) | No | D/E | L | Dev tooling |

### 2.2 Program / Placement / Waitlist / Tours / Scheduling consumers

| # | Subsystem | Key files | Target provider | Adapter | Phase | Risk | Owner |
|---|---|---|---|---|---|---|---|
| P1 | Inquiry program picker cascade | `useInquiryChildPlacementCascade.ts`, `LayoutRuntimePlacementDataProvider.tsx:68`, `inquiryChildPlacementOptions.ts` | Program (identity+availability) | Yes | C | H | Enrollment |
| P2 | OCM record program read | `opportunityEntityRecord.ts:283+`, `queueOcmPlacementEnrichment.ts`, `buildPersonEnrollmentMirrorRows.ts` | Program (`resolveProgramByKey`) | Yes (join→provider) | C | M | Enrollment |
| P3 | Placement candidate load/sync | `bulkLoadPlacementCandidatesByOpportunity.ts`, `placementCandidateLifecycleHook.ts`, `syncPlacementCandidateFromOcm.ts` | Program + placement table | Yes | C | H | Placement |
| P4 | Placement priority eval | `evaluatePlacementPriority.ts`, `applyPlacementV2ToOpportunityQueueRows.ts` | none (fact-driven) | No | D | M | Placement |
| P5 | Cohort resolution | `resolveProgramRoomCohort.ts`, `normalizePlacementWaitlistCohort.ts` | Room (projection key) | Yes | C | H | Placement |
| P6 | Placement overrides | `placementOverrideMutations.ts`, `api/admin/placement-candidates/**` | placement table | No | D | M | Placement |
| P7 | Waitlist queue grouping/grain | `waitlistProgramCategoryResolution.ts`, `orgProgramCategoryRegistry.ts`, `candidateGrainWaitlistQueue.ts` | Program (availability) | Yes (retire fallback registry) | C | H | Waitlist |
| P8 | Tours booking/availability/public | `tourBookingService.ts`, `computeAvailableTourSlots.ts`, `public/tour-booking/**` | none (location-scoped) | No | E | L | Tours |
| P9 | Focus Panel children/tour/billing cards | `focusPanel/children/*`, `focusPanel/tour/*`, `focusPanel/billingPreview/*` | Program + Room | Yes (field binding) | C | M | Focus Panel |
| P10 | Commercial/tuition resolution | `commercial/tuitionRates.ts`, `execution/evaluate/evaluate.ts`, `billing/resolveCommercialScope.ts` | Program + Offering | Yes (scope) | C | H | Commercial |
| P11 | **Offering CRUD APIs** | `api/admin/programs/offerings/**`, `lib/programs/programOfferings.ts`, `programOfferingVariants.ts` | **none — canonical Offering source** | No | **No change** | L | Commercial |
| P12 | Settings programs availability UI/write | `api/admin/location-program-categories/route.ts`, `loadLocationProgramCategoriesForOrg.ts` | Program (availability) — write path | Yes (backing store) | B/C | H | Settings |
| P13 | Queue child/process grain program label | `childGrainProcessInstanceQueue.ts:129`, `QueueService.ts:1335`, `ocmEnrollmentTrackQueueBuilder.ts` | Program | Yes | C | M | Queue |
| P14 | Metrics — tours KPIs | `metrics/resolvers/eventWindowMetrics.ts`, `kpiRegistry.ts` | none | No | E | L | Metrics |
| P15 | Forms/intake program+cohort capture | `forms/systemFieldRegistry.ts`, `intake/buildFormIntakeMetaFromPayload.ts`, `resolveIntakeChildOcmFields.ts` | Program + Room | Yes (intake mapping) | C | M | Forms |
| P16 | Operational expectations/schedule program | `resolveExpectationAgeGroups.ts`, `buildScheduleExpectations.ts`, `operationalEnrollmentReadModel.ts` | Program (availability) | Yes | C | M | Operational |
| P17 | Scheduling patterns/assignments | `schedulePatternService.ts`, `scheduleAssignmentService.ts`, `config/scheduleRules.ts` | none (Program via cohort) | Partial | C/D | M | Scheduling |
| P18 | Operational consumption/charges | `operationalConsumption/consumptionService.ts`, `draftChargeResolutionService.ts`, `materializeChildEnrollment.ts` | Program + placement | Yes | C | M | Operational |
| P19 | Layout runtime child fields | `layoutRefKeyAliases.ts:42`, `childcareLayoutFieldCatalog.ts`, `mapLayoutRuntimeChildrenRows.ts` | Program (label) | Yes | C | L | Layout |

### 2.3 Timezone / Communications / Forms / Actions / Operator surfaces

| # | Subsystem | Key files | Target provider | Adapter | Phase | Risk | Owner |
|---|---|---|---|---|---|---|---|
| T1 | **Timezone contract (de-facto helper)** | `admin/timezoneContract.ts` (org+viewer chains) | Timezone (provider wraps this) | Provider internalizes | A wrap / C | M | Platform/TZ |
| T2 | **Tour location tz (single chokepoint)** | `tours/availability/resolveTourLocationTimezone.ts:19-38` (`tour_availability_rules.timezone`) | Timezone (`resolveLocationTimezone`) | Yes | C (needs B column) | **H** | Tours |
| T3 | Tour display/format tz | `formatTourBookingSiteLocalDisplay.ts`, `groupTourSlotsByLocalDate.ts`, `enrollment/formatTourDateTime.ts` | Timezone (`formatInLocationTz`) | Thin | C | M | Tours |
| T4 | Schedule tz | `api/admin/schedules/[id]/route.ts:25`, `generateNextSubscriptionSchedule.ts` | Timezone | Maybe | C | M | Scheduling |
| T5 | Comms tour tz (labels/reminders/ICS) | `tourCommsTemplateContext.ts`, `tourReminderTiming.ts`, `tourBookingIcs.ts` | Timezone (`dualTimeLabel`) | Thin | C | M | Tours/Comms |
| T6 | Contact/user tz | `bookingResolver.ts:89,118`, `timezoneContract.ts:106` | Timezone (viewer/recipient) | Thin | C | M | Platform |
| T7 | Public booking tz | `api/public/booking-config/route.ts`, `book-v2/availability`, `SlotPicker.tsx` | Timezone | Adapter | C | H | Booking |
| T8 | Display formatters | `adminFormatters.ts`, `formatSmsDateTime.ts`, `presentationDateFormat.ts` | Timezone (`formatInLocationTz`) | Thin | C | M | Platform |
| T9 | **Comms sender-identity location** | `executeCommunicationsSend.ts:30-47,209`, `resolveSenderIdentity.ts`, `resolvePrimaryEntity.ts:47` | Location | **Yes (correctness fix)** | C | **H** | Comms |
| T10 | Comms templates/tokens | `templateTokens.ts:33,93` (`location.name`), `templateService.ts` | Location (name) | Thin | C | L | Comms |
| T11 | Comms scheduled sends / announcements | `communicationScheduledSendsService.ts`, `scheduleAnnouncementSendout.ts`, `resolveAnnouncementAudience.ts` | Timezone + Location | Thin | C | M | Comms |
| T12 | Forms/docs location link | `forms/locationSpecificPublicLinkMetadata.ts`, `shareByLocationPresentation.ts` | Location | Thin | C | L | Forms |
| T13 | Actions: schedule/reschedule_tour | `actionDefinitionRegistry.ts:126,135`, `scheduleTourWorkUnitActions.ts`, `executeAdminAction.ts:872` | none (uses tz downstream) | No | C | M | Actions |
| T14 | **Actions: assign/transfer_location** | **absent — no action keys exist** | Location | **new build** | D/E | — | Actions |
| T15 | Current Work / Focus Panel (viewer tz) | `focusPanel/currentWork/*`, `viewerTimezoneBootstrap.ts` | Timezone (`resolveViewerTimezone`) | Thin | C | M | Operator surfaces |
| T16 | Queue (viewer tz + location scope) | `QueueService.ts`, `queueMembershipRuntimeResolver.ts:56,212`, `workUnitQueueScopeCacheKey.ts` | Timezone + Location | Thin | C | M | Queues |
| T17 | Record headers / tz bootstrap | `viewerTimezoneBootstrap.ts:19-27` + all admin layouts | Timezone (`resolveViewerTimezone`) | Provider wraps | C | M | Operator surfaces |
| T18 | AI/BOS location+timing context | `taskAssist/taskAssistTimingResolve.ts`, `bos/communication/*` | Timezone | Thin | C | L | AI/BOS |

### 2.4 Capacity / Ratio / Config-resolution consumers

| # | Subsystem | Key files | Target provider | Adapter | Phase | Risk | Owner |
|---|---|---|---|---|---|---|---|
| C1 | **Canonical capacity math (seed)** | `config/capacityRules.ts:20,42,55` | *becomes* `resolveOperationalCapacity` | source | D | M | Capacity owner |
| C2 | **Canonical ratio math (seed)** | `config/ratioRules.ts:32,53,59` | *becomes* `resolveRatio` | source | D | M | Ratio owner |
| C3 | **Config resolution (shared)** | `config/resolveConfigRule.ts` (whole) | Config (A7 hardening) | No | A → D | M | Config owner |
| C4 | **Room→config resolver seam** | `config/roomConfigResolvers.ts:91-108` (`resolveTiers`, `resolveCapacityBinding`) | Capacity + Ratio | **Yes — THE single swap seam** | D | M | Operational eng |
| C5 | Expectations/occupancy (L3) | `expectations/buildScheduleExpectations.ts:142-143`, `scheduleExpectationCore.ts:188,217` | Capacity + Ratio (via C4) | via C4 | D | M | Operational eng |
| C6 | Attendance/actual-compliance (L4) | `attendance/actualCompliance.ts:116,154`, `buildActualComplianceReadModel.ts` | Capacity + Ratio (via C4) | via C4 | D | M | Operational eng |
| C7 | Operational-config API (read + authoring) | `api/admin/operational-config*/**`, `configRuleAuthoringService.ts` | Config (read); writes stay | No | D | M | Config authoring |
| C8 | Expectations/compliance read-model APIs | `api/admin/operational-expectations/route.ts`, `childcare-attendance/actual-compliance/route.ts` | none (passthrough) | No | D | L | API |
| C9 | Settings operational-rules preview | `LocationOperationalRulesPanel.tsx:93-94`, `useLocationRuleAuthoring.ts` | Config | No | D | L | Settings eng |
| C10 | **Financials rate resolution (co-consumer)** | `financials/rates/resolveRate.ts:78` (`resolveConfigRule<RatePlan>`) | Config (signature-coupled) | No | D | **M — A7 signature ripple** | Financials |
| C11 | Schedule rules | `config/scheduleRules.ts:20` | Config | No | D | L | Operational eng |
| C12 | **Placement — NO capacity gating (gap)** | `childPlacementService.ts`, `useOperationalPlacementOptions.ts` | Capacity (new consumer) | new build | D | — | Placement |
| C13 | Metric packs (empty) | `metrics/packs.ts:53-84` | Capacity/Ratio (future) | No | E | L | Metrics |
| C14 | **Tours slot-capacity (distinct domain)** | `tours/availability/internalCompute.ts:140,156` | **none — do NOT migrate** | No | — | L | Tours |

---

## 3. Read matrix (current source per consumer type)

| Consumer type | Current read source | Evidence |
|---|---|---|
| Site list / header filter / routing | **Legacy helper** `resolveOrgSiteLocationsForAdmin` → direct `locations` `location_type='site'` | `resolveOrgSiteLocations.ts:13` |
| Location label chips | **Direct table** `locations` `.in("id")` + `LOCATION_DISPLAY_LABEL_SELECT` | `QueueService.ts:1324` |
| Site-scope security | **Direct table** hierarchy walk `parent_location_id` + `user_site_access` | `accessScope.ts:96,151` |
| Rooms enumeration | **Direct table** `location_type='unit'` filter / `isRoom` | `locations/route.ts:104`, `locationsHierarchyTablePresentation.ts:85` |
| Program picker | **Option set** `fetchOptionSetItemsBySetKey("childcare_program_type")` | `useInquiryChildPlacementCascade.ts:57` |
| Program label on records | **Embedded join** `location_program_categories(key,label)` on OCM | `opportunityEntityRecord.ts:332` |
| Program availability | **Direct table** `location_program_categories` | `resolveExpectationAgeGroups.ts:49` |
| Program age fallback | **EAV** deprecated `classroom_age_group` field | `enrichHierarchyUnitProgramCategories.ts:36` |
| Cohort | **Loose string** `program_room_cohort_key` (authored) | `resolveProgramRoomCohort.ts:65` |
| Offering / tuition | **Direct table** `program_offerings`/`variants` (canonical) | `programOfferings.ts` |
| Location timezone | **Column** `tour_availability_rules.timezone` (only resolver) | `resolveTourLocationTimezone.ts:19` |
| Org/viewer timezone | **Metadata chain** via `timezoneContract.ts` | `timezoneContract.ts:32,106` |
| `locations.metadata.timezone` | **Written but never read** (orphaned) | `LocationSiteDetailPanel.tsx:181` |
| Comms location | **Direct** `job.location_id` only (jobs-only gap) | `executeCommunicationsSend.ts:36` |
| Capacity | **Runtime resolver** `resolveCapacityBreakdown` over `childcare_capacity_rules` via `resolveConfigRule` | `capacityRules.ts:42` |
| Ratio | **Runtime resolver** `ratioRules` tiers | `ratioRules.ts:32` |
| Config precedence | **Runtime resolver** `resolveConfigRule` (pre-A7) | `resolveConfigRule.ts:83` |
| Room/site config scope | **FK columns** `site_location_id`/`room_location_id` (no `locations` read) | `childcare_*_rules`, attendance, placements |

---

## 4. Provider matrix (future source per consumer type)

| Future provider | Public API | Consumers routed to it | First real consumer phase |
|---|---|---|---|
| **Location Provider** `lib/location/canonicalLocationProvider` | `resolveLocationById` · `resolveSiteLocations({siteScope})` · `resolveLocationHierarchy` · `canonicalLocationDisplay` | L1–L18 (site list, labels, drawer, search, metrics, access hierarchy, comms location, forms routing) | C |
| **Room Provider** `lib/location/canonicalRoomProvider` | `resolveRoomsForLocation` · `resolveRoomById` · `resolveRoomsForProgram` | L1,L6,L8,L13,L14, P5,P9,P15 (room enumeration, options, labels, cohort projection) | C |
| **Program Provider** `lib/programs/canonicalProgramProvider` | `resolveProgramsForOrganization` · `resolveProgramsForLocation` · `resolveProgramByKey` | P1–P3,P7,P9,P10,P12,P13,P15,P16,P18,P19 | C |
| **Timezone Provider** `lib/location/timezoneResolution` | `resolveLocationTimezone` · `resolveViewerTimezone` · `resolveRecipientTimezone` · `formatInLocationTz` · `dualTimeLabel` | T1–T8,T11,T15–T18 | C (column = B) |
| **Capacity Resolver** `lib/childcareOperational/capacity/resolveOperationalCapacity` | full RFC §8 result (kinds/binding/occupancy/`availableNow`/`status`) | C1,C4,C5,C6,C12 (via seam) | D |
| **Ratio Resolver** `lib/childcareOperational/capacity/resolveRatio` | stepped tiers + mixed-age `most_restrictive` | C2,C4,C5,C6 | D |
| **Config Resolution** `resolveConfigRule` (hardened A7) | id tiebreak + licensing clamp; **signature unchanged** | C3,C7,C9,C10,C11 (incl. financials) | A (hardening) → D |
| **No change (excluded/canonical)** | — | L19 (address domain), P11 (Offering), C14 (tour slots), FK-column sites | — |

---

## 5. Adapter matrix

Classified: **Temporary** (deleted after consumer migration) · **Permanent** (a lasting seam) · **Unnecessary** (no adapter — direct swap or excluded) · **Blocked** (needs an earlier phase) · **Future** (later phase).

| Adapter | Purpose | Classification | Blocked on | Deletion criteria |
|---|---|---|---|---|
| `resolveSiteLocations` **subsumes** `resolveOrgSiteLocationsForAdmin` | site list w/ siteScope | **Temporary** | — | helper file deleted (E) after 3 callers rewired |
| Batch id→label adapter | queue/search/drawer chips | **Permanent** | — | n/a (canonical display path) |
| Location hierarchy → access-scope | security descendant expansion | **Permanent** | — | n/a (keep behind provider) |
| Drawer/related VM adapter | entity drawer location rows | **Temporary** | — | drawer reads provider directly |
| Program picker-options adapter | option-set → `resolveProgramsForLocation` | **Temporary** | Program provider (A2) | option-set fetch removed from components |
| Program embedded-join → provider | OCM label/key resolution | **Temporary** | A2 | embed becomes id-only |
| `classroom_age_group` fallback | dual-key legacy | **Temporary** | A2 | 4 read sites removed (E) |
| Cohort → Room projection | `program_room_cohort_key` becomes derived | **Temporary** | Room provider (A3) | free-text authoring disabled |
| Waitlist fallback registry (`ORG_PROGRAM_CATEGORY_KEYS`) | hardcoded category fallback | **Temporary** | A2 | registry retired into provider |
| Timezone provider wraps `timezoneContract.ts` | org/viewer chain | **Permanent** | — | n/a (internalized) |
| `resolveTourLocationTimezone` → `resolveLocationTimezone` | location-tz chokepoint | **Temporary** | `locations.timezone` column (B) | tour rule tz column retired (C) |
| Comms location resolver (opportunity/person) | fix jobs-only gap | **Permanent (correctness)** | Location provider | jobs-only branch removed |
| **roomConfigResolvers capacity/ratio swap** | L3+L4 inherit new resolvers | **Permanent** | Capacity+Ratio (A5/A6) | n/a (the canonical seam) |
| Offering / address / tour-slot / FK-columns | — | **Unnecessary** (excluded) | — | never adapted |
| `assign_location` / `transfer_location` actions | — | **Future** (new build) | Location + placement | n/a (net-new) |
| Placement capacity gating | seat check at placement | **Future** (new build) | Capacity resolver (A5) | n/a (net-new, D) |

---

## 6. Known offenders (ledger)

Grouped by class; every class names its high-risk members and gives counts. Full file-level enumeration is captured in the four sweep transcripts; the migration ledgers below are the actionable burn-down.

### Class A — `.from("locations")` direct reads — **61 files / 88 sites**
- **Replacement:** `resolveLocationById` / `resolveSiteLocations` / `resolveLocationHierarchy` + `canonicalLocationDisplay`. **Phase:** C (reads) / E (delete legacy filter). **Owner:** owning squad per §2.1.
- **High-risk named offenders:** `accessScope.ts:96,151` (security), `resolveOrgSiteLocations.ts:19` (legacy helper → provider body), `QueueService.ts:1324`, `api/admin/entity/[type]/[id]/route.ts:305,467,614,1405`, `api/admin/locations/route.ts:33,250,285` (writes stay).
- **Deletion criteria:** no `.from("locations")` outside the provider + the sanctioned write routes.

### Class B — Rooms-direct (`location_type='unit'` / `isRoom`) — **~11 real read files** (of 85 grep hits; rest are FK columns)
- **Replacement:** `resolveRoomsForLocation` / `resolveRoomById`. **Phase:** C. 
- **Named offenders:** `locations/route.ts:104`, `inquiryChildPlacementOptions.ts:27`, `locationsHierarchyTablePresentation.ts:85`, `useScopeOptions.ts:56`, `audienceHierarchy.ts:98`, `configurablePlacementFieldCatalog.ts:25`, `validateChildcareLocationRefs.ts:72`.
- **Deletion criteria:** no inline `location_type==='unit'` filter outside the provider.
- **NOT offenders (flag `No change`):** all `room_location_id` FK columns on `childcare_*` / attendance / placement / rate tables.

### Class C — Program option-set / category direct reads — **~16 sites**
- **Replacement:** Program provider. **Phase:** C. **Named:** `useInquiryChildPlacementCascade.ts:57`, `LayoutRuntimePlacementDataProvider.tsx:68`, `workspaceChildcareInquiryOptionSets.ts:6`, `loadLocationProgramCategoriesForOrg.ts:31`, `resolveExpectationAgeGroups.ts:49`, embedded joins on OCM/candidate selects (~6). **Sanctioned writer (keep):** `api/admin/location-program-categories/route.ts`.

### Class D — `classroom_age_group` legacy fallback — **4 sites** (dual-key otherwise ~90% retired)
- **Replacement:** Program provider single-source. **Phase:** C read / E delete. **Named:** `enrichHierarchyUnitProgramCategories.ts:36`, `resolveExpectationAgeGroups.ts:72`, `buildScheduleExpectations.ts`, `childcareFieldCatalogDoctrine.ts:168` (doctrine anchor). **Deletion criteria:** `classroom_age_group` literal count = 0.

### Class E — `program_room_cohort_key` loose-string authoring — **~7 sites**
- **Replacement:** Room-provider projection (cohort = derived, not authored). **Phase:** C. **Named:** `resolveProgramRoomCohort.ts:65,73`, `normalizePlacementWaitlistCohort.ts:58`, `buildFormIntakeMetaFromPayload.ts:81`, `resolveIntakeChildOcmFields.ts:71`, focus-panel edit sites. **Deletion criteria:** free-text cohort edit disabled; key emitted by projection.

### Class F — Timezone direct / silent-UTC — **~20 sites**
- **Replacement:** Timezone provider (source-tagged, never silent UTC). **Phase:** C (column B). **Named:** `resolveTourLocationTimezone.ts:19` (chokepoint), `viewerTimezoneBootstrap.ts:21` (silent catch→UTC), hardcoded `timeZone:"UTC"` in `adminFormatters.ts:94,152,168` / `configReadPresentation.ts:101` / `tourSlotWindowPagination.ts:27`, `formatSmsDateTime.ts:6` (`|| "UTC"`), `generateNextSubscriptionSchedule.ts:71` (`?? "UTC"`). **Deletion criteria:** no literal `"UTC"` fallback; all format via `formatInLocationTz`.

### Class G — Comms opportunity→location gap — **4 sites (highest-value correctness)**
- **Replacement:** Location-aware resolver for opportunities+persons. **Phase:** C. **Named:** `executeCommunicationsSend.ts:30-47,209`, `resolvePrimaryEntity.ts:47`, `resolveSenderIdentity.ts:60`. **Deletion criteria:** non-`jobs` sends resolve a location; location sender binding + `location.name` token engage for opportunity/person conversations.

### Class H — Duplicate Schedule-Tour action defs — **~6 sites**
- **Replacement:** one canonical `open_form` action def. **Phase:** C. **Named:** `submitTourScheduleLegacyFromPanel.ts:11` (legacy), inline `schedule_tour` literals in `useOpportunityDrawerVmRegistryModals.tsx:317,420`, `buildOpportunityDrawerHeaderMenuActions.ts:12`, demo seeds `demoFocusPanelSummaryViewModel.ts:104`. **Keep canonical:** `tourBookingActionClient.ts:36`.

### Class I — Legacy Enroll mutation aliases — **~7 sites**
- **Replacement:** `update_child_enrollment_status` (enrollment_status domain). **Phase:** C (aliases) / D (collapse intent catalog). **Named:** `actionDefinitionRegistry.ts:104,121,171` (`enroll_child`/`mark_won`, in-code flagged legacy), `enrollmentStatus.ts:67`, `platformActionCatalog.ts:96`, `workTemplateActionIntentCatalog.ts:50`. **Keep canonical:** `executeEnrollmentStatusTransition.ts`. **Note:** `approve_enrollment_handoff` is a distinct operational event, **not** a duplicate — No change.

### Class J — Capacity/Ratio — **essentially clean**
- **No rogue math offenders.** Only: 3 empty metric packs `packs.ts:53-75` (Phase E populate); one DRY smell `buildScheduleExpectations.ts:143` (bypasses the `resolveCapacityBinding` closure — fold during D swap). Tour slot capacity `internalCompute.ts:156` and config-authoring direct writes are **legit / distinct domain** — No change.

### Class K — Excluded (hard scope boundary, No change)
- `location_type='address'` field-service (~15 sites: `book-v2/**`, `bookingLocations.ts`, `jobs/**`, household address); `program_offerings`/variants (Offering, canonical); tour-slot capacity; all `*_location_id` FK columns; UI string literals.

---

## 7. Provider dependency graph (implementation order)

```
A8  Shared Contracts & Types
        │
        ▼
A7  Configuration Resolution (id tiebreak + licensing clamp; SIGNATURE UNCHANGED — financials resolveRate depends on it)
        │
        ├────────────┬───────────────┐
        ▼            ▼               ▼
A1 Location     A2 Program      (A2 uses A8 only)
        │            │
        ├──► A3 Room (projects from A1; program-eligibility uses A2)
        └──► A4 Timezone (resolves per-location via A1; wraps timezoneContract.ts)
                     │
        A6 Ratio ◄───┘ (depends on A7)
        │
        ▼
A5 Capacity  (composes A6 + A7 + A1/A2/A3 + occupancy read models)
        │
        ▼
   CONSUMERS  (Phase C: Location/Program/Room/Timezone consumers · Phase D: Capacity/Ratio via roomConfigResolvers seam · Phase E: legacy deletion)
```

**Hard constraints the graph encodes:** A7 must not change the `resolveConfigRule` signature (financials `resolveRate.ts:78` + `scheduleRules.ts` are co-consumers); Timezone consumer migration (C) is blocked on the `locations.timezone` column (B); Capacity/Ratio consumers all migrate through the single `roomConfigResolvers.ts:91-108` seam.

---

## 8. Migration order (by phase)

| Phase | Scope | Consumers touched |
|---|---|---|
| **A** (contracts) | Author 7 providers + A7 hardening | **none migrated** — providers stand up over existing reads |
| **B** (Settings + tz column) | Location Settings workspace; `locations.timezone` column + backfill (source `metadata.timezone`, already populated, no read to break); programs availability write path | Settings/Locations UI (L1,P12); tz storage |
| **C** (consumer convergence — the bulk) | Route reads through providers | Location L1–L18 (except writes); Room B-class; Program C/D/E classes; Timezone F-class; Comms G-class; Actions H/I classes |
| **D** (capacity ops) | Swap `roomConfigResolvers` seam; populate placement capacity gating; financials co-consumer verified against A7 | C1–C12; placement gating (net-new) |
| **E** (legacy removal) | Delete helpers + legacy reads once offender ledgers hit zero | `resolveOrgSiteLocations.ts`, `classroom_age_group`, duplicate action defs, empty→populated metric packs |

**Sequencing within C (lowest-risk first):** `resolveOrgSiteLocationsForAdmin` rewire (3 callers, provider already matches its contract) → label-chip batch adapters → drawer/search → **accessScope.ts last within its own PR** (security; dedicated tests) → comms location fix (correctness) → program/room/cohort → timezone.

---

## 9. Certification gates (per consumer, expanded)

Every consumer must eventually certify **all five**:

1. **Current read removed** — no direct `.from("locations")` / option-set / `metadata.timezone` / inline capacity math at the call site (enforced by a `globalCanonical<X>ConsumerConvergence.test.ts` known-offenders allowlist that shrinks to zero — the PR #184 technique).
2. **Canonical provider adopted** — the consumer imports and calls the provider.
3. **Legacy compatibility removed** — dual-key `classroom_age_group`, `resolveOrgSiteLocationsForAdmin`, duplicate action defs deleted.
4. **No duplicate calculations** — no second capacity/ratio/tz computation (capacity clean today; keep it so).
5. **No duplicate resolution** — one program-key path, one room enumeration, one tz resolution, one config precedence.

**Gate mechanics:** each provider ships a convergence test enumerating its offender class as an allowlist; Phase C/D/E burn the allowlist to zero; a green allowlist-empty test is the deletion gate. Regression gate = `typecheck:build` + isolated-worktree diff (baseline suite partially red — never gate on absolute green). Solo agent per workstream (git races).

---

## 10. Implementation risks

| Risk | Severity | Mitigation |
|---|---|---|
| `accessScope.ts` migration leaks site-scope permissions | **High** | Migrate last in Phase C; dedicated permission-boundary tests; keep `user_site_access` reads direct |
| A7 changes `resolveConfigRule` signature → breaks financials `resolveRate.ts` + `scheduleRules.ts` | **Medium** | A7 is additive (append tiebreak, add clamp helper); signature frozen; test financials rate resolution |
| `location_type='address'` accidentally pulled into childcare providers | **Medium** | Explicit exclusion in provider + a test asserting providers never return `address` rows |
| Room FK-column sites mistaken for room reads → ~35 phantom tasks | **Medium** | Ledger flags them `No change`; convergence test scopes to real reads only |
| Comms location fix changes sender identity for live pipelines | **Medium** | It is a correctness fix; stage behind the Location provider; verify sender selection per entity type |
| Timezone consumer migration before the column exists | **Medium** | Provider stubs `resolveLocationTimezone` over `resolveTourLocationTimezone` until Phase B column lands |
| Cohort projection changes waitlist grouping | **Medium** | `program_room_cohort_key` stays as compat during C; projection verified against current slugs |
| Baseline red suite masks regressions | **Medium** | Isolated-worktree regression **diff**, not absolute green |
| Provider naming drift vs `web/lib/fields` convention | **Low** | Mirror the PR #184 file/naming layout exactly |

---

## 11. Implementation ownership

| Provider / track | Owning squad | Highest-risk consumer to co-own |
|---|---|---|
| Location provider | Platform API | Access/Perms (`accessScope.ts`) |
| Room provider | Placement/Childcare | Inquiry-child room selection |
| Program provider | Enrollment | Commercial tuition scope |
| Timezone provider | Platform/TZ | Tours (`resolveTourLocationTimezone`) |
| Capacity resolver | Operational eng | Placement capacity gating (net-new) |
| Ratio resolver | Operational eng | Mixed-age rooms |
| Config hardening (A7) | Config owner | Financials (`resolveRate.ts`) |
| Comms location fix | Comms | pre-enrollment pipeline correctness |
| Actions convergence | Actions | Schedule Tour / Enroll dedup |

---

## 12. Final assessment — is the implementation surface frozen?

**YES. The implementation surface is frozen.**

- Every runtime consumer of Location, Program, Room, Timezone, Capacity, Ratio, Availability, Placement, Tours, and Scheduling is enumerated with `file:line` evidence, a target provider, an adapter classification, a migration phase, a risk, and a test owner (§2).
- The current read map (§3) and future provider map (§4) are complete; every consumer resolves to a provider or an explicit **No change** (excluded/canonical).
- The offender ledger (§6) is exhaustive by class with named high-risk members and deletion criteria; two large false-positive classes (room FK columns; `address` domain) are excluded so implementation won't chase ~50 phantom tasks.
- The dependency graph (§7) and phase order (§8) are unambiguous; the only cross-track coupling (A7 ↔ financials; timezone ↔ column) is called out.
- Nothing is mid-migration: the providers do not exist yet, so implementation starts from a clean slate.

**No blockers remain.** The two genuinely-absent capabilities (comms opportunity→location resolution; capacity-aware placement gating) are net-new builds already phased (C and D), not undiscovered consumers.

**Recommendation: begin implementation immediately** with Phase A / Workstream A1 (Canonical Location Provider) using the prompt in the Phase A plan §14. This inventory is the authoritative migration guide every workstream references; each provider's Phase-C/D/E consumer list is now fixed.

---

## 13. Non-goals (this phase)

No implementation, no runtime code, no migrations, no schema, no pushes. Documentation only. This inventory freezes the surface; Phases B–E consumer migration executes against it after Phase A lands the contracts.

---

## 14. Phase A implementation update (canonical providers now available)

Phase A (Canonical Contracts) is implemented on `origin/staging` `82e700b68` (branch `phase-a/location-canonical-contracts`, local). The migration targets referenced throughout §2–§9 now EXIST as concrete modules. **No consumer was migrated** — the read matrix (§3) is unchanged; every consumer migration remains assigned to Phase C (bulk) / D (capacity) / E (legacy removal).

**Canonical provider paths now available (Phase C/D migration targets):**

| Provider | Module | Entry points |
|---|---|---|
| Location | `web/lib/location/canonicalLocationProvider.ts` | `resolveLocationsForOrganization` · `resolveLocationsForUser` · `resolveSiteLocations` · `resolveLocationById` · `resolveLocationHierarchy` · `canonicalLocationDisplay` |
| Room | `web/lib/location/canonicalRoomProvider.ts` | `resolveRoomsForLocation` · `resolveRoomById` · `resolveRoomsForProgram` |
| Program | `web/lib/programs/canonicalProgramProvider.ts` | `resolveProgramsForOrganization` · `resolveProgramsForLocation` · `resolveProgramByKey` · `findOrphanOfferingProgramKeys` |
| Timezone | `web/lib/location/timezoneResolution.ts` | `resolveLocationTimezone` · `resolveViewerTimezone` · `resolveRecipientTimezone` · `formatInLocationTz` · `dualTimeLabel` |
| Capacity | `web/lib/childcareOperational/capacity/resolveOperationalCapacity.ts` | `resolveOperationalCapacity` |
| Ratio | `web/lib/childcareOperational/capacity/resolveRatio.ts` | `resolveRatio` / `resolveMixedAgeRatio` |
| Config (hardened) | `web/lib/childcareOperational/config/{resolveConfigRule,regulatoryCeiling}.ts` | deterministic tiebreak + licensing clamp/guard |

**Room offender ledger** — the frozen Class-B burn-down list now lives in code at `web/lib/location/roomConsumerConvergence.ts` (`KNOWN_ROOM_DIRECT_QUERY_OFFENDERS`, **12 files**, matching §6 Class B). Deletion criterion unchanged: the list shrinks to zero as Phase C migrates each site; Phase E removes the direct reads.

**Offender counts:** unchanged from §6. No new consumers were discovered during implementation. Program legacy dual-key handling is centralized in `web/lib/programs/programLegacyCompatibility.ts` (Class D — `classroom_age_group`, 4 sites, retire Phase E). The two post-rebase corrections (site-scope query push; `availableNow` offered subtraction) are provider-internal and add no consumer obligations.

**Phase C/D/E assignments remain exactly as in §8.** No broad consumer migration entered Phase A.
