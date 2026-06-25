# POS Reset — Shell, Forms, Documents, Packets & Parent Experience

> **Status:** Planning artifact for the POS reset. Audit + product model + phased implementation plan.
> **Direction:** Stop FP8. Stop backend recommendation/matching work. Re-center on the POS product shell and the user (operator + parent) experience.
> **Branch context:** `claude/pos-comms-clean-20260612`. Grounded in current code under `web/`, not aspiration.

---

## 0. What I found (audit summary)

The good news up front: **the POS reset is already half-seeded in the code.** The hard infrastructure (forms engine, packet sessions, processing cases, the Sources→Processing on-ramp) exists and ships. What is missing is the *shell* — the POS workspace that makes all of it feel like one product instead of scattered routes. That is exactly the gap this plan closes, and it is mostly UI/IA work, not new backend.

**Current admin shell.** AdminV2 (`web/app/adminV2/`) is the canonical app; `legacy-admin/` is archival. The sidebar (`web/app/adminV2/components/Sidebar.tsx`) already replaced the old **Forms** nav slot with a **Processing** entry (commented `POS-FP-W`) that opens a context-preserving **workspace modal** — `ProcessingModal.tsx` — with two tabs: **Processing** (queue + case detail) and **Sources** (`SourcesPanel.tsx`, "where information enters Alloy — Forms, Packets, …"). So a proto-POS shell exists, but as a *modal*, not the left-nav POS pillar the vision docs (POS-04, POS-13) describe.

**Processing.** Real and sound. Tables `processing_cases` + `processing_case_sources` (migration `20260612120000_pos_processing_cases_v1.sql`); thin envelope + polymorphic sources; lifecycle `received → processing → needs_review → needs_resolution → ready → completed → archived`. Queue read-model (no N+1), queue API (`/api/admin/processing/queue`), case drawer (`ProcessingCaseDrawer.tsx` / `ProcessingCaseDetailContent.tsx`), and approve route all exist. Form and packet submissions already open cases via `maybeOpenProcessingCaseFromFormSubmissionSafe.ts` / `...FromPacketCompletionSafe.ts`, gated by `isPosConnectedSurface` (`lib/forms/binding/posConnectedMarker.ts`) so legacy forms are untouched.

**Forms.** Mature submission system. Schema `FormSchemaV1` (`lib/forms/schema.ts`) with sections/fields, field types (text/number/date/boolean/select/multiselect/file_ref/signature/group), validation, visibility, and `field_source` CRM binding. Public render via `FormEngineRenderer.tsx` + `/forms/embed/[token]` + `/api/public/forms/[token]`. Submission capture/validation (`validateSubmission.ts`), intake/CRM linking (`lib/forms/intake/`), lifecycle coverage (`lib/forms/lifecycle/`), and PDF composition mapping (`documentComposition.ts`). Versioned draft/publish.

**Layout Builder (Layout V2).** Separate system (`lib/layout/`): grid document model (`layoutV2.ts`: sections → rows → columns → items), a normalized **field catalog** (`fieldCatalog.ts`, namespaced `refKey`s + render hints), pure immutable **builder ops** (`builderOps.ts`), versioned repo (`entity_layouts` table), resolver + runtime (flag `LAYOUT_RUNTIME_ENABLED`), and a builder UI under `adminV2/settings/layouts/`. **It is display-only / read-only** — it renders existing records into drawers and queues; it does not capture input.

**Documents.** Storage only. `documents` table + upload to Supabase bucket `org_documents` (`/api/admin/documents/upload`), signed-url reads, and a list UI (`legacy-admin/documents/DocumentsClient.tsx`). **No AI extraction. No document→form generation.** Form→PDF generation exists but produces **stub PDFs** from a mapping contract (`createGeneratedPdfForSubmission.ts`), triggered on packet approval (`ensureGeneratedPdfsForApprovedPacketSession.ts`).

**Packets.** Production-ready for *linear* multi-form enrollment. Tables `form_packet_definitions / items / sessions / session_items` (migration `20260510120000`). Builder UI (`adminV2/forms/packet-definitions/`), packet-aware public flow (`FormEmbedClient.tsx` shows "Step X of Y"; `advancePacketSessionAfterSubmit` carries `shared_values` across steps), operator review console (`PacketSessionReviewClient.tsx` + review API + rollup), and stub-PDF generation on approval. **Missing:** in-flow document upload, e-signature provider, and automated email send (template helpers exist in `enrollmentPacketEmailTemplate.ts`; no send path).

