# Documents and forms

**Status:** Canonical platform module doc.

Forms engine, document handling, enrollment packets — industry-agnostic core with enrollment as reference implementation.

---

## Capabilities

| Area | Status | Entry |
|------|--------|-------|
| Form definitions & versions | Complete | `/admin/forms` |
| Public links & submissions | Complete | Public API routes |
| Packet sessions | Complete | Enrollment packet flows |
| Review rollup MVP | Complete | Packet review console |
| DCP / UX hardening | In Progress | Sprint `later-phase/` |

---

## Architecture

- **Definitions** — `form_definitions`, `form_definition_versions`
- **Capture** — `form_submissions`, public link tokens
- **Packets** — `packet_sessions` chain steps for multi-form enrollment
- **Documents** — file storage separate from form field capture

---

## Digital Mailroom product model

Digital Mailroom is the operator product for bringing external information into Alloy.
Processing remains the engine underneath; it is not the operator-facing architecture.

The frozen product spine is:

1. **Overview** — launch point for importing, resuming active work, or building reusable assets.
2. **Work** — active operational information organized by folders. The queue is one folder layer, not the product.
3. **Studio** — reusable operational assets: Forms, Packets, Fields, Branding.
4. **Builder** — opened from Studio Forms; the canvas-first builder owns editing and publishing.

Overview is not a dashboard or admin page. It answers: *What am I trying to accomplish?*

The uploaded PDF is evidence. The generated native form is the source of truth.

### Work pipeline

Import Form → Review Alloy's understanding → Generate native form → Builder.

Digital Mailroom work **continues** into Studio Builder when a native form exists. The operator never leaves
the modal for `/admin/forms`.

Review uses human language ("Where should this answer go?", "Store on Child"). Implementation
labels stay under Advanced or off-screen.

### Studio — Forms and Builder

Canvas-first interaction translated from Surface Builder:

1. **Canvas** — primary artifact
2. **Sections** — primary organizational unit (left rail)
3. **Questions** — primary editable primitive (add via library modal)
4. **Properties** — contextual inspector (360px, last)

The legacy three-column list editor is not the Studio direction.

Studio folders are configurable definitions with `id`, `label`, `description`, `order`, `accent`,
`hidden`, and `system` behavior. Current defaults are starter folders only; tenant configuration
should plug into the same shape.

Intake prefill and embed doctrine: sprint closeouts in `docs/sprints/completed/`.

### Work layout (frozen 2026-07-08)

Work review for document imports uses three parent surfaces — no nested chrome inside them:

1. **Queue** (~22%) — folder-aware work list; Outlook-density rows
2. **Source document** (~55%) — PDF or recognized regions (hero)
3. **Review questions** (~23%) — grouped question resolution inspector

Shared panel chrome: `ProcessingParentPanel`. Folder icons: `ProcessingFolderIcon` (Work, Studio, Overview).

Visual tokens: Midnight Forge, Bend Pine, Stone, White only in the Digital Mailroom shell.

Navigation mirrors Communications via shared `OperationalWorkspaceModeNav` (Work | Studio → Overview | Queue).

**Freeze:** The Digital Mailroom modal shell is canonical. Further work (OCR, AI extraction, Packets, runtime, BOS, family experience) extends behavior **inside** this shell — not a redesign. See `docs/sprints/07_2026/processing-v1-freeze-closeout.md`.

---

## Integration points

- Opportunity drawer — packet review modal, form status
- Workflows — submission events
- Field policy — forms parity with settings **planned**

---

## Related

- `../../product/documents-and-forms.md` (transitional expanded reference)
- `../foundation/platform-capabilities.md`
