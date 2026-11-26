# Reaching Financials in a mounted probe

This cost several cycles across Thread 11B. It is written down so the next probe does not
rediscover it.

## The contract

| step | selector | note |
|---|---|---|
| shell | `/workspace/work-unit/enrolled-children` | any authenticated adminV2 route |
| sidebar | `[data-adminv2-sidebar-modal-nav="financials"]` | **click with `force: true`** — the shell's own overlay intercepts a plain click. Its accessible name is the long title ("Financials — the financial work waiting on an operator, and the accounts it belongs to"), NOT "Financials", so `getByRole("button", { name: /^Financials$/ })` matches nothing |
| section | `[data-workspace-section-tab="accounts"]` | the modal lands on **Overview**, not Accounts |
| account | `[data-financials-account-row=<customerId>]` | |
| ledger row | `[data-financials-ledger-row=<key>]` | clicking the row does **not** open charge detail; the row carries its own `[data-financials-row-action=<kind>]` |

Financials Workspace is **modal-dispatched** (`TopNavBar` → `FinancialsModal` →
`FinancialsWorkspaceContainer`). There is no `/workspace/financials` route; a URL like
`/workspace/financials?tab=accounts` reaches nothing.

## Before blaming a selector, check the URL

An expired slot QA session redirects **every** route to `/login`. The shell, the sidebar and every
data attribute are then genuinely absent, so any selector hypothesis appears to confirm itself.
Three consecutive "the control is not there" diagnoses in this thread were one expired session,
and one of them was reported to the Director as a product fact.

Make this the first line of every probe:

```ts
expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
```

and print `page.url()` in any not-found branch. Refresh with
`vac-qa-evidence.mjs --port 3012 --worktree financials --slot 2` — it reports
`session_refresh.outcome: "refreshed"` — then re-run the same probe unchanged.

## Never click an unguarded locator

`locator.click()` on an absent element waits the **entire** test timeout. One probe here burned 15
minutes that way. Check `count()` first and return early; pass an explicit `timeout` to every click.

## A shell note that is not about Playwright

`cd web && …` from inside `web/` fails, and the `&&` chain silently does nothing while a later
statement still runs. It cost three cycles in this thread — twice writing a spec that never landed
so the previous one ran, and once skipping a file this document replaces. Use absolute paths or
check `pwd` first.
