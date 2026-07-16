---
owner: product
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 09 — Engineering Mission Intake

**Status:** Draft — final Product Office deliverable, pending Kelly's approval.

**Audience:** the Engineering Director.

**Purpose:** everything required to decompose, sequence, assign, and execute — **without reopening Product decisions.**

---

## 1. Executive handoff

**Eight bounded missions. Four may begin immediately. None requires new architecture. None corrects the Product model.**

Current Work is not production ready for one reason, stated once: **four operational concerns each have more than one surface claiming authority, and nothing in the product detects, explains, or certifies the resulting contradiction.** The live tenant is the proof — a process that cannot move a family past its first stage, reported **HEALTHY**.

**Three things the Engineering Director should internalize before decomposing:**

1. **M3 unlocks the demo and fixes nothing.** It is tenant repair. Presenting it as the safety fix would be the most damaging possible misreading of this package.
2. **M1 is the leverage.** Converging movement authority makes the dangling-target class *impossible by construction* — retiring a category of M2 checks before they are built.
3. **Nothing is complete on inspection.** 9 of 10 certification items are unprovable today. **M7 gates all evidence.**

---

## 2. Closed Product decisions — Engineering may not reopen

| Decision | Ruling |
|---|---|
| Which concern is authoritative | **Closed** — §6 |
| Whether Attention changes navigation | **Closed** — it does not. *Attention changes are downward-only* |
| Whether the Frame changes automatically | **Closed** — never. The product **offers**; it does not perform |
| Whether Current Work belongs to Truth or Attention | **Closed** — **Attention** |
| Whether Work Views redefine Stage Membership | **Closed** — they consume it; never redefine |
| Whether Outcomes may move by raw destination text | **Closed** — no. Outcomes **reference** authored paths |
| Whether the Focus Panel remains universal | **Closed** — one panel, re-led by Frame |
| Whether Level 5 certification may be self-issued | **Closed** — **no.** Execution certification is evidence, not a check |
| Automation authorship | **Closed** — the **Automation Platform** owns definitions; Business Processes reference, scope, trigger, constrain, and present entry points |
| Stage grain ownership | **Closed** — **Stage** |
| G-5 cross-domain reconciliation | **Closed — out of v1** |

**Any proposal that violates a §13 invariant returns to Product before implementation.**

## Technical discovery boundary — Engineering may investigate

Current code owners · compatibility paths · saved-configuration migration needs · data repair requirements · test seams · sequencing inside a mission · **implementation alternatives that preserve Product behavior**.

---

## 3. Mission portfolio

| # | Mission | Root | Release | Owner | Start |
|---|---|---|---|---|---|
| **M3** | Reference Enrollment Repair | I1 | **Demo** | Product (contract) · Configuration (repair) · QA (proof) | **Now** |
| **M7** | Certification Environment | *enabler* | Pilot | QA / Certification | **Now** |
| **M8** | Doctrine Reconciliation | *hygiene* | GA | Documentation | **Now** |
| **M6** | Number Provenance | R5 | Demo → GA | Product + UX | **Now** (demo subset) |
| **M1** | Authority Convergence | R1 | Pilot | Product + Runtime | Now |
| **M2** | Configuration Certification | R2 | Pilot | Product + Configuration | **After M1** |
| **M4** | Child Attention Expression | R3 | **Pilot — gate** | Runtime + UX | Now |
| **M5** | Modes and Frame | R4 + I5 | GA | Runtime + UX | Now |

---

## 4. Mission intake — M3 · Reference Enrollment Repair

**Product decision:** Product owns the definition of a representative Enrollment journey and reference dataset. Configuration authors and repairs the tenant against that contract. QA proves it.

**Current observable failure** (`VERIFIED`, 2026-07-16T22:21Z): the Lead stage's only forward outcome targets `qualification` — absent from the process's six stages. Every other outcome says *"Stay in stage"* or closes the lead. **`Tour` is visible in the Builder and unreachable by anything configured.** `Send Form`, `Close Lead`, `Enroll Child`, `Waitlist Child` are all **OFF**.

**Required future behavior:** a director completes **Lead → Tour → Decision → Waitlist|Enrolling → Enrolled → terminal** with no administrative correction and no engineering assistance.

**Reference contract (Product-owned):**

