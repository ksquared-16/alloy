# POS Document → Form Template — Checkpoint (June 2026)

Branch: `claude/pos-comms-clean-20260612` · HEAD `1bab4bc7`

This is a state-of-the-world checkpoint for the POS **Document → Form Template** capability
(Workflow A: turn an uploaded source form into a reusable Alloy form template). It records
what works today, which file types are supported, the known gaps, and the next-phase plan.
No new product functionality was added in this pass.

---

## 1. What works today

End to end, inside the POS workspace (no leaving the modal, no routing to `/admin/forms`):

- **Upload** a source document in POS → Documents (`POST /api/admin/documents/upload`,
  bucket `org_documents`). Uploading opens a Processing case automatically.
- **PDF text extraction** at upload (`unpdf`, text-only, no OCR) populates
  `documents.extracted_text`.
- **Set up this document** (`POST /form-draft`) runs the draft generator, which is
  **AcroForm-first**: if the PDF carries real form-field widgets, those are the primary
  source; otherwise it falls back to deterministic text-structure detection.
- **Two-pane review workspace** (`PosTemplateSetupColumn`): left = source PDF preview with
  a Highlights/PDF toggle; right = "Review detected fields" with **Fields** and
  **Extracted text** tabs. Both panes are visible at once; no scrolling between them.
- **PDF-context highlights**: the Highlights view draws the page's text runs (labels/
  headers) behind translucent field-highlight boxes, positioned from page dimensions +
  bbox. Clicking a field row selects its highlight and vice-versa.
- **Review / edit / add / remove fields** in place — label, type, and section are editable
  per field; "Add field" creates a manual field.
- **Manual mapping**: an unmapped field shows a "Map" button → drag a rectangle on the page
  → the field gains `page` + `bbox` (source `manual_pdf_mapping`) and flips to
  "Mapped to PDF".
- **Create form from the reviewed list** (`POST /form-draft/save` → `/form-draft/create`):
  produces an **unpublished** `form_definition` + draft version from a valid `FormSchemaV1`,
  preserving PDF provenance (`pdf_field_name` / `page` / `bbox`). Never publishes, never
  writes records.
- **Stay-in-POS routing**: after create, the modal switches to **POS → Forms** with the new
  form selected. The Forms list shows document-originated forms with their **source document
  title + field count + draft/published** state.
- **Cleanup**: generated forms can be **archived** (`POST /forms/[id]/archive`, soft-archive
  + deactivates links); unused uploads can be **deleted** via a **guarded**
  `DELETE /api/admin/pos/documents/[id]` that refuses if the document produced a form
  template or its case is completed/archived.

MO500 (Missouri "School-Age Child Health Report") is the proving case: its AcroForm yields
~7 real fields (Child's Name, Birthdate, two health-statement checkboxes, special-
requirements text, Parent/Guardian Signature, Date) detected with page + bbox.

---

## 2. Supported file types and paths

### Primary path — fillable (AcroForm) PDF

```
Upload fillable PDF
  → extract PDF form fields (name · type · page · bbox)   [unpdf → pdf.js getAnnotations]
  → review / map fields against the PDF
  → create Alloy form template (provenance preserved)
```

Field types map from AcroForm: `Tx`→text/date/number, `Btn`→checkbox, `Ch`→select (drafted
as text + "add options in builder"), `Sig`→signature. Push buttons are dropped; radio
groups collapse to one field. Page dimensions + a sample of page text runs are captured for
the review schematic (best-effort).

### Fallback path — flat PDF / Word / image

```
Flat PDF / Word / image
  → extracted text (if any) → deterministic structure detection
  → OR manual field setup (add / map fields)
  → create template
```

- **Flat (non-fillable) PDF**: no AcroForm widgets, so detection uses the extracted text
  (layout-aware patterns + a known-label sweep for sparse government forms). When text is
  weak, the operator builds the field list manually. Detection quality is graded
  strong / weak / failed; a weak draft is honestly labelled "text-assisted, not exact PDF
  mapping."
- **Word (.docx) and images (.png/.jpg/scanned PDF)**: see limitations below — these flow
  through the **manual** fallback (the operator adds fields by hand; the PDF preview shows
  the file when the browser can render it).

---

## 3. Word / image limitations

- **No OCR.** Scanned/image-only PDFs and image uploads produce little or no extracted
  text, so automatic field detection will be empty. The UI says so ("Unavailable (scanned /
  image-only PDF)") and routes to manual setup.
- **Word (.docx) is not parsed for form fields.** There is no `.docx` → field extractor;
  Word uploads rely on extracted text (if present) or manual setup. Native Word content
  controls / tables are not read.
