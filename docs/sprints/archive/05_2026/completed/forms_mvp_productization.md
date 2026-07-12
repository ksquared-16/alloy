# Forms MVP Productization

**Path:** `docs/sprints/archive/05_2026/completed/forms_mvp_productization.md`  
**Date:** May 2026  
**Status:** **CLOSED** — Cards 0–6 complete · Forms MVP productization shipped for operator review  
**Scope:** Move Forms from working infrastructure toward a viable MVP module — operational workflow builder, not runtime configuration.

**Related:**

| Topic | Document |
|-------|----------|
| Intake case + outcome model | [`forms_intake_case_operational_model.md`](./forms_intake_case_operational_model.md) |
| Enrollment lifecycle coherence | [`enrollment_intake_lifecycle_coherence.md`](./enrollment_intake_lifecycle_coherence.md) |
| Prefill doctrine | [`docs/system/forms-intake-prefill-doctrine.md`](../../system/forms-intake-prefill-doctrine.md) |
| Operational workspace (OW) | [`forms_operational_workspace_redesign.md`](./forms_operational_workspace_redesign.md) |
| Product | [`docs/product/documents-and-forms.md`](../../platform/modules/documents-and-forms.md) |

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

### Card 3 — Existing Record / Prefilled Path ✅ (May 2026)

**Shipped:**

- **Attach intake metadata** on `launch_from_entity` — intake enabled, `auto_create_opportunity: false`, prefill on (replaces prefill-only default).
- **`prefill_only: true`** on `launch_from_entity` preserves legacy prefill-only links.
- **`mintExistingRecordFormLinkForAdmin`** + `mergeExistingRecordLaunchMetadata` — shared mint path for form detail + drawer.
- **`POST /api/admin/opportunities/[id]/form-send`** — send any form to an opportunity with attach + prefill defaults.
- **Form detail:** `FormExistingRecordSendPanel` — search inquiry, attach preview, Send form / Open / Copy.
- **Opportunity drawer:** `Send form` header action + intake source link + `SendFormToOpportunityModal` (form picker).
- **Intake attach semantics:** `applyFormIntakeSafe` marks `attached_existing` when opportunity pre-stamped; no duplicate create.
- **Copy alignment:** Quick review + intake case subtitle → **“Existing family update received”**.

**Files changed:**

| File | Change |
|------|--------|
| `web/lib/forms/existingRecord/existingRecordFormLaunch.ts` | Attach metadata merge + attach preview |
| `web/lib/forms/existingRecord/mintExistingRecordFormLinkForAdmin.ts` | Shared link mint |
| `web/app/api/admin/forms/[formId]/public-links/route.ts` | launch_from_entity → attach mint |
| `web/app/api/admin/opportunities/[id]/form-send/route.ts` | Drawer send API |
| `web/lib/forms/intake/applyFormIntakeSafe.ts` | Pre-stamped opportunity attach |
| `web/app/api/public/forms/.../submit/route.ts` | existing_record_launch meta |
| `web/components/forms/admin/FormExistingRecordSendPanel.tsx` | Form detail send UI |
| `web/components/admin/opportunity/SendFormToOpportunityModal.tsx` | Drawer send UI |
| `web/components/admin/opportunity/OpportunityIntakeSourceSection.tsx` | Send form action |
| `web/components/admin/AdminEntityDrawer.tsx` | Wire drawer modal + header |
| `web/components/forms/workspace/FormLifecycleWorkspaceLayout.tsx` | Form detail panel |
| Presentation | `intakeQuickReviewPresentation.ts`, `intakeCasePresentation.ts` |
| Tests | `existingRecordFormLaunch.test.ts`, `formsAdminRoutes.test.ts`, quick review test |

**Tests run:**

- `tests/forms/existingRecordFormLaunch.test.ts` ✅
- `tests/admin/formsAdminRoutes.test.ts` (launch_from_entity attach + prefill_only) ✅
- `tests/forms/intakeQuickReviewPresentation.test.ts` ✅

**Remaining gaps:**

- No email send from standalone form send (copy/open only — same as MVP scope).
- Prefill map is opportunity-default; forms with nonstandard field ids need definition-level `prefill_field_map`.
- Person/customer launch (non-opportunity) supported in API but not in form-detail search UI yet.
- Manual browser proof on Demo Childcare enrollment inquiry still recommended.

**Future naming refinement (documented, not implemented):** “Existing family” intent may evolve to “Continue enrollment” / “Request information” labels.

