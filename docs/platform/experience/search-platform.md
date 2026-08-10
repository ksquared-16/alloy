# Search Platform

**Status:** V2 — canonical owning doctrine for Alloy Search.
**Owns:** global search retrieval, recognition, context enrichment, destination
resolution, ranking, and the search authorization boundary.
**Code:** `web/lib/search/`, `web/app/api/admin/global-search/route.ts`,
`web/app/adminV2/components/GlobalSearchBox.tsx`.

Before V2, Search had no owning doctrine page — only archived sprint records.
This page is that owner.

---

## The governing model

> **Search finds subjects and exposes their relevant Alloy contexts.**

This is not record search. Search answers three operator questions:

1. **Who or what is this?**
2. **Is this the thing I meant?**
3. **Where can I go from here?**

The operator must never need to know how Alloy stores the answer — no tables, no
OCM rows, no opportunity records, no relationship joins, no work units.

---

## Canonical flow

```text
query
  ↓ org scope
  ↓ effective user access (location / relationship / record scope)
  ↓ candidate retrieval          ← constrained BY the access envelope
  ↓ recognition + context enrichment
  ↓ destination resolution
  ↓ ranking
navigate to the authoritative Alloy surface
```

The order is a security property, not a preference. See **Authorization** below.

---

## The result contract

One platform-owned contract, in `web/lib/search/searchContracts.ts`:

```ts
SearchResult {
  subject       // canonical identity
  recognition   // permission-safe disambiguation
  contexts      // relevant operational meaning
  destinations  // authoritative Alloy surfaces
  ranking       // deterministic score + reasons
}
```

### Subject

Canonical identity kinds: `person`, `child`, `household`, `location`.

- `persons` is canonical human identity.
- `customer_members` owns durable child profile truth — the child is the
  operational grain; the person is the identity.
- `customers` is the household/account shell.

**Process participation is never a subject kind.** A child in three processes is
ONE subject with three contexts. A child that exists as both a `customer_members`
row and a `persons` row appears once — the child grain wins and carries the
person id.

### Recognition

Enough to distinguish similar results, and nothing more. Search is not a
miniature Focus Panel. Every recognition field has already passed the access
boundary; a value the operator may not know about is `null`, never a placeholder.

### Contexts

`process` contexts are discovered from `process_instances` and labelled from
published Business Process configuration. `schedule` contexts come from
`schedule_assignments` at child grain.

### Destinations

Point at authoritative Alloy surfaces. Clicking the SUBJECT opens its canonical
default Focus Panel. There is no intermediate search-detail page, and no
component builds a URL — hrefs come from canonical route helpers, resolved
server-side.

### Ranking

Deterministic score plus `reasons`, so ordering is explainable and testable.
Ties break on subject kind, then name, then id.

---

## Query intent

A query is approximately:

```text
identity / subject terms   +   context / destination terms
```

`Joe Smith schedule` → Joe stays the subject; the Schedule context and
destination are promoted. Intent NEVER changes who the subject is.

Two vocabularies feed intent parsing:

1. **Platform capability terms** (`schedule`, `household`, `communications`, …) —
   these name Alloy capabilities, which are platform concepts, so the vocabulary
   is platform-owned.
2. **Configured process terms** — read from the tenant's published Business
   Process configuration.

**Guard:** if consuming intent would leave no subject terms, nothing is consumed.
A bare `schedule` is a name search, not a category with no subject.

There is no LLM in this path. Search must be useful and deterministic without one.

---

## Authorization — non-negotiable

**Forbidden:**

```text
search everything → display unauthorized subject → block after click
```

**Required:** the operator's effective reach is resolved ONCE, up front
(`searchAccessEnvelope.ts`), and every retrieval adapter constrains its query
with it BEFORE any candidate row is read. A subject the operator may not know
about is never retrieved, so it cannot be revealed and then blocked.

Search has **no permission model of its own**. It composes the canonical
Access/Roles helpers in `lib/admin/accessScope`. A second model would be a second
place to get authorization wrong.

Search must not leak, through results OR recognition metadata: names, household
relationships, children, locations, emails, phone numbers, process participation,
schedules.

An empty allow-list still constrains. Returning an unconstrained query for an
empty allow-list would silently widen a restricted operator to the whole org.

Direct navigation to a destination remains independently authorization-protected —
a destination is a link, never a grant.

---

## Tenant configuration boundary

Configuration **may** steer:

- which processes exist, and their operator-facing labels
- stage labels
- whether the operator may reach the owning department

Configuration **may not**:

- define arbitrary SQL
- redefine identity
- redefine authorization — the department access flag can only ever REMOVE a
  process from view, never add one
- invent executable navigation or mutation semantics
- create a second search data model

Tenant A configures Enrollment / Annual Registration / Subsidy Renewal; Tenant B
configures Admissions / Financial Aid / Summer Camp Registration. **Neither set of
names appears anywhere in `web/lib/search`** — a test greps the directory to keep
it that way.

---

## Search is never truth

```ts
SEARCH_RESULT_DOCTRINE =
  "Search results are previews and selections, never authoritative truth and never mutation input."
```

Any code accepting a `SearchResult` as the authority for a write is wrong: re-read
canonical truth from the owning system first. Focus Panel and the canonical
operating surfaces own authoritative operator detail.

No projection or index table exists today. If one is ever added for scale, it must
be explicitly derived, rebuildable, and search-only — never authoritative.

---

## Performance contract

- debounced input (180ms) with a monotonic stale-request guard, so a late
  response from an older keystroke can never blank a newer list
- bounded result counts; per-kind retrieval caps applied at query time
- **no N+1**: enrichment is batched to a constant query count regardless of how
  many candidates matched
- no full-record hydration for candidates
- deterministic ranking
- hover warm-prefetch of the subject's drawer
- keyboard-first: ⌘K, ↑↓, Enter, Esc

---

## Known gaps (sequenced, not hidden)

1. **No canonical operator schedule surface.** `/adminV2/scheduling` is
   transitional and `/legacy-admin/schedules` is legacy; operator surfaces are
   `/workspace` and `/organization`. `schedule` is therefore a first-class context
   that ranks and displays but emits no destination. When a canonical surface
   lands it is one entry in `CONTEXT_DESTINATION_RESOLVERS`.

2. **No canonical staff/employment model.** There is no `staff`, `employees`, or
   `employment` table. `user_profiles` / `user_roles` / `user_site_access` are the
   ACCESS model for application users, not an employment model. Staff search is
   therefore certified only to the degree the Person model supports; Search does
   not fabricate a staff role or campus assignment. A canonical staff model is a
   prerequisite for the full Case 5 experience.

3. **Search-eligible field aliases** (external family ID, student ID, employee ID)
   are not implemented. The Field System has no explicit search-eligibility
   property today, and inventing a parallel config path would violate the
   configuration boundary above. Sequenced as follow-up.

4. **V1 removal.** `globalRecordSearchService.ts` and its exclusive dependencies
   are no longer reachable from the route. `globalRecordSearchTypes` still has 13
   non-test importers across other surfaces, so V1 was left in place rather than
   deleted in the same change as V2's introduction. Removal is a separate,
   provable cleanup.

---

## Related doctrine

- Entity Model · Record System · Relationship Model — subject identity
- Business Process System · Stage Membership & Outcomes — process contexts
- Placement System — schedule/placement grain
- Navigation and Workspace Doctrine · Operational Navigation Contract — destinations
- Identity / Roles / Access V2 — the authorization model Search composes
- Alloy Visual Language — the search control's presentation
