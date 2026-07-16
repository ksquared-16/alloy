---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 02 — Focus Panel

**Status:** Draft — Product Office certification artifact. Not doctrine until ratified.

**Question answered:** does the Focus Panel — **as the shell that hosts work** — faithfully express the Product Constitution?

**Out of scope:** Current Work's cards, requirements, and implementation (Deliverable 01).

**Evidence:** `VERIFIED` = observed running (authenticated, Firefly tenant). No new concepts.

---

## Verdict

**The Focus Panel's shell is constitutionally sound. Its Mode system is not.**

The panel anchors Truth correctly, preserves the operator's place, and genuinely delivers *one panel, many intents*. But **two of the Constitution's three Modes are unavailable**, and their responsibilities have collapsed into the third — which leaves the Context Frame with nothing to arbitrate.

---

## 1. What the Focus Panel expresses CORRECTLY

| Constitutional principle | Evidence |
|---|---|
| **Truth is anchored in the shell** | The header holds *"kurzman Family · Open · North Campus"* and never moves while working. `VERIFIED` |
| **Truth persists while work happens** | Recording outcomes, expanding requirements, and opening the workspace takeover never disturb identity. `VERIFIED` |
| **Law 7 — the drawer preserves workspace / perspective / queue** | The queue, its filter, and the selected row survived every interaction across this review. The operator never felt she left for a "record module." `VERIFIED` |
| **One panel, many intents** | No separate Billing/Attendance/Person drawer product exists. The Constitution's central economy holds. `VERIFIED` |
| **Cards observe** | The card grid composes from one context; no card fetches independently. `HIGH CONFIDENCE` |
| **Identity is never pending** | The header renders before payloads resolve — *"latest click always wins."* `VERIFIED` |

**This is a real shell.** The hard part — anchoring Truth and preserving place — is done.

---

## 2. What it VIOLATES

### F1 — Two of three Modes are unavailable; their responsibilities have collapsed into Work · **Runtime Expression**

The Constitution establishes three Modes. The running panel offers **one working Mode**.

| Mode | Constitution | Running product |
|---|---|---|
| **Summary** | *"Ambient understanding of the whole record… business meaning first; reading, not editing"* | **DOES NOT EXIST.** Mode controls present: `["Work", "Activity"]`. `VERIFIED` |
| **Work** | *"Active operational work surfaces… cards for the domains in play"* | **Functions** — and now holds everything |
| **Activity** | *"History / timeline of what has happened — append-only record of facts"* | **ERRORS.** *"Could not load the opportunity drawer View Model."* — **3/3 trials**. `VERIFIED` |

**Where each lost responsibility went — both leaked into Work:**

- **Summary's responsibility (ambient understanding) leaked into Work.** HOUSEHOLD, CHILDREN, and BILLING PREVIEW — reading-not-editing cards by any reading of the Constitution — render inside the **Work** tab beside Current Work. `VERIFIED`
- **Activity's responsibility (history) leaked into a card disclosure.** With the Activity Mode erroring, the only history an operator can reach is **"Recent activity — 5 recent events ▾"** *inside the Current Work card, inside Work*. `VERIFIED` History has left the Mode that owns it and become a disclosure inside a card. (Deliverable 01 · V7 established that this leaked history is not even work-scoped — it renders *"3 children — Lifecycle"*, a field value, where the Constitution specifies facts.)

**All three Mode responsibilities now live in Work. The Mode model has collapsed to a single Mode.**

**On the Activity failure — honest scoping.** The drawer View Model endpoint (`/api/admin/view-models/drawer/opportunity/{id}`) returns **404 on the Work-mode baseline as well**, yet Work renders regardless; only Activity is fatal to it. `VERIFIED`. Whether this reproduces across all records and tenants is `HYPOTHESIS` — I exercised one record in one tenant. **The constitutional finding does not depend on the cause:** the Mode that owns History is unavailable, so the panel cannot answer *"what happened previously?"*

### F2 — The Context Frame is never named — and F1 is why it doesn't matter yet · **Product**

`VERIFIED`: the panel never renders **"Mission"** — the glossary's operator-facing name for the Context Frame — and surfaces no Frame anywhere.

**This is one violation with F1, not two.** The Constitution's mechanism is that *the Frame decides which Mode leads*. **With one working Mode, the Frame has nothing to decide.** The Frame is not merely unnamed — it is **inert**, and it is inert *because* the Modes it would arbitrate do not exist.

This is the deepest finding in this review: **the panel has not implemented the mechanism that makes it universal.** The reason one panel can serve Tour, Billing, Attendance and Waitlist is that the Frame re-leads the Modes. Collapse the Modes and the panel is not a universal surface — it is a single work page that happens to be reachable from several places.

### F3 — Attention is never communicated · **Product**

The panel communicates **Truth** (the header) and **work** (the cards). It never names the **Record of Attention**.

The Constitution requires: *"The drawer makes the **active child and relationship scope explicit**"* and forbids *"household-global authority assumptions across multiple children/guardians."*

`HIGH CONFIDENCE`, not verified: no active-child indicator appears in any capture I took, and no Mission is rendered. **I could not empirically test whether clicking a child changes Attention** — my selector never isolated the panel header from the queue row, and I am not claiming a result I did not obtain.

This is the shell-level statement of Deliverable 01 · V1. The card flattens three children into two unscoped requirements **because the shell hosting it has no concept of an active child to scope them to.**

### F4 — Out-of-scope cannot be expressed · **Product** / **Runtime Expression**

