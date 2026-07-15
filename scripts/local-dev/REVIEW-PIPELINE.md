# Review Pipeline

V1 review/remediation for local initiatives.

## Review types

`architecture` | `doctrine` | `ui` | `performance` | `test` | `documentation` | `integration`

Generate a reviewer package with an explicit mode:

```bash
alloy-initiative-review <initiative> --mode advisory --type architecture
alloy-initiative-review <initiative> --mode gate --type test
alloy-initiative-review <initiative> --mode final --type integration
alloy-initiative-review <initiative> --ingest task-002
```

Default review task: `task-002` (architecture/doctrine slot). Implementation worker must not be the sole reviewer for material UI or architectural work.

## Review modes

| Mode | Valid timing | READY effect |
|------|--------------|--------------|
| `advisory` | During implementation or later | None; never promotes |
| `gate` | After required worker reports, during validation/review | Pass may satisfy a gate; fail blocks |
| `final` | After report ingestion and validation, before merge-ready | Completed pass is required for READY |

When omitted, mode inference is conservative: `implementing` → `advisory`; `validating`/`reviewing` → `gate`. Final review must be requested explicitly.

## Review report schema

Write to `reviews/task-002-review.json`:

```json
{
  "review_id": "...",
  "initiative_key": "...",
  "task_ids": ["task-001"],
  "review_type": "ui",
  "review_mode": "final",
  "status": "pass|pass_with_findings|fail|blocked",
  "findings": [],
  "severity": "info|minor|major|blocker",
  "evidence": [],
  "required_remediation": [],
  "unresolved_decisions": []
}
```

## Remediation

```bash
alloy-initiative-remediate <initiative>
```

Behavior:

- Collects `required_remediation` from failed reviews
- Groups by owning task (`task-001` implementation owner)
- Writes `remediation/round-N-task-001.md`
- Copies bounded package to worktree `.alloy-worker-package.md`
- Preserves approved specification hash — no scope expansion
- Increments `remediation_round` in state
- Transitions to `implementing` for rework

Operator delivers via `alloy-worker-open` (clipboard paste).

## Merge readiness

Review `fail` or `blocked` prevents `READY` classification in `alloy-initiative-package`.

Pass path: `reviewing` → `merge_ready` → `awaiting_promotion_approval` (via package command when gates pass).

## Human decision queue

Only escalates questions involving product direction, conflicting doctrine, architecture tradeoffs, scope expansion, visual ambiguity, security, destructive ops, or promotion.

Ordinary implementation details stay in worker discretion.
