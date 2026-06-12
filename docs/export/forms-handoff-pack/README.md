# Alloy — Forms & Documents Handoff Pack

**Generated:** June 2026  
**Purpose:** Portable bundle of active docs for the forms engine, intake, packets, document generation, and operator review flows. Copy or zip this folder and take it offline.

**Canonical live source:** `docs/product/documents-and-forms.md` in the repo always wins on conflict.

---

## Recommended reading order

1. **`01-canonical/documents-and-forms.md`** — current product truth (as-built)
2. **`02-engine-architecture/forms_documents_phase_2_step0_audit.md`** — schema + code inventory (audit baseline)
3. **`03-doctrine-contracts/`** — prefill, embed, existing-record links, linkage review
4. **`04-shipped-closeouts/`** — what was built (MVP productization, intake, packets, review MVP)
5. **`01-canonical/roadmap-and-gaps.md`** — open gaps and sequencing
6. **`05-active-planning/`** — workspace redesign, Phase 2 remainder, authoring stability
7. **`08-lifecycle-crm-integration/`** — intake ↔ CRM / lifecycle coherence
8. **`06-deferred-future/`** — deferred builder/public UX + AI hooks (not shipped)
9. **`07-runtime-debug-archive/`** — May 2026 runtime test / debug session notes (historical)

Supporting canonical context (same folder):

- **`01-canonical/crm-system.md`** — opportunity intake, OCM, drawer surfaces
- **`01-canonical/configuration-system.md`** — Forms hub vs Settings four-plane model
- **`01-canonical/actions-and-workflows.md`** — `open_form` and registry actions
- **`01-canonical/communications.md`** — packet invitation email delivery (Communications V1)

---

## Folder map

| Folder | Contents |
|--------|----------|
| `01-canonical/` | Product + system + roadmap + comms cross-ref |
| `02-engine-architecture/` | Forms engine v1 specs, Phase 2 audit/design, document intelligence infra |
| `03-doctrine-contracts/` | Intake prefill/embed doctrine, public-link contracts, linkage review, deferred UX notes |
| `04-shipped-closeouts/` | Sprint closeouts — MVP, intake case, packets Phase 1, review MVP P2-1–P2-4 |
| `05-active-planning/` | Workspace redesign, Phase 2 remainder, authoring stability, AI recreation (future) |
| `06-deferred-future/` | Same as `03-doctrine-contracts/deferred_*` and `future_ai_hooks_v1.md` — grouped for scanning |
| `07-runtime-debug-archive/` | One-off runtime validation / debug notes (not current truth) |
| `08-lifecycle-crm-integration/` | Enrollment intake coherence, lifecycle matrix, waitlist fact-truth, action intake model |

---

## Platform model (quick reference)

Three intake modes — **one engine**, not separate enrollment subsystem:

| Mode | Execution truth | Operator pattern |
|------|-----------------|------------------|
| Standalone operational form | `form_submissions` | Submission detail + optional PDF |
| Public lead / intake | `form_submissions` + link metadata | Intake / linkage review → CRM promotion |
| Multi-step packet | `form_packet_sessions` + items | Packet review rollup, operator review PATCH, Documents merge |

See **`01-canonical/documents-and-forms.md`** § Platform model.

---

## Key code entry points (repo only — see `CODE-ENTRY-POINTS.md`)

| Concern | Path |
|---------|------|
| Forms hub UI | `web/app/adminV2/forms/**`, `web/components/forms/workspace/**` |
| Form engine renderer | `web/components/forms/engine/FormEngineRenderer.tsx` |
| Core lib | `web/lib/forms/**` |
| Admin APIs | `web/app/api/admin/forms/**` |
| Public APIs | `web/app/api/public/forms/[token]/**` |
| Schema baseline | `supabase/migrations/20260506100000_forms_engine_v1_foundation.sql` |
| Tests | `web/tests/forms/**`, `web/tests/publicForms/**`, `web/tests/admin/formsAdminRoutes.test.ts` |

Full tables: **`CODE-ENTRY-POINTS.md`**, **`SCHEMA-AND-MIGRATIONS.md`**.

---

## Known open gaps (summary)

See **`01-canonical/documents-and-forms.md`** § Known gaps and **`01-canonical/roadmap-and-gaps.md`**. Headlines:

- **DCP** (field-level data change proposals) — not shipped
- **P2-5** deterministic BOS packet insight — not shipped
- **UX hardening cards** (UX-A–H) — partial / open
- **Forms field-policy parity** with Settings `requirement_policy`
- **Forms operational workspace redesign** — planned, not fully shipped
- **Document AI extraction / recreation** — future lane, not critical path

---

## Re-sync from repo

This pack is a **point-in-time copy**. To refresh:

```bash
# From repo root — re-run the pack builder (or manually re-copy from paths listed in docs/README.md)
cd docs/export/forms-handoff-pack
# … copy updated sources …
zip -r ../forms-handoff-pack.zip .
```

After refresh, bump **Generated** date in this README.
