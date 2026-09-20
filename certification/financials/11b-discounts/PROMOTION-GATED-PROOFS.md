# Commercial policy exceptions — proofs that cannot exist before promotion

**Status:** `DISCOUNT_EXCEPTION_MERGED_AWAITING_DEPLOYED_SCHEMA_PROOF`

**PR 1111 merged as `6c1b84fdc` on 2026-09-20.** The reason items A–K were impossible is gone: the
migration is now in staging lineage, so `database.apply_migration` can reach it. The items
themselves are still unproven, and none of them may be marked PASS from local certification.
**Candidate lineage:** `agent/financials-11a-regression-repair`
**Migration:** `supabase/migrations/20260924120000_commercial_policy_exceptions.sql`

**Reconciled with staging 2026-09-20** (`d1b8f1319`, Payments V1 W1–W4). The migration remains
correctly ordered — it is the highest version in the tree, after `20260923120000_payment_holds.sql`
— with no timestamp collision, no high-water skip, and no equivalent table from another program.

---

## Why this file exists

The exception runtime is built and certified against the committed schema. It cannot be certified
against the **deployed** one, and the reason is not a missing step — it is a governance fact:

- The deployed database applies migrations from **merged** lineage. `database.apply_migration` against
  the `staging_deployed` target refused `source_sha_not_reachable`, twice, because the migration
  lives on an unmerged candidate branch.
- The census run against the deployed class answered `table → false`. That is the correct answer;
  the table genuinely does not exist there yet.
- Merging the 11B candidate **only** to make the table visible was explicitly withheld, and should
  stay withheld: promoting an unfinished product thread to satisfy a proof inverts the gate.

So every item below is a **`PROMOTION_GATED_MOUNTED_PROOF`**: impossible today, mandatory before 11B
is considered promoted. None of them is claimed, waived, or partially credited anywhere in this
thread. Where this file says a thing is unproven, no other artifact says otherwise.

## What IS certified now, and what that is worth

Deterministic certification against the committed schema — 63 tests across four suites, each lock
proven binding by a planted defect that failed it and a restore that returned it to green:

| Suite | What it holds still |
|---|---|
| `tests/financials/commercialPolicyException.test.ts` | What an exception MEANS: scoping, effective dating, supersession, required reason, integrity refusals |
| `tests/financials/reductions/commercialPolicyExceptionAction.test.ts` | The command boundary: registered + classified, `fin.write`, refuses caller-supplied effect |
| `tests/financials/reductions/exceptionForecastLedgerChain.test.ts` | One policy identity from configuration through forecast to the posted reduction |
| `tests/financials/reductions/exceptionSurfaceContract.test.ts` | The Assignment surface asks the one authority, and is not a switch |

This proves the runtime is **correct**. It does not prove it **runs** — the deployed table, the
physical constraints, and every mounted interaction below remain unobserved.

### The candidate is safe to deploy before the table exists

An unmountable feature must not take working behaviour down with it. On a runtime without the
table, every read answers "relation does not exist"; if that were treated as a read failure, the
discount forecast would 500 for **every** assignment. So exactly two error signatures — Postgres
`42P01` and PostgREST `PGRST205` — are absorbed as "no exceptions can exist here", and authoring
refuses with a named `schema_absent` (HTTP 503) rather than a raw database message.

Every other failure still throws. "No exceptions" read off a broken query would silently grant a
discount somebody deliberately withheld — which is the harm this feature exists to prevent, and is
the `resolveChargeDetail` defect from earlier in this thread, where a bare `catch {}` made every
charge in the product read "Not posted to a period yet". Both halves are certified, each by a
planted defect: absorbing too little, and absorbing everything.

---

## The gate: A–K

Each item states what must be true, how it is proved, and what would make it a false pass.

### A. Staging migration apply succeeds
`database.apply_migration` against the deployed target completes for
`20260924120000_commercial_policy_exceptions.sql`, after the candidate is merged.
**False pass:** a governed action that returns a `gar` id without applying. Read the gateway store,
not the CLI summary, and confirm the applied version — a failed apply does not roll back DDL, so a
partial apply can look like a success.

### B. Deployed physical table exists
A census against the deployed class answers `table → true` for `commercial_policy_exceptions`.
**False pass:** censusing `certification_local` and reading it as staging. The target routing is
explicit: `certification`/`cert` → local Docker; `staging`/`alloy_deployed_primary` → deployed. An
all-zero or all-false answer is two different answers — wrong database, or genuinely absent.

### C. Physical constraints, index and trigger verified
On the **deployed** table, by census:
- `reason` is `not null` **and** the non-empty CHECK rejects `''` and whitespace
- `ux_commercial_policy_exceptions_live` is present and partial (`where superseded_at is null`)
- `enforce_commercial_policy_exception_org_parity()` fires and refuses a cross-org parent
- `policy_id` restricts deletion; `opportunity_customer_member_id` cascades
**False pass:** reading the migration file back. The file is the intent; the census is the fact.

### D. Deployed runtime reads the table
The deployed app's forecast route returns `exceptions` without error for an assignment with none —
proving the read path reaches a real table rather than being swallowed by a catch.
**False pass:** an empty array produced by a failed read. The absence of exceptions and the failure
to read them must be distinguishable in the response.

### E. Mounted Assignment forecast BEFORE
On the fixed QA runtime (port 3012, production build, no HMR): the discount section of a real
assignment, with an expected reduction and its amount, screenshotted before any exception exists.
**False pass:** an expired QA session. Assert the URL does not contain `/login` first — three
"selector failures" in this thread were one expired session.

### F. Mounted exception authoring
An operator records an exception through `billing.except_commercial_policy` from that surface: the
reason is required, the commit refuses without it, and the action returns `ok`.
**False pass:** the action registered but unreachable. It must be invoked from the surface, not
from a script.

### G. Mounted forecast AFTER
The same section, re-read: **"Excluded for this assignment"**, with the author's reason, and the
previously expected amount gone. Not `no_policy_configured`.

### H. Actual draft reduction exclusion
A real draft obligation is resolved through `applyFinancialReductions` on the deployed runtime, and
the excepted policy writes **no** `financial_reduction_applications` row.
**False pass:** a forecast agreeing with itself. The ledger, not the projection, is the subject.

### I. Configuration → forecast → ledger parity
For one specimen, the same `commercial_policies.id` appears in the configuration, in the forecast
outcome, and in the posted reduction — or is absent from the last two for the same stated reason.
**False pass:** comparing labels. The identity is the id.

### J. Posted-history safety
An obligation posted BEFORE the exception keeps its reduction, unchanged, after the exception
exists. An exception changes what eligibility decides next; it never rewrites what was decided.
**False pass:** checking only the current period.

### K. Supersession and end, mounted
Ending an exception restores eligibility for later obligations, the ended row survives with its
dates, and re-excepting supersedes by succession (`supersedes_exception_id` + `superseded_at`)
rather than editing. History is never deleted.

---

## Honesty constraints carried forward

- No item above may be marked PASS from local certification. The schema this ran against is the
  committed one, not the deployed one.
- No Human QA scenario is marked PASS by an agent in this thread.
- The deployed table must not be created or mutated by hand to satisfy B or C. A table that exists
  because someone typed it is not a migrated table, and the next environment would not have it.
