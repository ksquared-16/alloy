---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Roster Projection Contract

**Status:** Proposed — the read model behind the Roster's grid, cell drill-down, child inclusion, and future printing. Companion to [`scheduling-product-spec.md`](./scheduling-product-spec.md) §6. The Roster **visualizes** reality; this projection is a **derived, non-authoritative, recomputable read model** — never a second source of truth.

**Design rule that makes printing free later:** the V1 drill-down and a future print renderer consume the **same projection**. Build the read model once; render it two ways.

---

## 1. Three shapes, one projection

The projection derives entirely from the calculation map ([`scheduling-calculation-map.md`](./scheduling-calculation-map.md)) over committed `child_placements` / `schedule_assignments` (+ projected mode). It has three levels of resolution:

### 1.1 `RoomWeekSummary` — the grid
```
RoomWeekSummary {
  room: { id, name, programKey, ageGroup, capacity, operatingWindows },
  weekHealth: 'healthy' | 'tight' | 'over',        // calc #8 (worst cell)
  days: RoomDayCell[]                               // 5–7 cells
}
RoomDayCell {
  date, state: 'committed' | 'proposed' | 'closed',
  scheduledCount, capacity, fillPct,                // calc #1, #2
  ratioTier: { maxChildren, requiredStaff },        // calc #3
  requiredStaff, scheduledStaff|null,               // calc #4, #5 (null = unknown)
  health: 'healthy'|'tight'|'over',                 // calc #8
  hasWarnings: bool
}
```
Renders the grid + room-week chip. **No child data** at this level (cheap, list-scale).

### 1.2 `RoomDayInspection` — the drill-down ("who is included?")
```
RoomDayInspection extends RoomDayCell {
  program, ageGroup,
  effectiveSource: 'committed schedule' | 'proposed change #…',
  staffing: { required, scheduled|null, note? },     // 'staffing not connected' when null
  children: RosterChild[]
}
RosterChild {
  childId, displayName,
  schedulePattern,                                   // e.g. "Mon–Fri", "Tue/Thu"  (calc #7)
  attendanceExpectation: 'expected' | 'expected-absent' | 'unknown',  // calc #11
  warnings: string[],                                // e.g. "start date is today", "program mismatch"
  placementSource: 'committed' | 'proposed'
}
```
This is the answer to *"who is actually in Sunflower Thursday?"* Rendered as a **Focus Panel card**, not a separate roster product.

### 1.3 `RosterPrintProjection` — future, same source
```
RosterPrintProjection {
  scope: 'room'|'site'|'day'|'week',
  printedAsOf: timestamp,                             // snapshot time — see §3
  fields: FieldSelection,                             // chosen columns/attributes
  groups: GroupSpec, sort: SortSpec, density, heading, branding,
  rows: RosterChild[+permissioned extras]            // superset of 1.2's children
}
```
**Not built in V1.** Documented so V1's `RoomDayInspection` is a strict subset the print renderer extends.

---

## 2. Sensitive data & permissions (governs print, guides drill-down)

- The V1 drill-down shows **operational** fields only (name, pattern, attendance expectation, operational warnings). It does **not** show emergency contacts, allergies, or safety indicators.
- The future print projection **may** include emergency/contact info, allergies, and safety indicators **only under explicit permission**, per field. Permission is checked at projection time; the read model carries a per-field visibility gate.
- Because print can carry sensitive data onto paper, print field selection is a **governed configuration** (§4), and every print is stamped with **who/when** and a **"printed as of"** time (§3).

---

## 3. Snapshot & "printed as of"

- The projection is **derived and time-stamped.** A drill-down shows *live* current/projected values; a print shows a **frozen snapshot** with an explicit **"printed as of {timestamp}"** header, so a paper roster is never mistaken for live truth.
- Committed vs proposed is always distinguished in every shape. A print of a *proposed* week is watermarked *proposed*; the default print is **committed only**.

---

## 4. Why print configuration belongs in Studio/Configuration

Print layouts (fields, grouping, sort, heading, density, branding, saved templates) are **reusable configuration assets** — exactly what Studio authors. Reasons:

- They are authored once and reused across many prints — the definition of a config asset, not a per-decision choice.
- Field selection touches **permissioned sensitive data** — it must be governed, versioned, and role-scoped, which Configuration provides.
- Keeping print config in Studio ensures **printing never becomes a source of scheduling truth**: a print template is a *view spec* over the projection, never a place where schedule data is authored or edited.

So: **the projection (this doc) is platform/Scheduling; the print *template* is Studio configuration; the rendered print is a snapshot view.** Three clean layers.

---

## 5. Materialization

- Default: **compute on read** from the calculation map (cheap for a room-week; the grid is 8 rooms × 5 days).
- Optional: a **non-authoritative, recomputable cache** for large sites, clearly marked and always reproducible by recomputation. Never edited in place; never the source of truth. *(Confirm at build — see product spec §15.5.)*

---

## 6. What this contract guarantees

- **One read model, three renders** (grid · drill-down · future print) — printing is additive, never a rebuild.
- **No second source of truth** — the projection derives from committed placement/schedule + calculations; editing happens only through preview→commit.
- **Child-level and effective-dated authority preserved** — `RosterChild.placementSource` and `effectiveSource` always trace back to the authoritative rows; the roster shows, it never owns.
- **Print-ready without print work** — V1 ships §1.1 and §1.2; §1.3 is a documented superset for later.

---

## Cross-references

- [`scheduling-product-spec.md`](./scheduling-product-spec.md) §6 — roster product behavior.
- [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) — the calculations this packages.
- [`../core/placement-system.md`](../core/placement-system.md) — the authoritative placement/schedule rows.