**Bottom line:** Processing, Forms, and Packets each work in isolation. The product does not yet *feel* like POS because they live in different routes/modals and the parent-facing flow is a sequence of separate forms, not one guided packet. Phase 1 is therefore an **assembly and shell job**, not a build-from-scratch job.

---

## 1. Updated POS product model

POS is **the system for configuring and operating information intake** — not just a Processing queue. It has two faces over one spine.

**The spine (already real):** information enters as a **Source** → a **Processing Case** is opened → it is reviewed/resolved → an approved **Outcome** creates/links/updates records. This matches POS-02's object language and the shipped `processing_cases` model. Nothing here changes; we build the shell around it.

**Face A — Operator/Admin workspace (the POS pillar).** A single left-nav workspace where the operator lives, with native sub-surfaces:

| Sub-surface | What it is | Backed by today |
|---|---|---|
| **Processing** | Queue of active cases + case workspace (review/resolve/approve) | `processing_cases`, queue read-model, case drawer ✅ |
| **Forms** | Forms library + builder (native, not a link-out) | forms engine + `adminV2/forms` ✅ |
| **Packets** | Packet library + builder + session review | packet tables + `adminV2/forms/packet-definitions` & `/packets` ✅ |
| **Documents** | Document library + **two upload actions** (→ form, → data) | `documents` storage ✅; upload actions = new |
| **Sources** | Where information enters (forms/packets/uploads/email) feeding Processing | `SourcesPanel.tsx` ✅ |
| **Settings / rules** | POS configuration: which surfaces are POS-connected, outcome rules (later) | `isPosConnectedSurface` marker ✅; rules UI = later |
| **Imports** | Bulk intake | future, stub nav only |

The operator should never bounce to a legacy route to do core intake work. Everything above is reachable inside the POS shell.

**Face B — Parent/end-user packet experience.** One guided packet (see §2) made of multiple underlying forms/documents, presented as a single fluid flow, not "form after form."

**Forms ↔ Layout Builder relationship (the three questions, answered).**

1. *What overlaps?* The **field catalog/picker**, the **render-hint vocabulary**, the **grid section/row/column builder primitives** (`builderOps.ts`), the **visibility-condition** shape, and the **draft/publish versioning** pattern. These are presentation/authoring concerns and are genuinely shared.
2. *Can Forms converge on Layout Builder architecture?* **Partially, and only at the authoring/chrome layer** — Forms should reuse the Layout Builder's field catalog and grid builder *chrome* so a form is built the same way a layout is. They should **not** share a runtime: Layout Builder is read-only display; Forms own input capture, validation, signatures, and submission. Forcing a full merge would break Forms' ability to carry custom unmapped fields and repeating groups.
3. *Smallest path to make Forms feel native in POS?* Mount the existing Forms library/builder **inside the POS shell** as a sub-surface (no new builder), and adopt the Layout Builder's section-panel chrome so it visually matches Processing. That is an IA + styling change, not a rewrite.

---

## 2. Parent packet model

A parent receives **one** guided enrollment packet and moves through a fluid flow. Underneath, it is a `form_packet_session` (which already exists) plus two new step *kinds* and a cover/review/submit frame.

**Parent-visible flow:**

1. **Confirm family/child information** — a pre-filled confirm step (seeded from `crm_snapshot` / `shared_values`, both already carried by the session).
2. **Upload required documents** — immunization, ID, state forms. *New step kind:* a document-upload step (today packets only accept form answers).
3. **Review generated forms** — consent, policy acknowledgements, state-required forms rendered from the packet's forms (existing `FormEngineRenderer`).
4. **Sign once / sign where required** — typed/drawn signatures already captured (`form_submission_signatures`); the model presents a single signing moment rather than per-form signatures.
5. **Submit once** — single terminal step; the session completes (`advancePacketSessionAfterSubmit` → `completed`).

**Behind the scenes (target; phased):** generate the required forms/documents → save final PDFs → email copies to parents → attach PDFs to the correct child/family records → open Processing Cases **only** for review/exception items → let an operator review when extraction/matching needs confirmation.

