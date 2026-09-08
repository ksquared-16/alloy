---
owner: platform
status: shipped
last_reviewed: 2026-09-03
---

# Standing Authorization

**Why the operator was asked 182 times in 200 requests, and what changed.**

## The measurement

Taken from the Gateway's own request log
(`~/.local/state/alloy-dev/gateway/vacilando/governed-actions/requests.json`),
200 governed requests over roughly 17 hours. No sampling, no estimation.

| | Count | Share |
|---|---|---|
| Governed requests | 200 | — |
| Required an operator click | **182** | 91.0% |
| Of those, a repeat of an already-approved (lane, capability) pair | **153** | 84.1% of asks |
| Distinct (lane, capability) pairs behind those 153 | **20** | — |

The authorization store held **303 grants: 300 `CONSUMED`, 0 standing.** The
policy path `existing_mission_authorization` — the branch that lets an approval
cover a later request — fired **4 times in 200**.

## The root cause

It was not policy. Nobody decided the operator should confirm the same lane
pushing the same branch fifty times.

The authorization model **already had** the mechanism:
`AUTHORIZATION_CLASSES.MISSION_STANDING`, and a declared
`SUBJECT_SCOPES.ANY_WITHIN_MISSION` that `findAuthorization` honours as an
`explicit_wildcard`. Two things kept it unreachable:

1. **Nothing ever minted one.** Every approval called
   `grantExactRequestAuthorization`, bound to a single content fingerprint. The
   next identical operation had a different fingerprint and so asked again.
2. **Half the requests had no scope to inherit through.**
   `grantMissionAuthorization` refuses a null `missionId`, and about half the
   sample carried no `mission_id` at all. Those requests could not have
   inherited authority even if a standing grant had existed.

This was a routing gap, not a policy position.

## What changed

`STANDING_ELIGIBLE_ACTIONS` in `lib/vacilando/trusted-host-authz.mjs` names
three capabilities. On operator approval of one of them, the mint site in
`lib/vacilando/governed-action-request.mjs` also issues a standing grant with an
explicitly declared `subject_scope`.

| Capability | Why it is eligible |
|---|---|
| `repository.push` | The capability already refuses protected refs, force, deletion and multi-ref pushes, and refuses a repository that is not allowlisted. What is left is a lane pushing its own feature branch. |
| `promotion.open_pr` | Opens a pull request. Merges nothing, writes no protected ref, undone by closing it. |
| `environment.restore_qa_session` | A local browser session on this host, lane-scoped, no external effect. |

Everything else stays gated. These were asked repeatedly too; **volume is not an
argument against a boundary**:

| Capability | Why it stays gated |
|---|---|
| `repository.merge_pull_request` | Promotion authority into staging. A standing grant would cover a head SHA nobody reviewed. |
| `database.apply_migration` | Production mutation. |
| `database.read_census` | Reads `alloy_deployed_primary`, which `AUTHZ_OPERATOR_ONLY_ENVIRONMENTS` says a derived authority may **never** cover. Read-only is not the same as inside the boundary. |
| `repository.delete_remote_branch` | Destructive. |
| `environment.assign_qa_identity_access` | Identity and access. |
| `repository.close_pull_request` | Not measured often enough to justify widening anything. |

## How it stays bounded

- **Scoped to the lane.** Not the mission, and not the repository. The first
  implementation reused the ordinary scope resolver, which falls back to
  `authority.repository_id` — and a certification caught a *fresh* lane
  auto-executing a push because a sibling lane on the same repository had been
  approved once. A repository is a shared resource, not an owner.
- **Every declared dimension must match.** Capability, repository, environment
  and scope. Declared-but-different is a non-match, never a shrug.
- **Absence is never a wildcard.** A grant with no subject binding and no
  declared `subject_scope` classifies as `legacy_unbound` and matches nothing.
- **Operator-only environments defeat eligibility outright**, whatever the
  capability.
- **It expires** (14 days), it is **revocable**, and it is **auditable** — every
  grant records who granted it, when, from which decision.
- **It cannot widen itself.** A standing grant authorises only the capability it
  names; there is no path from holding one to minting another.

## The result

Measured by replaying the same 200-request log in chronological order through
the real resolvers — each request offered to `findAuthorization` exactly as the
policy path offers it, each approval minting exactly what the mint site mints.

| | Operator asked | Share of all requests |
|---|---|---|
| **BEFORE** | 182 | 91.0% |
| **AFTER** | 87 | 43.5% |
| **Removed** | **95 interruptions** | **52.2% of asks** |

Removed, by capability: `repository.push` 53, `promotion.open_pr` 31,
`environment.restore_qa_session` 11.

Still asked: `repository.merge_pull_request` 50, `database.read_census` 17,
`database.apply_migration` 4, `repository.delete_remote_branch` 3,
`repository.close_pull_request` 2, `environment.assign_qa_identity_access` 1,
plus 10 first-asks — the one approval that establishes each lane's standing
scope.

Lane scoping costs 4 asks against a repository-scoped version of the same
change. That is the correct trade, and it is the whole reason the certification
exists.

## Certification

`tests/development-standing-authorization.test.mjs` — 9 fixtures, both
directions. The negative cases matter more than the positive one: a reduction in
asks that also reduced the boundaries would not be an improvement. Two mutations
are proven to fail it: adding `repository.merge_pull_request` to the allowlist,
and treating the operator-only environment check as a shrug.

## Re-measured, September 2026

Not assumed to have landed. The same replay was run again against the CURRENT
Gateway request log — a different 200-request window from the one above — with
each request offered to the real resolvers in chronological order.

| | Operator asked | Share of all requests |
|---|---|---|
| **BEFORE** (the log's own record of operator decisions) | 173 | 86.5% |
| **AFTER** (replayed with standing authority) | 81 | 40.5% |
| **Removed** | **92 interruptions** | **53.2% of asks** |

Removed, by capability: `repository.push` 51, `promotion.open_pr` 30,
`environment.restore_qa_session` 11.

Still asked: `repository.merge_pull_request` 50, `database.read_census` 17,
`database.apply_migration` 3, `repository.close_pull_request` 1,
`environment.assign_qa_identity_access` 1, plus 9 first-asks across the three
eligible capabilities — the one approval that establishes each lane's standing
scope.

This reproduces the original result (95 removed, 52.2%) on data it has never
seen. `tests/development-standing-authorization.test.mjs` passes 9/9.

### The categories that were asked about, answered directly

| Category | What actually happens |
|---|---|
| Lane-owned branch pushes | Standing after the first approval — 51 interruptions removed in this window |
| QA / browser restoration | Standing after the first approval — 11 removed |
| Opening a pull request | Standing after the first approval — 30 removed |
| Read-only DB census | **Still asked, deliberately.** It reads `alloy_deployed_primary`, and `AUTHZ_OPERATOR_ONLY_ENVIRONMENTS` says a derived authority may never cover it. Read-only is not the same as inside the trust boundary |
| Repeated same capability in one lane | This is precisely what standing authority removes — 84.1% of the original asks were repeats of an already-approved (lane, capability) pair |
| Local environment operations, tests, server lifecycle, repository inspection | **Never governed at all.** The registry holds twelve action types and none of these is among them, so they have never produced an operator interruption. There was nothing to reduce |

The remaining volume is dominated by `repository.merge_pull_request` (50) and
`database.read_census` (17) — promotion authority and a production-boundary
read. Both stay gated. **Volume is not an argument against a boundary.**
