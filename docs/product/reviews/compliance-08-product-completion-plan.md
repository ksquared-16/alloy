---
owner: product
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 08 — Product Completion Plan

**Status:** Draft — Product Office plan. Product language only; no implementation.

---

## 1. Executive plan

**Seven missions. Four of them run in parallel. One is not product work at all.**

The initiative is bounded because **no mission requires new architecture and none corrects the Product model.** Every mission moves the product toward what it already says about itself.

**The plan's spine:**

- **M3 (Reference Repair)** unblocks the **demo**. It is *tenant* work, not product work, and it prevents nothing from recurring.
- **M1 (Authority Convergence)** is the highest-leverage *product* correction, and the prerequisite for **M2 (Certification)** — you cannot certify a concern whose authority is contested.
- **M4 (Child Attention)** is the **production gate**. In childcare, acting on the wrong child is a real-world harm.
- **M5, M6** make the product honest about *why* and *how many*.
- **M7 (Certification Environment)** is the single largest unblocker of evidence: **9 of 10 certification items are unprovable today.**
- **M8** reconciles durable conclusions into existing doctrine — **no parallel tree.**

---

## 2. Accepted decisions and scope boundaries

| Decision | Effect on this plan |
|---|---|
| **R1 renamed — "Competing authorities for one concern."** The violation is *independent claims of authority that can disagree*; reference and refinement are legitimate. | **Reclassifies one instance out of R1.** See §4. |
| Live tenant = representative evidence of a **Product-safety gap**; not assumed representative of all tenants. | **M3 and M2 are separate missions.** |
| **G-5 cross-domain reconciliation is out of v1.** Boundary: *"Current Work v1 safely and explicitly supports child Record of Attention inside the existing Enrollment case context."* | **M4 is scoped to Enrollment.** Billing/Attendance/Scheduling truth-roots are out. |
| Review 07 corrections accepted. | Prior classifications stand corrected. |
| **"Registration" may remain if the Stage relationship is visible.** Labels may name the job; they may not conceal position. | **M3 carries traceability**, not a rename. |
| **Ratify by reconciliation into existing canonical owners. Do not self-canonize.** | **M8 creates no new doctrine tree.** |

---

## 3. Product mission map

| # | Mission | Root | Severity | Release | Owner |
|---|---|---|---|---|---|
| **M1** | **Authority Convergence** | R1 | CRITICAL | **Pilot** | Product + Runtime |
| **M2** | **Configuration Certification** | R2 | CRITICAL | **Pilot** | Product + Configuration |
| **M3** | **Reference Enrollment Repair** | I1 | CRITICAL *(demo)* | **Demo** | **Configuration (tenant)** |
| **M4** | **Child Attention Expression** | R3 | CRITICAL | **Pilot** | Runtime + UX |
| **M5** | **Modes and Frame Expression** | R4 (+ I5) | HIGH | **GA** | Runtime + UX |
| **M6** | **Operational Number Provenance** | R5 | HIGH | **Demo (entry) → GA (full)** | Product + UX |
| **M7** | **Certification Environment** | *enabler* | CRITICAL | **Pilot** | QA / Certification |
| **M8** | **Doctrine Reconciliation** | *hygiene* | MEDIUM | **GA** | Documentation |

**Considered and rejected as missions:** "Current Work completeness" (I3) — Review 06 established that a departure preserving mission, subject and return is *legitimate*; the workspace takeover already is. Inline execution is a post-v1 improvement, not a correction. "Universality" (I2) — real, but blocks no v1 claim.

---

## 4. Concern-authority convergence map (M1)

**The rename changes the map.** Applying *"independently claims authority and can disagree"*:

