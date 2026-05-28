# Forms MVP Productization

**Path:** `docs/sprints/05_2026/forms_mvp_productization.md`  
**Date:** May 2026  
**Status:** Card 0 audit complete · **Cards 1–2 shipped** · Cards 3–6 pending human review gate  
**Scope:** Move Forms from working infrastructure toward a viable MVP module — operational workflow builder, not runtime configuration.

**Related:**

| Topic | Document |
|-------|----------|
| Intake case + outcome model | [`forms_intake_case_operational_model.md`](./forms_intake_case_operational_model.md) |
| Enrollment lifecycle coherence | [`enrollment_intake_lifecycle_coherence.md`](./enrollment_intake_lifecycle_coherence.md) |
| Prefill doctrine | [`docs/system/forms-intake-prefill-doctrine.md`](../../system/forms-intake-prefill-doctrine.md) |
| Operational workspace (OW) | [`forms_operational_workspace_redesign.md`](./forms_operational_workspace_redesign.md) |
| Product | [`docs/product/documents-and-forms.md`](../../product/documents-and-forms.md) |

---

## 1. Current state / audit findings (Card 0 — May 2026)

Evidence: code walkthrough + enrollment lead / lifecycle QA gates (`qaEnrollmentLeadOpportunityProof.ts`, `qaEnrollmentIntakeLifecycleCoherence.ts`).

### Form detail UX (pre–Card 1)

| Area | Finding |
|------|---------|
| Lifecycle rail | Build → Publish → Share → Responses — good direction but split across panels |
| Intent | **Inferred only** from link metadata — no picker |
| Outcome | Editable but technical toggles exposed |
| Share | Duplicate entry points (header Create link + share section) |
| Infrastructure | Link selector, token prefix, runtime mismatch on happy path |

### Backend readiness (unchanged architecture)

| Path | Backend | Operator UI (pre–Card 3) |
|------|---------|--------------------------|
| New lead capture | Shipped | Demo + manual outcome config |
| Existing-record / prefill | API + server prefill | **Not built** |
| Packet send-and-fill | Opportunity drawer E2E | Form detail placeholder |
| Inline field tokens | Not built | Not built |

### Lifecycle coherence baseline (do not regress)

- New lead → `new_inquiry` → New Leads queue (IC-8)
- Intake workspace / quick review / drawer intake source alignment
- Opportunity activity includes form events
- QA gates pass on main branch

---

## 2. Product doctrine

| Layer | Role |
|-------|------|
| Form definition | Reusable schema/template |
| Distribution / public link | Runtime context + outcome config |
| Submission | Evidence / artifact |
| Intake case (derived) | Operator-facing situation |
| Opportunity | Business lifecycle record |
| Workflow | Automation layer |
| Queue / work unit | Operational execution surface |

Operators should understand:

- What is this form for?
- What happens after submit?
- Who receives it?
- Where does the response go?
- What does staff do next?

They should **not** need to understand runtime links, orchestration flags, metadata keys, or distribution internals on the happy path.

---

## 3. MVP UX principles

1. **Intent-first setup** — selectable operational purpose drives defaults.
2. **Outcome preview before share** — “After submission” bullets in plain language.
3. **Single share surface** — Open form / Copy link / Get share link in setup region.
4. **Advanced secondary** — multi-link management, token prefix, outcome toggles behind disclosures.
5. **No engine rewrite** — templates write existing `form_definitions.metadata` + `form_public_links.metadata`.
6. **Preserve proof paths** — enrollment lead demo inference when `intake_intent` unset.

---

## 4. Cards

### Card 0 — Audit ✅

See §1. No implementation in Card 0 pass.

---

### Card 1 — Operational Intent Templates ✅ (May 2026)

**Shipped:**

- Selectable **“What is this form used for?”** picker on form detail setup region.
- Six intents: enrollment lead, existing family, operational document, waitlist, packet step, custom (advanced).
- Stored on `form_definitions.metadata.intake_intent` (JSONB — no migration).
- Non-custom intents apply link metadata defaults via existing PATCH public-link route.
- Form-level `intake_outcome` + legacy `intake_purpose` preserved for enrollment lead.
- Inferred types preserved when intent unset (demo enrollment lead form key).

**Files changed:**

| File | Change |
|------|--------|
| `web/lib/forms/operationalIntentTemplates.ts` | Intent catalog, metadata applier, after-submit preview |
| `web/lib/forms/inferIntakeType.ts` | Extracted shared intake type inference |
| `web/lib/forms/intakeRuntimeOrchestrationPresentation.ts` | Prefer stored intent; updated step keys |
| `web/components/forms/admin/FormOperationalIntentPicker.tsx` | Intent picker UI |
| `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx` | Wired picker |
| `web/app/admin/forms/[formId]/FormDetailClient.tsx` | Metadata update handler, lifecycle inputs |
| `web/tests/forms/operationalIntentTemplates.test.ts` | Unit tests |