- **Stage set:** Lead · Tour · Decision · Waitlist · Enrolling · Enrolled (+ terminal paths)
- **Forward paths:** every non-terminal stage reaches its successor
- **Branch paths:** Tour completed / no-show / reschedule · Decision → Waitlist | Enrolling | not-enrolling
- **Outcomes:** each branch has a configured outcome that earns it
- **Actions:** journey-critical capabilities coherently available
- **Work View traceability:** *"Registration"* may remain **only if its relationship to `Enrolling` is visible and understandable**
- **Reference data:** a **representative multi-child household** · family- and child-grain states · **no stale `qualification` references** · **no duplicate demo records that create misleading product evidence** · coherent counts at the reference snapshot

**Out of scope:** any product change · any validation capability · **preventing recurrence**.

**Dependencies:** none. **Acceptance:** the journey **executed**, not inspected. **Evidence:** QA-captured execution.

**Protected:** the tenant must stay **representative** — repairing it must not make it a special case the product could not reproduce.

> ### ⚠️ This mission unlocks the demo. It prevents nothing.
> **M3 must never be presented, reported, or accepted as the platform-safety fix.** That is M2. A repaired reference tenant and a safe product are different claims.

---

## 5. Mission intake — M7 · Certification Environment

**Product decision:** the product cannot be declared ready from source inspection or a mutable shared tenant.

**Current observable failure:** the review environment targets a **remote, shared, hosted database**. Forward steps were classed `UNTESTABLE IN SHARED TENANT`; **no mutation was executed in nine reviews.**

**Required properties:** isolated from shared tenant data · **safe for destructive and lifecycle mutations** · deterministic seeded configuration · deterministic seeded records · repeatable reset · known expected outcomes · **a multi-child household** · family- and child-grain stages · **valid *and intentionally invalid* configurations** · observable projection refresh · testable Work Items handoffs.

> The **intentionally invalid** configurations are what make M2 provable. A certification environment that only contains correct configuration cannot certify a product whose defining failure is blessing incorrect configuration.

**Required scenarios:** Lead → Tour · Tour completed / no-show / reschedule · Decision branching · Waitlist · Enrolling → Enrolled · closure and terminal behavior · **child-specific execution** · **disabled-action parity** · projection refresh · out-of-scope Attention · sibling Attention switching · interruption and return · Work Items handoff · count provenance · **configuration certification levels**.

**Evidence Product requires for certification:** for each scenario — the **executed** action, the **observed** resulting state, and the **operator-visible confirmation**. Source agreement is not evidence.

**Dependencies:** none. **Release: Pilot. Owner: QA / Certification.**

> **M7 gates every other mission's completion claim.** It is the single largest unblocker in the initiative and should start first, in parallel with M3.

---

## 6. Mission intake — M1 · Authority Convergence

**Root:** R1 — *competing authorities for one concern*. The violation is **independent claims of authority that can disagree**. Reference and refinement are legitimate.

### A · Action availability

**Existing authorities:** Process Actions (`ON/OFF`) · work template `helpful_actions`.
**Canonical owner:** **Process Actions** — the process's capability decision.
**Legitimate:** work templates **reference** available actions; **refine** which lead here and in what order.
**Must disappear:** any surface offering an action Process Actions has disabled.
**Observable failure:** `Send Form` = `OFF · Disabled`; Current Work offers **"Send form"**.
**Administrator behavior after:** *"I switched it off. It is gone — everywhere."*
**Acceptance:** disabling a capability removes it from every operator surface; a work template cannot make an unavailable capability available.
**Engineering discovery:** existing work templates referencing now-disabled actions — migration/compat.
**Regression risk:** silently dropping legacy actions operators depend on.

### B · Stage grain / Journey

**Existing authorities:** `ROW TYPE (GRAIN)` (Stage Context) · `Journey` (Operational Experience).
**Canonical owner:** **Stage.** *"Stage owns operational work (grain…)"*.
**Legitimate:** Work Views **inherit** — already correct, do not disturb.
**Must disappear:** `Journey` as an independent author. **Its role after convergence: generated output of grain, or removed.** *(Product accepts either; Engineering may investigate which is cleaner — the constraint is that it cannot disagree.)*
**Observable failure:** grain and journey may disagree; `HIGH CONFIDENCE` this is the structural origin of child-track execution failure.
**Acceptance:** one control; no configuration can produce a stage whose grain and journey differ.

### C · Movement / Outcomes / Transitions

