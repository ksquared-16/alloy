# Attendance V1 — Director QA Guide

A human-executable pass over the promoted Attendance product. Written for a
product owner, not an engineer: no scenario below asks you to read code, open a
database, or know a table name.

**Read this first — three honesty notes.**

1. **Where something is deliberately absent, this guide says so** and marks the
   scenario `DEFERRED BY DESIGN`. That is a passing result, not a gap. Do not
   file a bug for it.
2. **Some capabilities are foundations, not finished products.** They are labelled
   `FOUNDATION` and the guide tells you exactly what you can and cannot expect to
   see. A foundation that has no screen is working as intended.
3. **If a navigation path below does not match what you see, stop and file a
   bug.** The paths were taken from the promoted build; a mismatch is itself a
   finding.

## Operator vocabulary used throughout

| You will see | It means |
|---|---|
| **Expected** | children the day expects, after known intent is applied |
| **Here now** | children physically in the building |
| **Not arrived** | expected, absent, and **nobody has explained why** |
| **Checked out** | collected and gone for the day |
| **Off sick / On holiday / Appointment / Family day** | the recorded reasons a child is away |
| **Public holiday / Staff training / Bad weather / Building works** | the recorded reasons a site or room is not operating |

## Primary navigation

- **Operations** (left rail) → **Work** → tabs **Roster · Attendance · Staff · Children**
- **Configuration** → **Organization** → **Access**, **Attendance devices**, **Connected systems**
- **Configuration** → **Operations** → **Expected absence and closures**
- **Analytics** (left rail) — Operational Intelligence packs
- **Financials** (left rail)
- Kiosk device: the `/kiosk` address on the tablet

---

# A. Setup and configuration

### ATT-QA-01 — See the room hierarchy an operator actually has
**Why this matters.** Attendance is recorded against rooms and groups. If the
hierarchy is wrong, every later scenario is wrong.
**Starting state.** At least one site with rooms.
**Navigation.** Configuration → Organization → Programs & Locations → pick a site.
**Steps.** 1. Open the site. 2. Read its list of rooms.
**Expected result.** Every room belonging to the site appears — including any
room that sits *inside* another room (a classroom within a larger licensed
space). Counts and capacity totals include those nested rooms.
**Cross-checks.** Operations → Work → Attendance: the same rooms appear as
destinations.
**Bug indicators.** A classroom you know exists is missing from the site's list;
a room count that is visibly lower than the rooms you can name.
**Reset.** None needed — read-only.

### ATT-QA-02 — Set who may record attendance
**Why this matters.** Until Thread 8 this was invisible: everyone silently had
site-wide capture. It is now an explicit choice.
**Starting state.** A staff user who is a member of the org.
**Navigation.** Configuration → Organization → Access → pick the person → **Role & Access**.
**Steps.** 1. Scroll to **Attendance capture**. 2. Read the question *"Whose
attendance can this person record?"* 3. Choose **Any child at the locations
above**. 4. Save. 5. Return and switch to **Only children in the rooms and groups
they are assigned to**. 6. Save.
**Expected result.** Before a choice is made the card reads *"Not configured yet —
choose one to save."* and **Save access is disabled**. After choosing, Save works
and the choice persists on reload.
**Cross-checks.** None required.
**Bug indicators.** The card pre-selects an option you did not choose; Save is
enabled while the card still says "Not configured yet"; the choice does not
persist.
**Reset.** Leave the person on the setting the site actually uses.

### ATT-QA-03 — Register and revoke an attendance device
**Starting state.** A site exists. You are an Access administrator.
**Navigation.** Configuration → Organization → **Attendance devices**.
**Steps.** 1. **Add a device**. 2. Name it *QA tablet*, choose a site, **Add
device**. 3. Copy the code shown. 4. Dismiss with *I have entered it*. 5. Find
the device in **In use**. 6. **Revoke** → **Confirm revoke**.
**Expected result.** The code appears **once**, with a warning that it cannot be
retrieved. After dismissing it, the list shows only the last four characters. A
revoked device moves to a **Revoked** section explaining that past attendance
still shows which device recorded it.
**Cross-checks.** ATT-QA-24 uses the revoked device.
**Bug indicators.** The full code is visible anywhere after dismissal; a revoked
device still appears as in use; **any "last seen", "online" or health indicator
appears** — see the note below.
**Reset.** Leave one active device for the kiosk scenarios.

