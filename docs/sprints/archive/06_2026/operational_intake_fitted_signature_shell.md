# Operational Intake — Fitted Signature Shell

**Status:** Design exploration (pre-implementation)  
**Gallery:** `/dev/operational-intake-fitted-shell`

---

## Objective

Fit the frozen three-column operational intake workspace inside a signature BOS shell.

**Shell = outer frame, not clipping mask.**

## Structure

1. Outer atmospheric field (fog + faint smoke)
2. Signature shell shape (Bend Pine edge)
3. Inner safe content area (rectangular, white)
4. Three-column workspace (unchanged)

## Shells

Screenshots: `docs/sprints/archive/06_2026/assets/operational-intake-fitted-shell/`

| Shell | Role | File |
|-------|------|------|
| **Stadium** | Production candidate | `01-stadium-shell.png` |
| **Hybrid oval-trapezoid** | Signature BOS | `02-hybrid-oval-trapezoid-shell.png` |
| **Soft trapezoid** | Architectural premium | `03-soft-trapezoid-shell.png` |

## Visual rules

- Bend Pine shell edge
- Midnight Forge depth in shadow only
- Faint BosSmoke atmosphere around shell
- Interior white, fully readable
- No clipped columns or text
- No blue header / white body hybrid
- No metaphor environments

## Capture

```bash
cd web && npm run screenshots:operational-intake-fitted-shell
```

## Correction from Geometry V1

Geometry V1 applied `clip-path` to the whole workspace — content was clipped. Fitted shells use a **decorative outer frame** with a **rectangular safe inset** inside.
