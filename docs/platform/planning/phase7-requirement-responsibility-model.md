---
owner: platform
status: design
last_reviewed: 2026-07-25
---

# Phase 7 — Requirement Responsibility Model

The organizing model for Packet Composition and the Conversation Runtime. Adopted 2026-07-25 in
place of any packet-level or item-level "assignment" model.

## The hierarchy (canonical)

```
Packet → Forms → Requirements → Responsibility Rules → Conversation Runtime
```

NOT `Packet → Items → Assignments`. A packet composes **forms** (unchanged). The obligation-bearing
elements — uploads, acknowledgements, signatures, generated content, static content — already live
**inside** those forms as sections/fields (the existing `SectionDisposition`). Each such element is a
**Requirement**. A **Responsibility Rule** answers three questions about a requirement, and every
downstream surface (packet view, participant journey, conversation runtime, completion state) is a
**derived projection** of those rules. There is no second assignment architecture to migrate away from.

## A responsibility rule — the three axes

```
1. What does this apply to?   (scope)          household | participant | child | document | packet
2. Who is responsible?        (responsible)     guardian A | guardian B | either guardian |
                                                 all guardians | financial guardian |
                                                 child participant | role-based participant
3. What satisfies it?         (satisfaction)    one participant completes |
                                                 assigned participant completes |
                                                 every assigned participant completes |
                                                 one completion per child |
                                                 one completion per document
```

These three axes are the **stable contract**. Storage, UI, and runtime may evolve; the axes do not.

## Where responsibility metadata lives (minimal now, expandable later)

- A **requirement** is addressed by a `requirement ref` = `{ form_definition_id, section_key? }`.
  - `section_key` present → the rule targets that one section (e.g. the signature section).
  - `section_key` absent → a **form-level default** for every requirement in that form.
- Rules are stored on the **packet definition** as `metadata.requirement_responsibilities: RequirementResponsibilityRule[]`
  (rides existing JSONB — **no migration**). Packet-context is correct: the same form can carry
  different responsibility in different packets.
- **Resolution order** for a given requirement: section-specific rule → form-level default → packet
  default → built-in default (`applies_to: participant`, `either_guardian`, `one_participant`).

### Why this expands without a rewrite

- The three-axis rule object is identical whether it is read from packet metadata now or from a
  first-class `requirements` / `responsibility_rules` table later. Promotion = move the same objects to
  a table; the projection code and the axes are unchanged.
- `responsible_party` is a discriminated union, so new parties (role-based, financial guardian) are
  additive.
- The projection is a pure function of `(rules, roster)` — the Conversation Runtime, packet views, and
  completion state all call it; none of them own the rules.

## The projection (the one seam everything derives from)

```
deriveParticipantRequirements(rules, roster) → RequirementInstance[]
```

Given the resolved rules for a packet's forms and the packet's roster (children + guardians/recipients
with relationships), it fans each requirement out into concrete **requirement instances**:
- `applies_to: child`  → one instance per child.
- `applies_to: household | packet` → one instance for the family.
- `responsible_party` → the set of participants who own the instance (a specific guardian, either,
  all, the financial guardian, the child, a role).
- `satisfied_by` → the completion predicate (one of the assigned, every assigned, one-per-child, …).

`evaluateCompletion(instances, submissions)` then reduces submissions to per-instance and overall
completion — the same function powers the operator packet view and the participant journey.

## Scope for THIS sprint (enrollment proving journey only)

Do **not** build the generalized engine. Deliver the minimum that lets the enrollment proving journey
express: household requirements, child-specific requirements, either guardian, both guardians, a
specific guardian, and signature / acknowledgement / upload ownership — using only the axes above.

1. **`pos_connected` repair** — done (composer packets now reach Processing on completion).
2. Packets keep composing forms (unchanged).
3. Introduce the responsibility **types** + **pure projection/completion** functions + unit tests
   (the deterministic core), stored via packet metadata.
4. Minimal wiring so the data exists and is projectable; full Conversation Runtime rendering + composer
   authoring UI + participant journey are later slices that consume this same seam.

## Non-goals (this sprint)

Generalized responsibility engine; first-class ack/signature packet-item types (packets compose forms —
do not explode dispositions into items); role/permission authoring UI; billing; a second assignment
model of any kind.