---

### Card 4 — Packet / Embed / Send-and-Fill Productization ✅ (May 2026)

**Shipped:**

- Removed **“coming soon”** mismatch on Form Detail outcome panel — replaced with accurate MVP copy for enrollment packets, existing-record send, and document generation.
- **FormPacketContextPanel** — shows which enrollment packets include this form (step N of M), links to packet setup, and operator guidance for sending from opportunity drawer.
- **Share / embed productization** in setup panel — share hint by intent, **Open form** / **Copy link**, collapsed **Embed on website** with iframe snippet + **Copy embed code**.
- **After submit preview** copy refined for enrollment lead (website embed), existing-record attach, and packet step intents.
- Publish section duplicate “Start a packet” links removed — packet guidance consolidated in dedicated panel.
- Runtime embed (`FormEmbedClient`) already shows step N of M packet context in business language — unchanged.

**UX decisions:**

- Only working actions exposed — no fake packet send from form detail; packets sent from opportunity drawer.
- Advanced automation (trigger workflow, create task, copy outcome settings) moved to collapsed **Future automation (not in MVP)** disclosure.
- Embed code stays collapsed under **Embed on website** — happy path is Copy link / Open form.
- Packet membership scan capped at 15 active definitions (MVP org scale assumption).

**Files changed:**

| File | Change |
|------|--------|
| `web/lib/forms/formSharePresentation.ts` | Embed snippet + operator share/embed copy |
| `web/lib/forms/formPacketMembershipPresentation.ts` | Packet membership resolver + operator copy |
| `web/components/forms/admin/FormPacketContextPanel.tsx` | Form detail packet context panel |
| `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx` | Share hint + embed disclosure |
| `web/components/forms/admin/FormOutcomeConfigPanel.tsx` | Remove coming soon; related workflows |
| `web/components/forms/workspace/FormLifecycleWorkspaceLayout.tsx` | Wire packet panel; dedupe publish links |
| `web/lib/forms/operationalIntentTemplates.ts` | Embed/packet/existing-record after-submit copy |
| Tests | `formSharePresentation.test.ts`, `formPacketMembershipPresentation.test.ts`, `formOutcomeConfigPanel.test.tsx` |

**Tests run:**

- `tests/forms/formSharePresentation.test.ts` ✅
- `tests/forms/formPacketMembershipPresentation.test.ts` ✅
- `tests/forms/formOutcomeConfigPanel.test.tsx` ✅
- `tests/forms/operationalIntentTemplates.test.ts` ✅ (if intent copy assertions exist)
- Cards 1–3 regression: `existingRecordFormLaunch.test.ts`, `formsAdminRoutes.test.ts`, `intakeQuickReviewPresentation.test.ts`, `formDetailLifecycleWorkspace.test.tsx` ✅
- `qaEnrollmentLeadOpportunityProof.ts` ✅
- `qaEnrollmentIntakeLifecycleCoherence.ts` ✅

**Remaining gaps:**

- No bulk send or email automation from form detail (by design).
- No full packet designer on form detail — packet setup remains in packet builder.
- Packet membership requires N+1 fetches (list + detail per active packet) — acceptable for MVP; dedicated API could reduce load later.
- Manual browser proof: public share, embed iframe, packet session attach, existing-record send still recommended.
- QA scripts (`qaEnrollmentLeadOpportunityProof.ts`, `qaEnrollmentIntakeLifecycleCoherence.ts`) re-run — pass.

**Future phase items:**

- Copy outcome settings across links
- Email / campaign send from form detail
- Single API for form → packet membership
- Packet management overhaul

---

### Card 5 — FD-15 Rich Text Inline Field Tokens ✅ (May 2026)

**Shipped:**

- **`inlineFieldTokens.ts`** — parse `{{field_key}}`, validate against canonical schema fields, resolve from payload/prefill value map, track missing/unknown/required tokens, collect review warnings from composition text blocks.
- **Authoring** — document composition text blocks use `InlineFieldTokenAuthoringControls`: field picker + **Insert field**, chip preview, unknown-token warning. Stored as plain `{{field_key}}` in block content (no duplicate field definitions).
- **Runtime** — `FormEngineRenderer` renders `document_composition` layout when present; text/heading blocks resolve tokens live as families fill the form (submitted + prefilled values).
- **Review** — readonly renderer shows resolved values; missing required tokens surface **Inline field references need attention** banner; missing values render as highlighted `[Field label]` placeholders (not silently erased).
- **Admin preview** — `DocumentCompositionPreview` shows authoring-mode token chips for text/heading blocks.
- Forms **without** `document_composition` unchanged (legacy section rendering).

