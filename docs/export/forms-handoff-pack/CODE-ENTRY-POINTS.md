# Forms — code entry points

Repo paths for the forms engine, intake, packets, and document generation. **Not included in the handoff pack** — reference only.

---

## Admin UI routes

| Route | File |
|-------|------|
| Forms hub | `web/app/adminV2/forms/page.tsx` |
| Form detail / lifecycle workspace | `web/app/adminV2/forms/[formId]/page.tsx` |
| Submissions inbox (per form) | `web/app/adminV2/forms/[formId]/submissions/page.tsx` |
| Submission detail | `web/app/adminV2/forms/[formId]/submissions/[submissionId]/page.tsx` |
| Global submissions inbox | `web/app/adminV2/forms/submissions/page.tsx` |
| Packet definitions | `web/app/adminV2/forms/packet-definitions/page.tsx` |
| Packet definition editor | `web/app/adminV2/forms/packet-definitions/[packetDefId]/page.tsx` |
| Packet sessions inbox | `web/app/adminV2/forms/packets/page.tsx` |
| Packet session review | `web/app/adminV2/forms/packets/[packetSessionId]/page.tsx` |
| Public embed (visitor) | `web/app/forms/embed/[token]/page.tsx` (and related public routes) |

---

## Admin API routes (`web/app/api/admin/forms/`)

| Area | Paths |
|------|-------|
| Definitions | `route.ts`, `[formId]/route.ts`, `[formId]/duplicate/route.ts`, `[formId]/archive/route.ts` |
| Versions | `[formId]/versions/**`, publish / archive |
| Public links | `[formId]/public-links/**` |
| Outcome labels | `[formId]/outcome-labels/route.ts` |
| Lifecycle coverage | `[formId]/lifecycle-coverage/route.ts` |
| Submissions | `submissions/**`, confirm-linkage, manual-link, generate-document, submit |
| Packets | `packet-definitions/**`, `packet-sessions/**`, `packet-links/route.ts` |
| Review | `packet-sessions/[id]/review/route.ts`, `review-rollup/route.ts`, `review-insight/route.ts` |
| CRM search (prefill / launch) | `crm-entity-search/route.ts` |

---

## Public API routes (`web/app/api/public/forms/`)

| Path | Purpose |
|------|---------|
| `[token]/resolve/route.ts` | Resolve published form envelope + embed context |
| `[token]/submissions/route.ts` | Create draft submission |
| `[token]/submissions/[submissionId]/route.ts` | Read/update draft payload |
| `[token]/submissions/[submissionId]/submit/route.ts` | Finalize public submit |

---

## Core libraries (`web/lib/forms/`)

| Module | Purpose |
|--------|---------|
| `schema.ts`, `validateSubmission.ts` | Form schema model + submit validation |
| `prefill/**` | Prefill resolution, field maps, merge |
| `intake/**` | Lead capture, intake meta, OCM child fields, dedup |
| `packets/**` | Packet orchestration, review rollup, PDF ensure, launch validation |
| `pdf/**` | PDF mapping contract, `createGeneratedPdfForSubmission` |
| `signatures/**` | Signature collection + persistence |
| `lifecycle/**` | Lifecycle requirement coverage, public submit gates |
| `existingRecord/**` | Existing-record public link mint + launch |
| `workflow/**` | Submission events, intake case lifecycle, enrollment projections |
| `review/**` | Review presentation tokens, BOS assist placeholders |
| `systemFieldRegistry.ts` | System field catalog for authoring |
| `adminFormSchemaBuilder.ts`, `useFormSchemaFieldAuthoring.ts` | Authoring helpers |
| `operationalIntentTemplates.ts` | MVP intent templates |
| `inlineFieldTokens.ts` | Inline token authoring (UI/review) |

Admin DB layer: `web/lib/admin/forms/formsAdminDb.ts`

---

## UI components (`web/components/forms/`)

| Area | Key files |
|------|-----------|
| Public engine | `engine/FormEngineRenderer.tsx`, `formEnginePayload.ts` |
| Operator workspace | `workspace/FormsWorkspaceShell.tsx`, `FormLifecycleWorkspaceLayout.tsx`, intake hub views |
| Review / case file | `review/CaseFileSection.tsx`, `IntakeCaseFileLayout.tsx`, `PacketReviewRollupView.tsx` |
| Packets | `packets/PacketSessionReviewClient.tsx`, `PacketReviewRollupView.tsx` |
| Admin panels | `admin/FormOutcomeConfigPanel.tsx`, `FormIntakeRuntimeOrchestrationPanel.tsx`, … |
| Opportunity drawer | `web/components/admin/opportunity/*` — packet launch + review modal |

---

## Documents integration

| Concern | Path |
|---------|------|
| Upload | `web/app/api/admin/documents/upload/route.ts` |
| Normalize rows | `web/lib/admin/normalizeDocumentRow.ts` |
| Packet doc merge (opportunity) | `web/lib/admin/related/mergeOpportunityPacketDocuments.ts` |
| Provenance display | `web/lib/forms/packets/documentProvenanceDisplay.ts` |
| Generated PDF | `web/lib/forms/pdf/createGeneratedPdfForSubmission.ts` |

---

## Tests (representative)

| Suite | Path |
|-------|------|
| Admin routes | `web/tests/admin/formsAdminRoutes.test.ts` |
| Forms lib | `web/tests/forms/*.test.ts` (~100+ files) |
| Public forms | `web/tests/publicForms/*.test.ts` |
| Lifecycle + forms removal | `web/tests/lifecycle/lifecycleActionSaveAndFormsRemoval.test.ts` |

Run focused:

```bash
cd web && npm run test -- tests/admin/formsAdminRoutes.test.ts tests/forms/packetReviewRollup.test.ts
```

---

## Related platform docs (in pack)

- **`01-canonical/documents-and-forms.md`** — product truth
- **`01-canonical/crm-system.md`** — intake promotion boundaries
- **`01-canonical/communications.md`** — packet invitation send path
