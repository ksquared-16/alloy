# Enrollment QA walkthrough

Everything below is done in the product at **http://localhost:3014**.
No terminal, no SQL, no IDs to type. The QA family is **Pathb Certopp** (household *Certopp Family*).

If a step's "You should see" does not match, stop and note the step number.

---

## A. Enrollment configuration

**A1.** Open `http://localhost:3014/organization/processes`.
*You should see* a **Business Processes** list containing **Enrollment**, marked *Active*, with **6 stages · Healthy**.

**A2.** Click **Enrollment**.
*You should see* the process snapshot and the tab row: Overview, Stages, Work Views, Commands, Automation, **Health**, History. The journey reads Lead → Tour → Decision → Waitlist → **Enrolling** → Enrolled.

**A3.** Click the **Health** tab.
*You should see* a heading **Configuration Health** and the process marked **HEALTHY**, with these rows:

| Row | Expected |
| --- | --- |
| Workspace tile visible | Ready |
| Queue views published | Ready |
| Queue views match statuses | Ready |
| Records query ready | Info |
| Actions configured | Ready |
| Families have paperwork to complete | Info — **3 forms a family must complete in this stage** |
| Required paperwork still exists | Ready — *Every required form resolves* |
| Required paperwork is published | Ready — *Every required form has a published version* |
| Requested documents are identified | Ready — *Every requested document is identified* |
| Signatures land on the paperwork | Ready — *Every signature has a place on the document* |

The panel closes with **This lifecycle is ready for staff on the workspace.**
*This is the check that matters:* "3 forms", plus all four paperwork rows Ready.

**A4.** Click the **Stages** tab, then open **Enrolling**.
*You should see* a **Requirements** row marked *Configured*. Open it and confirm the three required Forms are exactly:
- Northwind Enrollment Application
- Health and Medical Authorization
- Immunization Record

**A5. Draft vs live.** Note that Configuration Health describes the **applied** configuration. If you edit and save a process without applying/publishing, Health still describes what families actually get. Re-check the Health tab after any change.

---

## B. Forms

Open **Processing → Studio → Forms** (the Processing tile on the workspace rail, then the *Studio* tab, then *Forms*). Use the **Search forms** box.

**B1. Northwind Enrollment Application.**
Search `Northwind`, open it.
*You should see* the form marked **Published**, and the mode buttons **✎ Edit**, **▷ Preview**, **◎ Runtime**.
Click **▷ Preview**. *You should see* the real paperwork, not a list of field names.

**B2. Health and Medical Authorization.**
Search `Health and Medical`, open it, click **✎ Edit**.
Click the question **Child Allergies** → in the right-hand inspector, under **Store answer in**, *you should see* Record = **Child**, Field = **Allergies**. (This one is intentionally canonical.)
Now click each of **Child Medications**, **Child Medical Conditions**, **Medical Authorization Ack**.
*You should see* Record = **Form field only** for all three, and **no** Field selector.
> Why: medications and conditions belong to Health & Safety, not Enrollment, and a legal acknowledgment is not a medical note. Previously all three wrote to the same single "medical notes" field and overwrote each other.

Confirm the form still shows a **Guardian Signature** question and that **▷ Preview** renders recognizable paperwork.

**B3. Immunization Record.**
Search `Immunization`, open it.
*You should see* **Published**, a question **Child Last Name** whose inspector shows Record = **Child**, Field = **Child last name**, and an upload question described in operator language as an **Immunization record**.

---

## C. Admin preview of a Form

Alloy previews a **published Form** for you, against the live configuration, without creating
anything. Do this for each of the three Forms.

**C1.** In **Processing → Studio → Forms**, open **Northwind Enrollment Application**.
Click **▷ Preview**.
*You should see* the real paperwork — the recognizable document a parent signs, not a list of field
names.

**C2.** Click **◎ Runtime**.
*You should see* the same Form presented the way a parent meets it.

**C3.** Repeat C1–C2 for **Health and Medical Authorization** and **Immunization Record**.
*You should see* each render its own recognizable paperwork, and each marked **Published** — what
you are previewing is the live published configuration, not a draft.

**C4. Confirm nothing was created.** Go to **Processing → Studio → Packets → Enrollment Packet —
Firefly V1 → Session inbox**, and to **Processing → Work → Queue → Incoming**.
*You should see* no new session and no new item from anything you did in C1–C3. Previewing a Form
is read-only: it does not start a family's paperwork, does not create work for staff, and does not
change any record.

> **Known V1 limitation.** Alloy does not yet provide a non-operational preview of the **entire
> multi-Form Enrollment conversation** — the guided experience that walks a family through all three
> requirements. Previewing one Form at a time is what exists today.
>
> The real Participant Runtime has been certified end to end separately, and **section D below walks
> you through that actual experience** with the QA family. Building a safe whole-experience preview
> requires an ephemeral Participant Runtime persistence boundary and is tracked as follow-up
> platform work — so please do not go looking for a "preview the whole experience" button; there
> isn't one yet.

---

## D. Real participant flow