| Concern | **Canonical Product owner** | May reference | May refine | Must stop authoring | Administrator experience after convergence |
|---|---|---|---|---|---|
| **Action availability** | **Process Actions** — the process's capability decision | Work templates | Work templates choose *which available action leads here*, and in what order | Nothing may surface an action Process Actions has disabled | *"I switched Send Form off. It is gone — everywhere. My work templates can no longer offer it."* |
| **Stage grain** | **Stage** (`ROW TYPE (GRAIN)`) — the frozen chain: *"Stage owns operational work (grain…)"* | Work Views (**inherit** — already correct) | — | **`Journey` must stop authoring.** It becomes **generated output** of grain, or it goes | *"I choose the row type once. Nothing else can disagree with it."* |
| **Movement** | **Outgoing Transitions** — the stage's authored paths. *The product's own rule:* **"Outcome automation moves records through those transitions — never by destination text alone."** | Outcomes **reference** a path | Outcomes decide *which* path | **Outcomes must stop carrying raw destinations** | *"I define this stage's exits once. Each outcome picks one. **I cannot pick a stage that doesn't exist.**"* |
| **Automation** | **Undecided — Product Office decision required** (§11) | — | — | One of the two homes | *"There is one place automation lives."* |

**Movement convergence is the highest-value single item in M1:** it makes the dangling-target class **impossible by construction** rather than merely detectable. The administrator cannot author `qualification` because she picks from paths that exist. **That is a whole category of M2 checks retired before they are built.**

### Reclassified out of R1 — **operational counts**

Under the refined definition, **Operational Calculations does not claim authority over queue truth.** It computes a *different concern* (analytics) and merely **collides on a word**. Two surfaces are not disagreeing about one concern — they are agreeing about two concerns while sharing a name.

**Counts move wholly to R5 / M6.** R1 has **four** instances, not five. *(This is a genuine refinement produced by the rename, not a softening.)*

---

## 5. Configuration certification contract (M2)

### One verdict or several? — **Several, explicitly.**

**The collapse of five questions into one word is what created the trust defect.** "HEALTHY" cannot honestly summarize five different things; that is precisely how it came to bless a severed process.

| Level | Means | Catches |
|---|---|---|
| **1 — Structurally loadable** | The configuration parses and resolves | *(roughly what Health checks today)* |
| **2 — Structurally valid** | Every reference points at something that exists | **dangling Stage targets** · unavailable Outcome references · invalid surface references · **broken routes** |
| **3 — Semantically coherent** | The parts do not contradict each other | incompatible grain · Work View predicate/description mismatch · cross-grain action ambiguity · *(action-authority disagreement — **retired by M1**)* |
| **4 — Operationally reachable** | **An operator can traverse the journey** | **missing forward paths** · workless non-terminal Stages · terminal-state reachability |
| **5 — Certified through execution** | Someone has actually run it | *everything the product cannot know about itself* |

### What HEALTHY may truthfully mean after completion

> **Only Level 4 earns an unqualified positive word**, and it must say what it means: *"An operator can complete this journey."*
>
> **Level 5 can never be claimed by the product about itself.** Execution certification is **evidence**, not a check. The product may report that certification was run and when — it may not assert it.

**The contract in one line:** *the verdict names the level it reached, and never implies a level it did not test.*

---

## 6. Reference Enrollment Repair (M3)

**Product problem:** the reference tenant cannot demonstrate the product. **Root:** I1 (tenant-configuration defect). **This is not product work, and it prevents no recurrence.**

**In scope:** a valid Lead → Tour path · removal of the stale `qualification` target · journey-critical actions coherently available (`Send Form`, `Close Lead`, `Enroll Child`, `Waitlist Child`) · valid Decision branches · valid Waitlist path · valid Enrolling → Enrolled path · valid terminal paths · **Work View labels traceable to their stages** (per the accepted decision, *"Registration"* may stay if the relationship is visible) · coherent reference data · **removal of duplicate demo records that create misleading product evidence.**

**Explicitly out of scope:** any product change · any validation capability · preventing recurrence *(that is M2)*.

**Dependencies:** none. **Can start immediately and in parallel with everything.**

**Acceptance:** a director completes Lead → Tour → Decision → Waitlist/Enrolling → Enrolled in the reference tenant, with no administrative correction and no engineering assistance.

