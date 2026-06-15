# Configuration platform

**Status:** Canonical platform module doc.

Settings control plane — config steers presentation within platform guardrails.

---

## Four-plane model (V1 shipped)

| Plane | Settings route | Owns |
|-------|----------------|------|
| Fields | `/admin/settings/fields` | Field registry, types, visibility |
| Field grouping | `/admin/settings/field-grouping` | Section labels |
| Layouts | `/admin/settings/layouts` | Placements, drawer composition |
| Actions | `/admin/settings/actions` | Org action placements |

Plus: statuses, business processes, placement priority, org settings.

---

## Rules (frozen)

- Config **steers** — code owns invariants
- Do not implement business truth only in JSON
- Field policy effective resolution merges layout placements + definitions
- CRM scope (dept/site) is visibility — separate from permission keys

---

## Business process builder

Part of configuration plane — `/admin/settings/lifecycle` (UI: Business Processes).

---

## Related

- `../../system/configuration-system.md` (transitional expanded reference)
- `../core/business-process-system.md`
- `../../system/configuration-ownership-doctrine.md`
