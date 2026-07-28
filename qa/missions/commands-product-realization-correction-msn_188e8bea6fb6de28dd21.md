# Commands product-realization correction — msn_188e8bea6fb6de28dd21

**Date:** 2026-07-28  
**Slot:** 1 (`wt1-commands-system-inventory`)  
**Scope:** Product/presentation only — Command Runtime / adapters / process authority unchanged.

## 1. Product diagnosis

The prior Commands page was a **registry + placement inspector**: five tabs, raw surface/slot rows, and maturity jargon (`Limited`) that answered “what does the registry contain?” rather than “what can an administrator configure?”

## 2. Availability row root cause

Detail API returns `action_placements` rows. Create lead has many **org-owned** placements that share identical `(surface, slot, entity_type)` with null `department_id` / `work_unit_id` — **duplicate/stale seed rows**, not distinct scopes the UI omitted. The old UI rendered each as `department · Primary` / `opportunity`, so duplicates looked identical and disabled.

**Fix:** `groupOperationalExposures()` collapses same-context rows into one human exposure with a collapse note; toggles apply to all org-owned member IDs.

## 3. Available / Limited / Unavailable

| Old badge | Source | Actionable? |
|-----------|--------|-------------|
| Available | maturity executable/adapted | Partially — support, not org enablement |
| Limited | maturity legacy/navigation_only **or** implementation partial/legacy/missing | **No** — engineering maturity |
| Unavailable | maturity unavailable/placeholder | Honesty gap only |

**Product replacement:** Supported / Needs attention / Not yet supported via `commandProductSupport()`. Registry `reason` strings are **not** admin status (they were sprint notes). Honest unavailable/placeholder gaps are included in the catalog even when `catalogVisibility` is `hidden`.

## 4. Truly organization-editable

1. Org-owned definition **label** — `PATCH /api/admin/action-definitions/:id`  
2. Org-owned definition **is_active** — same PATCH (extended this pass)  
3. Org-owned placement **is_active** — `PATCH /api/admin/action-placements/:id` (grouped)

Platform defs/placements remain read-only. Process selection stays on Business Processes (`command_set_v1`). Safety is read-only projection.

## 5. Product changes

- Progressive disclosure: no empty five-tab shell  
- Create lead reference: purpose, support, org enable/label, grouped exposures, BP empty + manage link, compact safety, variants hidden when empty  
- Catalog filters: All / Supported / Needs attention / Not yet supported  
- Limited removed from admin-facing language  

## 6. Persistence proof

- Label: set Create Lead → `Create Lead (QA)`, reload showed QA label, restored to `Create Lead`  
- Placement group: `queue_row|row_inline|opportunity` — toggled 2 org placements `false→true` (`ok:true`), then restored  

## 7. Screenshots

| File | Scenario |
|------|----------|
| `qa/missions/commands-ui-proof/03-create-lead-product.png` | Create lead reference |
| `qa/missions/commands-ui-proof/04-cancel-tour-safety.png` | Destructive / strong confirm |
| `qa/missions/commands-ui-proof/05-archive-lead-unsupported.png` | Not yet supported |
| `qa/missions/commands-ui-proof/06-create-lead-narrow.png` | Narrow layout |

BP-used Command: live Vacilando data had **no** `command_set_v1` selections for probed keys — empty state + manage link is the QA outcome.

## 8. Certification correction

**P8/P10:** Route integration was complete; administrator **product realization** required this pass. Commands is now a bounded org configuration product over Capability Registry authority — not a fake configurator and not a pure inspection catalog.
