# Enrollment QA — click-by-click

Open **http://localhost:3014/workspace** and keep this beside the browser. Work top to bottom.

> The bare address `http://localhost:3014` is the Alloy marketing page, not the app — always include
> **/workspace**. If you get a sign-in screen, sign in and you will land on the workspace. Stay on the
> same address you signed in on (`localhost` and `127.0.0.1` are treated as separate sign-ins).

Each step is **DO** (what to click or type) and **EXPECT** (what you should see).
If EXPECT does not match, stop at that step number and report it.

> **STOP AND REPORT IF** a named button is missing, clicking does nothing, a document does not
> render, or anything below says STOP.

The QA child is **Pathb Certopp** (household *Certopp Family*).

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
| **Families have paperwork to complete** | **Info — "3 forms a family must complete in this stage"** |
| Required paperwork still exists | Ready — *Every required form resolves* |
| Required paperwork is published | Ready — *Every required form has a published version* |
| Requested documents are identified | Ready — *Every requested document is identified* |
| Signatures land on the paperwork | Ready — *Every signature has a place on the document* |

At the bottom: **This lifecycle is ready for staff on the workspace.**

> **STOP** if the paperwork row does not say **3 forms**, or if any of the four paperwork/signature
> rows is not **Ready**.

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

# PART B — The real package, step by step

This is your actual 2026–2027 package, built in the product. It contains three different **kinds** of
thing, which is the point: Alloy no longer pretends every obligation is a form.

**B1. DO** — In the left icon rail, click **Processing** (tooltip: *intake, documents, and forms*).
**EXPECT** — A panel titled **Digital Mailroom** with tabs **Work** and **Studio**.

**B2. DO** — Click **Studio**, then click **Packets**.
**EXPECT** — A grid of packets and a **Search packets** box.

**B3. DO** — Type `Enrollment Paperwork` in **Search packets**, then click
**Enrollment Paperwork 2026–2027**.
**EXPECT** — The packet builder opens. Under the steps list you should see three steps:

| # | Heading | What it says |
|---|---------|--------------|
| 1 | **Collect information** | a **Form** dropdown set to *Admissions Information* |
| 2 | **Read & acknowledge** | *Family Handbook* — “Reads 26 27 Family Handbook …, and signs” |
| 3 | **Upload a document** | *Immunization record* — “Filed as Immunization record” |

> **STOP** if steps 2 or 3 show a **Form** dropdown. They are not forms, and offering to swap one in
> would be the product lying about what it is doing.

**B4. DO** — Open the **Form** dropdown on step 1 and read the list. Do **not** choose anything.
**EXPECT** — Your real forms. **Family Handbook** and **Immunization record** must **NOT** appear as
options you can choose.

> **STOP** if you can see *Family Handbook* in that dropdown. Alloy builds a hidden one-question form
> behind each document step so uploads, filing and evidence all work the way they already do — but
> that is plumbing, and it must never be offered to you as something to pick.

**B5. DO** — Press **Escape** to close the dropdown, then click **Add step**.
**EXPECT** — A small menu headed **What do you need from the family?** with exactly three choices,
each written as something a *family* does:

- **Collect information** — Ask questions and store the answers…
- **Upload a document** — Ask the family to send in a document…
- **Read & acknowledge** — Give the family something to read, and record that they agreed to it.

> **STOP** if this menu shows technical words like *form_definition*, *adapter*, *document_upload*,
> or asks you to pick a form before it asks you what you need.

**B6. DO** — Click **Cancel**. Nothing should be added.
**EXPECT** — Three steps still, unchanged.

---

# PART C — Structure and Paperwork

The old **Preview** and **Runtime** buttons are gone. They showed the same thing twice and neither
showed the document, which is what you told us. Two honest views replace them.

**C1. DO** — Go to **Studio › Forms**, search `Northwind`, and open
**Northwind Enrollment Application v4**.
**EXPECT** — The form opens, badged **Published**, with **✎ Edit**, **▦ Structure**, **▤ Paperwork**.

