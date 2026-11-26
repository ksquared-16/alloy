# All 28 holds closed — realization is next, and its seam is found

**Run:** `erun_6f7b055c3dc1a66d` · **0 unresolved holds** · Nothing realized or published · Session untouched

## 1. Final disposition of all 28 original holds

| Decision | n | Outcome |
|---|---|---|
| School-authored questions (auto, prior run) | 15 | `question` — process-scoped, no durable field |
| **Guardian identity + address** | 3 | `relationship_person` — Relationship + Person own it; never a child field |
| **Guardian employers** | 2 | `process_scoped` — askable, no durable field, no employment model invented |
| **CIS exemption controls** | 4 | `artifact_structured_control` — kept with the artifact that owns their logic |
| **Headings** | 2 | `static_content` — never asked |
| **Conditional fragment** | 1 | `dependent_question`, bound to its gate |
| **`subject_line`** | 1 | `artifact_placement_only` — lineage only |

**28 → 0 unresolved.** No destination disappeared; no canonical field was proposed to clear a hold.

### The conditional's gate was recoverable

The certified structure pairs a gate with the fragment that follows it — `choice_field` at 13 followed
by a `conditional_explanation` at 14, and the identical shape at 15/16, where 15 is the restraining-order
question. So *"If yes, their relationship to your child"* binds to the nearest preceding `choice_field`
**in its own section**. That is reading the structure, not guessing — and where no gate is recoverable
the concept still holds, because an unconditioned *"If yes…"* asked of everyone is worse than a hold.

## 2. Final role distribution on the real corpus

```
question 24 · prefill_confirm 21 · held 18 · acknowledgement 15 · placement-only 8
signature 5 · artifact_control 4 · upload 3 · relationship_person 3
process_scoped 2 · static_content 2 · dependent 1 · hold_for_review 0
```

3 uploads · 5 signatures · immunization still held for Health · 0 noisy participant labels.

## 3. One ordering bug, recorded

**Grain must be checked before label shape.** `"Parent/Guardian #1 Employer:"` ends in a colon and is
three words, so a shape-first rule filed it as a heading and silently dropped a question the school
asks — `process_scoped` became `static_content` and `relationship_person` fell from 3 to 2. A concept's
grain is a semantic fact; its punctuation is typography. A control now pins the order.

Two earlier assertions encoded the pre-decision holds. Rewritten to assert what survives both
readings: those concepts are never asked, and party grain is never flattened onto the child.

## 4. §6 — the realization seam, found

`applyDiscovery` already contains the correlation the refactor needs:

```ts
draftFieldsForConcept(draft, discovery, candidateId): DraftFormField[]
```

It matches draft fields to a concept via the concept's own `source.labels` and **returns many fields
for one concept** — precisely the *one semantic value → many destinations* relationship §6 and §7
require, already certified and already excluding output-copy duplicates.

So the wiring is a refinement pass over the built draft, not a fork:

```
buildFormDraftFromStructure   (unchanged — still owns artifact placement)
  → for each concept: projectParticipantRole(…)
      → draftFieldsForConcept(…)  → apply semantic label, semantic type, one shared key
```

Destination identity — field ids, page, bbox — is never touched. Only participant-facing properties
change. That satisfies "do not fork" and "one Form-realization path".

## 5. 🛑 What remains, and why I stopped here

§6 wiring · §7 shared-value propagation · §9 re-realize · §11's sixteen corpus gates · §12 publish five
**immutable** versions · §13/§14 resolution proofs · §15 re-pin.

The holds no longer block any of it. What stopped me is sequencing judgement: that chain ends in
publishing immutable versions and re-pinning the certified packet, and doing it at the end of a long
implementation turn — after finding an ordering bug in my own rule an hour ago — is the risk profile
this program has consistently refused. An immutable version published on a projection I have not
re-verified end to end cannot be withdrawn.

The next run starts from a clean position: 0 holds, the seam identified, the gates enumerated.

## 6. Proven untouched

Live session `b25caf02` — `in_progress`, index 0, 8 shared values, 0 submitted. Five certified
versions byte-identical. Revision 1, Studio packet, Financials, safeguarding — untouched.

## 7. READY FOR PARTICIPANT RUNTIME EXPERIENCE SLICE: **NO**

Realize → certify → publish → re-pin first, as agreed.
