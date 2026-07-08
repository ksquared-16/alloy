# Alloy Operator Workspace — Final Design Sprint

**Status:** Complete — implementation-ready (July 2026)  
**Sprint type:** Integrated workspace design — final before implementation  
**Builds on:** [objective-focus-integration](../objective-focus-integration/)

---

## The deliverable

**"The Alloy Operator Workspace"** — not "The Current Work feature."

Someone unfamiliar with Alloy should look at these mockups and think: *this system exists to help me complete work.*

---

## Design decision (locked)

**Current Work = first Summary card, Fill width, row 1.**

Not a hero banner. Not a header section. Not a right rail. Not a mission system.

It earns organizing priority through **position, weight, and persistence** — using the same Summary → Focus grammar as Household.

See [operator-workspace-doctrine.md](./operator-workspace-doctrine.md) for full analysis of alternatives.

---

## Mockups

Gallery: [mockups/index.html](./mockups/index.html)

| # | File | Shows |
|---|------|-------|
| 01 | [01-enrollment-workspace.html](./mockups/01-enrollment-workspace.html) | Complete enrollment record — everything visible |
| 02 | [02-current-work-focus.html](./mockups/02-current-work-focus.html) | Current Work Focus open |
| 03 | [03-household-handoff.html](./mockups/03-household-handoff.html) | Checklist → Household Focus |
| 04 | [04-communications-handoff.html](./mockups/04-communications-handoff.html) | Checklist → Communications |
| 05 | [05-complete-work.html](./mockups/05-complete-work.html) | Completion inside Focus |
| 06 | [06-runtime-refresh.html](./mockups/06-runtime-refresh.html) | Workspace updates after runtime |
| 07–10 | Domain workspaces | Attendance, Billing, Licensing, HR |
| 11 | [11-full-operator-journey.html](./mockups/11-full-operator-journey.html) | Open → work → complete → continue |
| 12 | [12-executive-comparison.html](./mockups/12-executive-comparison.html) | Today vs tomorrow |

**View:** `cd mockups && python3 -m http.server 8765` → http://localhost:8765/01-enrollment-workspace.html

Press **P** to toggle chrome. Add `?screenshot=1` for screenshot mode.

---

## Doctrine

- [operator-workspace-doctrine.md](./operator-workspace-doctrine.md) — complete workspace spec
- [focus-doctrine-evolution.md](./focus-doctrine-evolution.md) — Current Work as first work-focused Focus
- [workspace-critique.md](./workspace-critique.md) — CRM audit + what to remove

---

## Constraints

Runtime, Focus architecture, navigation, builders — **frozen**. Presentation only.
