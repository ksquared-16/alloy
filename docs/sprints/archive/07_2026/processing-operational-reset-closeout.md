# Processing Operational Reset — Verification Closeout (Draft)

**Status:** In verification — **not promoted**. Live staging cleanup and blank-state QA remain required before commit/PR.

**Branch:** `fix/processing-operational-reset-qa` (local, uncommitted)

---

## Scope in this branch

- Processing test-data reset planner + dev cleanup route/dialog
- New Form creation + auto-open hardening
- Document naming + rename (display name)
- Review Questions canonical field consumption + normalization
- Overview KPI placement (body tiles, matching Communications)
- Region deselection + manual field draw mode (addendum)
- Generic Notes no longer maps to `allergy_notes`

**Out of scope:** presentation craft pass, Field Platform expansion, shell redesign.

---

## Lifecycle semantics

| Action | Effect |
|--------|--------|
| **Complete case** | Leaves Active; appears under Completed |
| **Archive document** | Eligible completed/archived artifacts move to Archived folder views |
| **Delete** | Removes throwaway test artifacts when lifecycle allows; blocked deletes return API message |
| **Dev cleanup** | Staging/dev only; dependency-safe delete of Processing-owned forms, cases, documents, submissions |

Cleanup confirmation token: `RESET-PROCESSING-TEST-DATA`

Cleanup **excludes:** CRM records, canonical field definitions, tenant configuration, branding, system configuration, non-Processing-owned forms.

---

## Document naming contract (V1)

| Concept | Persisted field |
|---------|-----------------|
| Original filename | Immutable on source document record (`documents` storage metadata / original name) |
| Display name | `documents.title` (operator-editable via PATCH `/api/admin/pos/documents/[id]`) |
| Document type / classification | Case/document metadata (detection-derived) |
| Subject / context | Processing case + draft preview metadata |
| Relevant date/period | Draft field values / case metadata when detected |

Two imports of the same PDF remain **distinct document instances** with separate IDs and display names.

---

## Processing field-consumer contract

Review Questions consume fields through:

1. `PROCESSING_BUILDER_CANONICAL_FIELDS` — curated picker list in `processingFormBuilderLibrary.ts`
2. `resolveProcessingBuilderRegistryEntry()` → `systemFieldRegistry` / `OPERATIONAL_FORM_SYSTEM_FIELDS`
3. `suggestFieldBinding()` — semantic label→binding patterns (shared with forms platform)
4. `processingReviewFieldCatalog.ts` — eligibility filter by destination entity (`SUBJECT_ENTITY_TYPES`)

### Field Platform audit answers (explicit)

| Question | Answer |
|----------|--------|
| Is `PROCESSING_BUILDER_CANONICAL_FIELDS` derived from the authoritative platform catalog? | **Partially.** Each entry resolves through `systemFieldRegistry`; the **list itself is a curated Processing subset**, not a dynamic platform query. |
| Can newly added tenant/platform fields appear without modifying Processing code? | **No** — new fields must be added to `PROCESSING_BUILDER_CANONICAL_FIELDS` (or future dynamic consumer). |
| Does entity filtering come from field metadata? | **Partially** — entity allow-list is `SUBJECT_ENTITY_TYPES`; field metadata comes from registry entries. |
| Does eligibility come from capability metadata? | **No** — eligibility is the curated list + entity filter, not full capability registry yet. |
| Are canonical refs persisted? | **Yes** — `field_source` (entity_type, field_key, shared_value_key) persisted on form draft save. |
| Compatible with active Field Platform Consumer Audit? | **Seam documented** — Processing uses builder library + registry, not `canonicalDataProviderRegistry`. Do not freeze as final platform consumer. |

### Semantic match vs normalization

- **Semantic match:** `suggestReviewDestinationField()` + `suggestFieldBinding()` propose destination from label/intent/type.
- **Normalization:** `normalizeFieldValue()` converts detected values toward canonical types (date/email/phone); ambiguous/invalid require operator review.

### Unresolved behavior

- Generic **Notes** → **no default mapping** (operator must select or leave unresolved).
- Allergy-labeled questions → `allergy_notes` only when label/intent is semantically about allergies.

Processing **does not define platform fields** — it consumes registry entries only.

---

## Manual source mapping (addendum)

### Canvas modes (explicit — no ambiguous click overload)

