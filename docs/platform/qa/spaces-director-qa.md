---
owner: platform
status: active
last_reviewed: 2026-09-22
supersedes: []
---

# Spaces — 15 minutes, in your own words

This is for you to walk yourself. It is not an engineering report, and it does not
assume you know how anything is built.

**Where:** https://staging.workwithalloy.com → Organization → Locations → **North Campus**
**Sign in as:** your usual staging account
**Build:** `9f8b2b944`

You are checking one idea: **you can describe the places at your centre, and say how many
children fit, without leaving the thing you are describing.**

Use your own names as you go — `Room A`, `Toddler AM`, whatever is natural. You will see a
few spaces called "QA …" already there; those are mine from testing. Ignore them.

---

## 1. Open the collection

Click **North Campus**, then the **Spaces** tab.

**You should see** a tab called Spaces — not Rooms — and a list of the places at this
campus, each one labelled Classroom or Physical space.

☐ PASS ☐ FAIL

---

## 2. Create a physical space

Click **+ Add space**. Set **Type** to *Physical space*. Name it `Room A`.
Put **24** in Capacity. Save.

**You should see** exactly two choices under Type — Classroom and Physical space. There is
no third option, and nothing asks you to classify the room as "shared".
You should not be offered Programs or a schedule: those belong to a class, not to a room.

☐ PASS ☐ FAIL

---

## 3. Read it back

**You should see** the space you just made, showing Type *Physical space*, its site, and
**Capacity 24** — on the object itself, with no instruction to go and configure it
somewhere else.

☐ PASS ☐ FAIL

---

## 4. Create a classroom inside it

**+ Add space** → Type *Classroom* → name it `Toddler AM` → **Inside** `Room A` →
Capacity **10** → pick a Program → Save.

**You should see** Toddler AM listed as a Classroom, inside Room A, with capacity 10.

☐ PASS ☐ FAIL

---

## 5. The list and the detail must agree

Look at the row for `Toddler AM` in the list on the left, then at the panel on the right.

**They must show the same capacity.** If the list says one number and the detail says
another — or the detail says capacity is configured elsewhere — that is a FAIL, and it is
the single most important check on this page.

☐ PASS ☐ FAIL

---

## 6. Change your mind

Click **Edit space** on `Toddler AM`, change Capacity to **12**, Save. Then click away to
another space and come back.

**You should see** 12. You should never have been asked for an effective date, a version,
or a capacity type.

☐ PASS ☐ FAIL

---

## 7. A second classroom in the same room

**+ Add space** → Classroom → `Toddler PM` → Inside `Room A` → Capacity 10 → Save.

**You should see** both classrooms listed inside Room A. Room A keeps its own 24 — the
numbers are not added together anywhere.

☐ PASS ☐ FAIL

---

## 8. A playground

**+ Add space** → Type *Physical space* → name it `Playground` → leave Capacity blank →
Save.

**You should see** a Physical space with no capacity, no Programs and no schedule, created
without you having to know any special word for it.

☐ PASS ☐ FAIL

---

## 9. A classroom that is not inside anything

**+ Add space** → Classroom → `Infant AM` → leave **Inside** empty → Capacity 8 → Save.

**You should see** it created normally. A classroom does not need a physical room around
it.

☐ PASS ☐ FAIL

---

## 10. Where children can be assigned

Go to a child and start a placement or schedule at North Campus.

**You should see** your classrooms offered — and **not** `Room A` and **not** `Playground`.
A child is assigned to a group, not to a building.

☐ PASS ☐ FAIL

---

## 11. Where staff can be assigned

Do the same for a staff classroom assignment.

**You should see** classrooms only, for the same reason.

☐ PASS ☐ FAIL

---

## 12. Where people can be marked present

Open Attendance for North Campus and look at where someone can be located.

**You should see** `Playground` available. Children go outside; the system should be able
to say so.

☐ PASS ☐ FAIL

---

## 13. The advanced page still exists

Go to the **Operational Rules** tab.

**You should see** it introduce itself as *Advanced configuration*, and say that everyday
capacity lives on each space. Ratios, operating hours, licensed ceilings and future-dated
changes are all still here.

☐ PASS ☐ FAIL

---

## 14. Licensed capacity is still a separate, deliberate thing

Still on Operational Rules, look at the Capacity Rules section.

**You should see** that setting a *licensed* ceiling is possible here, and that it was
never what you typed on a classroom. Your everyday number and a regulator's limit are not
the same claim.

☐ PASS ☐ FAIL

---

## 15. Nothing asked you to do the same thing twice

Think back over the last ten minutes.

**You should be able to say** that you never had to enter capacity in two places, never
had to leave a space to finish describing it, and were never shown a version or an
effective date for an ordinary change.

☐ PASS ☐ FAIL

---

## 16. Does it feel like Alloy?

**You should see** the same shell, cards, spacing and buttons as the rest of the product —
including on Operational Rules, which used to read like a configuration console.

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

### Two things you may notice, which are known

- **A few spaces named "QA …"** at North Campus are mine from mounted testing. They can be
  deleted or left; they change nothing.
- **Toddler 1 and Toddler 2** had their capacity recorded as a *licensed* ceiling by the
  old adoption flow. That was corrected to ordinary capacity today. Both still read 10.
  Until the end of today the system will still credit the old licensed rule as the binding
  limit, because a rule that is retired today is still in force for today. From tomorrow it
  reads as ordinary capacity with no action from you.
