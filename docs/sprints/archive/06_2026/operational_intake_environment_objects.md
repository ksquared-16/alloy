# Operational Intake Workspace V2 — Environmental Objects

**Status:** Design exploration (pre-implementation)  
**Gallery:** `/dev/operational-intake-environment`

---

## Shift from containers to objects

Stop exploring borders, frames, perimeters, and modal silhouettes.

Design the workspace as a **recognizable environmental object**. UI is embedded inside the object — not placed inside a rectangle with a modified edge.

---

## Frozen operational model

| Role | Meaning |
|------|---------|
| **Material** | Center of gravity — website inquiry, email, call note, form submission, upload |
| **BOS** | Supporting intelligence — interprets material, does not dominate |
| **Findings** | Emergent outputs — parent, child, program, location, tour interest |

Analysis happens in-place. No wizard. No Analyze-then-navigate.

---

## Environmental objects

Screenshots: `docs/sprints/archive/06_2026/assets/operational-intake-environment/`

### 1 — Oval Command Table

**Metaphor:** War room command table — operators seated around a horizontal oval.

**Not CRM:** CRM is a modal dialog. This is a table you work *around* — spatial seating, not a form in a box.

**File:** `01-oval-command-table.png`

### 2 — Arena

**Metaphor:** Operations arena — material on the activity floor; BOS and findings on opposing tiers curving inward.

**Not CRM:** CRM uses equal grid panels. The arena uses concentric focus toward the material floor.

**File:** `02-arena.png`

### 3 — Forge

**Metaphor:** Raw material enters; heat processes; refined findings exit. BOS monitors from the forge floor.

**Not CRM:** CRM is static data entry. The forge is asymmetric transformation — Material → Processing → Outcome without arrows.

**File:** `03-forge.png`

### 4 — Observatory

**Metaphor:** Observation deck — material is the target; findings orbit in analytical rings; BOS at the observer pedestal.

**Not CRM:** CRM lists field rows. The observatory maps entities in orbital relation to the target.

**File:** `04-observatory.png`

---

## Success criteria

| ❌ Reject | ✅ Target |
|----------|----------|
| Looks like CRM | Looks like a workstation |
| Looks like a modal | Looks like a command center |
| Looks like a dashboard | Purpose-built operational tool |

---

## Capture

```bash
cd web && npm run screenshots:operational-intake-environment
```

---

## Abandoned

- Container borders and shell outlines
- Cloud-shaped containers
- Equal-width dashboard columns
- Cards on cards
- Giant textareas and document canvases
- Wizard flows
