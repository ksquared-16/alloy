# Configuration Runtime Phase 3A — UI Terminology Review

**Status:** Recommendation (no broad rename in Phase 3A)  
**Scope:** User-facing label for configured operational lenses (`perspectives_v1`)

---

## Question

Should the user-facing term **Perspective** be replaced with **Work View**, **View**, **Operational View**, or **Work Queue**?

---

## Evaluation criteria

The term should naturally answer: *“These are the ways operators view and work this stage.”*

| Candidate | Pros | Cons |
|-----------|------|------|
| **Perspective** (current) | Already in code/docs; familiar to team | Abstract; not self-explanatory to admins |
| **Operational View** | Matches Phase 3 architecture language; explains purpose | Longer; “operational” may feel internal |
| **Work View** | Short; business-friendly; parallels “work unit” | Slightly generic |
| **View** | Minimal | Too vague alone |
| **Work Queue** | Concrete | Conflicts with Queue presentation ownership (Experience Builder); implies builder |

---

## Recommendation

**Adopt “Work View” in user-facing Configuration Runtime and Runtime navigation copy** when Phase 3B copy pass is approved.

- **Internal:** keep `Perspective*`, `perspectives_v1`, `queue_key` unchanged.
- **User-facing (future):** card title “Work Views”, question “How operators view this work.”, context rail “Work Views”, Preview link unchanged.
- **Do not use “Work Queue”** — queues remain Experience Builder presentation surfaces.

**Operational View** is acceptable in architecture docs and BOS analysis copy; **Work View** is better in settings and runtime pills where brevity matters.

---

## Phase 3A decision

**No broad copy rename in 3A.** Implement convergence behind `NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A=1` using existing Concept A strings. Revisit copy in a dedicated terminology PR after runtime screenshots validate the model.

---

## Approval gate

Before copy sweep:

1. Runtime and Configuration show identical Work View labels/order with flag on.
2. Screenshot comparison (Part 6) signed off.
3. Product confirms “Work View” vs “Operational View” for customer-facing settings.