**Evidence:** the journey **executed**, not inspected.

**Protected:** the tenant must remain a *representative* configuration — repairing it must not make it a special case the product could not reproduce.

**Release: A (Demo).** **Owner: Configuration.**

> **The load-bearing distinction:** M3 makes the demo work. **M3 changes nothing about whether the next customer's tenant will be broken.**

---

## 7. Record of Attention completion (M4)

**Product problem:** the operator cannot tell which child she is working on, and cannot demonstrate which child an action will affect. **Root:** R3.

**Required behavior:**

- The selected child is **explicitly named**.
- Current Work **scopes to that child**.
- Requirements resolve **from Child type to the actual child instance** — *"Wrigley has no program"*, not *"Program"*.
- **Actions identify the child they affect.**
- Sibling context remains **visible but secondary**.
- Changing child Attention **recomposes Current Work without changing Business Process, Work View, Queue, or Frame**.
- An **out-of-scope child is named honestly**.
- The product **may offer** a valid context switch and **never performs one**.

**In scope:** child Attention **inside the existing Enrollment case context**.
**Explicitly out of scope:** generalized Billing / Attendance / Scheduling truth-root resolution · G-5 reconciliation · non-enrollment Records of Truth.

**Dependencies:** none for expression; **M7 for certification**.

**Acceptance:** in a household with two children in different states, the operator can name — without documentation — which child she is working on, which child each blocker belongs to, and which child an action will affect.

**Evidence:** `UNTESTABLE` today. **Requires M7.** Child-specific execution is the gate.

**Protected:** the Record of Truth stays anchored in the shell. **Attention is named *within* Truth — never substituted for it.** Laws 7 and 8 must not regress.

**Release: B (Pilot) — non-negotiable.** **Owner: Runtime + UX.**

---

## 8. Modes and Frame expression (M5)

**Product problem:** two of three Modes are unavailable, so the Frame has nothing to arbitrate and the panel is universal in structure but not in behavior. **Root:** R4 (+ I5).

**Required behavior:** **Summary** exists and owns ambient understanding · **Work** owns active operational cards · **Activity** functions and owns history · the **Frame is explicit enough that the operator understands why the panel is composed this way** · the **Frame determines what leads** · **Current Work does not absorb Summary or Activity responsibilities** · **one universal Focus Panel remains intact**.

**In scope:** the three Modes; the Frame's behavioral effect; **Activity failing honestly rather than with a raw error (I5)**; the default-entry fallback being **explained rather than silent**.

**Out of scope:** the literal word *"Mission"* — **the requirement is comprehension and behavioral effect, not vocabulary** · per-domain panels.

**Acceptance:** the operator can answer *"why am I here?"* and *"what happened previously?"* without documentation; the same panel, entered with two different intents, **leads differently**.

**Protected:** one universal Focus Panel — **re-leading is the Frame mechanism working; a second panel *product* is not.**

**Release: C (GA).** **Owner: Runtime + UX.**

---

## 9. Operational number provenance (M6)

**Product problem:** the first screen answers *"how many families do I have?"* twice. **Root:** R5.

### The Product contract for operational numbers

> **Every displayed number declares, or makes unambiguous, its: cohort · grain · time window · source class · whether it is enterable · what destination reproduces it.**

**Source classes:** *operational projection* · *analytics* · *task inventory* · *snapshot*.

**Which numbers may legitimately differ:** any two whose **cohort, grain, or time window differ** — *"Metrics vs queue counts may differ by grain… This is intentional."* **Difference is not the defect. Undeclared difference is.**

**When two differently sourced numbers may share a label:** **never on the same surface.** A word may name only one cohort within the operator's field of view. *(This is Review 05's non-collision test, promoted to contract.)*

**What zero means:** **zero means "no work matches", and nothing else.** A number that cannot distinguish *no work* from *misconfigured predicate* may not render as zero — **Active Pipeline is the standing example.**

