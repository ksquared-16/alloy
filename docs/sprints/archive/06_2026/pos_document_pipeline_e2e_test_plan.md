# POS Document Pipeline — End-to-End Test Plan

> **Scope of the chain under test:** Document Upload → Processing Case → Classification → Operator Correction → **Intake Extraction Result**.
> **Hard boundary:** this plan stops at *proposed values* (intake field candidates). It does **not** test — and the system must **not** perform — record matching, record updates, payment posting, subsidy/billing changes, or any commit. Those are the next sprint and must wait until this pipeline passes.
> **Pipeline commits under test:** `b7bc3fee` (non-form sources) · `e0badd31` (classification) · `940661f9` (classification UI) · `92e922bd` (operator correction) · `abfea734` (extraction, Sprint 3 original) · `8a6a25d8` (vendor shared Intake Engine) · `8b25102a` (extraction refactored onto shared Intake contracts).
> **Intake alignment:** POS no longer owns an extraction/proposal model. A document case now flows through the shared engine: `Document → IntakeSourceEnvelope → IntakeFact[] → IntakeFieldCandidate[]`. The result is stored at `processing_cases.metadata.extraction` as `{ source, facts, candidates, review_warnings, extractor_version, extracted_at }`.

---

## 0. What "done" means

The pipeline is validated when, for each realistic document below, a tester can:

1. Upload it with `open_processing_case=true` and see exactly one Processing Case open (idempotent on re-open of the same source).
2. See an honest **classification** (right label + confidence, or honest `unknown`).
3. **Correct** the classification as an operator and see only annotation change (no lifecycle/record change).
4. See an honest **intake extraction result** — `source` + `facts` + `candidates` (+ `review_warnings`), or honestly empty `candidates` — never fabricated.
5. Confirm throughout that **case status never leaves `received`**, no business record is created/updated, and no "commit/apply" ever fires.

