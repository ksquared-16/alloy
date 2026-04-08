# Foundation implementation plan — Track A bridge

**Purpose:** Practical sequence from [doctrine](../architecture/README.md) to shippable foundation **before** depending on full UI V2. **Industry-agnostic.** Not implementation code in this doc.

**Concrete execution order & job slice detail:** [track-a-execution-plan.md](./track-a-execution-plan.md).

**Evidence:** [implementation-gap-audit.md](../architecture/implementation-gap-audit.md) · schema map: [schema-reference-guide.md](../audits/schema-reference-guide.md).

---

## A. Objective (Track A)

Deliver enough **backend contract**, **schema integrity**, **config hooks**, and **identity read-path** clarity that:

1. At least one **entity** (recommended: **job**) has a **stable resolver-shaped payload** for drawer + overview consumers, with **edit ownership** metadata.
2. **Overview** can be driven by **small, versioned layout config** (not a page builder).
3. **Work unit / queue** direction has a **documented `queue_definition` v1** and a single server-side interpreter path (even if minimal).
4. **Persons-first** read path is **proven** for primary customer-facing people on that slice (without ripping out `contacts` everywhere yet).
5. **Obvious integrity holes** (e.g. job vs work unit org mismatch) are **closed or explicitly scheduled**.

UI V2 can then consume the same contracts; **UI V1** is not the source of truth.

---

## B. Required foundation work (grouped)

### B.1 Supabase / schema

- Add **CHECK or trigger**: `jobs.org_id` = parent `work_units.org_id` when `work_unit_id` is non-null (or equivalent constraint strategy).
- Optionally prepare **M2M `job_work_units`** only if product confirms multi-membership before build; otherwise **defer** (per [deferred-decisions](../architecture/deferred-decisions.md)).
- Keep **`departments` / `work_units` / `jobs.work_unit_id`** as hierarchy anchor; do not conflate with **`locations`**.

### B.2 Config storage

- Introduce **overview layout config** (table or versioned JSON on org + `entity_type`): enabled bands, ordered keys/sections, template id — see gap audit §2.2.
- Document and validate **`queue_definition` v1** (JSON Schema or Zod); store on **`work_units.queue_definition`**.

### B.3 Resolver / backend contract

- Extract **job** (or chosen entity) payload assembly from monolithic route into a **resolver module** with:
  - stable shape per **surface** (`drawer` | `overview` | `full` optional v1),
  - **`editable_entity` + `field_key`** (or equivalent) for each mutable field,
  - sections: base, custom, relationship groups, financial context (when relevant), actions (stubs ok), signals (stubs ok).
- Version the contract (`rrs_version` in payload or header) for forward compatibility.

### B.4 Identity read-path cleanup

- For the **job** slice: resolve **primary person** via **`customer_persons` + `persons`** where data exists; fall back to **`primary_contact_id` → contacts** until migration completes.
- **No** requirement to delete **`contacts`** in Track A; **requirement** is new code paths prefer persons.

### B.5 Work unit / queue / scope structures

- **`work_unit_members`** (or equivalent): `user_id`, `work_unit_id`, `role_key`, org-scoped RLS — **if** execution surfaces ship in Track A; if not, **document** and defer with explicit “org-wide ops” assumption.
- **Scope v0:** optional `user_roles.metadata` JSON for location ids — only if product needs it in quarter; else defer with pointer to deferred-decisions.

### B.6 Action placement / config

- Minimal **action manifest**: list of action keys + allowed surfaces (`queue` | `drawer` | `full_record`) per entity type — can live in JSON config table or `metadata` until normalized.

### B.7 Integrity guards

- Job/work unit org check (above).
- Resolver must **never** imply cross-entity saves without explicit multi-write API (per RRS doctrine).

---

## C. Prioritization

### Required now

- Resolver **thin slice** for **job** + **edit ownership** metadata.
- **Overview layout config v0** + reader in resolver/renderer path.
- **`queue_definition` v1** doc + validator + one server builder.
- **Job / work unit org** integrity guard.
- **Persons-first read** for primary person on job (dual-read acceptable).

### Strongly recommended soon

- **`work_unit_members`** if any role-based queue is in the same release train.
- **Action manifest v0** (even JSON file per org behind feature flag).
- Automated test fixtures for resolver golden payloads.

### Later / can defer

- M2M job ↔ work units.
- Full capability model, location scope arrays, vendor_persons.
- AI-suggested layout or queue ordering.
- Dropping **`contacts`**.

---

## D. Suggested build order

1. **Schema guard** — job/work unit org consistency (small migration, immediate risk reduction).
2. **`queue_definition` v1** spec + validation helper (no UI dependency).
3. **Overview layout config** storage + migration (empty defaults ok).
4. **Job resolver module** — move logic out of `entity/[type]/[id]` with tests; add `rrs_version`.
5. **Wire overview + drawer** to resolver for job only (consumers adapt incrementally).
6. **Persons read path** on job payload (feature-flag or gradual).
7. **work_unit_members** + RLS **if** in scope; else skip with documented assumption.
8. **Action manifest v0** when first cross-surface action ships.

---

## E. Thin-slice recommendation

**Entity: `job`.**

- Already central to operations, schedules, assignments, financial display.
- **`work_unit_id`** exists; hierarchy story is testable end-to-end.
- **`customer_persons` / `persons`** can be joined from **`job.customer_id`** without booking rewrite in the first slice.

**Alternative:** `opportunity` if sales-only foundation — weaker work-unit story today (no `work_unit_id` on opportunities in baseline per gap audit).

---

## F. Risks (rework if ignored)

| Risk | Impact |
|------|--------|
| Resolver shape drifts per route | Two “truths”; UI V2 and admin drawer diverge. |
| No `queue_definition` schema | Ad hoc JSON per vertical; unmigratable queues. |
| Skipping edit ownership | Silent wrong-table PATCH from interleaved fields. |
| Persons read only on greenfield | Booking and admin stay contact-locked; doctrine stalls. |
| No org/work-unit integrity | Bad routing and cross-tenant edge cases from integrations. |

---

**See also:** [source-pack-index.md](../architecture/source-pack-index.md) · [glossary.md](../architecture/glossary.md)
