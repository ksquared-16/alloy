# Worker Package Contract

Each assigned task receives files in its managed worktree:

```text
<worktree>/.alloy-worker-package.md
<worktree>/.alloy-worker-task.yaml
```

Copies are also stored under `initiatives/<key>/worker-packages/`.

## Package contents

| Section | Purpose |
|---------|---------|
| Identity | initiative, task, role, slot |
| Objective | task goal |
| Constitutional truth | platform invariants |
| Initiative-approved decisions | frozen product/visual choices |
| Worker discretion | allowed technical choices |
| Allowed / prohibited scope | exact boundaries |
| Documentation | focused manifest only (not full doctrine dump) |
| Code locations | likely files from audit |
| Environment | branch, port, staging SHA, QA identity alias |
| Acceptance + focused checks | what to verify locally |
| UI verification | routes, evidence path |
| Reporting schema | path to `reports/<task>-result.json` |
| Push/merge prohibition | explicit |

## Delivery (`alloy-worker-open`)

1. Resolve assigned worktree
2. Verify package exists
3. Start server when UI verification required (`--with-server`)
4. Open Cursor or Claude (Phase 2 behavior)
5. Copy package to clipboard
6. Print honest delivery summary

**Manual paste into the new worker session is required.** The toolkit does not automate GUI keystrokes inside Cursor or Claude.

Output distinguishes:

- `app launch: yes|failed|dry-run`
- `package copy: clipboard-only (yes|unavailable)`
- `Paste once into the new worker session`

## Report schema (`reports/<task-id>-result.json`)

```json
{
  "initiative_key": "...",
  "task_id": "...",
  "worker_slot": 1,
  "worker_role": "...",
  "status": "implemented|blocked|needs_decision|failed",
  "summary": "...",
  "commit": "<local git SHA>",
  "files_changed": [],
  "focused_checks": [],
  "ui_verification": {
    "required": true,
    "status": "passed|failed|not_run",
    "routes": [],
    "identity_alias": "...",
    "evidence": [],
    "console_errors": [],
    "failed_requests": []
  },
  "risks": [],
  "questions": [],
  "processes_left_running": []
}
```

Ingest with `alloy-worker-report <initiative> <task>`.

Conversational completion without this file is **not** accepted.

## Security

Packages may include variable **names**, identity aliases, readiness state, safe paths, local URLs.

Never include passwords, tokens, cookies, storage-state contents, or env values.
