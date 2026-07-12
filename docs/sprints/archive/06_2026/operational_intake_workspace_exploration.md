# Operational Intake Workspace — Exploration

**Status:** Design exploration (pre-implementation)  
**Gallery:** `/dev/operational-intake-workspace`  
**Scope:** Create Lead intake — mockups only

---

## Objective

Make Create Lead feel like an **operational workspace**, not a CRM form.

Stop iterating on document-form layouts. Explore a **three-column workspace** where analysis happens **in-place** — no Analyze button, no wizard, no separate review screen.

---

## Layout model

| Column | Role |
|--------|------|
| **1 — BOS** | Actions, guidance, live analysis status |
| **2 — Intake** | Paste, type, upload — shape varies per mockup |
| **3 — Findings** | Extracted entities stream in progressively as BOS reads material |

Findings appear **live** in column 3. User does not click Analyze and move to another screen.

---

## Mockups

Screenshots: `docs/sprints/archive/06_2026/assets/operational-intake-workspace/`

| # | Intake surface | File |
|---|----------------|------|
| 1 | Floating intake card | `01-floating-intake-card.png` |
| 2 | Drop zone + received snippet | `02-drop-zone-intake.png` |
| 3 | Stacked material cards | `03-stacked-material-cards.png` |
| 4 | Inbox + command-center input | `04-inbox-command-center.png` |

---

## Rejected patterns

- Giant textarea
- Giant document / blank canvas
- Wizard form steps
- Review screen after intake
- Analyze → navigate to findings
- V2 document-form layout iterations

---

## Capture screenshots

```bash
cd web && npm run screenshots:operational-intake-workspace
```

---

## Next step

Choose intake surface shape + three-column shell for production implementation. No BOS identity redesign; no workflow/backend changes in this exploration.
