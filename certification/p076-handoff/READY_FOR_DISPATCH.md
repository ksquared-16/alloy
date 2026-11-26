# P0-7.6 → HANDOFF: P0-7.7 FINANCIALS, P0-7.8 WORKSPACE

Status: **READY_FOR_DISPATCH**

## What the next programmes inherit

**A measured frame, not an asserted one.** `FIRST_AUTHORITATIVE_FRAME` is defined as configured
geometry present (6 configured cells), observed by a parser-level MutationObserver installed before
parsing. It is valid on both the client and SSR architectures. Three earlier instruments were
proven invalid and discarded; do not resurrect them:
`WU-09.firstMs`, FCP, and any count of `article.alloy-os-ucard` (it misses reserved cells).

**The state model.** `known` / `known_empty` / `unknown` / `unavailable` / `forbidden`, and
**UNKNOWN != ZERO**. 39 first-order capabilities: `MUST_BE_KNOWN_FOR_FRAME = 0/39`,
`MAY_BEGIN_UNKNOWN = 39/39`.

**Reserved geometry as the answer to "not known yet".** Two working instances now exist and should
be the pattern for any new surface:
- `ReservedFocusPanelCell` — a configured card cell always renders; readiness decides content.
- the reserved context chip (WU-07) — a configured chip always renders; its owner decides content.

In both, the element's EXISTENCE never depends on whether its value is known. That is what makes a
late arrival a **fill** instead of a **correction**, and it is what keeps geometry stable.

**The `settledNow` doctrine.** Observe, don't await. A value is taken if it landed by the commit
boundary, else null — which means UNKNOWN, never zero. Candidate A applied this to the Work View
totals join (`join_wait_ms = 0`).

**One chip, one fact.** A chip that means STATUS must not be filled from a configurable display
slot that may be bound to a stage. WU-07 is the worked example.

## Open debt carried out of P0-7.6

1. **Latency: 124 ms.** `FIRST_AUTHORITATIVE_FRAME P50 = 1,124 ms` against `< 1,000 ms`.
   The remaining interval is server compose + RSC serialization to the seed chunk
   (`responseStart → seed = 978 ms`); the client interval is 46 ms with zero long tasks.
   Attacking it is a server-compose programme, not a client one.

2. **Status label projection disagreement.** The queue projection renders
   `row_status_label = "New"` where the authored `status_defs` label is `"New Lead"`. Any work unit
   that binds its status slot to `opportunity.status_label` shows operators a label that is not the
   authored one. Not fixed in WU-07 (which reserved the chip rather than adopting a wrong value).

3. **SSR is feasible but not beneficial** at this frame size: 51 ms for +128 KB decoded. Proven,
   measured, reverted. Re-open only with a measurement, not an argument.

## For P0-7.7 FINANCIALS and P0-7.8 WORKSPACE

Both surfaces mount inside the same Focus Panel composition and inherit the registries above
(`COMMIT_CRITICAL_CARD_SPECS`, `MOUNTABLE_CARD_SPECS`). `financials` and `billing_preview` are
already MOUNTABLE specs with identity truth keys, so they begin UNKNOWN legitimately and must
render reserved geometry rather than zeros while their identity resolves.

**The rule that must not be relaxed:** a financial figure that is not yet known is UNKNOWN. It is
never rendered as `0`, never as an em dash, and never as a placeholder that reads as a balance.
