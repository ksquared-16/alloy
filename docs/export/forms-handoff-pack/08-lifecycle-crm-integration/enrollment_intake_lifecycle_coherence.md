# Enrollment Intake Lifecycle Coherence

**Path:** `docs/sprints/05_2026/enrollment_intake_lifecycle_coherence.md`  
**Date:** May 2026  
**Status:** Cards 0–4 implemented · manual browser validation pending  
**Scope:** Prove end-to-end enrollment lifecycle feels like one operational system — not a new forms sprint.

**Demo fixtures:** Demo Childcare Co · Enrollment Lead — Demo (`enrollment_lead_capture_demo`) · enrollment work unit `5ba90557-876d-4450-9c28-36beac6e83be`

**Related:** [`forms_intake_case_operational_model.md`](./forms_intake_case_operational_model.md) (IC-8), [`forms-intake-prefill-doctrine.md`](../../system/forms-intake-prefill-doctrine.md)

---

## Sprint goal

Validate and tighten:

**New lead intake → lead in pipeline → open drawer → review intake → continue enrollment → next step clear**

---

# Card 0 — Lifecycle audit (May 2026)

Traced Enrollment Lead — Demo submit through code + `qaEnrollmentLeadOpportunityProof.ts` gate.

## Trace matrix

| Step | What happens | Operator experience | Gap |
|------|----------------|---------------------|-----|
| **1. Public form submit** | `applyFormIntakeSafe` creates person/customer/opportunity; stamps submission meta; emits `form_submitted` + intake lifecycle events | Family completes embed; submission succeeds | None (IC-8 status fix applied) |
| **2. Submission metadata** | `intake_auto_operationalized: true`, `intake_resolution_path`, `opportunity_id` on row | — | Technical keys hidden from primary UI ✓ |
| **3. Opportunity row** | `status_key: new_inquiry`, `work_unit_id` set, `source: embed` | Lead exists in CRM | None after IC-8 |
| **4. New Leads queue** | Queue filters `new_inquiry` (+ legacy `new` compat) | Lead visible in enrollment pipeline | **Fixed IC-8** — was invisible when status was `new` |
| **5. Opportunity drawer** | Opens via `openDrawer({ type: "opportunities", id })` | Operator sees CRM record | **No intake source panel** — form provenance not surfaced in drawer header/overview |
| **6. Intake workspace row** | Case row in Recent; title `{guardian} — {form} intake`; subtitle `New lead created`; chips | Clear case-centric row | **View in pipeline** link missing on case rows (only Open lead + intake file) |
| **7. Quick Review** | Modal: captured line, operational line, routing, Open lead CTA | Mostly aligned | Auto-op next step says "Open lead" not "Continue enrollment"; review-required reason could be clearer for medication path |
| **8. Activity timeline** | Drawer loads `/api/admin/activity?entity_type=opportunities&entity_id=…` | Expects form/intake history | **Critical gap:** `form_submitted` / `intake_case_*` emit on `entity_type: form_submissions` — **never appear on opportunity activity** |
| **9. Available actions** | Registry actions on drawer + queue row | Status-dependent CRM actions | No explicit "View intake submission" action on opportunity |
| **10. Next workflow step** | Auto-op lead → Recent lane; no review queue | Operator must infer "contact family" | Drawer does not echo intake workspace "next step" language |

## What works

- Enrollment lead proof gate passes (`new_inquiry`, pipeline queue membership, workflow events emitted).
- Intake case grouping by `opportunity_id` with Open lead drawer path.
- Quick review prefers case context over stale submission meta (IC-5.6).
- Business-first form detail language (IC-8).
- Medication Authorization review-required path preserved (IC-4).

## What is confusing

1. **Activity timeline silence** — operator opens lead drawer, no "Enrollment Lead form submitted" event visible.
2. **Surface disagreement** — intake workspace says "New lead created · Auto-operationalized"; drawer status chip says "New Inquiry" (correct CRM key, different operator vocabulary).
3. **Pipeline navigation** — intake Recent row lacks direct "View in pipeline" (orchestration test panel has it; intake workspace does not).
4. **Next step ambiguity** — auto-operationalized leads show "Open lead" everywhere; enrollment operators expect "Continue enrollment" / contact family guidance.

## Where records disappear

- Not a data loss issue after IC-8 — leads were created but **queue-invisible** due to status key mismatch (resolved).
- **Activity events** effectively "disappear" from opportunity drawer because of entity_type scoping (form events on submission entity).

