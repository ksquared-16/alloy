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
**EXPECT** — A **Requirements** row marked **Configured**.

---

# PART B — The three Forms

**B1. DO** — In the left icon rail, click **Processing** (tooltip: *intake, documents, and forms*).
**EXPECT** — A panel titled **Digital Mailroom** with tabs **Work** and **Studio**.

**B2. DO** — Click **Studio**, then click **Forms**.
**EXPECT** — A list of forms and a **Search forms** box.

### Northwind

**B3. DO** — Type `Northwind` in **Search forms**, then click **Northwind Enrollment Application**.
**EXPECT** — The form opens, badged **Published**, with buttons **✎ Edit**, **▷ Preview**, **◎ Runtime**.

**B4. DO** — Click **▷ Preview**.
**EXPECT** — The actual enrolment paperwork — a recognisable document with the school's own wording,
not a list of field names.

> **STOP** if you see a bare list of field names instead of a document.

### Health and Medical

**B5. DO** — Click **← Forms**. Type `Health and Medical` in **Search forms**, click
**Health and Medical Authorization**.
**EXPECT** — Opens, badged **Published**.

**B6. DO** — Click **✎ Edit**. In the middle column, click the question **Child Allergies**.
**EXPECT** — A right-hand panel with a section **Store answer in** showing
**Record: Child** and a **Field** naming **Allergies**.
*(Expanding “Technical reference” underneath shows `customer_member.allergies` — that is expected.)*

**B7. DO** — Click the question **Child Medications**.
**EXPECT** — **Store answer in → Record: Form field only**, and **no** Field selector.

**B8. DO** — Repeat for **Child Medical Conditions**, then **Medical Authorization Ack**.
**EXPECT** — Both also show **Record: Form field only**.

> **STOP** if any of those three shows a Field such as *Medical notes*. They must not share a
> destination — that is the defect this release fixed.

**B9. DO** — Click **▷ Preview**.
**EXPECT** — Recognisable Health paperwork, including a signature area.

### Immunization

**B10. DO** — Click **← Forms**. Type `Immunization`, click **Immunization Record**.
**EXPECT** — Opens, badged **Published**.

**B11. DO** — Click **✎ Edit**, then click the question **Child Last Name**.
**EXPECT** — **Store answer in → Record: Child**, **Field: Child last name**.

> **STOP** if it says *Child first name*. That was a real defect; it must stay fixed.

**B12. DO** — Click the upload question **Immunization or vaccination record**.
**EXPECT** — The panel identifies the document as an **Immunization record**.

---

# PART C — Preview (one Form at a time)

**C1. DO** — With any Form open, click **▷ Preview**, then **◎ Runtime**.
**EXPECT** — The published Form shown the way a parent meets it.

**C2. DO** — Click **← Forms** to exit.
**EXPECT** — Back at the forms list. Nothing was created.

> **There is no whole-Enrollment-conversation preview in V1. Do not look for one.**
> You will test the real parent experience in Part D.

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