**Enterability:** a number offers a destination **only if that destination reproduces it**. *(The two entry tiles 404 precisely because an analytics number offered a queue's drill.)*

**In scope:** the contract; the entry tiles; the landing screen's self-agreement.
**Out of scope:** designing metric cards; eliminating legitimate analytics.

**Release: A (entry subset — the first screen must not contradict itself or 404) → C (full contract).** **Owner: Product + UX.**

---

## 10. Certification environment and scenario matrix (M7)

**Product problem:** **9 of 10 certification items are unprovable.** The product cannot be declared ready from source inspection or a mutable shared tenant.

**Required environment characteristics:** disposable · deterministic seed · **a known multi-child household** · known Stage Membership · known actions and outcomes · **safe mutation** · resettable · repeatable across builds.

**Scenario matrix — nothing may be marked complete by inspection:**

| Scenario | Gates |
|---|---|
| Lead → Tour | M3 · M2(L4) |
| Tour branches | M3 |
| Decision branches | M3 · M4 |
| Waitlist | M3 · M4 |
| Enrolling → Enrolled | M3 · M1 |
| Closure / terminal behavior | M3 |
| **Child-specific execution** | **M4 — the production gate** |
| **Action-disabled parity** | **M1 — the convergence gate** |
| Projection refresh after mutation | — |
| Out-of-scope Attention | M4 |
| Multi-child switching | M4 |
| Work Items handoff | — |
| Interruption and return | *(regression — Laws 7/8)* |
| Count provenance | M6 |

**Release: B (Pilot).** **Owner: QA / Certification.** **Start immediately — it gates every other mission's evidence.**

---

## 11. Protected-strength regression matrix

| Strength | Threatened by | Regression signal |
|---|---|---|
| Product Constitution | any mission "discovering" a concept | a new noun appears |
| Business Process model | M1 (movement) | a third movement mechanism |
| **Persisted Stage Membership** | M1, M2 | membership derived from status again |
| **Work View model** | M4 | Attention or truth pushed into the lens |
| **Projection count/row parity** | M6 | a second count author, or `count ≠ rows` |
| **Queue preview boundary** | M4 | the queue feeding the panel |
| **Focus Panel shell + continuity (Laws 7/8)** | **M4, M5** | **the workspace remounts; queue position or filter lost** |
| **Required-when authoring** | M2 | plain language replaced by keys |
| **Human-confirmed Outcome grammar** | M1 (movement) | the operator performs the state machine instead of reporting |
| **One universal Focus Panel** | M5 | a second panel *product* (re-leading is fine) |
| **Configuration IA** | M1, M2 | runtime vocabulary in navigation |

**Every mission carries this matrix. Laws 7 and 8 are the most valuable and most fragile thing in the product — M4 and M5 both operate directly on the panel that holds them.**

---

## 12. Release boundaries

### Release A — Demonstrable Reference Journey
**Missions:** M3 · M6 (entry subset).
**Behavior:** a director completes Lead → Enrolled in the reference tenant; the first screen does not contradict itself or 404.
**Remaining limitations:** configuration is still fragile; multi-child is still unsafe; Summary and Activity still absent.
**Evidence:** the journey **executed** in the reference tenant.
**Alloy may truthfully claim:** *"Alloy runs the enrollment journey."*
**Alloy may NOT claim:** *"You can configure this."* · *"It is safe with multiple children."*

### Release B — Safe Production Pilot
**Missions:** + M1 · M2 · M4 · M7.
**Behavior:** an administrator configures a journey, is told truthfully whether it works, and the operator gets what she configured — **for one named child at a time.**
**Remaining limitations:** the Frame is still implicit; Summary/Activity incomplete; full provenance pending.
**Evidence:** the full M7 matrix, executed on a disposable tenant.
**May claim:** *"A director can configure and operate enrollment safely."*

### Release C — General Availability
**Missions:** + M5 · M6 (full) · M8.
**Behavior:** the panel is universal in behavior; every number is honest; doctrine matches the product.
**May claim:** *"Alloy is an operational execution product for enrollment."*
**May NOT claim:** *"Alloy configures any business process."* — that is post-v1.

### Post-v1
I2 (P15 hardcode / universality) · I3 (inline execution) · I4 (vocabulary) · I6 (UX duplications) · PR-3 (pre-publish preview) · generalized out-of-scope · **G-5 cross-domain reconciliation**.

---

## 13. Dependency and parallelization plan

```
M3 ──────────────────────────────► Release A        (no dependencies — start now)
M7 ──────────────────────────────► gates ALL evidence (start now, in parallel)
M6(entry) ───────────────────────► Release A        (parallel)

M1 ──► M2 ──────────────────────► Release B
M4 ──────────────────────────────► Release B        (parallel with M1/M2; needs M7 to certify)

M5 ──────────────────────────────► Release C        (parallel; independent of M4)
M6(full) ────────────────────────► Release C
M8 ──────────────────────────────► Release C        (parallel throughout)
```

**Parallel now:** M3 · M7 · M6(entry) · M8.
**Must be sequential:** **M1 → M2** only. Certifying a contested authority means asking *which one*.
**Independent:** **M4 and M5** — restoring Modes does not name the child; naming the child does not restore Summary. *(Established in Review 07; do not collapse.)*
**Unblocks the demo:** **M3.**
**Unblocks safe pilot:** **M4** (the gate) + M1/M2 (the trust).
**Explicitly waits:** universality, inline execution, G-5.

**Sequenced by product dependency and certification value — not engineering convenience.**

---

## 14. Documentation ratification plan (M8)

**No new doctrine tree. Reconcile durable conclusions into existing canonical owners.**

| Artifact | Class | Existing canonical owner for its durable conclusion |
|---|---|---|
| **Alloy Product Principles** | **Evidence** — it is a *map* of beliefs already stated elsewhere (P12–P15 are already frozen in the RFC and truth-flow doctrine) | Its durable contribution is the **catalog**; individual principles stay with their current owners |
| **Canonical Product Model** | **Evidence** (partly superseded by its own amendments) | Durable conclusion — *three concerns, three owners* — reconciles into **`operational-context-boundary.md`**, which already owns that spine |
| **Focus Panel Product Model** | **Canonical product behavior** | Reconcile the five answers (*anchored to / changes when*) into **`canonical-interaction-model.md`** |
| **Lifecycle of Record of Attention** | **Canonical product behavior** | Reconcile into **`canonical-interaction-model.md`** — the lifecycle belongs beside the concept it describes |
| **Reviews 03–07** | **Evidence** | Retain as review artifacts |
| **Executive Product Assessment (D#1)** | **Superseded draft** | Retain historically — its V1 classification was corrected |
| **Business Process Audit (D#2)** | **Superseded draft** | Retain historically — P4 withdrawn |

**Also in M8 — the fossils this review tripped over twice:** *"Stages are rollups"* and *"each maps to a synced queue lane"* are dead copy with zero consumers that **actively misled this review**. Retiring dead configuration copy is documentation work with product consequence.

---

## 15. Inputs required for Review 09 — Engineering Mission Intake

1. **Seven missions**, each bounded to one Product responsibility, with acceptance and protected strengths.
2. **The convergence map** (§4) — four concerns, each with an owner and a reference/refinement rule. **Automation's owner is undecided.**
3. **The certification contract** (§5) — five levels; what HEALTHY may mean.
4. **The regression matrix** (§11) — **Laws 7/8 are the most fragile.**
5. **The scenario matrix** (§10) — nothing complete by inspection.
6. **Release boundaries and truthful claims** (§12).

### Product Office decisions still required

1. **Automation's canonical owner** — process-scoped or platform-scoped? Blocks M1's fourth instance only.
2. **Ratify M8's classification** — particularly that the Principles artifact is *evidence*, not doctrine.
3. **Accept the R1 reclassification** — counts move to R5; **R1 has four instances, not five.**
4. **Confirm M3's scope** — is repairing the reference tenant Configuration's work, or does it need a Product owner to define "representative"?
