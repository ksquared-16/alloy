---
owner: platform
status: sprint
last_reviewed: 2026-09-04
supersedes: []
---

# 09 — Deployed managed browser sessions

> **Capability deliverable.** The Staging Reality Check could not begin because
> `https://staging.workwithalloy.com` could not be authenticated as
> `qa-slot1-product@example.com` through the managed path. Session minting existed, and it was
> loopback-only by construction. This records what was built, what is proven, and what is not.

## 1. Why it was blocked

The managed session path had one destination class: a numbered slot on loopback.

- `validateBrowserAuthRequest` derived a base URL from a slot port and **refused a non-loopback base**.
- `vac-qa-session-mint.mjs` wrote its cookies for the fixed pair `["localhost", "127.0.0.1"]`.
- The verifier, `alloy-agent-verify <slot> authenticated-home`, resolved a port and required a
  toolkit-owned local server.

Each of those is correct for a slot. Together they mean a deployed host is not merely unsupported —
it is unrepresentable. There was no field in which to say "staging", and that is the right kind of
failure to have had.

## 2. What was built

A **second destination class**, not a relaxed first one. The loopback validator is untouched and
still refuses a non-loopback base; a deployed request cannot produce a slot's shape and a slot
request cannot produce a deployed one.

| Piece | Owner | What it decides |
|---|---|---|
| `deployed-target-registry.mjs` | canonical target table | base URL, host, QA identity, env pointer, storage key |
| `validateDeployedBrowserAuthRequest` | `browser-auth.mjs` | the deployed class, beside the untouched local one |
| `assertStorageMatchesDestination` | `browser-auth.mjs` | neither class may be satisfied by the other's storage |
| `--cookie-domain` | `vac-qa-session-mint.mjs` | one paired widening: base and cookie domain must agree |
| `supabaseProjectRef` | `/api/build-info` | lets a deployment state its own project, non-secret |
| `environment.restore_deployed_qa_session` | governed action | the canonical managed path to all of the above |

**A caller supplies one registry key.** Base URL, host, cookie domain, Supabase project, expected
identity, storage path and the credential pointer are all resolved from the registry. Every other
field is refused **by name**, so a caller that tries learns the boundary instead of quietly getting a
different session than it asked for. Production is absent from the table by construction.

## 3. The control that matters most

Before anything is minted, the credentials must be **proven** to back the deployment being
authenticated:

- the trusted env source's `NEXT_PUBLIC_SUPABASE_URL` project ref, and
- the ref the deployment reports from its own `/api/build-info`

must **both be observed** and must match. An unmeasured match is not a match: a deployment that
reports no project, or an env source that names none, is a refusal rather than a pass. The refusal
carries no values — which project a host runs is not this action's to disclose on the way out.

This is what makes the env-source fallback safe. The target names a *pointer*
(`ALLOY_STAGING_ENV_SOURCE`); when it is unset the canonical host env source is used, and the gate
is what turns that from a guess into a checked fact.

## 4. What is proven

**Six gates, measured, not asserted** — collected through `collectDirectorEvidence`, so the Director
sees them rather than "unmeasured":

```
deployed_target_registered       true
deployed_base_is_https           true
trusted_env_source_readable      true
deployment_states_its_project    true
project_backing_proven           true
storage_destination_is_deployed  true
```

**23 governance controls pass**, including both substitution directions, wrong identity, absent
identity, unproven project, project mismatch, missing grant, and a grant that does not authorize
this action. Every case that could reach privileged work drives a mint that *records whether it was
called*: a test that only inspected the returned status would pass equally well against an
implementation that minted first and reported a failure afterwards.

**A live negative control against the real deployment.** `https://staging.workwithalloy.com/workspace`
with an empty storage state redirects to `/login` and reports no identity, and the deployed verifier
refuses it. The deployed base is reachable, real routes are driven, and an absent session fails
closed on the actual host.

## 5. What is NOT proven

**The positive case.** No session has yet been minted on `staging.workwithalloy.com`, because
minting one requires the governed action to be promoted, installed, and approved by the operator.
The capability is complete and the path is open; it has not been walked.

Two things gate it, in order:

1. **Promotion and installation.** The target model, destination class and target-scoped mint are in
   promoted staging. The governed action is not yet.
2. **Operator approval.** The action is operator-owned and deliberately **never standing-eligible** —
   the local sibling authenticates loopback on this machine, this one authenticates a public host.
   There is no configuration under which it runs unattended.

Until a session is minted and verified against that host, the honest verdict is
**DEPLOYED MANAGED BROWSER SESSION — NOT YET CERTIFIED**, and the Staging Reality Check remains
blocked on the approval rather than on the capability.

## 6. Two defects this work surfaced

- **`host.install_toolkit` and `lane.dispatch_measurement_instruction` had no default governed mode.**
  Both worked only because every payload set `requested_mode` explicitly. The first caller to omit it
  would have seen `policy_denied` — which reads as the operator forbidding the action rather than
  nobody having assigned it one. Fixed.
- **Two of the new controls were vacuous when written.** `projectRefFromSupabaseUrl` requires a
  16–32 character ref, so 12-character fixtures parsed to `null` on both sides and
  *"unmeasured fails closed"* passed without ever exercising a measured match. Corrected, and the
  measurable side is now asserted before the unmeasured one is tested.
