---
owner: product-platform
status: complete
last_reviewed: 2026-07-17
concept: programs-configuration-reference-recertification
supersedes:
  - programs-runtime-product-certification-2026-07.md
---

# Programs Configuration Reference Re-certification

**Certification date:** 2026-07-17
**Validation surface:** Programs, Configuration Publication Runtime Consumer #1
**Frozen architecture:** accepted without reopening  
**Verdict:** **APPROVED AS THE CONFIGURATION PLATFORM REFERENCE IMPLEMENTATION**

**Operator-comprehension closeout:** Empty, unavailable, Collection, and
Overview comprehension were independently completed in
[`configuration-experience-comprehension-completion-2026-07.md`](configuration-experience-comprehension-completion-2026-07.md).

**Domain-realization closeout:** Legacy Commercial Program richness was audited,
translated, and re-certified in
[`programs-product-certification-realization-alignment-2026-07.md`](programs-product-certification-realization-alignment-2026-07.md).

## Certification basis

This is a fresh Product evaluation of the realized experience. It does not infer
success from the implementation plan or the earlier completion claim.

The certification used:

- an authenticated Chromium journey through the settled Admin shell;
- canonical `/organization` and `/organization/programs` routes;
- deterministic Programs API responses for draft, publish, assignment,
  partial-failure, retry, durable consumption, and empty states;
- browser assertions for route ownership, visible language, runtime state,
  responsive overflow, failed requests, and console errors;
- direct review of every captured browser frame;
- implementation review only to classify Runtime versus Programs ownership.

The browser journey is real browser evidence, not component or implementation
screenshots. Interception is limited to Programs lifecycle responses so all
required states can be certified deterministically without mutating a shared
environment. The Organization landing, authentication, routing, shell, layout,
rendering, interactions, and responsive behavior are live.

## Accepted findings re-evaluated

| Frozen finding | Browser result | Ownership | Certification |
|---|---|---|---|
| Read-first Overview | Existing objects open on Overview with active revision, draft, assignment, definition, Attention, and readiness | Configuration Experience Runtime | Pass |
| Intentional editing | `Edit working draft` and the Working draft concern lead into editing; publish returns to Overview | Configuration Experience Runtime + domain editor slot | Pass |
| Obvious revision awareness | Header, collection row, Overview, and draft concern distinguish active revision, working draft, unpublished changes, and publication state | Configuration Experience Runtime | Pass |
| Assignment as identity | Overview and Assignments show durable Location consumption, revision, coverage, drift, and health separately from target selection | Configuration Experience Runtime | Pass |
| Configuration Attention | Setup, unpublished change, failed distribution, retry, and drift evidence project into object, collection, tab, and command surfaces | Configuration Experience Runtime | Pass |
| Complete History | Immutable publication, assignment, original failed attempt, and successful retry remain visible after recovery | Configuration Experience Runtime | Pass |
| Complete Collection | Shared collection owns search, filtering, Add, selection, publication, assignment, readiness, and Attention posture | Configuration Experience Runtime | Pass |
| Configuration-native shell | Configuration nouns, consequence copy, command grouping, and BOS starters replace queue, work-item, and generic CRUD framing | Configuration Experience Runtime | Pass |

## Runtime versus Programs implementation matrix

| Capability | Configuration Experience Runtime | Programs adapter |
|---|---|---|
| Collection | Search, lifecycle filters, Add ownership, selection, responsive selector, posture slots | Program noun, icon, labels, evidence projection |
| Detail | Overview-first navigation and route-addressable concerns | Program summary and field editor |
| Revision posture | Active revision, working draft, unpublished-change, and publishability model | Program payload checksum and validation |
| Attention/readiness | Generic rules, grades, destinations, setup rollup, display | Program setup-area evidence |
| Assignment | Durable consumption identity, revision drift, health, workflow boundary | Location choices, impact language, assign mutation |
| Distribution | Cross-revision runs, target outcomes, safe retry presentation | Retry invocation |
| History | Generic publication/run/attempt derivation and timeline, including recovered failures | Revision labels and Location labels |
| Commands/BOS | Configuration command groups and Configuration starters | Contextual destinations only |
| Responsive geometry | Shared collection/detail collapse and overflow protection | None |

Programs-specific implementation is limited to domain payload meaning and
established mutations. Future publishable domains do not need new Collection,
Detail, Overview, Attention, Assignment, Distribution, History, command, or
responsive infrastructure.

## Browser walkthrough

Evidence directory:

