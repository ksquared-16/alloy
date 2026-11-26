# Observed while closing Batch 1 — recorded, not absorbed

Per the batch boundary: anything that does not prevent the original Add Charge scenario from being
truthfully retested belongs to the later W7 scenario that exposes it.

## `tests/adminV2/` — 183 failing of 586

Run locally on this branch: **183 failed | 402 passed (586)**. Representative names:

- `Household card observes the Operational Context, not the drawer VM`
- `both renderer callers build the context via the sanctioned adapter`
- `isolates compatibility behind an explicit FocusPanelCardCompat wrapper`

They are source-shape assertions over the Focus Panel renderer, e.g. expecting the renderer source
to contain `<HouseholdCard model={model} context=…>` and `buildOperationalContext`.

**Not caused by this lane, and attributable without a probe.** This branch's entire delta against
`origin/staging` is four files:

```
web/lib/adminV2/actions/definitions/financialResponsibilityActions.ts
web/playwright/tests/zzz-w7-details.spec.ts
web/playwright/tests/zzz-w7-post-1385.spec.ts
web/tests/financials/responsibilityAdmitsHouseholdGrain.test.ts
```

None is a renderer file these tests read, so the delta cannot move those assertions.

**Worth someone's attention separately:** the required gate `Full graph (tests + scripts)` has been
green on every PR in this batch, including the one that is now staging. So either that gate does not
cover `tests/adminV2/`, or it does and these are tolerated. Either way a large suite is red on the
mainline and no required check is saying so — which is the same shape as the three defects this
batch found, where the guards were green and the product was not.

Not investigated further here. Batch 1 does not expand.