**Existing authorities:** `Outgoing Transitions` · outcome `move_to_stage` raw destinations.
**Canonical owner:** **Outgoing Transitions** — the stage's authored movement graph. *The product's own rule:* **"Outcome automation moves records through those transitions — never by destination text alone."**
**Legitimate:** outcomes **reference** a configured path; operators report what happened; **outcome execution earns movement**.
**Must disappear:** raw destination text as an independent movement author.
**Observable failure:** `Outgoing Transitions` renders *"No outgoing transitions configured"* while the outcome carries **`Move to stage: qualification`** and records move.
**Administrator behavior after:** *"I define this stage's exits once. Each outcome picks one. **I cannot pick a stage that doesn't exist.**"*
**Acceptance:** **a dangling target is unauthorable**, not merely detectable.
**Engineering discovery:** existing outcomes carrying raw destinations — migration; targets pointing at stages that no longer exist (e.g. `qualification`, `closed_lost`) — data repair.
**Regression risk:** **the human-confirmed Outcome grammar.** Converging movement must not turn *"WHAT HAPPENED?"* into a path-picker for the operator. **The administrator picks paths. The operator still reports reality.**

### D · Automation

**Canonical owner (ruled):** the **Automation Platform** owns reusable automation definitions and execution behavior.
**Legitimate:** Business Processes **reference · scope · trigger · constrain process applicability · present process-contextual entry points**.
**Must disappear:** any process-owned second automation definition or competing editor.
**Acceptance:** Processes → Automation is a **contextual route into the same canonical product**, never a second authority.

**Release: Pilot. Owner: Product + Runtime.** **M1 precedes full M2.**

---

## 7. Mission intake — M2 · Configuration Certification

**Product decision:** certification has **explicit levels**. The collapse of five questions into one word is what created the trust defect.

| Level | Means | Product may compute? |
|---|---|---|
| **1 — Loadable** | The configuration can be read and rendered | Yes |
| **2 — Structurally Valid** | References, schemas, keys, required structures valid | Yes |
| **3 — Semantically Coherent** | Configured concepts do not contradict ownership, grain, action, Work View, or movement rules | Yes |
| **4 — Operationally Reachable** | **An operator has valid paths through the configured journey** | Yes |
| **5 — Certified Through Execution** | External evidence proves the journey through safe executed scenarios | **No — evidence only** |

**Finding coverage:** dangling targets → **L2** *(retired by M1-C: unauthorable)* · invalid Outcome references → L2 · invalid surface references → L2 · **dead routes → L2** · missing forward paths → **L4** · unreachable terminal states → L4 · workless non-terminal Stages → L4 · action-authority disagreement → **retired by M1-A** · grain conflict → **retired by M1-B** · Work View predicate/description conflict → L3 · cross-grain action ambiguity → L3 · unsupported capability references → L3.

> **M1 retires three whole check categories.** This is why M1 precedes M2 — building detection for contradictions that convergence makes impossible is waste.

**Blocking vs advisory:** **L2 and L4 findings block publish.** L3 warns with explanation. **A remediation explanation names the responsible object, never a raw key.**

**What HEALTHY may mean:** **only Level 4 earns an unqualified positive word, and it must say what it means** — *"An operator can complete this journey."* **Product recommends replacing "Healthy" with explicit certification language**, because the word promises intent while any lower level delivers less. **Level 5 may never be self-issued.**

**Observable failure:** HEALTHY over a severed process, citing `/dept` (404 → marketing site with a "Sign In" link), naming 7 work units against the operator's 6.

**Dependencies: M1.** **Release: Pilot.**

---

## 8. Mission intake — M4 · Child Attention Expression

> ### This is the safe-pilot gate. In childcare, acting on the wrong child is a real-world harm — not a UX defect.

**Product boundary:** *Current Work v1 must safely and explicitly support child Record of Attention **inside the existing Enrollment case context**.*

**Current observable failure** (`VERIFIED`): *"Blocked"* with requirements **"Program"** and **"Date of Birth"** — **naming no child** — while the Children card lists three children each needing program, schedule and start date. **Two field names stand for three children × three gaps.**