The Lifecycle establishes that when Attention points outside the active Work View, the product must **classify → name → offer** — *"instead of silently showing a record the active queue counts as 0."*

`VERIFIED`: `resolveFocusPanelScope` has **zero production callers**. The panel cannot express Attention leaving the view, because the classification is never consulted.

---

## 3. Visual hierarchy — where it breaks

The Constitution's order, against the running panel:

| # | Question | Answered? |
|---|---|---|
| 1 | **Who am I looking at?** | **Yes** — the shell header. Anchored, never pending |
| 2 | **What am I working on?** | **No** — the family is shown; the Attention is never named (F3) |
| 3 | **Why am I here?** | **No** — no Mission, no Frame (F2) |
| 4 | **What should I do?** | **Partly** — Current Work leads, but two CTAs compete (Deliverable 01 · V6) |
| 5 | **What else do I need to know?** | **Yes** — Household, Children, Billing Preview… **but in the wrong Mode** (F1) |
| 6 | **What happened previously?** | **No** — the Activity Mode errors (F1) |

**The hierarchy breaks at question 2 and never recovers.** The panel answers *who* and *what to do*. It cannot answer *what am I working on*, *why am I here*, or *what happened* — questions 2, 3 and 6, which are precisely the ones the three-coordinate model exists to answer.

**Read against the Constitution, this is a single sentence:** the panel expresses **Truth** and **Work**, and expresses neither **Attention** nor **Frame**. Two of three coordinates are missing from the surface built to hold all three simultaneously.

---

## 4. Responsibility ownership — is any layer holding the wrong thing?

| Responsibility | Constitutional owner | Actual owner | Verdict |
|---|---|---|---|
| Shell identity | Shell | Shell | ✅ Correct |
| **Truth** | Shell (anchor) | Shell | ✅ Correct |
| **Attention** | The panel (active scope, explicit) | **Nobody** | ❌ Unowned |
| **Frame** | The panel (Mission) | **Nobody** | ❌ Unowned |
| **Mode** | The panel | The panel — but only one Mode exists | ⚠️ Degraded |
| Cards | Composition within a Mode | Work Mode (all of them) | ⚠️ Wrong Mode |
| **History** | **The Activity Mode** | **A disclosure inside the Current Work card** | ❌ Wrong layer |
| Current Work | A card inside Work, scoped to Attention | A card inside Work, scoped to **Truth** | ❌ Wrong coordinate |

**Two responsibilities are unowned (Attention, Frame) and two sit in the wrong layer (History, Current Work's scope).**

---

## 5. Pressure tests — would the panel truthfully express Truth / Attention / Frame?

Without architectural change, using only the shell as it exists:

| Scenario | Truth | Attention | Frame | Would the panel express it? |
|---|---|---|---|---|
| **Enrollment** (family-grain) | ✅ anchored | ⚠️ coincides with Truth, so the gap is invisible | ❌ unnamed | **Accidentally yes** — because Attention == Truth here |
| **Waitlist** (child-grain) | ✅ | ❌ child never named | ❌ | **No** |
| **Payments** | ⚠️ Truth is the billing account, not the case — G-5 pins the panel to case-grain | ❌ | ❌ | **No** |
| **Vacation** | ⚠️ same | ❌ | ❌ | **No** |
| **Scheduling** | ⚠️ same | ❌ | ❌ | **No** |

**The panel passes exactly one scenario, and only because Attention and Truth happen to coincide there.** Enrollment-at-family-grain is the case that hides every defect — which is why the product has looked sound.

**Note (`HIGH CONFIDENCE`, flagged not resolved):** Payments/Vacation/Scheduling each have a Record of Truth that is *not* the case (*"the family's billing account / financial entity"*). Rule **G-5** pins `context.subject.id` to an `opportunity_id`. The Constitution and G-5 may need reconciling for non-enrollment domains — but **G-5's own rationale already anticipates this**, and the Constitution is frozen, so I flag it rather than touch it.

---

## 6. Is the Focus Panel constitutionally sound?

**The shell: yes.** Truth anchoring, place preservation, one-panel-many-intents, identity-never-pending. These are correct and hard-won.

**The Mode system: no.** One of three Modes functions. The Frame is inert. Attention is unowned.

**The honest summary:** the Focus Panel is a **well-built shell around an unbuilt Mode system.** It is not misdesigned — it is **unfinished in a specific, nameable place**, and it has looked finished because Enrollment-at-family-grain is the one case where the missing parts don't show.

---

## 7. Minimum product changes for constitutional compliance

Product-level only. No implementation. In dependency order:

1. **The Activity Mode must function.** The panel cannot answer *"what happened previously?"* Until it does, History remains a disclosure inside a card — the wrong layer.
2. **The Summary Mode must exist.** Until it does, *"ambient understanding"* and *"active work"* are the same tab, and the Frame has nothing to arbitrate.
3. **The Frame must be named** (Mission). The operator cannot answer *"why am I here?"* — and the Frame cannot lead until there are Modes to lead.
4. **Attention must be owned and named** — the active child and relationship scope, explicit. Until then, Deliverable 01 · V1 cannot be fixed at the card level, because the card has no scope to inherit.
5. **Out-of-scope must be expressible** — classify → name → offer, per the Lifecycle.

**Items 1 and 2 are prerequisites for 3.** There is no point naming a Frame that has one Mode to choose between.

**Not on this list:** anything that changes the Constitution, the Modes, or the Runtime. Every item above is the product doing what it already says it does.
