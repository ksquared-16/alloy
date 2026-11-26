# Attendance V1 — Demo Runbook

A 12–15 minute demonstration with one story: **a nursery's morning, and what the
system knew about it.**

This is not the QA guide. It shows the strongest certified experience and
deliberately avoids anything unfinished. Every step lists what to click, what to
say, what should appear, and what to do if the tenant is not where you expect.

---

## Before you start

**Tenant readiness — check all seven. If any fails, fix it before the audience arrives.**

| # | Check | Where |
|---|---|---|
| 1 | A site with at least two rooms, one of them a playground or shared space | Configuration → Organization → Programs & Locations |
| 2 | At least 6 children expected today, in at least two rooms | Operations → Work → Attendance |
| 3 | Nobody checked in yet | same |
| 4 | One child with a holiday recorded for **today** (for step 7) | recorded the day before |
| 5 | One active attendance device bound to this site | Configuration → Organization → Attendance devices |
| 6 | One adult with a kiosk code and collection authority for a child | |
| 7 | A holiday earlier this week for a child whose policy earns credit | for step 11 |

**Set the stage.** Open **Operations → Work → Attendance** before the audience
arrives, on the site you will demo. Close every other tab — the Focus Panel and
Analytics will be opened live, deliberately.

**One sentence of framing before you click anything:**

> "Attendance sounds simple until you ask it three questions at once: who is
> expected, who is actually here, and who is *missing* rather than merely absent.
> Most systems answer the first and guess the other two."

---

## The demo

### 1 — The day, before anyone arrives  *(60s)*
**Click.** Nothing — you are already here.
**Say.** "This is this morning. Twenty-two expected, nobody here yet, and
twenty-two not arrived. In a minute the interesting number is going to be the
third one."
**Expect.** Expected / Here now / Not arrived, and rooms with their children.
**If wrong.** Somebody has already checked in — either use it ("we're mid-morning
already") or switch to a site that is still quiet.

### 2 — Check a child in  *(60s)*
**Click.** A child → **Check in**.
**Say.** "Here now goes up, not arrived comes down. That is the whole point of
the third number — it is the children nobody has explained."
**Expect.** Both counts move immediately.
**Deeper, if asked.** "Every one of these is an append-only fact with who
recorded it and how — we never overwrite the past."
**If wrong.** Refresh once. If counts still lag, move to step 3 and mention it
afterwards rather than debugging live.

### 3 — Move her to the playground  *(90s)*  ← *the moment that lands*
**Click.** Same child → **Move to…** → the playground.
**Say.** "She has gone outside. Watch **Here now**." *(pause)* "It did not change.
She is still one child — she is just somewhere else. And her classroom is still
her classroom: moving a child is not re-enrolling her."
**Expect.** She appears in the playground. *Here now* unchanged. Her committed
room unchanged.
**Deeper, if asked.** "Most systems conflate 'which room is she on the register
for' with 'which room is she standing in'. The day they diverge is the day you
cannot find a child."
**If wrong.** If *Here now* moved, stop the demo point and note it — that is a
real bug and worth more than finishing the slide.

### 4 — The two surfaces agree  *(60s)*
**Click.** Open the same child's **Focus Panel**.
**Say.** "The workspace and the child's own record are not two opinions. They read
the same reconstruction of the day."
**Expect.** The Focus Panel names the playground.
**If wrong.** A disagreement here is the most quotable bug in the product — say
so plainly and move on.

### 5 — Somebody phones in sick  *(60s)*
**Click.** Another child → **Mark absent…** → **Off sick**.
**Say.** "Not arrived just came down by one. She is still not here — but she is no
longer *missing*. That distinction is the difference between a morning of phone
calls and a morning of work."
**Expect.** *Not arrived* falls; she shows as away with the reason.

### 6 — A holiday, planned in advance  *(45s)*
**Click.** Point at the child on holiday today.
**Say.** "Recorded days ago. The system expected her to be away, so nobody is
chasing her this morning."

### 7 — The child who turned up anyway  *(90s)*  ← *the second moment*
**Click.** Check that holidaying child **in**.
**Say.** "She was on holiday and she is standing in the hall. Both things are
true, and the system says both: she is present for every practical purpose, and
it still shows that nobody expected her."
**Expect.** *Here now* rises; the day still shows she was not expected.
**Deeper, if asked.** "Reality did not make the plan retrospectively false. We
never rewrite what was believed at the time — that is what makes the record worth
trusting later."
**If wrong.** If her holiday silently disappears, stop and note it.

### 8 — Arrival at the front door  *(90s)*
**Click.** The kiosk tablet → enter the adult's code → pick the child → confirm.
**Say.** "Same attendance, different door. The tablet is a trusted device bound to
this site — it cannot record for anywhere else, and the record knows the arrival
came from it."
**Expect.** The child appears present in the workspace.
**If wrong.** Skip to step 9 and come back if time allows — never debug a device
in front of an audience.

### 9 — A correction  *(60s)*
**Click.** Correct or undo one of the morning's entries.
**Say.** "Somebody tapped the wrong child. We correct rather than delete — the
day now reads correctly, and the fact that it was corrected is still there."
**Expect.** The day reads as though the mistake never happened; no double count.

### 10 — Collection  *(45s)*
**Click.** Check the first child out.
**Say.** "Collected. She leaves *Here now* and the room stops showing her."
**Optional, only if the tenant is set up for it.** Attempt a collection by an
adult without authority and show that the kiosk simply directs them to staff —
**and say why it gives no reason**: "it will not tell a queue of parents anything
about a family's arrangements."

### 11 — What it cost  *(90s)*
**Click.** **Financials**.
**Say.** "Earlier this week a child was on holiday, and that family's agreement
earns a credit. Attendance did not calculate that — it caused it. The money is
worked out here, against the price this family actually agreed."
**Expect.** A credit traceable to the attendance statement.
**Deeper, if asked.** "Attendance never does money. If it did, you would
eventually have two numbers and no way to know which was right."
**If wrong.** Say the sentence anyway and show the consequence state instead —
the ownership point survives without the figure.

### 12 — The day as numbers  *(90s)*
**Click.** **Analytics** → the **Attendance** pack.
**Say.** "The same morning, measured. Expected, here now, not arrived, known
away. These are not a separate calculation — they read the same interpretation
you have been watching, which is why they cannot drift from it."
**Expect.** The figures match the workspace.
**Deeper, if asked.** "Current figures are never served from stored history. A
count from an hour ago is not a stale version of 'who is here now' — it is a
different question, so we refuse to answer one with the other."

---

## Closing line

> "Everything you saw came from one idea: record what happened, never overwrite
> it, and keep *where a child is* separate from *where she belongs*. Every number
> in the last ten minutes is a reading of the same facts."

---

## Demo safety

**Never** in a demo:
- touch the database, run a script, or open a terminal;
- demonstrate a named third-party integration — none is built;
- show a parent portal or teacher app — neither exists in V1;
- show device health, "last seen", or an attendance-rate trend — all deferred;
- leave a real family's names on the kiosk screen; finish the visit;
- show credentials, or re-display a device code.

**If the tenant is badly out of state**, run steps 1–5 and 12 only. That is still
a coherent story — the day, a movement, an explained absence, and the numbers —
and it fits in six minutes.
