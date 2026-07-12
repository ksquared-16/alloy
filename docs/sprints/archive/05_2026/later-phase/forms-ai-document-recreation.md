# Forms — AI-assisted document recreation (architecture)

**Status:** Planning (FD-7) — no OCR or extraction implementation in this sprint.

**North star:** Operator uploads PDF (or static document) → BOS produces an **editable draft** form schema + optional `document_composition` blocks for operator refinement in authoring.

---

## Parsing boundaries

| In scope (later) | Out of scope for v1 |
|------------------|---------------------|
| Layout structure (headings, paragraphs, tables as hints) | Handwriting OCR at scale |
| Detected field labels → question candidates | Auto-publish without review |
| Signature / initial regions → signature blocks | CRM writes from inferred values |
| Logo/header bands → branding zones | Legal compliance attestation |

**Rule:** Extraction produces **candidates**; platform save/publish paths remain operator-gated.

---

## Pipeline (staged)

```
Upload (PDF/DOCX/image)
  → Normalize to page images + text layer (vendor TBD)
  → Layout analysis (blocks, reading order)
  → Field hypothesis (labels, checkboxes, lines)
  → Block mapping (see below)
  → Structured draft JSON (form schema v1 + document_composition)
  → Authoring UI review (existing FormDocumentAuthoringShell)
```

OCR/text layer is a replaceable adapter; Alloy owns mapping and schema validation.

---

## Block mapping strategy

| Detected layout | Target |
|-----------------|--------|
| Title / section title | `document_composition` heading block |
| Body paragraph | `text` block (`format: plain` until rich editor) |
| Horizontal rule / whitespace band | `divider` or `spacer` |
| Logo / letterhead image | `image` block + `branding_zones.header` |
| Signature line / “Sign here” | `signature` block or `fields[]` signature type |
| Underlined blank after label | `fields[]` text/select with inferred label |
| Checkbox cluster | `boolean` or `multiselect` candidate |

Ambiguous regions become **instruction blocks** (text) rather than wrong required fields.

---

## Structured output targets

Primary artifact: `FormSchemaV1` draft compatible with `validateFormSchema`, plus optional:

```json
{
  "document_composition": {
    "version": 1,
    "blocks": [],
    "branding_zones": []
  }
}
```

Secondary artifacts (audit / replay):

- Source document asset id
- Extraction run id + model version
- Confidence scores per mapped field (stored server-side, not shown to families)

---

## Component model (suggested)

| Module | Role |
|--------|------|
| `DocumentRecreationJob` | Server job row: status, source_asset_id, org_id |
| `LayoutExtractionAdapter` | Pluggable OCR/layout vendor |
| `BlockMappingEngine` | Deterministic rules + optional LLM assist for label cleanup |
| `DraftSchemaBuilder` | Emits schema + composition; runs `safeParseFormSchema` |
| `RecreationReviewPanel` | Admin UI: side-by-side PDF thumb + field list (future) |

LLM assist (when enabled) may **propose** labels and section groupings; it must not bypass `DraftSchemaBuilder` validation.

---

## Implementation staging

| Phase | Work |
|-------|------|
| FD-7 | Doctrine + `documentComposition` types (shipped) |
| 1 | Job table + upload API + stub adapter returning fixture |
| 2 | Deterministic block mapper for digital PDFs with text layer |
| 3 | Operator review UI in authoring shell |
| 4 | Optional LLM label normalization behind feature flag |

---

## Alignment

- [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md) — mapped fields only when registry match exists
- [operating-doctrine.md](../execution/operating-doctrine.md) — no autonomous mutations
- `web/lib/forms/documentComposition.ts` — composition block contract
