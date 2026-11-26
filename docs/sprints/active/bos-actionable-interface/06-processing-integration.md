---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 06 — Processing Integration Design

## Verdict

**Reuse Processing behind Create Lead. Do not create Processing Cases from conversation keystrokes. Do not make every BOS command a Processing Case.**

## Boundary

```text
BOS session (provisional)
  └── Create Lead adapter
        └── executeCreateLeadCommand
              └── executeCreateLeadAction
                    └── ingestCreateLeadThroughProcessing   ← Case created HERE
                          └── facts / resolution / plan / approve / commit
```

| Layer | Owns |
|---|---|
| BOS | UX, draft, evidence labels, confirm intent |
| Registered command | Eligibility floor, payload schema, open case |
| Processing | Identity candidates, immutable plan, approval, commit, idempotency |

## Answers to primary hypotheses

| Hypothesis | Decision |
|---|---|
| Create Processing Case immediately on BOS start? | **No** |
| Processing remains behind Create Lead as internal authority? | **Yes** |
| Conversation is a Processing source adapter? | **Indirectly** — conversation adapts to Create Lead payload; Create Lead source adapter remains the Processing source (`sourceKind: "create_lead"`). Do not invent `sourceKind: "bos_chat"` unless product later needs distinct analytics — optional metadata `surface: "bos"` is enough. |
| Provisional BOS session before Case? | **Yes** |
| When durable info written? | Case/facts at execute; identity rows at commit only |
| Who owns parsed inputs? | BOS draft until execute; then Processing facts |
| Who owns identity resolution? | Processing |
| Who owns immutable plan? | Processing |
| Duplicate/replay? | Existing intake SHA-256 + execution idempotency |
| Mode switch state? | Draft only; Case unaffected until exists |

## Why not Case-at-first-message

- Orphan cases from abandoned chats
- Premature durable facts before operator intent to submit
- Couples all conversational commands to Processing schema
- Conflicts with “confirm then execute” mental model for the command preview step

## Post-execute UX

After `processing_review`:

1. Session phase → `processing_review`.
2. Mount existing `IdentityReviewPanel` with `processingCaseId`.
3. Conversation may narrate readiness lane in operator language (“I found a possible match for Sarah…”) using **readiness projection**, not a second resolver.
4. Commit success → map to `buildCreateLeadSuccess`.

## Non-Create-Lead commands

Adapters with `executionKind: "direct_registered_execute"` skip Processing entirely.  
Adapters with `assist_proposal` use existing BosProposalEnvelope apply paths.

## Identity guarantees (protected)

- No `persons` / `customers` / `opportunities` / children before approved commit.
- Exact match still requires explicit link (existing server guard).
- Plan operations only semantic `IDENTITY_COMMAND_KEYS`.
- BOS must never call commit APIs without the same operator approval UX.

## Tests that must keep passing

- `processingIdentityD4CreateLead.test.ts`
- `processingIdentityE1Boundaries.test.ts`
- `processingIdentityCert*.integration.test.ts`
- Create Lead commit selection / exact-match guards
