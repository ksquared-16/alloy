# Alloy Services V1 — Implementation Notes & Deviations

**Implements:** `financial_experience_01_services_v1_blueprint.md` (the canonical Services UX blueprint) and `financial_experience_01_services.md` (the Operator Experience Specification).
**Posture:** the blueprint is the engineering drawing. Where implementation revealed a conflict with the **frozen** Commercial Model, the conflict is documented here rather than silently redesigned (per the implementation rule).

## What shipped

A mode-adaptive Service workspace inside the frozen Configuration Runtime shell — **Operate** (switchboard + connected relationship cards), **Author** (question-first), and **Activity** (honest change view). The obsolete Name/Type/Description form is gone.

**Backend (additive — no migration):**
- `lib/financials/services/serviceCapabilities.ts` — the switchboard model: six capabilities, per-rhythm defaults, billing-rhythm derivation from `service_type`, plain-language reads, high-consequence-off messages.
- `lib/financials/services/serviceValidation.ts` — operational validation (attention/advisory) computed from capabilities + relationship facts.
- `lib/financials/services/financialServicesStore.ts` — extended `FinancialService`/`FinancialServiceInput` with `capabilities` / `defaultChargeCategory` / `programs`, round-tripped through the existing `metadata` jsonb; create persists, update **merges** (partial edits never clobber).
- `app/api/admin/financial/services/route.ts` — create/update accept the switchboard/revenue/program fields.

**UI (the experience):**
- `ServicesConfigurationPanel.tsx` (rebuilt) — orchestrator: list ⇄ Operate ⇄ Author; empty/first-run + BOS seed proposal; validation glyphs on the list.
- `services/ServiceSwitchboard.tsx` — the six capability switches with named consequence confirmations.
- `services/ServiceRelationshipCards.tsx` — read-through Programs / Pricing (Rate Plans) / Charges / Revenue-home cards.
- `services/ServiceAuthorJourney.tsx` — question-first authoring composing answers into a Service.
- `services/ServiceOperateView.tsx` — the connected canvas (identity + switchboard + relationships + validation + Summary/Activity toggle).

**Seed:** demo services now carry capabilities, default revenue category, and program associations.

## Blueprint compliance

| Blueprint element | Status |
|---|---|
| Switchboard (6 capabilities, consequence confirmations) | ✅ implemented (stored in `metadata`) |
| Billing rhythm gates the capability set / pricing-vs-charges card | ✅ from `service_type` |
| Unit of sale ("how is this sold?") | ✅ existing `unit` column |
| Operate shape (connected relationship cards, read-through, single authoring homes) | ✅ |
| Author shape (question-first, composes into the same object) | ✅ |
| Operational validation (recurring-no-price, attendance-no-schedule, no-revenue-home) | ✅ |
| Empty / first-run + BOS seed proposal (propose-and-approve) | ✅ |
| Bend Pine / `config-typo-*` / frozen primitives only | ✅ no new design language |
| Activity / History "Schedule a change" version timeline | ⚠️ **deviation — see below** |

## Deviations (documented, not silent)

1. **No version timeline for Services (frozen-doctrine conflict).** The blueprint's Activity shape describes a "Schedule a change" supersede timeline (Current/Scheduled/Superseded/Retired). The frozen Commercial Model defines `financial_services` as a **non-versioned catalog** — the migration states *"A Service catalog is a list, NOT effective-dated truth — rate amounts remain the versioned objects."* There is no `effective_start/end` on the table. Implementing a supersede timeline would require a schema change that **contradicts frozen doctrine**, so Activity mode instead shows the honest change/audit the backend supports (status, added, last-updated) with a one-line explanation. **Recommendation:** if Services truly need versioned history, that is a domain-doctrine decision to revisit deliberately — not a UI change.

2. **Capabilities / default revenue category / program associations live in `metadata` jsonb (additive).** No migration; the catalog stays a list. Faithful to the experience; the only structural note is that these are JSON-stored config rather than first-class columns.

3. **Program associations are stored labels, not a catalog link.** No `program ↔ service` link table exists. The Programs card is real and editable (labels persisted in `metadata.programs`), but it does not yet pick from a canonical program catalog. **Recommendation:** wire to the real program source when one is exposed to Financials.

4. **The Object Queue is realized as an in-panel master list, not a separate 320px shell column.** The frozen page shell owns column geometry shared by every Financials section; the blueprint's list→detail altitudes are delivered inside the panel's Workspace (list ⇄ Operate). The experience (scan offerings → open one → operate) is unchanged.

5. **Capabilities are configured, not yet consumed cross-domain.** Toggling "Creates a schedule" stores the truth and drives disclosure/validation here; the schedule engine actually reading it is deferred (Operational Consumption), exactly as the spec defers live trigger wiring.

## Validation

- **Typecheck:** app + Services files — 0 errors.
- **Lint:** all new/changed files — clean.
- **Tests:** `serviceCapabilities` + `serviceValidation` + `financialServicesStore` (15) + `financialConfigConvergence` Services-V1 block — green; broader financials/config suites — 212 passing, no regressions.
- **Known pre-existing failures (not introduced here):** `tests/adminV2/bos/recommendations/*` and three `childcareOperational` schedule/read-model tests fail on the clean base too (stash-verified) — unrelated to Services.
