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
already Enrolling through the real Decision path. Earlier parts still reference **Pathb Certopp**,
which remains a valid specimen for configuration reading.

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


# PART D — Open the child, send the paperwork, receive the email

> **This whole part was re-certified end to end on a real send.** Every step below was executed and
> observed, except D9 — checking the inbox — which only you can do. The old Part D told you to open
> Processing Studio, pick a packet, launch it and copy an Intake URL. **None of that is the product
> any more.** There is no Studio step, no packet picker, no URL to copy: the Process decides which
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
**EXPECT** — A confirmation step: **Ready to send**, naming the recipient, with **Back to edit** and
**Confirm send**. Nothing has been sent yet.

**D7. DO** — Click **Confirm send**.
**EXPECT** — **Message sent · Email sent to …** and a **Done** button.

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

Work in the parent tab.

> **HOW MUCH OF PART E IS CERTIFIED.** The OPENING of this conversation was re-certified on the
> real delivered link: it names the child, reuses what Alloy already holds, asks one need at a time,
> and RESUMES rather than restarting. The steps further down still describe the previous packet's
> obligations — *Northwind Enrollment Application v4*, *Health and Medical Authorization*,
> *Immunization Record* — and were **not** re-run against the current
> **Enrollment Paperwork 2026–2027**. Treat everything after E2 as a guide, not as verified script;
> where it disagrees with what you see, what you see is the product.

**E1. EXPECT** — An opening message naming **Toureeb**, saying Alloy already has most of the
information and will only ask for what is missing. For this specimen it opens partway through —
*In progress*, with the child's birthday already settled — because the certification run answered
one question. That is a resumed session, which is correct.

### Prove a question is not stored as an answer

**E2. DO** — When Alloy asks for a value (for example *Emergency contact first name*), click
**Yes — I'll tell you**, then type exactly:
`What do I still need to do?`
and press Enter.
**EXPECT** — A text box appears when you click **Yes — I'll tell you**, and your sentence sends.

**E3. EXPECT** — Three things:
1. Alloy **answers** the question.
2. The same question is still being asked.
3. Under **What you told us**, the words *"What do I still need to do?"* do **NOT** appear.

> **STOP** if your question was saved as the answer.

**E4. DO** — Now answer it properly. Type `Dana`, press Enter. If asked for a last name, type
`Reyes`, press Enter.
**EXPECT** — The answers appear under **What you told us**.

**E5. DO** — For each *"Would you like to add…"* prompt (parent/guardian, emergency contact,
authorised pickup, physician), click **No, continue**.
**EXPECT** — Each prompt is dismissed and the next one appears, until Alloy moves on to the
immunization attachment.

**E6. DO** — When asked to attach the immunization record, click **Attach** and choose any small
**PDF or photo** from your computer (any file will do — it is QA).
**EXPECT** — The upload is accepted and Alloy says it is preparing the paperwork.

### Document 1 — Northwind

**E7. DO** — Click **Review paperwork**.
**EXPECT** — **Document 1 of 3 — Northwind Enrollment Application**, shown as the real document.

**E8. DO** — Click **View larger**, then close it.
**EXPECT** — A readable full view.

### Correct a fact

**E9. DO** — Click **Make a change**.
**EXPECT** — A list of editable facts, each with **Edit**:
*first name — Pathb*, *last name — Certopp*, *date of birth — Nov 2, 2021*.

> **STOP** if this list is empty.

**E10. DO** — Click **Edit** on **date of birth**. Set it to `2021-11-05`. Click **Update**.
**EXPECT** — You return to the document, it regenerates, and it now shows **Nov 5, 2021**.

**E11. DO** — Click **Make a change** again, **Edit** on **date of birth**, set it back to
`2021-11-02`, click **Update**.
**EXPECT** — The document shows **Nov 2, 2021** again.

> This proves corrections flow to the paperwork. You have changed nothing in Alloy's records yet.

### Sign

**E12. DO** — Click **Everything looks good**.
**EXPECT** — A signing screen.

**E13. DO** — Click **Tap to sign** → **Type instead** → type `Bo Certopp` → tick the
acknowledgement → click **Done** → click **Sign and finish**.
**EXPECT** — The signature appears on the document and the step completes.

> **STOP** if the signature disappears after signing.

### Documents 2 and 3

**E14. DO** — Click **Review paperwork**.
**EXPECT** — **Document 2 of 3 — Health and Medical Authorization**.

**E15. DO** — Click **Everything looks good**, then sign as in E13.
**EXPECT** — Document 2 is signed and completed, exactly as Document 1 was.

**E16. DO** — Click **Review paperwork**.
**EXPECT** — **Document 3 of 3 — Immunization Record**, with an **Attach** button.

**E17. DO** — Click **Attach**, choose a PDF or photo.
**EXPECT** — Buttons **View** and **Replace** appear.

**E18. DO** — Click **View**.
**EXPECT** — The file you just uploaded opens.

**E19. DO** — Click **Replace** and choose a **different** file.
**EXPECT** — The newer file becomes the current one.

> **STOP** if the old file is still shown as current.

**E20. DO** — Click **Everything looks good**, then sign as in E13.
**EXPECT** — **"You're all set. Pathb Certopp's enrollment paperwork has been submitted."**

---

# PART F — Operator return

Go back to the admin tab.

**F1. DO** — Left rail → **Processing** → **Work** tab → **Queue** tab → click **Incoming**.
**EXPECT** — A list with a new **Enrollment Packet — Firefly V1**, marked *Needs review*, at the top.

**F2. DO** — Click it.
**EXPECT** — Under **What came in**, three headed groups:
- **Northwind Enrollment Application v4 — Step 1 — Completed**
- **Health and Medical Authorization — Step 2 — Completed**
- **Immunization Record — Step 3 — Completed**

> **STOP** if the three Forms are merged into one list, or a step is not **Completed**.

**F3. DO** — Click **View Northwind Enrollment Application v4 (signed)**.
**EXPECT** — The signed PDF opens in a new tab, with the signature on it.

**F4. DO** — Do the same for **View Health and Medical Authorization (signed)** and
**View Immunization Record (signed)**.
**EXPECT** — Both open.

**F5. DO** — In the Immunization group, under **On the form only**, click **View attached document**.
**EXPECT** — The **replacement** file from E19 opens — not the first one.

> **STOP** if you cannot open any returned document.

**F6. EXPECT** — Inside each group you should see headed sections:
- **Confirmed — already on file** (e.g. *Child First Name — Pathb*)
- **On the form only** (e.g. the emergency contact names)
- and, where something differs, **Changes to review** or **New information**.

**F7. DO** — Look at the **Review & decide** rail on the right.
**EXPECT** — It says **Update Pathb Certopp**.

> **STOP** if it offers to *create* Pathb Certopp as a new child. That would be a duplicate.

### Approve one change

**F8. DO** — In the decision rail, approve the change offered for **Child Date Of Birth**.
*(If no change is offered because nothing differs, skip to F10 and note it.)*
**EXPECT** — The approval is accepted.

**F9. DO** — Top search box → type `Pathb` → click **Pathb Certopp**.
**EXPECT** — The record shows **Date of birth Nov 2, 2021**.

**F10. EXPECT** — Nothing else on the record changed on its own.

> **STOP** if any record value changed that you did not approve.

---

# PART G — Paperwork complete ≠ enrolled

**G1. DO** — Click the **Workspace** icon in the left rail.
**EXPECT** — On the work list: **Enrolled children** and **Registration**.

**G2. EXPECT** — Completing the paperwork in Part E did **not** move Pathb into **Enrolled children**,
and the child record still shows **Program —**.

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
