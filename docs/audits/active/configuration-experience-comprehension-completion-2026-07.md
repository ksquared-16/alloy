---
owner: product-platform
status: complete
last_reviewed: 2026-07-17
concept: configuration-experience-comprehension-completion
supersedes: []
---

# Configuration Experience Comprehension Completion

**Completion date:** 2026-07-17
**Validation surface:** Programs, Configuration Consumer #1
**Architecture:** frozen and unchanged
**Product conclusion:** **Configuration Experience Runtime complete**

## Executive result

A first-time operator can now answer, without documentation:

1. Programs are reusable service definitions owned by the Organization.
2. The Organization creates a draft and publishes an immutable revision.
3. Locations consume assigned revisions while retaining local availability,
   resources, evidence, and schedule ownership.
4. Collection rows and summaries explain published, changed/draft, assigned,
   readiness, and Attention posture.
5. Overview explains purpose and ownership before presenting active revision,
   working draft, assignments, definition, Attention, and readiness.
6. Empty and unavailable states explain what Programs are and what happens next.
7. Database, PostgREST, schema-cache, and internal provider language never
   appears in the operator experience.

The work strengthens the existing Configuration Experience Runtime. It does not
change publication, assignment, inheritance, routing, or domain architecture.

## Runtime enhancement inventory

| Capability | Runtime enhancement | Future-domain input |
|---|---|---|
| Domain empty state | Teaches definition, purpose, examples, setup flow, status, and next action | Domain nouns, examples, ownership consequence, steps |
| Runtime notice | Classifies uninitialized, platform update required, denied, unavailable, and failed-action states | Domain label only |
| Engineering diagnostics | Logs technical error server-side and exposes only a short reference to operators | None |
| Collection comprehension | Adds domain description and published, changed/draft, assigned, and Attention rollup | Structured item posture |
| Collection zero state | Removes misleading “no match” copy when the Collection itself is empty | None |
| Overview orientation | Places purpose and ownership before revision, draft, assignment, summary, Attention, and readiness | Domain purpose and ownership copy |
| Consumer guidance | Empty Organization consumer state explains why Locations are required | None |

No generic payload store, schema migration, sibling shell, route, or new
publication infrastructure was introduced.

## Programs adapter changes

Programs supplies only:

- the definition: reusable Organization service definitions;
- examples: Preschool, After-school care, Summer camp;
- the three-step flow: draft, publish, assign;
- the ownership consequence between Organization and Locations;
- structured evidence indicating whether a published revision and durable
  assignment exist.

The empty-state composition, notice presentation, error classification,
collection rollup, and Overview orientation remain generic Runtime capabilities.

## Engineering error presentation

The live environment currently lacks the Programs publication tables. Previously
the operator saw:

`Could not find the table 'public.programs' in the schema cache`

The same live route now shows:

- **Programs setup is not complete**
- “This Configuration area has not been initialized in this environment.”
- an administrator next step;
- an engineering reference.

The raw message remains in server diagnostics. It is not returned as visible
operator copy.

Classification:

| Condition | Operator posture |
|---|---|
| Missing table / uninitialized domain | Setup is not complete |
| Missing column/function / incomplete migration | Platform update required |
| Permission failure | Not available to current role |
| Connection, timeout, or service failure | Temporarily unavailable |
| Domain action rejection | Friendly action-specific consequence |

## Browser walkthrough

Evidence:

`docs/audits/evidence/configuration-runtime-completion/`

1. `00-organization-landing.png` — authenticated Organization context before the
   first Program is created.
2. `01a-programs-not-initialized.png` — deterministic unavailable-domain state
   proves Runtime notice, purpose, examples, setup flow, and no raw diagnostics.
3. `01c-live-programs-load.png` — live authenticated environment proves the
   actual missing-table condition now renders operator-safe setup guidance.
4. `01-programs-landing.png` — empty Programs Collection explains what Programs
   are, why Locations consume them, common examples, the setup sequence, and the
   recommended first action.
5. `02-program-detail-draft.png` — first creation enters intentional authoring;
   the Collection already explains draft, assignment, readiness, and Attention.
6. `03-published-revision.png` — read-first Overview leads with Program purpose
   and ownership, then active revision, matching draft, assignment, definition,
   Attention, and readiness.
7. `04-location-assignment-selection.png` — durable assignment identity is
   separate from pending Location selection.
8. `05-impact-preview.png` — impact language explains Organization inheritance
   and protected Location ownership.
9. `06-attention-overview.png` — failure projects into Collection, object header,
   assignment posture, and Attention.
10. `06-partial-failure.png` — failed Location and retry consequence are clear.
11. `07-retry-success.png` — retry resolves current distribution posture.
12. `08-history-audit.png` — publication, assignment, original failure, and retry
    remain understandable together.
13. `09-responsive-laptop.png` and `10-responsive-narrow.png` — comprehension,
    selection, status, and primary actions survive responsive collapse.

Every reviewed state answers the certification question: a first-time operator
can identify the domain, its ownership, its current state, and the next action.

## Validation

- Authenticated Chromium: 2/2 passed, including deterministic lifecycle coverage
  and the live missing-table environment.
- Production TypeScript graph: passed.
- Test and Playwright TypeScript graph: passed.
- Focused empty-Organization, operator issue, Programs UI, and runtime-model
  tests: 17/17 passed.
- Configuration regression suite: 47/48 passed. The single failure is the
  pre-existing stale Locations source-string assertion.
- Focused lint and `git diff --check`: passed.

## Product certification update

The prior reference certification remains valid and is strengthened:

**APPROVED AS THE CONFIGURATION PLATFORM REFERENCE IMPLEMENTATION**

The experience no longer depends on prior knowledge when empty or unavailable.
With data, the read-first Overview and Collection explain purpose, state,
ownership, Attention, and next action before editing.

## Remaining deficiencies

No operator-comprehension deficiency blocks Configuration reference status.

Non-blocking platform follow-ups remain unchanged:

- the stale Locations source-string assertion;
- the Admin shell color-serialization hydration warning;
- deferred advanced capabilities such as approvals, rollback, scheduling,
  branch/restore, actor display, and field-level diff.

## Final conclusion

**Configuration Experience Runtime complete**

Operational Calculations was not started. No push, merge, PR, deployment, or
frozen architecture change is part of this completion.
