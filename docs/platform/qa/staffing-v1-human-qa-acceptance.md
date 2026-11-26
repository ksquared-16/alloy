---
owner: platform
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Staffing / Scheduling / Coverage V1 — human QA acceptance walkthrough

Twenty to thirty minutes, in a browser, on the real product. You do not need to know
anything about how Alloy is built. If a step does not match what you see, that is a
finding — capture it with the template at the end and keep going.

## Your QA context

| | |
|---|---|
| **Environment** | staging |
| **Sign in as** | your usual staging operator account |
| **Site** | North Campus |
| **QA date** | **Thursday 1 April 2027** |
| **Room** | **Infant A** |
| **Child fixture** | one child, expected **09:00–17:30** on Tuesdays and Thursdays, and **08:00–16:30** on Mondays, Wednesdays and Fridays |
| **Staff fixtures** | *Active-Located* assigned to Infant A, 08:30–16:00 · *Active-Bare* and *Starting-Soon* assigned at site level |
| **Ratio** | Infant A: 1 staff up to 4 children, 2 up to 8, 3 up to 12 |

Everything above was set up through the ordinary product. Nothing was inserted behind
the scenes.

---

## Section 1 — Orientation

| | |
|---|---|
| **Where** | Left sidebar |
| **Do** | Open **Operations**. Choose **North Campus**. Click the **Calendar** tab. Use `‹` and `›` to reach **1 April 2027**. |
| **See** | Rooms as rows, a clock across the top, coloured blocks along each row. |
| **Pass** | You can find the day without help. **Roster** and **Calendar** sit side by side and keep the same site and date. |
| **If not** | Note which tab you expected and where you ended up. |

---

## Section 2 — Expected children

| | |
|---|---|
| **Where** | Infant A row, 1 April 2027 |
| **Do** | Read the room's line. Click the middle block. |
| **See** | "1 expected". The day starts at **09:00**, not 08:00. |
| **Pass** | The expected child appears only during the hours they are expected. |
| **Also try** | Move to **Wednesday 31 March**. The same child now starts at **08:00** and ends at **16:30**. |
| **Pass** | One child, different hours on different days, and the Calendar uses the right ones for the day you are looking at. |

---

## Section 3 — Baseline staffing

| | |
|---|---|
| **Do** | Click the 09:00–16:00 block in Infant A. Then look at the **Site — no room** row. |
| **See** | *Active-Located* planned in Infant A, marked **Assignment**. The other two appear on the site row, not in a room. |
| **Pass** | Site-level staff are shown at the site. No one is given a room they were never placed in, and nobody appears twice. |

---

## Section 4 — Requirement

| | |
|---|---|
| **See** | The room line reads **needs 1**. |
| **Pass** | The requirement matches the configured ratio for one child, and is a number rather than a blank. |

---

## Section 5 — An adequately covered stretch

| | |
|---|---|
| **Do** | Click the **09:00–16:00** block. |
| **See** | Expected children 1 · Required staff 1 · Planned staff *Active-Located*. The chip reads **Staffed**. |
| **Pass** | You can tell at a glance the room is fine, and why. |

---

## Section 6 — A gap

| | |
|---|---|
| **Do** | Click the **16:00–17:30** block (the gold one). |
| **See** | "Expected children: 1 · Required staff: 1 · Planned staff: none · **Short 1 staff**". |
| **Pass** | You understand the problem without doing any arithmetic: the child stays until 17:30 and the staff member leaves at 16:00. |

---

## Section 7 — Who could cover

| | |
|---|---|
| **Do** | In the same panel, read **Who could cover this stretch**. |
| **See** | All three staff, each labelled **Available**, **Unavailable**, or **Availability not recorded**. With the fixture as prepared, all three read *Availability not recorded*. |
| **Pass** | Nobody without a record is described as available. Nobody is hidden. Nobody is ranked or recommended. Anyone already planned elsewhere says so. |

---

## Section 8 — Plan coverage

| | |
|---|---|
| **Do** | Click **Plan ⟨name⟩ here**. |
| **See** | The day reloads. That person appears in Infant A for 16:00–17:30 marked **Coverage**, and the room chip turns **Staffed**. |
| **Pass** | Gap → action → resolved, without leaving the screen or retyping the room, date or time. |

---

## Section 9 — Split-day coverage

| | |
|---|---|
| **Do** | Pick a different stretch of the same day and plan the **same** person into it. |
| **See** | They appear in both places at different times. |
| **Pass** | One person, two places, never counted twice; their underlying assignment is unchanged. |

