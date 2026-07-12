# BOS Operational Intake — Shell Lock

**Branch:** `bos-operational-intake-shell-lock` (from staging)  
**Doctrine:** `docs/system/bos-operational-intake-shell-doctrine.md` (PROPOSED LOCK — pending QA)

---

## Implemented

Production Create Lead shell is now a **horizontal stadium** with:

- Restrained **top-center swell** (~1% height — geometry only)
- **1px Bend Pine** SVG perimeter stroke (38% opacity)
- **Outer haze** outside perimeter (radial fog, not smoke art)
- **Rectangular interior** — workflow, columns, header unchanged

### Code

| File | Role |
|------|------|
| `web/lib/bos/bosOperationalIntakeShellPath.ts` | Path math + tokens |
| `web/components/admin/actions/BosOperationalIntakeShellFrame.tsx` | Clip + stroke + haze |
| `web/components/admin/actions/ActionWorkspaceBosShell.tsx` | Production integration |

### Capture

```bash
cd web && npm run screenshots:bos-operational-intake-shell-lock
```

| Asset | Path |
|-------|------|
| Desktop | `docs/sprints/archive/06_2026/assets/bos-operational-intake-shell-lock/desktop-locked-shell.png` |
| Laptop | `docs/sprints/archive/06_2026/assets/bos-operational-intake-shell-lock/laptop-locked-shell.png` |
| Before/after | `docs/sprints/archive/06_2026/assets/bos-operational-intake-shell-lock/before-after-shell-lock.png` |

Gallery: `/dev/bos-operational-intake-shell-lock`

---

## Closed

Silhouette comparison board and shape R2 explorations — **no further shell iteration** without doctrine revision.

---

## Token tuning (if QA requests)

| Token | Current | Direction |
|-------|---------|-----------|
| `BOS_OPERATIONAL_INTAKE_SHELL_SWELL_RATIO` | `0.01` | Lower if top reads “cloud”; raise max `0.012` if too flat |
| `BOS_OPERATIONAL_INTAKE_SHELL_STROKE` | `rgba(0,162,131,0.38)` | Lower to `0.28` if perimeter draws eye |
| `BOS_SHELL_OUTER_HAZE_STYLE.opacity` | `0.65` | Lower to `0.45` if haze visible |

---

## QA checklist

See doctrine acceptance criteria — freeze doc status to **FROZEN** after sign-off.
