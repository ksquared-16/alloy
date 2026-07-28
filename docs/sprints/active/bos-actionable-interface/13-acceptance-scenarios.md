---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 13 — Acceptance Scenarios

Legend: **V1** = required for milestone · **Arch** = architectural validation / Horizon stub

| # | Scenario | Tier | Expected |
|---|---|---|---|
| 1 | Simple complete pasted lead | V1 | Parse fills fields; preview; confirm; Processing; commit; success |
| 2 | Partial lead requiring follow-up | V1 | Asks only missing required; Form shows same gaps |
| 3 | Multiple parents different emails/phones | V1 | Household draft; Form repeaters; commit selection intact |
| 4 | Multiple children | V1 | Same |
| 5 | Location/program/room/schedule via canonical options | V1 | Parity with dropdown sources; no free-text drift |
| 6 | Extra info beyond required preserved | V1 | Notes/unmapped retained through execute payload |
| 7 | Ambiguous existing parent match | V1 | Processing review surfaces candidates; no silent link |
| 8 | Conflicting child identity | V1 | Processing conflict lane; operator decides |
| 9 | Operator chooses create-new with reason | V1 | Processing reason capture; commit creates new |
| 10 | Conversation → Form → Conversation preserves state | V1 | Draft identical; evidence states retained |
| 11 | Operator corrects parsed value | V1 | State → operator_entered/confirmed; evidence notes edit |
| 12 | Operator removes inferred value | V1 | Field missing; blockers update |
| 13 | Required field configuration changes | V1 | Revalidate on preview/execute; new required appears |
| 14 | Unauthorized operator | V1 | Action hidden / execute 403; no case |
| 15 | AI disabled for org | V1 | Deterministic parse still works; if LLM path exists it must fail closed without blocking Form |
| 16 | Create Lead action not placed | V1 | Not discoverable in Actions; cannot start via placement |
| 17 | Stale preview before execute | V1 | Fingerprint mismatch blocks execute; refresh preview |
| 18 | Duplicate confirm click | V1 | One case via idempotency |
| 19 | Network failure and retry | V1 | Draft preserved; retry safe |
| 20 | Successful create and queue refresh | V1 | Pill/queue update via existing event |
| 21 | Open Lead from success | V1 | Explicit only; Focus Panel Work mode |
| 22 | Close and resume unfinished session | V1 | Same-tab sessionStorage restore |
| 23 | Slash menu shows only authorized commands | Arch (H2) | Catalog filter unit test in stub; UI later |
| 24 | Daily briefing recommendation launches same surface | Arch (H3) | CTA factory unit test in stub; no generator |

## V1 exit bar

All **V1** rows demonstrable in live authenticated admin/ops session on slot localhost **or** equivalent automated coverage where live is blocked — with evidence captured per `14`.
