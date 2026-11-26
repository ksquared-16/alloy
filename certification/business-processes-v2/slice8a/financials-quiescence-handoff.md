# Handoff to Financials / Payments: two narrow corrections from BP V2 Slice 8A

**From:** the Business Processes lane (`lane_581d120e4e41`). **Neither item blocks `bp_financial_quiescence_proven`.** The bp_v2 run contract forbids both cases, and census v2 detects both (`FINANCIAL-QUIESCENCE.md` §D, §F). Business Processes will not implement these: they are Financials-owned.

## 1. Refuse payment-provider calls for a registered QA organization (Payments)

**Gap.** Every Stripe call goes through a raw `fetch` in `web/lib/financials/payments/*`:
- `collectionAttempt.ts:271,292`
- `refundCollection.ts:89`
- `providerPaymentMethod.ts:66`
- `providerAccount.ts:135,183,232`
- `collectionRecognition.ts:64`

None of them consult `isRegisteredQaOrgId`. The no-send guard (`web/lib/qa/sharedQaSafety.ts:109-122`, `refuseQaOrgOutbound`) covers only email, invites and password reset.

In QA Shared, money cannot move, because collect and autopay need an active, ready merchant (`providerMerchant.ts:101-176`). But the bp_v2 **Admin** persona holds `fin.provider` and `fin.write`, so during a run it could:
- start a real connected-account onboarding (`providerInstallationActions.ts:146`); or
- create platform-level Customers and SetupIntents, which need only `STRIPE_SECRET_KEY`, not a merchant (`providerPaymentMethod.ts:112,143`; `paymentMethodService.ts:320-345`).

**Requirement.**
- One guard, `refuseQaOrgProviderCall(orgId)`, in the shape of `refuseQaOrgOutbound`.
- Call it before the `fetch` in each provider helper above.
- Return a typed refusal (`qa_org_provider_refused`) that the actions surface as a blocker.
- Test it: one unit test per helper, proving the refusal happens **before** any network call (a fetch stub that throws if it is reached).
- Optional: register it with Vacilando as a third run preflight item next to the web and backend no-send guards (`qa_no_provider_guard_web_deployed`).

## 2. A way to stop periodic billing (Financials, with Enrollment pricing)

**Gap.**
- `POST /api/admin/financials/periodic-billing-activation` and `ensurePeriodicBillingSchedule` (`web/lib/financials/periodicBilling/periodicBillingSchedule.ts:78-103`) only ever set `is_active: true`.
- No writer deactivates the org's `financials.periodic_billing.evaluate` row. The only `is_active: false` writers in Financials are autopay (`autopayArrangement.ts:615`), rates, tuition plans and provider installation.
- No command ends an accepted pricing term: `effective_end` is written only by supersession (`enrollmentPricingTermsService.ts:340`).

So an organization that turns automatic billing on cannot turn it off. In QA Shared, that would leave a generator of new drafts running indefinitely, and census check `bp_qr_fin_no_active_schedule` would fail **permanently**.

**Requirement (the smaller of these two forms).**
- **(a)** A governed `financials.periodic_billing.deactivate`, gated on `fin.write`. It sets `is_active=false` and `next_due_at=null` on the org's periodic-billing `scheduled_work` row, records `updated_by`, is idempotent, and is audited like the activation.
- **(b)** An append-only `pricing_term.end`, which sets `effective_end` on an accepted term, stopping recurrence at `resolveTuitionRecurrence.ts:126-134`.

**Test:** activate, deactivate, and show the scheduled-work wake does not run the handler for that org. A fresh census v2 reading `bp_qr_fin_no_active_schedule ~ true` is the acceptance read.
