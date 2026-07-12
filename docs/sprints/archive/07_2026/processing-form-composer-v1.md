# Processing Form Composer V1 — Sprint

**Branch:** `feat/processing-form-composer-v1`  
**Goal:** Complete the document → native Alloy form transformation engine. The uploaded document is **evidence**; the generated form is **source of truth**.

## Primary workflow (definition of done)

1. Upload an existing enrollment / state / medical PDF (`Documents → Import existing form`)
2. Open intake in **Incoming → Template setup**
3. Review Alloy's detected **questions** (not raw field keys)
4. Resolve meaning: subject (Child, Parent, …) and name representation (full vs first+last)
5. **Generate native form** → unpublished `form_definition`
6. Open **`/adminV2/forms/[id]`** (FormDocumentAuthoringShell) → edit → publish

## Pipeline audit (staging baseline + V1 extensions)

| Stage | Status | Implementation |
|-------|--------|----------------|
| Upload | ✅ | `PosDocumentsPanel` → `POST /api/admin/documents/upload` (`open_processing_case=true`) |
| Processing case | ✅ | `maybeOpenProcessingCaseFromNonFormSourceSafe` |
| AcroForm / text detection | ✅ | `buildFormDraftForCaseSafe`, `pdfAcroForm.ts`, text fallback |
| Question review UI | ✅ **V1** | `PosTemplateSetupColumn` + `ProcessingQuestionReviewList` |
| Question resolution model | ✅ **V1** | `questionResolutionModel.ts` — intent, subject, representation, derived storage |
| Draft save | ✅ | `POST .../form-draft/save` → `buildManualFormDraft` |
| Native form create | ✅ | `createFormFromCaseDraft` |
| Rich builder handoff | ✅ **V1** | `formAuthoringWorkspacePath` → `/adminV2/forms/[id]` |

## Product principles (this sprint)

- Think in **questions**, not database fields.
- Operator resolves **meaning**; Alloy derives **storage** (`field_source` is advanced / derived).
- Confidence surfaced per question: High / Medium / Low / Needs review / Processing only / Ignored.
- **Non-goals:** Enrollment journey, packets, parent runtime, OCR, signatures, new persistence, new shell.

## V1 deliverables in this branch

1. **Question resolution workflow** — subject picker, name representation, ignore/restore
2. **Detection mode labels** — AcroForm vs text-assisted vs manual
3. **Rich builder handoff** — modal + API return `/adminV2/forms/[id]`
4. **Import existing form** entry point on Documents
5. **Tests** — `questionResolutionModel.test.ts`, `formComposerV1.test.ts`

## Current limitations (honest)

| Limitation | Notes |
|------------|-------|
| Full name as one field | Split representation works; single full-name field still maps to `child_first_name` only |
| Select / radio options | Not inferred from PDF; operator adds in form workspace after generation |
| Semantic sections | Section titles from detection; not re-segmented by question intent |
| OCR / scanned PDFs | Text extraction only; no OCR |
| True PDF overlay | SVG schematic from AcroForm bbox; not raster overlay on native PDF viewer |
| Thin list builder | `/admin/forms` and `PosFormsWorkspace` remain bridge only |

## Manual validation script

Use real PDFs (enrollment packet page, state form, medical form):

1. Processing → Documents → **Import existing form**
2. Incoming → open case → **Detect questions**
3. For each ambiguous row: set subject + name representation; ignore boilerplate
4. **Generate native form** → confirm new tab opens `/adminV2/forms/[id]`
5. Edit labels / validation in form workspace → publish
6. Record: perfect / needed review / failed — failures become backlog

## Form Composer roadmap (post-V1)

1. **Composer shell in Processing** — inline section/question editing without leaving intake
2. **Advanced mapping drawer** — optional `entity_type` / `field_key` for power users
3. **Select option inference** — read AcroForm choice values into form schema
4. **Section intelligence** — group questions by detected headings / semantics
5. **Validation templates** — DOB format, phone masks from intent
6. **Batch import** — multiple forms from a packet PDF
7. **Deprecation** — remove thin `PosFormsWorkspace` as primary path

## Related docs

- `docs/sprints/06_2026/pos_document_form_template_checkpoint.md` — prior pipeline checkpoint
- `docs/platform/modules/documents-and-forms.md` — forms platform module
