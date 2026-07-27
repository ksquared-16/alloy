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

## Deferred cutovers

- Delete Lead Runtime wrap
- Archive Lead implementation
- Make Primary Contact adapter + domain preview
- Cancel Tour Runtime confirm/preview
- Withdraw Child
- Remove / Revoke relationship Commands
- Organization permission-product mapping for permission classes

## Confirmation

```text
P4.S1 safety foundation only
No production destructive execution cutover
No Delete Lead exposure
No make-primary cutover
No Tour cancellation cutover
No schema or API change
No operator behavior change
```
