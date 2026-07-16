---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 07 — Consolidated Gap Analysis and Product Recommendations

**Status:** Draft — Product Office decision artifact. Not doctrine until ratified.

---

## 1. Executive consolidation

**~43 findings across Reviews 01–06 collapse to 5 root violations and 5 independent findings.**

**Why Current Work is not production ready, in one paragraph:** Alloy's product model is sound and its shell is well built. But **five operational concerns are each authored in two places**, so an administrator configures one author while the runtime reads the other — and **nothing in the product detects, explains, or certifies the resulting contradiction.** The live tenant is the proof: a process that cannot move a family past its first stage, reported **HEALTHY**.

**Is the problem one broken tenant, or a product that cannot protect administrators?** **Both — and only the second is a Product finding.** The tenant genuinely is broken (no Lead → Tour path). That is a *tenant-configuration defect*, fixable in an afternoon. **The Product defect is that Alloy accepted it, blessed it, and told the administrator it was ready.** Fixing the tenant fixes the demo. Fixing the product fixes every future tenant.

**Is the remaining initiative bounded?** **Yes.** No root requires new architecture, and no root is a Product-model limitation. Every correction moves the product *toward what it already says about itself*.

---

## 2. Corrections to prior findings

Later reviews supersede earlier ones. Reconciled explicitly:

| Correction | Supersedes | Why |
|---|---|---|
| **Qualification's deletion was intentional and correct.** The frozen chain names *"Stages with no work ('Qualification')"* as an anti-pattern. **The defect is the tenant's stale reference to it**, not the decision. | D#1 framing | R03 |
| **Child-scoped requirement authoring is correct.** The Builder authors type-scope (*"Program required for Child"*) — the only thing expressible at config time. **Instance resolution is a Runtime Expression gap.** | **D#1 · V1 was misclassified by me as `Product`** | R03 |
| **Work Views are constitutionally sound.** They consume Stage Membership correctly and are genuinely operator navigation. | D#2's "three vocabularies" framing | R04 |
| **`All Leads` resolving no row grain is CORRECT** — honest derivation. **Active Pipeline and Tours are the violation** (claiming inheritance from no stage). | — | R04 |
| **The Focus Panel shell is sound.** Truth anchoring, continuity, one-panel-many-intents all hold. | D#1's blanket UI criticism | R02 |
| **Configuration Health verifies plumbing, not journey validity.** | D#1 ("the safety net has a hole") — true but under-specified | R05 |
| **P4 "Stage is contested" — WITHDRAWN.** Decided at S4; "Stages are rollups" is a fossil with zero live consumers. | D#2 | Canonical Product Model §2 |
| **P9 — the requirements model is richer than reported** (timing/scope/enforcement all exist). | D#2's "progress measures form completeness" | R03 |
| **"Configuration is not authoritative" — RECLASSIFIED.** `HIGH CONFIDENCE`: Current Work reads the **work template's `helpful_actions`**; Process Actions ON/OFF is authored in a **different place**. The admin toggles author A; the runtime reads author B. **This is duplicate authorship (R1), not runtime disobedience.** My "configuration must steer" headline in R03/R05/R06 named a *symptom*. | R03 · R05 · R06 headlines | §4 |
| **Shared-tenant mutation limits execution evidence.** Nothing downstream of Lead was executed. | — | R06 |

---

## 3. Protected strengths register

**The Completion Plan must preserve these explicitly. None may be disturbed.**

| Strength | Why it is correct | Verified in | Must not be disturbed by |
|---|---|---|---|
| **The Product Constitution** | Discovered, not invented; canonical since June 2026; explains every pressure test | Falsification report | Any "new concept" |
| **Business Process model** | The frozen ownership chain is coherent and complete | R03 · Canonical Model | Adding a movement mechanism |
| **Stage Membership model** | *"Membership is the persisted stage — not a status filter."* Post-S4, correct | R03 | Reintroducing status-derived membership |
| **Work View model** | Consumes membership; never redefines it; genuinely operator navigation | **R04** | Pushing Attention or truth into the lens |
| **Projection count/row parity** | `count === rows.length` held across all six views | R04 · R06 | A second count author |
| **Queue preview boundary** | *"Rows are previews, never operational truth"* | R05 | Letting the queue feed the panel |
| **Focus Panel shell + continuity** | Truth anchored, never pending; process/view/filter/sort/position preserved across **every** interaction in six reviews. **Laws 7 and 8 hold.** | **R02 · R06** | Any change that remounts the workspace |
| **Requirement timing authoring** | *"Required when → Creating the record / During this stage / Leaving this stage / Completing the process."* **The best control in the product** | **R03** | Replacing plain language with keys |
| **Human-confirmed outcome grammar** | **"WHAT HAPPENED?"** — operators report reality; the system derives meaning | **R01 · R06** | Making the operator perform the state machine |
| **One universal Focus Panel surface** | One panel; no per-domain drawer products | R05 | A second panel *product* (re-leading is fine) |
| **Configuration IA** | Organization · Data Model · Operations · Business — plain language, correct grouping | R05 | Runtime vocabulary in nav |

