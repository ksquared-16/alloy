# 07 — Director acceptance rubric

> **Required output #11.** The rubric the Director gates Access & Identity V2 on. Each criterion
> binds to an evidence type the acceptance runtime can actually evaluate, so a phase's gate can
> pass or fail on evidence rather than on assertion.
> Also repairs **M3** from [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md) §2:
> this mission's own AC1 is a tautology with `evidenceType: null`, which no checker can evaluate.

**Mission** `msn_2d054741a54698fa4c` v1 · phase *Director acceptance rubric* · assignment `asg_56508f92881d3d`
**contentHash** `2c0b0b8fee88469de91e37587a3bb242`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30

---

## 1. The vocabulary this rubric may use

Criteria must bind to what `scripts/local-dev/lib/vacilando/acceptance.mjs` can evaluate. Inventing
an evidence type produces exactly the unfalsifiable criterion this document exists to prevent.

| Evidence type | Auto-verifies | Source |
|---|---|---|
| `file_exists` | Deliverable exists and is non-empty | `acceptance.mjs:91` |
| `sections_present` | Required headings present in the deliverable | `:97` |
| `git_clean_outside_docs` | Nothing changed outside the allowed docs path | `:105` |
| `source_changed` | Application source actually changed | `:111` |
| `tests_pass` | Report's `tests.ran === true` and results show a pass | `:126` |
| `qa_evidence` | Screenshots exist under the declared QA path | `:138` |
| `migration_accounted` | Every migration appears in `migrations[]` with a status | `:149` |
| `intent_fidelity` | Deliverable answers the operator's stated intent | `:227` |
| `rejected_patterns_not_reintroduced` | A previously-rejected pattern has not returned | `:234` |
| *(anything else)* | **Not faked** → `operator_review` | header `:8-10` |

**`rejected_patterns_not_reintroduced` is the natural binding for §2.** The rejection conditions are
precisely "patterns the operator has already rejected," and the runtime already has a checker for
that shape — the gates below should bind to it rather than to bespoke tests wherever the pattern is
expressible as one.

The last row is the important one. The runtime is explicitly honest: subjective criteria are not
auto-passed, they are surfaced for sign-off. A rubric that marks everything `operator_review` is
useless; a rubric that claims machine-verifiability it does not have is worse. §3 splits them.

## 2. Rejection conditions — automatic fail

The brief names seven conditions under which the Director *"should reject implementation as
incomplete."* These are gates, not criteria: any one true → the phase fails regardless of the rest.

| # | Condition | How it is caught |
|---|---|---|
| **R1** | A UI checkbox added without enforcement evidence | Every new control traces to a server-side check; `tests_pass` covering the deny case |
| **R2** | A permission exists but is not connected to a meaningful operator concept | Every permission key appears in a named access group ([`06`](./06-product-ia-and-flows.md) §3.5) |
| **R3** | Parent access relies on household-wide assumptions instead of relationship scope | `tests_pass`: a guardian scoped to one child cannot read a sibling |
| **R4** | A user account creates duplicate identity | `tests_pass`: account creation writes no person-shaped fields ([`04`](./04-authentication-model.md) §3.1) |
| **R5** | A role controls pages but not actions or data | `tests_pass`: role change alters API/action outcome, not just navigation |
| **R6** | QA validates only the happy path | `qa_evidence` includes denied/empty/expired states |
| **R7** | A mock looks correct but the effective-access matrix disagrees | Preview and enforcement call one resolver ([`06`](./06-product-ia-and-flows.md) §3.1) |

**R7 is the one that needs structural prevention, not testing.** If the preview has its own code
path, no test suite reliably catches drift. The rubric should require that the preview endpoint and
the enforcement path share a resolver — a design constraint the Director can check by reading, once.

## 3. Criteria

Derived from the brief's ~20 measurable criteria, grouped by what they govern. `Auto` = the
acceptance runtime can decide it. `Review` = honest `operator_review`.

### 3.1 Identity & lifecycle

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AI-1 | An administrator can create or link a person and grant login access | `qa_evidence` + `tests_pass` | Auto |
| AI-2 | Staff, parents, guardians, and other supported types receive access without identity duplication | `tests_pass` (R4) | Auto |
| AI-3 | Account creation binds to exactly one canonical person | `tests_pass` | Auto |
| AI-4 | Invitation, suspension, lockout, deactivation, and recovery are complete | `qa_evidence` per transition | Auto |
| AI-5 | A non-`active` account cannot use an existing session | `tests_pass` | Auto |

**AI-5 is the highest-value single test in this rubric.** It is today's most consequential defect
([`04`](./04-authentication-model.md) §2.6): deactivation removes a role row and leaves a working
credential. If V2 ships one enforcement test, it is this one.

### 3.2 Roles, scope & effective access

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AR-1 | Roles control surfaces, actions, records, fields, and administration | `tests_pass` across all four layers (R5) | Auto |
| AR-2 | User-specific scope can be previewed before saving | `qa_evidence` | Auto |
| AR-3 | Preview and enforcement produce identical results | `tests_pass` (R7) | Auto |
| AR-4 | Effective access is understandable in operator language | Reads as the brief's sentence form | Review |
| AR-5 | Common roles can be configured quickly | Walkthrough | Review |
| AR-6 | Advanced granularity remains available progressively | `qa_evidence` (preset → Custom → keys) | Auto |
| AR-7 | No raw permission-key wall as the default role editor | Default view shows groups (R2) | Review |
| AR-8 | Empty, inherited, restricted, conflicting, and expired states are visually clear | `qa_evidence`, one per state ([`06`](./06-product-ia-and-flows.md) §4) | Auto |