Two test layers: **(A) automated unit/integration** (runnable in the repo's `vitest`), and **(B) manual environment walkthrough** (needs a running app + Supabase).

**Key model note (facts vs. candidates):** `facts` are *source-agnostic* and are extracted **regardless of classification**. `candidates` are produced by the classification-scoped POS mapping profile. So a document can have facts but **no** candidates (e.g. an `unknown` document whose metadata still contains a date yields a `date` fact and zero candidates). This is correct, not a bug.

---

## 1. Realistic childcare fixtures

`metadata` is the structured payload an upload surface may attach; when omitted, extraction honestly falls back to filename/title only. Confidence is the shared string tier (`high` for explicit metadata, `medium` for a filename-derived date) — **not** a number.

### Fixture S1 — Subsidy contract (rich metadata)
- **file:** `CCAP_Subsidy_Contract_BrightFutures_JaneDoe.pdf`, mime `application/pdf`
- **metadata:** `{ "agency_name": "Bright Futures DHS", "child_name": "Jane Doe", "authorization_start_date": "2026-07-01", "authorization_end_date": "2026-09-30" }`
- **expect classification:** `subsidy_contract`, status `classified`, confidence > 0
- **expect facts (3):** `person_name` (role_hint `child`, "Jane Doe"), two `date` facts ("2026-07-01", "2026-09-30") — all confidence `high`. (Agency is **not** a fact — no org fact_type; see §6.)
- **expect candidates (4):** `agency_name`="Bright Futures DHS" (`fact_ids: []`), `child_name`="Jane Doe", `authorization_start_date`="2026-07-01", `authorization_end_date`="2026-09-30" — each shared `IntakeFieldCandidate`, confidence `high`.

### Fixture S2 — Subsidy contract (filename only, no metadata)
- **file:** `subsidy_voucher_ccap_2026.pdf`, no metadata
- **expect classification:** `subsidy_contract` (filename keywords "subsidy"/"ccap")
- **expect facts:** **empty** ("2026" alone is not a full date).
- **expect candidates:** **empty** (no signals) — honesty case, not a failure.

### Fixture R1 — Remittance (rich metadata)
- **file:** `State_CCAP_Remittance_July2026.pdf`
- **metadata:** `{ "payer": "State CCAP", "amount": "$1,250.00", "payment_date": "07/15/2026" }`
- **expect classification:** `remittance`
- **expect facts (2):** `amount` ("1250", normalized), `date` ("2026-07-15", normalized) — confidence `high`.
- **expect candidates (3):** `payer_name`="State CCAP" (`fact_ids: []`), `payment_amount`="1250", `payment_date`="2026-07-15".

### Fixture R2 — Remittance (date in filename only)
- **file:** `remittance_2026-07-15.pdf`, metadata `{ "payer": "State CCAP" }`
- **expect facts (1):** a `date` fact "2026-07-15" with confidence `medium` and `evidence: "filename"`.
- **expect candidates (2):** `payer_name`="State CCAP" (`high`, `fact_ids: []`); `payment_date`="2026-07-15" (`medium`, backed by the filename date fact). Confirms underscore-adjacent filename dates are parsed.

### Fixture I1 — Immunization record
- **file:** `Immunization_Record_SamLee.pdf`, metadata `{ "child_name": "Sam Lee", "immunization_date": "2026-05-02" }`
- **expect classification:** `immunization_record`
- **expect facts (2):** `person_name` (child, "Sam Lee"), `date` ("2026-05-02").
- **expect candidates (2):** `child_name`="Sam Lee", `immunization_date`="2026-05-02".

### Fixture E1 — Enrollment document
- **file:** `Fall2026_Enrollment_Registration.pdf`
- **expect classification:** `enrollment_document`
- **expect facts:** **empty** (no metadata, "Fall2026" is not a date).
- **expect candidates:** **empty** (no field targets in this first slice — intended gap, see §6).

### Fixture U1 — Unknown document (no metadata)
- **file:** `IMG_4821.pdf`, mime `application/pdf`, no metadata
- **expect classification:** `unknown`, status `unknown`, confidence `0`, no signals
- **expect facts:** **empty**; **expect candidates:** **empty**.

### Fixture U2 — Unknown document WITH typed metadata (facts-without-candidates honesty)
- **file:** `scan_misc.pdf`, metadata `{ "some_date": "2026-08-01" }`, classifies `unknown`
- **expect facts (1):** a `date` fact "2026-08-01" (facts are classification-agnostic).
- **expect candidates:** **empty** (the `unknown` profile maps nothing) — proves facts can exist with zero fabricated candidates.

### Fixture F1 — Form-backed source (negative/guard)
- A POS-connected **form submission** or **packet** case (not a document upload).
- **expect:** classification panel **hidden** (form/packet aren't classified here); no extraction; existing form recommendation path (`ReviewDecideCard`) unchanged.

---

## 2. Layer A — automated tests

Run as the regression gate:

```
cd web && npm test -- tests/pos/processingCaseNonFormSource.test.ts \
  tests/pos/processingCaseClassification.test.ts \
  tests/pos/classificationPanelView.test.ts \
  tests/pos/processingCaseClassificationCorrection.test.ts \
  tests/pos/processingCaseExtraction.test.ts
```

| Concern | Suite | Fixtures |
|---|---|---|
| Non-form case opens, idempotent, org-scoped, honest commit no-op | `processingCaseNonFormSource` | S1–U2 |
| Classification labels + honest unknown/unsupported + determinism | `processingCaseClassification` | S1, R1, I1, E1, U1, F1 |
| Classification panel render states (hidden for forms) | `classificationPanelView` | all + F1 |
| Operator correction: valid/invalid pairs, annotation-only, org scope, no status/record/commit | `processingCaseClassificationCorrection` | S1→R1 correction, U1 |
| Intake extraction: document→facts, facts→shared candidates, unknown→no candidates, confidence preserved, empty when no signal, annotation-only, no commit | `processingCaseExtraction` | S1, S2, R1, R2, I1, U1/U2 |

**Gap to add (Layer A) before sign-off:** a thin **route-level** integration test for `PATCH /classification` and the upload on-ramp (auth + org rejection + 400 on bad body). Currently verified by pure-logic suites + typecheck only. Tracked in §6.

---

## 3. Layer B — manual environment walkthrough

Run against a dev app + Supabase with an authenticated admin/ops user in a known `org_id`.

### B1. Upload → Case (per fixture)  *(asserts items 1, 2, 4)*
1. `POST /api/admin/documents/upload` multipart with the fixture file, `entity_type`+`entity_id` (a real CRM entity in the org), and **`open_processing_case=true`** (plus `metadata` where the fixture specifies it).
2. **Assert:** response has `processing_case_id` set, `classification_key` matching the fixture, and **`extraction_candidate_count`** matching the fixture's expected candidate count.
3. Re-POST the **same** source → **assert** the same `processing_case_id` (idempotent; no duplicate case). *(Idempotency is per `(org, source_kind, source_id)`; a fresh upload makes a new `documents` row → new source id. Re-open from the same document id to test true idempotency.)*
4. **DB assert:** `select status, case_type, metadata from processing_cases where id = :id` →
   - `status = 'received'` (unchanged),
   - `case_type` = classification key,
   - `metadata.classification` present, and `metadata.extraction` present with the new shape (see B4).

### B2. Classification visible in detail UI  *(asserts item 2)*
1. Open the Processing Case detail (modal or drawer).
2. **Assert** the Classification panel shows label, `classification_key`, confidence %, status, signals, and `classified_at`. For U1 it shows "Unknown document / No confidence"; for F1 the panel is **absent**.
3. **Assert** the recommendation areas do **not** show fabricated proposed identity for a document case (they show "Manual review" / "No proposed values").

### B3. Operator correction  *(asserts item 3)*
1. On S2 (classified `subsidy_contract`) press **Confirm** → network `PATCH /classification` `{subsidy_contract, classified}`.
2. On U1 press **Change classification** → pick `immunization_record` → **Apply**.
3. On any case press **Mark unknown**.
4. **Assert (per action):** 200; panel reloads with the new key; `metadata.classification.signals[0].source === "operator"`; classification confidence `0.95` (classified) or `0` (unknown) — *classification confidence remains numeric; this is unrelated to the string-tier confidence on extraction candidates*; `corrected_at` set; `classifier_version === "operator"`.
5. **DB assert (item 8, 9):** `status` unchanged; `processing_case_sources` rows unchanged; no new `persons`/`customers`/`opportunities` rows; `case_type` updated to the corrected key only.

### B4. Intake extraction result (read model)  *(asserts items 4, 5, 6, 7)*
1. `GET /api/admin/processing/cases/:id` → **assert** `data.detail.extraction` is the intake-aligned object and includes **all** of:
   - `source` — an `IntakeSourceEnvelope` (`source_id`, `source_kind === "document"`, `captured_at`, `raw_material`, `metadata`),
   - `facts` — `IntakeFact[]`,
   - `candidates` — `IntakeFieldCandidate[]`,
   - `review_warnings` — `string[]` (often `[]`),
   - `extractor_version` — `"fp10.2-intake"`,
   - `extracted_at` — ISO timestamp.
2. **Candidate shape (item 6):** every entry of `candidates` has the shared `IntakeFieldCandidate` fields — `payload_key`, `rule_id`, `value`, `confidence ∈ {high,medium,low,invalid}`, `fact_ids: string[]`, `validation_state`. (No POS-specific `field_key`/`signals` shape exists anymore.)
3. **Fact shape (item 7):** every entry of `facts` has the shared `IntakeFact` fields — `fact_id`, `fact_type` (a member of the shared `IntakeFactType` enum), `raw_value`, `normalized_value`, `confidence ∈ {high,medium,low}`, `validation_state`, and (where applicable) `evidence`, `role_hint`.
4. **Honest empties:** for S2/E1/U1 → `candidates` is `[]` (not absent-as-error, not fabricated). For U2 → `facts` is non-empty but `candidates` is `[]` (item 10).
5. **Org/agency (item 11):** for S1 the `agency_name` candidate and for R1/R2 the `payer_name` candidate have **`fact_ids: []`** — surfaced from `source.metadata`, because `IntakeFactType` has no organization/agency type (design gap, §6).
6. **Correction does not re-run extraction** — note as a known gap (§6): correcting classification in B3 does **not** re-run extraction; the stored `extraction` stays as-is. Verify it's internally consistent and flag for the matching sprint.

### B5. Negative / safety assertions — run across all fixtures  *(asserts items 8, 9)*
- No row ever appears in business tables (`persons`, `customers`, `customer_members`, `opportunities`; `documents.extracted_data` stays untouched; no payment/charge rows).
- `processing_cases.status` is `received` for every case at every step (no lifecycle change).
- No "approve/commit" was triggered; `metadata.operational_result` is absent.
- Cross-org: repeat B1 with a different `org_id` context and the same case id → **404 / not found** (org scoping).

---

## 4. Confidence & honesty checks (explicit)

- **Confidence preserved end to end:** the string tier on `metadata.extraction.candidates[].confidence` (and `facts[].confidence`) equals what the pipeline produced (`high` for explicit metadata, `medium` for a filename-derived date) and survives the read model unchanged.
- **No fabrication:** for every fixture with missing fields (S2, E1, U1), the corresponding candidate is **absent**, never a guessed/empty value. For U2, facts may exist with zero candidates.
- **Determinism:** uploading the same fixture twice yields byte-identical `facts` and `candidates` (modulo `extracted_at`/`captured_at`/`classified_at` timestamps).
- **Operator authority is honest:** corrected *classification* confidence is exactly `0.95` (never `1.0`). (Extraction candidate confidence is a string tier, separate from classification confidence.)

---

## 5. Pass/fail gate before the next sprint

Proceed to matching/commit work **only when all** of:
- Layer A suites green in-toolchain (`npm test -- tests/pos/…`).
- Layer B B1–B5 pass for S1, S2, R1, R2, I1, E1, U1, U2, F1.
- Every "Negative / safety" assertion in B5 holds for every fixture.
- The §6 known gaps are explicitly accepted (not silently shipped).

---

## 6. Known gaps to accept or close before matching

1. **No org/agency fact type (design gap).** The shared `IntakeFactType` enum has no organization type, so subsidy `agency_name` and remittance `payer_name` are **not** facts — they're surfaced as candidates read from `source.metadata` with `fact_ids: []` (the existing `household.source`/`household.notes` precedent). *Recommendation:* propose a future `organization_name` / `entity_name` fact type to the Intake Engine owners so org-level values flow through the fact layer like everything else. Do **not** invent it unilaterally in POS.
2. **No route-level automated tests** for `PATCH /classification` and the upload on-ramp (auth, org 404, 400 on bad body). Pure logic is covered; the HTTP layer is verified only by typecheck + manual B-layer. *Recommend closing in Layer A.*
3. **Correction does not re-run extraction.** Changing the classification leaves the prior `metadata.extraction` in place; its candidates still reflect the *original* classification profile. Decide: re-extract on correction, or surface a "candidates out of date" flag. *Manual B4.6 watches for this.*
4. **`enrollment_document` and `form_like_document` have no mapping targets** yet → always empty candidates (facts may still be produced). Intended for this slice.
5. **Real document text is never available** (no OCR; `documents.extracted_text` is unwired). All extraction is metadata/filename-derived. By design for this sprint; bounds what B-layer can expect.
6. **Idempotency is per `(org, source_kind, source_id)`**, so re-uploading the *same bytes* as a new `documents` row opens a new case. Clarify expected operator behavior (dedupe on checksum?) before matching.
7. **No extraction UI yet** — `facts`/`candidates` are exposed on the read model only. A candidates section in the detail screen is deliberately deferred.

---

## 7. Out of scope (must NOT appear in any test as a pass condition)

Record matching, person/household resolution into real records, record creation/update, payment posting, subsidy/billing mutation, e-signature, email delivery, OCR, and any LLM/AI extraction. If any of these occur during testing, that is a **failure**, not a feature.