## Copy / lifecycle mismatches

| Surface | Copy | Issue |
|---------|------|-------|
| Queue status | "New Inquiry" | CRM-accurate; intake uses "New lead" |
| Quick review | "Routed to enrollment pipeline" | Good; drawer has no equivalent |
| Intake row CTA | "Open lead" | Good; missing pipeline deep link |
| Activity | "Intake Case Created" (humanized fallback) | No form name; events missing entirely today |

---

# Card 1 — Lead visibility and drawer continuity

**Goal:** Operator continues from the correct operational record immediately after intake.

| Acceptance | Status |
|------------|--------|
| Intake row Open lead | Shipped (IC-5.6) |
| New Leads queue same record | Shipped (IC-8) |
| Drawer intake context | **Shipped** — `OpportunityIntakeSourceSection` + `/api/admin/opportunities/[id]/intake-source` |
| Drawer confirms form source | **Shipped** |
| Next action: review/continue | **Shipped** — aligned copy across intake/quick review/drawer |
| Activity timeline form/intake event | **Shipped** — `loadOpportunityActivityEvents` merges related events |

---

# Card 2 — Intake review → lifecycle next step

| Path | Target primary action |
|------|----------------------|
| Auto-operationalized enrollment lead | Continue enrollment (opens lead drawer) |
| Review-required (medication / child member) | Review intake — explain why (child profile auto-create blocked auto-op) |

Quick Review and drawer language must agree. Lane updates visible after confirm-linkage / review actions.

---

# Card 3 — Existing-record / prefilled path audit

**Current support (no new schema):**

| Capability | Status |
|------------|--------|
| `form_context_mode: existing_record` on link metadata | Shipped — stamped to submission meta |
| `source_entity_type` / `source_entity_id` binding | Shipped in `formContextMode.ts` |
| `prefill_enabled` flag | Metadata only — entity hydration partial |
| Intake dedup attach (`attached_existing`) | Shipped in `applyFormIntakeSafe` |
| Dedup prevents duplicate opportunity | Shipped when match confident |
| Prefilled embed UX | **Not built** — launch context minting only |
| Operator "send form to existing family" flow | **Not built** — needs link mint with entity binding |

**Minimal build path (future):**

1. Mint public link with `existing_record` + `source_entity_id` (opportunity UUID) + `prefill_enabled: true`.
2. Embed URL includes token; draft create stamps launch context.
3. Submit attaches evidence; intake skips `auto_create_opportunity` when opportunity bound.
4. Intake workspace shows "Attached to existing family" not "New lead created".
5. Drawer intake source shows bound opportunity (same panel as Card 1).

**Do not build:** packet runtime, persisted `intake_cases`, full prefill field hydration.

---

# Card 4 — Lifecycle visual coherence

Shared vocabulary target:

- **Family name** — from `submissionFamilyLabel` / opportunity name
- **Status** — "New lead" in intake surfaces; "New Inquiry" acceptable in CRM status chip with subtitle
- **Source** — "{Form name} intake" everywhere
- **Next step** — single phrase per path (continue enrollment vs review intake)

Surfaces: intake workspace row, quick review, opportunity drawer intake source, New Leads queue row, activity timeline.

---

# Validation

```bash
cd web && npx tsx scripts/prepareDemoChildcareEnrollmentLeadIntakeTest.ts
cd web && npx tsx scripts/qaEnrollmentLeadOpportunityProof.ts
cd web && npx tsx scripts/qaEnrollmentIntakeLifecycleCoherence.ts   # this sprint
cd web && npm run test -- tests/admin/opportunityActivityTimelineFormat.test.ts tests/forms/intakeQuickReviewPresentation.test.ts
```

## Manual browser checklist

1. Submit Enrollment Lead — Demo embed.
2. Lead in Forms → Recent intake workspace.
3. Lead in Enrollment Pipeline → New Leads.
4. Open lead → drawer shows intake source (form name, submitted time).
5. Activity tab shows "Enrollment form submitted" + "Lead ready in pipeline" (or equivalent).
6. Quick review agrees with drawer (same family, same outcome line).
7. Medication Authorization still review-required with clear reason.
8. Card 3 prefilled direction documented above.

---

# Stop line

**Suggested commit:**

```
Enrollment intake lifecycle: merge form activity into opportunity drawer, intake source panel, and aligned next-step copy.
```
