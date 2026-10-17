# Payments — attempt integrity, decline recovery and durable posting

Baseline: `origin/staging` @ `95da6741d` (deployed at discovery). Branch `agent/payments-attempt-integrity`.
Owner: Payments. Financials remains the monetary authority; nothing here writes `payments` or
`payment_allocations` except through `recordAndApplyChildcarePayment`.

## 1. Census — who owns what (measured in code on the baseline)

| Concern | Owner (file / table) | Baseline status |
|---|---|---|
| Payer identity | `persons`; participant: `form_public_links.metadata.recipient_person_id` → `resolveParticipantPayer`; operator: payload `payer_person_id`; autopay: `payment_autopay_arrangements.payer_entity_id` | **DEFECTIVE** — `createCardCollection` accepted any `payerPersonId` unvalidated (a live suite recorded a customer-member id as the payer person) |
| Responsible party | Financials responsibility (Thread 6) | WORKING — never written by Payments |
| Charge / outstanding / ceiling | `charges`, `readChargeBalance`, `resolveFamilyCollectible` | WORKING; ceiling ignored money already settling (**DEFECTIVE** for multi-payer) |
| Payment-method ownership | `payment_methods` (`payer_entity_*`, `customer_id`), `resolveCollectionMethod` | **DEFECTIVE** — scope check skipped when either side was empty; agency-owned method passed the payer invariant |
| Attempt | `payment_collection_attempts`, `createCardCollection` | **DEFECTIVE** — intent key `charge:amount:rail:day` had no payer: two payers got ONE attempt, and the second was handed the first's client secret |
| Provider session | Stripe PaymentIntent on the connected account; client secret re-read, never stored | **DEFECTIVE** via the attempt key (cross-payer reuse) |
| Webhook idempotency | `payment_provider_events` unique `(processor, provider_event_id)` | **DEFECTIVE** — claim written before work; a delivery that threw mid-processing made every redelivery a "duplicate" |
| Posting | `postProviderConfirmedCollection` → `recordAndApplyChildcarePayment`; anchor `payments.idempotency_key = stripe-collection:<attempt>` + unique `canonical_payment_id` | WORKING for one payer; **DEFECTIVE** under concurrent multi-payer success (loser left recorded-but-unapplied) |
| Failure / retry lifecycle | trigger `enforce_collection_attempt_state_progression`, webhook `stateForEvent` | **DEFECTIVE** — `failed` treated as final; retry reused the failed attempt; provider success after a decline refused as "stale" |
| Decline at confirmation (stored method) | `createCardCollection` | **DEFECTIVE** — 402 threw, attempt left `initiated` without provider id → webhook `unattributed`, operator state "Processing" forever |
| Operator state projection | `/api/admin/financials/collection-state`, `collectionLifecycle` | **DEFECTIVE** — route fell through to "processing" for `initiated` / `requires_payment_method` |
| Reconciliation | `recognizeCollectionAttempt` (operator queue + participant `recognize`) re-reads the provider | WORKING for succeeded-unposted; did not converge cached state |
| Tenant isolation | session org on every read; webhook tenancy from merchant binding | WORKING |

## 2. Attempt lifecycle (now explicit)

```
initiated → requires_payment_method / requires_action / processing → succeeded   (final)
                                                                     → failed      (declined; terminal for reuse)
                                                                     → canceled    (final)
failed → succeeded  ADMITTED  (the provider collected on the same intent after a decline — it must post)
```

- Non-terminal and `succeeded` attempts are **reused** (network retry, second tab, double submit).
- `failed` / `canceled` attempts are **never reused**. The next request opens generation `g1…g9`
  under its own intent key (and therefore its own Stripe idempotency key) after canceling the
  declined PaymentIntent. If Stripe reports the old intent `processing`/`succeeded`, no new attempt
  is opened (`previous_attempt_unresolved`) — its money will post through the webhook/recognition.
- Intent key v2: `collect:v2:<charge>:<amount>:<rail>:<payer>:<method|present>:<day>[:gN]`, payer =
  `person:<id>` or, when nobody is named, `actor:<operator>`. Historical v1 keys are never matched by a
  new request; historical attempts remain reachable by id and provider transaction.
- A reused attempt is handed out only if its recorded payer is the requesting payer.

Migration: `20261123141500_collection_attempt_decline_is_not_final.sql` (CREATE OR REPLACE of the
trigger function; re-runnable).

## 3. Projection vocabulary

`collectionLifecycle` adds `declined` (failure code `card_declined` & co., or any issuer decline code).
Labels: "Declined — retry available", "Failed — retry available"; `retryAvailable()` is true only for
declined/failed/canceled. Only canonical recognition is "Received". The operator collection-state route
now derives its `stage` from this module (`awaiting_payment`, `requires_action`, `processing`,
`finalizing`, `recognized`, `declined`, `failed`) and adds `retryAvailable`.

## 4. ENROLLMENT HANDOFF — participant route `app/api/public/forms/[token]/enrollment-payment/route.ts`

**Owner: Enrollment.** Not modified by this slice.

### Exposure (measured in code)

`POST action=recognize` calls `recognizeCollectionAttempt(supabase, { orgId, attemptId })` with
`attempt_id` straight from the request body. The only scope is the link's **organization**. A family's
link can therefore name another family's attempt id in the same org and:

- learn whether it exists, its settlement state, and its canonical payment id;
- if that attempt has settled at Stripe, cause it to be posted (to its own, correct charge — no money is
  misdirected, and posting would happen via the webhook anyway).

No client secret, method or card data is returned by this path. Severity: cross-family information
disclosure + unauthorized trigger of a legitimate posting. Attempt ids are UUIDv4 (not enumerable), which
limits but does not remove the exposure.

The `collect` path is **contained at the Payments boundary by this slice**: the route already passes the
server-resolved `payerPersonId`, and the attempt key now includes it, so two parents on one fee no longer
share a PaymentIntent/client secret. No route change is required for that fix.

### Required route-level contract

1. `recognize` must pass the scope the Payments service now accepts:

   ```ts
   const recognized = await recognizeCollectionAttempt(supabase, {
       orgId,
       attemptId,
       scope: { chargeIds: payable, payerPersonId },
   });
   ```

   `payable` and `payerPersonId` are the values `load()` already computes for the same token. An attempt
   outside the link's own payable charges, or recorded for a different payer, now reads as
   `attempt_not_found` — indistinguishable from a non-existent id.
2. If `payerPersonId` is null (link without a canonical recipient), `recognize` should refuse rather than
   fall back to org scope.
3. The route should map the new collection refusals: `payment_declined` (409, show the message — nothing
   was collected; the attempt id is returned for history), `previous_attempt_unresolved` (409, "an earlier
   try is finishing"), `too_many_attempts` (429), `payer_not_found` (409).
4. Tests: a link for family A presenting family B's attempt id gets 409/`attempt_not_found` and no state
   change; family A's own attempt still recognises.

## 5. Not built here (by instruction)

Participant Payment step, ACH UI, split-payer invitations, payer-link onboarding, scheduled
reconciliation sweep. A sweep for attempts whose webhook never arrived and whose browser never called
`recognize` is the remaining reliability gap: Stripe redelivers failed webhooks for up to three days and
redelivery is now processed, and the operator queue covers locally-succeeded attempts, but an attempt
still `requires_payment_method`/`processing` locally while Stripe says `succeeded` is only found by a
manual `recognize`. Wiring that sweep needs the scheduled-work wake path, which the Enrollment lane is
modifying concurrently, so it is deferred to a follow-up rather than opened as a competing edit.
