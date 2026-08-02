---
owner: platform
status: sprint-artifact
last_reviewed: 2026-07-27
supersedes: []
---

# Operational Intelligence — Product Reset

**Sprint:** `operational-calculations` · Slot 4 · Cursor  
**Decision:** Authenticated product review **rejected**. Reopen Lane 1 realization. Do not polish. Do not start Planning code.

---

## 1. Current rejected anatomy

```text
Operational Intelligence
├── OverviewStrip (inventory KPI cards only)
├── Chapter tabs: Measurements | Diagnostics  ← Diagnostics is wrong
└── Measurements chapter
    ├── Thin ConfigurationQueue rail (~260px)
    │   └── Ownership + health chips; no lifecycle filters; no Add
    └── Detail canvas
        ├── Chip regions: Overview | Target & Health | History | Lifecycle | Provenance
        ├── Mostly static architecture / implementation copy
        ├── One real mutation: save goal (PATCH kpi-targets)
        └── Diagnostics remounts Analytics V2 (definitions, styles, rollups, snapshots, placement)
```

**Verdict:** Renamed registry inspector. Fails Organization Configuration Runtime and Phase 4 administrator jobs.

---

## 2. Reference Organization anatomy

Shared rhythm (Access Users / Processes / Surfaces):

```text
Domain home (or chapter entry)
  → Object collection (~20–22rem rail: search, filters, Add)
  → Selected object
  → Focused workspace (hero + concern tabs + real actions)
```

Primitives to reuse (patterns only):

- `ConfigurationContext` / `ConfigurationShell` / `process-config-page`
- `ConfigCollectionRail` / Access Users `xl:grid-cols-[22rem_minmax(0,1fr)]`
- `ConfigObjectHeader` / `ConfigWorkspaceTabBar` / `ConfigWorkspaceCard`
- `ConfigurationPrimaryButton` / ranked header actions
- Surfaces handoff (presentation owned elsewhere)

---

## 3. Proposed final anatomy

```text
Operational Intelligence (domain home)
├── Attention & configuration posture (real sources only)
├── Primary actions: Add measurements · Manage packs
└── Enter Measurements collection

Measurements (canonical object grain — one logical measurement once)
├── Collection filters: Active | Available | Customized | Disabled | Retired
│   (+ search, pack grouping; no Draft until persistence exists)
├── Add measurements (governed catalog)
└── Selected measurement workspace
    ├── Overview (business language; next action)
    ├── Configuration (enable/disable, goal, warning, restore defaults, retire/restore)
    ├── History (trends when present; product empty-state otherwise)
    ├── Availability (data readiness — not adapter essays)
    └── Presentation (read-only summary + Manage in Surfaces)

Measurement packs (Manage packs)
└── Pack meaning, included measurements, enabled state, required data

Diagnostics
└── Removed from ordinary product (internal/support disposition only)
```

---

## 4. Administrator flows

| Flow | Steps |
| ---- | ----- |
| Orient | Open OI home → see attention, gaps, packs, next work |
| Browse | Enter Measurements → filter/search → select one |
| Add | Add measurements → pack/domain catalog → select → enable → optional goals → confirm |
| Configure goal | Configuration → set goal / warning → save; Restore platform default |
| Lifecycle | Enable / Disable / Retire / Restore (real persistence only) |
| Packs | Manage packs → review → enable/disable pack (cascades measurement availability) |
| Present | Presentation → Manage in Surfaces |
| Support | No Diagnostics chapter; internal route if needed later |

---

## 5. Object and lifecycle model

| Concept | Meaning |
| ------- | ------- |
| Measurement | One OIP KPI key (platform-defined). Never template+org-copy peers. |
| Ownership | Platform vs Customized (= has org `kpi_targets` overlay). Not a lifecycle. |
| Active | Enabled for the organization |
| Available | In platform catalog for an enabled pack, not currently Active/Retired |
| Disabled | Explicitly off; can Enable again |
| Retired | Explicitly retired; can Restore |
| Draft | **Not shown** until a real draft contract exists |
| Pack | Code registry group; org may enable/disable |

---

## 6. Existing persistence support

| Capability | Source | Mutate? |
| ---------- | ------ | ------- |
| KPI catalog / labels / packs | `kpiRegistry`, `packs.ts` | Read |
| Current value + health | `GET /api/admin/metrics/resolve` | Read |
| Goals + thresholds + org override | `GET/PATCH /api/admin/metrics/kpi-targets` (`org_settings.metadata.kpi_targets`) | **Yes** (null = restore default) |
| Trends | `GET /api/admin/metrics/trends` | Read |
| V2 metric defs lifecycle | `/api/admin/analytics/metrics*` | Wrong grain — not OI collection |
| Pack enablement | None | — |
| Measurement enable/disable/retire | None | — |

