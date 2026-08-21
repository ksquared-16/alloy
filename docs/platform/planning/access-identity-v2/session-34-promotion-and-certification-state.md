---
owner: platform
status: sprint
last_reviewed: 2026-08-21
supersedes: []
---

# Operator UX tranche — promoted to staging, and exactly what is and is not certified

**Staging SHA `16658ab094bffdc34ac3ababbf1752bdaf8296d4`** — the merge commit of
[PR #483](https://github.com/ksquared-16/alloy/pull/483), merged 2026-08-21T19:37:30Z via governed
action `gar_0a570a9ce30050`.

## The merge is real, and here is the proof that does not depend on any notification

The completion notification for `gar_0a570a9ce30050` carried a **census** payload
(`census_run_at`, `org_count`, `question_ids`, all null) and instructed *"Do not retry the census
from this lane"* — for a `repository.merge_pull_request` action. The payload was wrong. The action
underneath it was not. Four independent sources agree:

| Source | Evidence |
|---|---|
| Staging content | all six product-state checks pass (below) |
| GitHub API | PR #483 `state=MERGED`, `mergedAt=2026-08-21T19:37:30Z`, `mergeCommit=16658ab09` |
| Git ancestry | `d5d0be8ae` (the approved `expected_head_sha`) is an ancestor of `origin/staging` |
| Independent watch | a background poller keyed on file content fired on its own |

### The six product-state checks

| # | Criterion | Result |
|---|---|---|
| 1 | `web/lib/access/operatorAccountName.ts` present | **PASS** |
| 2 | `web/lib/access/inviteLocationAccess.ts` present | **PASS** |
| 3 | `web/lib/access/capabilityTaxonomy.ts` present | **PASS** |
| 4 | `AccessScopesPage.tsx` **absent** | **PASS** |
| 5 | `ACCESS_WORKSPACE_CHAPTERS` = `["users","roles","security"]` | **PASS** |
| 6 | leading-icon CSS present **and** the grouped focus rule intact | **PASS** |

Check 4 is the load-bearing one: a merge cannot leave behind a file the change deletes. Check 6 was
verified structurally, not by string presence — `.config-runtime-select:focus,` and
`.config-runtime-input:focus` share the outline rule on staging, and the padding rule stands alone.

## `application.certify_staging` — neither an intentional removal nor a regression

The instruction asked which it was. It is **neither: the key was never registered.**

- A single authoritative request returned **`unsupported_action_key`**. The registry's own
  `classifyActionAvailability` distinguishes `director_registry_stale` (on disk, not loaded — the
  regression signature) from `unsupported_action_key` (neither). It returned the latter.
- `ACTION_TYPES` in `trusted-host-action-registry.mjs` is a frozen three-key object:
  `database.read_census`, `repository.merge_pull_request`, `database.apply_migration`.
- `git log --all -S "certify_staging"` across the whole repository returns **exactly one commit** —
  `f06e6b3c3`, this lane's own Access documentation. The string has never appeared in Vacilando
  source.
- `director-capabilities.json` reports `state: "current"` with `loaded_fingerprint ==
  disk_fingerprint`, so the registry is coherent with disk. Nothing is stale.

**The consequence deserves the Gateway lane's attention.** `gar_1bcb1fcda29235` was accepted,
marked `complete`, and produced `tha_9f2937526a6719` for this action key on 2026-08-20 — and
`f06e6b3c3` recorded a "16 passed / 0 failed / 1 skipped" staging certification on the strength of
it. A governed action key the registry cannot support was accepted and reported complete. That is
the same family of defect as the false merge notification, and it means **the prior staging
certification rests on a capability that does not exist in the registry.**

Recorded, not repaired — see [`vacilando-run-state-discrepancy.md`](vacilando-run-state-discrepancy.md).

## Why no worker-side fallback was run

The instruction permits a read-only fallback only if it is already sanctioned **and** does not
expose staging credentials or session material to this lane. The second condition fails:

- This worktree's only environment file is `web/.env.certification.local`, pointing at the **local**
  cert Supabase (`http://127.0.0.1:54421`). There is no staging URL, operator, or session anywhere
  in the lane.
- The prior staging certification was executed **on the trusted host** (`tha_9f2937526a6719`); this
  lane only read the result artifact. Staging certification has always been a trusted-host
  operation precisely because it needs an authenticated staging session.

Running Playwright against staging would therefore require *acquiring* staging credentials into
this lane. That is the thing the constraint forbids, so it was not done.

## What IS established about the promoted code

**Artifact-level, verified directly against staging `16658ab09`:**

| Criterion | Evidence on staging |
|---|---|
| Human-readable account identity + nameless fallback | `identityHeadline`/`identitySubtitle` pair present; "No name on file" rendered in two places |
| Users / Role & Access / Security IA | `type AccessUserTab = "overview" \| "access" \| "security"` |
| Inline location access at invite | `access-invite-location-access` control present |
| Retired Access Scopes alias | `RETIRED_ACCESS_CHAPTERS` maps `scopes → "users"` |
| No top-level Access Scopes chapter | chapter list is three entries |
| Role creation without a technical key | `roleKeyFromName.ts` present |
| Role matrix / taxonomy | `buildCapabilityMatrix` present |
| Shared focus/leading-icon behaviour | grouped focus rule intact; padding rule standalone |

**Behavioural, on byte-identical code:** the Access surface files on staging are byte-for-byte
identical to the tree that passed 840 unit tests, 11 browser assertions (1 honest skip), and full
CI on `d5d0be8ae`.

## What is NOT certified, stated plainly

**No browser certification has been run against the staging runtime.** Artifact identity is not
runtime behaviour: it does not exercise staging's data, authentication, or rendering. The following
remain **UNCERTIFIED on staging** until a trusted-host certification capability exists:

named account rendering · nameless-account fallback · user search by name/email · Users rail
identity presentation · Overview role/location/account summary · Role & Access · inline location
selection · `?section=scopes` alias resolution · role matrix behaviour · role creation flow ·
compact Overview · Security · keyboard/focus behaviour.

**Department-restriction disclosure: UNPROVEN.** Two independent reasons, and neither is fixable
from here: this lane cannot read staging data to learn whether a representative restricted fixture
exists, and no fixture may be manufactured during read-only certification. The local run skipped
this criterion for exactly the same reason.

## A&I V2 plan reconciliation

The plan carries **62 workstreams** and four open decisions (`D1`–`D4`).

**Delivered and now on staging** (this tranche and its predecessor, PRs #475/#479/#483): the
four-layer authority model, the capability taxonomy and matrix, keyless role creation, the one-page
role editor, operator identity, user-centric location access, the retired Access Scopes chapter,
the reconciled user IA, and the shared focus-ring correction.

**Open and decision-gated:**

| Item | Gate |
|---|---|
| `D2` / `I-10` — one role or many | **Decision returned** — see [`d2-i10-role-composition-decision.md`](d2-i10-role-composition-decision.md). Not implemented. |
| `W-17` — multi-role write path | Blocked on `D2` |
| `W-13` — portal admission as capability | Ships behaviour-preserving; the rest needs `D2` |
| `W-18` — delegation ceiling | Needs `D3` |
| `W-19` — RLS position | Needs `D4`; size differs by an order of magnitude between its two answers |
| `OD-3` — 36 of 57 catalog keys | Operator decision; `RL-35` cannot go green until it lands |
| Staging browser certification | Blocked on a trusted-host certification capability that is not registered |

The single largest unblocked item remains `OD-3`: 36 of 57 grantable keys are consulted by nothing,
and `W-50` currently holds the honest half of that (an inert key must not render as a live control)
while `RL-35` waits.