**What is real today vs. new:** the session, step sequencing, shared values, operator review, and stub-PDF-on-approval are real. **New for the parent model:** the single guided *frame* (cover → steps → one sign → one submit), the **document-upload step kind**, and presenting signatures as one moment. **Explicitly deferred** (per your instruction — do not overbuild): real e-signature provider, real final-PDF rendering, and automated email delivery. We build the *seams* for these now, not the implementations.

---

## 3. Build now vs. later

**Build now (Phase 1 — shell + assembly, visible product):**

- POS workspace shell as a **left-nav pillar** with sub-surfaces, looking like the POS-13 mockup **even when empty**.
- Forms library/builder mounted **natively inside POS** (no jarring link-out).
- Packet library + session review surfaced inside POS; the **packet concept made visible**.
- Documents library inside POS, with **two visible upload actions**: *upload → generate form* and *upload → extract data*.
- Processing surface promoted from modal to a first-class POS surface, ready to show review/exception work.
- Empty/first-run states for every surface (POS-04 specifies these).

**Build next (Phase 2 — parent packet frame):**

- The single guided parent packet frame (cover → confirm → upload → review → sign once → submit).
- The **document-upload step kind** inside packets.
- Wiring the two document upload actions to real outcomes: *→ data* opens a Processing Case (`source_kind = document/upload`, status `needs_review`) with a stubbed extraction for operator confirmation; *→ form* opens the form builder pre-seeded with a draft.

**Build later (Phase 3+ — intelligence & delivery, do NOT start now):**

- Real AI extraction (document → structured values) feeding the Extraction object.
- Real document-structure detection (document → draft form fields).
- E-signature provider integration (schema seams already reserved).
- Final-PDF rendering (replace stub PDFs).
- Automated packet/completion email delivery (templates already exist).
- Backend matching / recommendation engine UI — **stopped, per direction.**

---

## 4. Exact visible UI changes for the next sprint (Phase 1)

The intent: maximum *visible* product progress for minimum backend. Most of this reuses components that already exist.

