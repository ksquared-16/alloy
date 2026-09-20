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
