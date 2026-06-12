# POS-10 — Visual Validation Review

> **Status:** Planning artifact — visual/experiential validation of the frozen POS vision. Draft.
> **Not architecture, not implementation, not schema, not API design.** This document evaluates one question only: **does POS feel like Alloy?**
> Inputs (source of truth): **POS-07**, **POS-08**, **POS-09**. Doctrine, object model, platform structure, and navigation are **frozen** and are *not* re-evaluated here.
> Inherits from **POS-01 … POS-09**. Branch: `pos-planning-v1`.

## Scope and method

This is a **validation pass, not product discovery.** It does not propose new concepts, workspaces, or object names. Where it recommends refinements, those refinements are strictly **visual and experiential** — they sharpen how the *already-accepted* doctrine is rendered. Any recommendation that would change doctrine, navigation, or the object model is explicitly out of bounds and is flagged as such rather than pursued.

Each of the eight screens is evaluated against the binding question the sprint assigned it, with five fields: **What Works · What Feels Un-Alloy · Recommended Refinements · Confidence Level · Remaining Risks.**

**Confidence scale:** High (ready to validate as-is) · Medium-High (validate with minor refinements) · Medium (validate the direction; refine before mockup sign-off) · Low (needs rework before validation).

**The throughline being validated:** the hero object. CRM→Lead, Lifecycle→Work Unit, Communications→Conversation, **POS→Processing Case.** A screen "feels like Alloy" when the Processing Case (or its supporting libraries) reads as the operational equivalent of a Work Unit, and when BOS participates from the right rail without becoming the workspace. Forms, packets, and documents must never overtake the Processing Case as the primary object.

---

## Screen 01 — Processing Workspace

**Assigned question:** Would an Alloy operator immediately understand what requires attention?

**What Works**
- The "what needs my attention?" framing maps cleanly onto the existing Work Unit Workspace + Operational Queue mental model; an Alloy operator already knows how to read a dense queue of operational rows.
- Lifecycle-state filter tabs (Needs Review / Processing / Needs Resolution / Ready / Completed) mirror Alloy queue lanes/pills, so the triage gesture is familiar.
- The BOS rail's "I found 23 items that need your review" + Top recommendations is the established BOS summary pattern, not a new surface.

**What Feels Un-Alloy**
- The top **counter row** (Needs Review 23 · Processing 18 · …) is the single biggest risk of reading as a generic SaaS dashboard if rendered as tiles. Alloy workspaces lead with the queue, not a metrics strip.
- Putting a **BOS confidence %** on *every* row risks visual noise and a "scored inbox" feel that Alloy's current queues don't have.

**Recommended Refinements** (visual only)
- Demote counters to quiet inline text/ghost chips above the queue (orientation, not tiles); never give them card chrome, sparklines, or color fills.
- Show confidence on a row only when it's decision-relevant (e.g. ready-to-approve or low-confidence); otherwise let the status pill carry the signal, consistent with current queue-row density.
- Keep the source-type glyph small and monochrome so channel is legible without turning the queue into an icon gallery.

**Confidence Level:** Medium-High.

**Remaining Risks**
- Counter row drifting into dashboard territory during mockup execution.
- Confidence% over-exposure making the workspace feel like an analytics inbox rather than an operational queue.

---

## Screen 02 — Processing Case (Smith Family — Subsidy Contract)

**Assigned question:** Does this feel like the natural Alloy equivalent of a Work Unit?

**What Works**
- This is the screen that most directly validates the hero object, and the structure supports it: a single named case, a state badge, an operator decision to drive forward — structurally the same posture as opening a Work Unit.
- Evidence (source preview) beside reading (extraction) beside the decision (proposed outcomes) is a coherent operational story, and the right-rail **Approve All** as the strongest element correctly locates the decision where Alloy operators expect the primary action.
- Treating extracted values as **proposals with confidence** is the visual embodiment of records-own-truth — it's the most doctrinally important detail and it's present.

**What Feels Un-Alloy**
- The canvas is asked to carry a lot at once — PDF preview, extraction, linked records, proposed outcomes, and an activity timeline. Rendered naively this becomes a crowded "document review tool," which is busier than Alloy's calm Work Unit canvas.
- A side-by-side PDF viewer can pull the screen toward a **document-centric** feel (the document as hero) rather than the **case** as hero.

**Recommended Refinements** (visual only)
- Lead the Overview tab with a calm case summary (who/what/confidence/next action); push full PDF preview into the existing **Drawer** pattern or the Documents tab, so the canvas stays Work-Unit calm and the document supports the case rather than competing with it.
- Use progressive disclosure: proposed outcomes and extraction expand inline; the timeline lives lower or in History — matching how Work Unit detail reveals depth rather than showing everything at once.
- Keep the case title + state badge visually dominant over the source/document name, so the reader's anchor is the Processing Case, not the contract.

**Confidence Level:** Medium-High (direction validated; refine canvas density before mockup sign-off — this screen deserves the most iteration).

**Remaining Risks**
- Density: trying to show evidence + extraction + outcomes + timeline simultaneously and losing the Work Unit calm.
- Object drift: the contract/document reading as the primary object instead of the case.

