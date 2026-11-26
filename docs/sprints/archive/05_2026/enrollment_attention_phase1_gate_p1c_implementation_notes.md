# Phase 1 — GATE P1-C: Implementation notes (explainability)

**Status:** Implemented per approved P1-B sequencing.  
**Design reference:** [`enrollment_attention_phase1_gate_p1b_explainability_design.md`](./enrollment_attention_phase1_gate_p1b_explainability_design.md)

**UX review package (screenshots + self-audit):** [`enrollment_attention_phase1_gate_p1c_ux_review_package.md`](./enrollment_attention_phase1_gate_p1c_ux_review_package.md) · PNGs in [`assets/p1c-review/`](./assets/p1c-review/).

---

## 1. Files changed (role summary)

| File | Role |
|------|------|
| `web/lib/admin/operationalAttentionEntityAttachment.ts` | **New.** Maps opportunity row → resolver input; runs `resolveOpportunityAttention` with `resolveOpportunityAttentionConfigFromMetadata(work_unit.metadata)`; returns `_operational_attention` / `_operational_attention_error`. |
| `web/lib/opportunities/operationalAttentionExplain.ts` | **New.** Deterministic copy: queue headline, waiting tokens, SLA phrases, timing/confidence wording, next-step templates (`nextStepGuidance`). |
| `web/lib/admin/opportunityEntityRecord.ts` | Attaches resolver snapshot on **`drawer_visible`**, **`drawer_initial`**, and **`full`** surfaces; extends `work_units` fetch to `department_id, metadata` for config parity with queue lanes. |
| `web/components/admin/drawer/OperationalAttentionDrawerPanel.tsx` | **New.** Client drawer UI: calm summary, next step, expandable factor list + advanced score breakdown, empty/error states, optional activity aux strip. |
| `web/lib/entityPresentation.ts` | Opportunities registry overview sections — **operational attention is not** a collapsible overview section (it renders inline under the header stack). |
| `web/components/admin/AdminEntityDrawer.tsx` | Injects **`OperationalAttentionDrawerPanel`** between inquiry/status header and **`EntityDrawerOverview`**; strips **`operational_attention`** from ordered overview sections so layout chrome stays coherent. |
| `web/lib/ui-v2/workspace-types.ts` | Adds optional **`operationalNextHint`** on `CrmCompactRowSemanticSlots`. |
| `web/lib/workspace/viewModels/enrollmentWorkUnitViewModel.ts` | Builds compressed queue headline + next hint via `buildQueueOperationalAttentionPresentation`. |
| `web/app/adminV2/workspace/dept/.../work-unit/.../page.tsx` | Same presentation for inline CRM-compact queue rows. |
| `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | Renders operational next line; softens activity-stale styling when operational headline present. |
| `web/app/adminV2/components/workspace/workspace.css` | `adminv2-ws-queue-preview-stale--muted-footnote` for calmer dual-signal rows. |
| `web/tests/opportunities/operationalAttentionExplain.test.ts` | **New.** Unit tests for queue presentation helper. |
| `docs/sprints/archive/05_2026/enrollment_operational_attention_v2_sprint.md` | Gate row → P1-C complete / review. |
| `web/app/dev/p1c-operational-attention-review/*` | **Dev-only** fixture gallery (`page.tsx` → `notFound` in production). |
| `web/playwright/tests/p1c-operational-attention-review.spec.ts` | Captures PNGs into `docs/sprints/archive/05_2026/assets/p1c-review/`. |
| `web/package.json` | Script `screenshots:p1c-review`. |
| `docs/sprints/archive/05_2026/enrollment_attention_phase1_gate_p1c_ux_review_package.md` | Screenshot index + self-review + audits. |
| `docs/sprints/archive/05_2026/assets/p1c-review/*.png` | **10** fixture screenshots (regenerate via `npm run screenshots:p1c-review`). |

---

## 2. Screenshots / examples

See **`assets/p1c-review/`** and [`enrollment_attention_phase1_gate_p1c_ux_review_package.md`](./enrollment_attention_phase1_gate_p1c_ux_review_package.md).

**Integration note:** Gallery PNGs are **fixture-driven states** for spacing/copy/stress review (`/dev/p1c-operational-attention-review`). They are **not** the final standalone “attention card” product grammar — production UX is **embedded**: dept lane tiles, work-unit CRM rows, and drawer explainability per [`enrollment_operational_attention_v2_sprint.md`](./enrollment_operational_attention_v2_sprint.md) integration alignment.

Supplement with **live AdminV2** captures on seeded data if reviewers want full-route parity beyond fixtures.

---

## 3. Operational rationale

- **Information hierarchy:** Resolver JSON stays authoritative; UI reads **`_operational_attention`** in the drawer and **`_attention_*`** fields on queue rows—no client-side recomputation of rules.
- **Collapsed vs expanded:** Default shows primary factor, SLA rollup (worst tier among reasons), ownership/waiting line, and **one** deterministic **Next** card. Factor list and numeric breakdown are opt-in to limit fatigue.
- **Cognitive load:** Queue row adds **one** compressed headline and an optional **Next:** hint; activity stale is visually **muted** when operational headline exists so two signals do not compete at equal weight.

---

## 4. Performance notes

- **Resolver:** One synchronous `resolveOpportunityAttention` per opportunity entity response (visible / initial / full surfaces). Cost is small vs existing drawer enrichment; no batch/caching layer added.
- **DB:** Single extra column fetch on existing `work_units` lookup (`metadata`)—no new round trips.
- **Render:** Drawer panel is a lightweight client component; advanced breakdown gated behind disclosure.

---

## 5. Remaining UX gaps (future)

- **Phase 2 polish:** Row-level urgency mapped from `_attention_severity` (today lane `urgencyTier` remains queue-meta driven).
- **Activity resolver bridge:** Entity GET still passes `optionalSignals: null`; auxiliary activity stale in drawer will populate only when server wires workflow activity into resolver input (per P1-B activity strip).
- **Department metadata fallback** for config when `work_unit_id` is null—still deferred (P1-B open question).
- **Localization** of template strings.
- **AI overlays / analytics:** Explicitly out of scope.

---

## 6. Risks / tradeoffs

- **Queue density:** Next-hint line adds one optional row; mitigated by small type and only when resolver enrichment is present.
- **Long reason lists:** Drawer lists all factors; rare edge cases with many codes may scroll—acceptable until taxonomy grows.
- **Narrow width:** Drawer stacks naturally; long labels rely on browser wrapping (QA on small breakpoints).
- **Config edge cases:** Opportunities without `work_unit_id` use **platform defaults** for attention config (same as lanes without work-unit metadata).
- **Timing confidence:** Low/medium copy avoids false precision; explicit wait timestamps still abstracted into phrases, not raw ISO in the default surface.

---

## Backend contract (delivered)

- **`_operational_attention`:** Full `OpportunityAttentionResult` from resolver v2.
- **`_operational_attention_error`:** Populated only when resolver throws (unexpected); drawer shows a calm error panel.
