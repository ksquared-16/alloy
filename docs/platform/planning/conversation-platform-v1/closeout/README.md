# Conversation Platform — Phase 0 Closeout Package

**Frozen 2026-07-31.** The canonical implementation baseline for the Conversation
Platform. Written for future engineers, future Claude sessions, future Vacilando
workers, and Kelly six months from now.

**Phase 0 is complete. Phase 1 has not started.**

## Read in this order

| # | Document | Read it when |
| --- | --- | --- |
| 1 | [Executive Summary](01-EXECUTIVE-SUMMARY.md) | You have 10 minutes and need the whole picture |
| 2 | [Runtime Architecture](02-RUNTIME-ARCHITECTURE.md) | You are about to change communications code |
| 3 | [Convergence Matrix](03-CONVERGENCE-MATRIX.md) | You suspect something is implemented twice |
| 4 | [Technical Debt Register](04-TECHNICAL-DEBT-REGISTER.md) | You found something wrong and want to know if it is known |
| 5 | [Code Retirement Ledger](05-CODE-RETIREMENT-LEDGER.md) | You are wondering why a shim exists, or whether you may delete it |
| 6 | [Phase 1 Readiness Report](06-PHASE-1-READINESS-REPORT.md) | You are deciding whether to start Phase 1 |
| 7 | [Phase 1 Implementation Plan](07-PHASE-1-IMPLEMENTATION-PLAN.md) | You are starting Phase 1 |
| 8 | [Platform Health Report](08-PLATFORM-HEALTH-REPORT.md) | You need a status read or are reporting upward |
| 9 | [Platform Map](09-PLATFORM-MAP.md) | You want to know where one capability sits in its lifecycle |

## If you read nothing else

**Six invariants. Violating any of them reopens a defect Phase 0 closed.**

1. Every outbound message is a `communication_messages` row **before** a provider
   sees it. A path that skips the row is invisible to every gate.
2. Classification is decided at authoring and never recomputed. `purpose` is
   compliance-inert — no rule may key off it.
3. Eligibility is two layers: an immutable authoring snapshot, plus live
   revalidation at dispatch. Neither alone is sufficient.
4. The `documents` row is authority; the storage path is not. Authorization
   precedes **minting** a credential, not merely disclosing it.
5. Trust signed URLs by **provenance, not shape**. A resolver-produced URL is
   trustworthy; the same shape read from storage is not.
6. Shared vocabulary lives in `contracts/communications/`, parity-tested on both
   sides. Neither runtime may hard-code the other's vocabulary.

## Three things not to rebuild

- **The legacy GHL cleaning vertical.** Contained, not adopted. Its state machine
  lives in GoHighLevel. Decommissioning is recommended.
- **Storage authorization.** Live verification showed storage is already
  fail-closed. No redesign is warranted.
- **`executeCommunicationsSend` as a gate.** It is a wrapper with four
  independent bypasses. The choke point is
  `enqueueCanonicalOutboundMessage`.

## The lesson worth carrying

Late in Phase 0, an inventory caught a route that called the authorization helper
correctly, returned errors to unauthorized callers, and had passed commit review
— while handing *authorized* callers a seven-day credential minted **before** the
check ran. Two of Phase 0's own published claims were false at that moment.

**Assume the same is true of anything not yet inventoried. Leave behind a test,
not a claim.**

## Status at freeze

| | |
| --- | --- |
| Phase 0 | Complete — 24 commits, unpushed |
| Migrations | 4, replay-certified locally, **applied to nothing shared** |
| Program completion | ~4% (Phase 0 was a security track, not platform delivery) |
| Overall health | 6.5 / 10 — ready to build on, not ready to ship |
| Phase 1 | **May begin.** Promotion blocked by a staging backlog that is not ours |

## Earlier documents (superseded or supporting)

In the parent directory: `CONVERSATION-PLATFORM-V1-PLAN.md` (18-part discovery
package), `PHASE-0-CONTRACT.md`, `PHASE-0-LIVE-VERIFICATION.md` (the evidence
that inverted the severity ranking), `APPROVAL-PACKET-DECISIONS.md`,
`PHASE-CONTRACTS.md` (Phase 1 section **superseded** by document 7 here),
`PHASE-0-CLOSEOUT.md`, `LEGACY-DISPATCH-DECOMMISSIONING.md`, and `findings/`.
