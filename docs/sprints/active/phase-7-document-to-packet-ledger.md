---
owner: platform
status: active
last_reviewed: 2026-07-24
---

# Phase 7 — Document-to-Packet: Execution Ledger

Single source of execution truth. Plan:
[`../../platform/planning/phase7-document-to-packet-plan.md`](../../platform/planning/phase7-document-to-packet-plan.md).

Branch `agent/claude/1-phase7-document-packet-journey` (managed wt1, slot 1, port 3011). Base: `origin/staging`.
Do not push/merge until explicitly instructed.

**Server discipline note (accepted):** on 2026-07-24 the wt1 :3011 server had been reclaimed under the 3/3 server cap; `wt3-runtime-v1-polish` (a closed/merged initiative) was stopped to free a slot and wt1 restarted. Reversible; wt3 can be restarted. Keep the wt1 managed server healthy for certification; do not rely on unmanaged servers.

## Slice status

| Slice | Status | Acceptance outcome (walkable) |
|---|---|---|
| 0 — Fidelity generation + native signing proof | **done** | Real PDF filled + signed + flattened, immutable artifact + audit, automated + artifact verification (6/6 tests) |
| 1 — Source doc → reviewed published form (+OCR) | **backend done; UI+cert BLOCKED** | Upload real PDF, correct ≥1 field, preserve a consent section, publish; repeat with a scanned PDF |
| 2 — Complete packet composition | not started | Compose + preview packet: form + handbook + upload + acknowledgement + signature, assigned across 2 guardians |
| 3 — Participant launch + conversational completion | not started | Parent pastes info, confirms interpretation, uploads, resumes cross-session, reaches document review |
| 4 — Generation + review + signing in journey | not started | Guardian reviews + signs a faithful completed doc; flattened PDF + evidence retrievable |
| 5 — Submission + unified Mailroom review | not started | Completed packet reviewed as one coherent case |
| 6 — Targeted correction round-trip | not started | Request correction of one requirement, resubmit, receive back in same review |
| 7 — Approval, commit, filing, copies, resend | not started | Commit + file + retrieve from child record + send copy + simulate failure + resend |
| 8 — Full certification | not started | 23-step acceptance journey + full certification gate |

## Checkpoint log

### 2026-07-24 — Sprint bootstrap
- Accepted plan saved (`phase7-document-to-packet-plan.md`). Execution ledger created.
- Preserved commits: `ec4954888` (distribution-link/folder/embed addendum), `58280d1ac` (architecture-freeze closeout).
- Branch reconciliation onto latest `origin/staging`: see checkpoint below.

