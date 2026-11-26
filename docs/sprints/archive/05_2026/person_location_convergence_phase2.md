# Person & Location Convergence — Phase 2 Governance

**Date:** 2026-05-29  
**Status:** Documentation only — **not implemented in the Record, Person & Location Convergence Sprint (Cards 1–6).**

This document captures deferred work for archive/delete governance, person enhancements, location enhancements, and navigation enhancements. Phase 2 should be scoped as its own sprint or card sequence after convergence closeout.

**Canonical references:** `docs/sprints/archive/05_2026/record_person_location_convergence_audit.md`, `docs/platform/governance/glossary.md`, `docs/archive/2026-06-superseded-system/record-system.md`

---

## Recommended principle

**Hard delete should be rare.** Archive and deactivate should be the default for operational records. Any delete path must be permission-gated, audited, and recoverable where product policy allows.

---

## Archive / Delete Governance

**Not implemented in this sprint.**

Future work:

- **Archive** — soft-hide records from default operator views while preserving audit and financial joins
- **Deactivate** — reversible operational off-switch (`is_active`, status transitions) distinct from archive where the model supports both
- **Delete eligibility** — per-entity rules (dependencies, ledger links, open opportunities, active enrollments)
- **Permission gates** — role/permission keys for archive, deactivate, and rare hard delete
- **Audit logging** — who, when, prior state, reason; align with existing admin action / event paths
- **Recovery / restore** — unarchive, reactivate, and time-bounded undo where safe
- **Entity-specific rules** — persons, customers, opportunities, locations, customer_members, documents, communications

**Out of scope for Cards 1–6:** no archive/delete APIs, no schema changes for lifecycle columns, no Settings UI for governance.

---

## Person Enhancements

**Not implemented in this sprint.**

Future work:

- Profile photos
- Richer child profile (developmental / program context beyond OCM mirror)
- Gender / preferred pronouns (if product chooses to support)
- Vaccination / medical records (compliance-aware, permission-scoped)
- Authorized pickup lists
- Richer enrollment history on the person drawer (beyond read-only OCM mirror from Card 5)
- Relationship CRUD (directed `person_relationships`, `customer_persons` role editing)
- Emergency contact editing from person drawer
- Sibling management (link/unlink across customer accounts with validation)

**Card 5 shipped read-only visibility only** — Phase 2 owns mutation paths.

---

## Location Enhancements

**Not implemented in this sprint.**

Future work:

- Room capacity
- Age range on unit rows
- Licensing ratios
- Room category configuration
- Director assignment
- Phone / email on location
- Square footage (beyond option-set tier if needed)
- `parent_location_id` on admin location POST/PATCH APIs
- Configured Location drawer runtime (Settings → Layouts parity with person/location target)
- Location hierarchy admin UX (create/move units under sites in product UI)

**Card 1–2 shipped semantics and child-location authority display** — Phase 2 owns richer location ops and admin CRUD.

---

## Navigation Enhancements

**Not implemented in this sprint** unless partially addressed in Card 6 (enrollment sidebar lane expansion).

Future work:

- Fully config-driven department / work-unit nav grouping (tenant-visible structure from config, not code fallbacks)
- Visible nav grouping controls in Settings (department order, work-unit visibility, custom nav labels)
- Better lane-level labels for queue-derived operational states (domain aliases, tenant overrides)
- Breadcrumb / oper-console titles aligned to department → work unit → lane doctrine everywhere

**Card 6 note:** Enrollment sidebar now expands `enrollment_pipeline` v2 `domain_with_attention` queue definitions into configured throughput lanes (New Leads, Tours, Follow Up, Waitlist, Enrolling, Enrolled) when `queue_definition` loads via the v2 runtime bundle. Full tenant-configurable nav remains Phase 2.

---

## When to update this doc

After any Phase 2 card ships behavior in archive/delete, person profile mutation, location admin, or workspace navigation — update this file or move completed sections into active `docs/system/*.md` topic docs per operating doctrine.
