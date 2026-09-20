# A–K, executed on the deployed build — two gates do not pass

Deployed build `6c1b84fdc` · `https://staging.workwithalloy.com` · deployed database
`ikaxilmwmrmbagoidedu` (target `alloy_deployed_primary`, fingerprint `b15dad2c6d030ed4`).
Subject: assignment `79f8011d-a236-4054-bee7-af10f1dbc632`, gross $185.00, policy
`5df9fc6c-71e6-4f1b-a00f-f612cecbe9e0` ("discount", 10%).

**The completion token is NOT returned.** Two gates fail and one is unproved.

| Gate | Verdict | Evidence |
|---|---|---|
| **A** migration applied | **PASS** | `tha_d7557b219669c3` ok/stopped=false; and read from the database, not the label: `migration_in_ledger → 20260924120000` |
| **B** deployed table exists | **PASS** | `table_exists → commercial_policy_exceptions` |
| **C** constraints, index, trigger, FKs, tenancy | **PASS** | `reason` NOT NULL + `CHECK ((length(btrim(reason)) > 0))`; index partial `WHERE (superseded_at IS NULL)`; trigger `(O)`; `policy_id confdeltype=r`, relationship `confdeltype=c`; `org_id` NOT NULL |
| **D** deployed runtime reads the table | **PASS** | forecast route 200 with the `exceptions` key; ambiguity with the schema-absent fallback removed by B |
| **E** forecast BEFORE | **PASS** | `expected`, policy `5df9fc6c`, −1850 cents, "discount · 10% of $185.00" |
| **F** mounted authoring | **FAIL (write)** | Every UI contract holds — draft opens, Confirm **disabled** without a reason, preview says "will not apply … already posted keeps the terms it was posted under" and **quotes no figure**, Confirm enables with a reason. The write was then **refused**: `duplicate key value violates unique constraint "ux_commercial_policy_exceptions_live"` |
| **G** forecast AFTER | **PASS** | API `excluded_by_exception`; UI renders "Excluded for this assignment" with the author's reason. Not `no_policy_configured` |
| **H** excluded policy writes no reduction | **PASS (forecast grain)** | `totalCents: 0`, `netCents === grossCents`. Through the same resolver the apply path uses. No ledger row was read — see below |
| **I** one policy identity | **PASS** | `5df9fc6c` in the configuration, in the forecast outcome, and on the exception row |
| **J** posted-history safety | **NOT PROVED** | No posted charge's reductions were read before and after |
| **K** end / supersession / restoration | **PARTIAL** | Supersession **PASS** (first row `superseded: true`, replacement `appliesNow: true`). History **survives** (2 rows, nothing deleted). **Later eligibility restoration NOT demonstrated** |
| Effective dating | **PASS** | A mid-period start (09-20) gives `appliesNow: false` for a period beginning 09-01; a period-start start gives `appliesNow: true`. Exactly the intended semantics |
| No parallel discount authority | **PASS** | One service, one resolver; the forecast and the ledger path call the same `readExcludedPolicyIds` and the same `resolveFinancialReductions` |

---

## Three defects, found by these gates

### 1. An ENDED exception still occupies the live-row unique slot

`endPolicyException` sets `effective_end` but leaves `superseded_at` NULL, and the partial unique
index is `(org_id, policy_id, opportunity_customer_member_id, effective_start) WHERE superseded_at
IS NULL`. So after ending an exception, authoring the same policy for the same assignment **on the
same effective_start** collides.

It bites the ordinary operator path, because the surface always authors `effective_start: today`:
end an exception and immediately reconsider, and the second attempt is refused. This is what
failed gate F's write half.

### 2. That refusal reaches the operator as a raw Postgres string

The UI showed `duplicate key value violates unique constraint "ux_commercial_policy_exceptions_live"`.
`createPolicyException` maps `schema_absent` and its own integrity checks to named codes, and falls
through to `db_error` with `insertError.message` for everything else. A unique violation on the
live-row index is a *known, expected* condition and deserves a named refusal in operator words.

### 3. `appliesNow` answers one question and the UI asks it another

The read model computes `appliesNow` against the **start of the forecast period**, which is right
for deciding what the forecast shows. The surface uses the same flag to decide whether to offer
**End exception** — so an exception that has already been ended, but whose window covered the
period start, still renders as live and still offers to end it. Two different questions, one flag.

None of these is a reason to unwind 11B: the authority, the identity chain, the exclusion
semantics, supersession, effective dating and the no-second-engine rule are all proved on the
deployed build. They are reasons the completion token is withheld.

---

## Why "later eligibility restoration" could not be shown in this period

Ending the live exception set `effective_end = 2026-09-20` on a window that began `2026-09-01`.
The forecast judges against the period start, `2026-09-01`, where the window still covers — so the
period remains excluded and `eligibilityRestored` reads false.

That is defensible doctrine: the period's eligibility was decided while the exception was in
force. But it is **not** the gate's claim, which is that a later obligation becomes eligible again.
Demonstrating it needs the NEXT period's forecast, which this probe did not ask for. Recorded as
unproved rather than argued into a pass.

## Why H is "forecast grain"

`totalCents: 0` and `net === gross` prove the excluded policy contributes no reduction through the
resolver that the apply path uses. It is not a read of a written `financial_reduction_applications`
row, because no draft was generated on the deployed tenant for this proof. The distinction is kept
because the gate says "actual draft reduction exclusion".
