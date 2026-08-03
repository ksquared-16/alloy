---
owner: platform
status: active
last_reviewed: 2026-07-27
package: F5-requiredness
---

# Round 5 — Requiredness realignment + command-contract note

## Durable Location ownership (accepted)

Code-owned Create Lead minimum:

- parent/guardian first name
- parent/guardian last name
- phone or email

Location (and other org fields) are required **only** when the resolved `ActionIntakeSpec` lists them as explicit `record_creation` / required intake fields.

## Command-contract change (not BOS-only)

Registered `create_lead` eligibility now resolves department intake via:

`resolveCreateLeadEligibilityForInvocation`
→ `resolveCreateLeadActionIntakeSpec`
→ `createLeadConfigRequiredInputsFromIntakeSpec`
→ `buildCreateLeadEligibility`

`runRegisteredAction` already gates execute on `resolveEligibility`, so explicit `record_creation` requirements are enforced on **server preflight/execute**, not only in the BOS client.

Contract available to the executor: `invocation.context.department_id` (+ org id). Stage remains temporary `"lead"`. **No BOS process resolver.**

If `department_id` is omitted, only the code-owned minimum applies (documented). BOS and modal always supply department.

## Removed

- BOS-only Location blocker in `deriveCreateLeadBlockers`
- `location_id` from `CREATE_LEAD_REQUIRED_INPUTS`
- `location_id` from `CREATE_LEAD_PLATFORM_REQUIRED_KEYS` / platform gather minimum
- Synthetic Placement Form section ownership

## Firefly Early Learning — Location `record_creation` verification

**Status: not verified against live Firefly tenant from this worktree.**

| Attempt | Result |
|---|---|
| Supabase MCP project `vslwnntzzgpnmrpjipat` | No Firefly org / org id `93667019-…` present |
| App env points at `ikaxilmwmrmbagoidedu` | Different project than MCP-linked Alloy DB |
| Authenticated `GET /api/admin/lifecycle/action-intake-spec` | Requires operator session (blocked on login) |

**Do not silently alter configuration.** When Kelly is signed in on `:3012`, verify:

1. Firefly enrollment department id  
2. `action-intake-spec?action_key=create_lead&department_id=…&stage_key=lead`  
3. Whether `location_id` / `opportunity:location` appears in `spec.required`  
4. Stored rule timing includes `record_creation` in department metadata (`lifecycle_builder_stage_field_rules_v1` / progression requirements)

If Location is missing from required while product expects it, correct via the normal Business Process / stage field-rules UI — not a code shortcut.

## Tests

- `tests/platform/commands/createLeadRequirednessParity.test.ts`
- `tests/bos/commandSession/createLeadEntityFormParity.test.ts`
