# AI / project source pack index

**Purpose:** Minimal set of files to load into GPT (or similar) project context for **foundation work**. Paths are repo-relative from `docs/`.

## Tier 1 — Canonical doctrine (load always)

| File | Role |
|------|------|
| `architecture/README.md` | Hub: what is canonical vs not. |
| `architecture/glossary.md` | **Terminology lock** — shared vocabulary. |
| `architecture/record-rendering-system-spec.md` | RRS / resolver / payload / edit ownership. |
| `architecture/relationship-and-identity-doctrine.md` | Persons-first, layered relationships, contacts sunset direction. |
| `architecture/overview-layout-doctrine.md` | Overview = structured summary, templates, no page builder. |
| `architecture/workspace-work-unit-scope-doctrine.md` | Record vs work unit vs queue vs drawer; org/location/department. |
| `architecture/deferred-decisions.md` | **Explicit deferrals** — avoids re-litigating scope. |
| `architecture/implementation-gap-audit.md` | Doctrine vs current DB/code — **living** gap list. |

## Tier 2 — Implementation bridge (load for Track A)

| File | Role |
|------|------|
| `implementation/foundation-implementation-plan.md` | **Track A** ordering, thin slice, risks. |
| `README.md` | Top-level doc map (folders, canonical vs audits). |

## Tier 3 — Schema & domain reference (load when touching DB or entities)

| File | Role |
|------|------|
| `audits/schema-reference-guide.md` | **Where schema truth lives** — pointers, not full DDL. |
| `implementation/HIERARCHY_SCHEMA_V1.md` | Departments / work_units / `jobs.work_unit_id` notes. |
| `audits/IDENTITY_MODEL_REFACTOR_AUDIT.md` | Contact/person touchpoints in code (inventory). |
| `audits/DOMAIN_MODEL.md` or `audits/ENTITY_MODEL.md` | Conceptual entity graph (legacy language may say “contact” — cross-check glossary). |

## Tier 4 — Optional context (load if task-specific)

| File | When |
|------|------|
| `implementation/ARCHITECTURE.md` | Next.js / Supabase / major flows. |
| `implementation/SYSTEM_STRUCTURE_V1.md` | Admin IA + hierarchy narrative. |
| `implementation/UI_V2_Workspace_System_Spec.md` | Block/level UI companion — **subordinate** to architecture/*. |
| `audits/ADMIN_API_ORG_SCOPING_AUDIT_V1.md` | Admin API security / org scoping remediation history. |
| `supabase/baselines/prod_baseline.sql` | **Full DDL** — large; use grep or `schema-reference-guide` first. |

## Do not load as canonical

- `archive/*` — historical unless debugging a specific old deliverable.
- Deliverables and campaign one-offs in `archive/`.

**Practical bundle (~10 files):** Tier 1 + `foundation-implementation-plan.md` + `schema-reference-guide.md` + root `README.md`.
