---
owner: platform
status: sprint-artifact
last_reviewed: 2026-07-27
supersedes: []
---

# Organization Calculation — Implementation-Ready Design (Path B)

**Sprint:** `operational-calculations` · Slot 4  
**Doctrine lock:** Path B — constrained Organization Calculation authoring  
**Canonical doctrine:** `docs/platform/core/operational-calculations.md` §3.1  
**Foundational reset:** `OC-FOUNDATIONAL-PRODUCT-RESET.md`  

**Standing forbids:** commit parked OI implementation · broad generic formula builder · recommendations / assignment enforcement / Planning proving code

---

## 1. Decision lock

| Decision | Lock |
| -------- | ---- |
| Path | **B** — org-authored versioned calculations |
| Expression surface | **One** typed AST + platform evaluator (no string formulas, no SQL/JS, no second engine) |
| Protected math | Remains in platform handlers (`capacity.room_binding`, ratio, …) |
| Org power | Compose **approved projections + operators** only |
| Mutability | Calculations are **read-only**; never mutate Facts / Config / Intent |
| Measurements | Downstream consumers; own targets / health / snapshots / trends |
| First slice | **Capacity composition** only |

---

## 2. Layer ownership (non-negotiable)

### Platform owns

- Protected domain handlers and resolvers  
- Canonical data access (config bundles, occupancy context, injected clock)  
- Effective-date semantics and reproducibility triad  
- Ratio / capacity invariants (`null` ≠ 0; distinct kinds; no fabricated staffed coverage)  
- Approved function + projection catalog  
- Validation, evaluation, authorization, dependency safety  
- Result envelope + explanation steps  

### Organization Calculation owns

- Name, description  
- Subject / grain (`room` for proving slice)  
- Typed expression AST  
- References to approved inputs/functions  
- Constants + supported operators  
- Temporal/scope parameter declarations  
- Lifecycle `draft | published | archived`  
- Immutable published versions  
- Dependency graph (derived + stored)  
- Consumer bindings  
- Audit metadata  

---

## 3. Expression engine (single decision — locked)

**Engine name:** Organization Calculation AST Evaluator (platform module).  
**Not:** Spreadsheet formula parser, SQL, JS `eval`, CEL/JMESPath, or a generic open expression library.

### AST node set (proving slice)

```ts
type OrgCalcExpr =
  | { kind: "const"; value: number }
  | { kind: "input"; ref: ApprovedInputRef }      // approved scalar projection
  | { kind: "unary"; op: "neg"; arg: OrgCalcExpr }
  | { kind: "binary"; op: "add" | "sub" | "mul" | "div"; left: OrgCalcExpr; right: OrgCalcExpr }
  | { kind: "call"; fn: "min" | "max" | "coalesce"; args: OrgCalcExpr[] }; // arity ≥ 1
```

### Null / incompleteness semantics (locked)

| Situation | Behavior |
| --------- | -------- |
| `input` resolves to `null` | Propagates as unknown |
| `add/sub/mul` with any unknown | Result unknown; status ≥ `incomplete` |
| `div` by zero or unknown divisor | `incomplete` + warning; value `null` |
| `min` / `max` | Ignore unknown args; if **all** unknown → unknown |
| `coalesce` | First non-unknown arg; else unknown |
| Upstream platform status `not_configured` / `conflicted` | Bubble into org result status (merge, never hide) |

### Types (proving slice)

- All proving-slice values are **number | null** (scalar).  
- No boolean / string / capacity-struct in the org AST yet.  
- Capacity structs stay inside platform handlers; org sees **approved scalar projections** only.

### Explanation

Every evaluation returns ordered steps:

```ts
type ExplanationStep = {
  nodeId: string;
  label: string;          // administrator language
  op: string;
  inputs: Array<{ label: string; value: number | null }>;
  output: number | null;
  notes?: string[];       // e.g. "licensed capacity not configured"
};
```

---

## 4. Approved input catalog (proving slice)

All inputs are projections of platform key `capacity.room_binding` evaluated for `{ roomLocationId, effectiveAt, … }` via existing OC runtime.