---

## Screen 03 — Document Composer

**Assigned question:** Does this feel like document composition rather than form building?

**What Works**
- The document-first canvas with named sections and document typography is the right instinct and is clearly differentiated from JotForm/Cognito in the brief.
- Keeping the field palette lateral and quiet (in support of the document) rather than central is the key move that prevents a form-builder read.
- BOS "this form looks complete" + field suggestions reuses the existing assist pattern rather than inventing a builder-specific AI.

**What Feels Un-Alloy**
- A persistent **"Add Fields" list** is still the strongest pull toward a form-builder metaphor; even lateral, a visible widget palette signals "builder."
- The Notion/Google-Docs reference, taken too literally, can feel *consumer* and under-dense relative to Alloy's operational surfaces.

**Recommended Refinements** (visual only)
- Hide the palette by default; insert fields via an inline affordance (an "+" / slash-style insert at the cursor) so the surface reads as a document being written, not a canvas being assembled. Keep a collapsible palette for power use.
- Anchor the composer in Alloy's existing shell density and Settings/Action-Workspace chrome so "document-first" still reads as *Alloy operational authoring*, not a consumer doc editor.
- Make the Mappings tab visibly tie fields to operational targets, reinforcing that this is a *source that produces outcomes*, not a survey.

**Confidence Level:** Medium-High.

**Remaining Risks**
- The palette (in any persistent form) re-triggering the form-builder aesthetic the doctrine forbids.
- Over-rotating to "Notion" and landing somewhere that feels too consumer for Alloy.

---

## Screen 04 — Packet Builder

**Assigned question:** Does this feel premium enough to become a parent-facing experience?

**What Works**
- The split of operator curation (contents) against a live recipient **preview** is the correct way to make the builder accountable to the family experience.
- The warm branded cover ("Welcome to Little Oaks Academy!", pine mark, Pine Mist) gives a credible premium, child-care-appropriate tone without drifting into marketing software.
- Completion requirements, due dates, reminders, and signature are operational packet concepts, not survey settings.

**What Feels Un-Alloy**
- A three-column builder can read as a generic **email/campaign editor** if the middle preview is treated as a marketing canvas.
- "Premium parent-facing" and "Alloy operational" are in slight tension — pushed toward delight, the preview could lose Alloy's restraint.

**Recommended Refinements** (visual only)
- Treat the recipient preview as a *product surface*, not a marketing layout: restrained type, generous white space, one accent (Bend Pine), the pine mark — premium through calm, not through imagery or color.
- Keep the operator-side columns in Alloy operational chrome (rows, soft borders) so the builder stays clearly inside Alloy even as the preview warms up.
- Show completion/validity state with the same operational language used elsewhere (status pills, Pine Mist progress) so packets feel continuous with the rest of POS.

**Confidence Level:** Medium-High.

**Remaining Risks**
- Preview drifting into marketing-email aesthetics.
- A parent-facing polish pass later introducing a visual language that diverges from Alloy operational doctrine.

---

## Screen 05 — Submission Review

**Assigned question:** Does this feel operational rather than administrative?

**What Works**
- Surfacing **Record Impact** (what truth would change) alongside the review steps is exactly what makes this operational rather than clerical — it ties the review to consequences on canonical records.
- The single clear blocker ("Parent Agreement needs signature") with a one-tap **Send Request** through Communications is an operational resolution, not a form to fill.
- Restrained amber/clay for blockers (not red walls) matches Alloy's calm attention treatment.

**What Feels Un-Alloy**
- A long vertical **review-steps checklist** can read as a compliance/administrative form — the most likely un-Alloy outcome for this screen.
- "Submitted 3 days ago / per-document status table" can tip toward a records-table aesthetic the doctrine warns against.

**Recommended Refinements** (visual only)
- Lead with the **decision and the record impact**, not the checklist; render completeness as a compact status strip rather than a tall to-do list, so the operator sees "what changes + what blocks" first.
- Use operational rows (with the existing Drawer for document detail) instead of a full document table, keeping density Alloy-native.
- Frame the screen around "approve / request" as the two operational moves, with everything else supporting those.

**Confidence Level:** Medium-High.

**Remaining Risks**
- Checklist-forward rendering making it feel like administrative paperwork.
- The documents list growing into a CRM-style table.

---

## Screen 06 — Linkage & Resolution

**Assigned question:** Does this feel trustworthy enough for operators making record decisions?

**What Works**
- Confidence **plus evidence** ("Why this match?": same address, same name, recent activity) is the right trust model — it makes the recommendation auditable rather than a black box.
- Ranked match cards with the top match highlighted (Pine Mist + Bend Pine confidence) gives a clear recommendation while preserving operator choice (Confirm / Create New / Request Info / Defer).
- Explicit duplicate handling ("two strong matches — review both") respects the gravity of record decisions.

**What Feels Un-Alloy**
- Large **confidence percentages** as the dominant visual can feel like a scoring/ML product rather than an Alloy operator tool, and can over-anchor operators on the number instead of the evidence.
- If the recommended match is *too* pre-selected/styled, it risks implying the system already linked it — undercutting "operator approves."