`docs/audits/evidence/configuration-runtime-completion/`

1. `00-organization-landing.png` — live authenticated Organization catalog,
   Programs ownership, consumers, and distribution framing.
2. `01-programs-landing.png` — Programs Collection empty state, search, filter,
   Runtime-owned Add, and Configuration BOS starters.
3. `01b-legacy-redirect.png` — legacy Commercial route resolves to canonical
   `/organization/programs` without retaining Commercial product identity.
4. `02-program-detail-draft.png` — explicit Working draft concern, unpublished
   object posture, active-revision separation, setup state, and editor.
5. `03-published-revision.png` — read-first Overview after publish with immutable
   active Revision 1 and a matching validated draft.
6. `04-location-assignment-selection.png` — durable current-assignment region
   remains separate from pending Location selection.
7. `05-impact-preview.png` — assignment impact explains inherited Organization
   values and protected Location-owned operational truth.
8. `06-attention-overview.png` — partial failure changes collection, header,
   Overview assignment posture, and Attention.
9. `06-partial-failure.png` — per-target failure reason and deterministic retry
   affordance.
10. `07-retry-success.png` — the same run resolves to two successes and no
    failed targets without replaying the successful target.
11. `08-history-audit.png` — publication, assignment, original failure, and
    successful retry remain visible together after recovery.
12. `09-responsive-laptop.png` — 1024×768 selector collapse, Overview, commands,
    and BOS.
13. `10-responsive-narrow.png` — 768×900 object selector, readable tabs and
    Overview, and no page-level horizontal overflow.

## Product assessment

### Collection

The Collection is now an operational catalog of Configuration objects, not a
queue. Rows communicate the object, publication state, assignment posture,
readiness, and Attention. Search, filter, Add, selection, and responsive
replacement are Runtime behavior.

### Detail and editing

The selected object is understandable before mutation. Overview answers what the
Program is, what revision is active, whether a distinct draft exists, who
consumes it, and what requires attention. Editing is an explicit concern and
action. A newly created object may enter its initial draft directly because
creation itself is intentional authoring; existing objects remain read-first.

### Publication and assignment

Publication is visibly immutable and does not imply Location consumption.
Assignment is durable object identity backed by consumption pointers, not the
state of checkboxes. Impact preview preserves the accepted Organization versus
Location ownership boundary. No Apply language or behavior appears.

### Attention, distribution, and history

Partial delivery projects into Attention before the operator opens Distribution.
Distribution explains the failed target and offers safe retry. History retains
the original failed attempt after successful retry rather than rewriting the
past to match current target status.

### Shell and responsiveness

The page uses Configuration nouns and concerns throughout. It does not present
Programs as records, work items, lanes, or a CRUD console. The laptop and narrow
layouts preserve object identity, concern navigation, and primary actions
without horizontal page overflow.

## Infrastructure assessment

No parallel platform was introduced.

- Existing publication, distribution, attempt, consumption, routing, auth,
  shell, and command registration infrastructure remains authoritative.
- Generic additions are presentation/read-model capabilities required by all
  future publishable Configuration domains.
- Programs remains an adapter over those capabilities.
- No schema migration, Apply provider, Location ownership change, reveal-gate
  change, Operational Calculations work, deployment, PR, merge, or push occurred.

## Validation

- Authenticated Chromium certification: passed.
- Production TypeScript graph: passed.
- Test and Playwright TypeScript graph: passed.
- Focused Configuration history and Programs UI tests: passed.
- Configuration regression suite: 47/48 passed; the single failure is the
  pre-existing stale Locations source-string assertion named below.
- No Programs API request failed during the browser journey.
- No unexpected Programs or Configuration console error occurred.
- Narrow runtime asserted no page-level horizontal overflow.

## Remaining deficiencies

No remaining Product deficiency blocks reference status.

Non-blocking repository/platform follow-ups remain:

- the pre-existing stale Locations source-string assertion;
- the pre-existing Admin shell color-serialization hydration warning;
- richer field-level diff, actor display, rollback, approval, scheduling, and
  branch/restore capabilities, which remain explicitly deferred and were not
  required by this certification.

## Recommendation

**APPROVED AS THE CONFIGURATION PLATFORM REFERENCE IMPLEMENTATION**

Programs now demonstrates the reusable Configuration Experience Runtime that
Operational Calculations, Communications, Processes, and future publishable
Configuration domains can inherit without inventing a different operator
experience. This verdict authorizes reference use only; it does not authorize
promotion, Consumer #2 implementation, or any frozen architecture change.
