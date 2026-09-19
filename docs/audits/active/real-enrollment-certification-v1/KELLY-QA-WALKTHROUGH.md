# Enrollment QA — click-by-click

Open **http://127.0.0.1:3014/workspace** and keep this beside the browser. Work top to bottom.

> **Use `127.0.0.1`, not `localhost`.** They are different sign-ins to the browser, and a session
> created on one is invisible to the other — that alone will bounce you to a login screen that looks
> like a bug. The bare address with no path is the Alloy marketing page, so always include
> **/workspace**.

> **This QA server is a production build, on purpose.** It does not recompile, it has no Fast
> Refresh, and nothing an engineer edits can reload the page under you. If the page *does* reload
> itself, that is a real finding — say so, because it should now be impossible.

> **A standing rule for anyone self-certifying this product, including Alloy's own agents:**
> **inspection must not mutate live configuration.** When a control has to be exercised to prove it
> works, exercise it on a temporary QA packet, not on the packet you are about to certify. A previous
> pass proved the Handbook's signature control by toggling it on the live packet and wrote a
> participant instruction that asserted a page count Alloy does not store. It was caught and undone;
> it should not have been possible to do absent-mindedly.

> **Start with PART 0.** It is five minutes and it asks you one question: does the admin experience
> make sense? Parts A–G are the long certification pass and they wait on your answer.

Each step is **DO** (what to click or type) and **EXPECT** (what you should see).
If EXPECT does not match, stop at that step number and report it.

> **STOP AND REPORT IF** a named button is missing, clicking does nothing, a document does not
> render, or anything below says STOP.

The QA child for the live run (Parts D–E) is **Toureeb Tourb0913** (household *Tourb0913 Family*),
already Enrolling through the real Decision path. Earlier configuration-reading parts reference a
different specimen child, which is fine — those parts only read configuration.

## PART 0 — Admin acceptance (short)

Everything below this section is implementation certification that is already done. Part 0 is now
the whole of what you need to look at.

**0.1 DO** — Open **/workspace → Processing → Studio → Packets → Enrollment Paperwork 2026–2027**.

**EXPECT** — One compact strip: `Ready to launch · 3 steps · Enrollment · Enrolling · required ·
blocking · ✓ Ready to use`, a **Preview experience** button, collapsed **Packet settings**, then
**What families complete** with the three obligations — Admissions Information (Collect
information), Family Handbook (Read & acknowledge), Immunization record (Upload a document). No
Technical details section.

**0.2 DO** — Click **Preview experience**.

**EXPECT** — An Alloy **conversation**, not a Form. A progress bar, Alloy saying it already has most
of the child's information and will ask for what is missing, and ONE question with a composer.
If you see eighty empty inputs, stop — that is the old preview and it is a defect.

**0.3 DO** — Type: **What do I still need to do?**

