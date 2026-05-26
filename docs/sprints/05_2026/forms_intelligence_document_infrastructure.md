# Forms Intelligence + Document Infrastructure (Phase Next)

**Status:** **FD-0–FD-11 shipped** (public renderer still ignores `document_composition`; no OCR / embed route / rich-text editor)

**Builds on:** PX-0–PX-2 · OW-0–OW-7 · OI-0–OI-4B

**Sibling docs:**

| Doc | Role |
|-----|------|
| [`forms_operational_intelligence_workflow_polish.md`](./forms_operational_intelligence_workflow_polish.md) | OI command center + intelligence cards |
| [`../system/forms-intake-prefill-doctrine.md`](../system/forms-intake-prefill-doctrine.md) | Prefill precedence |
| [`../system/forms-intake-embed-doctrine.md`](../system/forms-intake-embed-doctrine.md) | Embed / iframe boundaries (FD-6) |
| [`../system/forms-ai-document-recreation.md`](../system/forms-ai-document-recreation.md) | PDF → draft architecture (FD-7) |

---

## Non-goals

- Full rich-text editor, OCR, public renderer redesign
- New CRUD APIs or parallel admin systems
- AI generation in authoring UI

---

## Cards

### FD-1 — Intake workspace realignment ☑

Interactive workload filters: Needs review · Needs linking · Waiting on families · Forms · Packets. KPI tiles filter inline workspace region (no “Action required” queue).

### FD-2 — Submission workspace compression ☑

Tighter intelligence cards; entity summary; prefill completeness; grouped blockers; ready-to-finalize; simplified CTA.

### FD-3 — Form authoring compression ☑ (partial)

Denser question cards; inline answer type; collapsible advanced (help, options, placeholder). Full two-column section layout deferred.

### FD-4 — Rich document infrastructure (foundation) ☑

Types + placeholder renderers in `documentComposition.ts`; optional `document_composition` on schema (ignored by public renderer until staged).

### FD-5 — Prefill + blank field coexistence ☑

Authoring labels: prefill when context exists, manual, locked, editable.

### FD-6 — Embed / iframe foundation ☑

Doctrine + intake shell hooks documented.

### FD-7 — AI document recreation (planning) ☑

Architecture staging doc only — no OCR.

### FD-8 — Document composition editor shell ☑

`DocumentCompositionEditor` + `FormDocumentAuthoringShell` integration; default composition from fields; save persists `document_composition`.

### FD-9 — Section / region field grouping ☑

`field_region` blocks reference field keys; layouts: one column · two columns · compact rows; canonical `fields[]` unchanged.

### FD-10 — Rich text / signature / branding block UX ☑

Authoring cards for instruction text, signature region, header/logo, divider, spacer — admin-only; public renderer unchanged.

### FD-11 — Intake activity + distribution compression ☑

Hub: side-by-side filters + panel; form lifecycle: combined share/recent intake grid, collapsed version history and link details.

---

## Runtime note

**Public intake** continues to render from `fields` + `sections` only. `document_composition` is authoring-side until a staged runtime pass.

---

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/forms/intakeWorkspaceFilters.test.ts \
  tests/forms/submissionIntelligencePresentation.test.ts \
  tests/forms/intakeWorkspaceCommandCenter.test.tsx \
  tests/forms/formsIntakeWorkspaceHub.test.tsx \
  tests/forms/documentComposition.test.ts \
  tests/forms/documentCompositionAuthoring.test.ts \
  tests/forms/documentCompositionEditor.test.tsx \
  tests/forms/structuredFormSchemaEditor.test.tsx \
  tests/forms/formDocumentAuthoringShell.test.tsx
```
