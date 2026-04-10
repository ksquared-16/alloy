# Configuration — doctrine

**Purpose:** Draw a clear line between **what operators (and future AI) may configure** and **what the platform owns**. This doc does not prescribe UI; see [config-surfaces-spec.md](./config-surfaces-spec.md) and [config-api-contract.md](./config-api-contract.md).

**Related:** [record-rendering-system-spec.md](./record-rendering-system-spec.md) (resolver / truth) · [overview-layout-doctrine.md](./overview-layout-doctrine.md) · [workspace-work-unit-scope-doctrine.md](./workspace-work-unit-scope-doctrine.md) · [deferred-decisions.md](./deferred-decisions.md)

---

## 1. Configuration vs fixed system behavior

| | **Configuration** | **Fixed system behavior** |
|--|-------------------|----------------------------|
| **Definition** | Data-driven **choices inside guardrails**: labels, ordering, visibility, which lane runs which filter **when the filter is registered**, org-scoped field vocabularies, work-unit metadata hooks. | **Invariant rules**: entity identity, authorization, RLS, workflow **effects**, resolver **truth**, registered **semantic visual keys**, database constraints, and **code-defined** safety predicates where moving them to config would risk silent breakage. |
| **Who changes it** | Org admins (today); future **AI agents** only through **validated APIs** (see config API contract). | Platform engineering; schema migrations; reviewed code paths. |
| **Failure mode** | Bad config → poor UX, wrong ordering, empty queue — **recoverable** by edit. | Bug in fixed behavior → data integrity or security risk — **requires** code/migration. |

**Principle:** Configuration **steers** presentation and operational routing; it does **not** replace **business logic** or **authorization**.

---

## 2. What can be changed safely (within guardrails)

- **Field registry:** `field_definitions` / `field_values` / `field_section_definitions` — labels, types, section placement, visibility flags (drawer, table, public booking), sort order, inactive state.
- **Status vocabulary:** Org-scoped `status_definitions` rows (labels, keys where allowed) — must remain consistent with enums/checks the code enforces.
- **Work hierarchy:** `departments`, `work_units` — names, keys (stable identifiers), sort order, `is_active`, **`metadata`** and **`queue_definition`** **when** validated against a **versioned schema** (see config model spec).
- **Record chrome (templates):** `record_layouts`, `record_actions` — section order, overview structure tokens, action rows (labels, placement keys) — **handlers** for `event_key` remain code.
- **Document fields:** `document_field_definitions` for org + doc type.

**Safe** means: changes are **reversible**, **scoped**, and **validated**; they do not bypass org boundaries or invent new server endpoints without a contract.

---

## 3. What must remain system-controlled

- **Resolver output and edit ownership** — what a **record** is, field provenance, and which entity receives a PATCH ([RRS](./record-rendering-system-spec.md)).
- **Auth / org context** — `getAdminContext`, `user_roles`, RLS; configuration APIs must not expose cross-org writes.
- **Event and workflow execution** — what `event_key` or workflow name **does** (side effects, messaging, payments).
- **Visual system grammar** — the **catalog** of Alloy families and **registered** `VisualContextKey` values; operators may **select among** registered contexts via metadata, not invent new CSS families in the DB.
- **Exception semantics (until explicitly externalized)** — predicate logic for high-risk lanes may stay in code until a **validated DSL** exists ([deferred-decisions](./deferred-decisions.md)); configuration may **toggle** lanes or ordering, not arbitrary SQL.

---

## 4. AI (future) — constraints

- **No AI in this phase** — but configuration is shaped so **future AI** only **proposes or applies** changes through **versioned, validated config APIs** (same as humans).
- AI must **not**: execute raw SQL, bypass RLS, add unregistered handlers, or change fixed system behavior without a migration.

---

## 5. Relationship to “global” vs org-scoped config

Some rows are **org-scoped** (field definitions, departments, work units). Others are **global templates** (current `record_layouts` / `record_actions` — no `org_id` in schema). Doctrine: **prefer org-scoped** for tenant differentiation where product requires it; **global** templates are acceptable for shared defaults with **code fallbacks**. Evolution path: add `org_id` nullable or template inheritance without breaking existing GETs — details in [config-model-spec.md](./config-model-spec.md).

---

**Terms:** [glossary.md](./glossary.md)
