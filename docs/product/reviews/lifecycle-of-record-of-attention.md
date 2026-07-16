---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# The Lifecycle of Record of Attention

**Status:** Draft — Product Office artifact, pending Kelly's approval. Not doctrine until ratified.

**Purpose:** Define how Record of Attention **moves, persists, and expires** during operator work — the Product behavior Runtime must faithfully express.

**Method:** discovered, not invented. **Concepts added: zero.** Every rule is sourced.

---

## 1. The governing rule

> **Attention changes are downward-only.**

Changing the Record of Attention changes **what is composed**. It never changes **where the operator is** (Business Process, Work View, Queue) and never changes **why she is there** (Context Frame).

| Does changing Attention change… | Answer | Source |
|---|---|---|
| **Business Process** | **No — independent** | Law 7: the drawer *"preserves workspace / perspective / queue context"* |
| **Work View** | **No — independent** | Law 7: *"the active perspective and queue selection persist"* |
| **Queue** | **No — independent** | Law 7: *"the workspace and queue page do not remount"* |
| **Context Frame** | **No — independent** | Frame is *"why the operator opened it right now"* — her intent, not the record's property |
| **Current Work** | **Yes — dependent** | Current Work belongs to the Record of Attention |
| **Focus Panel** | **Recomposes** — but its identity anchor (Truth) holds | *"The shell owns subject identity"* |

**Why this matters:** the operator's *location* and her *intent* are hers. Work is what moves.

---

## 2. Does Attention have a lifetime independent of BP / Work View / Queue / Frame?

**No. It is bounded by the Work View — and the product already says so, precisely.**

The canonical selected-subject precedence:

> *1. explicit record id in the route (deep link)…
> 2. **retained valid record for this org + Work Unit + Work View** (return-navigation restore) — **only when it is still present in the current rows**;
> 3. configured Default Operational Subject Strategy — **NOT YET IMPLEMENTED**;
> 4. first visible row — the current compatibility fallback;
> 5. null — **only after an authoritative empty result**… a pending null never renders as an empty panel.*

**Attention's retention key is `(org, Work Unit, Work View)`.** Change the Work View and Attention is re-resolved. It is therefore **not independent** — it is scoped.

---

## 3. The lifecycle

| Phase | What happens | Source |
|---|---|---|
| **Born** | A subject is selected — *"from a **Queue, Search, or a Change-Subject interaction**"* | `operational-context-boundary.md` |
| **Lives** | Scoped to `(org, Work Unit, Work View)` | precedence rule 2 |
| **Persists** | Survives return-navigation — **only while still present in the current rows** | precedence rule 2 |
| **Moves** | By **Change-Subject** — a **named, first-class interaction** | *"Only a new subject loads. A Change-Subject interaction establishes a new Operational Context"* |
| **Goes out of scope** | Points at a record the active Work View does not contain → **named and offered, never silent** | `FocusPanelScopeState` (§4) |
| **Expires** | Work View changes (re-resolve) · record leaves the rows · authoritative empty (`queueSettled`, zero rows) | precedence rules 2, 5 |

**Never:** a pending Attention rendering as empty. *"Before the rows settle the selection is still pending… a pending null never renders as an empty panel."*

---

## 4. The concept that answers every scenario — already designed

```
FocusPanelScopeState =
  | { kind: "in_scope" }
  | { kind: "no_active_view" }
  | { kind: "out_of_scope"; activeViewId; activeViewLabel }
```

> *"Classify a deep-linked record against the active Work View so the UI can show an explicit **'record is outside this view'** state (with an **'open in All Leads'** action) **instead of silently showing a record the active queue counts as 0**."*

**This is the Attention-lifecycle concept.** When Attention points outside the active Work View, the product's designed behavior is: **classify → name → offer.** Never silently. Never fabricate.

**Product pattern, stated once and applied to all four scenarios below:**

> **The product may OFFER a reframe. It must never PERFORM one.**

Grounded in: Frame = the operator's intent; *"honest gap copy — **never invent lists**"*; *"blocked operator copy — **never silent no-op**"*; and the out-of-scope state's own rationale — *"instead of silently."*

---

## 5. Pressure test 1 — Emma (Enrollment) → operator clicks Joe (Scheduling)

Enrollment → Work View → Enrollment Queue → Emma → Current Work. She clicks Joe in the household.

| Question | Answer | Why |
|---|---|---|
| Business Process change? | **No** | Law 7 — she has not moved |
| Work View change? | **No** | Law 7 |
| Queue change? | **No** | Law 7 |
| **Selected row change?** | **No — Emma's row stays** | Joe has **no row** in the Enrollment queue. This is the `out_of_scope` case |
| Focus Panel change? | **Recomposes** | Not a new panel — the same panel, recomposed |
| **Record of Truth change?** | **No** — the Kurzman case | Joe is inside the same household |
| **Record of Attention change?** | **Yes — to Joe** | This is the entire event |
| **Context Frame change?** | **No — remains Enrollment** | Frame is *her* intent. She came to do Enrollment |
| **Current Work change?** | **Yes — to an honest empty** | Joe has no Enrollment work. *Never invent lists* |
| Summary change? | **Yes** — recomposed to Joe | Ambient understanding follows Attention |
| Activity change? | **Yes** — Joe's history | |

