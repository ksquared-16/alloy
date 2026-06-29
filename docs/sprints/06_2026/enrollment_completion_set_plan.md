# Enrollment Completion Set — Planning

**Status:** Plan (June 2026). Sequencing for the cards that finish Enrollment as the
reference operating experience, **after** Experience Builder proves the Core Four.

**Builds on:** Composition Engine V1 + the Core Four (Household, Children, Readiness,
Current Work), all shipped on `staging`.
**Doctrine:** [`card-composition-system.md`](../../platform/operator/card-composition-system.md) ·
[`operational-depth-doctrine.md`](../../platform/operator/operational-depth-doctrine.md) ·
[`card-interaction-expansion-doctrine.md`](../../platform/operator/card-interaction-expansion-doctrine.md).

> **No new primitives, no new architecture.** Every card here is a Universal Card
> answering one operational question, composed by the existing engine, descending
> through the existing three depths. This doc only sequences *which* cards and
> *what each needs* — it does not redesign the runtime.

---

## 1. Anatomy of a completion-set card

Each new card is the same four artifacts the Core Four already have. A card is "done"
when all four exist:

| Artifact | Where | Core-Four reference |
|----------|-------|---------------------|
| **Evidence builder** | `web/lib/adminV2/runtime/focusPanel/<card>/build<Card>CardEvidence.ts` | `children/buildChildrenCardEvidence.ts` |
| **Card component** | `web/components/admin/focusPanel/cards/<Card>Card.tsx` | `cards/ChildrenCard.tsx` |
| **Composition preference** | entry in `cardCompositionModel.ts` | `household`, `children`, … |
| **Catalog entry** | `focusPanelCardCatalog.ts` (so Experience Builder can place it) | `{ label, cardKey }` |

A card consumes **Operational Context only** — never the drawer view model. When the
card needs facts the Operational Context doesn't yet carry (placement, medical,
billing preview), that is a **backend/context dependency**, called out per card below.

---

## 2. The completion set

Status legend: ✅ exists · 🟡 partial (model or key only) · ❌ to build.
Depth ceiling per [`operational-depth-doctrine.md`](../../platform/operator/operational-depth-doctrine.md).

| Card | Question | Card key | Truth / Diagnostic | Depth ceiling | Weight | Today | Largest gap |
|------|----------|----------|--------------------|---------------|--------|-------|-------------|
| **Placement** | Where does this child belong operationally? | `placement` ❌ | Truth (owns + edits) | **Focus** (+Edit) | Heavy | ❌ no key | New key + evidence + context facts |
| **Health & Safety** | Can this child safely attend? | `health_safety` ❌ | Truth (owns + edits) | **Focus** (+Edit) | Medium→Heavy | ❌ no key | New key (collides with `health`, see §3) |
| **Communications** | What communication matters right now? | `communications` 🟡 | Truth | **Workspace** | Heavy | 🟡 key + pref; no component | Component over existing embedded workspace |
| **Documents & Forms** | What paperwork exists / is still required? | `documents` 🟡 | Truth | **Workspace** | Medium | 🟡 key + pref; no component | Component + document-review workspace |
| **Tour** | Where are we in the tour process? | `tour_summary` 🟡 | Diagnostic | **Evidence** | Light | 🟡 model built; no component | Component |
| **Billing Preview** | What will this family pay? (operational, not accounting) | `billing_preview` ❌ | Diagnostic→Workspace | **Workspace** | Medium | ❌ catalogued null | New key + preview context facts |
| **KPI / Enrollment Health** | How healthy is this enrollment? | `health` (Enrollment Health) / `readiness_kpi` 🟡 | Diagnostic | **Evidence** | Medium | 🟡 model built | Component; integrate existing KPI architecture |
| **Timeline** | What happened? | `timeline` 🟡 | Diagnostic | **Workspace** | Heavy | 🟡 model built; no component | **Activity sprint** (see §4) |
| **Notes** | What should another operator know? | `notes` 🟡 | Diagnostic | **Evidence** | Medium | 🟡 key only | **Activity sprint** (see §4) |

---

## 3. Naming collision to resolve first

The runtime key `health` currently means **Enrollment Health** — the *diagnostic KPI*
("how healthy is this enrollment?", catalog label "Enrollment Health", model at
`deriveOpportunityFocusPanelCards.ts`). The brief's **Health & Safety** is a different
card — *truth-owning medical facts* ("can this child safely attend?": allergies,
immunizations, medications, care plans).

