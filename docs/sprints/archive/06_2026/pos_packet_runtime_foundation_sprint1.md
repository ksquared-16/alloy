# Sprint 1 — Packet Runtime Foundation (design report + slice)

Branch: `claude/pos-packet-parent-submission-20260622`

Goal: an operator selects a **generated Alloy form template**, creates a **packet**, opens
a **shareable parent URL**, and views the **packet shell** backed by real packet data.
No submission, no PDF generation, no review, no duplicate detection.

---

## 1. Audit — existing reusable packet components

The forms engine already provides a complete packet runtime. The vertical slice is
**orchestration over existing primitives**, not new infrastructure.

| Capability | Existing component (reused) |
| --- | --- |
| Packet definition (CRUD) | `form_packet_definitions` + `POST /api/admin/forms/packet-definitions` (key alloc via `lib/forms/adminGeneratedKeys`) |
| Packet step | `form_packet_items` (references `form_definitions` + optional pinned published version) |
| Step publishability rule | `assertPacketStepsPublishableCore` (`lib/forms/packets/mintPacketPublicLinkForAdmin.ts`) |
| Share link / token (parent URL) | `form_public_links` minted by `mintPacketPublicLinkForAdmin` → `{ plaintext_token, embed_path, embed_url, first_step_sequence_index }` |
| Packet session (per link) | `form_packet_sessions` + `ensurePacketSessionForPublicLink` (idempotent, materializes session items) |
| **Parent route** | `app/forms/embed/[token]/page.tsx` → `GET /api/public/forms/[token]/resolve` → `resolvePublicFormEmbedContext` |
| **Packet shell data** | `PublicEmbedResolved.packet` = `{ packet_name, current_sequence_index, total_steps, step_summaries[], current_session_item_id }` |
| Form template (the generated draft) | `createFormFromCaseDraft` → `form_definition` + **draft** version; provenance `metadata.source = "document_form_draft"` |
| Publish a version | `dbPublishVersion` (`lib/admin/forms/formsAdminDb.ts`) |

Conclusion to the audit question — **can the forms packet architecture become the POS
packet architecture?** Yes, directly. It is generic, org-scoped, config-driven, and
already powers the enrollment packet launch. POS should reuse it as-is. Building a second
`pos_packet_*` system is unnecessary and is explicitly avoided.

## 2. Gaps (the only things missing for the slice)

1. **Generated templates are unpublished drafts.** Packet steps require a published
   version (`assertPacketStepsPublishableCore`). So template → packet needs an ensure-
   published step.
2. **No single operator action** that goes template → packet definition → one item →
   parent link. Today that is four separate admin calls; `PosPacketsPanel` shows a
   disabled "Create Packet" prototype button.

Everything else (parent route, session, shell data) already exists.

## 3. Recommended approach

Add one **POS orchestration service** + one **thin API route** + one **operator button**.
Reuse every existing primitive. No new tables, no migration.

Flow the slice performs:

```
generated form_definition (draft)
  → ensure a published version (publish latest draft if none) [dbPublishVersion]
  → create form_packet_definition (unique key)               [insert]
  → add ONE form_packet_item (sequence 0, follow-latest)      [insert]
  → mint packet public link                                  [mintPacketPublicLinkForAdmin]
  → return shareable /forms/embed/[token] URL
Parent opens URL → resolvePublicFormEmbedContext ensures session → renders packet shell.
```

## 4. Exact files

**Added**

- `web/lib/pos/packet/createParentPacketFromTemplate.ts` — pure, DI-based orchestration
  service `createParentPacketFromTemplate(deps, input)` + `makeParentPacketTemplateDeps(supabase)`
  wiring to existing helpers. Returns the packet id + minted parent link, or a typed error
  (`not_found` / `no_publishable_version` / `publish_failed` / `packet_create_failed` /
  `link_failed`).
- `web/app/api/admin/pos/packets/from-template/route.ts` — `POST`, admin-only, derives
  `embedBaseUrl` from request headers (mirrors `packet-links`), wires real deps, returns
  `{ data: { packet_definition_id, public_link: { token, embed_path, embed_url, url }, ... } }`.
- `web/tests/pos/createParentPacketFromTemplate.test.ts` — unit tests with fake deps.

**Modified**

- `web/app/adminV2/pos/PosFormsWorkspace.tsx` — additive "Create parent packet" action in
  the selected-form header; on success shows the shareable parent URL (copyable + openable).
  No existing handler changed.

**Migrations:** none. The packet runtime is reused.

## 5. Success-criteria mapping

- *Select a generated template* → existing POS Forms list (forms with
  `metadata.source = "document_form_draft"`).
- *Create a packet* → new button → `POST /api/admin/pos/packets/from-template`.
- *Open a shareable parent URL* → returned `public_link.url` (`/forms/embed/[token]`).
- *View the packet shell backed by real packet data* → existing parent route resolves the
  link, `ensurePacketSessionForPublicLink` creates a real session, and the embed client
  renders the packet (`packet_name`, step `1 of N`, `step_summaries`).

## 6. Guardrails

Packet generated from Alloy form templates, never from PDFs (PDF stays an output target,
untouched here). Existing forms-packet runtime reused; no second packet system; no new
tables. Existing canonical dedupe foundation (`packetFieldPlan`) is the feed for the
**multi-form** packet generator in a later slice; this single-form slice keeps scope
minimal. Not built: PDF generation, submission review, duplicate detection, builder
improvements, parent accounts, workflow automation.

## 7. Validation

Scoped `tsc --noEmit` clean; unit tests for the service with fake deps (Vitest, matching
`tests/pos`). Vitest cannot execute in this sandbox (documented missing
`@rolldown/binding-linux-arm64-gnu`); run `npm run test -- tests/pos/` locally to confirm.
The route and UI are typechecked; full request/render verification is a local/staging step.