| `ApprovedInputRef` | Meaning | Source |
| ------------------ | ------- | ------ |
| `capacity.room_binding.physical` | Physical seat capacity | `CapacityValue.physical` |
| `capacity.room_binding.licensed` | Licensed ceiling | `CapacityValue.licensed` |
| `capacity.room_binding.operational` | Operational / configured capacity | `CapacityValue.operational` |
| `capacity.room_binding.ratio_limited` | Ratio-limited child capacity | `CapacityValue.ratioLimited` |
| `capacity.room_binding.binding` | Platform binding capacity | `CapacityValue.binding` |

**Not in catalog (yet):** inventing new capacity kinds, reading arbitrary tables, occupancy counts as free inputs, staffing supply (`staffed` remains null / out of catalog).

**Operators / functions in catalog:** `add`, `sub`, `mul`, `div`, `neg`, `min`, `max`, `coalesce`, numeric `const`.

Expanding the catalog is a deliberate platform change (code + doctrine), not an admin escape hatch.

---

## 5. Persistence model (smallest durable)

Prefer first-class tables (not `org_settings` JSON) so publish immutability is real.

### `organization_calculations`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | uuid PK | |
| `org_id` | uuid | RLS / org scope |
| `key` | text | Stable org-local key (`orgcalc.<slug>`) |
| `name` | text | |
| `description` | text | |
| `subject_grain` | text | proving: `room` |
| `lifecycle` | text | `draft` \| `published` \| `archived` |
| `published_version_id` | uuid null | Current published pointer |
| `created_by` / `updated_by` | uuid | Audit |
| `created_at` / `updated_at` | timestamptz | |

### `organization_calculation_versions`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | uuid PK | |
| `organization_calculation_id` | uuid FK | |
| `org_id` | uuid | |
| `version_number` | int | Monotonic per calculation |
| `expression_ast` | jsonb | Frozen AST |
| `dependency_refs` | text[] | Closed set of `ApprovedInputRef` (+ future calc refs) |
| `consumer_bindings` | jsonb | e.g. `{ "runtime_surface": true }` |
| `published_at` | timestamptz null | Set on publish |
| `published_by` | uuid null | |
| `immutable` | boolean | true once published |

**Rules:** published rows are insert-only for content (no UPDATE of AST). New edit ⇒ new draft version lineage or new version_number on republish.

### AuthZ

- Author / publish: org `admin` (same bar as kpi-targets for proving).  
- Evaluate published: admin + any consumer path that already may resolve capacity for the room.  
- Service-role only on server; never client computation authority.

---

## 6. Module layout (to implement)

```text
web/lib/organizationCalculations/
  ast.ts                 // types + validators
  catalog.ts             // ApprovedInputRef + operators (proving set)
  evaluate.ts            // pure AST evaluator + explanation
  dependencies.ts        // graph extract + cycle check
  persist.ts             // server CRUD / publish
  explain.ts             // step formatting helpers

web/lib/operationalCalculations/
  // unchanged ownership of handlers/runtime/registry
  // thin adapter: resolve capacity.room_binding → scalar projections for catalog
```

**No second expression engine elsewhere.** Surfaces and APIs call `evaluate.ts` only.

---

## 7. Proving slice — Capacity composition

### Intent

Prove end-to-end:

1. Approved room capacity inputs/functions available in catalog  
2. Bounded arithmetic + `min` / `max` / `coalesce`  
3. Author + persist one Organization Calculation (draft)  
4. Validate types + dependencies  
5. Evaluate for **room + effective date**  
6. Show step-by-step explanation  
7. Publish an immutable version  
8. Consume it in **one real runtime surface**

### Reference calculation (seed / demo)

**Name:** Effective physical–licensed seats  
**Grain:** room  
**AST (conceptual):**

```text
min(
  input(capacity.room_binding.physical),
  input(capacity.room_binding.licensed)
)
```

**Why this is real:** Orgs sometimes need a composition that is **not** identical to platform `binding` (which also considers operational + ratio). This proves composition without redefining handler invariants.

Alternative allowed in the same slice: `coalesce(operational, physical)` — still catalog-only.

### Evaluation request

```ts
{
  orgId,
  organizationCalculationId | key,
  version?: "published" | versionId,
  scope: { type: "room", id: roomLocationId },
  effectiveAt: string, // injected / explicit
  // server loads CapacityConfig + occupancy context exactly as capacity.room_binding does today
}
```

### Runtime consumer (one surface)

**Choose:** Location operational capacity / room capacity detail path that already loads capacity resolution for a room (admin Locations operational rules / capacity panel — whichever already displays binding capacity).

**Consumer contract for proving:**

