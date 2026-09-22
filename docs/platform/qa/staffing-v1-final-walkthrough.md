---
owner: platform
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Staffing V1 — final operator walkthrough

Twenty minutes. Nothing to install. Every step says where to be, what to click, what you
should see, and what counts as a pass.

## Before you start — the QA fixture

| | |
|---|---|
| **Site** | North Campus |
| **Date** | any weekday the site operates; the examples below used **1 April 2027** |
| **Room** | Infant A |

Two steps need a fixture that does **not** exist on staging today, and they are marked
**FIXTURE NEEDED** where they appear:

- **A room that requires staff.** Every child assignment on staging has its recurrence
  recorded but no hours, so no room ever requires anybody and no gap can form. To exercise
  "find a gap and fill it", one child assignment needs hours recorded for the QA date.
- **An observed arrival.** Plan-versus-actual needs someone checked in through Attendance
  or Presence on the QA date.

Everything else runs against staging exactly as it is.

## 1–4. Get to the day

1. Open **Operations** from the left sidebar.
2. Choose your site in the picker, top right of the panel.
3. Click the **Calendar** tab, beside Roster.
4. Move to your date with `‹` and `›`. **Today** returns you to the current day.

**PASS:** the date reads as a full weekday and date, and each room is a row.

## 5–8. Read the day

5. **Expected children** — the first number on a room's line.
6. **Required staff** — "needs N" on the same line. If it says *needs unknown*, no ratio
   covers that occupancy, and that is the honest answer rather than a zero.
7. **Planned staff** — "N planned". Click any block to see who, and whether they are there
   because of their Assignment or because of Coverage.
8. Find a room whose chip reads **Staffed**.

**PASS:** a covered room reads Staffed; a room with nobody expected reads *No one expected*
in neutral grey, never green.

## 9–12. A gap, and why

9. Find a room whose chip reads **Short**. *(FIXTURE NEEDED — see above.)*
10. Click the short block. The panel lists what is expected, what is required, who is
    planned, and **Short N staff**.
11. Scroll to **Who could cover this stretch**.
12. Read each person's status:
    - **Available** — their availability is recorded and says yes for this stretch.
    - **Unavailable** — recorded, and the answer is no. The reason is shown.
    - **Availability not recorded** — nobody has told the system when they can work.

**PASS:** all three wordings are possible, and nobody with no record is ever described as
available. Anyone already planned elsewhere is still listed, marked *already planned*.

## 13–14. Fill it

13. Click **Plan ⟨name⟩ here**. Nothing to retype — the site, room, date and exact interval
    are already known.
14. The day reloads.

**PASS:** that person now appears in the room with **Coverage** beside their name, and the
room's chip improves. *(FIXTURE NEEDED for the chip to move from Short to Staffed.)*

## 15. Split the day

15. From a different stretch of the same day, plan the same person into another room.

**PASS:** they appear in both rooms at different times and are counted **once** — the two
stretches never overlap.

## 16–18. Someone calls out

16. Click a planned person's **Called out** button.
17. The day reloads.
18. Look at the room again.

**PASS:** they are **still listed as planned** — the schedule did say they would be there —
and marked **Unavailable**, with the reason. They no longer count towards the room, and the
explanation reads *"⟨name⟩ is planned here but unavailable during this interval"*. Their
Coverage is **not** cancelled for you. *(FIXTURE NEEDED for the room to turn Short as a
result.)*

## 19–20. Replace them

19. In the same panel, open the chooser and pick someone else.
20. Click **Plan ⟨name⟩ here**.

**PASS:** the replacement appears as planned Coverage; the person who called out is still
shown, truthfully, as planned but unavailable.

## 21. Undo

21. Beside a person placed by Coverage, click **Cancel Coverage**.

**PASS:** they fall back to where their Assignment puts them, and the allocation stays in
history as cancelled rather than disappearing.

## 22. Plan against actual

22. Compare who is planned with who was observed. *(FIXTURE NEEDED — an arrival must be
    recorded for the date.)*

**PASS:** planned and observed are shown side by side. The Calendar never edits one to match
the other.

## 23. Back to Roster

23. Click the **Roster** tab. Click a person's name anywhere to open their record.

**PASS:** your site and date are unchanged — Roster and Calendar are two questions about one
day, not two products.

## What you should never see

- A room rendered green when the system could not work out what it needed. It says
  **Unknown**.
- A future day showing "0 present" as though everyone were absent.
- Someone described as available when nobody ever recorded their availability.
- Coverage edited to match where someone actually turned up.
- A person counted twice for being in two rooms at different times of the day.
