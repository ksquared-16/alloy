---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 08 — Slash-Command Extension Design

**Round 2 foundation shipped** for Create Lead. Broader command ecosystem remains deferred.

## Intent

`/` opens a searchable command menu sourced from the **registered and authorized** action/command catalog — never hardcoded UI aliases.

## Resolution pipeline

```text
Operator types "/"
→ queryBosSlashCatalog({ query, placedActionKeys?, authorized? })
→ filter RegisteredAction ∩ bosProposalSupport ∩ adapter-ready allowlist
→ rank by label match
→ on select → dispatchStartBosCommandSession({ placement: bos_slash })
```

Code: `web/lib/bos/commandSession/slash/queryBosSlashCatalog.ts`  
UI: ordinary `BosRailComposer` + `BosSlashCommandMenu`.

## Round 2 scope

- `/` discovery + typeahead + keyboard selection
- **Create Lead** only as production command (`BOS_SLASH_SESSION_ADAPTER_KEYS`)
- Same session/runtime as Actions → Create Lead
- No separate slash executor

## Rules

1. Token → `actionKey` via registry; never invent keys in the UI.
2. Availability respects adapter-ready allowlist; optional `placedActionKeys` when caller has placement resolution.
3. Target-specific actions without a subject stay ineligible with reason.
4. Slash menu does not bypass `confirmationPolicy`.

## Still deferred

- Natural language freeform “do anything”
- Exposing every `bosProposalSupport` action before adapters exist
- Daily briefing CTA → slash (Horizon 3)