**D1. Launch.** Processing → **Studio** → **Packets** → open **Enrollment Packet — Firefly V1**.
Scroll to **Send to (optional — prefills what Alloy already knows)**. Type `Pathb`.
*You should see* a result **Pathb Certopp — Customer: Certopp Family · DOB 2021-11-02**. Click it.
*You should see* the target shown by name with a **Change** link. (You should never need to paste an ID.)
Click **Launch packet**, then copy the **Intake URL**.

**D2. Open as the parent.** Paste the URL into a new browser tab.
*You should see* Alloy greet you about **Pathb**, saying it already has most of the information and will only ask for what is missing.

**D3. Ask a question instead of answering.** When Alloy asks for a value, click **Yes — I'll tell you** and type:
`What do I still need to do?`
*You should see* Alloy **answer the question**. *You should not see* your question saved as the answer to the field it was asking about — check the "What you told us" list; the question text must not appear there.

**D4. Answer what's missing.** Provide the requested values (e.g. an emergency contact first and last name). Decline the "would you like to add…" prompts with **No, continue**.

**D5. Attach the immunization record** when asked, using any small PDF or photo.

**D6. Review.** Click **Review paperwork**.
*You should see* **Document 1 of 3 — Northwind Enrollment Application**, rendered as the actual document.

**D7. Make a change.** Click **Make a change**.
*You should see* a list of editable facts with values, e.g. *first name — Pathb*, *last name — Certopp*, *date of birth — Nov 2, 2021*, each with **Edit**.
Click **Edit** on **date of birth**, set a different date, click **Update**.
*You should see* the paperwork regenerate with the new date, and you stay in **Review** — the packet does not restart.
Change it back to **Nov 2, 2021** the same way.

**D8. Sign document 1.** Click **Everything looks good** → **Tap to sign** → **Type instead** → type `Bo Certopp` → tick the acknowledgement → **Done** → **Sign and finish**.

**D9. Document 2 — Health and Medical.** Click **Review paperwork**, then repeat D8.

**D10. Document 3 — Immunization Record.** Click **Review paperwork**.
Click **Attach** and upload a file. *You should see* **View** and **Replace** appear.
Click **View** to open what you uploaded.
Click **Replace** and upload a *different* file. *You should see* the newer file become the current one.
Then **Everything looks good** → sign → **Sign and finish**.

**D11. Completion.** *You should see* "**You're all set.** Pathb Certopp's enrollment paperwork has been submitted."

---

## E. Operator return

**E1.** Back in the admin product: **Processing → Work → Queue → Incoming**.
*You should see* a new **Enrollment Packet — Firefly V1** item marked *Needs review*. Open it.

**E2. Three Forms, separately.** Under **What came in**, *you should see* three groups, each with its own heading, step number and state:
- *Northwind Enrollment Application v4 — Step 1 — Completed*
- *Health and Medical Authorization — Step 2 — Completed*
- *Immunization Record — Step 3 — Completed*

**E3. Open the paperwork.** Each group has a link such as **View Northwind Enrollment Application v4 (signed)**. Click each of the three.
*You should see* the signed PDF open. For Immunization, *you should also see* **View attached document** for the record the parent uploaded — and it should be the **replacement** file from D10, not the first one.

**E4. Read the values.** Within each group *you should see* headed sections:
- **Confirmed — already on file** (e.g. Child First Name *Pathb*) — information the family confirmed. No decision needed.
- **Changes to review** — with the previous value shown as *was …*.
- **New information** — where Alloy held nothing.
- **On the form only** — e.g. emergency contact names, and the immunization upload. These stay on the form and never write to the record.

**E5. Approve a change.** Use the decision rail on the right.
*You should see* it say **Update Pathb Certopp** — *not* "Create Pathb Certopp as a new child". Approve a legitimate change.

**E6. Verify the record.** Search `Pathb` in the top search bar, press Enter, open the child.
*You should see* the approved value now on the record, and unchanged values untouched.

**E7. Completion is not commitment.** Note the case did **not** update the record by itself when the parent finished. Only your approval in E5 changed anything.

---

## F. Mobile (375px)

Repeat **D2 → D11** with the browser window narrowed to a phone width (≈375px), or in device emulation.
*You should see*, at every step: no sideways scrolling, buttons fully on screen and comfortably tappable, the document readable, **View larger** usable, the signature pad usable, and upload/replace reachable.

---

## G. Enrollment boundary

**G1.** On the workspace home, look at **Enrolled children** and **Registration**.
*You should see* that completing the paperwork in section D did **not** change these counts and did **not** mark Pathb as enrolled — the child record still shows no program.
> Finishing paperwork is not enrolment. Enrolment stays a staff decision.

---

## Known gaps (disclosed, not defects to find)

1. **Full-experience admin preview** — section C previews one Form at a time, safely. A non-operational preview of the whole three-step parent conversation does not exist in V1; it needs an ephemeral Participant Runtime persistence boundary and is recorded as follow-up platform work. Section D is how you test the real thing.
2. **Packet version rows** — a packet's *step-level* versions are already locked for a family in progress (proven: a session keeps its original Form versions even after new versions are published). The explicit packet-version record is waiting on a database change that this environment has not received yet. Nothing a parent or operator does is affected.
