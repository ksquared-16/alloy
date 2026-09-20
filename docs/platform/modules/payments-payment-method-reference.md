---
owner: modules
status: canonical
last_reviewed: 2026-09-20
supersedes: []
---

# Payments V1 · W2 — the Payment Method Reference

**Status:** implemented and certified. `PAYMENTS_V1_W2_PAYMENT_METHOD_REFERENCE_COMPLETE_CERTIFIED`.

W1 made an organisation able to collect. W2 makes a **payer** able to be collected from: a card or a
bank account on file, owned by the payer, usable by an account, and durable across a change of
merchant.

---

## 1. What "on file" means

The canonical entity is **`payment_methods`**, and the identity of a stored method is that row's own
`id`. Stripe's `PaymentMethod` is an adapter reference held in a column, exactly as
`payment_provider_merchants` holds a connected account id without becoming a Stripe table.

Applying the contract's own test — *would this still be the right name and shape with a different
provider tomorrow?* — every column is a domain fact (`rail`, `verification_state`, `usability_state`,
`is_default`, `mandate_accepted_at`) except three that are explicitly adapter handles
(`provider_customer_ref`, `provider_method_ref`, `mandate_ref`).

`customer_payment_methods` is **not** the same thing and was not extended. It has no `org_id`, models
one rail, has no lifecycle, and makes the provider's id load-bearing identity.

## 2. Ownership is the payer, scope is the account

    payer_entity_type / payer_entity_id   WHOSE instrument this is
    customer_id                           WHICH account's obligations it may settle

Not the child, not the responsible party, not the primary household contact. A grandparent may hold
the card that settles a parent's obligation.

**Using Person B's card to settle Person A's responsibility does not rewrite who owes.** Ownership
and responsibility are separate facts, and `payments.payer_entity_type` records the same pair on the
receipt for the same reason.

Ownership is not authority over every family: a method scoped to one account cannot settle another's,
even inside the same organisation.

## 3. Where the provider handle lives

    platform Customer → platform PaymentMethod → canonical payment_methods row
                                ↓ (per collection)
                       clone onto the connected merchant → consumed by the charge

The durable handle is on the **platform** account. The connected-account object is created per
collection and is disposable — Stripe consumes a clone with the charge it serves, because it is not
attached to a customer.

**This is what lets an organisation replace its merchant without every family re-entering a card.**
One canonical method, many merchants over time.

The platform Customer is an adapter object associated with the canonical payer. It is **not** an
Alloy Payer and there is no table for it: one per payer is achieved by reading
`provider_customer_ref` back off that payer's existing rows, which works because canonical rows are
never deleted.

## 4. The mandate, and the parameter that is never set

For a bank account the payer's authorization is taken **by the platform**, and Stripe duplicates that
mandate onto each clone.

It is never taken `on_behalf_of` a connected account. Stripe is explicit: *"If a mandate is authorized
for a PaymentIntent or SetupIntent on_behalf_of a connected account, you can't use that mandate with a
different connected account."* Setting it would pin a family's authorization to whichever merchant the
organisation had that day.

Stripe also requires that this be **disclosed**: *"When collecting a bank account that you intend to
clone to connected accounts, you must communicate to the customer that their authorization extends to
connected accounts on your platform."* Alloy does intend to clone, so the disclosure is not optional.
It lives as a constant beside the calls that create the authorization
(`ACH_AUTHORIZATION_DISCLOSURE`), so the sentence and the mechanism cannot drift apart.

The one documented reason to set `on_behalf_of` is a platform in a different country from its
connected accounts. Alloy's platform and its providers are both US and ACH is a US rail, so it does
not apply. **That is the decision to revisit if Alloy onboards a non-US merchant.**

## 5. What Alloy stores, and what it cannot

Stored: brand, last four, expiry month and year, rail, provider references, mandate reference and
acceptance moment, verification and usability state.

Never stored: **PAN, CVC, bank account number, routing number, raw tokenization payload.** There is no
column for any of them. Stripe's `us_bank_account` object does contain `routing_number`; the adapter's
mapper reads `bank_name` and `last4` and nothing else, so it never leaves that file.

