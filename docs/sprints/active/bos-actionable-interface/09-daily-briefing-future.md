---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 09 — Daily Briefing Future Design (Horizon 3)

**Not in V1 build.** Separate from command sessions.

## Intent

Proactive “Good morning” operational briefing with priorities and recommendations that launch **registered** commands.

## Hard rules

- No invented metrics — consume MetricEngine / OIP / canonical projections only.
- No LLM-authored operational truth; LLM may only phrase explanations from structured inputs.
- Recommendations actionable only via `startBosCommandSession`.
- Briefing messages never write into an open command draft.
- Explicit frequency (`daily_morning`), org/operator scope, recency window, dismiss/read.

## Message model

See `BosOperationalBriefingMessage` in `04-command-session-and-data-contracts.md`.

## Generation (future)

```text
Scheduler / operator open
→ assemble structured briefing DTO from projections
→ optional phrasing assist (policy-gated)
→ insert ambient BOS turn
→ CTA → BosCommandInvocation
```

## V1 foundation stub (allowed)

- Message kind reserved in ambient thread types.
- Decision #25 documented.
- No generation pipeline.

## Contamination prevention

| Ambient briefing | Command session |
|---|---|
| Informational | Mutable draft |
| Dismissible | Confirm-to-execute |
| Shared transcript lane | Scoped session segment |
| May spawn session | Never mutates briefing item’s “truth” |
