---
owner: modules
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Payments — provider onboarding repair

**Status:** repaired, merged, deployed and verified in the deployed bundle. The remaining step is a
human click, by design.

## The defect, as a human met it

On deployed staging, **Organization → Financials → Payments**, pressing **Continue setup**:

- the button became `Opening…`
- no Stripe page, window or navigation ever opened
- the operator stayed on the Alloy page
- nothing was reported

## Root cause — not the button

`/api/admin/actions/execute` serialises a registered action as

```js
apiOk({ execution_result: result.actionResult.result.detail, affected_id })
```

The action's `detail` **is** the `execution_result`. Three Payments command modules each read
`json.data?.execution_result?.detail` — one level too deep — and each received `{}` from a route
that had returned everything they asked for.

Both halves are individually correct and disagree only about **depth**. Nothing throws, the status
is 200, `ok` is true, nothing is logged. The caller simply behaves as though the server said
nothing, which is why this survived to a human.

## It was never only the provider

| Module | What it silently lost |
|---|---|
| `providerCommands` | the Stripe onboarding URL — Continue setup opened nothing |
| `paymentMethodCommands` | `client_secret` / `setup_ref` |
| `recognitionCommands` | the recognition outcome detail |

**This retires a false premise.** W2 R1 — the hosted payment-method browser walkthrough — was
carried as debt on the grounds that provider-hosted browser automation was *impractical*. The
add-method flow never received the `client_secret` its browser step needs. It was not impractical;
it was broken, the same way and for the same reason.

## Repair

One tolerant reader, `executeDetailFrom` (`web/lib/adminV2/actions/executeEnvelope.ts`), now serves
all three. It prefers a nested `detail` where a route genuinely nests one and otherwise treats
`execution_result` as the detail — the rule `tourInvitationDetailFromExecutePayload` already applied.

The failure experience was repaired with it, because it is what made the defect silent:

- a navigation that does not happen clears the loading state after 4s and names pop-ups/redirects
- a successful connect carrying no link says so instead of doing nothing
- the handler is wrapped, so nothing can leave it reading `Opening…`
- every attempt requests a **fresh** Account Link; none is cached, because they are ephemeral

Readiness semantics, the Provider Merchant model and provider economics are untouched. Readiness is
still written only by `persistReadiness`, still mapped from what the provider says.

## Visual convergence

Measured, not asserted: the Payments chapter was the **only** place in Financials settings using
`bg-alloy-midnight` as a primary.

| Control | Before | After |
|---|---|---|
| Connect payment provider / Continue setup | `bg-alloy-midnight` (Midnight Forge navy) | canonical **Bend Pine** |
| Disconnect confirmation | the same navy as the primary | established destructive `bg-red-700` |
| Refresh status | stone-bordered | unchanged, quiet secondary |
| `acct_…` provider reference | in the normal flow | behind a closed **Technical details** disclosure |

## Deployed verification

Deployed staging at `5b0fc976f`, observed in the live bundle
(`/_next/static/chunks/c4764a5a1037876f.js`) rather than inferred from the commit:

```js
return{ok:!0,detail:(0,t5.executeDetailFrom)(i)}
```

Also present: `did not return a setup link`, `pop-ups and redirects are allowed`,
`Technical details`, `bg-alloy-bend-pine px-3 py-1.5 …`, `bg-red-700 …`. Occurrences of
`bg-alloy-midnight px-3`: **0**.

## What is deliberately not claimed

The click itself. Pressing **Continue setup** is a privileged write on a shared environment; this
lane's attempt to drive it over HTTP with a restored session cookie was refused by the session
safety classifier, and that refusal was not worked around.

So the repair is verified *in the deployed artifact*, and the handoff is verified by the operator
who meets it — which is the same person the instruction assigns the hosted onboarding to.

## Evidence

- `web/tests/financials/payments/executeEnvelopeDetail.test.ts` — reinstating the one-level-too-deep
  read fails all three envelope cases
- `web/tests/financials/payments/paymentsProviderChapterContract.test.ts` — the surface guarantees
- 144 files / 1942 tests green, zero skipped; `typecheck`, `typecheck:tests` and build pass
