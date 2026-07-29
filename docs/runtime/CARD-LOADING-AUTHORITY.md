---
owner: platform
status: frozen-conclusion
last_reviewed: 2026-07-28
---

# Focus Panel card loading — authority

**Frozen conclusion (2026-07-28): `loadingPolicy` is REJECTED as a card registry concern.**
`COMMIT_CRITICAL_CARD_SPECS` is already the correct independent concern and stays exactly where it
is. The audit's real yield was two defects, both fixed, and one pattern that does not yet have
enough instances to become a contract.

Companion to [`CARD-PLACEMENT-OWNERSHIP.md`](./CARD-PLACEMENT-OWNERSHIP.md) and
[`CARD-READINESS-LIFECYCLE.md`](./CARD-READINESS-LIFECYCLE.md).

---

## 1. Why `loadingPolicy` is not a registry concern

Tested against the registry's five admission criteria:

| Criterion | Verdict |
|---|---|
| card-specific | ✅ yes |
| reusable across surfaces | ❓ unproven — only one surface loads cards today |
| real runtime consumer | ✅ yes, exactly one |
| **removes orchestration** | ❌ **no** — `focusPanelWorkModeModelFromProvisioningAnswer.ts:113-117` already iterates the specs generically, with no per-card blocks. Moving the declaration into the registry changes no control flow. |
| no new coordinator | ✅ |

It fails on (4). Folding it in would relocate a declaration, not remove a branch. The migration
ledger names `loadingPolicy` as a future concern; **the ledger is a plan, not evidence.**

Also found: `participatesInInitialPanelReadiness`, named in the frozen readiness model, has **zero
references anywhere in the codebase**. It is vocabulary, not machinery. Initial-panel gating is
currently derivable — a card gates iff it has a commit spec — so no field was added. Add one only
when a card must gate *without* being commit-critical.

## 2. The production loading matrix (2026-07-28)

| Card | Provider | Earliest truthful source | Initial presentation | Gates panel | Settlement |
|---|---|---|---|:--:|---|
| `current_work` | none req. | provisioning answer (always knowable) | meaningful / honest-empty | **yes** | panel phase |
| `household` | none req. | answer, if identity truth present | meaningful, else unresolved hold | **yes** | panel phase |
| `children` | none req. | answer, if `_inquiry_children` present | meaningful / authoritative-empty | **yes** | panel phase |
| `scheduling` | none req. | enriched (`_inquiry_children`) | meaningful — honest at lead grain | no | panel phase |
| `billing_preview` | none req. | **deferred** — financial-config API, on open | **held, no verdict** (was: fabricated) | no | panel phase |
| `tour_summary`, `communications` | none req. | enriched | linked — no initial geometry | no | on open |
| `milestones` | **unavailable** | — | non-participation | no | n/a |
| `readiness_kpi` | none req. | answer (commit spec exists) | not in any default composition | — | — |
| Work cards (7) | none req. | enriched only | reserved → content | no | panel phase |

**Settlement is a panel phase, not a card property.** No card settles independently; the whole model
is replaced when settlement runs. Nothing in the audit justified per-card settlement.

## 3. What the audit actually found — and fixed

**(a) The Milestones fabrication was alive on a second, VISIBLE card.** `billing_configured` and
`tuition_rate_label` are read in three places and written **nowhere** in the repository. So Billing
asserted "N items missing" with a **blocked** status tone on every record forever — telling operators
they had a billing problem the platform invented — plus "Billing not configured" from the base model.
Its authoritative source (the financial-config API) is fetched only when the card is opened, so until
then the answer is *unresolved*, not *missing*. Fixed: readiness items carry `resolved`; only a
resolved item can be missing; unresolved holds with no verdict. (`7ce9f23e3`)

**(b) The grid branched on the producer's name.** `model.source` is documented "DIAGNOSTIC ONLY — the
grid must never branch on it", and the grid derived settled-ness from `source === "drawer_vm"`. That
violated the contract and would have forced a Child-surface producer to *call itself `drawer_vm`* to
get settled semantics. Producers now declare `phase: "commit" | "settled"`. (`b58fcc250`)

## 4. The deferred-source pattern — one instance, so NOT yet a contract

Billing is a genuine deferred card: it participates initially but its authoritative source answers
later. The obvious move is a `DeferredCardSpec` mirroring `isKnowable`. **It was not built**, because
the pattern has exactly one instance:

- `scheduling` — the other enriched-only visible card — is **honest by design**. Its "no assignments
  yet" is true at lead grain, derived from a real written source, with the domain reason documented
  in code (operational assignments do not exist until enrollment/Registration).
- The Work cards are enriched-only but have no deferred second source.

One instance is a fix, not a contract. Extracting a contract here would repeat the mistake placement
avoided. **The second instance — or the Child surface — provides the evidence to extract it.**

## 5. Interaction eligibility — still not proven separate

Interaction eligibility is currently identical to readiness (`focusTargets` gates on `ready`). The
Billing fix deliberately touched only the business-meaning layer, leaving readiness untouched, so the
card stayed interactive and opening it still resolves the real source. **No evidence yet requires
separating the two.** Had Billing been forced to `reserved`, a deadlock would have appeared (the card
must be interactive to fetch the source that would make it ready) — that hypothetical is the argument
to watch for, not a present fact.

## 6. What was deliberately left alone

- **`COMMIT_CRITICAL_CARD_SPECS`** — correct as-is. Not moved, not widened.
- **`readiness_kpi`'s commit spec** — it is placed by no *default* composition, but the card is in the
  catalog and a tenant can publish it, so the spec is dormant capability, not dead code.
- **`source`** — retained as diagnostic provenance with no runtime consumer.