| Mode | Behavior |
|------|----------|
| **`select`** | Click region → select; blank canvas → deselect; toggle selected region off |
| **`draw_region`** | Crosshair cursor; drag rectangle; tiny drags ignored; Cancel + Escape exit |
| **`resize_region`** | **Not supported** — no resize handles on regions |
| **`pan`** | **Not a canvas mode** — viewport scroll/zoom via `ProcessingSourceDocumentViewport` |

Entering `draw_region`:
- Subtle active state on page chrome (pine ring)
- Cancel affordance in banner + toolbar
- Escape exits draw mode
- Completed draw returns to `select` (no repeated-add mode)

Does **not** interfere with: PDF scrolling, zoom, fit page/width, existing region overlays.

### Visual treatment (existing Alloy tokens)

| Region kind | Treatment |
|-------------|-----------|
| Auto-detected | Pine fill 12%, muted stroke — current default |
| Operator saved manual | Pine fill 10%, subtle dashed operator stroke |
| Unsaved manual (pending) | Pine fill 8%, dashed pine stroke — distinct temporary |
| Selected | Pine fill 34%, strong pine stroke |

### Product distinction (locked)

- **Detection** proposes what it sees.
- **Mapping** decides where it belongs.
- **Normalization** converts the value.
- **Manual region creation** recovers what detection missed.
- **Deselection** is interaction state only — never destructive.

### Persistence model

| Stage | State |
|-------|-------|
| Draw complete | `pendingManualRegion` in parent (not in `reviewQuestions` yet) |
| Save | Committed to `reviewQuestions` with `mappingOrigin: operator_created` |
| Cancel / Escape | Pending cleared — **no orphan question** |
| Auto-detected bbox correction | Updates page/bbox only; preserves `auto_detected` origin |

Provenance fields: `mappingOrigin` (`auto_detected` | `operator_created`), `evidence` (`manual_pdf_mapping`), page, bbox, `field_source` on save.

**Not implemented in this hotfix:** separate persisted `operator_corrected` provenance. When an operator remaps an auto-detected region's bbox, the question retains `auto_detected` origin; only page/bbox/evidence update. A dedicated correction flag remains a later seam.

### Limitations

- **PDF text extraction inside drawn region:** not available — operator enters label/value manually
- **Region resize/move:** not supported in V1
- **Pan:** handled by artifact viewport scroll, not canvas mode

---

## Staging verification checklist (manual — required)

### Phase 2 — Cleanup

- [ ] Dry-run via Processing Overview dev cleanup dialog or `POST /api/admin/processing/dev-cleanup`
- [ ] Inspect counts (cases, documents, forms, submissions, orphans, MO500/E2E)
- [ ] Apply with confirmation token
- [ ] Verify zero-state: Active 0, Completed test 0, Archived test 0, Studio Forms 0, submissions 0, folder counts 0

### Phase 3 — New Form

- [ ] Single click creates one form + version
- [ ] Auto-opens Form Builder in modal
- [ ] Double-click guard
- [ ] Failure surfaces error, no silent orphan

### Phase 4 — Document rename

- [ ] Two copies distinct; rename one only; persists in queue/header/folders

### Phase 5 — Canonical mapping

- [ ] Birthdate → `date_of_birth` intent, Child DOB field, no name format panel
- [ ] Notes unresolved by default

### Phase 7 — Lifecycle

- [ ] Complete / archive / delete refresh counts
- [ ] Re-cleanup to blank workspace

---

## Known seam with Field Platform audit

Processing review should migrate from `PROCESSING_BUILDER_CANONICAL_FIELDS` to the authoritative dynamic consumer (`canonicalDataProviderRegistry` / capability metadata) when that audit closes. Until then, extend the builder library + registry — do not add Processing-local field definitions.

---

## Validation (local)

```bash
cd web
npx tsc --noEmit
npm run test -- \
  tests/pos/questionResolutionModel.test.ts \
  tests/pos/processingReviewFieldMapping.test.ts \
  tests/pos/processingDevCleanup.test.ts
```

---

## Commit / PR gate

**Do not commit or merge until:**

1. Staging cleanup dry-run + apply verified
2. Blank workspace confirmed
3. Live New Form + rename + Birthdate QA pass
4. Generic Notes fix verified in UI
5. Targeted tests green

Suggested commit message (when ready):

```
fix(processing): reset test data and harden intake mapping
```
