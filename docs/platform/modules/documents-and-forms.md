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

## Processing Form Composer model

Processing is the operator workflow for turning existing documents into native Alloy forms. The uploaded
document is evidence; the generated form is the source of truth.

1. **Import document** — upload an existing PDF into Processing Studio → Documents.
2. **Resolve questions** — Incoming opens a document review case. Operators confirm what each detected
   question means, ignore boilerplate, and keep the source document visible as evidence.
3. **Generate native form** — reviewed questions create an unpublished form definition/draft version.
4. **Edit in rich form workspace** — operators finish labels, layout, validation, save, and publish in the
   canonical form workspace.
5. **Later assemble packet** — packets use published forms; packet building is not part of document review.

Primary UI must speak in sections, questions, and destinations ("Where should this answer go?"). Internal
canonical bindings such as `entity_type` and `field_key` are advanced diagnostics only, not primary operator
language.

### Processing UX (Work / Studio)

Inside the existing Processing modal (no separate app shell):

- **Overview (Work)** — Needs review, Ready to generate, Ready to publish, Completed today
- **Studio** — Import existing form (primary), Create blank form, Create packet, Recognition templates
- **Recent assets** — Forms and packets generated from Processing

Document intake follows four presentation steps: Import → Review detected questions → Generate native form → Edit form.

Intake prefill and embed doctrine: sprint closeouts in `docs/sprints/completed/`.

---

## Integration points

- Opportunity drawer — packet review modal, form status
- Workflows — submission events
- Field policy — forms parity with settings **planned**

---

## Related

- `../../product/documents-and-forms.md` (transitional expanded reference)
- `../foundation/platform-capabilities.md`
