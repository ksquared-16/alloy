# Enrollment V0.5 — human QA

This is the walkthrough for the remainder of Enrollment V0.5. Keep it open beside the product and
work top to bottom. There are two tracks: **Track A** is the family's experience and is ready for
you now. **Track B** is whether an administrator could have *built* this without an engineer, and it
has not been run by anyone yet.

> **Automated certification does not replace human QA.** Everything below has been driven by an
> agent through the real runtime, and that is exactly why it is not finished. A passing test proves
> the software did not throw. It cannot tell you whether a parent understood the question, whether
> the fee arrived at a sensible moment, or whether this felt like enrolling a child. Only you can
> close a user-facing item.

> **Use `127.0.0.1`, not `localhost`.** They are separate sign-ins as far as the browser is
> concerned, and a session made on one is invisible to the other — which shows up as a login screen
> that looks like a defect. This QA server is a production build on purpose: it does not recompile
> and nothing an engineer edits can reload the page under you. If the page reloads itself, that is a
> real finding.

> **Inspection must not mutate live configuration.** Where a control has to be exercised to prove it
> works, exercise it on a scratch copy, not on the packet you are certifying. This rule exists
> because an earlier pass proved the Handbook's signature control by toggling it on the live packet.

Each step is **DO** (what to click) and **EXPECT** (what you should see). Where a step has no
EXPECT, the answer is your judgement, not a match — those are the ones worth slowing down for.

## Where this stands

The ten canonical items. Items 1 to 5 are closed. Item 6 is what Track A is for.

| # | Item | State |
| --- | --- | --- |
| 1 | Admissions v12 authored | COMPLETE |
| 2 | Administrator QA | COMPLETE |
| 3 | Admissions v12 published | COMPLETE |
| 4 | Real Enrollment packet configured | COMPLETE |
| 5 | Operator launch QA | COMPLETE |
| 6 | Participant QA | **HUMAN QA IN PROGRESS — blocked until you sign off** |
| 7 | Completed document QA | NOT STARTED |
| 8 | Processing / finalization QA | NOT STARTED |
| 9 | Complete packet QA | NOT STARTED |
| 10 | Final Enrollment process validation | NOT STARTED |

And one gate that is not an item on that list, because it cuts across all of them:

| Gate | State |
| --- | --- |
| **Configuration & Authoring human QA** (Track B) | **NOT YET PERFORMED** |

Item 10 cannot close while that gate is open. An Enrollment product that only works when an engineer
configured it has not been validated, however well the family's half behaves.

## Before you start — a known gap in addresses

The Admissions form asks for a **Home address** and a **Mailing address**, and it says who each one
belongs to: the home address to a guardian, the mailing address to the billing contact. Alloy can now
read that instruction, but **nothing acts on it yet**.

> In plain terms: the address questions may ask you for something Alloy already knows, or may attach
> what you type to the wrong person. **Treat whatever you see as a real QA finding.** Write it down
> the same way you would write down anything else that felt wrong. Do not skip past it because an
> engineer has told you the cause is understood — how bad it feels is the part that is not known, and
> that is the part you are here to judge.

This is named here so it cannot be quietly accepted. It is not signed off.

## How to record what you find

Use the notes box at the top of this page — it stays with you as you scroll and you can copy the
whole lot out at the end. Tag each note with one of these, so the difference between taste and
breakage does not get lost:

- **BLOCKER** — a family could not get through this.
- **PRODUCT / UX** — it works, but it is not good enough.
- **CONFIGURATION** — the wrong thing was set up, rather than the software misbehaving.
- **RUNTIME DEFECT** — an error, a blank screen, something that did not save.
- **DATA / CONTENT** — wrong name, wrong child, bad wording, wrong amount.
- **QUESTION** — you are not sure whether what you saw was intended.

A note that says "this felt slow and I lost my place" is worth more than a clean pass. Say the thing
you would say out loud.

---

# TRACK A — the participant experience

The journey is already launched and live. **Use the card at the top of this page** — it names the
family, the child, the stage, how far the paperwork has got and where the fee stands, and its one
button opens the real participant surface. You do not need a token, a session id, or a link from
anybody.

> **This is a real journey on real infrastructure, for a deliberately disposable family.** What you
> submit stays submitted. Do not press on if something looks wrong — stop and write it down, because
> the state you are looking at is the evidence.

> **STOP AND REPORT IF** the page says the form cannot be read, a step will not open, an answer does
> not survive a reload, the fee appears before the paperwork is done, or a name belongs to a child
> who is not the one you opened.

## A1 — first impression

Open the participant experience and then stop. Before you answer anything, read the screen.