---

## 4. Root violation map

### R1 — One concern, two authors · **CRITICAL** · Product · `VERIFIED` (4 of 5 instances)

**Constitutional principle:** the frozen ownership chain — *"If a design decision violates this chain, stop and redesign it."*
**Promise broken:** *configuration steers behavior.*

**Five instances:**

| Concern | Author A | Author B | Symptom |
|---|---|---|---|
| **Action availability** | Process Actions `ON/OFF` | work template `helpful_actions` | `Send Form` OFF, still offered (`HIGH CONFIDENCE` on cause) |
| **Stage movement** | `Outgoing Transitions` | outcome `move_to_stage` targets | Transitions renders **empty** while records move |
| **Stage grain** | `ROW TYPE (GRAIN)` | `Journey` | grain/journey may disagree → child-track failure |
| **Operational counts** | Operational Projection | Operational Calculations | 4/7 vs 3/3 vs 3/6 on one card |
| **Automation** | `/settings/automation` | Processes → Automation | two homes, both incomplete |

**Surfaces:** Builder · Current Work · Focus Panel · workspace · Health.
**Operator consequence:** she is offered actions that are off, and sees numbers that disagree.
**Administrator consequence:** **she configures the author the runtime does not read, and the product never tells her.** Her model of her own system is false.
**Fixed if corrected:** the disabled-action symptom · the empty-Transitions contradiction · the grain/journey conflict · the count disagreement · automation confusion.
**Remains:** everything in R2–R5.

### R2 — The product cannot certify its own configuration · **CRITICAL** · Product-safety · `VERIFIED`

**Principle:** *Configuration should feel easier than execution* · *honest gaps, never invention.*
**Promise broken:** *if the product says ready, it is ready.*

**Evidence:** HEALTHY over a process with no forward path and a dangling stage target · Health cites `/dept` (404 → marketing site with "Sign In") · Health names 7 work units vs the operator's 6 · *"Lifecycle appears on the workspace"* · no pre-publish preview · Active Pipeline's label/count contradiction shipped.

**What HEALTHY certifies today:** *the plumbing resolves.* **The word promises intent; the check delivers wiring. That gap is the violation.**

**Operator consequence:** none directly — she never sees Health. **Administrator consequence: false confidence, at the exact moment she is deciding whether to trust her work.**
**Fixed if corrected:** invalid configuration becomes visible and self-correctable — including I1.
**Remains:** R1 (you cannot certify a concern with two authors), R3, R4, R5.
**Dependency: R1 → R2.** Certification is meaningless while two authors exist.

### R3 — The Record of Attention is not expressed · **CRITICAL** · Runtime Expression · `VERIFIED` / `HIGH CONFIDENCE`

**Principle:** *"The drawer makes the active child and relationship scope explicit"* · forbidden: *"household-global authority assumptions across multiple children/guardians."*
**Promise broken:** *the operator knows what she is working on.*

**Evidence:** *"Blocked"* with *"Program"* / *"Date of Birth"* **naming no child**, while the Children card lists each child's gaps · no active-child indicator · child-grain Work Views open a family panel · out-of-scope never expressed (`resolveFocusPanelScope`, zero callers) · the Decision split only in the drawer Overview.

**Operator consequence:** *"Program is missing"* is unactionable. **And multi-child action targeting is undemonstrable — which is why multi-child is not *safe*, independent of whether it is correct.**
**Fixed if corrected:** child naming · multi-child safety · blocker actionability · out-of-scope honesty · the type→instance resolution gap.
**Remains:** R4 (Modes), and Current Work would still be a launcher (I3).

### R4 — The Mode system is incomplete, so the Context Frame is inert · **HIGH** · Runtime Expression · `VERIFIED`

**Principle:** three Modes; *the Frame decides which Mode leads.*
**Promise broken:** *one panel serves every intent.*