**EXPECT** — Alloy ANSWERS in the thread ("You have 3 of 3 forms left to complete. Right now I
need…") and the question it was already asking is unchanged. Your question must not be recorded as
the answer.

**0.4 DO** — Answer two or three questions in your own words. Then click **Edit** beside a fact
under *What you told us*.

**EXPECT** — The answers appear as *YOU* in the thread, Alloy moves on, and Edit opens an inline
editor with Save/Cancel. This is the same interaction a family gets.

**0.5 DO** — You do NOT need to answer all sixty-five Admissions questions. If you want to see the
Immunization step, ask the engineer to run the QA accelerator on your preview — it answers the
remaining needs through the same runtime, and is admin-only, preview-only.

**EXPECT, once accelerated** — The SAME conversation continues into: *"Before I prepare the
paperwork, please attach Immunization record"*, with **Attach**, in the same thread as your answers.

**0.6 KNOWN BOUNDARY** — **Attach does nothing in preview, by design.** An evidence obligation is
satisfied only by a real stored Document, so preview refuses rather than inventing one. Family
Handbook acknowledgment, signature and completion sit behind that same gate and are therefore not
reachable in preview yet. This is one boundary, named, not a list of broken things.

**0.7 NOTHING WAS CREATED** — No packet session, submission, Document, Processing work,
communication, canonical record or stage change. Measured before and after every run.

### The acceptance question

> Does this feel like the family Enrollment experience you configured?

**YES** → Admin V0.5 accepted → proceed to real E2E.
**NO** → stop and say what felt wrong.

---

## THE ACCEPTANCE QUESTION

> ### Does this now feel like the place where you configure what a family must do during Enrollment?

**If NO** — stop here and say what is wrong. Do not run Parts A–G.

**If YES** — go straight to **Part D** for the live end-to-end run.

---

# PART A — Configuration

**A1. DO** — In the far-left icon rail, click the bottom icon **Organization**.
**EXPECT** — A page titled **Organization Configuration**.

**A2. DO** — Click **Open Business Processes**.
**EXPECT** — A **Business Processes** page. There is one process, **Enrollment**, and it is
**already open** — you do not need to click it. You should see:

- **Enrollment**, badged **Active**
- **6 stages · Healthy**
- a tab row: Overview, Stages, Work Views, Commands, Automation, **Health**, History

> **STOP** if it does not say **Healthy**.

**A3. DO** — Click the **Health** tab.
**EXPECT** — A panel headed **Configuration Health** with the process marked **HEALTHY** and these
rows. Read down the list and check each one:

| Row | Expect |
| --- | --- |
| Workspace tile visible | Ready |
| Queue views published | Ready |
| Queue views match statuses | Ready |
| Records query ready | Info |
| Actions configured | Ready |
| **Families have paperwork to complete** | **Needs fix** — *"No paperwork is required in the LIVE configuration … A saved draft change adds 3 — publish it to apply."* |
| Required paperwork still exists | *Nothing to check — no paperwork is required in the live configuration* |
| Required paperwork is published | *Nothing to check …* |
| Requested documents are identified | *Nothing to check …* |
| Signatures land on the paperwork | *Nothing to check …* |

> **THIS IS THE CORRECT READING, AND IT IS THE DECISION WAITING FOR YOU.**
>
> Everything below the red row used to say *"Every required form resolves"* — three green ticks that
> had checked an empty list. They now say what they actually did, which is nothing.
>
> The red row is honest: **live** Enrollment requires no paperwork, because the packet requirement is
> saved in the draft and has not been applied. The row names that pending change rather than pretending
> it is already true.
>
> **Nothing here is broken and nothing needs fixing.** Applying the Enrollment configuration is what
> turns this green, and that is yours to approve — see the note at the end of Part B.
>
> **STOP** only if a row *other* than "Families have paperwork to complete" reports a problem.

**A4. DO** — Click the **Stages** tab, then click **Enrolling**.
**EXPECT** — The Enrolling stage opens with a **Requirements** section.

**A5. DO** — Click the **Requirements** section to expand it, and scroll to the card headed
**Enrollment paperwork**.
**EXPECT** — ONE paperwork requirement, not a list of forms:

- **Enrollment Paperwork 2026–2027**
- **3 steps · Required · Blocking**
- buttons **Manage** and **Change paperwork**

> **STOP** if you see separate Form requirements here. The stage requires the packet; the packet
> owns its steps. That is the whole point of the change you asked for.

**A6. DO** — Click **Manage**.
**EXPECT** — A focused pop-out titled **Enrollment Paperwork 2026–2027**, saying that editing here
changes the packet and not the process, and listing **Steps, in order**:

1. **Admissions Information** — *Published*
2. **Family Handbook** — *Read & acknowledge*
3. **Immunization record** — *Upload a document*

> This is the sentence to check hardest. Step 1 is a form and says **Published**, because
> publication is a real question about a form. Steps 2 and 3 are **not forms** — they are the other
> two things your packet actually asks of a family — and they say what they ask instead.
>
> **STOP** if steps 2 or 3 name a *form*, or say **Published**/**Not published**. That would mean
> the machinery that runs them has leaked into your view of them.

**A7. DO** — Click **Close**.
**EXPECT** — You are back on the Enrolling Requirements, unchanged.

---

# PART B — What the family completes

These steps are deliberately mechanical. If any of them needs interpretation, that is the finding.

**B1. DO** — Open **http://127.0.0.1:3014/workspace**.
**EXPECT** — The workspace, already signed in.

**B2. DO** — In the far-left icon rail, click **Processing**.
**B3. DO** — Click **Studio**, then click **Packets**.
**EXPECT** — **One packet card, and only one**: *Enrollment Paperwork 2026–2027*, **3 steps · Active**,
and beneath it *Admissions Information · Family Handbook · Immunization record*.

> **STOP** if you see **Cert Packet…**, **Cert Handoff…**, **Handbook probe**, **Mo500…**, or
> **Enrollment — enrolling**. Those are retired certification leftovers.

**B4. DO** — Click **Enrollment Paperwork 2026–2027**.
**EXPECT** — Before anything else, a **Family experience** panel that tells you what a family does,
in order, in plain words:

1. Alloy collects Admissions Information, reusing information it already knows where it can.
2. The family reads and acknowledges Family Handbook, and signs it.
3. The family uploads Immunization record.

Then: *Alloy guides the family through these conversationally… That behaviour is managed by Alloy*,
and *When they finish, the completed packet arrives for staff review in Processing › Work…*

> This is the panel that answers your question. You are configuring **obligations**; Alloy works out
> the conversation from them. There is no prompt here to write, and there should not be.

**B5. DO** — Read the **Ready to use** panel beside it.
**EXPECT** — Three ticks: *Admissions Information published*, *…Family Handbook available*,
*Immunization record identified*.

**B6. DO** — Read **Used by**.
**EXPECT** — **Enrollment · Enrolling stage — required · blocking**, and underneath:
*Saved, not published yet — families are not being asked for this until the process is published.*

> That second line is the one to check. The requirement is configured and waiting for you; it is not
> live, and nothing is being asked of any family until you apply it.

**B7. DO** — Scroll to **What families complete**.
**EXPECT** — Three obligation cards. Each says what it is, then what actually happens:

| # | Card | Says |
|---|------|------|
| 1 | **Admissions Information** — Collect information | **80 questions · 4 connected to Alloy · 76 stored with the form only · 65 required**, then *Alloy confirms information it already knows and asks the family for what is missing…* |
| 2 | **Family Handbook** — Read & acknowledge | the real document's name, **Acknowledgment required · Signature required**, and a **View document** link |
| 3 | **Immunization record** — Upload a document | **Family sends in a document · Filed as Immunization record**, then *…They are not asked to type its contents…* |

> Step 3 is the sentence to read twice. We ask the parent to **send in** their immunization record.
> We do **not** ask them to retype the Oregon vaccine grid. That is correct for this version.
>
> **STOP** if any card names a *form* for steps 2 or 3, or if the words **Included forms** appear
> anywhere on this screen.

**B8. DO** — Look for **Direct distribution and session history**.
**EXPECT** — One collapsed row near the bottom. Sending links by hand and the session inbox still
exist; they are not what you opened this screen to do, so they no longer compete with it.

> ## THE DECISION WAITING FOR YOU
>
> Everything in Part B is **configured and validated, and not live**. Live Enrollment is still
> revision 31 and asks families for no paperwork at all.
>
> Applying the Enrollment configuration is what makes this real. What becomes live:
>
> **Enrollment → Enrolling** begins requiring **Enrollment Paperwork 2026–2027**, *Required* and
> *Blocking*, containing:
>
> 1. **Admissions Information** — Collect information
> 2. **Family Handbook** — Read & acknowledge, and sign
> 3. **Immunization record** — Upload a document
>
> Until you apply it, no family is asked for any of it. Nothing will publish on your behalf.

---

# PART C — Where you decide what is asked

**C1. DO** — On the **Admissions Information** card, click **Manage information**.
**EXPECT** — The Form editor, with exactly two buttons: **✎ Edit** and **▷ Preview**.

**C2. DO** — Look down the form without clicking anything.
**EXPECT** — Every question carries **Required** or **Optional**, and the four questions Alloy already
knows carry a blue **Alloy** mark.

> That is questions 5 and 6 of your list answered without a single click.

**C3. DO** — Click a question marked **Alloy** — for example *Date of birth*.
**EXPECT** — The right inspector shows the question's settings, and under **Store answer in**:
> **Alloy already knows this when available**
> Date of birth — the family is asked only if it is missing, can correct it, and the answer updates
> the record.

**C4. DO** — Now click a question with no **Alloy** mark.
**EXPECT** —
> **Stored with this form**
> Not written to the child or family record. The family is always asked for it.

> **This is where you decide both things**: the **Required / Optional** toggle decides what a family
> must answer, and **Store answer in** decides whether the answer becomes Alloy data or stays with
> the form. Change either here.

**C5. DO** — Click **▷ Preview**.
**EXPECT** — *Form preview — how this information appears when presented as a form.*

> Note the wording. This is the Form as a form. It is **not** the guided conversation Alloy runs a
> family through — that is assembled from the packet's three obligations and is not previewable here.
>
> Admissions Information came from your Formsite export, so it has no source PDF and its native
> canvas is the right editor for now. Using your real documents is the next pass.

**C6. DO** — Click **← Forms** to exit.

---

## C7 — Direct distribution is NOT the Enrollment send path

You will see **Direct distribution and session history** at the bottom of a packet in Studio. It is
collapsed on purpose. Open it if you want, but know what it is before you QA it:

| | |
|---|---|
| **Normal Enrollment send** | child record → **BUSINESS PROCESS** card → **Send enrollment paperwork** → Communications → email. That is Part D. |
| **Direct distribution** | a one-off send of this packet to one family, outside any configured process. Exceptional admin tooling. |

**C7. DO** *(optional)* — Expand it, and in **Send to** type **`Pathb`**.
**EXPECT** — one result, naming the person clearly:

```
Pathb Certopp
Customer: Certopp Family · DOB 2021-11-02
```

Click it and it becomes the selected recipient with a **Change** beside it. **You should never have
to type a UUID.** *Enter ID manually* stays as a fallback for records search cannot reach; it is not
the normal path.

> **STOP** if typing a name produces nothing. That was a real defect — the results were being drawn
> underneath the Studio window and below the bottom of the screen — and it is what stopped this QA
> run. It is fixed.

> **Recent direct sends** shows what is still active. Older links sit behind **View all history**;
> nothing is deleted. Completed runs are reviewed in the **session inbox**, not here.

---


# PART D — Open the child, send the paperwork, receive the email

> **This whole part was re-certified end to end on a real send.** Every step below was executed and
> observed, except D9 — checking the inbox — which only you can do. The old Part D told you to open
> Processing Studio, pick a packet, launch it and copy a participant link by hand. **None of that is
> the product any more.** There is no Studio step, no packet picker, no URL to copy: the Process decides which
> packet a child needs, and Communications carries the link to the family.

**The QA specimen.** Child **Toureeb Tourb0913** (Tourb0913 Family) is already Enrolling, put there
through the real Decision path. Their guardian's email is deliberately set to **Kurz16@gmail.com**
so this run delivers to you — see the note at the end of this part.

**D1. DO** — Click the **Workspace** icon in the left rail, then the **Search…** box at the top.
Type `Toureeb`.
**EXPECT** — A result **Toureeb Tourb0913 — Child · Tourb0913 Family**.

**D2. DO** — Click the words **Toureeb Tourb0913**.
**EXPECT** — The child's own record opens, showing *First name Toureeb*, *Last name Tourb0913*.

> **STOP** if clicking does nothing.

**D3. EXPECT** — Along the top of the record, three context chips: **Enrollment · Registration**,
**Child**, **Household**. **Enrollment · Registration** is already selected.

**D4. EXPECT** — Below the child's details, a **BUSINESS PROCESS** card reading
**CASE · Enrolling · Complete enrollment paperwork and confirm start.**, with two controls:
**Send enrollment paperwork** and **Move to Enrolled**.

> This is the child's own position in the process. The FAMILY case is still at Decision — that is
> correct, not a bug. A child can be further along than the case they came in on.

**D5. DO** — Click **Send enrollment paperwork**.
**EXPECT** — A **New Message** composer opens, already filled in:
- **TO** — the family contact (for this QA child, that is your address);
- **SUBJECT** — *Enrollment paperwork for Toureeb*;
- **MESSAGE** — a short note ending in a link that starts
  `https://vacilandos-mac-mini.tail2aa1af.ts.net:3014/forms/embed/…`

> **STOP** if you are asked to choose a packet, or if the link says `localhost`. Neither should
> ever appear. You are never expected to copy the link yourself.

**D6. DO** — Click **Send**.
**EXPECT** — The composer turns into its own confirmation — **not** a second window on top of it:

```
Ready to send
To      Tourb Tourb0913 · Kurz16@gmail.com
Email   Enrollment paperwork for Toureeb

  the first lines of your message          Show 3 more lines
  🔗 Participant link included

Back to edit                               Confirm send
```

Nothing has been sent yet. The recipient row stays visible above it, and the message is summarised
rather than reprinted in full — you just wrote it.

> **STOP** if the participant-link line is missing. That line is checked against the message that
> will actually be sent, so its absence means the link is not in it.

**DO** — Press **Back to edit**, change one word, then **Send** again.
**EXPECT** — Your edit is still there. Going back is a return to the draft, not a discard.

**D7. DO** — Click **Confirm send**.
**EXPECT** — **Message sent · Email sent to …** and a **Done** button.

> **Sending the same paperwork twice is allowed and is a real second email.** Pressing Confirm twice
> on the SAME send is not: that is one delivery, however many times the button is pressed. If you
> ever see a message about a *send key*, stop and report it — you should never meet one.

> If the send fails you will see **Could not send** with the reason and **Back to edit**, and your
> draft is kept. That message is the truth: if it says it could not send, nothing went out.

**D8. EXPECT** — Back on the Process card, the work is **still outstanding**. Sending the paperwork
is not the family completing it. Nothing should say the packet is done.

**D9. DO — THIS ONE IS YOURS** — Open **Kurz16@gmail.com**.
**EXPECT** — An email *Enrollment paperwork for Toureeb*, containing the participant link.

> Two or three QA messages may already be waiting; the certification run sent a first message and a
> resend. That is expected.

**D10. DO** — Click the link **in the email**.
**EXPECT** — The parent experience opens — continue into **Part E**.

---

## What this part certified, and what it did not

**Certified on a real send:**
- the child opens from search and shows its own **Enrolling** Business Process card;
- **Send enrollment paperwork** resolves the packet (**Enrollment Paperwork 2026–2027**) and the
  guardian with no operator input;
- the participant link uses the externally reachable origin, never `localhost`;
- Communications reported **sent 1 / failed 0** and the delivery audit recorded it;
- **resend** reuses the SAME participant session, journey and packet — no duplicate enrollment;
- the link taken **from the delivered message** opens the real conversation and **resumes** it
  rather than restarting.

**Not certified here:** actually completing Admissions. Part D stops at the opening of the parent
conversation; Part E is where the answering begins.

## A note on the QA email address

The guardian on **Tourb0913 Family** currently carries **Kurz16@gmail.com** rather than its fixture
address (`tourb.tourb0913@example.invalid`). That is deliberate and is left in place for your run —
the fixture addresses are on a reserved domain that can never receive mail, so no QA family could
otherwise show you the parent side. **Restore or retire that contact once you have finished the full
QA cycle.**

# PART E — The parent experience

> **E1 to E6 were executed and observed on the real runtime.** Each one below is a thing that was
> driven, not a thing that ought to work. **E7 to E10 are not certified and must not be QA'd yet** —
> they are listed at the end so you can see where this stops.

## Before you start: which conversation you are opening

A participant link **resumes**. That is the product behaving correctly — Part D proved a resend
reuses the same session rather than starting a second one — but it means **you only get one first
impression per child**, so E1 has its own untouched specimen below and E2–E6 continue in it.

**What changed since you last read this.** Admissions was republished as **version 9**. It asks the
same **80 questions**, **65 of them required**, in the same order, with the same 13 connections to
Alloy — nothing was added, removed or renamed. What changed is that the paperwork now says **how**
it wants to be answered:

- **fourteen questions are yes/no** and are asked with two buttons instead of a text box;
- **four questions only exist if the answer above them is yes** — custody arrangements, a
  restraining order, siblings, a previous programme. Answer **No** and the follow-up is not asked
  at all;
- **twenty-five questions are paragraphs** rather than one-line boxes.

The reasoning for every one of those choices is in `ADMISSIONS-V9-INTERACTION-SEMANTICS.md` beside
this file. One thing it records that you should know before you start: *"Does your child have any
allergies? **If so, please list.**"* is deliberately **not** a yes/no question — the school is
asking for a list and a button cannot give one.

**E1–E6 below were each driven on the real runtime against a fresh v9 conversation.** Every EXPECT
is a thing that was observed, not a thing that ought to work.

---

**E1. OPENING — what Alloy already has, and how little of it you should have to read.**

**DO** — Open the E1 specimen link:

```
https://vacilandos-mac-mini.tail2aa1af.ts.net:3014/forms/embed/yqOqme-nx_2r6Ks9HiGeGvK9NhOJnkDWbchJ_Fx1_yA
```

That is a fresh, unused conversation for **Lennon Kurzman**, whose record genuinely holds a name, a
date of birth, and a parent with a name, a phone number and an email address. Nothing was hand-fed
for the demo; it is the household data that was already there.

**EXPECT — the opening** — a line naming the child, and **one block per person**, each headed by
that person's own name. Five facts, two blocks. Not a list:

```
Let's finish Lennon's enrollment paperwork. Here's what I already have —
I'll ask you for anything that's missing.

    LENNON'S DETAILS      Lennon Kurzman
      Full name       ·  Lennon Kurzman
      Birthday        ·  Apr 2, 2024

    YOUR DETAILS          Kelly Kurzman
      Name            ·  Kelly Kurzman
      Phone number    ·  (602) 290-4816
      Email address   ·  kelly.kurzman@gmail.com
```

> **STOP** if there is a **Show N more** control here. What Alloy already holds is a summary, and a
> summary you have to expand is a list.

> **STOP** if you are told *"I already have most of …'s information"* and are shown nothing. That
> sentence is only spoken when there is something under it.

> **STOP** if the first thing you are asked is something Alloy can already answer — the child's name
> or birthday as an empty box. A fact on file is confirmed, never collected.

> These summary rows carry **no Edit link** before you confirm, on purpose. Nothing there has been
> verified by you yet, and showing a value is not the same as you agreeing to it.

**DO** — Press **Yes, that's right**.

**EXPECT** — Lennon's two facts move into a **Confirmed** block, each with an **Edit** beside it, and
the progress figure moves. Your own details stay in the un-confirmed summary above, because you have
not been asked about them yet.

**EXPECT — the first genuinely missing question** — only now, and it is something Alloy has no way
to know: *Student Age Upon Enrolling*.

---

**E2. THE CHILD — their questions come first, and they arrive together.**

**DO** — Answer whatever the conversation asks, one turn at a time, until the subject changes.

**EXPECT** — A quiet label above the question reading **`LENNON'S DETAILS`**, and the child's
questions in one run: name, birthday, age, first day, gender and home address — **the ones Alloy
stores and the ones it does not, side by side**.

> **STOP** if the child's own name is asked *after* a parent's phone number or email. Whether Alloy
> happens to store a fact must never decide whose question it is.

---

**E3. THE TWO GUARDIANS — one person finished before the next.**

**EXPECT** — the label changes to **`GUARDIAN #1`** and you are asked that person's phone, email,
name, employer and employer address in one run — including the **Parent Name** box on the last page
of the packet, under the Tuition agreement. It is the same person, so it is asked here. Then the
label moves to **`GUARDIAN #2`** and asks that person's five.

> **STOP** if the label still says **Contact Information** or another page heading from the form.
> The label names *whose* questions these are, not which page of the PDF they came from.

> **STOP** if an answer you gave for **Guardian #2** appears against **Guardian #1** anywhere.

---

**E4. THE EMERGENCY CONTACTS, AND BEING ASKED WHETHER THERE IS ANOTHER PERSON.**

**EXPECT** — the label moves on, in this order, and each person is finished before the next begins:

```
EMERGENCY CONTACT #1   the authorized-adult line, relationship, phone, address
EMERGENCY CONTACT #2   the same four
EMERGENCY CONTACT #3   the same four   (optional — you may decline all four)
PHYSICIAN              name, phone
DENTIST                name, phone     (optional)
```

> The **authorized adult** question is not a separate group — the school wrote it as the emergency
> contact's own line, so it is asked with that person. That is the form's own structure, not a merge.

> A role the packet names only once is deliberately **not** numbered: *Physician*, not *Physician #1*.

**EXPECT — adding another person is a choice, not a typing exercise.** When the conversation reaches
a role that can hold more than one person you are offered buttons, including the people Alloy already
knows:

```
    Would you like to add a parent or guardian?

    [ Kristi Kurzman ]  [ Kelly Kurzman · 6022904816 ]  [ Someone else ]  [ No, continue ]
```

> **STOP** if you are asked this as a question you have to answer in words.

---

**E5. YES / NO — a closed question gets two buttons, and a No is never followed up.**

**EXPECT** — when the conversation reaches the health chapter, a question the school wrote as a
yes/no question is asked as one:

```
    EMERGENCY CONTACT INFORMATION & AUTHORIZED ADULTS

    Are there any custody or visiting arrangements we need to be aware of?

                                              [ Yes ]   [ No ]
```

There are **fourteen** of these. Among them: *"Has your student ever participated in speech,
behavioral, play or occupational therapy?"*, *"Does your child have siblings?"*, *"Is your child able
to play alone?"*

> **STOP** if any of them offers a text box as the way to answer. You may still type "no" or "yes,
> last year" and be understood — the buttons are the obvious path, not the only one.

> **EXPECT, and do not report:** *"Does your child have any allergies? If so, please list."* is a
> paragraph box, not two buttons. The school is asking for a list.

**DO** — Answer **No** to *"Are there any custody or visiting arrangements we need to be aware of?"*

**EXPECT** — the very next question is *"Is there anyone who has a legal restraining order…"*.

> **STOP** if you are asked *"If yes, please explain arrangements and custody"* — greyed out, skipped
> past, or in any other form. You have just said there are none. It must not be asked.

**DO** — Keep going until *"Does your child have siblings?"* and answer **Yes**.

**EXPECT** — the very next question is *"If yes, please list siblings name(s) and age(s)"*.

There are four of these pairs — custody, restraining order, siblings, and a previous school or
daycare. **All four were driven.** Changing a Yes back to a No withdraws the follow-up again: that
was driven too, and the answer to the follow-up stops being asked for.

---

**E6. WHAT YOU TOLD US — grouped, and every answer still correctable.**

**EXPECT** — below what Alloy already holds, the answers **you** have given, summarised one line per
chapter rather than listed:

```
    WHAT YOU TOLD US
      Lennon's details          ·  6 answers
      Guardian #2               ·  5 answers
      Guardian #1               ·  2 answers
      Emergency contact #1      ·  4 answers
      Emergency contact #2      ·  4 answers
      Physician                 ·  2 answers

      Review all answers →
```

> **STOP** if this is a flat list of every answer you have given with a **Show N more** beneath it.
> That was the defect. Measured on this specimen: thirty answers, six lines.

> **STOP** if anything Alloy already held — Lennon's name, your email — appears in this list. This
> section is only what you supplied or confirmed in this sitting.

**DO** — Press **Review all answers →**, then **Edit** beside an answer you gave earlier, type a
different value, and **Save**.

**EXPECT** — the record opens still grouped by chapter, every answer carrying its own **Edit**. The
row you changed shows the new value with **UPDATED** beside it, and every other row is untouched.

> Verified at the storage level, not just on screen: correcting the child's name changed that one
> destination and left both guardians' name boxes exactly as they were.

**DO** — When you are asked something, type **`What do I still need to do?`** and send it.

**EXPECT** — a reply telling you where you are, and **the same question still waiting**.

> **STOP** if your question is stored as the answer. Open **Review all answers** and check: the words
> *"What do I still need to do?"* must not appear.

> **KNOWN WART, not a defect to report.** The transcript echoes a correction underneath whichever
> question happens to be open, so it can look as though you answered *that* question with the
> corrected value. The stored data is correct; only the echo is misplaced.

> **KNOWN WART, not a defect to report.** Two of the chapter names in *What you told us* are the
> form's own section headings — *"Emergency Contact Information & Authorized Adults"* and *"Health
> Information and Developmental History"* — rather than a person or a topic. Those are the child's
> own questions that the packet files under a page heading; the name is honest, just wordy.

---

## E7 to E10 — NOT CERTIFIED. Please do not QA these yet.

| | |
|---|---|
| **E7** | Finishing the whole of Admissions |
| **E8** | The **Family Handbook** read-and-acknowledge step |
| **E9** | The **Immunization record** upload step |
| **E10** | Completion, and what Processing shows afterwards |

Nothing above E7 depends on them, and none of them has been driven end to end yet. They will be
written the same way — DO / EXPECT / STOP, from behaviour that was actually observed — once they
have been.

## What else this part certified

- the conversation **resumes**: reopening the same link continues where it left off, with earlier
  answers still settled and editable, rather than restarting;
- a required question with no home in Alloy's records is still asked and still retained — **Form-only**
  describes where an answer lives, not whether it matters. Those answers are kept against the exact
  Form box they came from, and never given a canonical home they do not have;
- the order follows **people**, not the source PDF's field order, and the conversation says whose
  questions it is asking.

# PART G — Paperwork complete ≠ enrolled

**G1. DO** — Click the **Workspace** icon in the left rail.
**EXPECT** — On the work list: **Enrolled children** and **Registration**.

**G2. EXPECT** — Completing the paperwork does **not** move the child into **Enrolled children**,
and the child record still shows **Program —**.

> You cannot finish this check until a packet has actually been completed, and Part E deliberately
> stops before that (**E7–E10**). The rule it states holds regardless: paperwork is not enrolment.

> **STOP AND REPORT** if finishing paperwork marked the child enrolled. Enrolment stays a staff
> decision.

---

# Appendix — known limitations (not defects to find)

1. **No whole-experience preview.** Part C previews one Form at a time, safely. A non-operational
   preview of the entire three-step parent conversation does not exist in V1; it requires an
   ephemeral Participant Runtime persistence boundary and is recorded as follow-up platform work.
   Part D/E is how the real experience is tested.
2. **Packet version records.** A family already in progress keeps the Form versions they started on
   — publishing a new Form version does not change their paperwork mid-flight. The separate,
   explicit packet-version record is waiting on a database change this environment has not received.
   Nothing a parent or operator does is affected.
3. **Search chips.** A search result only offers a context chip (e.g. *Household*) when that context
   can actually be opened. A child who is not in an Enrollment queue shows no Enrollment chip; click
   the child's name to open the record.
4. **A new child cannot currently be walked into Enrolling.** Every route is blocked, and all four
   were measured rather than inferred:
   - the family-case stage move (*Move to Tour*, *Move to Waitlist* at case grain) is refused with
     *"status_key is not defined for this entity in status_definitions"*. This org's opportunity
     status vocabulary was deliberately collapsed to four keys — Open, Closed, Inactive, Archived —
     while the stage-transition writer still asserts a per-stage key. The reconciliation preflight
     itself reports `new → tour`, and **neither** is in the vocabulary;
   - *Move to Enrolling* on a child record returns **404** — it sends the child's id to a route that
     takes the family case's id;
   - the `enroll_child` command reports `registered: false` — it is in the lifecycle vocabulary with
     no executable handler behind it.

   What DOES work is the per-child decision path: *Move to Waitlist* committed normally and really
   moved a child from Lead to Waitlist. So this is not "lifecycle is broken" — it is the **entry to
   Enrolling specifically** that has no working route today. Parts D and E use children who are
   already Enrolling, so nothing in this walkthrough depends on it. **Do not report this one; it is
   known, and the repair is a decision about where a case's stage is allowed to live.**
