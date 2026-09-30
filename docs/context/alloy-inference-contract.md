---
title: Alloy AI inference contract
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Alloy AI inference contract

**This document is a guardrail, not a narrative.** It states what a model or agent reading the Alloy
corpus may conclude without further checking, and what it may never conclude no matter how strongly
the documentation seems to imply it.

Every FORBIDDEN entry below is a mistake that was actually made — by an agent, in this repository,
during the documentation certification program — and then measured to be wrong. They are not
hypothetical risks. Several of them produced confidently-worded false statements in canonical
documents that survived review for weeks.

Companion documents: [`alloy-platform-synthesis.md`](alloy-platform-synthesis.md),
[`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md),
[`alloy-context-packages.md`](alloy-context-packages.md),
[`alloy-benchmark-context.md`](alloy-benchmark-context.md).

---

## SAFE TO INFER

Each of these is certified. A task may rely on it without re-deriving it.

### Process and state

1. **Persisted Stage is process position.** A record is *at* a stage, and that position is stored.
2. **Status does not define Stage.** They are separate governed concepts; neither derives the other.
3. **Work Views, Queues and lane badges are projections.** They are derived views over records, not
   stored cohorts and not authority.
4. **Authoritative record detail comes from the resolver-backed entity GET**, never from a queue
   preview row.

### Identity and access

5. **Person is the canonical human identity** (`persons`, `customer_persons`). `contacts` is
   compatibility only.
6. **Email does not define Person identity.** Two records sharing an address are not the same person,
   and one person may have none.
7. **RLS owns tenant isolation; route capabilities authorize product actions.** They are different
   jobs and neither substitutes for the other.

### Configuration and runtime

8. **Configuration expresses intent; the runtime owns execution.** JSON steers behaviour; it cannot
   create or weaken an invariant.
9. **`entity_layouts` is append-only.** Republish; never edit or delete.

### Temporal truth

10. **Effective-dated truth supersedes rather than overwrites.** The prior interval is closed and a
    successor is linked; history stays resolvable.
11. **A cancelled row is retained, not deleted**, and is excluded from the operational uniqueness
    index.
12. **Schedule is expectation; Attendance is observation.** Different ledgers, different authority.

### Domain semantics

13. **Provider delivery state is not business truth.** It is telemetry about a vendor's pipeline.
14. **An Operational Intelligence answer is a reading, not an action.** It recommends nothing and
    authorizes nothing.
15. **AI reasoning confers no mutation authority.** Applying a proposal takes the domain's own
    capability.
16. **Subsidy suppresses collection.** It is derived, never stored, and changes no obligation.
17. **Alloy has two APIs.** `/api/v1/**` is the frozen external partner contract; `/api/admin/**` is
    internal and shares none of it.

---

## FORBIDDEN TO INFER

Each entry names the wrong inference, then what is actually true.

### Authority and authorization

1. **A route that does not call a capability helper is unprotected.** *No.* Authority may live in the
   route, a domain service, a handler library, a registered action, a provider-signature helper or a
   token boundary. Chain-follow to the enforcing layer before reporting a gap. Route-level scans
   systematically under-report protection in this codebase.
2. **A table grant with no matching policy is permissive.** *No.* **Absence is not a wildcard** — a
   grant with no admitting RLS policy denies. A standing grant needs an explicit policy.
3. **A registered action is executable because it is registered.** *No.* Check for an execute branch;
   registration alone is a declaration.
4. **A capability name implies its scope.** *No.* Read the declared capability, not the name.

### Documentation status

5. **`status: canonical` means the document is current and loadable.** *No.* Canonical means someone
   owns it. It says nothing about currency, and nothing about whether it should be preloaded.
6. **A newer `last_reviewed` outranks an older canonical owner.** *No.* Review dates record
   attention, not authority. A recently-touched summary never displaces the owner it summarizes.
7. **A generated artifact is a second source of truth.** *No.* Where a generated copy and its source
   disagree, the source is right and the generator is stale.
8. **A "Future work" or "Deferred" section describes unbuilt work.** *No — this is the single most
   productive error in the corpus.* Three separate July-dated canonical documents described shipped,
   in-production features as future or out of scope: Commercial's "Future domains (deferred)",
   Communications' "out of scope — inbound email", and a flat denial that staff assignment existed
   seven weeks after it shipped. **Deferred sections are where documents lie.** Verify every one
   against code before repeating it.
9. **Certification, audit or sprint artifacts define current architecture.** *No.* They are evidence
   of how something came to be.

### Temporal model

10. **One cardinality rule covers every effective-dated table.** *No.* Placements and child primary
    assignments allow at most one operational row per agreement; **staff primary assignments are
    overlap-governed only**, so a staff member may hold a current and a future-dated primary
    assignment simultaneously.
11. **"Latest row" means "active row".** *No.* Resolve the current row by the operational-state
    predicate, never by `ORDER BY created_at DESC LIMIT 1`.
12. **A correction path exists because an edit form exists.** *No.* No correction path is implemented,
    deliberately. Ordinary edits are operational changes and supersede.
13. **A future-dated change leaves the present row active.** *No* — for placements and child
    assignments it closes the present row immediately. For staff the two coexist.

### Queues and projections

14. **A filtered queue page is a cohort**, or **a lane badge count is a fact.** *No.* Both are
    status-derived projections. Lane membership is stage **and** status.
15. **An empty surface means no data exists.** *No.* Distinguish *maintained-empty* from
    *never-maintained*; a dropped select column renders everything empty.

### APIs

16. **An `/api/admin` behaviour applies to `/api/v1`, or the reverse.** *No.* Shared code is not a
    shared contract.
17. **A public operation exists because an internal one does.** *No.* The public surface is closed:
    18 paths, no generic PUT/PATCH/DELETE.
18. **Alloy has no partner API.** *No.* This is stated in a foundation document and is wrong: the
    `/api/v1` surface is versioned and frozen and includes an OAuth token exchange. What genuinely
    does not exist is **outbound partner event delivery**.
19. **Financials or Communications are publicly exposed.** *No.* Attendance is public; those are not.

### AI

20. **Every `/api/admin/ai/*` route invokes a model.** *No.* `task-assist/propose` is deterministic
    and says so in its own output string.
21. **AI is live because a feature flag exists.** *No.* The live gate is **credential presence**
    (`OPENAI_API_KEY` *and* `OPENAI_MODEL`) plus org policy.
22. **A configurable base URL means multi-provider support.** *No.* There is exactly one adapter
    speaking one wire protocol. Do not describe provider switching, local models or self-hosted
    inference as current capability.
23. **Autonomous agents are current behaviour.** *No.* They are explicitly not roadmap execution.

### Money

24. **Subsidy is a payment.** *No* — it is collection suppression. Nor does an authorization or a
    draft claim suppress collection; only a SUBMITTED claim does, and a shortfall does not raise what
    the family owes.
25. **A quote is an obligation**, or **a payment is revenue recognition**, or **credit and reversal
    are interchangeable.** *No* to all three.
26. **Provider state is Alloy financial truth.** *No.*
27. **Commercial owns the obligation its pricing produces.** *No* — it owns intent only.
28. **Current payment semantics can be inferred from existing Payments documents.** *No.* The domain
    is uncertified and mid-mutation; recent commits corrected core money semantics.

### Communications

29. **A reply clears attention.** *No.* Only operator triage resolves an attention item.
30. **A named provider is in use because a canonical document mentions it.** *No.* Verify the
    configured provider.

### Verification method

31. **`max_version` proves a specific migration applied.** *No.* Verify **per version** — a ledger
    high-water mark can sit past your migration because another lane's work applied.
32. **A merged pull request means the database changed.** *No.* Merging does not apply migrations.
33. **An all-zero census means nothing exists.** *No.* It may mean a wrong identifier or a query
    against the wrong layer.
34. **A passing source-level guard proves reachability.** *No.* Source guards prove a string is
    present. Render the surface and confirm it fails when the behaviour is removed.
35. **A stub-based test proves the real implementation is intact.** *No.* A stub proves the caller
    asked.
36. **The filesystem path matches the URL.** *No.* `/organization/*` and `/settings/*` are rewritten
    onto `web/app/adminV2/**`. Searching for `web/app/organization` finds nothing.
37. **The configuration control plane is `/admin/settings`.** *No.* That redirects. `/organization` is
    the configuration landing, while `/admin/*` remains canonical for non-settings modules.

---

## How to resolve a conflict

1. **Code wins.** Runtime, schema, route and migration evidence outranks every document, including
   this one.
2. **Then the canonical owner** for that concern — see
   [`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md).
3. **Then this contract.**
4. **Never** a roadmap, release history, audit, sprint record or certification artifact.

If a document and the code disagree, the correct action is to fix the document and say so plainly —
not to reconcile the two in prose, and not to assume the document describes an intended future state.

## When this document must be updated

When a domain certification adds a safe inference, and — more importantly — **whenever an agent makes
a documented wrong inference about Alloy.** A new FORBIDDEN entry is the durable output of a mistake.