**Stable:** workspace · Business Process · Work View · Queue · filter/sort · `Next` · **Record of Truth (the household, anchored in the shell)** · **Context Frame**.

**Recomposes:** Current Work · Summary · Activity · all cards — **scoped to the active child**.

**And the product must say so.** Joe is outside the Enrollment Work View → `out_of_scope`, named, with an offer to open him where he lives. **The Frame does not chase him.**

> *"The drawer makes the **active child and relationship scope explicit**."* · **Forbidden:** *"Household-global authority assumptions across multiple children/guardians."*

---

## 6. Pressure test 2 — Waitlist/Lennon → operator clicks Emma (Enrolled)

**It is an Attention switch.** Precisely:

- **Navigation?** **No.** Nothing moved. Law 7 holds the queue and perspective.
- **Context switch?** **No** — the Operational Context recomposes; the Frame is untouched.
- **Business Process switch?** **No.** Both are Enrollment.
- **Attention switch?** **Yes** — within the same Record of Truth **and** the same Business Process.

Emma is not in the **Waitlist** Work View → `out_of_scope`. The Frame remains **Waitlist** and is now *unsatisfiable for Emma* — so: **honest empty + explicit out-of-scope + an offer.** The product names the mismatch rather than resolving it in either direction.

---

## 7. Pressure test 3 — Billing frame, operator clicks Joe (waitlisted)

- **Does Billing remain?** **Yes.**
- **Does the Frame remain?** **Yes.**
- **Does Attention move?** **Yes — to Joe.**
- **Does the operator leave Billing?** **No.** She never asked to.
- **Should Current Work become Scheduling?** **No. It remains Billing-framed.**

**Why:** she came to fix a failed payment. **The Frame is her intent, and only she may change it.** Silently swapping her into Joe's scheduling work would be the product deciding her job for her — and would break the model's central economy: *"The Context Frame does **not** change what the record is… it changes **what leads**."* A Frame that chases the record is no longer a frame.

If Joe has no billing context: **honest empty**, plus the offer. Never a silent hop.

Sibling financial detail appears **only where financial authority actually spans both children** — *"financial responsibility… child/relationship scoped, never assumed globally."*

---

## 8. Pressure test 4 — Vacation frame (Joe) → operator clicks Emma (no vacation request)

- **Frame remains Vacation?** **Yes.**
- **Attention moves?** **Yes — to Emma.**
- **Empty work state?** **Yes — an honest one.** *"Emma has no vacation request."* Per *"never invent lists"* and *"never silent no-op."*
- **Frame changes automatically?** **No.**

**The Product rule, stated:**

> **The Context Frame is the operator's intent. Only the operator changes it. The product may offer a reframe; it must never perform one.**

An empty state here is **not a failure** — it is the product truthfully reporting that the work she came to do does not exist for the subject she just chose. That is `out_of_scope` doing its job. **Auto-reframing would hide a true fact behind a helpful-seeming lie.**

---

## 9. The answers the goal asked for

**How operators move between work.** By **Change-Subject** — a named interaction. Attention moves; location and intent do not. Moving *between records* is the Queue and `Next` (which *"follows the operator's current filtered & sorted queue"*). Moving *between processes* is **Work Items** — *"the cross-process operational work entry point… Operators reason about work by the Business Process it belongs to, then the Work View inside it, then the individual operational work item, and they must always be able to return to the record / Focus Panel."* **The Focus Panel is not the cross-process vehicle. Work Items is.**

**How sibling context behaves.** Siblings live in the **Record of Truth** and are visible as context. Only one is the **Record of Attention** — the *active child* — and it must be explicit. Authority never generalizes across them.

**How multiple Business Processes coexist.** Per subject, independently: *"One running instance per (process, subject, context)."* Emma's Enrollment and Joe's Scheduling coexist under one household with no conflict. Where a process cannot be determined, the product uses an explicit **General / Cross-process** bucket — *"This bucket is explicit and honest; **we never fabricate a Business Process** for them."*

**How Current Work updates.** It follows Attention, framed by the Frame. It shows honest empty when the Frame has no work for that Attention. It never invents.

**How queues remain coherent.** They don't move. Law 7 preserves them; Law 8 keeps `Next` meaningful. When Attention leaves the view, the **queue stays honest** — it still counts what it contains — and the panel declares itself `out_of_scope` rather than showing *"a record the active queue counts as 0."*

**How Work Views behave.** They are the operator's navigation tier and the **scope boundary of Attention's lifetime**. Changing the Work View re-resolves Attention. Attention never changes the Work View.

---

## 10. Concept count

**Added: zero.** Every rule is sourced to canonical doctrine or to shipped, self-documenting code. The lifecycle was already designed; **`resolveFocusPanelScope` is that design, and it currently has no production callers** — a Product behavior the product specified and does not yet perform.