- Read **published** org calculation version bound with `consumer_bindings.runtime_surface = true`  
- Display: label, scalar value, status, limiting explanation steps  
- **Do not** replace platform `capacity.room_binding` display; show as an **additional** governed derived value (e.g. “Organization calculation: Effective physical–licensed seats”)

If no suitable UI mount is safe without broader Locations work, the allowed proving consumer is an **admin API + minimal read-only panel** under Organization Calculations (not OI pack UI). Prefer mounting beside existing capacity readout when low-risk.

### Out of scope for this slice

- Generic formula builder UI / drag-drop expression studio  
- Measurement target binding UI (document adapter only)  
- Assignment enforcement, BOS recommendations, Planning  
- Cross-calculation references (org calc → org calc)  
- Editing published versions in place  

---

## 8. API sketch (proving)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/api/admin/organization-calculations` | List org calculations |
| `POST` | `/api/admin/organization-calculations` | Create draft |
| `GET` | `/api/admin/organization-calculations/[id]` | Load draft + versions |
| `PATCH` | `/api/admin/organization-calculations/[id]` | Update draft AST/metadata |
| `POST` | `/api/admin/organization-calculations/[id]/publish` | Freeze immutable version |
| `POST` | `/api/admin/organization-calculations/[id]/evaluate` | Evaluate draft or published for room + as-of |
| `GET` | `/api/admin/organization-calculations/catalog` | Approved inputs + operators |

All evaluation server-side; returns Result-like payload + `explanation[]`.

---

## 9. Test plan (proving)

| Test | Asserts |
| ---- | ------- |
| Catalog closed | Unknown `input.ref` rejected |
| AST validate | Unsupported op / empty `min` args fail |
| Dependency extract | Refs match catalog; no cycles (trivial in slice) |
| Eval parity | `min(physical, licensed)` matches hand computation from `resolveOperationalCapacity` projections |
| Null semantics | Missing licensed → unknown / incomplete, never coerced to 0 |
| Determinism | Same version + room + effectiveAt ⇒ identical JSON |
| Publish immutability | Cannot PATCH published version AST |
| Read-only | Evaluation performs no writes to facts/config |
| Consumer | Runtime surface reads published value only |

Reuse existing capacity resolver fixtures where possible.

---

## 10. Gate check — blockers

| Risk | Status |
| ---- | ------ |
| Canonical capacity data / resolvers | **Resolved** — `capacity.room_binding` + `resolveOperationalCapacity` exist and are tested |
| Competing expression engine | **Resolved by lock** — single typed AST evaluator; no alternate engines |
| Ratio invariant ownership | **Resolved** — org may read `ratio_limited` projection; may not redefine tiers |
| Persistence choice | **Locked** — first-class tables (not metadata blob) for publish immutability |
| Runtime consumer mount | **Accept residual** — prefer existing room capacity readout; fallback admin evaluate panel if Locations touch is too wide |

**Stop condition not triggered.** Proving slice may proceed to implementation after this design acceptance.

---

## 11. Implementation slices (after this design)

| # | Slice | Deliverable |
| - | ----- | ----------- |
| P0 | Doctrine (done) | Path B in `operational-calculations.md` + OIP note |
| P1 | AST + catalog + evaluator (pure) | `web/lib/organizationCalculations/*` + Vitest |
| P2 | Persistence migration + APIs | tables + CRUD/publish/evaluate |
| P3 | Capacity projection adapter | wrap `capacity.room_binding` → catalog inputs |
| P4 | One runtime consumer | room capacity surface or admin evaluate panel |
| P5 | Minimal authoring UI | **not** a generic builder — form to pick inputs + `min` template / structured editor for proving AST only |

Parked OI enable/target/pack UI remains **uncommitted evidence** and is **not** the authoring surface for this slice.

---

## 12. Acceptance criteria (proving slice)

- [x] Admin can create a draft Organization Calculation with the capacity `min(physical, licensed)` AST  
- [x] Validation rejects unknown refs and illegal ops  
- [x] Evaluate for a real room + effective date returns scalar + explanation steps  
- [x] Publish freezes an immutable version  
- [x] One runtime surface shows the published value without client-side math  
- [x] No SQL/JS authoring path exists  
- [x] Platform `capacity.room_binding` behavior unchanged  
- [x] Parked OI implementation still not committed  
- [x] No Planning / assignment enforcement / recommendations code started  