**4.1 Promote Processing modal → POS workspace pillar.**
- Add canonical prefix `/admin/pos` in `lib/admin/canonicalAdminRoutes.ts` (mirror the existing `/admin/processing` entry) + an `isCanonicalPosPath()` predicate.
- Add a **POS** pillar to `Sidebar.tsx` whose sub-nav is **Processing · Forms · Packets · Documents · Settings** (POS-13's left-nav pillar). The current Processing button (`dispatchAdminV2OpenProcessingModal`) becomes the Processing sub-surface entry.
- Reuse `ProcessingModal.tsx`'s existing two-tab content as the shell's body, but render it inside the workspace shell (`WorkUnitWorkspace` / `WorkspaceShellLayout`) rather than a modal, so it owns the canvas and matches the mockup.

**4.2 Forms native inside POS.**
- Route `/admin/pos/forms` renders the existing Forms library + `FormDetailClient` builder *inside* the POS shell chrome (no navigation out to `/admin/forms`).
- Apply the Layout-Builder section-panel chrome (`DrawerOverviewPanelShell` styling) so Forms visually matches Processing.

**4.3 Packet concept made visible.**
- Route `/admin/pos/packets` surfaces the existing packet-definitions list/builder and the session review console (`adminV2/forms/packet-definitions/` + `adminV2/forms/packets/`) as POS sub-surfaces.
- Add a visible "one parent flow = multiple forms/documents" representation on the packet detail (it already stores ordered items).

**4.4 Document upload actions visible.**
- Route `/admin/pos/documents` renders a documents library (reuse `DocumentsClient.tsx` logic) with two prominent primary actions:
  - **Upload → generate form** — uploads via existing `/api/admin/documents/upload`, then opens the Forms builder with a placeholder draft (no AI yet; the *affordance* is the deliverable).
  - **Upload → extract data** — uploads, then opens a Processing Case (`source_kind = document`/`upload`, status `needs_review`) so the case appears in the Processing queue immediately. Extraction is stubbed/manual for now.

**4.5 Processing ready for review/exception work.**
- Surface the lifecycle lane filters (All · Needs review · Needs resolution · Ready · Completed) per POS-04 Screen 2, using the existing queue read-model counts.

**4.6 Empty states everywhere.** Each surface ships its first-run copy (POS-04), e.g. Processing: *"No active processing. New information will appear here as it enters Alloy."* This is what makes the empty shell still look like the product.

---

## 5. What existing code to reuse

| Need | Reuse | Path |
|---|---|---|
| POS shell chrome | Workspace shell + work-unit layout | `adminV2/components/AdminV2Shell.tsx`, `WorkUnitWorkspace` |
| Processing surface | Queue list + case detail + drawer | `adminV2/processing/ProcessingQueueList.tsx`, `ProcessingCaseDetailContent.tsx` |
| Sources tab | Existing Sources panel | `adminV2/processing/SourcesPanel.tsx` |
| Forms native | Forms builder + library | `adminV2/forms/`, `FormDetailClient`, `lib/forms/schema.ts`, `FormEngineRenderer.tsx` |
| Packets | Definitions/items + sessions + review | `adminV2/forms/packet-definitions/`, `/packets/`, `lib/forms/packets/` |
| Documents | Storage, upload, list | `/api/admin/documents/*`, `legacy-admin/documents/DocumentsClient.tsx` |
| Section-panel styling | Drawer panel chrome | `DrawerOverviewPanelShell` |
| Forms-builder convergence | Field catalog + grid builder ops + render hints | `lib/layout/fieldCatalog.ts`, `builderOps.ts`, `layoutV2.ts` |
| Source → case on-ramp | POS-connected gate + case opener | `lib/forms/binding/posConnectedMarker.ts`, `maybeOpenProcessingCaseFrom*Safe.ts` |
| Parent packet flow | Packet-aware public embed + advancement | `forms/embed/[token]/FormEmbedClient.tsx`, `advancePacketSessionAfterSubmit` |
| Signatures | Typed/drawn capture | `lib/forms/signatures/persistFormSubmissionSignatures.ts` |

---

## 6. What to defer

- **All backend matching / recommendation engine work and UI — stop now (FP8).**
- Real AI document extraction and document-structure-to-form detection (Phase 3 seams only).
- E-signature provider integration (schema fields reserved; no wiring).
- Final-PDF rendering (keep stub PDFs).
- Automated email delivery of packets/completions (templates exist; no send).
- Cross-device parent resume (magic-link), multi-household packet grouping, conditional packet steps, per-child step cloning, bulk Imports.
- A full parent portal — only the single guided packet flow is in scope, nothing more.

---

## 7. Implementation plan — next visible product pass

**Phase 1 — POS shell + native surfaces (the visible win).**
1. Add `/admin/pos` canonical prefix + `isCanonicalPosPath` (`canonicalAdminRoutes.ts`).
2. Add the POS pillar + sub-nav to `Sidebar.tsx` (Processing · Forms · Packets · Documents · Settings).
3. Render the existing Processing/Sources content inside the workspace shell instead of the modal.
4. Mount Forms library/builder at `/admin/pos/forms` (native, in-shell).
5. Surface Packets (definitions + session review) at `/admin/pos/packets`.
6. Build `/admin/pos/documents` with the two upload actions (upload works; extract/generate are stubbed affordances that produce a Processing Case / a draft form).
7. Ship empty states + lifecycle lane filters on Processing.
8. **Verify:** typecheck/build, click each surface, confirm a form submission still opens a Processing Case end-to-end.

*Exit criterion:* an empty POS workspace that looks like the mockup, Forms living inside it, Packets visible as one-flow-many-forms, both document upload actions visible, and Processing ready for review work.

**Phase 2 — parent packet frame.**
1. Add a packet cover/landing + single review/sign/submit frame over the existing session flow.
2. Add the **document-upload step kind** to packet items + `FormEmbedClient`.
3. Wire upload actions to real outcomes (case for *→ data*, draft for *→ form*).
4. **Verify:** a parent can move through confirm → upload → review → sign once → submit on one link; operator sees the session in review.

**Phase 3+ (later, not now):** real extraction, document→form detection, e-sign, final PDFs, email delivery.

**Working agreement:** Claude owns POS, documents/forms, communications, and sprint packages. Work stays on a `claude/` branch and is pushed for review — no direct pushes to `staging` without explicit sign-off.

---

### Appendix — repo boundary check (run before each task)

```
pwd                 → /Users/Kelly/Alloy-Claude
git branch --show-current → claude/pos-comms-clean-20260612
git remote -v       → origin git@github.com:ksquared-16/alloy.git
```
Only operate in `/Users/Kelly/Alloy-Claude`. Never touch `/Users/Kelly/Alloy` or `/Users/Kelly/Claude/Projects/Alloy`.
