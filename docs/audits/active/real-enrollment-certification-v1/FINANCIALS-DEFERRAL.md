# Financials deferral — the fourth obligation

**Run:** `erun_7c25df7c9e133a40` · **Status:** implemented, live packet replaced, publish still unapproved

The certification corpus discovered four document-shaped obligations. Three are documents. The
fourth is payment setup, and this run stopped treating the *shape* of a clause as if it settled the
*owner*.

## What the fourth obligation actually is

Two things in the packet say it, and §1 asked that they be read together:

| Where | What it says |
|---|---|
| `school-of-enrichment-family-handbook.pdf`, *Tuition Agreement* | "To update information provided in your ACH account, please complete an updated electronic ACH form by the 10th of the month prior to the change." |
| `Direct Payment Authorization` artifact | Account Holder · Financial Institution · Account Type · **Routing number** · **Account number**, plus a signature |

They are one obligation: **establish a way to be paid.** Its owner is Financials/Payments — the
family authorizes a method with the payment provider, and Alloy keeps the authorization that comes
back. That program is not defined yet, so the obligation is **held**, not built and not dropped.

## Vocabulary — nothing new was invented for the hold

`FINANCIAL_PAYMENT` (owner) and `HELD_PENDING_FINANCIALS` (state) already existed in
`ownershipRouting`; `financial_payment` already existed as a disposition. A deferral **is** that
hold, reached by a clause instead of a destination. The Director's `DEFERRED_PENDING_FINANCIALS`
maps onto it exactly, so no second vocabulary was created for the same fact.

What *is* new is the obligation identity — `PAYMENT_SETUP_REQUIRED` — which names **what was asked
for** rather than who owns it. That is the fact nothing in the system could previously express, and
it is the whole reason "deferred" cannot be read as "dropped".

## The second half, found by reading the artifact

Every proposal on the Direct Payment Authorization already refused to store a bank credential — zero
fields, correct. But **a Form is built from a source's destinations, not from its proposals**, so
realizing that artifact would still have put a routing-number box in front of a parent inside Alloy.
The refusal was real and the ask survived it.

That artifact therefore defers with the clause. The rule is narrow on purpose: it requires a payment
**instrument**, not an amount. An earlier draft that only asked "is it financial" also held the
signed *Tuition & Enrollment Agreement* — one material-fee line and nothing else collectible — which
is why `OwnershipRouting.financialKind` now distinguishes `credential` / `method_setup` /
`billing_configuration`.

## The corrected invariant

Replaces `4 discovered uploads → 4 executable uploads`:

```
4 document/payment-like obligations discovered
→ 3 Enrollment document-upload obligations
→ 1 deferred Financials/Payments obligation
→ 0 dropped
```

`dropped` is the load-bearing term, and it is anchored on **concepts**, not proposals. Counting
proposals would have defined "discovered" by the outcome — every obligation would land in
`executable` or `deferred` by construction and `dropped` could never be non-zero. Two controls in
`financialsDeferral.test.ts` force it non-zero to prove it can still fail.

## What the certification now holds — live tenant

Packet `579327c1-3bb8-499b-8a76-9f106b3f9cb2`, org `00000000-0000-4000-8000-000000000001`,
case `89caf3ec-2c3d-4286-a022-524bdaad16a8`.

| | Before | After |
|---|---|---|
| Packet items | 6 | **5** |
| `file_ref` upload controls | 0 | **3** |
| Signatures | 6 | **5** (the held artifact's signature went with it) |
| Destinations | 180 | **173** |
| **Bank-credential asks** | **5** | **0** |
| Field definitions created | 0 | **0** |
| `customer_payment_methods` | 0 | **0** |
| Safeguarding rows | 0 | **0** |
| Unpinned items | 0 | **0** |

Re-running returns the same packet id and creates nothing — idempotent.

## Held, not lost — where it is visible

* **`realization.deferred_capabilities`** and the packet definition's own metadata: obligation,
  hold state, intended owner, reason, the school's verbatim clause, source document + checksum, and
  `deferred_artifact_ids` naming the paper form that was not realized.
* **Packet Studio** — a "Held for another area" panel above the builder, printing the obligation, the
  owner and the sentence that raised it. Not styled as an error: nothing here is wrong.
* **The apply ledger** — an explicit `skipped` row reading *"Held for Financials / Payments —
  PAYMENT_SETUP_REQUIRED. No requirement is configured here, and nothing was dropped."* — replacing
  the anonymous `requires_confirmation` default.
* **Review** — the row reads `Deferred · Financials / Payments`, never "Families provide", and it is
  deliberately **not** placed in the operator's review queue: a capability hold with a named owner is
  a conclusion, not a decision anyone can make today.

## Verification

* `tests/pos` — **1149 passed**, 1 failure (`formDraft.test.ts > deriveDocumentTitle`) proven
  pre-existing by re-running it with `lib/` and `app/` reverted to `HEAD~1`.
* `vac run typecheck:tests` — rc=0.
* Live tenant matrix above, plus a positive control that the reference queries can find the packet id
  when it is present.

**Not verified in a browser.** The Studio panel is asserted at component grain
(`packetDeferredCapabilitiesRender.test.tsx`) against the exact record the realization writes. A
real session could not be minted: the running server on 3014 is the cert-bound one this lane does
not own, `alloy-agent-login 4` refuses rather than adopt it, and the rotated QA credential is
deliberately not held here. That is a gap, and it is not called browser verification.

## Open for the Director

1. **Approve or reject the 5-item packet.** The Direct Payment Authorization is no longer an
   executable artifact. If it should stay executable as legacy paperwork, that reverses this run's
   central judgment and should be said explicitly.
2. **Financials/Payments contract.** When it lands, `PAYMENT_SETUP_REQUIRED` is the identity the
   Business Process requirement should satisfy against.
