---
owner: platform
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Operations Calendar — a walk through it

Written from the shipped screen, not from a plan. Ten minutes, no setup, nothing to
install. If a step does not match what you see, that is a finding worth reporting.

## Open it

1. Open **Operations** from the left sidebar.
2. Pick a site from the picker at the top right of the panel.
3. Click **Calendar**, the tab beside Roster.

You land on today. The date sits at the top left with `‹` and `›` either side; a **Today**
button appears once you have moved away from it.

## Read the day

Each row is a room, and the last row is the site itself — that row is where staff planned
at the site with no particular room appear. It is labelled "Site — no room" rather than
left blank, because that is a real allocation and not a rendering gap.

The line beside each room name reads: how many children are expected at the busiest point,
how many are present, how many staff are needed, how many are planned, and how many are
actually here. A chip says **Staffed**, **Short**, **Unknown** or **No one expected**.

The strip to the right is the operating day. Every block is a stretch during which nothing
changed — the blocks are cut where a child's hours start, a shift ends, Coverage moves
somebody, or somebody arrives. **A fifteen-minute block really is fifteen minutes wide.**
Nothing is rounded to half-hours, which is the point: a short handover gap is exactly what
a half-hour grid would hide.

Colour is deliberately quiet. Green only where the room was evaluated and met. Attention
gold where it is short. Grey where the answer is unknown or nobody is expected — grey is
never "fine", it is "we are not claiming".

## Ask why

Click any block. The panel below tells you, in the same words everywhere in Alloy:

```
Expected children: 10
Required staff: 3
Baseline staff: Alex and Sam
Planned staff: Alex and Sam
Jordan is available but not planned anywhere during this interval
Short 1 staff
```

Those lines come from the staffing projection itself, so the Calendar cannot tell you one
story while another screen tells you a different one.

Under **Planned here** you see each person, whether they are there because of their
Assignment or because of Coverage, and whether they have actually been observed there.

## Fix a gap

The panel offers **your site's staff**, each with what the system actually knows about them:

- **Available** — their availability is recorded and says yes for this stretch.
- **Unavailable** — recorded, and the answer is no. The reason is shown when there is one.
- **Availability not recorded** — nobody has ever told the system when they can work. That
  is not a yes and it is not a no, and you will never see them described as available.

Anyone already planned elsewhere in that stretch is still listed, with *already planned*
beside them, so you can decide whether to move them rather than wondering where they went.

Click **Plan ⟨name⟩ here**. The Calendar already knows the site, room, date and exact
interval, so there is nothing to retype. The day reloads and the gap should close.

If that person is already planned somewhere else for part of the time, you will be told so
in those words — never a database message — and nothing is moved or cancelled behind your
back.

## Move someone, and put them back

On a stretch where someone was placed by Coverage, **Cancel Coverage** withdraws that
allocation. The row stays in history as cancelled and the person falls back to where their
Assignment puts them. The day reloads so you can see it happen.

## When someone calls out

Next to a planned person, **Called out** records that they cannot work that day.

The picture changes immediately. They stay listed as planned — the schedule did say they
would be there, and hiding it would hide why the room is now short — but they are marked
**Unavailable**, with the reason, and they stop counting towards the room's requirement. If
that leaves the room under-staffed, the stretch turns short and the chooser opens for a
replacement.

**Their Coverage is not cancelled for you**, because the rooms they were covering are your
decision, not the system's. Plan a replacement, then cancel or change their Coverage
deliberately.

The same distinction runs through the whole screen: what was *planned* and what is *possible*
are two different facts, and neither is quietly rewritten to match the other.

## What you should never see

- A room rendered green when the system could not work out what it needed. It says
  **Unknown**.
- A future day showing "0 present" as though everyone were absent. Until anything is
  observed, the day says so.
- Coverage edited to match where someone actually turned up. Planned and actual are shown
  side by side, and you decide which one is wrong.
- A child counted in a stretch when their hours were never recorded. They are counted
  nowhere, and the panel says how many are in that position.

## Getting back

**Roster** is the same day asked a different question — who belongs here and who is
present. Switching between the two tabs keeps your site and your date; you will not have to
navigate back.

Clicking a person's name opens their record in the usual Focus Panel, the same one you get
from anywhere else in Alloy.
