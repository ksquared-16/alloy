# Commands P4.S1 — Destructive and Replacement Command Foundation

| Field | Value |
|-------|-------|
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slice | P4.S1 Destructive and Replacement Command Foundation |
| Date | 2026-07-27 |
| Branch | `agent/cursor/1-commands-system-inventory` |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-commands-system-inventory` |

## Outcome

Alloy can represent and prepare a destructive or replacement Command under one safety contract:

```text
Capability → destructive/replacement policy → authoritative preview → impact summary
→ confirmation requirement → permission-class check → preview correlation → commit eligibility
```

**Production destructive execution through the Command Runtime remains disabled.**

## Boundary (P4.S1)

| Enabled | Disabled |
|---------|----------|
| Destructive preview framework (contract + fixtures) | Destructive commit through Command Runtime |
| Policy classification + preparation projection | Delete Lead facade cutover |
| HMAC preview correlation | Make Primary Contact facade cutover |
| Permission-class seam (fail-closed) | Cancel Tour / withdraw / archive facade cutover |
| Adapter interface + test fixtures | Schema / migrations / new APIs / UI |

## Policy contract

Module: `web/lib/platform/commands/runtime/destructive/`

| Impact class | Meaning |
|--------------|---------|
| delete / archive / deactivate / remove / revoke / cancel / withdraw / end / void | Destructive — remove, end, invalidate, or revoke state |
| **replace** | Replacement — promote/assign while displacing another designation |

Confirmation: `confirm` | `strong_confirm` | `typed_confirm` (never `none`).

Permission classes: `standard_destructive` | `sensitive_destructive` | `replacement` |
`financial_destructive` | `access_destructive` — server-owned; client cannot select.

Recovery: `restore` | `recreate` | `schedule_new` | `manual_support` | `none` (explicit).

## Representative classifications

| Capability | Impact | Reversibility | Confirm | Permission | Recovery | Owner | Facade commit |
|------------|--------|---------------|---------|------------|----------|-------|---------------|
| `delete_lead` | delete | irreversible | typed_confirm | sensitive_destructive | none | admin_action | false |
| `archive_lead` | archive | reversible | strong_confirm | standard_destructive | restore | none (stub) | false |
| `make_primary_contact` | **replace** | conditionally_reversible | strong_confirm | replacement | restore | admin_action | false |
| `cancel_tour` | cancel | conditionally_reversible | strong_confirm | standard_destructive | schedule_new | tour_domain | false |
| `withdraw_child` | withdraw | conditionally_reversible | strong_confirm | sensitive_destructive | manual_support | none (stub) | false |

## Preview correlation strategy

- Server-generated `previewId` + HMAC-SHA256 token (Node `crypto`, same primitive family as Twilio webhook verification)
- Compact claims only (capability, subject, org, impact class, confirmation, version, exp) — **no full impact payload**
- Freshness: TTL and/or `version_match`; domain revalidation still required at future commit
- Token is **not** an idempotency key; no DB token store in P4.S1
- Secret: `COMMAND_DESTRUCTIVE_PREVIEW_SECRET` or `INTERNAL_CRON_TOKEN` (required in production)

## Execution gating

- `DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED = false`
- `executeCommandInvocation` refuses execute for classified keys with `commit_globally_disabled`
- `isCommandRuntimeFacadeExecutionSupported` returns false for classified keys while commit disabled
- Normal adapters (RegisteredAction / Mutation / Relationship) refuse destructive-classified capabilities

## Side-effect safety

- Shared destructive module has no domain write imports
- Fixture `preview` is read-only; fixture `commit` always returns `commit_disabled`
- Existing Delete / Archive / Tour cancel / primary-contact / withdraw production paths unchanged

## Tests

| Suite | Result |
|-------|--------|
| `destructiveCommandFoundation.test.ts` + P0–P3 command suites (11 files) | **141 passed** |
| `npm run typecheck` (`tsconfig.build.json`) | **passed** |
| `npm run typecheck:tests` | Contended by concurrent machine `tsc`; Vitest import graph green |

Focused: `web/tests/platform/commands/destructiveCommandFoundation.test.ts` (+ P0–P3 regressions)

## Remaining destructive capabilities

| Key | Facade commit |
|-----|---------------|
| `archive_lead` | disabled |
| `cancel_tour` | disabled |
| `withdraw_child` | disabled |

---

# P4.S2 — Make Primary Contact Replacement Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Capability | `make_primary_contact` |
| Impact | `replace` |
| Commit | **Enabled** (exact allowlist only) |
| Domain authority | `setHouseholdPrimaryContactForCustomer` |
| Event | `household.primary_contact_changed` |
| Direct API | PATCH `/api/admin/customers/:id/household-primary-contact` **unchanged** (Option A) |

## Preview

- Selected person promoted; current primary demoted (or “no current primary”)
- Opportunity projection count (all opportunities for customer — same filter as write)
- Non-effects: prior contact remains linked; no guardian/pickup/billing/membership change claimed
- Fingerprint: `customer|selected|current|oppHash|count` via HMAC preview token + version_match
- Already-primary → blocker; commit blocked (no duplicate event)

## Commit

- Requires `confirmation.confirmed === true` + valid preview token
- Re-reads domain state; rejects stale version
- Exactly once: adapter → `setHouseholdPrimaryContactForCustomer` → emit event
- Never `executeRelationshipAction`

## Permission transition

```text
Current floor: requireAdminOrOps
Future class: replacement (seam only; no new org permission keys)
```

---

# P4.S3 — Delete Lead Destructive Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Capability | `delete_lead` |
| Impact | `delete` (hard delete) |
| Subject grain | Opportunity |
| Final executor | `executeDeleteOpportunityLead` → `executeOpportunityLeadDeletionGraph` |
| Preview adapter | `web/lib/platform/commands/runtime/adapters/deleteLeadAdapter.ts` (`previewDeleteLeadViaAdapter`) |
| Commit adapter | same file (`commitDeleteLeadViaAdapter`) |
| Commit | **Enabled** (exact allowlist with `make_primary_contact`) |
| Direct API | POST `/api/admin/opportunities/:id/delete` **unchanged** (Option A) |
| Preview API | GET `/api/admin/opportunities/:id/delete-preview` remains |
| Auth floor | `requireAdminOrOps` on actions/execute + direct delete; future class `sensitive_destructive` |

## Current Delete Lead behavior table (proven)

| Concern | Current behavior |
|---------|------------------|
| Subject grain | Opportunity (`opportunities.id`) |
| Final executor | `executeDeleteOpportunityLead` → graph hard-delete |
| Hard/soft | **Hard delete** (not soft-delete/archive/tombstone) |
| Opportunity record | Deleted |
| Customer/person identity | Conditionally deleted only when unreferenced; otherwise retained |
| Opportunity members (OCM) | Deleted with opportunity |
| Relationships | Opportunity-scoped links removed with graph; retained persons keep other links |
| Work unit | **Not deleted** (explicit domain comment) |
| Communications | Opportunity-scoped threads/messages/scheduled sends deleted |
| Tours / placements | Placement candidates (+ related tour graph per domain) deleted |
| Documents / form submissions / tasks / field values | Opportunity-scoped deleted |
| Scheduling | No general schedules table wipe beyond tour/placement graph |
| Events | Opportunity/entity `workflow_events` (+ related runs/outbox) deleted — not a new emit |
| Audit/history | `logAdminAudit` console entry; no restore ledger |
| Projections | No separate Command Runtime refresh; domain/route behavior unchanged |
| Recovery | **none** |
| Authorization | admin/ops floor |
| Confirmation (facade) | typed_confirm (strengthened vs direct API) |
| Response (facade) | destructive envelope + `delete_lead_result` counts |

## Typed confirmation

Server-derived: `opportunity_name` truncated to 64 chars, else `DELETE`. Visible in preview; client cannot choose the required value; BOS/API/automation cannot bypass.

## Fingerprint / stale preview

Token version: `opp:{id}|blocked:{0\|1}|impact:{sha256(will_delete+will_retain)[:32]}`. Commit re-previews domain, recomputes version, validates HMAC claims. TTL alone insufficient. Material impact change → `stale_preview`.

## Exactly-once

One facade commit → one adapter → one `executeDeleteOpportunityLead` → zero Relationship/Mutation/RegisteredAction fallback. Adapter does not import deletion graph DB helpers or re-emit audit/events.

## Behavior-parity matrix

| Concern | Direct POST delete | Facade path | Notes |
|---------|-------------------|-------------|-------|
| Authorization | requireAdminOrOps | same floor + server permission class | preserved |
| Lead lookup | org-scoped opportunity | same domain preview | preserved |
| Work-unit handling | not deleted | same | preserved |
| Dependent cleanup | deletion graph | same executor | preserved |
| Person/customer retention | conditional orphans | same | preserved |
| Events | workflow_events deleted | same | preserved |
| Audit | logAdminAudit | same | preserved |
| Projections | unchanged | unchanged | preserved |
| Response | delete counts | compatible + envelope | preserved |
| Confirmation | route-level (no typed token) | preview + typed + token | **intentionally strengthened** |

## Tests (2026-07-27)

P0–P4.S3 focused + delete domain: **14 files / 173 passed**. Production `npm run typecheck`: **pass**. `typecheck:tests`: deferred (machine pressure; doctrine optional for this slice).

## Remaining destructive (commit disabled)

`archive_lead`, `cancel_tour`, `withdraw_child`.