**Required behavior:** selected child **explicitly named** · Current Work **resolves to that child** · requirements identify the **actual child instance** · **actions identify the affected child before execution** · Outcomes apply to the intended child · **siblings visible as context but secondary** · changing Attention **recomposes the panel without changing Business Process, Work View, Queue, or Frame** · out-of-scope Attention **named** · the product **offers but never automatically performs** a context switch · **family-level work remains distinguishable from child-level work** · **batch/multi-child actions require explicit subject resolution**.

**Explicitly out of scope:** generalized Billing / Attendance / Scheduling truth-root resolution · **G-5 reconciliation** · **redesign of the Focus Panel shell** · **new interaction primitives**.

**Acceptance:** in a household with two children in different states, the operator can name — **without documentation** — which child she is working on, which child each blocker belongs to, and which child an action will affect.

**Certification cases (require M7):** two children same stage, similar work · children in different stages · one child with Enrollment work and one without · sibling Attention switching · out-of-scope sibling · **action targeting the intended child** · family-level vs child-level work distinguishable.

**Protected:** the **Record of Truth stays anchored in the shell** — Attention is named *within* Truth, never substituted for it. **Laws 7/8 must not regress.**

**Dependencies:** none to build; **M7 to certify.** **Release: Pilot — non-negotiable.**

---

## 9. Mission intake — M5 · Modes and Frame

**Product decision:** the universal Focus Panel expresses **Summary** (ambient understanding) · **Work** (active operational cards) · **Activity** (factual history). **The Context Frame determines what leads**, and must be explicit enough that the operator understands why the panel is composed this way.

**Current observable failure** (`VERIFIED`): mode controls = `["Work", "Activity"]` — **Summary absent** · **Activity errors 3/3** with a raw *"Could not load the opportunity drawer View Model. Retry"* · Frame never surfaced.

**Responsibility leakage to correct:** Summary's ambient understanding → currently in **Work** · Activity's history → currently a **disclosure inside the Current Work card**.

**Required:** Activity **fails honestly or not at all** — no raw errors (I5) · the Frame has **behavioral effect**, not just presence · **Current Work does not absorb Summary or Activity responsibilities** · **one universal Focus Panel remains intact** · queue and Work View continuity preserved · the **default-entry fallback is explained rather than silent**.

**Out of scope:** the literal word **"Mission"** — *the requirement is comprehension and behavioral effect, not vocabulary* · per-domain panels · new primitives.

**Compatibility question for Engineering:** existing per-Work-View Focus Panel surface assignments (*"Enrollment Focus Panel Summary · V10"* vs *"Surface default"*). **Product ruling: per-view assignment that re-orders or emphasizes cards is the Frame mechanism working. A second panel *product* is not.**

**Acceptance:** the operator answers *"why am I here?"* and *"what happened previously?"* without documentation; the same panel entered with two intents **leads differently**.

**Dependencies:** none. **Independent of M4** — restoring Modes does not name the child; naming the child does not restore Summary. **Release: GA.**

---

## 10. Mission intake — M6 · Number Provenance

**Product decision — the contract:** every operational number makes unambiguous its **cohort · grain · time window · source class · enterability · destination parity · meaning of zero**.

**Source classes:** operational projection · analytics · task inventory · snapshot.

**Current observable failure** (`VERIFIED`, single snapshot 22:19:36Z): pipeline card **4 Family Leads / 7 Children** · Today's Work **3 / 3** · roster **3 families / 6 children** · **"Overdue work" 4** beside 3 rows badged **"Overdue"** · **"Needs attention"** naming two cohorts from two engines · **the two analytics tiles are the two that 404.**

