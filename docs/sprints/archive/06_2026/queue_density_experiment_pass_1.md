# Queue Density Experiment — Pass 1

**Status:** **CLOSED — adopted into Work Unit Layout V3 (June 2026)**  
**Superseded by:** `docs/system/work-unit-layout-doctrine.md` · `docs/sprints/archive/06_2026/completed/work_unit_layout_v3_freeze_closeout.md`

Pass-1 spacing values are now the **default** compact queue baseline on all work-unit surfaces (`adminv2-ws-wu-v2`). The `data-ws-wu-queue-density="pass-1"` opt-in mechanism has been removed.

Historical experiment notes retained below for audit context only.

---

## Original goal (May–June 2026)

Increase visible queue records by ~one row via spacing-only compact mode without reducing typography.

## Outcome

Staging validation confirmed readability at pass-1 density. Values merged into canonical CSS and doctrine freeze (June 2026).

## Original tokens (now canonical defaults)

| Token | Adopted value |
|-------|---------------|
| `--ws-wu-queue-row-min-height` | 37px |
| `--ws-wu-queue-row-gap` | 5px |
| `--ws-wu-queue-visible-rows-target` | 6 laptop / 7 @1440px+ |