---

## 7. Missing contracts → smallest durable solution

**Add (non-destructive):** `org_settings.metadata.oi_config`

```ts
type OiConfigMetadata = {
  oi_config?: {
    /** Absent / null = legacy default: all KPIs from enabled packs are Active */
    measurements?: Partial<Record<string, { status: "active" | "disabled" | "retired" }>>;
    /** Absent / null = all code-available packs enabled */
    packs?: Partial<Record<string, { enabled: boolean }>>;
  };
};
```

**API:** `GET/PATCH /api/admin/metrics/oi-config` (admin write), same upsert pattern as kpi-targets.

**Read semantics:**

1. Pack enabled iff `packs[key].enabled !== false` (default on for `domainStatus: available`).
2. Measurement status: explicit `measurements[key].status` if set; else if pack enabled → `active`; else → `available` (not offered until pack on).
3. Customized facet: Active + `has_org_override`.
4. First Disable/Retire/Enable writes only touched keys (sparse); defaults remain compatible.

**Do not:** migrate destructively; fake buttons; use V2 archive as OIP retire; expose SQL/adapters.

**Warning thresholds:** already in kpi-targets overlay — expose in Configuration.

**Restore default goal:** PATCH `{ kpi_targets: { [key]: null } }` — wire in UI.

---

## 8. Keep / change / remove

| Asset | Disposition |
| ----- | ----------- |
| Route `/organization/operational-intelligence` | Keep |
| Legacy redirects → OI | Keep |
| `OipSettingsProvider` / snapshot fetch | Keep; extend with oi-config |
| `PATCH kpi-targets` | Keep; add restore + warning |
| `oiMeasurementCollection.ts` | Replace model (lifecycle + facets) |
| `OperationalIntelligenceWorkspace.tsx` | Replace product shell |
| Overview KPI strip as home | Remove → domain home |
| Diagnostics chapter + V2 mount | Remove from ordinary product |
| Metric builder / viz / rollups / snapshot button / OipVisibilityPanel | Contain: internal later; not OI nav |
| Surfaces handoff | Keep |
| Architecture / overlay / adapter copy | Remove from primary UI |

### Diagnostics item disposition

| Item | Disposition |
| ---- | ----------- |
| Calculations registry / metric defs | Internal support / unfinished — hide |
| Display styles | Surfaces-owned |
| Combined scores | Unfinished — hide |
| Snapshot refresh | Platform ops — hide |
| Legacy experience placement | Compatibility / Surfaces — hide |
| Template + org-copy dual rows | Must not reappear as peer measurements |

---

## 9. Implementation slices

| # | Slice | Testable when |
| - | ----- | ------------- |
| 1 | Domain home | Attention cards + primary actions; no Diagnostics |
| 2 | Measurement collection | Filters, one row per KPI, selection |
| 3 | Add measurements flow | Catalog → enable → refresh |
| 4 | Selected Overview | Business copy + current/goal/health |
| 5 | Configuration + targets | Goal, warning, restore default |
| 6 | Lifecycle actions | Enable/Disable/Retire/Restore via oi-config |
| 7 | History + Availability | Trends UI + product empty states |
| 8 | Measurement packs | Manage packs panel + enable |
| 9 | Surfaces handoff | Presentation tab only |
| 10 | Diagnostics removal | Not in nav; V2 not ordinary path |
| 11 | Compatibility | Redirects still land on OI |
| 12 | QA | Vitest + authenticated browser evidence |

---

## 10. Acceptance criteria

- Belongs beside other `/organization` products (structure + density)
- Meaningful administrator work (not inventory-only)
- Add measurements is real
- Enable/disable (and retire/restore) are real or absent — never fake
- Goals customize + restore
- One measurement once; no template peers
- No implementation architecture as primary copy
- Diagnostics absent from ordinary product
- Analytics V2 UI not ordinary customer path
- Useful default state; substantial selected detail
- Surfaces = only presentation editor
- Browser evidence for primary flows; no P0/P1 remaining

---

## Product-reset decision

**Proceed to implement** with `oi_config` metadata overlay. No destructive migration. Draft filter omitted until draft persistence exists.