**Rules:**
- **Legitimate numbers may differ** — by cohort, grain, or window. *Difference is not the defect; undeclared difference is.*
- **Differently sourced numbers may share a label only when the distinction is unmistakable** — in practice, **never within the operator's field of view**.
- **A visible operational number presented as actionable must enter a destination that reproduces its cohort.** *(The tiles 404 precisely because an analytics number offered a queue's drill.)*
- **Zero may not silently mean broken predicate, unavailable data, or unresolved source.** *(Active Pipeline is the standing example: "worked in the last 15 days" shows 0 while records were updated 3 days prior.)*

**Scope:** workspace process totals · Work View counts · queue rows · Pipeline Children · Needs Attention · Overdue Work · operational task counts · analytics snapshots · reused labels.

**Demo-level completion:** the landing screen does not contradict itself, and no visible number offers a destination it cannot reproduce.
**GA-level completion:** the full contract, everywhere.

**Protected:** **projection count/row parity** — `count === rows.length` held across all six views and must not regress. **Do not eliminate legitimate analytics; label it.**

---

## 11. Mission intake — M8 · Doctrine Reconciliation

**This is a documentation intake, not a doctrine initiative. No parallel tree.**

| Artifact | Class | Existing canonical owner |
|---|---|---|
| Alloy Product Principles | **Evidence** | principles stay with their current owners; the artifact is a **map** |
| Reviews 01–08 | **Evidence / history** | — |
| Canonical Product Model | **Reconcile durable behavior** | *three concerns, three owners* → the doc that already owns the Queue → Operational Context → Focus Panel → Cards spine |
| Focus Panel Product Model | **Reconcile durable behavior** | the Canonical Interaction Model |
| Lifecycle of Record of Attention | **Reconcile durable behavior** | the Canonical Interaction Model — beside the concept it describes |
| Executive Product Assessment (D#1) · Business Process Audit (D#2) | **Superseded historical drafts** | retain; do not treat as current authority |

**Durable conclusions to reconcile:** Truth / Attention / Frame behavior · Mode responsibilities · the Attention lifecycle · **downward-only Attention changes** · **Frame may be offered, never changed automatically** · **Current Work belongs to Attention** · Work View naming and Stage traceability · Work View grain inheritance · certification levels · concern-authority ownership · the number-provenance contract.

**Also in scope — the fossils this review tripped over twice:** *"Stages are rollups"* and *"each maps to a synced queue lane"* are dead copy with **zero consumers** that **actively misled this review**. **Retiring dead configuration copy is documentation work with product consequence.**

---

## 12. Dependency and parallelization graph

```
NOW (parallel):   M3 ──────────────► Release A (demo)
                  M7 ──────────────► gates ALL completion claims
                  M8 ──────────────► Release C
                  M6(demo) ────────► Release A
                  M4 ──────────────► Release B  [gate]  ── certified by M7
                  M5 ──────────────► Release C          ── certified by M7
                  M1 ──► M2 ───────► Release B          ── certified by M7
```

**Only sequential edge: M1 → M2.** **M4 ⟂ M5** (independent — do not collapse). **M3 unlocks a demo and satisfies neither M1 nor M2.** **M7 is required before *any* journey mission is certified complete.**

---

## 13. Protected-invariant matrix

| Invariant | Threatened by | Return-to-Product signal |
|---|---|---|
| Frozen Product Constitution | any mission | a new noun appears |
| Business Process as operator model | M1-C | a third movement mechanism |
| **Persisted Stage Membership** | M1, M2 | membership derived from status again |
| **Work View as navigation/perspective** | M4 | Attention or truth pushed into the lens |
| **Projection count/row parity** | M6 | a second count author, or `count ≠ rows` |
| **Queue preview boundary** | M4 | the queue feeding the panel |
| **One universal Focus Panel** | M5 | a second panel *product* |
| **Focus Panel shell identity ownership** | M4, M5 | a payload changes the visible subject |
| **Queue / Work View continuity (Laws 7/8)** | **M4, M5** | **the workspace remounts; position or filter lost** |
| **Previous / Next scope** | M4 | `Next` ignores the active filter/sort |
| **Required-when authoring** | M2 | plain language replaced by keys |
| **Human-confirmed Outcome grammar** | **M1-C** | the operator picks paths instead of reporting reality |
| **Configuration IA** | M1, M2 | runtime vocabulary in navigation |
| **No new foundational runtime** | M4, M5 | a second composition runtime |
| **No automatic Frame changes** | M4 | the Frame chases the record |

> **Laws 7/8 continuity is the most valuable and most fragile thing in the product — and M4 and M5 both operate directly on the panel that holds it.**

---

## 14. Certification evidence matrix

**Nothing is complete on inspection. All require M7.**

| Scenario | Gated by | Status today |
|---|---|---|
| Lead → Tour | M3 · M2(L4) | `UNTESTABLE` — no path exists |
| Tour branches | M3 | `UNTESTABLE` |
| Decision branches | M3 · M4 | `UNTESTABLE` |
| Waitlist | M3 · M4 | `UNTESTABLE` — zero records |
| Enrolling → Enrolled | M3 · M1 | `UNTESTABLE` |
| Terminal behavior | M3 | `UNTESTABLE` |
| **Child-specific execution** | **M4** | `UNTESTABLE` — **production gate** |
| **Disabled-action parity** | **M1-A** | `UNTESTABLE` — **convergence gate** |
| Projection refresh | — | `UNTESTABLE` |
| Out-of-scope Attention | M4 | `VERIFIED ABSENT` |
| Sibling switching | M4 | `UNTESTABLE` |
| Interruption and return | *(regression)* | **`VERIFIED PASSING` — protect** |
| Work Items handoff | — | `UNTESTABLE` |
| Count provenance | M6 | `VERIFIED FAILING` |
| Certification levels | M2 | not built |

---

## 15. Cross-mission risk register

| Risk | Product mitigation | Certification requirement |
|---|---|---|
| **Corrupting tenant configuration during convergence** | Convergence changes *authority*, not operator-visible behavior, unless the behavior was already wrong. Every migration preserves the administrator's expressed intent | Before/after config comparison; no silent behavior change |
| **Breaking Laws 7/8 while adding Attention or Modes** | **The highest-severity risk in the initiative.** Continuity is a protected invariant; a regression returns to Product | *Interruption and return* certified on **every** M4/M5 build |
| **Creating a second Focus Panel composition runtime** | One panel is closed doctrine. Re-leading is the Frame; a second product is not | One panel demonstrable across ≥2 Frames |
| **Silently dropping legacy actions or outcomes** | Convergence must **name** what it removes; honest gaps, never invention | Inventory of dropped references, operator-visible |
| **Certifying only the repaired reference tenant** | **M3 proves the journey; it does not prove the product.** M2 must be certified against **intentionally invalid** configurations | M7 must contain invalid configs; **M2 certified on configs M3 never saw** |
| **Conflating analytics and operational truth** | Analytics is legitimate; the collision is the defect. Label, do not eliminate | Count-provenance scenario |
| **Over-expanding M4 into cross-domain subject architecture** | **G-5 is closed and out of v1.** M4 is Enrollment-case-scoped | Any Billing/Attendance/Scheduling truth-root work returns to Product |
| **Treating M8 as architecture redesign** | It is reconciliation into existing owners. **No parallel tree** | No new doctrine directory |
| **Marking work complete without executed evidence** | **Source agreement is not evidence.** This review made that error's inverse cost visible nine times | Every §14 row carries an executed artifact |

---

## 16. Recommended Engineering Director decomposition order

1. **Start now, in parallel:** **M7** (gates everything) · **M3** (demo) · **M8** (independent) · **M6-demo**.
2. **Start now, longest lead:** **M1** — it is the leverage and M2's prerequisite. Decompose by concern (A/B/C/D); **C is the highest value**.
3. **Start now, independent:** **M4** — the pilot gate. Do not wait for M1.
4. **After M1:** **M2** — and expect it to be **smaller than scoped**, because M1 retires three check categories.
5. **When capacity allows:** **M5**, then **M6-full**.

**Suggested slot shape:** M1-C and M4 are the two deepest missions and should not share a slot. M3 and M7 are different disciplines and can run beside each other.

---

## 17. Product Office closeout statement

**Nine reviews. One conclusion:**

> **Alloy's product model is sound, and Alloy does not yet obey it.**

Every root violation is the product failing to do what it **already says about itself** — in canonical doctrine, in frozen RFCs, in shipped copy. **Not one correction requires a new idea.** The Constitution was **discovered, not invented**; the strongest evidence for that is that it survived four attempts to break it, and every attempt found a layer we hadn't read yet.

**What is genuinely built** is more than this review's tone might suggest: a real shell that anchors identity and never loses the operator's place; a projection whose counts and rows agree by construction; Work Views that consume stage membership exactly as the frozen chain requires; *"Required when"*; and **"WHAT HAPPENED?"** — an outcome grammar that lets a director narrate her day instead of operating a state machine. **These must not be rebuilt.**

**What is not built** is the product's ability to tell the truth about itself: which authority governs, whether a configuration works, which child is being acted on, why this panel looks like this, and what a number counts.

**One caution to the Engineering Director.** This review made the same error it kept finding — quoting dead copy as live doctrine, twice — because in this repository **no single document is the model**, and stale text outlives the decisions that retired it. **Verify what is live before trusting what is written.** That habit is worth more to this initiative than any finding in this package.

**Product Office work is complete. No implementation has begun. Awaiting approval.**
