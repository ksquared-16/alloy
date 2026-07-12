# Configuration UX Review v1

**Path:** `docs/sprints/archive/06_2026/configuration_ux_review_v1.md`  
**Status:** Phase 6 — operator UX recommendations (May 2026)

---

## Principle

Configuration must read like **enrollment operations**, not platform internals. Requirements belong to **lifecycle progression**, not to forms, modals, APIs, or intake paths.

---

## Good vs bad patterns

| Bad (developer) | Good (operator) |
|-----------------|-----------------|
| `field_key: desired_schedule_type` | **Desired schedule** |
| `requirement_policy: required_before_action` | **Required before enrollment** |
| `status_key_in: ['enrolling']` | **Show when status is Enrolling** |
| `move_to_waitlist` preflight catalog | **Move to waitlist — missing information** |
| Completion guardrails bootstrap table with `rule_key` | **Lifecycle progression** stage cards |

---

## Shipped in this sprint (Settings MVP)

| Surface | Route | Operator experience |
|---------|-------|---------------------|
| **Lifecycle progression** | Settings → Layouts (opportunity) | Six stages; Required vs Recommended checklists; no field keys |
| **Completion guardrails** | Settings → Layouts (person) | Unchanged read-only bootstrap table |
| **Action buttons** | Settings → Actions | Placements only; labels editable |
| **Attention & SLA** | Settings → Attention | Bucket lenses + thresholds (existing) |

---

## Recommended before editable requirement policy

1. **Stage picker first** — operator selects Qualification, then sees requirements (not a flat rule table).
2. **Checkbox metaphor** — Required information / Recommended information lists (see Lifecycle progression panel).
3. **Blockers copy** — use same labels as preflight panel (`Child`, `Program`, `Desired schedule`) — implemented in `lifecycleActionRequirementCatalog.ts` labels.
4. **Hide implementation_status / catalog JSON** — never expose in Settings.
5. **Action visibility** — Settings placement UI should say “Show on record header when status is …” instead of `condition_config` JSON (builder deferred).

---

## Deferred (out of scope)

- Full requirement policy authoring UI
- `condition_config` visual builder
- Queue domain rename/reorder Settings CRUD
- Per-org lifecycle policy overrides (use placements + attention metadata today)
