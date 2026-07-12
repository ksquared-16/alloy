# Work Unit Layout Doctrine V3 — Freeze Closeout

**Date:** June 2026  
**Status:** **CLOSED — frozen canonical doctrine**  
**Authority:** `docs/system/work-unit-layout-doctrine.md`

---

## What was tested

Staging validation (June 2026):

- Queue scroll through full record sets (50+ rows)
- Drawer overlay alignment after right-rail width reclaim
- Horizontal overflow / scrollbar audit (laptop + large desktop)
- Readability spot-check at compact density (pass-1 spacing)
- BOS sticky behavior with Actions + Workflow Telemetry expanded/collapsed
- Command rail order and collapsed single-line utility headers
- Queue icon consistency (household, person, child, email, phone)

---

## What was approved

| Item | Decision |
|------|----------|
| **Work Unit Layout V3** | Canonical page structure: Header → Queue (primary) + Command rail (Actions → Telemetry → BOS) |
| **Queue density pass-1** | **Adopted** — spacing-only compact rows merged into default `adminv2-ws-wu-v2` CSS (no opt-in attribute) |
| **Queue icon doctrine** | Neutral metadata icons; pine only for BOS/actions; sizing table locked |
| **Queue width doctrine** | Trailing padding + gutter reclaim (~16–32px) without BOS rail resize |
| **Telemetry placement** | Right rail utility only — never below queue or in primary column |
| **Collapsed rail pattern** | `Actions (N)` / `Workflow Telemetry (n)` single-line headers |

---

## What was rejected

- Large workflow telemetry below queues
- Telemetry blocks in primary column
- BOS height or width reduction for queue/telemetry
- Green person/contact icons or green contact names by default
- Typography shrink for density
- Horizontal scrolling
- Additional work-unit chrome above frozen baseline

---

## What is now frozen

- `docs/system/work-unit-layout-doctrine.md` — **Canonical V3 (June 2026)**
- CSS tokens on `[data-ws-surface="work_unit"].adminv2-ws-wu-v2` — density, width, icon sizing
- `WorkUnitWorkspace` shell — no telemetry in primary column
- `AutomationWorkflowsBlock` `presentation="work_unit_rail"` — operator-only expand content

**Do not** reopen layout experiments without explicit doctrine amendment.

---

## Supersedes

- `docs/sprints/06_2026/queue_density_experiment_pass_1.md` — experiment closed; pass-1 adopted into V3 baseline
