---
owner: platform
status: canonical
last_reviewed: 2026-09-22
supersedes: []
---

# Spaces — 15 minutes, in your own words

This is for you to walk yourself. It is not an engineering report, and it does not
assume you know how anything is built.

**Where:** https://staging.workwithalloy.com → Organization → Locations → **North Campus**
**Sign in as:** your usual staging account
**Build:** `3cd0e0483`

You are checking one idea: **you can describe the places at your centre, and say how many
children fit, without leaving the thing you are describing.**

Use your own names as you go — `Room A`, `Toddler AM`, whatever is natural. You will see a
few spaces called "QA …" already there; those are mine from testing. Ignore them.

---

## 1. Open the collection

Click **North Campus**, then the **Spaces** tab.

**You should see** a tab called Spaces, and — importantly — **no Operational Rules tab**.
Everything you need to configure a space is on the space.

☐ PASS ☐ FAIL

---

## 2. Narrow the list

Above the list, click **Operational**, then **Physical**, then **All**.

**You should see** counts beside each, and the list narrowing to match. Operational spaces
are the groups children belong to; Physical spaces are places.

☐ PASS ☐ FAIL

---

## 3. Create a physical space

**+ Add space** → **Kind** = *Physical* → name it `Room A` → Capacity **24** → Save.

**You should see** exactly two choices under Kind: Operational and Physical. You should
not be asked for Programs, a schedule or a ratio — those belong to a group, not a room.

☐ PASS ☐ FAIL

---

## 4. Create a group inside it

**+ Add space** → **Kind** = *Operational* → name it `Toddler AM` → **Physical space** =
`Room A` → Capacity **10** → Save.

**You should see** it created, showing Kind *Operational* and Physical space *Room A*.

☐ PASS ☐ FAIL

---

## 5. Set the staffing ratio — inside the same edit form

Click **Edit space** on `Toddler AM`. Scroll to **Staffing ratio**, inside the same form as
the name and capacity. Click **+ Add tier** twice and fill the two columns:

| Staff | Children |
|------:|---------:|
| 1     | 5        |
| 2     | 11       |

Then **Save space** — one button for the whole space.

**You should see** `1:5 · 2:11`, written the way you say it. If it shows anything like
`1:1 ≤ 5`, that is a FAIL — that was the old bug that made your ratios look lost. You
should never have been sent to another screen to set it.

☐ PASS ☐ FAIL

---

## 6. A second group in the same room

**+ Add space** → Operational → `Toddler PM` → Physical space `Room A` → Capacity 10 → Save.

☐ PASS ☐ FAIL

---

## 7. Look at the room from its own page

Open `Room A`.

**You should see** an **Operational spaces** line listing *Toddler AM* and *Toddler PM*.
One room, two groups — readable from either side.

☐ PASS ☐ FAIL

---

## 8. A playground

**+ Add space** → Kind *Physical* → `Playground` → leave Capacity blank → Save.

**You should see** a physical space with no capacity, no programs, no ratio and no
operational spaces — created without you learning any special word for it.

☐ PASS ☐ FAIL

---

## 9. A group that is not in any room

**+ Add space** → Operational → `Infant AM` → leave **Physical space** empty → Save.

**You should see** it created normally. A group does not need a room around it.

☐ PASS ☐ FAIL

---

## 10. Where children can be assigned

Start a placement or schedule for a child at North Campus.

**You should see** your operational spaces offered — and **not** `Room A`, **not**
`Playground`.

☐ PASS ☐ FAIL

---

## 11. Where staff can be assigned

Same check for a staff classroom assignment: operational spaces only.

☐ PASS ☐ FAIL

---

## 12. Where people can be marked present

Open Attendance for North Campus.

**You should see** `Playground` available as a place someone can be.

☐ PASS ☐ FAIL

---

## 13. Infant A — a disagreement we will not settle for you

Open **Infant A** at North Campus and look at Staffing ratio.

**You should see** a *Ratio needs review* note showing both records:

    Recorded earlier:  1:5 · 2:11
    Configured now:    1:4 · 2:8 · 3:12

**Nothing has been changed.** Which one is right is a staffing-law decision, and only you
can make it. Clicking **Review ratio** opens the editor with *neither* filled in, on
purpose.

☐ PASS ☐ FAIL

---

## 14. Ordinary configuration never needs a rules page

Think back over the last ten minutes: capacity, ratio, programs, schedule, the room a
group sits in — all of it was set on the space itself.

☐ PASS ☐ FAIL

---

## 15. No rule-engine machinery in ordinary space management

Look over a space's detail again.

**You should NOT see** a *Capacity limits* section or an *Advanced rules and history* link.
The versioned rule engine still exists underneath — history, effective dating and audit are
all intact — but ordinary space management no longer sends you there.

☐ PASS ☐ FAIL

---

## 16. Does it feel like Alloy?

**You should see** the same shell, cards, spacing and buttons as the rest of the product.

☐ PASS ☐ FAIL

---

## Your verdict

☐ **PASS** — ship it
☐ **PASS WITH ISSUES** — usable, with the notes below
☐ **FAIL** — something in the ordinary journey is broken

**Notes:**

```
(what you saw, in your words — where you were, what you expected, what happened)
```

---

### Things you may notice, which are known

- **Eleven spaces named "QA …"** at North Campus were mine from mounted testing. Each was
  proven to carry no real history — no attendance, placements, schedules, staff or
  programs — and all eleven have been retired, along with the capacity and ratio rules they
  owned. Alloy has no way to *delete* a space: the Locations API offers create and update
  only. They are therefore deactivated rather than erased, and whether they still appear in
  your list depends on that. If you see them marked Inactive, that is why, and removing them
  for good needs a decision from you.
- **Toddler 1 and Toddler 2** had their capacity recorded as a *licensed* ceiling by the
  old adoption flow, and that was corrected to ordinary capacity. Both read 10.
- **Twelve other spaces** still carry an old ratio written as free text. Each will show
  *Ratio needs review* until someone confirms it. Nothing was guessed on your behalf.
- **Operating hours and schedule rules** are not on a space. They have never been
  configured anywhere, so there was nothing to move; the rules engine still supports them.
