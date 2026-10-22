# Business Processes V2, Slice 8A: financial quiescence for the `bp_v2` shared-QA plan

**Gate:** `bp_financial_quiescence_proven` (`qa-plan-registry.mjs` `plan_preflight.bp_v2`)
**Plan cleanup mode:** `QUIESCED_RETAINED` in the permanent QA Shared organization (`4acc9386-…d142`)
**Code measured:** lane `agent/business-processes`, and Alloy staging `841becb44` (read-only `git archive`). Both pass the same suite.
**Census:** `bp-quiesced-retained-census.v2.sql`, sha256 `c1b6c335db7676449de5ae6366b723e9ac7ce52894ff73ba88e1385a72b05648`. This is the corrected census; the first draft `bb99a1a1…477d9c` is superseded (§E).

---

## A. What financial quiescence means here

The QA Shared organization is permanent, and posted money is immutable. So a run's financial records **stay**. Quiescence means that, after the run closes, nothing it left can still act, ask for action, or be mistaken for something else.

A bp_v2 run is **financially quiescent** when every condition below holds, measured **org-wide** across QA Shared. A bp_v2 run holds the org exclusively, so any residue is either this run's or an earlier run's, and both must be quiet.

| # | Condition | Why | Census check |
|---|---|---|---|
| Q1 | No identity other than QA Shared's registered provisioning administrator keeps **effective access**: a role (`user_roles`), an access profile (`user_access_profiles`), or site or department scope (`user_site_access`, `user_department_access`) | No persona can act after close. A profile left behind by a removed role comes back to life on the next grant. | `bp_qr_pool_access` |
| Q2 | No outbound message carries **durable send evidence**: `sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `replied_at` or `provider_message_id` set, or a status of `sent`, `delivered`, `bounced`, `opened`, `clicked` or `complained` | No family-facing effect. A send stays a send after its status moves on. | `bp_qr_zero_sent` |
| Q3 | No provider merchant binding exists | Every real collection path (card/ACH collect, autopay, public enrollment payment) needs an active, ready merchant | `bp_qr_fin_no_merchant` |
| Q4 | No usable stored payment method exists | Autopay and stored-method charges need one | `bp_qr_fin_no_usable_method` |
| Q5 | No active or paused autopay authorization exists | Autopay is the only automatic collector | `bp_qr_fin_no_autopay` |
| Q6 | No provider attempt, provider refund or provider-attributed payment exists | A refund and the reconciliation sweep act on earlier attempts, and attempts feed Payment exceptions | `bp_qr_fin_no_provider_activity` |
| Q7 | No Financials or Payments scheduled work is active | Periodic tuition generation, future-period posting, autopay and period close run from `scheduled_work` | `bp_qr_fin_no_active_schedule` |
| Q8 | No draft charge exists (drafts are retained as `void`) | Drafts feed Charges needing review and are auto-posted when their period opens | `bp_qr_fin_no_draft` |
| Q9 | No positive posted charge is owed unless reversed or fully covered by active applications of posted payments. **No date filter**, so charges that would fall due later are included. | Payments due and Overdue payments, now and later | `bp_qr_fin_no_open_balance` |
| Q10 | No subsidy variance is unresolved | Funding variances | `bp_qr_fin_no_open_variance` |
| Q11 | No posted inbound payment holds unapplied money | Unapplied credit would settle against the next run's charges and change its assertions | `bp_qr_fin_no_unapplied_money` |
| Q12 | Every retained charge, payment and variance was written by a managed QA identity (`qa-*@example.com`) | Attribution. A row with no actor came from a job, webhook or public link, and no run can account for it. | `bp_qr_fin_attributed` |
| — | QA Shared exists | A census against a wrong or absent id reads all-zero, so it must not read as clean | `bp_qr_org_exists` |

**Kept, and reported as data rather than residue:**
- void drafts;
- posted charges together with their reversal rows;
- paid charges with their payments and applications;
- resolved variances;
- subsidy claims and remittances;
- published process configuration;
- audit history.

The census lists these as `bp_qr_retained_financial`. It also lists, per identity and per day, how many rows each wrote (`bp_qr_retained_financial_actors`). The QA run ledger's lease windows (`opened_at`–`closed_at` for each leased identity) map those rows to a run.

**Excluded from later runs' assertions:**
- Once quiescent, all five Billing views read **zero** for the org (proved below). Every later run therefore starts from an empty Billing baseline, and its counts are its own.
- Retained history still shows on the households that hold it. A run must create its **own households**, named with its `qar_…` id, and assert Financials card figures only on those. It must never assert org-wide history totals.

Quiescence does **not** require deleting anything, retiring the org, or bypassing any trigger.

---

## B. Each artifact: how it is neutralized, and its classification

File references are to staging `841becb44`, under `web/` unless they are migrations.

| Artifact | Neutralizing command (existing) | Resulting state | Classification |
|---|---|---|---|
| **Draft charge**, including one awaiting review | `charge.cancel_draft` (`lib/adminV2/actions/definitions/financialChargeActions.ts:83,1076-1135`, `fin.write`, no approval). Service: `lib/financials/chargeLifecycle/cancelDraftCharge.ts:56,73-107` | `status='void'`, `voided_at`, `metadata.retirement`; linked draft reductions voided; **kept** | Supported |
| **Failed posting attempt** (a draft with `metadata.post_gate='post_failed'`; nothing retries it, `lib/financials/posting/awaitingPostingReason.ts:94-108`) | `charge.cancel_draft` | As above | Supported |
| **Scheduled future-period draft** (`post_gate` period-not-started, auto-posted by `lib/financials/posting/futurePeriodActivation.ts:71-80`) | `charge.cancel_draft` | As above | Supported |
| **Posted charge** (immutable: `trg_enforce_childcare_charge_immutability`) | `charge.reverse` with `kind:"reversal"` (`financialChargeActions.ts:81,962-1050`, `fin.adjust`, no approval). Service: `createChildcareCorrection` (`lib/financials/childcareChargeService.ts:731-826`) | A new posted row with `source_charge_id` set, `amount=-original`, `correction_kind='reversal'`. The original is unchanged and is excluded from Due and Past Due (`lib/financials/account/accountDueClassification.ts:67-84,182-200`). | Supported. **Use reversal only.** A `credit` correction leaves the original in Payments due, because `dueWithinFor` keeps it. |
| **Payment** (manual rail) | `payment.record` against the charge, fully applied (`lib/adminV2/actions/definitions/financialPaymentActions.ts:81,195`, `fin.write`) | A posted inbound payment plus an active application. The charge is covered and leaves both views. | Supported |
| **Unapplied money** | Apply it to a charge (`payment.apply_to_charge`, `financialPaymentActions.ts:85`), or refund it through `payment.refund` on a **manual** rail. For manual rails `refundChildcarePayment` is offline (`lib/financials/childcarePaymentService.ts:1360`). | Q11 holds | Supported. A Stripe refund calls the provider, so a run must never create a Stripe payment. |
| **Provider payment** (Stripe) | None without a real provider call | — | **Cannot be neutralized safely.** Excluded by construction: QA Shared has no merchant (Q3), so none can exist. |
| **Open subsidy variance** | `subsidy.resolve_variance` (`lib/adminV2/actions/definitions/financialSubsidyActions.ts:52,382`, `fin.subsidy`). Service: `lib/financials/subsidy/remittanceService.ts:263-345`. Then `charge.reverse` on the claimed charge. | `resolution_kind` and `resolved_at` are set, once only (CHECK in `20260909120000_financial_subsidy.sql:304-320`). Leaves Funding variances. | Supported. Resolve with `accept_family_responsibility` or `hold_under_review`, then reverse. Do not use `write_off`: it writes a reduction, and the census deliberately does not count reductions as covering a charge. |
| **Subsidy claim and remittance** | None. `state='void'` is allowed by the schema, but no command writes it. | Inert once its variances are resolved and its charges reversed | Cannot be neutralized under the current model. **Acceptable**: it is retained, inert history. |
| **Due / overdue balance** | `charge.reverse`, or full payment | Q9 | Supported |
| **Payment exceptions** (`payment_collection_attempts`, `processor_state='succeeded'`, not yet recognized) | `payment.recognize` (`lib/adminV2/actions/definitions/paymentRecognitionActions.ts:34`), but only for money a provider really collected | — | **Not seedable in QA Shared**, because there are no provider rails. The view is certified **empty**, never populated. |
| **Autopay** | `autopay.revoke` (`lib/adminV2/actions/definitions/autopayActions.ts:42,324`, `fin.write`): `status='revoked'` and its schedule is deactivated (`lib/financials/payments/autopayArrangement.ts:615`) | Q5, Q7 | Supported. It can't arise anyway: autopay needs a usable method and a merchant. |
| **Periodic tuition generation** | **None.** `POST /api/admin/financials/periodic-billing-activation` only activates; `ensurePeriodicBillingSchedule` (`lib/financials/periodicBilling/periodicBillingSchedule.ts:78-103`) only sets `is_active: true`. No writer deactivates it, and no command ends an accepted pricing term (`lib/enrollment/pricing/enrollmentPricingTermsService.ts:340,562-565`). | — | **Needs a narrow Financials correction** (§D). It is not needed by bp_v2: the run contract forbids activation, and Q7 detects it. |

---

## C. Proof: product commands, run on the local certification stack

Suite: `web/tests/businessProcesses/financialQuiescence.live.test.ts`. It is env-gated and skips without `BPV2_LIVE_*`.

It ran green on the lane tree **and** on an archive of staging `841becb44`, three tests each:
- evidence: `quiescence-live.lane.local-cert.json` and `quiescence-live.staging-841becb44.local-cert.json`;
- the local stack is shared, and its migration ledger trails staging;
- the suite runs the census v2 file **verbatim**, substituting only the org id and the actor email.

**Positive path.** A fresh local org stands in for QA Shared, with the admin actor holding `fin.read/write/adjust/subsidy`.
1. Clean org: census v2 is all `true`.
2. Live state seeded: one draft under review, one failed post, one past-due charge, one due-soon charge, one to-be-paid charge, and one subsidized charge with a short-paid variance.
   - Census fails exactly `bp_qr_fin_no_draft`, `bp_qr_fin_no_open_balance` and `bp_qr_fin_no_open_variance`.
   - Billing views: `charges_needing_review` 1, `funding_variances` 1, `payments_due` 1, `overdue_payments` 1, `payment_exceptions` 0.
3. Quiesced **only** through `executeCommandInvocation` (the operator command boundary), as the actor. All seven commands were `committed`:
   - `charge.cancel_draft` ×2;
   - `payment.record` (check; `idempotency_key` and `reference_number` carry the run id);
   - `subsidy.resolve_variance` (`accept_family_responsibility`);
   - `charge.reverse` ×3.
4. Result:
   - Census v2: all **13 checks `true`**.
   - All **five Billing views 0**.
   - History preserved: 7 rows before and 12 after; **0 removed**; the 4 posted charges are **byte-identical** apart from `updated_at`; both drafts are `void` and still present; 3 reversal rows point at their sources; every row's actor is the run's actor.
   - No trigger was bypassed and nothing was deleted.

**Negative path.** A second fresh org starts clean, and one defect is added at a time. Each defect flips **its own check and no other**. Where a product writer exists, it was used.

| Defect added | Newly failing |
|---|---|
| A census pointed at a non-existent org | `bp_qr_org_exists` (alone) |
| Pool identity keeps `ops` (audited `createMembershipWithAccessProfile`) | `bp_qr_pool_access` |
| Merchant bound | `bp_qr_fin_no_merchant` |
| Usable stored method | `bp_qr_fin_no_usable_method` |
| Active autopay | `bp_qr_fin_no_autopay` |
| Succeeded provider attempt | `bp_qr_fin_no_provider_activity` |
| **Periodic billing activated**, by the product's own `ensurePeriodicBillingSchedule` | `bp_qr_fin_no_active_schedule` |
| A draft remains | `bp_qr_fin_no_draft` |
| A posted charge is owed, due in 30 days (in no view yet) | `bp_qr_fin_no_open_balance` |
| Payment recorded, then its application reversed (`payment.record` → `payment.reverse_application`) | `bp_qr_fin_no_unapplied_money` |
| Unresolved variance | `bp_qr_fin_no_open_variance` |
| A financial row with no actor | `bp_qr_fin_attributed` |

**Corrections (2026-10-22 review): failing tests first.** Each defect gets its own fresh org.
- Against the first-draft census, the new test failed at its first defect: a message sent and then delivered read as `zero_sent ~ true`.
- `census-v2-corrections.prev-vs-corrected.local-cert.json` runs both census texts against the same orgs. The first draft passed **all five** defects as clean.

| Defect (own org) | First draft | Corrected |
|---|---|---|
| Control: outbound `queued`, inbound `received` with a provider id | clean | clean |
| Sent, then `delivered` | **clean (missed)** | `bp_qr_zero_sent` |
| Sent, then `bounced` | **clean (missed)** | `bp_qr_zero_sent` |
| `sent_at` recorded, status later `failed` | **clean (missed)** | `bp_qr_zero_sent` |
| Accepted by the provider (`provider_message_id`), no `sent_at` yet | **clean (missed)** | `bp_qr_zero_sent` |
| Pool identity's role removed, its access profile left behind | **clean (missed)** | `bp_qr_pool_access` |
| Control: the provisioning administrator's own role and profile | clean | clean |

**Read-only and scoped** (`census-v2-scope-audit.local-cert.json`):
- One statement, with no write keyword, and it executes inside `BEGIN TRANSACTION READ ONLY`.
- The only UUID literal is QA Shared; Firefly's id is absent; the only email literals are `qa-shared-actor@example.com` and the `qa-%@example.com` pattern.
- Every `public` relation read is filtered by QA Shared's id, or correlated to a row that is: `payment_allocations`, refund `payments` and reversal `charges` hang off a scoped row; `orgs` is read by `id`.
- `auth.users` is read only to resolve an already-scoped row's actor.
- A fresh, empty org reads all-clean while the busy local orgs next to it hold merchants, sends and drafts, so nothing leaks in from other orgs.

**Reproduce:** from `web/`, run:
```
BPV2_LIVE_SUPABASE_URL=http://127.0.0.1:54421 BPV2_LIVE_SERVICE_KEY=<local service JWT> BPV2_LIVE_EVIDENCE=<out.json> npx vitest run tests/businessProcesses/financialQuiescence.live.test.ts
```

**Limits of the local proof:**
- Some fixtures are controlled inserts, made as the run's actor: the household and its account billing calendar, the draft and posted charges, the subsidy chain, and the negative-path provider rows. The **neutralization** is entirely product commands.
- Creating fixtures through `charge.add` needs authored charge templates. That belongs to the hosted run (QA-READINESS §3).
- The local org is created with the same audited membership writer the shared-QA ensure uses, but not by the ensure itself.

---

## D. Financials dependency (one handoff, two narrow items; neither blocks the gate)

Full specification: `financials-quiescence-handoff.md`.

1. **A QA-org refusal on payment-provider calls (Payments).**
   - No payment path refuses a registered QA organization. `refuseQaOrgOutbound` guards only email, invites and password reset (`lib/qa/sharedQaSafety.ts:109-122`).
   - Money cannot move without a merchant (Q3). But an `admin` persona holds `fin.provider` and `fin.write`, so **during** a run it could:
     - start a real Stripe connected-account onboarding (`providerInstallationActions.ts:146`); or
     - create platform-level Stripe Customers and SetupIntents, which need only the platform key (`lib/financials/payments/providerPaymentMethod.ts:66,112,143`).
   - The requirement: refuse those calls for `isRegisteredQaOrgId(org)`, the same way the no-send guard works. This is run safety, not post-run quiescence. Until it exists, the bp_v2 run contract forbids those commands, and Q3/Q4/Q6 detect any row they would leave.
2. **A way to stop periodic billing (Financials / Enrollment).**
   - Activation is one-way: no command deactivates the org's `financials.periodic_billing.evaluate` schedule or ends an accepted pricing term.
   - If anyone ever activates it in QA Shared, Q7 fails **permanently**, and bp_v2 can never close QUIESCED again.
   - The requirement: a governed `financials.periodic_billing.deactivate` (set `is_active=false`, `next_due_at=null`, audited), or an append-only "end pricing term" command.
   - Until then, the bp_v2 contract forbids activating it.

The Business Processes sprint is not blocked on either item.

---

## E. Retained-artifact census

The registered `certification/qa-shared/bp-quiesced-retained-census.sql` (sha `dacbfc62…b7ef`) checks only `bp_qr_pool_access` and `bp_qr_zero_sent`. It **counts** charges, but asserts nothing about them. A run could therefore close `QUIESCED_RETAINED` with a live merchant, an open balance, or active periodic billing.

Census v2 keeps every v1 question and adds `bp_qr_org_exists` plus the ten `bp_qr_fin_*` checks:
- it is one statement, catalog-safe, and emits `question_id|kind|payload`;
- every table it reads exists in staging migrations, the newest being `20261004120000`;
- deployed baseline of the corrected census: `gar_f04e0a9aaae37e`, all 13 checks true (§G).

**Superseded first draft.** `bb99a1a1…477d9c` (deployed baseline `gar_59095c7294014e`) under-measured two v1 checks. Its zero-sent check read only `status = 'sent'`, and its pool-access check read only `user_roles`. It must not be registered.

**Vacilando handoff** (`financial-quiescence-handoff.json`). Re-pin `QA_PLANS.bp_v2.residue_census` to:
- `path`: `certification/business-processes-v2/slice8a/bp-quiesced-retained-census.v2.sql`
- `query_sha256`: `c1b6c335db7676449de5ae6366b723e9ac7ce52894ff73ba88e1385a72b05648`
- `checks`: all 13 check ids.

**Do not record `bp_financial_quiescence_proven` against the v1 pin or the superseded `bb99a1a1…` draft.** Register the census at the path and hash on **merged staging**; the merge commit is reported with the PR.

---

## F. Run contract for bp_v2 (what keeps it quiescent)

- **No provider rail.** Do not connect a merchant, add or request a payment method, collect a card or ACH payment, or start autopay. Record manual-rail payments only (check, cash).
- **Do not activate periodic billing.** Billing fixtures are one-off charges, not accepted tuition terms on a running schedule.
- **Attribute everything to the run.**
  - Every household is named with the `qar_…` id.
  - `payment.record`, `subsidy.record_remittance` and `subsidy.submit_claim` carry the run id in `idempotency_key`, `reference_number` or `external_reference`.
  - All writes are made by leased personas, and the census attribution check holds.
- **Quiesce before close, as the Admin persona** (who holds `fin.write`, `fin.adjust` and `fin.subsidy`), in this order:
  1. `charge.cancel_draft` on every draft;
  2. `subsidy.resolve_variance` on every open variance;
  3. `charge.reverse` (`kind: reversal`) on every positive posted charge that is not fully paid;
  4. apply or manually refund any unapplied money.

  Then close the run (persona access is revoked), then run census v2. Close is refused as `QUIESCED_RETAINED` unless all 13 checks are true.

---

## G. Readiness of `bp_financial_quiescence_proven`

| Item | State |
|---|---|
| Definition (A) and capability map (B) | Done |
| Local proof, positive and negative, on lane and staging code (C) | Done, green |
| Corrected census v2 with a pinned hash (E), with the corrections' failing-first tests | Done |
| Corrected census v2 executes on the deployed schema (baseline; QA Shared clean before any run) | **Done**: `gar_f04e0a9aaae37e` (`tha_930f45aa5a9147`, `alloy_deployed_primary`, 2026-10-22T15:00Z, hash `c1b6c335…b05648`). QA Shared present; all 13 checks `~ true`; 0 retained financial rows. Results: `bp-quiesced-retained-census.v2.sql.results.json` |
| Census v2 registered as bp_v2's residue census | **Vacilando Backend** (handoff JSON) |
| Financials hardening (D) | Handed off; not blocking |

**Proposed evidence ref:** "Alloy staging `<merge commit>` (this PR). Census v2 `certification/business-processes-v2/slice8a/bp-quiesced-retained-census.v2.sql`, sha256 `c1b6c335db7676449de5ae6366b723e9ac7ce52894ff73ba88e1385a72b05648`, 13 checks. Local quiescence proof `financialQuiescence.live.test.ts` (3 tests) green on lane and staging `841becb44`; evidence JSON in `slice8a/`. Deployed corrected baseline `gar_f04e0a9aaae37e`, all 13 checks true."
