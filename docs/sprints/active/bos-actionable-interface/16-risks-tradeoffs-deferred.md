---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 16 — Risks, Tradeoffs, and Deferred Items

## Risks

| Risk | Mitigation |
|---|---|
| Regressing rich Create Lead intake while embedding in BOS | Reuse components; parity tests; phased fallback flag |
| Premature Processing Case creation | Hard rule in adapter tests: no case APIs before execute |
| Doctrine Contradiction #2 (two runtimes) confuses implementers | This package binds to actions/execute only |
| Scope creep into H2/H3 | Hard stop after WP-12 |
| sessionStorage loss feels like data loss | Copy on discard; optional later durable drafts |
| Narrow rail Form unusable | Pin-on-Form; stack; prefer Conversation on small widths |
| LLM later invents action keys | V1 fixes actionKey at invocation; server verifies |

## Tradeoffs

| Choice | Cost | Benefit |
|---|---|---|
| Ephemeral sessions | No cross-device resume | No migrations; simple trust model |
| Case at execute not at chat start | Operator must confirm before durable case | No orphans; clear command boundary |
| Keep IdentityReviewPanel as Processing UI | Less “fully conversational” identity | Reuses certified identity UX |
| Wire CommandSurfaceShell for preview, not entire gather | Two visual gathers (chat + form) | Avoid big-bang modal rewrite |

## Explicitly deferred

- Slash menu UI (H2)
- Daily briefing generator (H3)
- Dictation
- Durable cross-device drafts
- BOS capability registry entry (optional cleanup)
- Mutation Execution Runtime integration
- Conversational wrappers for all registered actions
- Autonomous apply
- Redesign of BOS identity system
- Resolving update_status doctrine contradiction (separate doc fix)

## Remaining product decisions

**None blocking V1.**

Deferred preferences (implementer may follow recommendations without pinging product):

1. Default mode = Conversation (Form one click away).
2. Pin BOS when entering Form if width &lt; 420px.
