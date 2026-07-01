# The Financial Configuration Journey

**Type:** First-run experience walkthrough + critical assessment (design sprint, no code).
**Companion to:** `financial_configuration_product_spec.md` (canonical direction) and the six Operator Experience Specifications (`financial_experience_01..06`).
**Purpose:** Follow a brand-new childcare director configuring Financials for the first time, step by step. Name the moments of delight, the moments of confusion, the missing concepts, and — honestly — where the product still feels like software versus where it finally feels like an operating system. This is the blueprint's reality check.

> **Read this as the acceptance narrative.** If the build matches the six specs but fails this walkthrough, the specs were implemented and the *product* still missed. The journey is the real bar.

---

## The persona

**Maya** runs a two-location childcare org (North Campus, River Campus), ~90 children, ages 18 months–5 years, three programs (Toddler, Preschool, Pre-K). She has never used Alloy. She is not an accountant. She bills weekly, charges a registration fee, runs occasional field trips, and charges for late pickup. She has a spreadsheet and a payments processor and is tired of both. She has 30 minutes before pickup.

Her real goal is not "configure Financials." Her goal is: **"Get Alloy to bill my families correctly, the way I already bill them."**

---

## Act 1 — Arrival (Overview)

Maya clicks **Financials**. She does not land on a settings list. She lands on a **journey**: six steps reading left to right — *What you sell → How you price → Financial rules → How charges are created → Where money lands → Tools* — each with a one-line subtitle and a hollow state. Below, four calm cards: *What do we sell? · How do we price? · What are our money rules? · How are charges created?* — all empty, each a door.

A readiness card answers the only question she actually has: **"Is our financial setup complete?"** Right now it says *"Let's set up how your organization bills. Start with what you sell."*

- ✨ **Delight.** She is not staring at a 40-field form or a left rail of 22 settings. She is reading a sentence about her business and being told where to start. The progression *is* the instruction.
- ⚠️ **Confusion risk.** "How We Price" vs "Financial Rules" vs "How Charges Are Created" are three abstractions she hasn't mapped to her world yet. Until she's done it once, she can't tell whether "late pickup fee" is a *price*, a *rule*, or a *charge*. **The journey orients her on order, but not yet on meaning.** (See *Missing concept #1: the worked example.*)

**Maya's mental translation so far:** "Okay — tell it what I offer, then what I charge, then the fiddly rules. Fine."

She clicks **Services**.

---

## Act 2 — What we sell (Services)

The empty state speaks her language: *"Services are the things your organization offers — full-time care, before & after care, drop-in, meals, registration."* A BOS chip offers to **seed the common ones as drafts**. She accepts — four services appear as drafts in seconds.

She opens **Full-Time Care**. There is no Name/Type/Description form. There is a **switchboard**: *"What does this service power?"* — Scheduling, Attendance, Capacity, Waitlist, Tuition, Parent Portal, each on. A chip says **Recurring**. A line says *"Sold per week."*