## 6. Two lifecycles, because they answer different questions

    verification_state   unverified · pending · verified · failed
    usability_state      usable · blocked · expired · revoked

`verification_state` is the provider's answer about the instrument. `usability_state` is whether
Alloy may collect with it now. A method can be verified and still unusable.

A bank account awaiting microdeposits is `pending` / `blocked`: it exists, it is real, and it cannot
be charged yet. **It is never offered as usable**, because an operator told otherwise would schedule a
collection the provider refuses.

Nothing is persisted when setup merely *begins*. A row is written when the provider, read back on the
server, says an instrument exists — in the state the provider actually reports.

## 7. Default semantics

At most one default per **account and rail**, enforced by a partial unique index rather than by
service discipline, because two concurrent writers both pass a read-then-write check.

Setting a default moves it atomically inside `set_default_payment_method`, so the account is never
briefly left with two defaults or none. Card and bank defaults are independent.

**Revoking a default promotes nothing.** The account has no default for that rail until someone
chooses one — a family's money must not move to an instrument nobody selected.

## 8. Revocation and replacement

Operator "Remove" is a **revocation**, never a delete: `usability_state = revoked`, with when and
why, and the default flag cleared. Payments already made with the method keep naming it.

Provider-side detachment is attempted afterwards and its failure is reported, not raised. Alloy's
record is canonical either way; an orphaned provider object is untidiness, not a reason to leave an
operator's instruction unexecuted.

A replacement is a **new row**. The old one may point forward through `replaced_by_id`; its provider
reference is never rewritten into the new one.

## 9. Provider events may move display and usability only

`payment_method.automatically_updated`, `payment_method.updated`, `payment_method.detached`,
`setup_intent.succeeded`, `setup_intent.setup_failed`, `mandate.updated`.

These arrive on the **platform** account, so they are handled above the connected-account gate.
Tenancy is still never guessed: the provider reference is looked up in `payment_methods`, and a
reference nobody has stored fails closed.

They can never change payer ownership, account scope, rail or canonical identity. The service refuses,
and `enforce_payment_method_identity_immutability` refuses underneath it.

## 10. Access

    payment_method.add · payment_method.set_default · payment_method.revoke     fin.write
    reading what is on file                                                    fin.read
    provider installation (W1)                                                 fin.provider

Deliberately the opposite judgement from W1. Connecting a provider decides where an organisation's
money settles. Adding one family's card is ordinary front-desk work, which `ops` does while the parent
is standing there — requiring `fin.provider` would mean finding an administrator before a parent can
pay, for no gain in safety.

## 11. Where an operator meets this

Focus Panel → Financials → **Details** → Payment methods. Not a standalone workspace: methods are a
property of an account, not a product.

Operator language only — *Visa •••• 4242 · Expires 08/29 · Default · Ready · Verification required ·
Needs attention · Expired · Removed · Add card · Add bank account · Set as default · Remove.*
`PaymentMethod`, `SetupIntent`, `us_bank_account`, `Financial Connections`, `mandate` and `pm_` are
the adapter's.

Summary stays compact and truthfully reports whether a **usable** method exists.

## 12. Collection uses the engine that already existed

    canonical payment_methods → clone onto the connected merchant → the SAME attempt,
    the SAME PaymentIntent call, the SAME direct charge, the SAME canonical posting

There is no second execution path. A stored-method collection differs from a present-payer collection
by three parameters (`payment_method`, `off_session`, `confirm`) and a clone.

## 13. What W2 deliberately does NOT do

- **No autopay.** No arrangement table, no scheduler, no retry policy, no toggle. `resolvePaymentSetup`
  still reports autopay `unsupported`, which stays truthful until W5.
- **No `payment_collection_attempts.payment_method_id`.** That linkage is W3's. W2 proves
  stored-method collection through the existing attempt and provider evidence; the FK was not required
  for correctness, so it was not quietly pulled forward.
