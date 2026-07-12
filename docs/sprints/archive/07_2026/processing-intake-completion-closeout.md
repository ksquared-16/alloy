# Processing Intake Completion — Staging QA Release Candidate

**Branch:** `feat/processing-intake-completion`  
**Target:** `staging`  
**Status:** Approved for promotion — **staging QA candidate, not Processing V1 complete**

## Release posture

| Statement | Value |
|-----------|-------|
| Live cleanup has been run | **No** — must be executed via UI on staging after deploy |
| Processing V1 frozen | **No** — live QA checklist below must pass first |
| Field Platform consumer expanded | **No** — curated `PROCESSING_BUILDER_CANONICAL_FIELDS` seam unchanged |

---

## What this release adds

1. **Import document** workflow with explicit intent modal (`generate_form`, `process_information`, `store_document`; `packet_source` unavailable)
2. **Broader source-format capabilities** — honest per-format store/preview/extraction/detection matrix
3. **Collision-safe document instance naming** — display name separate from original filename
4. **Required generated-form naming** — no `Untitled document/form` at create
5. **Generate-step hierarchy** — review-and-confirm layout with mapping band and included fields
6. **Alloy-native generation loader** — `ProcessingNativeFormCreatingState` / `BosExecutionLoader`
7. **Publish state reconciliation** — immediate success UI; `has_published_version` on single-form GET
8. **Atomic blank-form creation** — `POST /api/admin/forms/blank` (form + v1 draft, rollback on version failure)
9. **Full Processing reset mode** — `clear_all: true` on dev cleanup (staging/dev only)

---

## Supported import formats (capability matrix)

| Format | Store | Preview | Text extraction | Question detection |
|--------|-------|---------|-----------------|-------------------|
| PDF | yes | yes | yes | yes |
| DOCX | yes | yes* | yes* | yes where reliable |
| DOC | yes | no | no | no |
| PNG / JPEG | yes | yes | no | no |
| TXT | yes | yes | yes | yes |
| CSV | yes | yes | yes | processing-specific |
| HEIC | no | no | no | no |

\*DOCX depends on existing pipeline — import modal surfaces honest limits.

---

## Import intent vocabulary

Persisted explicitly on document + case metadata (`processing_intent`, `import_purpose`):

| Value | Meaning |
|-------|---------|
| `generate_form` | Detect questions → review → generate native form (V1 default) |
| `process_information` | Extract for review / eventual record updates |
| `store_document` | Attach without form generation |
| `packet_source` | **Unavailable** in V1 (shown disabled in modal) |

---

## Naming contracts

### Source document vs generated form

| Concept | Field / surface |
|---------|-----------------|
| Original filename | `documents.original_filename` (immutable traceability) |
| Document display name | `documents.title` — operator-facing instance name |
| Generated form name | `generated_form_name` on preview → `form_definitions.name` |

Default display name pattern: `{Document Type} — {Subject} — {Period or Received Date}`

### Collision handling

- Display names are **not** globally unique
- Duplicate within tenant/context → append stable suffix `(2)`, `(3)`, …
- **No** opaque upload IDs in operator-facing names
- Every import remains a **distinct document instance** — no merge/overwrite

---

## Cleanup safety contract

| Rule | Implementation |
|------|----------------|
| Production blocked | `NODE_ENV=production` or `VERCEL_ENV=production` throws |
| Org-scoped | All queries filter `org_id` from authenticated admin context |
| Dry-run default | `apply: false` unless explicit |
| Apply token | `RESET-PROCESSING-TEST-DATA` required |
| `clear_all` | Deletes **all org form definitions** when heuristics miss legacy test forms |
| Does **not** delete | CRM records, canonical fields, tenant config, branding, non-Processing business tables |
| Dependency order | submissions → public links → form versions → forms → case sources → cases → documents (+ storage) |
| Verification | Dry-run and apply return `remaining` counts by artifact type |

**Use the Processing Overview → Reset test data dialog** (not console scripts) for dry-run counts and post-delete verification.

---

## Blank-form atomic creation

- Route: `POST /api/admin/forms/blank`
- Single transaction semantics: insert form → insert draft v1 → rollback parent on version failure
- Rejects empty name; client blocks double-submit via `creating` flag
- Response includes `form_id`, `form_version_id`
- Studio auto-opens builder on success via `selectedFormId`

---

## Publish lifecycle

| State | Behavior |
|-------|----------|
| Draft | Editable draft version |
| Publishing | Button disabled, pending UI |
| Published | `has_published_version` true; success banner; URL/iframe controls available |
| Publish failed | Error visible; retry without duplicate version |
| Reopen | Published state persists via enriched GET + version-derived client state |

---

## Field Platform caveat

Processing form builder still consumes a **curated interim subset** from `PROCESSING_BUILDER_CANONICAL_FIELDS` / `systemFieldRegistry`. The Field Platform consumer audit remains the authority for replacing this seam. **Not expanded in this release.**

---

## Post-deploy live QA checklist

### A. Cleanup first (via UI dialog)

- [ ] Processing → Overview → Reset test data
- [ ] Enable **Clear all Processing test data**
- [ ] Dry run — capture grouped counts
- [ ] Apply with `RESET-PROCESSING-TEST-DATA`
- [ ] Verify Active Work = 0, Needs Review = 0, Ready to Publish = 0, Studio Forms = 0, folder counts = 0, `remaining` API counts = 0

### B. New Form

- [ ] Named blank form creates exactly one form + version
- [ ] Auto-opens builder; double-click blocked; reopen persists; no orphan on failure

### C. Import intent and formats

- [ ] PDF, DOCX, PNG/JPG with honest capability messaging
- [ ] Unsupported format → useful error
- [ ] `process_information` and `store_document` intents persist metadata
- [ ] Packet source remains unavailable

### D. Naming

- [ ] Duplicate imports get collision suffix; filenames unchanged; rename is independent

### E. Generate

- [ ] Form name required; scannable summary; Alloy loader; confirmed name on open; no Untitled asset

### F. Publish

- [ ] Immediate success banner; URL/iframe visible; reopen Published; failure/retry works

### G. Regression

- [ ] Birthdate mapping; Notes unresolved; manual region mapping; complete/archive/delete

### H. Return to zero

- [ ] Full cleanup again → Processing blank

---

## Local validation (pre-merge)

```bash
cd web
npx tsc --noEmit
npm run verify:module-imports
npm run test -- \
  tests/pos/processingDevCleanup.test.ts \
  tests/pos/documentInstanceNaming.test.ts \
  tests/pos/processingSourceCapabilities.test.ts \
  tests/pos/processingImportIntent.test.ts \
  tests/pos/createFormFromCaseDraft.test.ts \
  tests/pos/processingReviewFieldMapping.test.ts \
  tests/pos/processingCanvasInteraction.test.ts
```