**Evidence:** mode controls = `["Work", "Activity"]` — **Summary absent** · Activity errors **3/3** · Frame/Mission never named · Summary's content and Activity's history both collapsed into Work.

**Dependency established in R02:** Modes → Frame. **The Frame is inert *because* the Modes it would arbitrate do not exist.** These are one root, not two.
**Independent of R3** — restoring Modes would not name the child; naming the child would not restore Summary. **Correctly not collapsed.**

**Operator consequence:** she cannot answer *"why am I here?"* or *"what happened previously?"*
**Fixed if corrected:** the panel becomes universal in behavior, not just in structure.
**Remains:** R3.

### R5 — Operational numbers do not declare provenance · **HIGH** · Product · `VERIFIED`

**Principle:** *"Analytics… must not masquerade as operational queue truth"* · *"must be labeled as such."*
**Promise broken:** *every screen answers an operational question.*

**Evidence (one snapshot, 22:19:36Z):** pipeline card **4 Family Leads / 7 Children** vs Today's Work **3/3** vs roster **3 families / 6 children** · **"Overdue work" 4** beside 3 rows badged **"Overdue"** · **"Needs attention"** = a capped org snapshot *and* a per-view projection signal · the render VM carries **no cohort, grain, or source** · **the two analytics tiles are the two that 404** — *the number cannot drill because it is not a queue count.*

**Distinct from R1:** R1 is *two authors*; R5 is *no declaration*. Even with one author, analytics would still legitimately differ — and would still need labelling.
**Operator consequence:** she cannot establish the size of her own business on the screen built to orient her. **Every later number inherits that doubt.**

**Which numbers may differ, and what makes it honest:** a number may differ when its **cohort**, **grain**, or **source** differs — *"Metrics vs queue counts may differ by grain… This is intentional."* **It is honest when the surface declares which, and when its destination reproduces it.** It is dishonest when it wears another concept's word on that concept's surface.

---

## 5. Symptom-to-root traceability

| Symptom | Root |
|---|---|
| `Send Form` OFF yet offered | **R1** |
| Outgoing Transitions empty while records move | **R1** |
| `Journey` vs `ROW TYPE (GRAIN)` | **R1** |
| Automation in two homes | **R1** |
| Counts disagree (two engines) | **R1** + R5 |
| HEALTHY over a severed process | **R2** |
| Health cites `/dept`; 7 vs 6 units; "Lifecycle"; debug string | **R2** |
| No pre-publish preview | **R2** |
| Active Pipeline label/count contradiction | **R2** |
| Dangling `qualification` permitted | **R2** (+ I1 as the instance) |
| Blockers name no child | **R3** |
| No active-child indicator; child view opens family | **R3** |
| Out-of-scope never expressed | **R3** |
| Decision split off-panel | **R3** |
| Type→instance requirement gap | **R3** |
| Summary absent; Activity errors | **R4** |
| Frame/Mission never named | **R4** |
| History collapsed into a card | **R4** |
| 4/7 vs 3/3 vs 3/6 | **R5** |
| "Overdue work" vs "Overdue" badge | **R5** |
| "Needs attention" ×2 | **R5** |
| Entry tiles 404 | **R5** |
| **No Lead → Tour path** | **I1** (tenant) — *permitted by R2* |
| `enrollmentStageMembership` hardcode | **I2** |
| Current Work is a launcher | **I3** |
| Raw slugs · "grain" · "opportunity" · doctrine filename · "configured result" | **I4** |
| Activity's raw error text | **I5** |
| Two competing CTAs · WAITING ON/REQUIREMENTS duplicate | **I6** |

### Independent findings — must NOT be collapsed

| # | Finding | Scope class | Severity |
|---|---|---|---|
| **I1** | **This tenant has no Lead → Tour path** | **C — Tenant-configuration defect** | **CRITICAL (demo)** |
| **I2** | Domain hardcode: Stage Membership vanishes for non-enrollment (**P15**) | Implementation hardcode | HIGH (blocks universality only) |
| **I3** | Current Work is a launcher — one inline form | Capability not built | HIGH |
| **I4** | Unfinished vocabulary rename | UX / Documentation | MEDIUM |
| **I5** | Activity's raw error | **Implementation defect** — the only one | HIGH |
| **I6** | Competing CTAs · duplicate requirement lists | UX | MEDIUM |

---

## 6. Severity and scope

