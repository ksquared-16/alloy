# Organization Configuration Convergence — Phase 3: Financials

**Discovery handoff (bounded; no implementation)**  
**Date:** 2026-07-22  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt2-org-config-financials`  
**Branch:** `agent/cursor/2-org-config-financials`  
**Staging base:** `2c8dc2f6c` — Merge PR #234 `org-runtime-realization` (Programs + Locations + Rooms + Scheduling)  
**Slot / port:** 2 / 3012  
**Status:** Discovery only. No feature implementation started.

---

## A. Current Financials routes and operator entry points

### Canonical product IA

| URL | Notes |
|-----|--------|
| `/organization/financials` | Landing (tile hub). Rewrite → `adminV2/settings/organization/financials` |
| `/organization/financials?chapter=tuition\|catalog\|policies\|accounting\|simulator\|funding` | Chapter workspace |
| `?chapter=fees` | Alias → `catalog` |

**Page:** `web/app/adminV2/settings/organization/financials/page.tsx` → `FinancialsPublicationWorkspace`

**Nav:** Business → Financials (`web/lib/adminV2/configurationModeNav.ts`)  
Also: org domain card (`organizationRuntime.ts`), cross-link from Programs & Locations landing.

### Compatibility redirects

| Source | Destination |
|--------|-------------|
| `/settings/commercial` | `/organization/financials` |
| `/settings/commercial/tuition` | `?chapter=tuition` |
| `/settings/commercial/programs` | `/organization/programs` |
| `/adminV2/settings/commercial*` | same pattern |
| Programs `?chapter=<tool>` | Financials chapter |

### Parallel / non-primary surfaces

| URL | Role |
|-----|------|
| `/settings/financials` | Financial Configuration Convergence **engine** (services, rate plans, charge templates, draft obligations). **Not** in primary org nav. |
| `legacy-admin/financials/*` | Jobs/cleaning pricing dimensions, matrix, ledger — separate vertical |

### Feature flags

**None** found (`NEXT_PUBLIC_*` / product flags empty for financials). Gates: `canMutate`, designed stubs, disabled payer tabs.

---

## B. Existing Financials / Commercial / Tuition components

### Organization Financials (canonical)

```
web/components/adminV2/settings/financials/
  FinancialsPublicationWorkspace.tsx
  FinancialsLanding.tsx
  FinancialsWorkspaceSurface.tsx   # chapter tabs + panels
```

### Commercial editors (still the real chapter bodies)

```
web/components/adminV2/commercial/
  TuitionGridWorkspace.tsx
  CommercialConfigWorkspace.tsx    # Catalog + Accounting panels exported
  CommercialPoliciesPanel.tsx
  CommercialSimulatorPanel.tsx
  CommercialHubShell.tsx           # orphaned / stale links
```

### Engine `/settings/financials`

```
FinancialsConfigurationPage.tsx
RatePlanAuthoringWorkspace, ServicesConfigurationPanel,
ChargeTemplatesConfigurationPanel, FinancialPoliciesConfigurationPanel,
FinancialChargePreviewInspector, DraftObligationReviewWorkspace,
FinancialDesignedAreas (Posting / Payments / Responsibility / Subsidy stubs)
```

### Shared config runtime reused

`ConfigurationShell`, `ConfigWorkspaceCard`, Continuity soft-nav, `ConfigReadinessCard`, `ConfigScopeSelector` — Programs/Locations grammar on the **shell**; chapter interiors remain Commercial-era grids/forms.

---

## C. Current data ownership

### Tuition definitions

- **Table:** `commercial_tuition_rates`
- **Key:** `variant_id` × `cadence_key` × `payer_type` × `location_id` (null = org default)
- **Owner:** Commercial config APIs (`/api/admin/commercial/tuition-rates`)
- **Lib:** `web/lib/commercial/tuitionRates.ts`

### Rates (parallel substrate)

- **Commercial matrix:** `commercial_tuition_rates` (operator Tuition chapter)
- **Substrate A:** `childcare_rate_plans` + `childcare_rate_rules` (engine `/settings/financials`; schedule_basis; optional room scope)

### Fees / catalog

- **Canonical:** `commercial_products` (`commercial_type` ∈ fee \| addon \| deposit)
- **Legacy still writable:** `commercial_fees`, `commercial_addons`, `commercial_deposits`

### Discounts

- Commercial: `commercial_policies` (`discount`, `sibling_discount`, …)
- Jobs vertical: `discount_programs*` / `discounts` — separate stack

### Effective dates

- Columns on rates, products, policies, offerings, rate plans/rules (`effective_start` / `effective_end`)

### Program relationships

```
programs / location_program_categories.program_key
  → program_offerings
    → program_offering_variants
      → commercial_tuition_rates.variant_id
```

Rates do **not** FK programs directly. Programs owns offerings/variants; Commercial owns rates.

### Location overrides

- Rate row `location_id` (null inherit / non-null override). Client resolve in `buildTuitionRateMap`.

### Schedule relationships

- **Commercial tuition:** no FK to `schedule_patterns`. Axes are **variant × cadence**.
- **Substrate A:** `schedule_patterns` → `schedule_basis` in charge resolution code only.
- Simulator UI copy still says “Program · offering · schedule · cadence”.

### Room relationships

- Commercial doctrine: **rates do not touch rooms** (`docs/platform/commercial/ownership-model.md`).
- Substrate A: optional `childcare_rate_plans.room_location_id` → `locations`.

### Funding / subsidy

- No `funding_*` / `subsidy_*` tables.
- `payer_type` on tuition rates; charge category `subsidy_offset`; pure execution `attribute()` in `web/lib/commercial/execution/funding.ts`.
- Funding chapter = Processing boundary copy only.

---

## D. Existing schema objects and APIs

### Primary commercial schema

`commercial_tuition_rates`, `commercial_products`, `commercial_categories`, `commercial_revenue_categories`, `commercial_policies`, transitional `commercial_fees|addons|deposits`, `program_offerings`, `program_offering_variants`, billing cadences via `option_sets` (`commercial_billing_cadence`).

### Engine / substrate A

`financial_services`, `childcare_rate_plans`, `childcare_rate_rules`, `financial_charge_templates`, `financial_policies`, `gl_accounts`, `gl_account_mappings`.

### Jobs pricing dimensions (out of childcare org Financials IA)

`pricing_dimensions`, `pricing_dimension_values`, `pricing_matrix`, …

### Key APIs

| Concern | Route family |
|---------|----------------|
| Tuition | `/api/admin/commercial/tuition-rates` |
| Products / catalog | `/api/admin/commercial/products` (+ legacy fees/addons/deposits) |
| Policies | `/api/admin/commercial/policies` |
| Cadences | `/api/admin/commercial/billing-cadences` (read) |
| Execution preview | `/api/admin/commercial/execution/preview` |
| Rate plans / rules | `/api/admin/financial/rate-plans`, `rate-rules`, … |
| Charge templates / services / GL | `/api/admin/financial/*` |

---

## E. Product screenshots

### Fresh authenticated localhost:3012 (this session)

Auth: `qa-slot2-architecture@example.com` · slot 2 storage valid  
Dir: `.alloy-agent-evidence/financials-phase3-discovery/localhost-3012/`

| File | Shows |
|------|--------|
| `01-financials-landing.png` | Tile hub — 6 section cards (Tuition…Funding) |
| `02-financials-tuition.png` | Tuition Grid; Readiness 2 configured / 103 missing; Edit + Compare Locations; Offering/Variant × cadences |
| `03-financials-catalog.png` | “Commercial Catalog” empty — 0 items; + Add item |
| `04–07-*.png` | Policies / Accounting / Simulator / Funding chapters |
| `08-settings-financials-engine.png` | Parallel engine IA: What you sell / Money rules / Money movement / Who pays / Runtime |
| `09-programs-reference.png` | Programs collection master-detail (contrast reference) |
| `10-locations-reference.png` | Locations collection (contrast reference) |

**Observed on live Tuition:** readiness counts (not % label in this capture but readiness card present); inheritance copy; dense matrix; BOS still offers “unpublished changes.”  
**Catalog:** still labeled **Commercial Catalog**.  
**Engine `/settings/financials`:** separate technical IA (Services, Rate Plans, Charge Templates, Draft Obligations, Subsidy stub).

### Prior lineage evidence (PR #234)

Also under `screenshots-from-org-runtime-lineage/` (pre-session copies).

---

## F. Current interaction problems

1. **Not Programs/Locations master-detail** — Landing tiles → chapter URL hops (`router.push`); interior is tabbed tool panels, not collection → selected object → focused workspace.
2. **Tuition = dense editable matrix** with readiness percentage — configuration-engine feel.
3. **Dual IA** — `/organization/financials` (product) vs `/settings/financials` (engine) vs legacy-admin pricing.
4. **Live-on-save** for Tuition cells, but chrome/BOS still speaks publication / unpublished.
5. **“Commercial” vocabulary** still on panels (Commercial simulator, commercial products, commercial policies).
6. **Orphans:** `CommercialHubShell`, stale eligibility docs citing `/settings/commercial`, subsidy/corporate payer tabs hard-disabled.
7. **Simulator / Funding** are utility/boundary, not authoring collections — mixed into same chapter chrome.

---

## G. Operator-facing terminology (exposed today)

- Financials, Tuition, Catalog, Policies, Accounting, Simulator, Funding  
- Organization default / Location override / Inherited  
- Offering / Variant, billing cadences (Weekly…Per Session)  
- Readiness — N%  
- Fees, add-ons, deposits, commercial products  
- Commercial policies / Commercial simulator  
- Revenue categories / GL mapping  
- “Funding is managed in Processing”  
- Engine surface: Rate Plans, Charge Templates, Draft Obligations, Services, Consumption  
- BOS chips: unpublished changes, publication (mismatch with live-on-save)

---

## H. Canonical docs / decisions

| Doc | Role |
|-----|------|
| `docs/platform/commercial/commercial-platform-v1.md` | Frozen Commercial V1 |
| `docs/platform/commercial/ownership-model.md` | Per-table ownership; rooms future; products primitive |
| `docs/platform/commercial/program-offerings.md` | Offerings / variants |
| `docs/platform/modules/commercial-configuration.md` | Compatibility runtime (**schema section stale**: still says program_key × schedule_key) |
| `docs/platform/modules/financial-platform-domain.md` | Domain entities; subsidy as Third-Party Payer (planned) |
| `docs/platform/modules/billing-financials-platform.md` | L5 billing / rate-charge as-built |
| `docs/platform/core/commercial-operating-model.md` | Commitment vs transaction |
| `docs/platform/core/commercial-execution-platform.md` | Config → resolution (notes billing now prices from Commercial Execution) |
| `docs/system/configuration-ownership-doctrine.md` | Org/Programs/Locations ownership |

---

## I. Known duplicate / conflicting models

| Parallel | Notes |
|----------|--------|
| `commercial_tuition_rates` vs `childcare_rate_plans/rules` | Two pricing substrates; preview docs warn amounts match only if both configured consistently (execution now prefers Commercial for obligation amounts) |
| `commercial_products` vs legacy fee/addon/deposit tables | Products SoT; legacy APIs remain |
| `commercial_policies` vs `financial_policies` | Overlapping policy ideas, different scopes |
| Jobs `pricing_*` / `discount_programs` vs childcare commercial | Separate vertical |
| Dual UIs | Org Financials chapters vs `/settings/financials` engine |
| Stale docs / adapters | `commercial-configuration.md` schedule_key model; `resolveEnrollmentTuitionRate.ts` still typed program_key × schedule_key |

---

## J. Test coverage (representative)

- `web/tests/commercial/tuitionRates.test.ts` — grid map, inheritance, readiness  
- `web/tests/commercial/commercialProducts*.test.ts` — product primitive + backfill  
- `web/tests/commercial/commercialPolicy*.test.ts`, `commercialFunding.test.ts`, execution/preview/export suites  
- `web/tests/adminV2/financialConfigConvergence.test.ts` — engine IA groups  
- `web/tests/configPublication/financialsCanonicalRoutingContainment.test.ts`  
- `web/tests/financials/rates/*`, chargeResolution/*, financialServices*  
- `web/tests/adminV2/runtime/resolveEnrollmentTuitionRate.test.ts` — legacy adapter shape  
- `web/tests/pricing/jobPricing.smoke.test.ts` — jobs vertical  

---

## K. Recommended first product-realization slice (not implementing)

**Tuition chapter only — presentation + interaction grammar**, without schema/model collapse:

1. Align Tuition to Programs/Locations interaction law: collection context → selected scope/object → focused edit (org default vs location), no readiness %, no commercial-engine chrome.
2. Keep `commercial_tuition_rates` + variant × cadence as the data spine (frozen V1).
3. Do **not** yet: activate Dimensions, rewrite Commercial, connect Billing, merge Substrate A, build Funding authoring, touch Programs/Locations.

Requires product decisions in §L before build.

---

## L. Questions requiring product decisions

1. **Primary object for Tuition workspace** — Program? Offering? Location? Org-wide matrix? (Today: org/location scope × offering/variant × cadence grid.)
2. **Keep dual substrates** — retire/hide `/settings/financials` Substrate A from operators, or keep as advanced/engine?
3. **Cadence set** — which cadences are first-class for operators vs hidden advanced?
4. **Location override UX** — Compare Locations vs master-detail location picker (Programs grammar)?
5. **Fees/Catalog** — same slice as Tuition or later? Product primitive vs “Fees” language?
6. **Policies / discounts** — stay in Financials or separate? Sibling discount first-class?
7. **Funding / subsidy** — remain Processing-only boundary, or light Financials surface?
8. **Simulator** — keep, relocate, or drop from config IA?
9. **Schedule Patterns relationship** — remain commercial-agnostic (variant×cadence only), or product wants schedule-aware tuition?
10. **Rooms** — confirm still out of scope for tuition pricing?
11. **Effective dating** — operator-visible versioning vs simple current rate?
12. **Live-on-save vs intentional edit gate** — match Programs edit gate without draft/publish language?
13. **Terminology** — drop “Commercial”, “Variant”, “Readiness”, “Cadence” for operator copy?

---

## M. Confirmation

- No Financials redesign, Tuition screens, schema migrations, Dimensions activation, Commercial rewrite, Billing connection, or Programs/Locations modifications were started.
- Worktree remains clean at staging base `2c8dc2f6c` aside from this discovery evidence folder.
- Fresh authenticated screenshots on `http://localhost:3012` pending free server slot (pause one of slots 1 / 3 / 5).