> **STOP** if you still see a **◎ Runtime** button.

**C2. DO** — Click **▦ Structure**.
**EXPECT** — A banner *Structure — the questions, and the order they are asked in*, then the field
list. This is a checklist of what is asked, not a picture of the paperwork.

**C3. DO** — Click **▤ Paperwork**.
**EXPECT** — A banner *Paperwork — the document this produces, with each mapped box named*, then the
**real Northwind PDF**, scrollable, with its own headings (*Child Information*, *Home Address*,
*Parent / Guardian*).

Each box Alloy fills is printed with the name of the fact that fills it, in braces —
`{Child First Name}`, `{Guardian Mobile Phone}`, `{Requested Start Date}`.

> This is the view that answers “will the right answer land in the right box?”. The braces are
> deliberate: no real child’s details are shown on a configuration screen.
>
> **STOP** if a box you expect Alloy to fill is empty, or if a name appears in a box it does not
> belong in — that is a mapping defect and exactly what this view is for.

**C4. DO** — Go back to the forms list, search `Admissions`, open **Admissions Information**, and
click **▤ Paperwork**.
**EXPECT** — A plain message: *This form has no source document, so there is no paperwork to show.
Forms built from scratch are completed on screen.*

> This is correct, not a bug. Your Admissions Packet came from a web form, not a PDF, so there is no
> paper original to fill. **STOP** only if you see a broken or empty frame instead of that sentence.

**C5. DO** — Click **← Forms** to exit.
**EXPECT** — Back at the forms list. Nothing was created.

> **There is still no whole-Enrollment-conversation preview. Do not look for one.**
> You test the real parent experience in Part D.

---

# PART D — Open the QA child, then launch the parent experience

**D1. DO** — Click the **Workspace** icon (second from top in the left rail).
**EXPECT** — The Operational Workspace home.

**D2. DO** — Click the **Search…** box at the top. Type `Pathb`.
**EXPECT** — A result **Pathb Certopp — Child · Certopp Family**, with a **Household** chip.

**D3. DO** — Click the words **Pathb Certopp**.
**EXPECT** — The search closes and **Pathb Certopp's record opens**, showing *First name Pathb*,
*Last name Certopp*, *Date of birth Nov 2, 2021*.

> **STOP** if clicking does nothing.

**Now launch the paperwork.** There is no send-paperwork button on the child record; the launch
lives in Processing.

**D4. DO** — Left rail → **Processing** → **Studio** tab. If a Form is still open, click
**← Forms** first, then click the **Packets** tab.
**EXPECT** — The Studio tab row reads **Forms · Packets · Fields · Branding**, and the packets list
includes **Enrollment Packet — Firefly V1**.

> The **Packets** tab is only reachable from the Studio list. If you are inside a Form editor you
> must click **← Forms** first.

**D5. DO** — Click **Enrollment Packet — Firefly V1**.
**EXPECT** — The packet opens and lists its three steps, in order:
1. **Northwind Enrollment Application v4**
2. **Health and Medical Authorization**
3. **Immunization Record**

> **STOP** if the three steps are not exactly those.

**D6. DO** — Scroll to **Send to (optional — prefills what Alloy already knows)**. Type `Pathb`.
**EXPECT** — A result **Pathb Certopp — Customer: Certopp Family · DOB 2021-11-02**.

**D7. DO** — Click that result.
**EXPECT** — The target shows **Pathb Certopp** with a **Change** link. *(You should never type an ID.)*

**D8. DO** — Click **Launch packet**.
**EXPECT** — A panel **Copy this link now** with an **Intake URL**.

**D9. DO** — Copy the Intake URL and open it in a **new browser tab**.
**EXPECT** — The parent experience opens and greets you about **Pathb**.

---

# PART E — The parent experience

Work in the parent tab.

**E1. EXPECT** — An opening message naming **Pathb**, saying Alloy already has most of the
information and will only ask for what is missing.

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
