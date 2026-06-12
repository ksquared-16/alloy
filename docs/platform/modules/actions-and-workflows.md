# Actions and workflows

**Status:** Canonical platform module doc.

Event spine, workflow execution, and admin action router.

---

## Spine

```
emitEvent → workflow_events → workflowRun → effects (DB, messages, updates)
```

Tokenized public actions: `/api/action/[token]/consume` → event → workflows.

---

## Key modules

| Module | Path |
|--------|------|
| Event emit | `web/lib/emitEvent.ts` |
| Workflow run | `web/lib/workflowRun.ts` |
| Admin actions | `web/lib/admin/actions/executeAdminAction.ts` |
| Action catalog | `action_definitions` table |

---

## Rules

- Meaningful business mutations should use event/workflow path where product already does
- Completion guardrails on lifecycle execute paths
- Workflow events: JWT SELECT-only; inserts via service role

---

## Canonical action catalog

Lifecycle-aligned `action_definitions` — placeholder retirement in progress.

---

## Related

- `../../system/actions-and-workflows.md` (transitional expanded reference)
- `../core/status-and-state-system.md`
