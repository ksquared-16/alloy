---
owner: platform
status: active
last_reviewed: 2026-07-26
supersedes: []
---

# Assignment lifecycle resolver (operator labels)

Canonical facts compose one operator-facing label. No parallel status engine.

| Label | When |
|-------|------|
| **Archived** | Row status is archived |
| **Completed** | Terminal status, or effective end before as-of |
| **Planned** | `commitment_kind = proposed` and start after as-of |
| **Proposed** | `commitment_kind = proposed` (otherwise) |
| **Upcoming** | Committed and start after as-of |
| **Active** | Committed and covering as-of |

Do not conflate Proposed with Primary, Committed with Active, or Upcoming with Draft.

Implementation: `web/lib/operationalAssignments/assignmentLifecycleState.ts`.
