# BOS Operational Intake Shell Doctrine

**Status:** PROPOSED LOCK (pending QA sign-off)  
**Version:** 1.0  
**Last Updated:** June 2026

Companion to **`docs/system/bos-identity-doctrine.md`** (identity primitives). This doc governs **Create Lead / Operational Intake workspace geometry only**.

---

## Decision

Production Create Lead uses a **horizontal stadium shell** with a **restrained top-center swell** (90% stadium · 10% cloud influence in geometry only).

Silhouette exploration galleries are **closed**. Do not iterate shell shape without explicit doctrine revision.

---

## What changes

| Layer | Behavior |
|-------|----------|
| **Outer perimeter** | SVG stadium path + 1px Bend Pine stroke (~38% opacity) |
| **Top edge** | Mostly straight; single centered upward swell |
| **Bottom / sides** | Standard stadium semicircular ends; symmetric |
| **Atmosphere** | Soft non-directional Bend Pine haze **outside** perimeter only |
| **Interior** | Unchanged — rectangular columns, cards, header, workflow |

---

## What does not change

- Gather → review → execute → success flow
- BOS guidance column semantics
- Material stack and findings presentation (when present in workflow step)
- Header territory (BOS lockup, step rail, close)
- Content spacing and information architecture inside the safe area

---

## Rejected (do not restore)

- Cloud-core, cloud lobes, smoke artwork, energy auras
- Winged stadium, orbital capsule, trapezoid / hex / octagon shells
- Border-radius card shells as the production perimeter
- Clip-path or curvature on interior columns or cards
- Decorative bumps outside a rectangle

---

## Implementation

| Piece | Location |
|-------|----------|
| Path + tokens | `web/lib/bos/bosOperationalIntakeShellPath.ts` |
| Frame | `web/components/admin/actions/BosOperationalIntakeShellFrame.tsx` |
| Production shell | `web/components/admin/actions/ActionWorkspaceBosShell.tsx` |
| Capture gallery | `/dev/bos-operational-intake-shell-lock` |

### Tunable tokens

| Token | Default | Notes |
|-------|---------|-------|
| `BOS_OPERATIONAL_INTAKE_SHELL_SWELL_RATIO` | `0.01` | Top swell as fraction of height — keep ≤ 0.012 |
| `BOS_OPERATIONAL_INTAKE_SHELL_SWELL_SPREAD` | `0.2` | Horizontal influence of swell |
| `BOS_OPERATIONAL_INTAKE_SHELL_STROKE` | `rgba(0,162,131,0.38)` | Perimeter — second-glance only |
| `BOS_SHELL_OUTER_HAZE_STYLE` | radial + blur | Outside shell; opacity ~0.65 on layer |

---

## Acceptance (QA)

**Pass**

1. Reads as workspace object, not modal card or CRM panel  
2. Professional at first glance  
3. Silhouette recognizable at distance  
4. Interior layout untouched  
5. Cloud influence subtle (geometry, not illustration)  
6. Atmosphere almost subconscious  

**Fail**

1. “Cloud” / “spaceship” / “dashboard card” reactions  
2. Shape competes with workflow  
3. Content clipping or curve intrusion on interior UI  

---

## Capture

```bash
cd web && npm run screenshots:bos-operational-intake-shell-lock
```

Assets: `docs/sprints/06_2026/assets/bos-operational-intake-shell-lock/`

---

## Freeze checklist

- [ ] Desktop QA pass  
- [ ] Laptop QA pass  
- [ ] Stakeholder sign-off on before/after  
- [ ] Set **Status:** FROZEN in this doc  
- [ ] Link from `docs/system/bos-identity-doctrine.md` approved use cases  