**A1. DO** — Look at the top of the page as a parent would, for about ten seconds.

**A1. EXPECT** — You can tell whose paperwork this is and who is asking. The centre is identifiable.
There is some sense of how much there is to do.

**A2. DO** — Ask yourself the question the rest of this track depends on: does this feel like
*enrolling a child*, or does it feel like filling in a form on a website?

**A3. DO** — Turn your phone to this same link, or narrow the window to phone width.

**A3. EXPECT** — It is usable one-handed. Nothing is cut off, nothing needs pinching, the thing you
tap is the thing that responds.

## A4 — Admissions

**A4. DO** — Begin answering. Watch specifically for anything Alloy should already know — the
child's name, the family, anyone already on file — and see whether it asks you anyway.

**A4. EXPECT** — Known information is offered back to you to confirm, not demanded again from
scratch.

**A5. DO** — Reach the **parents and guardians** section.

**A5. EXPECT** — The people Alloy already knows appear as themselves. Adding one more does not mean
re-entering the ones already there.

**A6. DO** — Reach **other children in your household**.

**A6. EXPECT** — Siblings Alloy knows are shown as already on file. The child you are enrolling is
not offered to you as their own sibling.

**A7. DO** — Reach **emergency contacts**.

**A7. EXPECT** — You can add more than one. Nothing about the shape of this section repeats the
guardians section you have already done.

**A8. DO** — Reach the **address** questions. This is the known gap named above. Note exactly what it
asked and what it did with your answer.

**A9. DO** — Find a question you have nothing to say to — no allergies, no dietary needs, no
concerns.

**A9. EXPECT** — There is an explicit way to say *nothing to report* in the form's own words, such as
**No known allergies** or **None**. You are never forced to invent an answer, and you are never
required to fill a field that should have been optional.

**A10. DO** — Read the wording as you go. Note anything that reads as though it came from a database
rather than from a school.

**A11. DO** — Reach any signature or acknowledgement inside Admissions.

**A11. EXPECT** — It is clear what you are agreeing to before you agree to it.

**A12. DO** — Count the repetitions. Anything you typed twice is a finding, even a small one.

## A13 — leaving and coming back

**A13. DO** — Part way through, close the tab entirely.

**A13. DO** — Open the participant experience again from the card at the top of this page.

**A13. EXPECT** — You are where you left off. Your answers are still there. The progress shown
matches what you had actually done — not reset, and not further along than you got.

## A14 — Family Handbook

**A14. DO** — Move to the **Family Handbook** step.

**A14. EXPECT** — You can actually read the handbook, and it is clear that acknowledging it is a
distinct act from filling in Admissions.

**A15. DO** — Acknowledge it.

**A15. EXPECT** — It is recorded once. You are not asked to acknowledge the same thing again later.

## A16 — Immunization record

**A16. DO** — Move to the **Immunization record** step.

**A16. EXPECT** — It names the right child. Use a safe test file. **Do not upload real medical
information about a real person.**

**A17. DO** — Upload the file, then reload the page.

**A17. EXPECT** — The upload is still there and still attached to the same child.

## A18 — the fee arriving

This is the moment most worth your attention, because it is a judgement about timing, not a check.

**A18. DO** — Before the last of the non-financial paperwork is finished, look for anything about
money.

**A18. EXPECT** — Nothing is owed yet. If a fee is mentioned at all it is clearly *not due*.

**A19. DO** — Finish the remaining paperwork.

**A19. EXPECT** — The enrollment fee now becomes due, and it arrives as a consequence of finishing —
not as a surprise, and not as a second unrelated errand.

**A20. DO** — Read what it says you owe.

**A20. EXPECT** — The amount and the reason are understandable to a parent. No internal terminology,
no ledger language, no reference codes.

## A21 — paying

**A21. DO** — Look at who the payer is.

**A21. EXPECT** — It is this family. No other household's saved cards or bank accounts are visible
anywhere on this screen.

**A22. DO** — Pay, by card or by bank, using test details.

**A22. EXPECT** — A confirmation you would believe. Reload the page: it still says paid, and it does
not invite you to pay again.

**A23. DO** — If you paid only part of it, look at what remains.

**A23. EXPECT** — The remaining balance is stated plainly.

## A24 — finishing

**A24. DO** — Complete the packet.

**A24. EXPECT** — There is an unmistakable moment where you are done, and it tells you what happens
next.

**A25. DO** — Now answer the question this whole track exists to ask: **would you send this to a
real family next week?** If not, say what would have to change.

---

# TRACK B — configuration and authoring

**Required before final V0.5 sign-off. Not yet performed.**