**UX decisions:**

- MVP supports **flat top-level field keys only** — repeating-group / nested fields excluded from picker (documented in authoring helper text).
- No WYSIWYG rewrite — textarea + insert picker + chips.
- Unknown tokens highlighted amber; missing known tokens highlighted sky blue at runtime.
- Public composition path enabled only when schema has `document_composition` (medication demo and document-style forms).

**Files changed:**

| File | Change |
|------|--------|
| `web/lib/forms/inlineFieldTokens.ts` | **New** — parse/resolve/validate utilities |
| `web/components/forms/inline/InlineFieldTokenText.tsx` | **New** — resolved/missing token rendering |
| `web/components/forms/inline/InlineFieldTokenAuthoringControls.tsx` | **New** — authoring insert UI |
| `web/components/forms/engine/FormEngineRenderer.tsx` | Document composition runtime + review warnings |
| `web/components/admin/forms/documentComposition/DocumentCompositionBlockCard.tsx` | Token authoring on text blocks |
| `web/components/admin/forms/documentComposition/DocumentCompositionEditor.tsx` | Pass schema to block cards |
| `web/components/admin/forms/documentComposition/DocumentCompositionPreview.tsx` | Token preview in text/heading |
| Tests | `inlineFieldTokens.test.ts`, `inlineFieldTokenText.test.tsx`, `formEngineInlineFieldTokens.test.tsx`, `documentCompositionInlineTokens.test.tsx` |

**Tests run:**

- `inlineFieldTokens.test.ts` ✅ (parse, resolve, missing, unknown, warnings)
- `inlineFieldTokenText.test.tsx` ✅
- `formEngineInlineFieldTokens.test.tsx` ✅ (runtime + review)
- `documentCompositionInlineTokens.test.tsx` ✅
- `documentCompositionPreview.test.tsx` ✅
- `formEngineRenderer.test.tsx` ✅ (existing forms unaffected)
- Cards 1–4 regression spot-check ✅

**Unsupported / future phase:**

- Formulas, conditionals, loops
- Repeating-group token expansion (`{{medications.0.med_name}}`)
- Nested object traversal
- Markdown/rich-text formatting beyond plain paragraphs
- PDF generation token rewrite (stub PDF mapping unchanged)
- Heading-block token insert UI (text blocks only in MVP picker; headings still resolve if tokens pasted)

**Remaining risks before Card 6:**

- Manual browser proof on medication authorization demo with composition + inline authorization paragraph
- Prefill → token resolution on first paint (should work via payload.values; verify in embed)
- Forms using sections-only layout unaffected — inline tokens only apply to document composition text blocks

---

### Card 6 — MVP Closeout / QA / Documentation ✅ (May 2026)

**Final MVP status:** **Shipped for operator use** — intent-first setup, share/send surfaces, existing-record attach path, packet/embed guidance, and document-composition inline tokens are in place. Residual items are manual browser proof and future-phase capabilities (see §7).

**What was verified:**

| Path | Automated | Manual / deferred |
|------|-----------|-------------------|
| New enrollment lead capture | `qaEnrollmentLeadOpportunityProof.ts` ✅ · `qaEnrollmentIntakeLifecycleCoherence.ts` ✅ · opportunity created · `new_inquiry` intake · workflow events · quick review copy | New Leads queue visibility spot-check in browser |
| Existing-record send / attach | `existingRecordFormLaunch.test.ts` ✅ · `formsAdminRoutes.test.ts` (launch_from_entity attach) ✅ · intake copy tests ✅ | Full browser submit attach on Demo Childcare inquiry |
| Packet / embed / share | No `coming soon` in forms UI ✅ · share/embed/packet unit tests ✅ · `FormPacketContextPanel` | Packet session E2E · embed iframe on external page |
| Inline field tokens | 106 tests across Cards 1–5 suite ✅ | Medication demo composition browser walkthrough |
| Setup UX clarity | Lifecycle/orchestration/outcome panel tests ✅ · grep clean for stale coming-soon | Operator walkthrough on Form Detail |

**Card 6 low-risk fixes:**

- `intakeCasePresentation.test.ts` — expect **Existing family update received** (Card 3 copy)
- `submissionOperationalNarrative.test.ts` — align with **New enrollment lead created** canonical headline