**Tests run:** `operationalIntentTemplates.test.ts`, `intakeRuntimeOrchestrationPresentation.test.ts`

**Remaining gaps:**

- Intent templates do not auto-fill work unit / department UUIDs (operators set in advanced outcome editor or demo seeds).
- Existing-family intent sets link flags but **Card 3** send UI not built yet.

---

### Card 2 — Simplified Setup Sequence ✅ (May 2026)

**Shipped:**

- Setup region renamed **“Setup this form”** with operator sequence: Purpose → After submit → Share → Test.
- **After submission** preview block (static intent copy or live outcome story bullets).
- Share consolidated: **Get share link**, **Open form**, **Copy link** in setup panel.
- Header **Create link** removed; link management in **Manage all share links** disclosure.
- Lifecycle rail labels: Share form, Review responses, Continue workflow.
- Runtime mismatch + token prefix behind **Advanced link settings** disclosure.
- Multi-link selector only when >1 operational link.

**Files changed:**

| File | Change |
|------|--------|
| `web/lib/forms/formLifecyclePresentation.ts` | Operator step labels + intent/outcome-aware hints |
| `web/components/forms/workspace/FormLifecycleWorkspaceLayout.tsx` | Share consolidation, setup wiring |
| `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx` | Card 2 UX |
| `web/components/forms/admin/FormOutcomeConfigPanel.tsx` | Copy alignment |
| `web/tests/forms/formDetailLifecycleWorkspace.test.tsx` | Updated expectations |

**Tests run:** `formDetailLifecycleWorkspace.test.tsx`, orchestration + intent tests (13 total passing)

**Remaining gaps:**

- Publish step still visible in rail (required technically; not in operator mental model verbatim).
- Outcome editor still exposes technical toggles in edit mode (acceptable for advanced; could further collapse).

---

### Card 3 — Existing Record / Prefilled Path ⏳ (ready after review)

**Required:** Send form to opportunity/family; prefill; attach; no duplicate lead; drawer/activity coherence.

**Backend exists:** `launch_from_entity`, `form_context_mode: existing_record`, prefill hydration, dedup attach.

**Build next:** Operator UI from form detail and/or opportunity drawer; intake copy “Existing family update received”.

---

### Card 4 — Iframe / Packet Send-and-Fill ⏳

**Required:** Coherent send/fill; context visible; form detail acknowledges packet path (not “coming soon”).

---

### Card 5 — FD-15 Rich Text Inline Field Tokens ⏳

**Required:** `{{field_id}}` parser, authoring chips, runtime resolution, missing-value highlight.

---

### Card 6 — MVP Closeout ⏳

Run full QA checklist (§6) after Cards 3–5.

---

## 5. Guardrails

- No forms engine rebuild
- No persisted `intake_cases`
- Keep distribution-link architecture
- Hide runtime/link concepts on happy path
- Do not loosen child/member review safety (IC-4)
- No AI automation in this sprint
- Do not regress `new_inquiry` queue routing or enrollment lead proof

---

## 6. QA checklist (Card 6)

### Lead capture

- [x] Enrollment lead intent template selectable (Card 1)
- [ ] Submit creates opportunity with correct status + work unit (needs manual + QA script)
- [ ] Visible in New Leads queue
- [ ] Drawer intake source + activity agree

### Existing-record path

- [ ] Send form to opportunity with prefill
- [ ] Submit attaches without new lead
- [ ] Intake copy says family update

### Packet / send path

- [ ] Packet launch from opportunity works
- [ ] Form detail acknowledges packet membership
- [ ] Public fill attaches to session

### Inline tokens

- [ ] Author can insert tokens
- [ ] Preview resolves values
- [ ] Missing required values visible in review

### Operational coherence

- [ ] Quick review, drawer, intake workspace agree
- [x] No raw infrastructure language on primary setup path (Card 2)

### Stability gates

- [ ] `qaEnrollmentLeadOpportunityProof.ts` passes (run after review)
- [ ] `qaEnrollmentIntakeLifecycleCoherence.ts` passes (run after review)

---

## 7. Future phase / not now

- Full WYSIWYG document editor
- Persisted `intake_cases` table
- AI-driven form setup
- Expression language / conditional inline tokens
- Packet management overhaul
- Copy outcome settings across links
- OCR / document generation rewrite

---

## Recommended next card

**Card 3 — Existing Record / Prefilled Path** after human review confirms setup UX direction.

Intent template `existing_family` already applies link defaults; Card 3 wires the send/launch UI and proves attach + prefill end-to-end.

---

## Stop line

**Cards 1–2 shipped.** Await human review before Cards 3–5.

**Suggested commit message:**

```
Forms MVP: operational intent templates and simplified form setup sequence (Cards 1–2).
```