> **`DEFERRED BY DESIGN`** — there is deliberately **no device health, "last seen"
> or online indicator**. The underlying timestamp is never written, so any such
> badge would be invented. Its absence is correct.

### ATT-QA-04 — Inspect connected systems
**Navigation.** Configuration → Organization → **Connected systems**.
**Expected result.** Each system shows whether it may record attendance, which
sites it may record for, how many identity matches are in use, and — if any
arrived that could not be used — counts phrased in plain language (*"Could not
tell which child or room"*). A system with no sites says it **cannot record
anywhere**.
**Bug indicators.** A provider presented as configured or connected when no
integration exists; any "online"/"last seen" indicator; an empty site list
implying org-wide reach.

> **`FOUNDATION`** — this administers a *generic* producer foundation. No named
> provider integration ships in V1. Classroom Coach in particular is **not
> built**, and the screen says so where it appears.

### ATT-QA-05 — Find where absence and closures are managed
**Navigation.** Configuration → **Operations** → **Expected absence and closures**.
**Expected result.** A page explaining that absence and closures are recorded on
the day, from the Attendance workspace, with a link there — and **no editor on
this page**.
**Bug indicators.** An editor appears here (there must be only one door to this);
the page cannot be found under Operations.

---

# B. The daily attendance day

### ATT-QA-06 — Read today's roster
**Navigation.** Operations → Work → **Attendance**.
**Expected result.** Counts for **Expected**, **Here now**, **Not arrived**, and
rooms with the children expected in each. Before anyone arrives, *Here now* is 0
and the day reads *"No one here yet"* rather than an error or a blank.
**Bug indicators.** Counts that do not add up against the visible children; a
blank screen where a count of zero is the truth.

### ATT-QA-07 — Check a child in
**Starting state.** A child expected today and not yet arrived.
**Steps.** 1. Find the child in their room. 2. **Check in**.
**Expected result.** The child moves to present. **Here now** increases by one and
**Not arrived** decreases by one, immediately.
**Cross-checks.** Open the child's Focus Panel — it must agree that she is here,
and name the same room.
**Bug indicators.** Workspace and Focus Panel disagree; counts do not move; the
child appears in two rooms.
**Reset.** ATT-QA-11 checks her out.

### ATT-QA-08 — Move a child to the playground
**Starting state.** The child from ATT-QA-07 is checked in.
**Steps.** 1. On the child, choose **Move to…**. 2. Choose the playground or
another room. 3. Confirm.
**Expected result.** She now appears in the destination. **Here now is
unchanged** — she is still one child, in a different place.
**Cross-checks.** Her **committed classroom is unchanged**: she is still on her
original room's roster. The Focus Panel names her new location.
**Bug indicators.** *Here now* increases (she has been counted twice); her
placement/classroom changed; the origin room still shows her present.

### ATT-QA-09 — Move between operational groups
As ATT-QA-08 but move her into a different *classroom group*.
**Expected result.** Physical location follows her; roster ownership does not.
**Bug indicators.** The destination group claims her as a placement.

### ATT-QA-10 — Correct a movement
**Steps.** 1. Undo or correct the last movement using the product control offered.
**Expected result.** The record reads as though the move never happened, and she
is one child in her original room — not one in each.
**Bug indicators.** Both rooms show her; *Here now* rises after a correction.

### ATT-QA-11 — Check a child out
**Expected result.** She leaves **Here now** and appears as **Checked out**. Her
room shows her as gone rather than still present.
**Cross-checks.** Focus Panel agrees.
**Bug indicators.** She remains in the room she left.

### ATT-QA-12 — Re-entry after checkout
**Steps.** Check the same child back in after checkout, if your site does this.
**Expected result.** She is **present again**, in the room she re-entered.
**Bug indicators.** She stays "checked out" while visibly present — the record
must follow the later fact.

### ATT-QA-13 — Not arrived means unexplained
**Starting state.** A child expected today, nobody has said anything about her.
**Expected result.** She counts in **Not arrived**.
**Bug indicators.** A child with a recorded reason (ATT-QA-14) also appears here.

---

# C. Known away, closures and exceptions

### ATT-QA-14 — Mark a child off sick
**Steps.** 1. On an expected child, **Mark absent…**. 2. Choose **Off sick**. 3. Confirm.
**Expected result.** She is shown as away with the reason. **Not arrived
decreases** — she is explained now.
**Cross-checks.** Operational Intelligence (ATT-QA-33) counts her under
known-away, not under not-arrived.
**Bug indicators.** *Not arrived* does not fall; she appears both away and missing.

### ATT-QA-15 — Holiday over a date range
**Steps.** Record **On holiday** across several days including a future day.
**Expected result.** Each affected day shows her as away with that reason.
**Cross-checks.** Financials (ATT-QA-30) for any credit the policy allows.

### ATT-QA-16 — Withdraw a planned absence
**Steps.** Reverse or withdraw the holiday.
**Expected result.** The day returns to expecting her. The record shows the
change rather than erasing the original statement.
**Bug indicators.** The earlier plan vanishes with no trace.

### ATT-QA-17 — Close the site for the day
**Steps.** **Close today…** → **Public holiday** → confirm.
**Expected result.** The day reads as closed. **Children do not become a list of
missing arrivals.**
**Bug indicators.** *Not arrived* jumps to the size of the roster. That is the
single most important failure in this section.

### ATT-QA-18 — Close one room only
**Expected result.** Only that room's children are affected; the rest of the site
operates normally.

### ATT-QA-19 — A child attends despite the plan
**Starting state.** A child recorded as **On holiday** today.
**Steps.** Check her in anyway.
**Expected result.** She is **physically present** and counted in *Here now* —
and the day still shows that she was not expected. Both facts survive.
**Bug indicators.** Her holiday is silently erased; or she is refused/ignored
because a plan said otherwise.
**Reset.** Check her out; leave the holiday as it was.

---

# D. Kiosk

### ATT-QA-20 — Ordinary arrival at the kiosk
**Starting state.** An active device (ATT-QA-03) bound to your site; an adult with
a code and pickup authority for a child.
**Navigation.** The `/kiosk` address on the tablet.
**Steps.** 1. **Enter your code**. 2. Choose the child. 3. Confirm arrival.
**Expected result.** The child is checked in, and appears in the operator
workspace exactly as an operator check-in would.
**Cross-checks.** Operations → Work → Attendance: she is present, and the record
shows the arrival came from the device.
**Bug indicators.** The kiosk succeeds and the workspace does not show her.

### ATT-QA-21 — Siblings
**Expected result.** One code offers **all** children that adult may act for, and
each can be handled in one visit.
**Bug indicators.** Only one sibling offered; a child offered who belongs to a
different family.

### ATT-QA-22 — Collection by an authorized adult
**Expected result.** Checkout succeeds only for an adult the family authorized to
collect **that** child.

### ATT-QA-23 — Someone who may not collect
**Starting state.** An adult related to the child but **not** authorized to collect.
**Expected result.** The kiosk **declines and directs them to staff**. It must
**not** say why.
**Bug indicators.** Collection succeeds; or the screen explains the reason,
names a restriction, or mentions safeguarding. Any of those is **P0** — it
broadcasts the most sensitive fact the platform holds to whoever is in the queue.

### ATT-QA-24 — Revoked device
**Starting state.** The device revoked in ATT-QA-03.
**Expected result.** It cannot record anything. No attendance appears.

### ATT-QA-25 — Wrong site
**Expected result.** A device bound to Site A cannot record children at Site B.

### ATT-QA-26 — Double tap
**Steps.** Confirm the same arrival twice quickly.
**Expected result.** **One** arrival is recorded, not two.

### ATT-QA-27 — Privacy between visits
**Expected result.** After a visit finishes the screen returns to **Enter your
code** with no previous family's names left visible.
**Bug indicators.** Any child or adult name still on screen for the next person.
**Severity if failed.** P0.

---

# E. Teacher and staff capture · `FOUNDATION`

> Capture authority is configurable (ATT-QA-02) and enforced by the server.
> **There is no separate teacher application in V1.** Do not expect one.

### ATT-QA-28 — Assignment-scoped capture behaves as configured
**Starting state.** A staff user set to **Only children in the rooms and groups
they are assigned to**, with at least one assignment.
**Expected result.** They can record attendance for children in their assigned
rooms and are refused elsewhere. A person with **no** assignment can record for
nobody — that is correct, and is why the setting warns about it.
**Bug indicators.** An assignment-scoped person can record anywhere.

---

# F. Family intent · `FOUNDATION` — bounded, not a Parent Portal

> A family can submit a **bounded** absence/holiday intent through a link they
> are sent. There is no parent login, no parent dashboard, and no general family
> app in V1.

### ATT-QA-29 — A family submits an absence
**Expected result.** The submission appears as **intent** about a named child on
named days, and the operator remains the one who decides what the day means.
**Bug indicators.** A family submission silently becomes an attendance fact; a
link acts on the wrong child; an expired or revoked link still works.

---

# G. Financial consequence

> Attendance **causes** consequences; it never calculates them. Every amount
> lives in Financials.

### ATT-QA-30 — Holiday that earns a credit
**Starting state.** A child whose commercial policy allows holiday credit, with a
holiday recorded (ATT-QA-15).
**Navigation.** **Financials**.
**Expected result.** A credit consequence traceable back to the attendance
statement that caused it, valued using the pricing the family agreed to.
**Bug indicators.** An amount that disagrees with Financials; any monetary figure
shown inside Attendance.

### ATT-QA-31 — Holiday that earns nothing, and ordinary sickness
**Expected result.** No credit. The day is still recorded correctly.
**Bug indicators.** A credit appears where policy grants none.

### ATT-QA-32 — Correction before posting
**Steps.** Withdraw a holiday that produced an unposted consequence.
**Expected result.** The consequence is withdrawn or superseded rather than left
stranded.

> **`DEFERRED BY DESIGN`** — Attendance screens do **not** yet display a
> financial-consequence line. The derivation exists and is not mounted. Check
> consequences in **Financials**; do not file a bug for the missing line.

---

# H. Operational Intelligence

**Navigation.** **Analytics** (left rail) → the **Attendance** pack.

### ATT-QA-33 — The day's numbers agree with the day
**Expected result.** **Expected**, **Here now**, **Not arrived**, **Checked out**,
**Known away** and **Unresolved service day** match what Operations → Work →
Attendance shows for the same site, at the same moment.
**Bug indicators.** Any disagreement with the workspace. Particularly: a
known-away child counted as not-arrived, or a closed day producing a large
not-arrived number.

### ATT-QA-34 — Children on site now
**Expected result.** Matches the number physically present. After a move
(ATT-QA-08) the total is **unchanged**.
**Bug indicators.** The total rises when a child moves.

### ATT-QA-35 — Site filter
**Expected result.** Narrowing to a site shows that site's numbers. A site you are
not permitted to see is reported as **unavailable — never as zero**.
**Bug indicators.** A zero appears where you lack permission. Zero reads as "the
building is empty", which is a claim the product has no right to make.

### ATT-QA-36 — Live figures are never stale
**Steps.** Check a child in, then re-read the Attendance metrics.
**Expected result.** The number reflects the change now. Current-state figures are
never served from stored history.
**Bug indicators.** A current count that lags behind the workspace.

### ATT-QA-37 — Integration health moves independently
**Expected result.** Events another system sent that could not be used appear in
integration health and **do not change any child count**.
**Bug indicators.** A child count moves because a provider sent something.

### ATT-QA-38 — Consequences awaiting a decision
**Expected result.** A count of attendance consequences waiting on a billing
decision — **a count, never an amount**.

> **`DEFERRED BY DESIGN`** — there is **no historical attendance-rate metric** in
> V1 (no attendance rate, absence rate, late-arrival or early-departure). The only
> available windowed source does not apply known-away, so a rate built on it would
> contradict the live figures about the same child on the same day. Mark these
> `DEFERRED BY DESIGN`, not missing.

> **`DEFERRED BY DESIGN`** — there is **no staffing or ratio metric**. Staff
> supply is not modelled, so any ratio figure would have an invented denominator.

### ATT-QA-39 — Trends are honest
**Expected result.** A metric with fewer than two comparable historical points
says **no trend yet**. No arrow is shown that is not earned.
**Bug indicators.** A trend arrow on a single data point; a current figure
presented as if it had history.
