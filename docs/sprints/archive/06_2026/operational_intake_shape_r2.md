# Operational Intake — Shape Exploration Round 2

**Status:** Design exploration (pre-implementation)  
**Gallery:** `/dev/operational-intake-shape-r2`  
**Baseline winner:** Stadium Shell (Round 1) → **Stadium Plus**

---

## Frozen interior

BOS column · material stack · findings · header · spacing — unchanged.

Only outer shell shape and atmosphere vary.

## Eight shapes × three atmosphere passes

Each section shows **A | B | C** side by side:

| Pass | Treatment |
|------|-----------|
| **A** | Bend Pine perimeter only |
| **B** | + subtle smoke/fog aura |
| **C** | + smoke + soft glow near material stack |

### Shapes

| # | Shape | Intent |
|---|-------|--------|
| 1 | Stadium Plus | Stronger crafted stadium curvature |
| 2 | Cloud Stadium | Vision Pro–like atmospheric swelling |
| 3 | Orbital Capsule | Long asymmetric engineered capsule |
| 4 | Cloud-Core | Shell bulges around material process |
| 5 | Winged Stadium | Stadium with outward side flare |
| 6 | Superellipse | Industrial hardware curve |
| 7 | Forged Oval | Flattened oval, wider center mass |
| 8 | Signature BOS | Strongest opinionated brand silhouette |

Screenshots: `docs/sprints/archive/06_2026/assets/operational-intake-shape-r2/`  
One PNG per shape (triple atmosphere in each).

## Rules

- Shell = outer frame, rectangular safe inset inside
- No clip/mask on content
- Bend Pine perimeter, Midnight Forge in shadow only
- No CRM modal, no rectangle-with-corner-treatment only

## Capture

```bash
cd web && npm run screenshots:operational-intake-shape-r2
```
