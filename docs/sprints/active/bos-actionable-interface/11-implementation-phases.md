---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 11 — Implementation Phases

Immediate milestone: **complete after Phase 5** (Create Lead reference + placement convergence + generic session foundation).  
Phases 6–8 are foundation/cleanup or Horizon stubs — do not expand into full H2/H3 product builds.

---

## Phase 0 — Audit lock & decision freeze

| | |
|---|---|
| **Objective** | Codify this planning package; fix registry contradiction; mark runtime binding. |
| **Scope** | Docs in this folder; `bosProposalSupport` alignment; Platform Decision draft note in closeout later. |
| **Files** | `canonicalActionRegistry.ts`, `createLeadAction.ts`, this package |
| **Contracts** | None runtime |
| **Tests** | Registry unit asserting create_lead bosProposalSupport true in both catalogs |
| **Exit** | Contradictions listed and resolved in code flags; package reviewed |
| **Rollback** | Revert flag commit |
| **Depends** | — |

---

## Phase 1 — Shared BOS command-session model

| | |
|---|---|
| **Objective** | Client session state machine + persistence + adapter interface. |
| **Scope** | `web/lib/bos/commandSession/**` (new); sessionStorage helpers; requestSeq stale guards |
| **UI** | None / invisible |
| **Migrations** | None |
| **Tests** | Session reduce/transitions; persistence round-trip; stale seq |
| **Exit** | Can create/update/discard session in unit tests |
| **Rollback** | Delete new module; no callers yet |
| **Depends** | Phase 0 |

---

## Phase 2 — Create Lead conversation/form convergence (draft layer)

| | |
|---|---|
| **Objective** | Create Lead adapter: parse → draft → resolution; Form projection shares draft. |
| **Scope** | Adapter wrapping `parseCreateLeadIntakeText`, eligibility, household selection mapping |
| **UI** | Minimal harness or Story/test harness acceptable; production host in Phase 3–4 |
| **Tests** | Parser→draft parity with modal extraction; mode switch preserves values; field-source parity |
| **Exit** | Draft identical whether filled via parse or form setters |
| **Depends** | Phase 1 |

---

## Phase 3 — BOS host UI (Conversation + Form)

| | |
|---|---|
| **Objective** | Mount session host inside `AICommandSurfaceShell` / rail; mode toggle; ack turns. |
| **Scope** | `BosCommandSessionHost`, thread message kinds, Form embed of intake components |
| **Runtime** | Presentation only; no execute yet beyond dry validation |
| **Tests** | UI state machine; a11y toggle; no blank open |
| **Exit** | Manual open from test hook shows Conversation/Form with shared draft |
| **Depends** | Phase 2 |
| **Guardrail** | Do not reopen runtime reveal architecture |

---

## Phase 4 — Preview, confirm, execute, Processing, success/recovery

| | |
|---|---|
| **Objective** | Wire preview/confirm to `executeCreateLeadCommand` + IdentityReviewPanel + success contract. |
| **Scope** | CommandSurfaceShell for preview/confirm; Processing panel host; recovery turns |
| **Tests** | Execute adapter; idempotency; stale preview; success refresh; Processing boundaries |
| **Exit** | Full path paste→confirm→Processing→commit→success in authenticated live QA |
| **Depends** | Phase 3 |

---

## Phase 5 — Placement convergence

| | |
|---|---|
| **Objective** | Actions / Work Unit Create Lead opens BOS session; retire modal as primary. |
| **Scope** | `applyRegistryResolvedActionClient`, `CreateLeadEventHost`, compatibility shim |
| **Tests** | Wiring tests updated; modal-not-mounted-at-entry still holds (or updated to session host) |
| **Exit** | Production click path uses BOS; modal optional fallback flagged |
| **Depends** | Phase 4 |
| **Stop here for V1 product milestone** | |

---

## Phase 6 — Slash-command discovery foundation (stub)

| | |
|---|---|
| **Objective** | Catalog helper + types; optional hidden `/` prototype behind flag **off by default**. |
| **Exit** | Unit tests for filtering; no operator-facing requirement |
| **Depends** | Phase 1 |
| **Parallelizable with** | Phase 5 after Phase 1 |

---

## Phase 7 — Operational briefing foundation (stub)

| | |
|---|---|
| **Objective** | Reserve ambient message kind + CTA→session factory. No generator. |
| **Depends** | Phase 1 |
| **Parallelizable** | Yes with Phase 6 |

---

## Phase 8 — Cleanup, certification, documentation

| | |
|---|---|
| **Objective** | Remove dead modal primary path; update canonical docs; Playwright path; certification checklist. |
| **Docs** | ai-platform, actions-and-workflows, bos-foundation, platform-capabilities, platform-decisions, documents-and-forms (Processing note), release-history on promote |
| **Depends** | Phase 5 (+ optional 6/7 stubs) |

---

## Sequence (improved vs naive)

```text
0 → 1 → 2 → 3 → 4 → 5 → 8
         ↘︎ 6 (stub)
         ↘︎ 7 (stub)
```

Challenge note: Do **not** put Processing integration in a separate late phase after UI — it is Phase 4 because execute already equals Processing. A fake “Phase 3 Processing” would encourage premature Case creation.
