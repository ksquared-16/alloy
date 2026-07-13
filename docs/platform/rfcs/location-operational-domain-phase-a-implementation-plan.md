---
owner: platform
status: proposed
last_reviewed: 2026-07-13
supersedes: []
---

# Location Operational Platform — Phase A Implementation Plan (Canonical Contracts)

**Status:** IMPLEMENTATION PLAN (engineering planning; not an implementation sprint). Execution target: **Cursor**.
**Governing authority (frozen):** [`location-operational-domain-convergence.md`](location-operational-domain-convergence.md) (RFC, ratified) + [`../../audits/active/location-operational-platform-certification-2026-07.md`](../../audits/active/location-operational-platform-certification-2026-07.md) (audit). **Do not reopen architectural decisions** — this plan only sequences the ratified RFC into executable workstreams.
**Base:** `origin/staging` @ `542db595fcc57b57d2d2a9cad0426807e1625f3d` (2026-07-13; PRs #184/#185 landed — Current-Work polish + **canonical field-provider convergence**; the latter establishes the provider convention this plan mirrors). Domain delta check: **zero** Location/Program/Room/Capacity/Ratio/Timezone data-model files touched → RFC holds, no contradiction.

> **What Phase A is.** Freeze the resolver + type **contracts** every consumer depends on, over the *existing* engine and data — so later phases (Settings UI, consumer migration, capacity ops, legacy removal) build against stable seams. **Phase A non-goals (from the RFC): no schema, no migrations, no UI, no data migration, no legacy deletion.** Every provider in Phase A wraps *existing reads* and *hides storage*; column promotion, EAV retirement, and UI live in Phase B+.

---

## 1. Executive summary

Phase A introduces **seven canonical providers/resolvers** as pure, well-typed, storage-hiding contracts, plus the two **safety hardenings** the RFC verified as gaps (deterministic config tiebreak; regulatory-ceiling clamp). It changes **no schema and no UI**, and is behavior-neutral except for the two safety fixes. It exists so that after Phase A, **no consumer computes capacity, resolves a program, enumerates rooms, or interprets a timezone on its own** — they all call a provider.

The work is **strongly aligned to a convention that just landed on staging** (PR #184, `web/lib/fields/canonicalDataProviderRegistry.ts` + `consumerCanonicalProviderAssembly.ts` + `*LegacyCompatibility` + `*ProviderDedup` + `globalCanonical*ConsumerConvergence.test.ts`). Phase A **mirrors that exact shape** for Location/Program/Room, so the codebase gains one provider idiom, not two.

**Nine workstreams, by capability:**

| WS | Capability | Kind | Size |
|----|-----------|------|------|
| **A8** | Shared contracts & types | new (foundation) | S |
| **A7** | Configuration resolution hardening (tiebreak + licensing clamp) | harden existing | S–M |
| **A1** | Canonical Location provider | new over existing reads | M |
| **A3** | Canonical Room provider (`resolveRoomsForLocation`) | new + consumer migration | M |
| **A4** | Timezone resolution provider | new over existing storage | M |
| **A2** | Canonical Program provider | new + adapters | M–L |
| **A6** | Ratio resolver (stepped tiers + mixed-age policy) | formalize existing | M |
| **A5** | Capacity resolver (`resolveOperationalCapacity`) | formalize existing | L |
| **A9** | Certification (tests own by workstream) | cross-cutting | M |

**Exit:** all seven contracts merged; existing consumers compile against them; the only behavior changes are the two ratified safety fixes; a `globalCanonicalLocationConsumerConvergence`-style test proves no in-scope consumer bypasses a provider.

---

## 2. Implementation sequencing (dependency-ordered)

```
A8 Shared contracts ──┬─▶ A7 Config hardening ──┬─▶ A6 Ratio ──▶ A5 Capacity ──▶ A9 (capacity/ratio certs)
                      │                          │
                      ├─▶ A1 Location ──┬─▶ A3 Room ─────────────▶ A9 (location/room certs)
                      │                 └─▶ A4 Timezone
                      └─▶ A2 Program ─────────────────────────────▶ A9 (program certs)
```

**Critical path:** `A8 → A7 → A6 → A5` (capacity depends on ratio depends on config hardening depends on shared types). A1/A2/A3/A4 parallelize off A8. A9 tests are authored *inside* each workstream, with a final global convergence sweep.

**Rationale:** contracts/types first (A8) so every workstream imports one type source; config hardening (A7) before the resolvers that consume it (A5/A6); Location (A1) before Room (A3, which projects from Location) and Timezone (A4, which resolves per-location).

---

## 3. Workstreams

Each is independently understandable. **Provider convention** (mirror `web/lib/fields/`): `canonical<X>ProviderModel.ts` (types) · `canonical<X>Provider.ts`/`Registry.ts` (assembly over seeds + tenant data + legacy refs) · `<x>LegacyCompatibility.ts` (compat refs + `isLegacy*` guards) · optional `<x>ProviderDedup.ts` · `globalCanonical<X>ConsumerConvergence.test.ts`.

---

### A8 — Shared contracts & types  *(foundation; do first)*

- **Purpose:** one canonical source of the Phase-A types every other workstream imports, so no workstream forks a type.
- **Architecture:** a small pure types module; no runtime logic. Re-exports the RFC's ratified shapes.
- **Files likely touched (new):** `web/lib/location/canonicalLocationModel.ts`, `web/lib/programs/canonicalProgramModel.ts`, `web/lib/childcareOperational/capacity/capacityContractTypes.ts`. (No edits to existing files.)
- **Public APIs (types):** `CanonicalLocation`, `CanonicalRoom`, `CanonicalProgram { key; label; description?; status }`, `MixedAgeRatioPolicy = "most_restrictive" | "weighted" | "explicit_room_designation"`, `CapacityResolutionStatus = "resolved" | "incomplete" | "not_configured" | "conflicted"`, `OperationalCapacityRequest`, `OperationalCapacityResult`, `ResolvedRatio`, `TimezoneResolution { storage; viewer?; recipient? }`, `ConfigResolutionTrace`.
- **Internal APIs:** none.
- **Dependencies:** none.
- **Migration needs:** none.
- **Backward compatibility:** additive; nothing consumes these yet.
- **Tests:** type-only; a `tsc` compile smoke + a trivial shape test asserting the unions match the RFC.
- **Risks:** low. Only risk is naming drift vs the `web/lib/fields` convention — mitigate by mirroring names.
- **Acceptance criteria:** modules compile; unions exactly match RFC §6/§8/§9; imported by ≥1 downstream workstream.
- **Out of scope:** any resolver logic, any DB read.
- **Cursor notes:** copy the type shapes verbatim from RFC §6 (Program), §8 (Capacity), §9 (Ratio), §10 (Timezone). Keep modules dependency-free.
- **Order:** 1.

---

### A7 — Configuration resolution hardening

- **Purpose:** close the two verified precedence gaps *without* changing selection semantics: (1) deterministic final tiebreak on exact `effective_start` ties; (2) regulatory (`licensing`) ceiling clamp + stricter-only override enforcement.
- **Architecture:** surgical edits to the existing pure resolver `resolveConfigRule.ts` + a new regulatory-clamp helper consumed by capacity. Precedence *selection* stays `room>program>site>org → age-specific>null → latest effective_start`; add `→ id (or created_at)` as the final deterministic key. Add a `resolveRegulatoryCeiling(kind, rules, ctx, date)` that, for `source_key='licensing'`, returns `min` across all applicable licensing rules in scope rather than most-specific-only.
- **Files likely touched:** `web/lib/childcareOperational/config/resolveConfigRule.ts` (add tiebreak to `compareRulePrecedence`); `web/lib/childcareOperational/config/capacityRules.ts` (consume regulatory clamp); new `web/lib/childcareOperational/config/regulatoryCeiling.ts`; author-time validation in `web/lib/childcareOperational/config/configRuleAuthoringService.ts` (reject an override that raises a licensing limit above a broader one).
- **Public APIs:** `resolveConfigRule` (unchanged signature; deterministic tiebreak added), `resolveRegulatoryCeiling(...)` (new).
- **Internal APIs:** `compareRulePrecedence` gains an `id`/`created_at` comparator tail.
- **Dependencies:** A8 (types).
- **Migration needs:** none (code-only; author-time validation is a guard, not a migration).
- **Backward compatibility:** tiebreak only affects previously-nondeterministic exact-`effective_start` ties (a bug fix, not a contract change). Licensing clamp changes results **only** where an override currently weakens a licensing limit (a safety fix — call out in the PR).
- **Tests:** exact-`effective_start` tie now deterministic (same input → same winner); licensing clamp (`min` across scopes); stricter-only author rejection; non-regulatory kinds keep plain most-specific-wins.
- **Risks:** **Medium** — the licensing clamp changes real results where unsafe overrides exist today; verify no seed data relies on a weakening override (grep `source_key='licensing'` rows). Mitigate with a telemetry/log line the first release.
- **Acceptance criteria:** deterministic resolution proven; licensing cannot be weakened by author or resolver; RFC §12 precedence table matches code.
- **Out of scope:** mixed-age reconciliation (A6); capacity assembly (A5).
- **Cursor notes:** do **not** change scope specificity or age-group ordering; only append the id tiebreak and add the regulatory clamp path. Keep the resolver pure.
- **Order:** 2.

---

### A1 — Canonical Location provider

- **Purpose:** one typed read/identity surface for a Location (site) and its hierarchy, hiding the raw `locations` table and the ~95 ad-hoc `.from("locations")` call sites named in the audit.
- **Architecture:** a provider over existing reads (`resolveOrgSiteLocations.ts`, `locationDisplayLabel.ts`, `web/lib/admin/location/*`) exposing a canonical `CanonicalLocation` and site/hierarchy resolution, **site-scope-aware** (consumes `user_site_access` — closing the audit's list/option leak is a Phase C consumer fix, but the provider must accept and honor a site-scope filter now).
- **Files likely touched (new):** `web/lib/location/canonicalLocationProvider.ts`, `web/lib/location/canonicalLocationModel.ts` (A8). **Read-only reuse:** `web/lib/admin/resolveOrgSiteLocations.ts`, `web/lib/admin/locationDisplayLabel.ts`, `web/lib/admin/location/locationDrawerPresentation.ts`.
- **Public APIs:** `resolveLocationById(orgId, id)`, `resolveSiteLocations(orgId, { siteScope? })`, `resolveLocationHierarchy(orgId, siteId)`, `canonicalLocationDisplay(loc)`.
- **Internal APIs:** a normalizer mapping raw rows → `CanonicalLocation` (types `location_type` as a union; folds the ~5 divergent row shapes into one).
- **Dependencies:** A8.
- **Migration needs:** none (wraps existing reads).
- **Backward compatibility:** additive; existing readers keep working; provider is opt-in this phase.
- **Tests:** row-shape normalization; site-scope filter honored; hierarchy (site→units) correct; label resolution matches `locationDisplayLabel`.
- **Risks:** Low–Medium — divergent existing row shapes; mitigate by making the normalizer total (never throws on a missing optional).
- **Acceptance criteria:** one `CanonicalLocation` type; provider returns identical data to the legacy readers for the same inputs; `location_type` typed as a union.
- **Out of scope:** timezone column promotion (Phase B); API scope-leak fix (Phase C); repository replacing all 95 call sites (Phase C).
- **Cursor notes:** do not migrate consumers yet — only build the provider + normalizer + tests. Mirror `web/lib/fields` provider file layout.
- **Order:** 3 (parallel with A2).

---

### A2 — Canonical Program provider

- **Purpose:** expose Program **identity** (`program_key` vocabulary) + per-location **availability** through one provider so consumers never query the `childcare_program_type` option set or `location_program_categories` directly — preserving future promotion to a `programs` entity without a consumer rewrite (RFC §6).
- **Architecture:** provider over (a) the option-set vocabulary (identity) and (b) `location_program_categories` (availability). Existing `web/lib/admin/location/fetchLocationProgramCategories.ts` + `enrichHierarchyUnitProgramCategories.ts` become **read adapters** behind the provider; `web/lib/programs/programOfferings.ts` stays the Offering layer (distinct concept — not touched except to reference program identity via the provider).
- **Files likely touched (new):** `web/lib/programs/canonicalProgramProvider.ts`, `web/lib/programs/canonicalProgramModel.ts` (A8), `web/lib/programs/programLegacyCompatibility.ts` (dual-key `childcare_program_type` ↔ deprecated `classroom_age_group` fallback, quarantined here). **Read-only reuse:** `fetchLocationProgramCategories.ts`, the option-set reader.
- **Public APIs:** `resolveProgramsForOrganization(orgId): CanonicalProgram[]`, `resolveProgramsForLocation(orgId, locationId): CanonicalProgram[]`, `resolveProgramByKey(orgId, key): CanonicalProgram | null`.
- **Internal APIs:** vocabulary reader; availability reader; the legacy dual-key resolver (moved out of scattered call sites into `programLegacyCompatibility.ts`).
- **Dependencies:** A8.
- **Migration needs:** none in Phase A (adapters wrap existing reads). `program_offerings.program_key` FK-hardening and `classroom_age_group` retirement are **Phase C/E**.
- **Backward compatibility:** the dual-key fallback is preserved but centralized; existing readers untouched.
- **Tests:** identity catalog matches option-set; availability filtered strictly by `location_id` + `is_active` (no cross-location leak); `resolveProgramByKey` round-trips; deprecated `classroom_age_group` still resolves via the compat path.
- **Risks:** Medium — the option-set is read in many places; ensure the provider returns identical keys/labels. Do **not** change the vocabulary.
- **Acceptance criteria:** three provider functions live; a convergence test asserts no *new* code path queries the option set directly; cross-location program leakage impossible.
- **Out of scope:** `programs` table (never, per RFC); offering/variant changes; FK hardening (Phase C).
- **Cursor notes:** keep the Offering layer (`programOfferings.ts`) separate — it is NOT a Program. Centralize the dual-key legacy logic; do not spread it.
- **Order:** 3 (parallel with A1).

---

### A3 — Canonical Room provider

- **Purpose:** make `resolveRoomsForLocation` the *only* way to enumerate rooms, so consumers stop querying `location_type == 'unit'` directly (~16 files identified).
- **Architecture:** a thin provider projecting rooms from the Location hierarchy (unit rows under a site), reusing A1's hierarchy resolution + `adminV2/locationsHierarchyTablePresentation.ts` (`isRoom`) + `enrichHierarchyUnitProgramCategories.ts`. Age-band still read from EAV in Phase A (structured promotion is Phase B, open decision §21-5) but **exposed through the provider** so the storage swap is invisible later.
- **Files likely touched (new):** `web/lib/location/canonicalRoomProvider.ts`. **Read-only reuse:** `web/lib/adminV2/locationsHierarchyTablePresentation.ts`, `web/lib/admin/location/enrichHierarchyUnitProgramCategories.ts`, A1 hierarchy.
- **Public APIs:** `resolveRoomsForLocation(orgId, siteId): CanonicalRoom[]`, `resolveRoomById(orgId, roomId): CanonicalRoom | null`, `resolveRoomsForProgram(orgId, siteId, programKey)` (eligibility filter where configured).
- **Internal APIs:** unit→`CanonicalRoom` normalizer; age-band resolver (EAV read, provider-hidden).
- **Dependencies:** A8, A1.
- **Migration needs:** none (Phase A). The **consumer migration off direct `unit` queries is staged**: Phase A ships the provider + a `globalCanonicalRoomConsumerConvergence.test.ts` that *enumerates* the ~16 direct-query sites as a known-offenders allowlist; Phase C migrates them and shrinks the allowlist to zero (same technique PR #184 used for fields).
- **Backward compatibility:** additive; direct queries still work until Phase C.
- **Tests:** rooms strictly scoped to `parent_location_id = site` (no cross-location leak); program-eligibility filter; known-offenders allowlist enumerated and asserted (documents the debt).
- **Risks:** Low.
- **Acceptance criteria:** provider live; convergence test lists every direct `unit`-query site; no *new* direct query added.
- **Out of scope:** migrating the 16 consumers (Phase C); age-band structured column (Phase B).
- **Cursor notes:** do not create a `rooms` table (RFC §20). The provider is a projection. Enumerate offenders via grep and encode them in the test as the migration ledger.
- **Order:** 4 (after A1).

---

### A4 — Timezone resolution provider

- **Purpose:** one contract that resolves the three timezones (storage/viewer/recipient) so consumers stop reading `locations.metadata.timezone` (or tour/schedule tz columns) directly — making the Phase-B column promotion invisible.
- **Architecture:** a pure resolver reading the Location timezone **through A1** (today from `metadata.timezone`, tomorrow from a column — provider hides this), with fallback ladder Location → org default → explicit-unknown (never UTC-silently). Viewer tz from `user_profiles.timezone`; recipient tz from person/contact. Uses `date-fns-tz` (already a dep, used by the tour slot engine).
- **Files likely touched (new):** `web/lib/location/timezoneResolution.ts`. **Read-only reuse:** A1 provider, `user_profiles` reader, `date-fns-tz`.
- **Public APIs:** `resolveLocationTimezone(orgId, locationId): { tz: string | null; source: "location" | "org_default" | "unknown" }`, `resolveViewerTimezone(user)`, `resolveRecipientTimezone(person)`, `formatInLocationTz(instant, tz)`, `dualTimeLabel(instant, siteTz, viewerTz)`.
- **Internal APIs:** fallback ladder; DST-safe format helpers.
- **Dependencies:** A8, A1.
- **Migration needs:** **none in Phase A.** The `locations.timezone` column, backfill (no wall-clock shift), and retirement of tour/schedule tz authoring are **Phase B/C** — this workstream ships only the *resolver* that hides where tz is stored.
- **Backward compatibility:** additive; reads current `metadata.timezone`; when the column lands in Phase B, only this provider changes.
- **Tests:** fallback ladder (location → org → unknown, never silent UTC); DST transition (spring-forward/fall-back around a slot); dual-time label; date-only stays date-only.
- **Risks:** Medium — must not silently reinterpret wall-clock; assert `source:"unknown"` rather than guessing.
- **Acceptance criteria:** resolver returns a `source`-tagged tz; DST correct; no consumer needs to know the storage location.
- **Out of scope:** the tz column + backfill (Phase B); canonical tz control UI (Phase B); retiring tour/schedule tz columns (Phase C).
- **Cursor notes:** never default to UTC or server tz — unknown is an explicit state. Reuse `date-fns-tz`; do not add a new tz library.
- **Order:** 4 (after A1; parallel with A3).

---

### A6 — Ratio resolver (stepped tiers + mixed-age policy)

- **Purpose:** formalize stepped-tier ratio evaluation and introduce the extensible mixed-age policy (`most_restrictive` only, Phase A), fixing the current single-age-group collapse.
- **Architecture:** wrap the existing pure `ratioRules.ts` (`requiredStaffForChildren`, `ratioLimitedCapacity`, `maxChildrenForStaff`) with a **mixed-age reconciler** that resolves a rule per represented age group and binds by `most_restrictive`; unknown age group → contributes an `incomplete` signal + `unknown_age_group` warning (never dropped). Policy dispatch behind `MixedAgeRatioPolicy` (only `most_restrictive` implemented; `weighted`/`explicit_room_designation` throw `not_implemented` guards).
- **Files likely touched (new):** `web/lib/childcareOperational/capacity/mixedAgeRatioPolicy.ts`, `web/lib/childcareOperational/capacity/resolveRatio.ts`. **Read-only reuse:** `ratioRules.ts`, `roomConfigResolvers.ts`, A7 config resolution.
- **Public APIs:** `resolveRatio(request): ResolvedRatio` (tiers + required staff + limiting age group + warnings), `applyMixedAgePolicy(policy, perAgeResults)`.
- **Internal APIs:** per-age resolver; most-restrictive selector; unknown-age accumulator.
- **Dependencies:** A8, A7.
- **Migration needs:** none.
- **Backward compatibility:** the single-age path is preserved as the degenerate one-age case; behavior changes only for genuinely mixed-age rooms (previously collapsed) — a correctness fix, flagged in the PR.
- **Tests:** 1 adult→≤5 (1:5), 2 adults→≤11 (2:11), no decimal reduction; most-restrictive across two age groups; unknown age → `incomplete` + warning; single-age unchanged.
- **Risks:** Medium — changes mixed-age results; verify against any oracle/golden data.
- **Acceptance criteria:** stepped tiers exact; mixed-age most-restrictive deterministic; unknown never silently ignored.
- **Out of scope:** `weighted` policy (future adapter); staffed-capacity supply (G3).
- **Cursor notes:** do not modify the raw `ratioRules.ts` tier math; wrap it. Keep policies behind one dispatch so `weighted` can slot in later.
- **Order:** 5 (after A7).

---

### A5 — Capacity resolver (`resolveOperationalCapacity`)

- **Purpose:** the single capacity truth surface so no UI/Placement path computes capacity independently. Assembles distinct kinds + ratio + occupancy into a `status`-tagged result with explainability.
- **Architecture:** compose A6 (ratio) + `capacityRules.ts` (`resolveCapacityBreakdown`) + A7 regulatory clamp + occupancy read models (`expectations/*`, `attendance/actualCompliance.ts`) + A1/A2/A3 resolution. Adds positive `availableNow = max(0, binding − committed)` and the `CapacityResolutionStatus` model.
- **Files likely touched (new):** `web/lib/childcareOperational/capacity/resolveOperationalCapacity.ts`. **Read-only reuse:** `capacityRules.ts`, `roomConfigResolvers.ts`, `expectations/buildScheduleExpectations.ts`, `attendance/actualCompliance.ts`.
- **Public APIs:** `resolveOperationalCapacity(request: OperationalCapacityRequest): OperationalCapacityResult` (RFC §8 shape: kinds, binding, occupancies, `availableNow`, `forecastedAvailability`, `status`, `limitingFactor`, `appliedRules`, `warnings`).
- **Internal APIs:** kind assembler; status classifier (`resolved`/`incomplete`/`not_configured`/`conflicted`); explainability collector.
- **Dependencies:** A8, A7, A6, A1, A2, A3 (resolution), A4 (effective-date/tz context where needed).
- **Migration needs:** none (formalizes existing engine).
- **Backward compatibility:** additive; existing `resolveCapacityBreakdown` untouched (this wraps it). Consumers migrate in Phase D.
- **Tests:** binding = min across defined kinds; regulatory clamp honored; `availableNow` positive & floored at 0; status: null-kind→excluded, null-required-input→`incomplete`, no-rule→`not_configured`, unreconcilable→`conflicted`; explainability lists all considered + binding; unknown never 0/unlimited.
- **Risks:** **High-ish** (largest surface) — many inputs; mitigate by composing verified sub-resolvers (A6/A7/capacityRules) and testing the `status` matrix exhaustively.
- **Acceptance criteria:** one resolver returns the full RFC §8 result; consumers *could* drop their own math (they migrate Phase D); status semantics exact.
- **Out of scope:** surfacing available-seats in UI (Phase D); staffed capacity (G3); metric-pack population (Phase D).
- **Cursor notes:** compose, don't reimplement — reuse `resolveCapacityBreakdown`, A6, A7. Return `status` first-class; never coerce unknown to a number. Live in a new `web/lib/childcareOperational/capacity/` directory (the RFC's "Capacity subsystem").
- **Order:** 6 (after A5's deps).

---

### A9 — Certification (tests owned per workstream + global sweep)

- **Purpose:** prove correctness + no-bypass. Each workstream ships its own unit tests; A9 adds the **global convergence** sweep and the migration ledgers.
- **Architecture:** mirror `web/tests/fields/globalCanonicalFieldConsumerConvergence.test.ts` → `globalCanonicalLocation…`, `…Program…`, `…Room…` convergence tests that enumerate direct-access offenders as known-offender allowlists (the Phase C→E migration ledger).
- **Files likely touched (new):** `web/tests/location/*`, `web/tests/programs/*`, `web/tests/childcareOperational/capacity/*`.
- **Dependencies:** all A-workstreams.
- **Tests:** see §12 (full certification plan).
- **Risks:** baseline suite is ~750 red (memory) — gate on `typecheck:build` + isolated-worktree regression diff, not absolute green.
- **Acceptance criteria:** every workstream's acceptance tests green in isolation; convergence tests enumerate offenders; no *new* bypass introduced.
- **Out of scope:** migrating offenders (later phases).
- **Cursor notes:** solo agent only (git races per memory); reuse the fields convergence-test technique.
- **Order:** authored within each workstream; final sweep after A5.

---

## 4. Dependencies (summary)

- **A8** ← none. **A7** ← A8. **A1** ← A8. **A2** ← A8. **A3** ← A8, A1. **A4** ← A8, A1. **A6** ← A8, A7. **A5** ← A8, A7, A6, A1, A2, A3, A4. **A9** ← all.
- **External:** `date-fns-tz` (present). Provider convention reference: `web/lib/fields/canonicalDataProviderRegistry.ts` (staging).

---

## 5. Migration strategy (Phase A specifics)

Phase A performs **no data migration**. It uses the RFC's convergence discipline in its Phase-A-appropriate form:

```
canonical provider (this phase) → known-offenders allowlist test (this phase)
   → consumer migration (Phase C) → allowlist shrinks to 0 → legacy read removed (Phase E)
```

- Providers wrap existing reads; **nothing is deleted**.
- The two safety fixes (A7) are code-only guards, not migrations.
- Every "must stop querying X directly" debt (rooms-as-unit, option-set-direct, metadata.timezone-direct, per-UI capacity math) is **recorded as a known-offenders test** now and burned down later — exactly the technique PR #184 used for fields.

**Tech-debt phasing (RFC duplicates → phase):**

| Duplicate | Phase A | Later |
|---|---|---|
| Config tie non-determinism | **Fixed (A7)** | — |
| Licensing weakening override | **Fixed (A7)** | — |
| Rooms queried as `unit` directly | provider + offender ledger (A3) | migrate consumers (C), remove direct reads (E) |
| Program option-set queried directly | provider + compat (A2) | FK-harden `program_key` (C), retire `classroom_age_group` (E) |
| Timezone read from `metadata`/tour/schedule | resolver hides storage (A4) | `locations.timezone` column + backfill (B), retire dup tz (C) |
| Per-UI capacity math | resolver exists (A5) | consumers adopt (D) |
| Room attribute EAV vs config tables | — | config-table sole owner (B), stop EAV writes (E) |
| Action duplicates (tour×5 / enroll×6) | — | Phase C |
| Empty capacity metric packs | — | Phase D |

**Delete nothing in Phase A.**

---

## 6. Consumer inventory (Phase A disposition)

| Consumer | Phase A disposition |
|---|---|
| **Settings** | untouched (Phase B) |
| **Communications** | untouched (Phase C opportunity→location fix) |
| **Processing** | untouched |
| **Current Work** | untouched (may *read* providers opportunistically, not required) |
| **Placement** | read-only (may consume A5 in tests; migration Phase D) |
| **Tours** | untouched (tz resolve Phase C) |
| **Waitlists** | untouched |
| **Enrollment** | untouched |
| **Attendance** | untouched (already feeds A5 occupancy read models, read-only) |
| **Forms** | untouched |
| **AI/BOS** | untouched |
| **Reporting/Metrics** | untouched (packs Phase D) |
| **Room-as-unit call sites (~16)** | **recorded** in offender ledger (A3); migrated Phase C |
| **Program option-set/`location_program_categories` readers** | **recorded** (A2); migrated Phase C |
| **Timezone `metadata`/tour/schedule readers** | **recorded** (A4); migrated Phase C |

**Phase A changes no consumer behavior** beyond the two A7 safety fixes.

---

## 7. Testing strategy (certification plan)

| Level | Coverage |
|---|---|
| **Unit** | Each provider/resolver: normalization, scoping, fallback, stepped tiers (1:5, 2:11), mixed-age most-restrictive, unknown-age `incomplete`, capacity `status` matrix, tz DST, config tiebreak, licensing clamp. |
| **Integration** | `resolveOperationalCapacity` end-to-end composing A6/A7/capacityRules + occupancy; Program provider over vocabulary + availability; Room provider over Location hierarchy. |
| **Regression** | Existing childcareOperational tests stay green; `resolveConfigRule` selection unchanged except tiebreak; existing `resolveCapacityBreakdown` untouched. Gate on `typecheck:build` + isolated-worktree regression diff (baseline ~750 red — do not gate on absolute green). |
| **Migration** | None (no data migration); instead **known-offenders convergence tests** (rooms/program/tz) enumerate the debt as the Phase C ledger. |
| **Performance** | `resolveOperationalCapacity` is pure over already-loaded config bundles; assert no N+1 (config loaded once via `childcareConfigRuleService`); add a micro-bench guard if a hot path emerges (Phase D concern, note only). |
| **Backward compatibility** | Legacy dual-key program path still resolves; direct readers still work; providers return data identical to legacy readers for the same inputs. |

Every workstream **owns its tests** (acceptance criteria above). A9 adds the global convergence sweep.

---

## 8. Acceptance & exit criteria

**Per-workstream acceptance:** listed in §3.

**Phase A exit criteria (all must hold):**
1. Seven providers/resolvers exist with the RFC-exact public contracts (A1–A6) + shared types (A8).
2. The two ratified safety fixes (deterministic tiebreak; licensing stricter-only clamp) are implemented and tested (A7).
3. `resolveOperationalCapacity` returns the full RFC §8 result incl. `status` and `availableNow`; unknown data never coerced to 0/unlimited.
4. Ratio stepped tiers + `most_restrictive` mixed-age + unknown→`incomplete` proven (A6).
5. Known-offenders convergence tests enumerate every direct-access site (rooms/program/tz) as the migration ledger; **no new bypass** added.
6. `typecheck:build` green; regression diff shows no new failures vs baseline; no schema/migration/UI change.
7. RFC + this plan unchanged (no architectural reopening).

---

## 9. Open risks

| Risk | Severity | Mitigation |
|---|---|---|
| Licensing clamp changes real results where unsafe overrides exist | Medium | Grep licensing rows; log first release; call out in PR |
| Mixed-age policy changes previously-collapsed room results | Medium | Test against golden/oracle data; flag in PR |
| `resolveOperationalCapacity` surface large | Med-High | Compose verified sub-resolvers; exhaustive `status` matrix tests |
| Divergent existing `locations` row shapes | Low-Med | Total normalizer; never throw on missing optional |
| Baseline red suite masks regressions | Medium | Isolated-worktree regression **diff**, not absolute green |
| Provider naming drift vs `web/lib/fields` convention | Low | Mirror file/naming layout exactly |
| Git races if parallel agents | Medium | Solo agent per workstream (memory) |

---

## 10. Implementation order (single linear sequence for Cursor)

1. **A8** Shared contracts
2. **A7** Config hardening (tiebreak + licensing clamp)
3. **A1** Location provider  ·  **A2** Program provider *(parallelizable, but solo-agent → sequence A1 then A2)*
4. **A3** Room provider  ·  **A4** Timezone provider *(after A1; sequence A3 then A4)*
5. **A6** Ratio resolver
6. **A5** Capacity resolver
7. **A9** Global convergence sweep + final cert

---

## 11. Estimated implementation effort

Relative estimates (1 focused engineer / Cursor-agent; **estimates, not commitments**):

| WS | Effort | Notes |
|---|---|---|
| A8 | ~0.5 day | types only |
| A7 | ~1–1.5 days | surgical + clamp + author guard + tests |
| A1 | ~1.5 days | normalizer over divergent shapes |
| A2 | ~2 days | vocabulary + availability + legacy dual-key centralization |
| A3 | ~1 day | projection + offender ledger |
| A4 | ~1.5 days | fallback ladder + DST tests |
| A6 | ~1.5 days | mixed-age reconciler |
| A5 | ~2.5 days | largest; composition + status matrix |
| A9 | ~1 day | global sweep |
| **Total** | **~12–13 days** | contracts only; no UI/schema |

---

## 12. Recommended Cursor branch, commit & PR strategy

**Branch:** one feature branch off latest staging — `phase-a/location-canonical-contracts` (solo agent; no parallel branches to avoid git races).

**Commit boundaries (one per workstream, in order):**
1. `A8: shared canonical contracts & types`
2. `A7: deterministic config tiebreak + licensing ceiling clamp`
3. `A1: canonical Location provider`
4. `A2: canonical Program provider (+ legacy dual-key compat)`
5. `A3: canonical Room provider (+ offender ledger test)`
6. `A4: timezone resolution provider`
7. `A6: ratio resolver (stepped tiers + most_restrictive mixed-age)`
8. `A5: resolveOperationalCapacity (+ status model, availableNow)`
9. `A9: global canonical-consumer convergence sweep`

**PR boundaries (4 PRs, dependency-clean, each independently reviewable & green):**
- **PR-1 — Foundations:** A8 + A7. *(types + safety fixes; smallest, highest-confidence; unblocks all.)*
- **PR-2 — Identity providers:** A1 + A2 + A3 + A4. *(Location/Program/Room/Timezone read providers + offender ledgers.)*
- **PR-3 — Capacity/Ratio resolver:** A6 + A5. *(the compute contract.)*
- **PR-4 — Certification:** A9 global convergence sweep. *(may fold into PR-3 if small.)*

Each PR: gate on `typecheck:build` + isolated-worktree regression diff; no schema/migration/UI; behavior-neutral except the two A7 safety fixes (called out in PR-1).

---

## 13. Cursor readiness assessment

**Ready? YES for Workstream A1 (and A8/A7 foundations).** The architecture is frozen, the provider convention is proven on staging (PR #184), the existing reads and file locations are identified, and every Phase-A workstream has explicit contracts, files, tests, and acceptance criteria. Cursor can execute A1 almost mechanically.

**Guardrails Cursor must respect (from RFC + this plan):** no schema, no migrations, no UI, no data migration, no deletion; wrap existing reads (don't rewrite consumers this phase); mirror the `web/lib/fields` provider file layout; solo agent (git races); gate on `typecheck:build` + regression diff, not absolute green.

**Prompts are issued one workstream at a time.** Only the A1 prompt is produced here; the next is generated after A1 completes.

---

## 14. Cursor prompt — Phase A · Workstream A1 (Canonical Location Provider)

> **Task: Phase A / Workstream A1 — Canonical Location Provider (contracts only; no schema, no UI, no migration, no consumer rewrites).**
>
> **Context.** You are implementing Phase A of the Location Operational Domain convergence. The governing docs (do not reopen decisions) are `docs/platform/rfcs/location-operational-domain-convergence.md` and `docs/platform/rfcs/location-operational-domain-phase-a-implementation-plan.md`. Base branch: latest `origin/staging`. Create/checkout branch `phase-a/location-canonical-contracts`.
>
> **Goal.** Introduce a canonical Location provider that hides the raw `locations` table behind one typed contract, mirroring the established provider convention in `web/lib/fields/canonicalDataProviderRegistry.ts` + `consumerCanonicalProviderAssembly.ts`. Do **not** migrate existing consumers yet and do **not** change any behavior.
>
> **Deliverables.**
> 1. `web/lib/location/canonicalLocationModel.ts` — types: `CanonicalLocation` (with `locationType: "site" | "unit" | "address"` as a union), and a `SiteScopeFilter` type. Fold the ~5 divergent existing row shapes into this one type. No runtime logic.
> 2. `web/lib/location/canonicalLocationProvider.ts` — pure/read provider exposing: `resolveLocationById(orgId, id)`, `resolveSiteLocations(orgId, opts?: { siteScope?: SiteScopeFilter })`, `resolveLocationHierarchy(orgId, siteId)` (site → unit children), `canonicalLocationDisplay(loc)`. Implement by **reusing** existing readers (`web/lib/admin/resolveOrgSiteLocations.ts`, `web/lib/admin/locationDisplayLabel.ts`, `web/lib/admin/location/locationDrawerPresentation.ts`) — wrap, do not reimplement or edit them. Include a **total** raw-row → `CanonicalLocation` normalizer that never throws on a missing optional. The provider must accept and honor an optional `siteScope` filter (from `user_site_access`) but must not change any API route this phase.
> 3. `web/tests/location/canonicalLocationProvider.test.ts` — assert: normalizer maps every existing row shape; `resolveSiteLocations` honors `siteScope`; hierarchy returns unit children of a site and nothing cross-location; `canonicalLocationDisplay` matches `locationDisplayLabel` output for the same input.
>
> **Constraints.** No schema, no migration, no UI, no edits to existing consumers, no new dependency. `location_type` must be a union type (not `string`). Match the file/naming layout of `web/lib/fields/canonical*Provider*`. Keep everything pure/side-effect-free except the reads already performed by the reused helpers.
>
> **Acceptance.** `npm run typecheck:build` (in `web/`) is green; the new test passes; running the existing childcareOperational/admin location tests shows no new failures vs baseline (baseline suite is partially red — compare a diff, do not require absolute green). Commit as `A1: canonical Location provider`. Do **not** push.
>
> **Report back:** files created, the `CanonicalLocation` type, which existing readers were wrapped, test results (typecheck + new test + regression diff), and any existing row-shape that did not map cleanly.

---

## 15. Non-goals (this planning phase)

No production code, no schema, no migrations, no pushes. Documentation only. This plan sequences Phase A; Phases B–E are scoped in the RFC and will get their own plans after Phase A lands.
