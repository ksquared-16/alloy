# OPEN PRODUCT DECISION — may a Work View lens span more than one Row Grain?

**Status:** OPEN. **Recorded:** 2026-07-30. **Explicitly NOT decided in the Second Surface sprint.**
**Owner:** product + runtime, jointly. **Related:** `REFUSAL-HONEST-NOT-FATAL.md` (the bounded repair that
made the refusal survivable), `SECOND-SURFACE-INVENTORY.md` §4 R11.

---

## 1. The concrete situation

Firefly's Enrollment process declares six stages across two Row Grains:

| stage | declared grain |
|---|---|
| `lead` | `family` |
| `tour` | `family` |
| `decision` | **`child`** |
| `waitlist` | **`child`** |
| `enrolling` | **`child`** |
| `enrolled` | **`child`** |

The published Work View **"Active Pipeline"** filters on a stage set that spans both. Law **G-1** —
"a surface cannot be grain-ambiguous" (`workUnitProvisioningAnswer.ts:360-380`) — therefore refuses it, and
the operator gets a classified, navigable refusal rather than a surface.

**G-1 is not in question in this sprint and was not relaxed.** The refusal is correct: with one authoritative
row source per answer, a lens spanning two grains has no single truthful answer to give.

## 2. The two futures

**Option A — split Active Pipeline into single-grain lenses.**
Treat the tenant's configuration as the thing that is wrong. "Active Pipeline" becomes (say) an
active-family lens and an active-children lens, each unambiguous.
- *For:* preserves G-1 unchanged; every surface keeps exactly one subject grain; no runtime work.
- *Against:* it is an operator-meaningful view — "everything actively moving" — and splitting it may not be
  what the business means. It also pushes the same decision onto every tenant that models enrollment this
  way, and Firefly modelled it this way without being told not to.

**Option B — deliberately relax G-1, with a full product + runtime design.**
Permit a lens to span grains and define what that surface *is*.
- *For:* matches how the business appears to think about a pipeline.
- *Against:* far-reaching. `stageGrainV1.ts:5` states grain determines "queue row subject, count unit, focus
  panel context, available actions" — so a multi-grain lens needs answers for: which row provider(s) run and
  how results interleave; what a row's identity is when adjacent rows are different kinds of thing; what a
  count means (`WorkViewGrainBucket` already models a family/child split, suggesting this was anticipated);
  what the Focus Panel subject becomes when the operator selects across grains; and which commands are
  offered. None of these are runtime details — each is a product statement.

## 3. What must NOT be done

- **Do not** pick a grain and silently fall back to it. Substituting `case`/`family` for an ambiguous lens is
  the exact class of defect the Subject Authority work eliminated (`SUBJECT-AUTHORITY.md`): a surface that
  answers a question it was not asked.
- **Do not** render a fabricated empty queue for an ambiguous lens. Empty means "nothing matched"; this lens
  cannot be evaluated at all, and the two must stay distinguishable (`errorKind: "configuration"`).
- **Do not** decide this as a side effect of the child row-provider work (R1/R2). That work makes a
  *single* resolved grain executable; it neither needs nor implies multi-grain lenses.

## 4. What is true today, so the decision starts from facts

- The refusal is **correct, classified and escapable** — an operator meeting it can see it is a configuration
  problem and switch to another lens without leaving the surface.
- The child-grain lenses that are *unambiguous* (**Registration**, **Waitlist**) resolve `grain: child`
  cleanly and need no product decision at all — they need R1/R2.
- So Active Pipeline is **not** blocking the second surface. It is a separate, real, and now-survivable
  configuration problem.
