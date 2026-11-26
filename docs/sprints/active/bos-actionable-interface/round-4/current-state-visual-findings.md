---
owner: platform
status: active
last_reviewed: 2026-07-27
---

# Round 4 — Current-state visual findings

Grounded in post–Round 3 `BosCommandSessionHost` + `ActionWorkspaceGatherFields` (uncommitted Round 3 tree on this branch).

| # | Problem | Code cause | Round 4 fix package |
|---|---|---|---|
| 1 | Still feels like a long HTML form | One mega `WorkspaceCard` wraps all `layout="sections"` fields | R4-03 progressive section cards |
| 2 | White cards disappear | Card + heavy white inputs on barely-visible stone; low border contrast under dense fills | R4-02 stronger field/card separation; R4-04 quieter inputs |
| 3 | Vertical input rails dominate | `border-l-2 pl-2` on every field in `ActionWorkspaceGatherFields` | R4-04 `chrome="quiet"` removes idle rails |
| 4 | Every field shown at once | No section open/closed state | R4-03 |
| 5 | Two-column spreadsheet feel | `sm:grid-cols-2` for all fields when expanded | R4-04 pair-only two-column; pinned always 1-col |
| 6 | Required ≈ optional weight | Sections equal chrome; no required-first summary | R4-03 / R4-03 required-first copy |
| 7 | Large Start Here card | Empty-state `WorkspaceCard` “Start here” | R4-05 compact help `[?]` |
| 8 | “Inquiry” vs Lead | Composer label “Paste or type the inquiry”; paste examples | R4-05 Lead vocabulary |
| 9 | No completed-info summary in Form | Form is always edit; understanding cards only in Conversation | R4-03 / R4-05 section summaries |
| 10 | No stable command sizing | Density from pin only; floating width operator-persisted without command preset | R4-06 command-workspace preset |

## What Round 3 got right (keep)

- Shared `BosCommandDraft` · ConversationIntakeAdapter · no mode-switch transcript noise
- `WS_FIELD` host root · `WS_ACTION_*` footer · UnderstandingStack card language
- Sticky footer control center · success Open Lead / Create Another / Return
- Effective intake sections (person / child / context) as grouping source