- ✨ **Delight.** This is the moment Alloy stops feeling like a database. A Service is visibly an *operating switch*, not a catalog row. Turning **Tuition** on is what makes pricing appear. She immediately understands that Full-Time Care is "a thing children attend on a schedule that we bill weekly," because the card *says that operationally*.
- ✨ **Delight.** **Registration** looks different — One-time, no scheduling/attendance/capacity. The product taught her, without a tooltip, that "registration" and "full-time care" are different *kinds* of thing. Billing rhythm as the gating hinge pays off.
- ⚠️ **Confusion risk.** The Service detail shows a **Charges** relationship ("things that post to this service") and a **Rate Plan** relationship ("how this is priced") — but *authoring* lives elsewhere. Maya, mid-flow, may try to set the price *here* (it's where her brain is). The read-through is correct doctrine (one authoring home) but the hand-off must be a visible, inviting path ("Set this price in Rate Plans →"), not a dead link. **If the relationship card doesn't actively route her, she'll feel a wall.**
- 🟥 **Still feels like software:** the word **"Service"** itself. Maya says *"programs"* and *"care types,"* not "services." The spec's vocabulary is cleaner than the schema, but "Service" is still a *platform* noun, not necessarily *her* noun. Worth a naming review against real director language. (*Missing concept #2: vocabulary localization.*)

She associates Toddler/Preschool/Pre-K as programs, leaves the rest, and moves on. The Services step on the journey rail goes **Bend Pine**.

**Maya's translation:** "These are my care types and what each one switches on. Got it."

---

## Act 3 — How we price (Rate Plans)

This is where most software loses her. It does not.

She lands not on "Rate Rules" but on a **price table she could hand a parent**:

```
Standard Tuition — Full-Time Care            [Current]
                Toddler   Preschool   Pre-K
  5 days        $285        $265       $250
  4 days        $245        $230       $220
  3 days        $195        $185       $175
  Half day      $165        $155       $150
  Charges for: ◉ Scheduled days
```

- ✨✨ **Peak delight.** *This is exactly her spreadsheet.* Days down the side, ages across the top, prices in the cells. No "rate rule," no "plan key," no "hybrid." She fills it in from memory in two minutes. **This single screen is the strongest argument that Alloy is an operating system, not a database — it matches how a director already holds price in her head.**
- ✨ **Delight.** "Charges for: Scheduled days / Attended days / Flat weekly" — she picks "Scheduled days" because that's how she bills, and she never has to learn what "hybrid" meant (she never sees it).
- ✨ **Delight at River Campus.** She clicks "Price differently here" and gets **"Same as organization, except…"** — the whole table inherited and muted, and she changes *one cell* (River 5-day Toddler is $295). She changes one number, not twelve. The diff *shows* her exactly what differs. This is overrides done the way a human thinks about exceptions.
- ⚠️ **Confusion risk.** **"Schedule a price change"** vs "Edit." The effective-dated grammar is correct and powerful, but the first time Maya wants to *fix a typo* ($28 should be $285), being asked for an *effective date* may feel like bureaucracy. **The spec needs a clear distinction between "correct a mistake in the current price" (no new version) and "change the price going forward" (a scheduled supersede).** Today's effective-dated model blurs these, and a new director will hit it on day one. (*Missing concept #3: correct-vs-change.*)
- ⚠️ **Confusion risk.** Age columns are "referenced from Programs, not authored here." Right doctrine — but if Maya hasn't set age bands, the columns are empty/confusing and she has no idea why or where to fix it. The empty-column state must route to wherever age bands live.

Rate Plans goes Bend Pine. The readiness card updates: *"You can bill recurring tuition. 3 more steps optional."* — a quiet, huge reassurance.

**Maya's translation:** "This is my pricing sheet. Done."

---

## Act 4 — The fiddly rules (Financial Policies)

She braces for the worst part. Instead she finds **five cards**, and every policy is a **sentence with her number in it**:

> *"We bill **weekly**, invoice on **Monday**, due **on receipt**, with a **3-day** grace period."*
> *"Late pickup costs **$25**."*
> *"Returned payments cost **$30**."*

Everything is already on an **Alloy default**. She changes two numbers. Governance policies (posting review, adjustment approval) are tucked under "Show governance policies" and she never opens them.

- ✨✨ **Peak delight.** A 13-setting policy engine reads as *five business decisions in plain English, pre-filled, change-by-exception.* She is done in 90 seconds and never felt like she was "configuring" anything. **This is the single best translation of database-into-business in the whole product.**
- ✨ **Delight.** "Using Alloy default" vs "Customized" chips mean she always knows what she's touched. Calm under pressure, literally.
- ⚠️ **Confusion risk.** Scope. The first time she wants late pickup to be $30 *only at River Campus*, the "this differs at a location" flow + most-specific-wins resolution is conceptually heavier than anything else she's done. The **resolved-effect preview** ("at River Campus the late fee is $30 because the location overrides the $25 org default") is the saving grace — but scope is the first place Policies stops feeling like sentences and starts feeling like a rules engine. Keep scope *invisible until invoked*, exactly as specced, and this stays calm.
- 🟥 **Still feels like software (mild):** "Financial Policies" as a name. Maya thinks *"billing settings,"* not "policies." Minor, but "Policies" is a faint whiff of admin-console.

**Maya's translation:** "How my billing works. Mostly already right. Changed the late fee and the grace period."

---

## Act 5 — The extra charges (Charges)

She needs registration, field trips, late pickup. She lands on **Charges** ("the things you charge for beyond tuition"). Each is a **sentence**:

> *"When a child **goes on a field trip**, charge **$45** to the **family**, billed **21 days after the event**, as **Program Fees**, needing **no review**."*

She picks the **Event charge** pattern; the sentence pre-fills; she changes "$45" and "21 days." A small read-only ribbon shows **Occurs → Bills → Posts → Collects → Settles**, with the first two lit and a note that the rest is "handled later, not set here."

- ✨ **Delight.** Authoring a charge as a *spoken sentence* is genuinely novel and genuinely clear. She states a business rule; the system stores a config. The pattern-first start (Event / One-time / Attendance / Usage) means she never faces a blank form.
- ✨✨ **Quiet brilliance — the occurs-vs-bills card.** The thing every billing system fumbles — "it happens now but bills later" — is the *centerpiece* here, in plain words ("occurs on the trip date, bills 21 days later"). Maya finally has language for something she's always tracked in her head. **This is teaching the lifecycle without teaching accounting, exactly as intended.**
- ⚠️ **Confusion risk — the deepest one in the product.** Maya configures **Late Pickup** to occur "when an attendance event happens." But in this phase, **nothing fires it automatically** — the trigger is configured but the charge is created manually or via the Simulator. The sentence *promises* automation ("when a child is picked up late…") that the system **does not yet keep**. This is the single most dangerous gap: **the language writes a check the runtime can't cash yet.** Either the copy must soften to "when you record a late pickup" (honest about manual), or first-run must clearly mark attendance/schedule triggers as "coming soon — created manually for now." (*Missing concept #4: honesty about what auto-fires.*)
- ⚠️ **Confusion risk.** "Charges" vs "Rate Plans." Both are "what we charge." Why is tuition over there and field trips over here? The product knows the answer (recurring/priced-by-schedule vs discrete/event-driven) but never *tells* Maya. A one-line framing on each surface ("Recurring tuition lives in Rate Plans; one-off and event charges live here") would close the seam.

Charges goes Bend Pine. Five of six steps complete.

**Maya's translation:** "The extra stuff I bill for, and when each one hits the bill."

---

## Act 6 — Where money lands (Accounting)

She expects QuickBooks. She gets a **question**: *"Is our money mapped?"* — *"9 of 10 kinds of charge have a revenue home. Field-trip revenue has no account — field-trip charges couldn't post."* Below, a simple two-column map: *the thing you charge for → where it lands.* One row is ember. A BOS chip proposes: *"Field-trip revenue → 4000 Program Fees?"* She clicks yes. Green. Coverage 10/10.

- ✨ **Delight.** Accounting is reduced to a *single operational worry* — "is anything unmapped?" — and the gap is named with a consequence, not a code. No debits, no journal, no chart of accounts. A non-accountant finished accounting in 20 seconds.
- ✨ **Delight.** The code-owned categories are shown as reference, marked "managed by Alloy — not editable," *with a reason.* She doesn't fight to add a category; she understands why she can't.
- ⚠️ **Confusion risk.** "Income account 4000 Program Fees." The account *number* (4000) is accounting residue. For Maya it's noise; for her bookkeeper it's essential. The spec correctly tucks numbers under "Advanced" — **hold that line.** If numbers surface by default, this screen reverts to feeling like software.
- 🟥 **Still feels like software (latent):** the very existence of "accounts" presumes she has a chart of accounts. A true greenfield director may not. The BOS seed of default income buckets must be excellent, or this step quietly assumes accounting literacy she lacks. (*Missing concept #5: the no-accounting-system operator.*)

**Maya's translation:** "Make sure each kind of charge has a home so the money goes to the right bucket. Done."

---

## Act 7 — The proof (Financial Simulator)

The readiness card now says *"Ready to bill."* But Maya doesn't fully believe it. The **Tools → Financial Simulator** lets her *check*.

She picks **Riley** (by name), then **Standard Enrollment · from May 5**. The services, schedule (5-day Toddler), and attendance resolve **automatically and show** as chips. She picks **Field Trip**, occurs **May 5**, and clicks **Preview charge**.

A result card: **Scheduled draft · Field Trip · $45 · Occurs May 5 · Bills May 26 (21 days after the event) · lands in Program Fees · Family pays · No review.** Below, three **"Why?"** panels: *the price came from the 5-day Toddler cell; weekly billing, due on receipt, no proration; occurs May 5, bills 21 days later because the Field Trip charge bills 21 days after the event.* A banner: *"Preview only — no invoice, no AR, no posting."*

- ✨✨ **Peak delight — and the emotional climax of the whole journey.** Maya sees a *real child* get a *real, explained* charge, and the system *shows its work.* The three "Why?" panels turn the entire configuration into something **legible**. She now trusts it — not because she was told to, but because she watched it reason. **This is the moment Financials stops being software she configures and becomes a system she operates.**
- ✨ **Delight.** Intent-first (a child, an enrollment) with zero IDs, zero "billable source." She never thinks in records.
- ✨ **Delight.** When she simulates a 4-day schedule with no price, the warning isn't "unresolved" — it's *"No price for a 4-day Toddler schedule"* with a link straight to Rate Plans. **A dead end became a guided fix.** The Simulator isn't just proof; it's a debugger for her own setup.
- ⚠️ **Confusion risk.** "Scheduled draft" vs "Draft" vs the promise that none of this posts. The lifecycle badge is good, but Maya may still ask *"so did I just charge Riley $45?"* The preview-only banner must be impossible to miss, and "Create draft" must be visibly distinct from anything that bills.
- 🟦 **Missing concept #6 — recurring tuition simulation.** The worked example everyone reaches for first is *"what will Riley's weekly tuition be?"* The spec supports a tuition-period mode, but the journey's center of gravity should be **tuition first, field trip second** — because tuition is what a director stress-tests on day one. If the Simulator opens optimized for one-off charges, it answers the second question before the first.

---

## The journey, end to end

Maya configured her org's entire financial model in **~25 minutes**, never saw a UUID, never learned what a "rate rule" or "GL journal" is, and ended by **watching a real child get a correctly-explained charge.** Six steps, six Bend-Pine checks, one readiness card that went from *"let's set up billing"* to *"ready to bill."*

That is, by any honest measure, **an operating system experience, not a software-configuration experience.** The spreadsheet-shaped pricing matrix, the sentence-shaped policies and charges, the single-question accounting, and the self-explaining simulator are each a genuine translation of *database* into *business.*

---

## Moments of delight (ranked)

1. **The Pricing Matrix** — it *is* her spreadsheet. The strongest "operating system" moment.
2. **The Simulator's three "Why?" panels** — the system shows its work; trust is earned, not asserted.
3. **Policies as five pre-filled sentences** — a rules engine that reads like plain English.
4. **The occurs-vs-bills card in Charges** — naming the thing every billing system fumbles.
5. **Accounting as one question** — "is anything unmapped?", gaps named with consequences.
6. **The Services switchboard** — a Service visibly powers operations, not a catalog row.
7. **Override-as-diff** ("same as org, except…") — exceptions the way humans think about them.

## Moments of confusion (ranked by severity)

1. 🟥 **Configured triggers that don't fire yet** (Charges/attendance). The language promises automation the runtime can't yet deliver. *Highest risk — it's a trust breach waiting to happen.*
2. 🟧 **"Correct a mistake" vs "schedule a change"** (Rate Plans/Policies). Effective-dating is right but conflates typo-fixing with forward-dated change. New directors hit it immediately.
3. 🟧 **Rate Plans vs Charges boundary** — "why is tuition there and field trips here?" never explained.
4. 🟨 **Scope** (Policies/Rate Plans) — the first non-org override is the moment "sentences" become a "rules engine." Mitigated by resolved-effect previews; keep scope invisible-until-invoked.
5. 🟨 **Service relationship hand-offs** — read-through cards must actively *route* to the authoring home, or they feel like walls.
6. 🟨 **Empty age columns** — referenced-not-authored is correct, but the empty state must explain where bands live.

## Missing concepts (the gaps the specs don't yet close)

1. **The worked example / guided first-run.** The journey orients on *order* but not *meaning*. A new director needs one end-to-end worked example ("let's price Full-Time Care and bill Riley") threaded through the six steps, not six independent screens. **Recommend: a first-run "Set up billing in 6 steps" guided path that uses the operator's own first service as the running example.**
2. **Vocabulary localization.** "Service," "Policies," "Account" are cleaner than schema but still platform nouns. Validate against real director language; consider org-configurable labels.
3. **Correct-vs-change.** A first-class distinction between fixing the current value and scheduling a future change.
4. **Honesty about auto-fire.** Until Operational Consumption ships, trigger language must not promise automation that doesn't happen. Mark attendance/schedule triggers as "recorded manually for now."
5. **The no-accounting-system operator.** Greenfield directors without a chart of accounts need an excellent default income-bucket seed, or Accounting silently assumes literacy they lack.
6. **Tuition-first simulation.** The Simulator should center the question directors actually ask first: *"what's this child's tuition?"*
7. **The whole-bill view.** Every screen shows charges *atomically*. No surface yet answers *"what will Riley's family actually owe this month, all in?"* — the question a parent will ask on day one. This is arguably the most important missing concept: **a per-family billing summary** that composes tuition + charges + policies into one number. It belongs in the Simulator's future modes, but it's the operator's real north star.

## Where it still feels like software

- **Account numbers** (if they ever surface by default).
- **Effective-dating asked for a typo fix.**
- **Configured-but-inert triggers** (the automation gap).
- **The Rate-Plans/Charges conceptual split** presented without a bridge.
- **"Service / Policies / Account"** as residual platform nouns.

## Where it finally feels like an operating system

- **The Pricing Matrix** — price as a director holds it.
- **Sentence-based Policies and Charges** — business rules spoken, not configured.
- **The Simulator that explains itself** — legibility as a feature; the system reasons in the open.
- **Accounting as a single question** — a non-accountant finishes accounting.
- **The readiness arc** — "let's set up billing" → "ready to bill," earned step by step.
- **No UUIDs, ever** — the operator never once thinks in records.

---

## The one challenge to carry into the build

Every screen here is excellent in isolation. The risk is that **the operator experiences six excellent screens and not one coherent act of "setting up how my business bills."** The connective tissue — a guided first-run that threads one real example through all six, an honest stance on what auto-fires, and a per-family whole-bill view as the north star — is what turns six specifications into one operating system.

**Build the screens to these six specs. Build the *journey* to this document.** If the next sprint ships the screens and skips the connective tissue, Maya will admire each room and still not be sure the house will bill her families. Ship the tissue, and she stops thinking about Alloy at all — which is the highest praise an operating system can earn.