Track A tells you whether the family's experience is good. It tells you nothing about whether anyone
but an engineer could have produced it. That is what this track is for, and it is the difference
between a demo and a product.

> **Do not run Track B by looking at the existing configuration.** The Admissions Packet, the Family
> Handbook, the Immunization record and the registration fee are already set up and working, and
> reading them proves only that they exist. The question is whether **you** could have made them.
> Build a scratch copy and throw it away.

## B1 — Forms Studio

**B1. DO** — Open **Processing → Studio → Forms** and find the existing **Admissions Packet**. This
part is reading, for orientation only.

**B2. DO** — Create a new form of your own from scratch and try to reproduce a page or two of real
paperwork in it.

**B3. DO** — Configure plain fields. Then try the harder things the real packet uses: a **repeating
group** of people, a **condition** that shows a question only when it is relevant, a question that
**reuses somebody Alloy already knows**, an **address**, and an **optional question with a
nothing-to-report choice**.

**B4. DO** — Add a signature or acknowledgement.

**B5. DO** — Preview it as a family would see it.

**B6. DO** — Publish it.

**B6. EXPECT** — Judge each of B2 to B6 on whether you could do it unaided, not on whether it is
technically possible. Anywhere you would have had to ask an engineer is a finding.

## B7 — importing the paperwork you already have

This is the step the Director specifically called out as never having been tested by a human: taking
a document a school already uses and turning it into an Alloy form.

> **What exists today, stated exactly.** Import IS supported, but **not** from Forms Studio. In
> **Processing → Studio → Forms → Create form**, the option **Existing document — Import from Work**
> is deliberately **disabled**, and **Existing packet** is marked *Coming later*. The working path is
> the other way round: a document arrives in Processing, Alloy derives a draft form from it, and you
> review and promote that draft. A form made that way is badged **From document** in the forms
> library; one you built by hand is badged **Manual**.

**B7. DO** — Bring a real piece of paperwork in as a document through Processing and let Alloy derive
a form draft from it.

**B8. DO** — Review the questions it found — correct them, drop what it invented, add what it missed
— and then create the form from that draft.

**B8. EXPECT** — You end with a **draft** form. Creating it from a document does **not** publish it
and does not produce a family link; publishing is a separate, deliberate act back in Forms Studio.

**B9. DO** — Judge the honest thing: was that faster than typing the form out by hand, or slower?

> **STOP AND REPORT** if you cannot find the way to bring a document in at all. The pipeline exists
> in the product; if it is unreachable from where an administrator would look, that is a finding
> about the product and not about you.

## B10 — the Enrollment process itself

**B10. DO** — Open **Organization → Business Processes → Enrollment** and find the **Enrolling**
stage.

**B11. DO** — Add your scratch form to that stage as something a family must complete.

**B12. DO** — Put the requirements in a deliberate order, and set for each one whether it is
required, whether it blocks, and whether it must be done before the stage can be left.

**B13. DO** — Add the financial requirement. Choose between charging **once per record** and **once
per child**, and point it at the canonical charge definition rather than typing an amount.

**B13. EXPECT** — The choice between per-record and per-child is explained in terms you can decide
from, without knowing how charges are stored.

**B14. DO** — Publish the new revision.

**B14. EXPECT** — It is clear that you have published something, what changed, and that families
already part-way through are not disturbed by it.

## B15 — launching it as an operator

**B15. DO** — Find a child, start their Enrollment, and get them to **Enrolling**.

**B16. DO** — Send the enrollment paperwork.

**B16. EXPECT** — You are shown a review of what the family is about to receive *before* anything is
sent, and you have to confirm it. Nothing leaves until you do.

**B17. DO** — Confirm, and check the family would have received what the review promised.

## B18 — the Track B question

**B18. DO** — Answer it plainly: **could a school administrator have done all of that without an
engineer?** Where the answer is no, name the step.

---

# Current certified fixture, and why it is not evidence for Track B

The configuration you can see today is real and it works:

- **Admissions Packet** — the long collection form, published and pinned.
- **Family Handbook** — read and acknowledge.
- **Immunization record** — upload a document.
- **Registration fee** — the financial requirement, owed once per child.

That is the **current certified fixture**. It is the right thing to look at when you want to know
what Enrollment does. It is not an answer to Track B, which asks something different and harder:
whether it was easy to create. Looking at a working configuration tends to feel like proof that
building it was straightforward. It is not.

---

# What this walkthrough does not cover

- **Items 7, 8, 9 and 10** — completed documents, Processing and finalization, the whole-packet
  review, and final process validation. They come after item 6 and have their own passes.
- **Anything an agent can decide alone.** Where automated certification already proves something, it
  is not repeated here. What is left is the part that needs a person.