AR-4, AR-5 and AR-7 are judgment. They are the criteria the brief cares most about and the ones no
checker can decide — marking them Auto would be the dishonesty the acceptance runtime avoids.

### 3.3 Authentication

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AU-1 | Authentication methods are organization-configurable | `tests_pass` + `qa_evidence` | Auto |
| AU-2 | Password fields include show/hide | `tests_pass`: no bare `type="password"` outside the shared component | Auto |
| AU-3 | Password policy is enforced server-side | `tests_pass`: direct API call rejects a weak password | Auto |
| AU-4 | MFA policy can be set by role | `qa_evidence` | Auto |
| AU-5 | Session and trusted-device policy are configurable and enforced | `tests_pass` | Auto |

**AU-2 and AU-3 are cheap and should land first.** Both are small, both are currently absent
([`04`](./04-authentication-model.md) §2.3, §3.4), and AU-3 closes a real hole — today's `length >= 6`
lives in a submit handler and the server accepts anything.

### 3.4 Enforcement & security

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AE-1 | Every protected route has a server-side access assertion | `tests_pass`: undeclared route fails a static check ([`05`](./05-command-enforcement-census.md) §4.3) | Auto |
| AE-2 | Every registered command verifies authorization independently of UI placement | `tests_pass`: executor denies without permission ([`05`](./05-command-enforcement-census.md) §3) | Auto |
| AE-3 | RLS and API scopes agree | `tests_pass`, or an explicit D4 position | Auto |
| AE-4 | Hidden surfaces cannot be reached directly by URL | `tests_pass` | Auto |
| AE-5 | Cross-location, cross-org, cross-child, cross-household leakage tests pass | `tests_pass`, one per boundary | Auto |
| AE-6 | Privilege escalation and self-role-edit are covered | `tests_pass` | Auto |

**AE-1 must be a static property, not a sampled test.** [`05`](./05-command-enforcement-census.md) §5
shows why: a static census over ten gate families cannot establish coverage, so "we checked the
routes we thought of" is not evidence. The criterion is met when an undeclared route *fails a check*,
which makes coverage structural.

**AE-3 is satisfiable two ways** — make RLS agree, or state that RLS is not an authority layer (D4,
`02-canonical-access-identity-model.md:662-665`). With 94% of the privileged surface on the
service-role client, the second is the honest near-term answer. The criterion fails only if neither
is done.

### 3.5 Audit

| ID | Criterion | Evidence | Mode |
|---|---|---|---|
| AD-1 | Audit events exist for consequential access changes | `tests_pass` per mutation class | Auto |
| AD-2 | Audit records actor, timestamp, subject, and before/after | `tests_pass` | Auto |
| AD-3 | Audit is append-only | `tests_pass`: UPDATE/DELETE rejected | Auto |
| AD-4 | A failed audit write rejects the mutation | `tests_pass`: forced failure rolls back | Auto |
| AD-5 | Change history is viewable per role and org-wide | `qa_evidence` | Auto |

## 4. How the Director applies this

1. **Rejection gates first** (§2). Any true → fail; do not score criteria.
2. **Auto criteria** for the phase's scope → the acceptance runtime decides.
3. **Review criteria** → surfaced to the operator with the evidence attached. Never auto-passed.
4. **A phase is accepted** when its rejection gates are clear, its Auto criteria are `met`, and the
   operator has signed off every `operator_review`.

**Scope per phase, not the whole rubric.** A phase declares which IDs it claims; unclaimed criteria
are not evaluated. Nothing here should be read as "every phase must satisfy all forty."

### 4.1 What this repairs

Every criterion above has a non-null evidence type and states a condition that can be false. Applied
to this mission's own AC1 — *"…is complete with evidence"*, `evidenceType: null` — the defect is
plain: nothing can make it false, and no checker can read it. Future phases of this mission should
draw their acceptance criteria from §3 rather than generating them from the phase title.

## 5. Limits

- **The rubric is untested.** No criterion here has been run through `acceptance.mjs`. Evidence-type
  bindings are read from the checker source, not exercised; some will need adjustment when a real
  phase declares them.
- **Auto/Review is a judgment.** Several Auto rows assume tests that do not exist yet. Marking a
  criterion Auto asserts it is *machine-decidable in principle*, not that the test is written.
- **Coverage claims inherit [`05`](./05-command-enforcement-census.md) §5's limits.** AE-1 in
  particular is only as good as the static check that backs it.
- **Not a security review.** §3.4 restates the brief's requirements; it does not constitute a threat
  model. Required output #7 remains partial — see
  [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md) §3.
- **Weighting is absent.** All criteria are pass/fail with no severity ranking; the Director cannot
  currently accept a phase with a minor criterion unmet. Whether that is right is a decision.

## 6. Provenance

- **Evidence vocabulary** read from `scripts/local-dev/lib/vacilando/acceptance.mjs:1-20, 95-160`.
- **Criteria and rejection conditions** derived from brief `msn_2d054741a54698fa4c` (`brief.objective`).
- **Inputs:** [`04-authentication-model.md`](./04-authentication-model.md),
  [`05-command-enforcement-census.md`](./05-command-enforcement-census.md),
  [`06-product-ia-and-flows.md`](./06-product-ia-and-flows.md),
  `02-canonical-access-identity-model.md` (D4).
- **No source, schema, migration, or UI changed by this phase.**
