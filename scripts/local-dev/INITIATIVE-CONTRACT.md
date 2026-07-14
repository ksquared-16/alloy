# Initiative Contract

Explicit Initiative Brief schema for `alloy-initiative-create` / `alloy-initiative-import`.

## Required fields

```yaml
initiative:
  key: settings-fields-v2          # lowercase, digits, hyphen/underscore
  title: Settings Fields V2
  objective: One-sentence goal

operator_outcome:
  - What the operator can do after delivery

product_direction:
  - Approved product behavior (not implementation detail)

acceptance:
  - Measurable behavioral criteria

constraints:
  - Hard limits (scope, security, patterns)

human_approval:
  required_gates:
    - Gates that block approval until resolved
```

## Optional fields

```yaml
visual_references: []      # paths to approved mockups/screenshots
reference_routes: []       # existing Alloy surfaces as pattern source
known_files: []
known_docs: []
known_risks: []
out_of_scope: []
preferred_workers: []
verification_targets: []   # routes for UI verification
test_data_requirements: []
```

## Validation rules

- Unknown top-level fields may be preserved under `extensions` on import
- Malformed required fields fail with clear errors
- `initiative.key` must match the CLI argument
- Existing initiatives are never silently overwritten
- **Shell commands in content are treated as data only — never executed**

## UI visual basis

For user-visible work, planning requires exactly one of:

| Basis | When |
|-------|------|
| `exact_reference` | `visual_references` provided |
| `pattern_reference` | `reference_routes` name approved surfaces |
| `bounded_exploration` | explicit human authorization (may create decision queue item) |

Implementation must not start without one of these when `verification_targets` are declared.

## Example (sample — not an executed initiative)

```yaml
initiative:
  key: settings-fields-v2
  title: Settings Fields V2
  objective: Improve settings field authoring with clear ownership and intentional editing

operator_outcome:
  - Operators see a compact field list with a persistent details panel
  - Editing is deliberate, not always inline-visible

product_direction:
  - Use Configuration Runtime shell — do not invent a new settings chrome
  - Compact list + persistent details panel pattern

acceptance:
  - Field list renders without false empty states during cold load
  - Canonical field owners are visible and respected in the details panel

constraints:
  - AdminV2 runtime reveal gates unchanged (UI-only work)
  - No service-role exposure in worktrees

human_approval:
  required_gates:
    - visual basis confirmed

reference_routes:
  - /admin/settings/fields

verification_targets:
  - /admin/settings/fields

known_files:
  - web/components/admin/settings

out_of_scope:
  - unrelated queue or drawer runtime changes
```

Import:

```bash
alloy-initiative-create settings-fields-v2 --from initiative.yaml
```