**Tests/scripts run (Card 6):**

```bash
cd web && npx tsx scripts/qaEnrollmentLeadOpportunityProof.ts          # pass
cd web && npx tsx scripts/qaEnrollmentIntakeLifecycleCoherence.ts        # pass
cd web && npm run test -- tests/forms/operationalIntentTemplates.test.ts \
  tests/forms/intakeRuntimeOrchestrationPresentation.test.ts \
  tests/forms/formDetailLifecycleWorkspace.test.tsx \
  tests/forms/existingRecordFormLaunch.test.ts \
  tests/admin/formsAdminRoutes.test.ts \
  tests/forms/intakeQuickReviewPresentation.test.ts \
  tests/forms/formSharePresentation.test.ts \
  tests/forms/formPacketMembershipPresentation.test.ts \
  tests/forms/formOutcomeConfigPanel.test.tsx \
  tests/forms/inlineFieldTokens.test.ts \
  tests/forms/inlineFieldTokenText.test.tsx \
  tests/forms/formEngineInlineFieldTokens.test.tsx \
  tests/forms/documentCompositionInlineTokens.test.tsx \
  tests/forms/documentCompositionPreview.test.tsx \
  tests/forms/formEngineRenderer.test.tsx \
  tests/forms/intakeCasePresentation.test.ts \
  tests/forms/submissionOperationalNarrative.test.ts                     # 17 files · 106 tests pass
```

**Known remaining gaps (not MVP blockers):**

- Manual browser proof: existing-record attach submit, packet session attach, embed iframe on real site, medication demo inline-token paragraph
- Email/bulk send from Form Detail
- Person/customer send UI beyond opportunity path
- Inline token **PDF/output** generation (UI/review resolution only in MVP)
- Live after-submit preview fully sourced from outcome config (static intent copy + story bullets today)

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
- [x] Submit creates opportunity with correct status + work unit (`qaEnrollmentLeadOpportunityProof.ts` — Card 6)
- [x] Intake workspace / quick review reflect submission (QA scripts + presentation tests — Card 6)
- [ ] Visible in New Leads queue (manual browser spot-check recommended)

### Existing-record path

- [x] Send form to opportunity from form detail + drawer (Card 3)
- [x] Attach path covered by unit/route tests; no duplicate create in attach metadata (Card 3 + Card 6 tests)
- [x] Intake copy says family update, not new lead
- [ ] Full browser attach submit on Demo Childcare inquiry (manual)

### Packet / send path

- [ ] Packet launch from opportunity works (manual)
- [x] Form detail acknowledges packet membership (Card 4)
- [x] No “coming soon” mismatch on form detail packet/send (Card 4 + Card 6 grep)
- [ ] Public fill attaches to session (manual)

### Inline tokens

- [x] Author can insert tokens via field picker (Card 5)
- [x] Token references existing field keys — no duplicate definitions (Card 5)
- [x] Runtime resolves from payload/prefill with missing highlight (Card 5)
- [x] Review shows resolved text + missing warnings (Card 5)
- [ ] Manual proof on medication authorization demo composition (browser)

### Operational coherence

- [x] Quick review / intake case presentation tests aligned (Card 6)
- [x] No raw infrastructure language on primary setup path (Card 2)

### Stability gates

- [x] `qaEnrollmentLeadOpportunityProof.ts` passes (Card 6)
- [x] `qaEnrollmentIntakeLifecycleCoherence.ts` passes (Card 6)

---

## 7. Future phase / not now

**Explicit future-phase candidates (not MVP blockers):**

- Email / bulk send from Form Detail
- Person / customer send UI beyond opportunity drawer path
- Dedicated packet designer on Form Detail
- Dedicated packet membership API (replace N+1 definition fetches)
- Dynamic routing presets for departments / work units
- Live after-submit preview fully sourced from outcome config
- Inline token PDF / output generation (MVP: UI + review resolution only)
- Formulas, conditionals, repeater token expansion for inline tokens
- AI-assisted form / document generation
- AI-assisted prefill mapping suggestions
- Copy outcome settings across links
- Full WYSIWYG document editor
- Persisted `intake_cases` table
- Packet management overhaul
- OCR / document generation rewrite

---

## Sprint closed

**Forms MVP Productization — closed May 2026.** Cards 0–6 complete. Manual browser checklist items in §6 remain recommended before production demo, not code blockers.

**Suggested commit message:**

```
Forms MVP: close productization sprint with QA, docs, and completed sprint archive
```