---

## Section 10 — Change coverage

| | |
|---|---|
| **Do** | To move someone, **Cancel Coverage** and plan them again at the new time. |
| **See** | The old allocation stops applying; the new one takes effect. |
| **Pass** | This is the shipped V1 workflow. A direct "change" button is **not** in V1 — note it if you expected one. |

---

## Section 11 — Cancel coverage

| | |
|---|---|
| **Do** | Click **Cancel Coverage** beside someone placed by Coverage. |
| **See** | They drop back to where their assignment puts them and the room returns to its earlier state. |
| **Pass** | Cancelling removes the plan without erasing that it happened. |

---

## Section 12 — A call-out

| | |
|---|---|
| **Do** | On the **09:00–16:00** block, click **Called out** beside *Active-Located*. |
| **See** | They stay listed as **planned**, now marked **Unavailable**. They stop counting, and 09:00–16:00 turns **Short 1 staff** with the line *"…is planned here but unavailable during this interval."* |
| **Pass** | The consequence is immediate and visible, and their coverage was **not** cancelled for you. |

---

## Section 13 — Replace them

| | |
|---|---|
| **Do** | From the same panel, choose another staff member and plan coverage. |
| **See** | The replacement appears; the called-out person is still shown truthfully as planned but unavailable; the room returns to **Staffed**. |
| **Pass** | You can recover from a call-out in one place. |

---

## Sections 14–15 — Plan vs actual · expected vs actual children

**FIXTURE LIMITATION — not a product pass or fail.** Nobody has been checked in on the QA
date, so there is nothing observed to compare against. If you want to try it, check a child
in through **Attendance** for 1 April 2027 and return to the Calendar: expected and actual
should sit side by side, and nothing you planned should change.

---

## Section 16 — Roster and Staff context

| | |
|---|---|
| **Do** | Click the **Roster** tab, then click a person's name. |
| **See** | The site and date are unchanged. Their record opens in the usual panel. |
| **Pass** | Roster and Calendar are two questions about one day, not two products. |

---

## Section 17 — Unknown

| | |
|---|---|
| **Do** | Look at the availability labels, and at any room with nobody expected. |
| **See** | *Availability not recorded* in neutral grey. Rooms with no demand read *No one expected*, not green. |
| **Pass** | Nothing the system does not know is shown as zero, available, adequate or a gap. |

---

## Section 18 — Scope

| | |
|---|---|
| **Pass** | You see only your own organisation's sites and staff, and only the site you selected. |

---

## Section 19 — Speed

Note each as **Pass**, **Slow but usable**, or **Blocking**: Calendar load · date navigation ·
coverage refresh · chooser opening · call-out refresh. No stopwatch needed.

---

## Section 20 — Your verdict

- [ ] Operations is understandable
- [ ] Roster is useful
- [ ] Calendar is useful
- [ ] Child demand is understandable
- [ ] Staffing requirement is understandable
- [ ] Adequate vs Gap is trustworthy
- [ ] I can understand why a gap exists
- [ ] I can find staff who could cover
- [ ] Availability status is trustworthy
- [ ] I can plan Coverage
- [ ] I can change/cancel Coverage
- [ ] Split-day Coverage makes sense
- [ ] A call-out visibly changes staffing state
- [ ] I can replace called-out staff
- [ ] Plan vs Actual is understandable
- [ ] Expected vs Actual children are understandable
- [ ] UNKNOWN states are honest
- [ ] I would trust this for daily staffing operations

**Classify:** HUMAN QA PASS · HUMAN QA PASS WITH NON-BLOCKING DEBT · HUMAN QA FAIL — REPAIR REQUIRED

---

## Capturing a problem

```
SECTION / STEP:
EXPECTED:
OBSERVED:
SITE / DATE:
ROOM / STAFF / CHILD:
SCREENSHOT:
BLOCKING?  yes / no
```

You are not asked to work out why. Describe what you saw.

---

## Afterwards — clearing the QA setup

**Do not do this until the walkthrough is finished.** Then, through the product:

1. Cancel any Coverage created during the walkthrough.
2. Cancel the call-out (the availability exception) on *Active-Located* for 1 April 2027.
3. Clear the QA child's hours back to unrecorded, and retire the Infant A ratio rule, if
   this tenant should return to the state it was in before.

Everything above was created through the product, and everything can be undone the same way.
