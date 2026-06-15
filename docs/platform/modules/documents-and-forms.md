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
