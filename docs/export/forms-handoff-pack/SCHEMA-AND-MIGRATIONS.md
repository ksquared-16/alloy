# Forms — schema and migrations

Baseline Postgres schema for the forms engine. **Authoritative DDL** lives in `supabase/migrations/` in the repo.

---

## Core tables (foundation)

**Migration:** `20260506100000_forms_engine_v1_foundation.sql`

| Table | Role |
|-------|------|
| `form_definitions` | Org-scoped form identity (slug, title, status) |
| `form_definition_versions` | Versioned schema payloads — draft / published / archived |
| `form_public_links` | Tokenized public URLs + link metadata (intake flags, prefill, embed) |
| `form_submissions` | Canonical **`payload`** JSONB — **not** auto-synced to CRM `field_values` |
| `form_submission_signatures` | Captured signatures (where enabled) |
| `form_submission_documents` | Junction to generated `documents` rows |

**Design invariant (migration comments):** `form_submissions.payload` is intake truth until explicit operator/intake/linkage paths promote CRM fields.

---

## Follow-on forms migrations

| Migration | Purpose |
|-----------|---------|
| `20260506120000_forms_medication_authorization_demo_seed.sql` | Demo seed data |
| `20260507130000_forms_medication_demo_option_sets.sql` | Demo option sets |
| `20260508121500_forms_medication_demo_link_lead_capture.sql` | Demo lead-capture link |
| `20260509133000_forms_intake_autocreate_demo_flags.sql` | Demo auto-create flags |
| `20260509134500_forms_submissions_operator_intake_metadata_and_fk_updates.sql` | Operator intake metadata, FK helpers |
| `20260510120000_forms_packet_foundation.sql` | Packet definitions, items, sessions, session items |
| `20260508150000_form_packet_session_operator_review.sql` | Operator review status + mismatch hints on sessions |

---

## Packet model

**Migration:** `20260510120000_forms_packet_foundation.sql`

| Table | Role |
|-------|------|
| `form_packet_definitions` | Multi-step packet template |
| `form_packet_items` | Ordered steps → form version references |
| `form_packet_sessions` | Runtime execution (1:1 with starting public link when applicable) |
| `form_packet_session_items` | Per-step state within a session |

Session statuses include `in_progress`, `completed`, `cancelled`. Operator review fields added in `20260508150000_form_packet_session_operator_review.sql`.

---

## Documents (shared with forms)

Forms-generated PDFs create rows in **`documents`** and link via **`form_submission_documents`**. Upload path is separate — see **`01-canonical/documents-and-forms.md`**.

Storage default bucket: **`org_documents`** (override **`ADMIN_DOCUMENTS_BUCKET`**).

---

## RLS and service role

- Admin mutations go through **`web/app/api/admin/forms/**`** with admin context guards — not client-side service role.
- Public submit uses token-scoped public routes — see `web/app/api/public/forms/**`.
- Compare live policies with **`docs/supabase/reference/*.csv`** when changing schema.

---

## Schema reference workflow

1. Read migration SQL for table/column truth.
2. Cross-check **`docs/supabase/reference/`** CSV exports after applying migrations locally.
3. Update **`01-canonical/documents-and-forms.md`** when behavior or table roles change.

---

## Related audits

- **`02-engine-architecture/forms_documents_phase_2_step0_audit.md`** — full shipped vs open inventory (May 2026)
- **`04-shipped-closeouts/forms_lifecycle_requirement_coverage.md`** — lifecycle field coverage closeout (June 2026)