| Root | Severity | Scope class |
|---|---|---|
| **R1** One concern, two authors | **CRITICAL** | Product-model design defect |
| **R2** Cannot certify configuration | **CRITICAL** | **B — Product-safety** |
| **R3** Attention not expressed | **CRITICAL** | **D — Runtime-consumption** |
| **R4** Modes incomplete → Frame inert | **HIGH** | D — Runtime-consumption (+ I5) |
| **R5** No provenance | **HIGH** | Product |
| **I1** No forward path | **CRITICAL (demo only)** | **C — Tenant configuration** |
| **I2** Domain hardcode | HIGH / FUTURE for v1 | Implementation hardcode |
| **I3** Launcher | HIGH | Capability not built |

**`E — Unverified execution risk`:** the stranding consequence · child-specific action targeting · Waitlist movement · Enrolling → Enrolled · terminal states · projection refresh after mutation. **All supported by config/source evidence; none executed.**

### Forward-path analysis — the four distinctions, kept separate

| Question | Answer |
|---|---|
| Is the absence itself a tenant configuration defect? | **Yes — C.** This tenant's Lead stage has no forward outcome. |
| Is allowing it to publish a Product-safety defect? | **Yes — B.** Nothing prevented or flagged it. **R2.** |
| Is reporting HEALTHY a trust defect? | **Yes.** The most damaging form: it converts uncertainty into confidence. **R2.** |
| Is the dangling `qualification` a stale-configuration issue? | **Yes — C.** A pre-S4 fossil in tenant config, not a product concept. |
| **Does any Product-model limitation prevent the valid path being configured?** | **NO.** The Builder can author *"Reached → Move to stage: Tour"* today. **Nothing in the model is missing.** |

**Conclusion: the tenant must add the path. The product must detect its absence.** These are different work, for different owners, and neither substitutes for the other.

---

## 7. Product recommendations

Product language only.

**PR-1 (→ R1) — Every operational concern has exactly one author.**
*Behavior:* an administrator changing a concern changes it in one place, and the running product reads that place.
*Acceptance:* for action availability, movement, grain, counts, and automation, there is exactly one authoring surface, and a change there is observable in the operator experience.
*Boundary:* the frozen ownership chain decides the owner — grain belongs to Stage; movement is earned by outcome.
*Becomes trustworthy:* every switch in the Builder.

**PR-2 (→ R2) — The product certifies the journey, not the wiring.**
*Behavior:* before an administrator publishes, the product tells her whether an operator can actually complete the journey — and if not, which step breaks and why.
*Acceptance:* a process whose first stage cannot reach its second **cannot be reported ready**. A target that does not exist is named. A description that contradicts its predicate is named.
*Boundary:* the product detects and explains; **it never silently corrects.**
*Becomes trustworthy:* the word "ready".

**PR-3 (→ R2) — The administrator sees the operator experience before publishing.**
*Acceptance:* she can see what an operator will see for a given stage and view, before saving.

**PR-4 (→ R3) — The product always names what the operator is working on.**
*Behavior:* when work concerns one child, the product names that child — in the work, the blockers, and the actions.
*Acceptance:* a blocker reads *"Wrigley has no program"*, not *"Program"*. An action states which child it will affect.
*Boundary:* the Record of Truth stays anchored; **Attention is named within it, never substituted for it.**
*Becomes trustworthy:* multi-child operation.

**PR-5 (→ R3) — Attention outside the current view is named, never silent.**
*Behavior:* when a selected subject is outside the active Work View, the panel names that condition, **preserves her current view, and offers — but never performs — a valid context switch.**
*Boundary:* the Frame is her intent; the product may offer a reframe, never perform one.

**PR-6 (→ R4) — The operator can always ask *why am I here* and *what happened*.**
*Acceptance:* the Frame is stated, not merely implied by placement. History is reachable and never fails with a raw error.
*Boundary:* three Modes; the Frame decides which leads.

**PR-7 (→ R5) — Every number declares its cohort, grain, and source; and its destination reproduces it.**
*Acceptance:* one question gets one number on a screen. A number that cannot be drilled into does not offer a drill. Analytics is labelled as analytics.
*Boundary:* numbers **may** differ by cohort or grain — that is legitimate and must be declared, not eliminated.

**PR-8 (→ I1, tenant) — This tenant's Enrollment process gains a valid forward path.** *Tenant work, not product work.*

**PR-9 (→ I2) — No configuration surface disappears because of the domain being configured.** *(P15)*

**PR-10 (→ I3) — Work the operator is told to do here can be done here** — or the departure names the surface that owns it and returns her.

