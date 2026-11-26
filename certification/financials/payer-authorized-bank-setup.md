<!--
A CERTIFICATION EVIDENCE RECORD, not doctrine — which is why it lives here and not under
docs/platform/. It reports what was measured in this lane on 2026-09-30. The doctrine it rests on
is docs/platform/financials/payments-bank-setup-handoff.md, which was amended in the same commit
range and is the thing to read for WHY.
-->

# Payer-authorized bank setup, and the reversal cause that reaches the operator

Two pieces of work, measured separately.

## A — `reversal_origin` reaches a `PaymentRow`

The column is written on every outbound payment and was never selected back. `PAYMENT_COLUMNS` did
not name it, so a `PaymentRow` carried `undefined` for the one fact distinguishing an operator's
refund from a bank's return — and Financial Activity labelled both "Payment refunded", which is
false operator history on a chargeback.

Bound by `web/tests/financials/payments/reversalOriginProjection.test.ts`, 11 cases.

| measurement | result |
| --- | --- |
| suite green with both repairs in place | 11 / 11 |
| suite with the SELECT column dropped and the Activity label flattened | **5 fail**, 6 pass |
| which 5 | the three service round-trip cases, the receipt-has-no-cause case, and the Activity return/refund case |

The binding is a fake that PROJECTS. The previous assertion on this column passed against the
broken SELECT, because the shared mock returns the whole inserted object and ignores the column
list — it was measuring the mock's fidelity. `projectingPayments` makes `payments` behave like
PostgREST for the suite: a selected column always comes back, null when the row has no value.

## B — a bank account is authorized by the person whose account it is

Bound by `web/tests/financials/payments/payerAuthorizedBankSetup.test.ts`, 31 cases.

| measurement | result |
| --- | --- |
| suite green | 31 / 31 |
| suite with the ACH refusal and the setup-ownership guard planted out | **5 fail**, 26 pass |

The seven properties, each with its own section in that file:

| # | property | where it is decided |
| --- | --- | --- |
| 1 | an operator cannot complete a bank authorization | `payment_method.add` `validatePayload` |
| 2 | a setup cannot be claimed by another payer | `assertSetupBelongsToPayer` |
| 3 | a setup cannot rebind the organisation | the same guard, org leg |
| 4 | method ownership is narrowed in the query | `readPayerOwnMethods` |
| 5 | only safe fields leave the provider | `displayFromStripeMethod`, and what is persisted |
| 6 | the request writes nothing | `requestBankAccountSetup` |
| 7 | the link's four refusals stay four answers | `resolveBankSetupLink` |

### The gap the plan of record had not seen

`completeAddPaymentMethod` documented that a tampered payload's "setup's customer will not match
the payer's". Nothing compared them, and `retrieveMethodSetup` did not read the customer back at
all. While the setup reference never left an operator's server session this was survivable; on a
payer surface it travels through a browser Alloy does not control, which is the difference between
two families' bank accounts.

Closed by stamping the org and payer onto the SetupIntent at creation with Alloy's own key, reading
them back, and checking them against the payer the caller resolved canonically — with the platform
customer re-derived from the payer's own rows rather than taken from the payload. The browser holds
a client secret, which permits confirming the setup and nothing else.

### Two departures from the plan of record

| planned | built | why |
| --- | --- | --- |
| SMS-friendly `/a/{code}` | plaintext token only | after S-3 a short code cannot yield the plaintext, and eight characters is the wrong credential for a standing debit authorization |
| `consumed_at` "legitimately used, once" | consumed on SAVE, not on open | a payer who closes the provider's window has authorized nothing; burning their link there strands them |

## Gates measured in the lane

| gate | result |
| --- | --- |
| `vac run typecheck` | PASSED |
| `vac run typecheck:tests` | PASSED (it found the one error `next build` cannot see) |
| `npm run prebuild` — all four guards | ✓ ✓ ✓ ✓ |
| `tests/financials`, live excluded | 194 files, 2598 tests, all green |
| `tests/access/routeCapabilityDeclaration`, `tests/access/publicFormCredentialResolution` | 68 green |

Both W-4 ceilings moved by exactly one, in the ledger and in the test that pins it, and the
transitive-only ceiling did not move.

## Reds that were already red

Measured, and none of them names a file this work touched: `catalogConsolidationLock`,
`catalogVocabularyReconciliation`, `financialsRoleEditorGroup`, `grantSeedEnumeration`,
`unauthenticatedSideEffectSender` (its finding is `app/api/dev/qa/developer-platform`),
`analyticsRouteGates` (safeguarding-restrictions and a prototype route),
`configurationRuntimeCoreInteraction` (a settings route constant),
`workUnitQueueRowActionsHydration`, and `subjectlessActionTransport`, whose census expectation is
19 keys behind the registry and was already failing without this branch's one addition.

Every `*.live.*` suite fails in this lane for want of its environment, which is what those suites
are for.

## Not certified here

The deployed run. Nothing in this record was measured against staging, because the branch has not
been promoted. `/bank-setup/<token>` with a real Stripe TEST bank account, a real mandate and a real
microdeposit wait is the deployed proof, and it is outstanding.
