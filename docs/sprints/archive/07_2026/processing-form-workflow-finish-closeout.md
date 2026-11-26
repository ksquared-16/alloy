# Processing Form Workflow Finish — Closeout (July 2026)

**Status:** Staging QA candidate — **not** Processing V1 complete.

Sprint branch: `feat/processing-form-workflow-finish` (from `origin/staging` @ `958341e25`).

Live browser QA is **still required** after deploy. Several behaviors must be exercised together in the real UI (auto-detect transition, pencil routing, generated-name first paint, published-state transition, site-aware link creation, unresolved-field generate path).

---

## Scope delivered

1. **Auto-detect** — `generate_form` intent + supported format triggers automatic question detection; manual gate for other intents/formats.
2. **Honest unsupported-format state** — PNG/image without OCR does not pretend detection succeeded.
3. **Pencil routing** — Stable question ID opens exact mapping inspector (not inline rename).
4. **Generate polish + unresolved policy** — Mapped / Form field only / Unresolved / Ignored; Review unresolved vs Generate anyway with confirmation.
5. **Name hydration** — `generated_form_name` → schema title; create returns `form_name`; first builder paint via `initialFormName`.
6. **Publish completion** — Persistent Published toolbar/state; builder stays open; Distribution immediately actionable.
7. **Publish vs Distribution** — Publishing a form version is separate from minting public distribution links.
8. **Site-aware distribution** — All-sites (org-wide) or selected-sites (one link per location); **one authored form**, no per-site form duplication.
9. **Inspector regrouping** — Local inspector hierarchy only; canvas and shell unchanged.
10. **Targeted tests** — Unit coverage under `web/tests/pos/`.
11. **This closeout doc.**

---

## Auto-detect and Re-detect semantics

- Auto-detect runs **only** when `processingIntent === "generate_form"` **and** `capabilitiesForFormat(...).questionDetection === true`.
- A per-case ref guard prevents duplicate auto-detect on the same case mount.
- Failed detection retains the uploaded source and exposes **Retry** (via `ProcessingNativeFormCreatingState`).
- **Re-detect questions** remains available in the review footer after initial detection.
- Unsupported formats (e.g. PNG without text extraction) show an honest message — no fake detect gate success.

---

## Unresolved generation policy

| Disposition | Meaning |
|-------------|---------|
| **Mapped** | Included with canonical destination |
| **Form field only** | Intentionally included without record storage |
| **Unresolved** | No operator disposition yet |
| **Ignored** | Excluded |

When **unresolved = 0**: **Generate native form** is primary.

When **unresolved > 0**:

- **Review unresolved** is primary.
- **Generate anyway** is secondary with explicit confirmation.
- Confirmation explains unresolved fields become form-only and will not write to business records.
- Provenance preserved (`evidence: unresolved_at_generate`); fields show **Needs destination** in builder canvas and inspector.
- Unresolved questions are **not** silently marked mapped.

---

## Publish vs Distribution

| Concept | Behavior |
|---------|----------|
| **Publish** | Toolbar action publishes the form **version** (draft → published). Toolbar shows **Published**; Republish is secondary. |
| **Distribution** | Separate inspector section mints **public links** on existing `form_public_links` after a published version exists. |

---

## All-sites vs selected-sites

- **All sites:** One org-wide distribution link (no `default_location_id`).
- **Selected sites:** One link minted **per selected location** on the **same** form definition.
- Server validates every location belongs to the authenticated organization (existing public-links route).
- Submission site/distribution metadata flows through existing public link metadata (`default_location_id`, link id on intake submit).
- Packet/source behavior is untouched.

---

## Temporary seam and next sprint

- **Field Platform:** `PROCESSING_BUILDER_CANONICAL_FIELDS` in `web/lib/forms/processingFormBuilderLibrary.ts` remains the curated interim consumer — not expanded in this pass.
- **Record identity resolution** (submission → candidate matches → existing vs new → proposed changes → operator approval → commit) is intentionally **out of scope** and remains the next separate sprint.

---

## Schema / API impact

| Area | Change |
|------|--------|
| DB migrations | **None** |
| `ProcessingCaseDetail` | +`processingIntent` |
| `POST .../form-draft/create` | Response +`form_name` |
| `POST .../form-draft/save` | Accepts field `description` |
| `POST .../forms/{id}/public-links` | Reused; location via `default_location_id` |

---

## Known limitations (staging)

- Format detection may fall back to filename extension when MIME is unavailable on the read model.
- Distribution link full URLs may require remint/reload verification live (one-time reveal security).
- Field catalog remains curated; not full Field Platform convergence.

---

## Post-deploy live QA checklist

### Imported form path

- [ ] Import PDF with Create a native form
- [ ] Detection starts automatically
- [ ] No Detect questions gate (for supported generate_form imports)
- [ ] Failure path offers Retry without re-upload
- [ ] Re-detect remains available
- [ ] Pencil on Birthdate opens Birthdate mapping
- [ ] Pencil on another question opens that exact question

### Generate

- [ ] Form setup has clear hierarchy
- [ ] Destination labels are readable (not raw refs primary)
- [ ] unresolved = 0 → Generate primary
- [ ] unresolved > 0 → Review unresolved primary; Generate anyway + confirmation
- [ ] Generated unresolved fields show Needs destination
- [ ] Entered form name appears immediately in builder

### Publish

- [ ] Publish pending state
- [ ] Toolbar becomes Published
- [ ] Builder remains open
- [ ] Public link / iframe actions visible
- [ ] Reopen retains Published
- [ ] Republish works

### Distribution

- [ ] Create all-sites link
- [ ] Create one selected-site link
- [ ] Select multiple sites → one link per site
- [ ] Copy/Open actions work
- [ ] Cross-org locations rejected
- [ ] Public submission retains distribution and site metadata

### Direct form path

- [ ] Studio → New Form → builder auto-opens
- [ ] Add/edit fields, publish, manage distribution
- [ ] Same builder/publish behavior as generated form

### Inspector

- [ ] Form settings hierarchy reads clearly
- [ ] Question / Section settings open correctly
- [ ] Content / Layout / Destination / Branding / Distribution coherent
- [ ] No canvas regression
