---
title: Vacilando context integration specification
owner: platform
status: canonical
last_reviewed: 2026-10-01
supersedes: []
---

# Vacilando integration specification — Phase 2 handoff

**This is a specification, not an implementation.** It is the handoff into the Vacilando repository.
Nothing here is built in the Alloy repository, and this run deliberately did not build it.

Package: `alloy-context.v1`. Inputs are the three hand-authored manifests plus the two generated ones
in this directory.

---

## 1. Lane registry ingestion

Read [`vacilando-lanes.json`](vacilando-lanes.json) (`schema: alloy.vacilando-lanes.v1`).

- Key lanes by `id`; ids are unique across all three groups (`lanes`, `shared_context_packages`,
  `pending_lanes`) and the Alloy-side validator enforces that.
- Treat `shared_context_packages` as **dependencies, never as primary mutation lanes**. A resolver
  that offers `operations-temporal` as a primary lane will produce temporal changes with no domain
  owner.
- Treat `status: PENDING_DISABLED` as a hard gate on DIRECT context, not a warning label.
- Pin the ingested `package` field. A lane registry from one package version and a trigger registry
  from another is a silent inconsistency.

## 2. Context loader

Given a lane id, assemble in the order given by
[`context-resolution.md`](context-resolution.md) §5:

1. the five Tier 1 documents from `alloy-context-package.json.foundation`;
2. the lane's `direct`;
3. each `shared` package's `direct`;
4. the lane's `safe`/`forbidden` plus the global inference contract;
5. the lane's known debt, read from the benchmark manifest scoreboard;
6. the lane's `triggers`, resolved against `recertification-triggers.json`;
7. repository lineage: current SHA plus the package's `source_staging_sha`.

Honour `load_mode`: `EMBED` may be cached; `FETCH_LIVE` must be read at request time; `REFERENCE_ONLY`
is never preloaded. **Never cache a `FETCH_LIVE` document across tasks** — that is how a measured count
becomes timeless.

## 3. Task → lane resolver

1. Match task text against each lane's `task_routing_hints`.
2. Match changed/target file paths against each lane's `evidence` and `direct` prefixes. **Path
   evidence outranks keyword matching** — keywords are a hint, paths are facts.
3. If more than one lane matches materially, apply the cross-lane rule: one primary mutation lane,
   secondary lanes read-only, triggers fired for all.
4. If the resolved lane is `PENDING_DISABLED`, emit the refusal payload from
   `pending_lanes[].while_pending` rather than loading context.
5. If nothing matches, do **not** guess a lane. Report unrouted and load global foundation only.

## 4. Context preflight

Before the agent starts, assert and surface:

- resolved primary lane, and secondary lanes;
- package id and version actually loaded;
- whether `source_staging_sha` is an ancestor of the working tree — if not, the context **predates**
  the code and must be flagged;
- which triggers are already known to have fired on the current branch.

## 5. Reference retrieval

Expose retrieval for `reference`, `generated` and `planned_only` sets, and for implementation evidence.
Every retrieval result must be labelled with its authority rank from
[`context-resolution.md`](context-resolution.md) §2, so the agent cannot mistake a planning document
or a certification artifact for doctrine.

## 6. Documentation-impact postflight

At task close, require the block from
[`documentation-impact-contract.md`](documentation-impact-contract.md) §4.

- `CONTEXT_IMPACT: NONE` requires **evidence**, not just the assertion.
- Any YES requires affected lanes, canonical docs, manifest changes, recertification flags, required
  guards and package-version impact.
- Refuse `COMPLETE` when a required context update is unresolved, a `full_recertification` trigger
  fired and was ignored, or a canonical owner is now contradicted by the implementation.
- Allow `PARTIAL` **with** a named outstanding obligation. Incompleteness is acceptable; silence is not.

## 7. Recertification task generation

When a trigger fires, generate a follow-up task carrying: `trigger_id`, `lane`, `required_guard`,
`doc_owner`, and `full_recertification`. Route it to the trigger's lane, not to the lane that fired it
— a migration landing in a feature task fires `ops.temporal-table-migration`, and the recertification
belongs to `operations-temporal`.

Deduplicate by `(trigger_id, lane, branch)` so one branch touching a table ten times produces one
recertification task.

## 8. Package-version tracking

Record the installed `package_id` + `schema_version` + `source_staging_sha` per workspace. Surface a
version mismatch between what a lane was booted with and what the repository now contains. This is
what makes stale context detectable rather than merely possible.

## 9. Stale-context refusal and warning

| Condition | Behaviour |
|---|---|
| package `source_staging_sha` not an ancestor of HEAD | **warn** — context may predate the code |
| a `full_recertification` trigger fired and unaddressed for the lane | **warn** on boot, **refuse** at close |
| lane is `PENDING_DISABLED` | **refuse** to supply DIRECT context; supply the refusal payload |
| a Tier 1 document missing or unreadable | **refuse** to boot — the guardrail is not optional |
| a `FETCH_LIVE` document unavailable | **warn** and proceed without it; never substitute a cached copy |

The last row matters: a temporarily unavailable validation resource is not a reason to stop work, but
silently serving yesterday's numbers in its place is worse than proceeding without them.

## 10. Cross-lane dependencies

Build the dependency graph from `shared` and `related`. `shared` is a hard load dependency; `related`
is a hint for secondary-lane discovery, not an automatic load — loading every related lane
reconstitutes the context bloat the package exists to prevent.

## 11. Local-AI boot behaviour

A local model receives exactly what §2 assembles and nothing else: global doctrine, lane context,
task-relevant live evidence, inference boundaries, authority precedence and the documentation-update
obligation.

The intent, stated plainly: **the Director should never again hand-copy context between GPT and
Vacilando.** The package is the shared source contract, and both consumers read the same manifests. A
local AI that boots from this package knows what Alloy is, which document is authority for the concern
in front of it, what it may not infer, and what it owes the documentation when it finishes.

---

## Out of scope for Phase 2

- Changing any Alloy canonical document. Vacilando consumes the package; it does not author doctrine.
- Enforcing the closure standard before the postflight exists.
- Enabling the Financials lane. That requires Alloy-side certification first.