---

## 8. Dependency and leverage analysis

```
PR-1 (one author) ──┬──► PR-2 (certify journey) ──► catches I1 and every future I1
                    └──► makes every Builder switch meaningful
PR-4 (name Attention) ──► PR-5 (out-of-scope) ──► multi-child safety
PR-6 (Modes/Frame) ── independent of PR-4
PR-7 (provenance) ── independent
```

### The single highest-leverage Product correction: **PR-1 — one concern, one author.**

**Why, and why it displaces my earlier answer.** I named *"configuration must steer"* the highest-value change in Reviews 03, 05 and 06. **That was a symptom.** Configuration *does* steer — the runtime faithfully reads the work template's `helpful_actions`. **The administrator is simply writing somewhere else.** PR-1 explains five symptom clusters, and it is the **prerequisite for PR-2**: you cannot certify a concern that has two authors — you would have to ask *which one*.

**Blocks a customer demo?** No — PR-8 does (one afternoon of tenant work).
**Blocks safe production use?** **Yes.**
**Blocks universal configuration?** No — PR-9 does.

---

## 9. Minimum production-ready product boundary

**The smallest coherent release is one sentence: *an administrator can configure a journey, be told truthfully whether it works, and trust that what she configured is what the operator gets — for one child at a time, named.***

**In: PR-1 · PR-2 · PR-4 · PR-6 · PR-7 · I5.**
**Out (post-v1): PR-3 · PR-5 · PR-9 · PR-10 · I4 · I6.**

**Rationale:** PR-1 + PR-2 make configuration trustworthy. PR-4 makes multi-child operation safe — **non-negotiable for childcare**, where acting on the wrong child is a real-world harm, not a UX defect. PR-6 + PR-7 make the product honest about *why* and *how many*. PR-3 and PR-5 are comprehension improvements that a truthful product can survive without.

---

## 10. Certification requirements

**Requires an isolated / disposable tenant. Nothing below may be marked complete on source inspection.**

| Item | Status today |
|---|---|
| Lead → Tour movement | `UNTESTABLE IN SHARED TENANT` — no path exists to test |
| Child-specific action execution | `UNTESTABLE` — **the multi-child safety gate** |
| Waitlist movement | `UNTESTABLE` — zero records |
| Enrolling → Enrolled | `UNTESTABLE` — `HIGH CONFIDENCE` it is impossible from Current Work |
| Terminal-state behavior | `UNTESTABLE` |
| **Action-disabled parity** | `UNTESTABLE` — **the PR-1 gate** |
| Projection refresh after mutation | `UNTESTABLE` |
| Out-of-scope panel behavior | `VERIFIED ABSENT` (zero callers) — certify after PR-5 |
| Multi-child safety | `UNTESTABLE` — **the production gate** |
| Work Items handoffs | `UNTESTABLE` |

**Ten certification items. Nine are untestable in the shared tenant.** A disposable tenant is the **single largest unblocker** of certification evidence in this initiative.

---

## 11. Product Office decisions still required

1. **Is the live tenant representative, or uniquely broken?** Open since Review 01. It changes the *scope* of the verdict, not its content — **R2 stands either way, because the product blessed it.** A fresh template-apply on a disposable tenant settles it.
2. **Reconcile G-5 with non-enrollment Records of Truth.** *"The Focus Panel is always case-grain"* vs Payments' *"billing account / financial entity"*. G-5's own rationale anticipates this. **Constitutional — Kelly's call, not mine.**
3. **Ratify the Constitution artifacts** (currently `status: draft`). Nothing self-canonizes.
4. **Accept the corrections in §2** — particularly that D#1 · V1 was misclassified by me, and that *"configuration must steer"* was a symptom.
5. **Does "Registration" → Enrolling stay?** The naming rule permits it *if* the journey becomes traceable.

---

## 12. Inputs for Review 08 — Product Completion Plan

- **5 roots · 5 independents · 10 product recommendations · 1 tenant fix.**
- **Highest leverage: PR-1.** **Demo blocker: PR-8** (tenant, not product).
- **Minimum release: PR-1, PR-2, PR-4, PR-6, PR-7, I5.**
- **Protected strengths register (§3) — eleven items the plan must not disturb.**
- **Certification requires a disposable tenant** — 9 of 10 items are otherwise unprovable.
- **No root requires new architecture. No root is a Product-model limitation.** Every correction moves the product toward what it already says about itself.