- **Manual mapping needs a page coordinate space.** Manual "Map to PDF" is reliable when
  page dimensions are known (AcroForm path). For flat/Word/image sources without page
  dimensions, the schematic falls back to a relative "extent" layout and the map clearly
  shows "Context unavailable — relative layout only."
- **The highlight layer is a schematic, not the PDF raster.** The browser's native PDF
  viewer is opaque, so highlights are drawn on our own SVG (text runs as context) rather
  than as boxes painted on the rendered page image.

---

## 4. Known gaps

- **No PDF page rasterization.** True highlight boxes painted on the actual rendered page
  (vs. the SVG schematic + native-viewer toggle) require pdf.js canvas or a server page-
  image route.
- **`pdf.js` runtime extraction is unverified in CI here.** AcroForm extraction + page-
  context capture run only at request time; they degrade gracefully but were validated by
  unit-level logic + typecheck, not an automated runtime test against a real PDF.
- **Form builder is intentionally thin.** Created templates are valid `FormSchemaV1` but the
  POS form builder is review/preview-oriented; richer layout editing happens elsewhere.
- **No multiple-fields-per-row / headers / branding / footers** in the generated template
  layout yet (single-column sections).
- **No parent submission, submission review, official-PDF output, or save/send to records**
  — all explicitly out of scope so far.
- **`select`/choice fields lose their options.** AcroForm choice widgets are drafted as text
  with a warning (options are added in the builder); option dictionaries aren't read.

---

## 5. Next-phase plan

In rough priority order (each is a separate, scoped sprint):

1. **PDF raster + true overlay** — render the page (pdf.js canvas or server page-image
   route) and paint highlight boxes on the actual page, replacing the schematic.
2. **Richer POS form builder layout** — multiple fields per row, sections, headers /
   branding / footers, reorder.
3. **Parent guided submission experience** — render the published template for a parent to
   fill (Workflow: form → submission).
4. **POS submission review** — operator reviews submitted answers in POS.
5. **Official PDF output generation** — use the preserved `pdf_field_name` / `page` / `bbox`
   to fill the original government PDF from submitted answers.
6. **Save / send to records and contacts** — route completed output to CRM person/records
   (this is where the shared Intake Engine alignment, Workflow B, re-enters).

The mapping metadata needed for #5 (`pdf_field_name`, `page`, `bbox`) is already captured
and persisted on the draft and the created form, so the official-PDF-output path is unblocked.

---

## 6. Validation results (this checkpoint)

- `npm run verify:module-imports` → **ok** (`{ ok: true, checked_files: 4842 }`), confirmed
  on a clean checkout of HEAD `1bab4bc7`.
- `npm run build` and `npm run test -- tests/pos/` → **could not run in the working
  environment**: the sandbox is missing the platform-native bundler bindings (vitest's
  `@rolldown/binding-linux-arm64-gnu`; the build's esbuild binary), which is an environment
  limitation, not a code fault. **These must be run locally to confirm green before push.**
- POS logic was validated throughout via `tsc --noEmit` (scoped, 0 errors) and Node
  `--experimental-strip-types` harnesses over the pure modules (detection, AcroForm mapping,
  field-map geometry, manual-mapping inverse, provenance).

POS test files present at HEAD: `tests/pos/structureLayoutDetection`, `structureMarkerless
Detection`, `structureMo500RealText`, `formDraft`, `createFormFromCaseDraft`,
`documentFormPreview`, `pdfAcroForm`, `formDraftAcroForm`, `pdfFieldMap`, `pdfPageContext`,
`pdfTextExtract`, `posDocumentsList`, `processingCaseEvidence`.

---

## 7. Push readiness

**Not yet.** verify passes, but per the standing rule (no push without validation),
`npm run build` and `npm run test -- tests/pos/` must be confirmed green **locally** first
— they cannot run in this environment. Local steps before pushing:

1. `npm install` (ensures `unpdf` + platform-native bundler bindings).
2. `npm run verify:module-imports` · `npm run build` · `npm run test -- tests/pos/`.
3. Resync the local git index (it is stale because commits were written via an alternate
   index in this environment): `rm -f .git/index.lock .git/HEAD.lock && git reset` — after
   this, `git status` should be clean (the `D`/`MM` entries are an index artifact, not file
   loss; all files exist on disk and in HEAD).
4. Remove leftover scratch files: `rm web/__*.mts web/tsconfig.__scoped*.json`, and
   `git worktree prune` (several temp worktrees under `/tmp` are locked and harmless).

Once build + tests are green locally, the branch is ready to push for review.
