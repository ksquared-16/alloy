# Search Platform V2 — architecture decision

**Base:** `origin/staging` @ `e26cb49db`
**Investigation:** [search-platform-v2-v1-investigation.md](./search-platform-v2-v1-investigation.md)
**Canonical doctrine produced:** [../experience/search-platform.md](../experience/search-platform.md)

---

## Decision

Evolve Search V1 in place. Keep the endpoint (`/api/admin/global-search`), replace
the service behind it, and retain the V1 assets that were already right.

Rejected: a parallel V2 endpoint. Two live search paths would be exactly the
"second search data model" the mission forbids, and would leave the old
permission pattern reachable.

Rejected: discarding V1 wholesale. Its access-helper reuse, legacy-drawer ban,
request hygiene, debounce/stale-guard, and warm-prefetch are correct and were
carried forward.

---

## What determined the architecture

Three findings in the existing platform, not in Search:

### 1. `process_instances` is the participation primitive

`supabase/migrations/20260713000000_process_instances.sql` defines a generic
`process_key` / `subject_type` / `subject_id` / `stage_key` / `state` row, indexed
`(org_id, subject_id)`. Its own comment states it replaces
`opportunity_customer_members` as the runtime owner of child participation.

**Search V1 never read it.** It still treated `opportunities` as "Leads".

This single table resolves Case 4 (one child, three processes) with no hardcoding:
one subject, N participation rows, each a context.

### 2. Configured process labels already have a canonical edge

The lifecycle catalog exposes `process_key → lifecycle_name` (the tenant's
configured label) via `departments.metadata.lifecycle_builder_v1`, parsed by
`lifecycleBuilderFromDepartmentConfig`, with stage labels on each stage record and
a `departmentIdAllowed` access check.

So the tenant-configurability requirement is satisfied by reading existing
configuration, not by inventing a search-specific config path.

### 3. Schedule is already at child grain

`schedule_assignments.customer_member_id` + `schedule_patterns.label`. Case 3
("`Smith schedule` must not collapse to household grain") is satisfiable directly
from canonical truth, and the pattern label is configured — Search formats nothing.

---

## Layer ownership

| Layer | Module | Answers |
|---|---|---|
| Authorization | `searchAccessEnvelope.ts` | what can this operator reach? |
| Configuration | `searchProcessConfiguration.ts` | what processes exist, and what are they called here? |
| Intent | `searchQueryIntent.ts` | which words are the subject, which are context? |
| Retrieval | `searchRetrieval.ts` | which accessible subjects match? |
| Enrichment | `searchEnrichment.ts` | what makes them recognisable and useful? |
| Destinations | `searchDestinations.ts` | where can the operator go? |
| Ranking | `searchRanking.ts` | in what order, and why? |
| Orchestration | `runSearch.ts` | composes the above; decides nothing |

The separation is what makes the forbidden states structurally hard: retrieval
cannot emit a destination, destination resolution cannot match identity, and the
UI cannot construct authorization because it never sees an unresolved target.

Extension is by registration: `SEARCH_SUBJECT_ADAPTERS` for subject kinds,
`CONTEXT_DESTINATION_RESOLVERS` for destinations. Neither requires editing the
orchestrator.

---

## Security change from V1

V1 constrained persons, opportunities and locations at query time, but retrieved
**children** wide and filtered them only after assembling the display row. It did
fail closed, but the candidate and its name were materialized in process first.

V2 resolves the envelope once and constrains every adapter's query before any
candidate is read. An empty allow-list still constrains — returning an
unconstrained query there would silently widen a restricted operator to the whole
org.

---

## Performance change from V1

V1, per request: 2 status-definition fetches, 4 subject searches, then per-batch
follow-ups, a second full child resolution pass, and **two separate `persons`
reads for the same id set**.

V2: one access resolution, one configuration read, four retrieval queries
(parallel), then enrichment batched into two waves totalling six queries —
constant regardless of result count.

The wave split is required, not incidental: a PERSON's household lives on the
`customer_persons` edge, so household names, siblings, and the household
destination all depend on resolving that edge first.

---

## Deliberate non-decisions

- **No search projection/index table.** Not needed at current scale, and adding a
  derived store would risk it becoming treated as truth. Documented as available
  if measurements later demand it, explicitly rebuildable and search-only.
- **No canonical schedule destination.** None exists; inventing a route that 404s
  would be worse than the gap.
- **No fabricated staff model.** None exists; Case 5 is certified to the Person
  model's actual limit.
- **No field-level search aliases.** The Field System has no search-eligibility
  property, and adding a parallel config path would violate the configuration
  boundary. Sequenced.
