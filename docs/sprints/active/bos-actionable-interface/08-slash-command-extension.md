---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 08 — Slash-Command Extension Design (Horizon 2)

**Not in V1 build.** Foundation must not block this.

## Intent

`/` opens a searchable command menu sourced from the **registered and authorized** action/command catalog — never hardcoded UI aliases.

Examples: `/create lead`, `/schedule tour`, `/send message`, …

## Resolution pipeline

```text
Operator types "/"
→ BosSlashCatalog.query({ workspace, subject, placement: bos_slash, permissions })
→ filter RegisteredAction + canonical placement allowlist + eligibility preview
→ rank by label match
→ on select → startBosCommandSession(invocation)
```

## Rules

1. Token → `actionKey` via catalog map; reject unknown tokens server-side if a slash execute API is added.
2. Availability respects workspace, selected subject, process/stage, placement, permissions, eligibility.
3. Target-specific actions without a subject stay ineligible with reason.
4. Create Lead (no subject required) remains eligible when placement + RBAC allow.
5. Slash menu does not bypass `confirmationPolicy`.

## V1 foundation stub (allowed)

- `BosSlashCommandDescriptor` type in contracts.
- Session factory accepts `placement: "bos_slash"`.
- No UI menu required in V1.

## Explicit non-goals (H2)

- Natural language freeform “do anything”
- Client-invented action keys
- Separate slash executor
