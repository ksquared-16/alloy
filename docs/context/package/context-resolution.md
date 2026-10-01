---
title: Alloy context resolution contract
owner: platform
status: canonical
last_reviewed: 2026-10-01
supersedes: []
---

# Context resolution contract

**How any AI run resolves Alloy context.** This is deterministic on purpose: the same task
classification must produce the same load set, or two agents reasoning about one domain will reach
different conclusions from different halves of the corpus.

Package: `alloy-context.v1`. Machine-readable inputs are
[`alloy-context-package.json`](alloy-context-package.json),
[`vacilando-lanes.json`](vacilando-lanes.json) and
[`recertification-triggers.json`](recertification-triggers.json).

---

## 1. The algorithm

```text
 1. classify task domain
 2. select ONE primary lane
 3. load global foundation            (5 documents, always)
 4. load primary lane DIRECT owners
 5. load shared dependencies          (operations-temporal, product-urls)
 6. identify secondary affected lanes
 7. load secondary DIRECT context ONLY where the task needs it
 8. fetch REFERENCE_ON_DEMAND for task-specific detail
 9. consult implementation evidence when:
        documents conflict
        the task changes owned semantics
        a staleness trigger has fired
10. apply the SAFE / FORBIDDEN inference contract
11. execute the task
12. perform the documentation-impact assessment
13. update or recertify affected context if necessary
```

Steps 1–10 are preflight. Step 12 is **not optional** — see
[`documentation-impact-contract.md`](documentation-impact-contract.md).

## 2. Authority precedence

When two sources disagree, resolve strictly in this order:

| Rank | Source |
|---|---|
| 1 | **Implementation and deployed evidence** — route handlers, migrations, RLS policies, runtime measurement, generated contracts |
| 2 | the concern's **canonical owner** document ([`../alloy-canonical-owner-map.md`](../alloy-canonical-owner-map.md)) |
| 3 | the **inference contract** ([`../alloy-inference-contract.md`](../alloy-inference-contract.md)) |
| 4 | the **synthesis** ([`../alloy-platform-synthesis.md`](../alloy-platform-synthesis.md)) |
| — | **never**: a roadmap, release history, audit, sprint record, planning tree or certification artifact |

**The AI must SURFACE a measured contradiction, not silently resolve it.** Preferring the code
without saying so leaves a false document in place for the next reader; preferring the document is
worse. Name both sides, state which precedence rank wins, and record a documentation-impact finding.
Rewriting doctrine quietly to match code it has just read is forbidden — doctrine changes are
reviewed, not inferred.

## 3. Task → lane routing

Routing is a **hint**. The file and implementation scope decide the truth, and may prove the task
cross-lane.

| Task concept | Primary lane |
|---|---|
| status, stage, outcome, transition, work item | `business-process` |
| placement, candidate, enrollment agreement, waitlist, room | `enrollment-placement` |
| staff, employment, schedule, coverage, staffing ratio | `staff-scheduling` |
| attendance, check-in, kiosk, person code | `attendance` |
| roles, access, permission, capability, RLS, tenancy | `identity-access` |
| messages, email, SMS, reply, thread, provider delivery | `communications` |
| settings, configuration publication, layouts, drafts | `configuration` |
| metrics, calculations, answers, operational expectations | `operational-intelligence` |
| AI prompts, models, providers, Trust, assist | `ai-bos` |
| pricing, rates, discounts, policies, catalog | `commercial` |
| subsidy claim, suppression, third-party funding | `subsidy` |
| payments, refunds, ledger, collection, reversal | `financials-payments` — **PENDING_DISABLED**, see §7 |
| API, integration, partner, scopes, OpenAPI | `developer-platform-api` |
| runtime, workspace, readiness, Focus Panel, presentation | `runtime` |
| effective dating, supersession, truth intervals | `operations-temporal` (**shared** — never a primary mutation lane) |
| URLs, redirects, rewrites, navigation paths | `product-urls` (**shared**) |

Each lane's `task_routing_hints` in [`vacilando-lanes.json`](vacilando-lanes.json) carries the
machine-readable keyword set.

## 4. Cross-lane tasks

A task that materially affects more than one lane must:

1. **identify every affected lane**;
2. **choose exactly ONE primary mutation lane** and record which;
3. load secondary lane DIRECT context **read-only**;
4. fire recertification checks for **every** affected lane, not only the primary;
5. **never** open duplicate competing work in a secondary lane.

Shared packages are the common case rather than the exception. `enrollment-placement` and
`staff-scheduling` both depend on `operations-temporal`, and **neither owns the temporal mechanics** —
a task that changes supersession behaviour is an `operations-temporal` change with domain
consequences, not two parallel domain changes.

## 5. Lane boot contract

What Vacilando hands an AI when work starts in a lane, in order:

1. **Global foundation** — the five Tier 1 documents.
2. **Lane identity and purpose** — `display_name`, `purpose`, `status`.
3. **Lane DIRECT owners** — the `direct` set, embedded.
4. **Shared dependencies** — each `shared` package's DIRECT set.
5. **Safe / forbidden inference** — the lane's own lists plus the global contract.
6. **Current known debt** — from the benchmark manifest's scoreboard row.
7. **Recertification triggers** — the lane's `triggers`, resolved against the trigger registry.
8. **Repository lineage** — current branch, staging SHA, and the package's `source_staging_sha` so
   the agent can tell whether its context predates the working tree.
9. **Task history** — only when the task needs it.

**Never preloaded:** sprint history, audits, raw certification evidence, planning trees, or any
unrelated domain. These enter only through task-specific retrieval under §6.

## 6. Reference retrieval

| Fetch | When |
|---|---|
| generated API specification | an exact external-contract question |
| certification evidence | current proof or measured numbers are needed |
| provider contract | an integration implementation task |
| historical decision record | the question is *why* this architecture was chosen |
| planning document | the task is explicitly about future work |
| migration / RLS policy | the task touches owned schema or authorization |

**REFERENCE is not AUTHORITY.** Retrieved material answers a question; it does not become a source
of doctrine. A certification artifact proves what was measured on a date — it never defines current
architecture. A planning document is evidence of intent only.

## 7. The pending lane

`financials-payments` is `PENDING_DISABLED`. When a task routes there, the agent must be told:

- context for this lane is **not certified**;
- **fetch implementation and live evidence** rather than loading doctrine;
- **do not infer current payment semantics from stale documents** — several were overtaken during
  September 2026;
- lane certification is required before this becomes standard AI context.

Two boundaries **may** be relied on, because both are separately certified: **subsidy is collection
suppression**, not payment; and **Commercial owns pricing intent only**, not the resulting
obligation.

## 8. Embed vs fetch-live

| Mode | Applies to | Rule |
|---|---|---|
| **EMBED** | stable doctrine, the inference contract, canonical owner documents | embed and index; refresh on the lane's staleness trigger |
| **FETCH_LIVE** | generated specs, volatile certification evidence, measured counts, provider state, runtime measurement | **never embed**; fetch at read time |
| **REFERENCE_ONLY** | large detailed contracts rarely needed in full | retrieve on demand; never preload |

**Never embed volatile numeric certification evidence as timeless context.** A stale embedded count
is worse than no count, because it reads as measured. A certification record's **prose** may be
embedded while its **numbers** may not — the two halves sit in one document and only one is
test-pinned.

---

## When this document must be updated

When the algorithm, the precedence order, the boot contract or the volatility rules change. Routing
hints change with the lane registry, not here.
