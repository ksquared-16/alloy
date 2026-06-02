# Desired Start — duplicate field audit

**Status:** Document only — no automatic deletion.

## Findings

Two Lifecycle Builder / intake paths surface “Desired Start” semantics on child/inquiry records, both backed by overlapping rule bindings.

| Rule ID | Entity | Label (palette) | OCM field | Form capture keys | Lifecycle Builder |
|---------|--------|-----------------|-----------|-------------------|-------------------|
| `child:desired_start_date` | child | Desired Start Date | `desired_start_date` | `desired_start_date`, `Desired start date`, `Start Date`, `Desired Start Date` | Yes — required-info palette |
| `child:start_date` | child | Start Date | `desired_start_date` (same) | `desired_start_date`, `Start Date` | Yes — required-info palette |

**Opportunity-level:** `desired_start_date` also appears on opportunity metadata / queue orchestration (e.g. completion requirements, preflight), separate from child OCM fields.

## Where used

| Surface | Field / rule |
|---------|----------------|
| Lifecycle Builder required info | Both `child:desired_start_date` and `child:start_date` in `lifecycleFieldRequirementsCatalog` / palette merge |
| Forms / intake capture | `lifecycleFieldRuleBindings.ts` — duplicate `form_capture_keys` overlap on “Start Date” |
| Create Lead / action intake | `createLeadIntakeFieldMap.ts` maps both rules to `child_desired_start_date` |
| Progression / completion | `lifecycleProgressionRequirementsCatalog` — child `desired_start_date` |
| Action preflight | `lifecycleActionRequirementCatalog` — `desired_start_date` on child |

## Recommendation

1. **Keep:** `child:desired_start_date` as the canonical Lifecycle Builder rule and intake mapping (`desired_start_date` on child OCM).
2. **Deprecate:** `child:start_date` rule — redundant label (“Start Date”) writing the same `desired_start_date` OCM column; causes duplicate picker rows in Required Information.
3. **Follow-up (not done here):** Migrate any org overrides that reference `child:start_date` → `child:desired_start_date`, then remove the rule from catalog/bindings after confirming no active form schemas rely on the legacy rule id alone.

## Risk

Removing `child:start_date` without migration may break saved `field_rules` overrides on departments that list `child:start_date` in `required_rule_ids`.
