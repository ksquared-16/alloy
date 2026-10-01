---
title: Alloy documentation impact contract
owner: platform
status: canonical
last_reviewed: 2026-10-01
supersedes: []
---

# Documentation impact contract

**Every Vacilando Alloy task answers this before it may close.** The contract exists because the
characteristic documentation failure in this repository is not a wrong document — it is a correct
document that nobody updated when the code moved underneath it. Three canonical documents described
shipped features as future work for weeks, and a foundation document told readers Alloy had no
partner API while a certified 18-path contract was live.

Those were not authoring failures. They were **closure** failures: the implementing task did not ask
whether it had changed what a document claims.

Package: `alloy-context.v1`. See
[`context-resolution.md`](context-resolution.md) step 12.

---

## 1. The thirteen questions

Did this task change:

1. canonical **domain semantics**?
2. **schema** owned by a lane?
3. a **mutation writer**?
4. a **route or surface**?
5. a **capability or permission**?
6. a **provider**?
7. a **configuration lifecycle**?
8. **state or status vocabulary**?
9. a **temporal invariant**?
10. an **AI inference boundary**?
11. a **safe or forbidden inference**?
12. a **canonical owner**?
13. a **generated public contract**?

Question 3 deserves its own attention: **a new mutation writer is the silent one.** A writer can be
added without touching a single document, and nothing fails. Every other change in this list tends to
announce itself.

## 2. If the answer to all thirteen is NO

Record, with evidence:

```text
CONTEXT_IMPACT: NONE
Evidence: <what you checked — changed paths against lane owned paths, and why none matched>
```

**Evidence is required.** "No documentation impact" asserted without saying what was checked is the
same claim as "I did not look", and the two are indistinguishable to a reviewer.

## 3. If any answer is YES

Record each of:

| Field | Meaning |
|---|---|
| `AFFECTED_LANES` | every lane, not only the primary mutation lane |
| `CANONICAL_DOCS` | the owner documents that must change, from the owner map |
| `MANIFEST_CHANGES` | changes needed in the benchmark manifest, lane registry or GPT sources |
| `RECERTIFICATION_REQUIRED` | yes/no per lane, from the trigger's `full_recertification` |
| `REQUIRED_GUARDS` | the test(s) that must pin the new claim |
| `PACKAGE_VERSION_IMPACT` | none, compatible revision, or schema-breaking |

A YES on question 11 or 12 is always at least a compatible package revision: the inference contract
and the owner map are Tier 1, so changing them changes what every lane loads.

## 4. Task closure standard

The canonical close block. Vacilando will eventually enforce this; today it is the standard.

```text
CONTEXT IMPACT

Affected lanes:
Documentation changed:
Canonical owner changed:
Safe inference changed:
Forbidden inference changed:
Staleness trigger fired:
Recertification required:
Context package updated:
Package version:
```

### A task may NOT claim COMPLETE if

- a **required context update is unresolved**;
- a fired **full-recertification trigger is silently ignored**;
- a **canonical owner is now contradicted by the implementation**.

The third is the one that matters most and is the easiest to rationalise away. If the code now says
something the owner document denies, the task has created a false canonical claim — and shipping it
while calling the task complete is how the corpus decays. Surfacing the contradiction and leaving the
document correct-but-incomplete is acceptable; leaving it confidently wrong is not.

### Partial closure is legitimate

A task that cannot finish the documentation work may close as `PARTIAL` **provided** it names the
outstanding context obligation and the lane it belongs to. Silence is the failure, not incompleteness.

## 5. What this contract does not do

It does not implement enforcement. There is no runtime engine reading this document, by design —
the standard is defined first so that the enforcement, when built, has something unambiguous to
enforce. The specification for that work is
[`vacilando-integration-spec.md`](vacilando-integration-spec.md).

---

## When this document must be updated

When the thirteen questions change, when the close block gains or loses a field, or when enforcement
begins and the "does not do" section stops being true.