**Recommended Refinements** (visual only)
- Make **evidence** the visual lead and confidence the supporting signal (evidence-first, percentage second) so trust comes from the *reasons*, not the score.
- Style the recommended match as *recommended-but-not-confirmed* (clearly actionable, clearly not yet done) to keep the human firmly in the decision.
- Reuse the Drawer pattern for the selected-record detail so operators evaluate a real record in a familiar surface.

**Confidence Level:** Medium-High.

**Remaining Risks**
- A "match score" aesthetic that feels more like an ML demo than Alloy.
- Visual pre-selection implying auto-linkage and eroding the approval model.

---

## Screen 07 — Outcome Configuration

**Assigned question:** Does this communicate Alloy's operational advantage clearly?

**What Works**
- The readable top-to-bottom **recipe** (Create Subsidy Profile → Create Billing Setup → Link to Child → Start Reimbursement Workflow → Send Confirmation) is genuinely where Alloy's operational advantage becomes legible — it's the moat made visible.
- Locating it in **Settings** (config-not-code) rather than a separate workspace is correct and keeps it Alloy-native.
- The BOS validity checklist + estimated impact ("creates 2 records, starts 1 workflow, sends 1 email") communicates consequence clearly.

**What Feels Un-Alloy**
- An ordered list of steps with triggers and toggles can read as a **Zapier/automation-builder** — a flowchart/canvas rendering would be distinctly un-Alloy.
- "Auto Execute" toggles, if visually prominent, risk implying autonomy that contradicts the operator-approval doctrine.

**Recommended Refinements** (visual only)
- Render the recipe as a calm **configured list** in Settings chrome (not a node graph, not connector lines); the strength is its readability, not flowchart visuals.
- Visually subordinate "Auto Execute" and keep "proposed → operator approves" language present, so configuration never reads as silent automation.
- Tie each step visually to where it shows up on the Processing Case (the same outcome names) so config and runtime read as one system.

**Confidence Level:** High (this is the most strategically differentiated screen and the direction is strong; keep it list-native, not graph-native).

**Remaining Risks**
- Slipping into an automation-builder/flowchart aesthetic.
- Auto-execute styling undercutting the approval doctrine.

---

## Screen 08 — BOS Right Rail States

**Assigned question:** Does BOS feel like an operational participant while remaining in the right rail?

**What Works**
- The state arc (Idle → Reviewing → Matching → Recommending → Needs Attention → Ready → Approved → Completed) makes BOS a visible *participant* in the operational flow rather than a passive chat box — exactly the intended identity.
- The **Completed receipt** ("created 2 records, started reimbursement workflow, sent confirmation") proves the value of approval without implying autonomy, because it always follows an operator action.
- The degraded state ("BOS unavailable; workspace fully usable") validates the doctrine that the workspace never depends on the rail.

**What Feels Un-Alloy**
- Eight distinct states risk a **busy, shifting rail** that changes character screen to screen — the opposite of Alloy's consistent BOS identity.
- A celebratory "Approved" moment could over-animate and feel consumer.

**Recommended Refinements** (visual only)
- Treat the eight as **one component with a stable anatomy** (header → state/confidence → finding → recommendation → action) and only the content changing — consistency of frame is what keeps BOS feeling like the same participant everywhere.
- Keep transitions restrained (no large success animations); the receipt should be quiet and factual.
- Ensure the only "it happened" state (Completed) is always visually downstream of an operator approval, never standalone.

**Confidence Level:** High.

**Remaining Risks**
- State proliferation making the rail feel inconsistent or noisy.
- The Approved/Completed moment drifting toward consumer-celebratory tone.

---

## Cross-cutting validation summary

**Validated**
- **Processing Case as hero object** is supported by the vision; Screens 01, 02, and 07 reinforce it, and the libraries (POS-08 #08–10) correctly stay subordinate.
- **BOS participation model** (right rail, recommend-not-execute, consistent identity, degrades gracefully) is validated across Screen 08 and every rail behavior.
- **Alloy-native visual language** (Midnight Forge / Bend Pine / Pine Mist / white canvas / Work Unit & Drawer reuse) is consistently specified.

**The single most important watch-item**
- **Canvas density on Screen 02 (Processing Case).** This is the screen that proves the hero object equals a Work Unit. Every refinement above bends toward keeping it calm and case-first (not document-first, not crowded). It deserves the most mockup iteration.

**Recurring un-Alloy temptations to guard against in mockups** (all addressable, none doctrinal)
- Dashboard/counter tiles (Screen 01).
- Form-builder palette (Screen 03).
- Marketing-email preview (Screen 04).
- Administrative checklist (Screen 05).
- ML "score" aesthetic (Screen 06).
- Automation-builder flowchart (Screen 07).
- Rail state proliferation (Screen 08).

**Overall visual confidence:** Medium-High → High. The accepted doctrine is visualizable as Alloy; no screen requires rework, none requires new concepts, and the refinements are execution-level. With the Screen 02 density pass and the seven guard-rails above applied during mockup generation (using POS-09 prompts), the visual direction can be **accepted**.
