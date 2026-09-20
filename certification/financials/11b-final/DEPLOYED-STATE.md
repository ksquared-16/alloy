# Financials 11B — what is proved on the deployed build, and what is not

Written 2026-09-20, after PR 1111 merged and staging redeployed.

## §20 — deployment verified through the canonical build authority

`GET https://staging.workwithalloy.com/api/build-info`

```json
{
  "gitSha": "6c1b84fdc814a1cc1e62797a690c9ef6ceb4f1d5",
  "gitBranch": "staging",
  "gitMessage": "Merge pull request #1111 from ksquared-16/agent/financials-11a-regression-repair …",
  "nodeEnv": "production",
  "supabaseProjectRef": "ikaxilmwmrmbagoidedu"
}
```

The deployed `gitSha` **is** the merge commit, byte for byte. This is deployed evidence, read from
the deployed app — not the local fixed-candidate build, whose identity (`mG7A_Am8bbzMiBb124qR_`
on `1458c56b2`) is recorded separately and is **not** reused here.

## §24 (partial) — the new routes are on the deployed build and fail closed

Unauthenticated, from outside:

| route | status |
|---|---|
| `/api/admin/financials/reduction-forecast` | 401 |
| `/api/admin/financials/accounting-calendar` | 401 |
| `/api/admin/financials/responsibility-scopes` | 401 |
| `/api/admin/financials/responsibility-arrangement` | 401 |
| `/api/admin/actions/execute` (`billing.except_commercial_policy`) | 401 |

**401, not 404 and not 500.** 404 would mean the route did not deploy; 500 would mean it deployed
and breaks before its guard. This proves the routes exist on `6c1b84fdc` and refuse an
unauthenticated caller — and nothing more than that.

## What this does NOT prove

It is not item D of `PROMOTION-GATED-PROOFS.md`. A 401 says the guard ran; it says nothing about
whether the deployed runtime can read `commercial_policy_exceptions`, because the guard returns
before the read. **The table still does not exist on the deployed database.**

The rest of the deployed smoke — Assignment commercial setup, Financials Summary and Details,
Accounts, Accounting Period administration, billing generation preview, the discount
forecast and exception, the unified Add target, Prepaid, organization configuration and the final
Focus Panel composition — requires an authenticated deployed session and has **not** been run.

## Blocked, and on what

| Gate | Request | State |
|---|---|---|
| §21 migration apply to the deployed database | `gar_2991cf622ab286` | awaiting_operator |
| §24 deployed QA session | `gar_aa3df4f19b37c7` | awaiting_operator |

§22 (physical schema proof) and §23 (A–K mounted) depend on §21. No item of A–K is claimed, and no
Human QA scenario is marked PASS.

---

## §8 — deployed Financials smoke, on build `6c1b84fdc`

| Surface | Answer |
|---|---|
| Focus Panel composition | 7 cards: business_process, financials, children, household, attendance, health_safety, assignment_tuition. ~~**`billing_preview` absent** — the retirement holds~~ **← WITHDRAWN, see the correction at the foot of this file. The rendered key is `assignment_tuition` and the card IS composed.** |
| Assignment commercial setup | tuition select present; accepted "Recommended · $195.00/weekly"; **Billing Frequency weekly · current period Sep 15–21, 2026 · next Sep 22–28, 2026** |
| Discount forecast + exception | forecast section present; the live exception rendered with its reason; rejected-option diagnostics present (1) |
| Accounts | 11 rows, **Manage responsibility** offered, 5 lenses: all, charges, credits, funding, payments |
| Accounting calendar read | `/api/admin/financials/accounting-calendar` → 200, keys `ok, calendars, periods, today` |
| Accounts read | `/api/admin/financials/accounts` → 200 |
| Organization → Financials | 7 chapters: Tuition, Catalog, Policies, Payments, Accounting, Simulator, Funding. No horizontal overflow |

**Two things this smoke did NOT observe, and does not claim:**

- The **accounting calendar panel itself** (`[data-accounting-calendar]`) did not match. The
  Accounting chapter is present; the panel within it was not confirmed rendered, because the probe
  did not open the chapter. Recorded as unobserved, not as absent.
- **Recurring-generation preview** and **Prepaid** were not driven. The routes and surfaces that
  carry them answered, but neither was exercised as an operator act.

No Human QA scenario is marked PASS. The catalog stands at `2026-09-20.3` with 44
`HUMAN_WALKTHROUGH` scenarios and Human PASS **ZERO**.

---

## CORRECTION — the `billing_preview absent` claim is WITHDRAWN

This document previously recorded that `billing_preview` was absent from normal Focus Panel
composition on the deployed build. **That claim was false and is withdrawn.**

The probe asserted:

```js
billingPreviewRendered: Boolean(document.querySelector("[data-universal-card-key='billing_preview']"))
```

`billing_preview` is the REGISTRY key. `AssignmentTuitionCard` — the component that key routes to —
emits `data-universal-card-key="assignment_tuition"`. The selector therefore **cannot match under
any circumstances**, and returned `false` whether the card rendered or not. It proved nothing.

Re-measured with the rendered identity, on the same tenant:

```
[data-universal-card-key='assignment_tuition']  →  PRESENT on the household panel AND the child panel
rendered title                                  →  "TUITION · 2 of 2 agreed · …"
published tenant layout                         →  still composes billing_preview
```

**The retired card is still composed.** Retiring it from the code-owned default composition does
not move a tenant that renders from a published layout; that requires a new publication through
the append-only path.

No other gate in this document depended on that selector. A, B, C, D, E, F, G, H, I, J and K stand
as recorded — each was measured against the authority or against its own surface, not against this
key. What is withdrawn is the composition claim alone.