### 2026-07-24 — Slice 0: fidelity generation + native signing proof — DONE
- **Outcome now real (engine-level):** a source PDF is filled with fidelity (original-layout AcroForm fill + coordinate overlay), a signature (typed / drawn PNG / initials) is placed at the correct location, the output is flattened into an **immutable** signed artifact (0 fillable fields), with hashed source→populated→signed **version lineage** and per-signature **audit evidence** (kind, typed name, drawn-asset flag, signer id, intent-acknowledged timestamp, hashed IP, placement, provenance). Intent acknowledgement is a hard gate.
- **Files:** `web/lib/forms/pdf/generation/{types,fidelityEngine,enrollmentFixture}.ts`; test `web/tests/forms/pdf/fidelityEngine.test.ts`; dep `pdf-lib@^1.17.1`.
- **Tests/evidence:** 6/6 vitest green. Openable artifacts written to scratchpad `phase7-slice0-evidence/` (source/populated/signed PDFs + `lineage.json`): 3 distinct SHA-256s, `signed_is_flattened: true`, all 4 fields applied / 0 missed, typed-signature audit row. Fidelity of the unflattened doc verified via the form API; fidelity of the flattened signed doc verified via text extraction (filled values + signature present).
- **Defects reaffirmed (targets for later slices):** the production generator is still the `stubFormPdfGenerator` (plain-text) — Slice 4 swaps in this engine; the participant "drawn signature" is still a UUID field — Slice 4 wires real capture.
- **Deferred non-blockers:** pixel screenshot (browser pane blocked localhost/file:// this session — openable PDFs stand in); persistence of versions/audit to Documents + `form_submission_signatures` (Slice 4/7).
- **Non-goals honored:** no production UI, no storage/DB wiring — engine + proof only.
- **Commit:** _(below)_ · **Next:** Slice 1 (source document → reviewed, published form; + OCR path before final cert).

### 2026-07-24 — Stage A capability COMPLETE + unit-certified; Stage B OCR engine built; UI Playwright cert INCOMPLETE
- **Stage A capability (built, unit-tested, typecheck-clean):** section-disposition selector wired end-to-end — UI selector (`ProcessingQuestionReviewList`) → `PosTemplateSetupColumn` state → `section_dispositions` in the save payload → `/form-draft/save` → `buildManualFormDraft` (attaches disposition + **preserves section prose as static_text — no silent data loss**) → `draftFormToFormSchemaV1` emits the right controls (preserved `text_block` + `boolean`/`file_ref`/`signature`), all schema-valid. Disposition is NOT cosmetic (unit test asserts emitted schema per disposition). Plus **pre-create field-type editing** and **operator-language confidence** (High confidence / Review recommended / Needs attention). Fixed a latent `MintArgs` type error the typecheck caught.
- **Stage B OCR engine (built, proven offline):** `lib/pos/processingCase/structure/ocrExtract.ts` — tesseract.js (WASM, self-contained; core bundled; `eng.traineddata` in-repo at `ocr-data/`, loaded via local `langPath` — no CDN). `looksLikeImage` detection + `ocrImageBytes` (dynamic import; confidence + per-word bbox provenance; low-confidence flag at <70). Wired into the documents/upload route (image → OCR → extracted_text + `extraction_provider` + `metadata.ocr_*`). Proven: OCR'd the scanned enrollment fixture offline at confidence 66. **Dependency added: `tesseract.js@^5`** (+ `pdf-lib@^1.17.1` from Slice 0). Runtime: OCR is slow/CPU-heavy; runs best-effort inline (production should move to an async worker); deployment must ship `ocr-data/eng.traineddata` (~4MB); failure → null result + honest state (never silent empty).
- **Certification (Option B, authenticated headless Playwright) — PATH PROVEN, full cert INCOMPLETE:** `playwright/tests/phase7-document-to-form-native.spec.ts`. VERIFIED through real surfaces across 5 iterations: service-role auth ✓, Digital Mailroom Work modal ✓, **intent-modal upload of a real multi-section enrollment PDF ✓**, processing-case creation ✓, queue navigation ✓ (screenshots `web/docs/sprints/active/phase-7-evidence/stage-a-native/01,02`). **REMAINING BLOCKER:** after opening the imported case, the automated run does not reach the document form-SETUP review panel (`PosTemplateSetupColumn`) — the case opens as a regular review case; the setup/"detect questions" entry needs one more product step identified **interactively** (blind 8-min headless iterations were insufficient to locate it). Test marked `test.fixme` with a precise note (NOT a red-blocker, NOT false-green). Stage B (OCR) Playwright cert not yet authored (blocked behind the same setup-panel entry).
- **Fixtures added:** `tests/fixtures/processing/enrollment-multisection-acroform.pdf` (4-page AcroForm, page-per-section), `enrollment-scanned.png` (rasterized via macOS `sips` — no rasterizer dep).
- **Honest status:** the Stage A/B *capabilities* are real, unit-tested, and typecheck-clean; the *UI acceptance certification* is not complete — the operator-visible reviewed→published journey is not yet demonstrated green end-to-end in the automated test. Not declaring the slice complete.
- **Next (interactive):** identify the "set up / create form from this document" entry step in the case work column, wire it into the cert test, get Stage A green, then author Stage B OCR cert. Commits below.

### 2026-07-24 — Slice 1/2 (source doc → published form): backend increment DONE; UI + browser-cert BLOCKED
- **Delivered (production, tested):** section **disposition** model + **static/consent/signature text preservation** through the draft→schema pipeline. `recommendSectionDisposition` classifies each section (fields / static_reference / acknowledgement / upload / signature / initials / generated) with rationale + confidence and preserves the prose field-extraction otherwise discards; `draftFormToFormSchemaV1` now emits the right FormSchemaV1 constructs per disposition (preserved `text_block` + `boolean`/`file_ref`/`signature` control), all validating against the live zod schema. This is the deterministic core the operator review UI will drive.
- **Files:** `web/lib/pos/processingCase/formDraft/sectionDisposition.ts` (new); `web/lib/pos/processingCase/formDraft/types.ts` (+ `disposition`, `static_text` on section); `web/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1.ts` (disposition-aware). Test `web/tests/pos/sectionDisposition.test.ts`.
- **Tests/evidence:** new suite green; existing draft/schema suites green (44/45 across the 6 draft tests). Every disposition-mapped schema passes `validateFormSchema`, incl. a mixed enrollment draft (fields + upload + acknowledgement + signature).
- **Discovered pre-existing defect (NOT mine):** `deriveDocumentTitle` classification-label test fails on the reconciled staging base (`immunization_record` → "Child Medical Examination Report" vs expected "Immunization Record"); reproduces with my edits stashed. Unrelated to this slice; left untouched (scope discipline) — flagged for a separate fix.
- **BLOCKER (gates full acceptance of this and every operator slice):** the slice's acceptance requires **browser certification of the authenticated operator authoring experience** (upload → correct → publish). The in-app browser pane refuses `localhost` "by policy" this whole session, and the operator form-studio needs an authenticated Supabase session the pane cannot hold (auth = Playwright/service-role magic-link; credentials must not be handled here). Remaining operator-visible work that depends on this: the section-disposition selector + pre-create field-type editing in `ProcessingQuestionReviewList`, confidence visualization, the OCR scanned-document path, and publish-in-browser. **Awaiting a certification-path decision** (options in the checkpoint reply).
- **Commit:** _(below)_ · **Next:** unblock certification path, then finish the operator UI for this slice.

### 2026-07-24 — Certification path PROVEN + pre-create type editing (slice continuing)
- **Certification path proven (Option B):** authenticated headless Playwright runs against the managed :3011 server. The service-role helper (`ensureAdminPlaywrightSession`, env sourced from canonical `.env.local`, secrets never printed) successfully authenticates and the operator workspace loads. Evidence: `docs/sprints/archive/07_2026/processing-form-composer-v1-screenshots/01-workspace-authenticated.png`.
- **Existing acceptance surface confirmed:** `playwright/tests/processing-form-composer-v1-e2e.spec.ts` already drives upload real AcroForm PDF → detect → review (subject/canonical binding, packet-only, ignore, name-split) → generate → builder → save → preview → **publish**, with screenshots. That is most of this slice's acceptance path, already authored.
- **Delivered this increment:** **pre-create field-type editing** — the review inspector's "Answer type" is now an editable select (`review-type-<id>`) that persists through the existing save→create→schema path (save already carries `type`). Satisfies acceptance item "change one field type before creation."
- **Friction (not hard blockers, recorded):** (1) my :3011 server had been reclaimed under the 3/3 server cap; I stopped the closed-initiative `wt3-runtime-v1-polish` server to free a slot and restarted wt1 — reversible, restartable. (2) The existing E2E is **brittle under cold Next dev-compile** (first authenticated hit shows a "Thinking." spinner; fixed 60s waits + a stale `getByRole('dialog',{name:/Processing/i})` assertion time out). Not an auth/product break — needs a robust acceptance test (warm route, resilient selectors) which I'll author for this slice's cert.
- **Remaining to complete this slice (next turn(s), no stubs):** section-disposition selector wired UI (backend core already committed `beca88140`) + persistence through save/create; confidence/quality visualization surfaced explicitly; governed **OCR path** (image-only detection → server-side OCR → confidence/provenance → same review flow → no auto-publish low-confidence); a robust authenticated Playwright acceptance test for the full operator path + a second scanned/OCR path, with screenshots + trace/video-on-failure.
- **Commit:** _(type-editing below)_ · **Next (within this slice):** robust Playwright acceptance test + section-disposition UI wiring + confidence viz + OCR.

<!-- Append one checkpoint per slice: outcome now walkable · files/changes · tests/evidence · defects found · deferred non-blockers · commit · next slice -->