**Decision required before building either:** keep `health` = Enrollment Health KPI
(diagnostic, Evidence ceiling) and introduce a new `health_safety` = medical truth
(truth-owning, Focus + Edit). Do **not** overload one key — they have opposite depth
ceilings and opposite edit rights, and the canvas clamp depends on the distinction.
Add `health_safety` to `OPERATIONAL_TRUTH_CARDS` in `focusPanelCoordination.ts`;
leave `health`/`readiness_kpi` out of it.

---

## 4. Scope boundary — what belongs to the Activity sprint

The brief is explicit: **Activity is a separate sprint** composed of Timeline, Notes,
Documents (review), Workflow History, and Audit. **Communications intentionally stays
in Work** because communication is operational work.

This completion-set sprint therefore **builds**: Placement, Health & Safety,
Communications, Documents & Forms (the in-Work "what's required" answer), Tour,
Billing Preview, KPI/Enrollment Health. It **defers** Timeline and Notes to Activity
(their models exist; their components land with Activity). Documents appears in both:
the **in-Work card** here; the **document-review workspace** with Activity.

---

## 5. Build phases

Each phase is independently shippable and proves something. Cards within a phase are
parallelizable; phases are ordered by operational value and dependency.

### Phase E1 — Enrollment truth (highest value)
**Placement** + **Health & Safety.** These are the two questions Enrollment exists to
answer ("where does the child go" / "can they safely attend"), both **truth-owning
Focus + Edit cards** — so they exercise the live-editing path (#4) end to end.
- Resolve the `health` / `health_safety` collision (§3) first.
- Backend dependency: Operational Context must carry placement facts (program/room/
  schedule/teacher/location/desired start/waitlist) and medical facts. Audit what the
  composed subject payload already exposes before building evidence builders.

### Phase E2 — Operational work cards
**Communications** (Work) + **Documents & Forms** + **Tour.** All three have keys
and/or models already; the work is the component + evidence builder. Communications
descends to **Workspace** over the existing embedded workspace component; Tour is a
**diagnostic** card capped at Evidence.

### Phase E3 — Preview + intelligence
**Billing Preview** + **KPI / Enrollment Health.** Billing Preview is operational
("what will they pay"), not accounting — Evidence→Workspace handing off to the billing
workspace; needs preview facts in context. KPI integrates the **existing** Operational
Intelligence / analytics architecture into the card language — do not redesign KPI;
bind a metric (see the catalog note "Bind an Operational Intelligence metric").

### Activity sprint (separate, per brief)
**Timeline** + **Notes** (+ Workflow History + Audit). Models exist; components land
with Activity.

---

## 6. Per-card composition + depth defaults (proposed)

Starting points for `cardCompositionModel.ts` (a Surface Definition may override any).
Existing entries (`communications`, `documents`, `tour_summary`, `readiness_kpi`,
`health`) are already declared — listed here for completeness.

| Card | weight | preferredRow | min–max | perspectiveExpansion (= depth) | maxDepth |
|------|--------|--------------|---------|--------------------------------|----------|
| Placement | heavy | lead | 2–full | `takeover_row` | Focus |
| Health & Safety | medium | support | 1–2 | `takeover_row` | Focus |
| Communications *(exists)* | heavy | context | 2–full | `takeover_row` | Workspace |
| Documents *(exists)* | medium | context | 1–2 | `in_place` → `takeover_surface` for review | Workspace |
| Tour *(exists)* | light | support | 1–1 | `in_place` | Evidence |
| Billing Preview | medium | support | 1–2 | `takeover_surface` | Workspace |
| Enrollment Health / KPI *(exists)* | medium | support | 1–2 | `in_place` | Evidence |

---

## 7. Definition of done (per card)

1. Evidence builder consumes Operational Context only; returns the card's compact +
   evidence content. Unit tested.
2. Card component renders compact → Evidence; truth cards also Focus (+Edit); honors
   the canvas invariant (base never moves).
3. Composition preference declared; depth ceiling matches §6 and the canvas clamp.
4. Catalog entry added so Experience Builder can place + configure it (#6).
5. Diagnostic cards hand off to the owning truth card rather than elevating.

---

## 8. Open dependencies (track before building)

- **Operational Context coverage** for placement, medical, and billing-preview facts —
  the gating dependency for Phases E1 and E3. Audit the composed subject payload first.
- **`health` / `health_safety` decision** (§3) — gates Phase E1.
- **Live editing path (#4)** — Placement + Health & Safety are the first cards to write
  truth; they must land *after* the mutation/workflow/audit path is wired.
- **KPI architecture** — integrate the existing analytics platform; do not rebuild it.
