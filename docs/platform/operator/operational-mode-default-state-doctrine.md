# Alloy OS — Operational Mode as Default Runtime State

**Revision:** 1  
**Status:** Canonical platform doctrine (June 2026)  
**Authority:** Runtime behavior law for Work Unit entry, queue presentation, and Default Operational Subject resolution.

**Related:** [`alloy-runtime-specification.md`](./alloy-runtime-specification.md) · [`alloy-os-runtime-completion.md`](./alloy-os-runtime-completion.md) · [`queue-system.md`](./queue-system.md) · [`operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5)

---

## 1. New platform law

**Operational Mode is no longer a selectable mode.**

Operational Mode is the **default runtime state** of every Work Unit.

When an operator opens a Work Unit, they are **immediately placed into execution** — not an intermediate browsing state.

### Default runtime stack

```
Sidebar
  ↓
Work Unit Context
  ↓
Condensed Queue
  ↓
Resolved Operational Subject
  ↓
Focus Panel
  ↓
BOS
```

**Law:** The operator lands in work. There is no normal workflow that opens a Work Unit to a full-width queue without an active subject and Focus Panel.

---

## 2. Retired from active UX (dormant infrastructure)

Two prior experiences are **removed from the operator surface**. Their **implementations are not deleted** — they remain internal infrastructure for future bulk operations, reporting, or explicit tooling if ever required.

| Retired experience | Former role | Status |
|--------------------|-------------|--------|
| **Full-width expanded queue** | State 1 — queue owned full operational surface width; operator browsed before selecting a row | **Dormant** — `QueueBlock` expanded presenter retained in codebase |
| **Browse Mode** | Intermediate browsing state — no resolved subject, no Focus Panel, layout-oriented queue scanning | **Dormant** — not exposed in runtime, not configured in Experience Builder, no UX built around it |

**Do not:**

- Delete expanded-queue or browse implementations
- Expose Browse Mode in runtime chrome
- Configure layouts for Browse Mode
- Build operator UX around full-width queue as the default entry

**May:**

- Reuse dormant implementations internally (QA, migration, future bulk/reporting tools) with explicit approval

---

## 3. Operational subject resolution

The runtime **no longer opens the “first row.”**

It resolves the **Default Operational Subject** using a **Work Unit–owned resolution strategy**.

### Resolution flow

```
Open Work Unit
  → Resolve Perspective
  → Resolve Queue (sorted/filtered per active strategy)
  → Resolve Default Operational Subject (strategy-driven)
  → Open Focus Panel on resolved subject
  → Operator immediately begins work
```

There is **no intermediate browsing state** in the normal operator path.

### Strategy examples by domain

| Work Unit / domain | Example default strategy |
|--------------------|--------------------------|
| Enrollment | Highest Priority |
| Billing | Largest Balance |
| Attendance | Earliest Exception |
| Scheduling | Next Transition |
| Compliance | Oldest Outstanding |
| Waitlist | Longest Waiting |

The runtime applies the configured (or platform-default) strategy, selects the matching queue row as the **active operational subject**, and opens the Focus Panel automatically.

### Subject vs row order

| Concept | Meaning |
|---------|---------|
| **Queue order** | Presentation order after filters + active strategy sort |
| **Default Operational Subject** | The single row the runtime selects for Focus Panel open on Work Unit entry |
| **First row** | **Not** the default selection rule unless strategy explicitly resolves to it |

---

## 4. Default Operational Subject Strategy (future configuration)

**Status:** Documented only. **Not implemented** in Experience Builder or Work Unit config UI yet.

Each Work Unit will configure:

**Default Operational Subject Strategy**

### Strategy catalog (initial)

| Strategy key | Resolves to |
|--------------|-------------|
| `highest_priority` | Row with highest operational priority score |
| `earliest_due` | Row with nearest due date / SLA |
| `assigned_to_me` | Highest-priority row assigned to current operator |
| `largest_balance` | Row with largest financial exposure |
| `oldest` | Longest-waiting / oldest outstanding |
| `highest_risk` | Row with highest risk / attention score |
| `highest_score` | Row with highest composite score |
| `newest` | Most recently created / updated |
| `custom_strategy` | Future — tenant-defined resolver (deferred) |

Platform owns strategy **semantics** and **resolver contracts**. Work Units select the **default strategy** from the catalog.

### Fallback chain (platform-owned)

When strategy resolution finds no eligible row:

1. Show intentional empty state in Focus Panel region (not a false “broken” shell)
2. Condensed queue remains visible for manual row selection
3. Do not fall back silently to “first row” without documenting the fallback as explicit platform behavior

---

## 5. Operator strategy override

Operators may **temporarily override** the active resolution strategy from the **queue header** (not Work Unit settings).

### UI pattern (future)

```
Current Strategy ▼
  Highest Priority
  Largest Balance
  Assigned To Me
  Oldest
  Earliest Due
  …
```

### Override behavior

| Effect | Requirement |
|--------|-------------|
| Queue reorder | Re-sorts/reorders visible queue per selected strategy |
| Active subject | Re-resolves Default Operational Subject |
| Focus Panel | Updates to new subject (warm swap — no remount regression) |
| Configuration | **Does not** permanently change Work Unit default strategy |
| Session | Override persists for session or until operator resets (implementation detail — platform-owned) |

**Law:** Override is operator intent on the **current lens**, not a config edit.

---

## 6. Focus Panel on Work Unit open

When Operational Mode is the default state:

| Rule | Requirement |
|------|-------------|
| Focus Panel | **Open automatically** on resolved subject |
| Queue | **Condensed** (compressed rail) — not full-width |
| Subject | Identifies **Record of Attention** in header |
| Mission | Derived from perspective + stage + Business Process context |
| Modes | Summary / Work / Activity unchanged (Focus Panel modes, not runtime entry modes) |
| BOS | Remains right peer; geometry unchanged |
| Row click | Changes active subject; panel warm-swaps |
| Perspective change | Re-resolves queue + default subject + panel content for new lens |

Detail: [`operational-surface-design-system.md`](./operational-surface-design-system.md) · [`alloy-os-runtime-completion.md`](./alloy-os-runtime-completion.md) § Operational Surface.

---

## 7. Terminology update

| Term | New meaning |
|------|-------------|
| **Operational Mode** | Default Work Unit runtime state: condensed queue + resolved subject + open Focus Panel |
| **Operational State** | Synonym for default runtime (preferred in implementation docs) |
| **Browse Mode** | **Retired** from operator UX — dormant infrastructure only |
| **State 1 (legacy)** | Expanded full-width queue — **dormant**; was pre-subject browsing |
| **State 2 (legacy)** | Compressed queue + Focus Panel — **becomes the only normal operator state** |
| **Default Operational Subject** | Strategy-resolved active row / subject on Work Unit open |

---

## 8. Configuration contract (future — not built)

| Owner | Configures |
|-------|------------|
| **Work Unit** | Default Operational Subject Strategy |
| **Perspective** | Allowed strategy overrides in queue header; filter/sort options |
| **Business Process** | Stage-specific strategy overrides (optional future) |
| **Experience Builder** | Card composition — **not** Browse Mode layouts |
| **Platform** | Strategy resolver catalog, fallback behavior, subject swap mechanics |

---

## 9. Hard boundaries

- Do **not** implement Experience Builder strategy configuration in this doctrine pass.
- Do **not** delete expanded queue or Browse Mode code paths.
- Do **not** expose Browse Mode or full-width queue as default Work Unit entry.
- Do **not** open “first row” without an explicit strategy (or documented fallback).
- Do **not** change split geometry, BOS rail, or queue compression presenter as part of this doctrine — implementation plan handles sequencing.

---

## 10. Runtime implementation plan

**Scope:** Runtime behavior only. No Experience Builder config UI. No strategy persistence in Work Unit schema until a follow-on sprint.

### Phase A — Doctrine alignment (this deliverable)

- [x] Canonical doctrine document (this file)
- [x] Runtime spec, queue doctrine, completion doc, README cross-links
- [ ] Team review / acceptance

### Phase B — Entry flow (runtime)

| Step | Work | Primary anchors |
|------|------|-----------------|
| B1 | **Default to Operational State on Work Unit mount** — skip State 1 / Browse entry | `WorkUnitWorkspace.tsx`, work-unit `page.tsx`, `useAlloyOsRuntimeSplitActive.ts` |
| B2 | **Hide Browse Mode / full-width queue from operator chrome** — no toggle, no mode pill | `AlloyOsRuntimeSplitController.tsx`, `alloyOsRuntime.css`, WUC / queue header |
| B3 | **Keep dormant paths** — expanded `QueueBlock` reachable only via internal flag or test hook | `QueueBlock.tsx`, `alloyOsRuntimeFlag.ts` |

**Acceptance:** Opening a Work Unit with Alloy OS runtime enabled lands in condensed queue + Focus Panel region active (subject may be placeholder until B4).

### Phase C — Default Operational Subject resolution

| Step | Work | Primary anchors |
|------|------|-----------------|
| C1 | **Strategy enum + platform default map** per work-unit kind | `web/lib/adminV2/runtime/operationalSubject/defaultOperationalSubjectStrategy.ts` (new) |
| C2 | **Resolver function** — given queue items + strategy + operator context → selected row id | `resolveDefaultOperationalSubject.ts` (new) |
| C3 | **Wire Work Unit open** — after queue load, resolve subject, set URL `:recordId`, open split | work-unit `page.tsx`, route session cache |
| C4 | **Platform defaults** when no Work Unit config exists (Enrollment → `highest_priority`, etc.) | Same module + unit tests |

**Acceptance:** Work Unit open selects strategy-appropriate row, not arbitrary first row; Focus Panel opens on that row.

### Phase D — Operator strategy override (session-only)

| Step | Work | Primary anchors |
|------|------|-----------------|
| D1 | Queue header **Current Strategy** control (read-only label + dropdown) | `CompressedQueueHeader.tsx`, `WorkUnitCommandSurface.tsx` |
| D2 | Session state for override (URL param or route session — not Work Unit config) | `workUnitQueueSelection.ts` or new session slice |
| D3 | Re-sort queue + re-resolve subject + warm Focus Panel swap on change | queue page + split controller |

**Acceptance:** Changing strategy reorders queue and updates panel; refreshing Work Unit restores Work Unit default (not session override — or document session persistence if chosen).

### Phase E — Focus Panel + regression guards

| Step | Work | Primary anchors |
|------|------|-----------------|
| E1 | Perspective change → re-resolve default subject for new lens | `deriveRuntimePerspective.ts`, page reveal policy |
| E2 | Empty queue / no eligible row → intentional empty Focus Panel state | Focus Panel shell, queue empty predicates |
| E3 | Tests: no Browse Mode in operator DOM; auto-open on mount; strategy resolver determinism | `web/tests/adminV2/runtime/` |

**Protected suite:** Run adminv2-runtime-performance doctrine tests on any drawer/queue/page touch.

### Phase F — Configuration (deferred)

- Work Unit schema field for `default_operational_subject_strategy`
- Experience Builder exposure
- Custom strategy plug-in
- Business Process stage overrides

**Explicitly out of scope** until Phase B–E ship and doctrine is accepted in production.

### Sequencing recommendation

```
A (doctrine) → B (default operational state) → C (subject resolution) → D (override) → E (regression) → F (config)
```

Do **not** start F until B–E are stable behind `ALLOY_OS_RUNTIME_ENABLED`.

---

## Cross-references

- Queue preview contract: [`queue-system.md`](./queue-system.md)
- Operational surface geometry: [`alloy-os-runtime-completion.md`](./alloy-os-runtime-completion.md)
- Runtime spine: [`alloy-runtime-specification.md`](./alloy-runtime-specification.md) Part 2–5
- Card interaction on subject change: [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) (System 5B)
