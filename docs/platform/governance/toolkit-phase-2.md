---
owner: platform
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Toolkit Phase 2 — Design

**A process-design deliverable. No code, no scripts, no implementation.**

**Date:** 2026-07-16 · **Inputs:** the Product Office initiative (`docs/product/reviews/`, PR #220), the installed toolkit (`scripts/local-dev/`, 80 commands, 14 docs), the canonical doctrine (`docs/platform/governance/managed-sprint-operations.md`), and the live six-slot registry.

**Extends** `managed-sprint-operations.md`. Per M8 — *no parallel tree*. This document proposes amendments to the canonical doctrine; it does not found a second one.

---

## 0. Thesis

The Product Office closeout reached one conclusion about the product:

> **Alloy's product model is sound, and Alloy does not yet obey it.**

**The same sentence is true of the toolkit, and it is the finding of this sprint:**

> **The toolkit's workflow model is sound, and the toolkit does not yet obey it.**

Discovery → Constitution → Realization → Certification → Promotion is not a workflow the toolkit needs to be taught. **It is already built.** The Product Contract is a hash-frozen Constitution with a real `alloy_die` behind it. `alloy-product-handoff` is a command-enforced Product→Engineering transition. Review modes (`advisory`/`gate`/`final`) are a genuine certification gate that blocks READY. Promotion already terminates at a human by design.

**And the Product Office — the best product work in this project's history — used none of it.**

Nine reviews ran in a slot, under a prompt convention, held together because *the operator restated it*. The Constitution that emerged was written into `docs/product/reviews/`, not `product/contract/`. The handoff worked because the Product Office **volunteered** a verification. The intake standard was **quoted but never committed** — grep the tree for *"do not prescribe exact files unless necessary to establish ownership boundaries"* and the only hit is the closeout quoting a document that does not exist.

The gate did not fail. **The gate is on a road nobody was told to drive on.** `alloy-sprint-start` — the one entry point the canonical doctrine says every sprint must start through — has no idea the Product Runtime exists. The canonical doctrine (§8) explicitly disclaims *"mission orchestration"* while `scripts/local-dev/` ships an entire undoctrined Product and Engineering Runtime.

So Phase 2 is not a build. **Phase 2 is a connection, a declaration, and a retraction:**

- **Connect** the entry point to the stages that already exist.
- **Declare** what today lives in the operator's head — posture, role, tenant, evidence level.
- **Retract** the claims the toolkit makes but has not earned.

Every one of the closeout's eight recommendations is an instance of one failure:

> **A convention that must be restated is a convention that will be dropped.**

And the counter-rule, inherited from `ENGINEERING-MANAGER.md`'s honest capability boundary — the corpus's best trait, which Phase 2 must not lose:

> **The toolkit carries, gates, and refuses. It never asserts.**

Phase 2 does not auto-generate Constitutions, judge evidence semantically, or decompose missions. It refuses to let knowledge live in a prompt.

---

## 1. Current toolkit strengths

These are load-bearing and **must not be rebuilt**. Listed with the evidence that they work.

| # | Strength | Evidence |
|---|---|---|
| **S1** | **The Constitution is real, hash-frozen, and enforced** | `alloy-product-approve:56` — `alloy_die "user-visible work requires a valid visual basis"`. `approval.json` records contract SHA + frozen file list. Hash re-validated at handoff, propagated to engineering `state.json` as `product_contract_hash`. Amendment requires `--reason` + revision + reapproval. |
| **S2** | **Provenance labeling (sections A–F)** | The Product Contract separates *human-provided facts* / *repository findings* / *approved decisions* / *proposed decisions* / *unknowns* / *standard policy*. **The corpus's best idea.** Preserve verbatim. |
| **S3** | **Candidates are not truth** | *"Discovered text matches are labeled **candidates**, not confirmed semantic truth."* A tool that refuses to promote a grep to a fact. |
| **S4** | **The honest capability boundary** | *"V1 is not yet: an autonomous product strategist; a semantic architecture reasoner; an LLM-quality task decomposer."* Rare and valuable. Phase 2 inherits this or it inherits nothing. |
| **S5** | **Illegal transitions are rejected** | `lib/product.sh:65` and `lib/engineering.sh:241` both call `validate-transition` before writing. `alloy-initiative-start:50,56,64` dies on unapproved, un-handed-off, or hash-missing state. |
| **S6** | **Review modes are correctly typed** | `advisory` *"never promotes"* · `gate` *"fail blocks"* · `final` *"required for READY"*. Mode inference is conservative by default; final must be requested explicitly. |
| **S7** | **Promotion is human-terminal by construction** | Zero `git push` / `gh pr create` on any real path. `alloy-initiative-package` **prints** commands under `## Push / PR commands (NOT executed)`. *"Push/merge is never inferred."* |
| **S8** | **Fail-closed resource discipline** | Slots refuse when occupied; ports never silently reassign; validation is globally serialized; `alloy-worker-doctor` mutates only with `--recover`. **This is the pattern tenancy should copy.** |
| **S9** | **Two-tier env + leak guard** | Privileged vars injected only into the toolkit-owned process, never into the worktree. `alloy_is_production_supabase_url()` fails closed with a stated rationale. |
| **S10** | **Briefs are inert data** | `alloy_product_forbidden_patterns_in_content()` — shell in an imported brief is stored, never executed. |
| **S11** | **The self-test is genuinely thorough** | `alloy-engineering-certify` asserts ~20 refusals, uses a disposable fixture root at ports 3911+, and proves production metadata byte-unchanged. Excellent engineering. (Its *name* is the problem — see W7.) |

---

## 2. Current toolkit weaknesses

Each is stated as a defect with evidence, not an opinion. **Verified** = I reproduced it this sprint.

### W1 — The entry point does not know the workflow exists *(the root)*

`alloy-sprint-start` allocates a slot, a port, a worktree, and a provider. It asks for `--provider` and a name. **It cannot express which stage the sprint is in, what it may write, or what it needs to execute.** The canonical doctrine §8 disclaims mission orchestration; the Product/Engineering Runtime is undoctrined and unreachable from the documented entry point.

**Consequence:** the Product Office ran nine reviews outside the Product Runtime and nobody noticed, because nothing was designed to notice. **Every other weakness below is downstream of this one.**

### W2 — Execution posture is not a concept *(highest value; closeout rec #1)*

The word `tenant` appears **zero times** in all fourteen toolkit docs. `--with-server|--without-server` is the only posture-like flag, and it is about a dev server, not mutation.

**Consequence, stated by the closeout:** *"This sprint discovered **mid-review** that it targeted a shared hosted database — after which nine reviews could execute nothing."* Nine deliverables were classed `UNTESTABLE IN SHARED TENANT`. **The cost was paid at review time for a fact knowable at bootstrap time.**

### W3 — `alloy-agent-ready` claims a word it has not earned *(closeout rec #6)*

**Verified: the overlap between `alloy-agent-ready` and CI is empty. Not partial — empty.** Its fourteen checks are branch, dirty-state, server ownership, URL reachability, env mode/leak, QA identity, auth storage, browser, instructions. **Zero typecheck, zero test, zero lint, zero build.**

It is a *slot-bootstrap* probe wearing a *fitness* word. The closeout's own confession is the proof: *"I reported "lint green" nine times from the non-blocking lint variant; CI's blocking mode caught a defect I introduced in the first artifact."* That is not a personal failure. **The toolkit offers no signal that a local check and its CI counterpart differ.**

### W4 — Gate parity does not exist, and drift is already measurable

| Check | Toolkit | CI | Delta |
|---|---|---|---|
| Production typecheck | `--max-old-space-size=**4096**` | `--max-old-space-size=**8192**` | **2× heap.** Local can red where CI greens. |
| `typecheck:tests` (full graph) | **no kind** | blocking job | The job that actually breaks staging has no first-class local invocation. |
| `docs-lint --ci` | **no kind** | blocking job | Absent from the toolkit entirely. |
| Vitest | whole suite (~750 red) | two scoped paths | Different scope *and* concurrency. Local runs what CI never runs; CI runs what local cannot target. |
| Node | **not checked at all** | pinned `.nvmrc` = **20** | This shell is **v16.20.2**. Nothing reconciles them. |
| `build`, `playwright`, `imports` | kinds exist | **no CI job** | Local gates on things CI ignores. |

Two hand-maintained copies of the same command strings in `alloy-config` and workflow YAML. **That is how 4096 vs 8192 happened, and it will happen again.**

Compounding: **all three CI workflows are `pull_request`-only.** A direct merge to unprotected `staging` runs **no CI at all** — so the local gate is the only gate on the path that is actually used.

### W5 — `alloy-worker-status` lies *(closeout rec #3 — verified live, mechanism located)*

The closeout reported this misattributing slot 3's sprint name *"on this sprint's first morning and still did on its last."* **It still does today. I reproduced it and found the cause.**

```
SLOT SPRINT                 WORKTREE                      BRANCH
2    locations-config-runti wt2-locations-config-runtime  agent/cursor/2-locations-config-runtime
3    locations-config-runti wt3-runtime-continuity        agent/claude/3-runtime-continuity   ← wrong
```

**Mechanism:** `wt3-runtime-continuity.env` has **no `ALLOY_SPRINT_NAME` field**. `alloy_load_metadata` (`lib/common.sh:258`) `source`s each metadata file into one shell **without resetting optional fields**. The status loop (`lib/sprint-ops.sh:784-785`) iterates slots 1→6 in that shell:

```bash
alloy_load_metadata "$name"
sprint="${ALLOY_SPRINT_NAME:-${name#wt*-}}"
```

Slot 3 inherits slot 2's value. The `:-` fallback **never fires**, because the variable is *set* — just set by the previous row. The correct answer (`runtime-continuity`) was one unset away.

**The asymmetry is the lesson:** `alloy_load_metadata` *does* validate mandatory fields (`:259-265` dies on a name mismatch). **Mandatory fields are guarded; optional fields leak.** The closeout's diagnosis — *"optional metadata leaks between rows"* — was exactly right.

And its framing is the one Phase 2 should adopt wholesale:

> *"A status table is a trust surface; it is subject to the same standard this review applied to Configuration Health."*

### W6 — Permanent slot roles are already fiction *(verified)*

`CHEAT-SHEET.md` declares *"Permanent roles: 1 Product · 2 Architecture · 3 Performance · 4 UI/UX · 5 Refactor · 6 Experimental."* The live registry:

- Slot 2 · `ALLOY_AGENT_ROLE="Architecture / doctrine"` · actually running **locations-config-runtime**
- Slot 3 · `ALLOY_AGENT_ROLE="Performance"` · actually running **runtime-continuity**

**The roles are labels no one reads and no one obeys.** The canonical doctrine doesn't even define them — it treats slots as numbered resources, contradicting the cheat-sheet. Worse, the model is structurally wrong: roles are **permanent and port-bound**, so two Product sprints are impossible, and a Product sprint landing in slot 3 silently becomes a "Performance" sprint.

Closeout rec #5 asked that role separation become *"a lane property, not a prompt convention."* **It cannot, while the property is welded to a port.**

### W7 — "Certification" names two unrelated things

- `alloy-engineering-certify` certifies **the toolkit's own lifecycle harness**. Touches zero product code. Gates nothing — no CI, no hook, operator-invoked only.
- The Product Office's **certification contract (5 levels)** certifies **the product**, and is the spine of M2 and M7.

One word, two meanings, zero relationship. And the stated prerequisite — *"Run `alloy-engineering-certify` before the first real product initiative"* — has **no stamp and no check**. It is advice.

### W8 — Evidence is existence-checked, never corroborated

`alloy-worker-report` verifies evidence **paths exist** (`:69-82`, dies on a missing file). Nothing verifies the screenshot shows what the worker claims. A worker may emit:

```json
"ui_verification": { "required": true, "status": "not_run", "evidence": [] }
```

Empty array → the existence loop never runs → **no die → accepted.** **The gate is on the container, not the claim.**

### W9 — Reviewer independence is unenforced

The only rule is prose in `REVIEW-PIPELINE.md`: *"Implementation worker must not be the sole reviewer for material UI or architectural work"* — hedged twice (`sole`, `material`), and **nothing computes author ≠ reviewer.** `task-002` is a default, not a constraint.

### W10 — Two Discovery front doors, one ungated

`alloy-product-create` (Constitution, `die`-enforced, Human Decision Queue) and `alloy-initiative-create` (engineering-only brief) **both accept `product_direction` / `operator_outcome` / `acceptance`.** The handoff guard fires only `if alloy_product_exists "$key"` — so the *"only normal bridge"* is mandatory **only if you already chose to use it.** The visual-basis gate **dies** on the Product path (`alloy-product-approve:57`) and merely **labels** on the engineering path (`alloy-initiative-plan:158`).

### W11 — The evidence vocabulary is undefined

`VERIFIED` / `HIGH CONFIDENCE` / `HYPOTHESIS` / `UNTESTABLE` appear together in exactly **one** place in the repo: the closeout **recommending they be standardized** — which is an admission that they are not. They were *"introduced mid-sprint by the operator"* and *"materially improved every deliverable after."* Composite forms already in live use (`VERIFIED ABSENT`, `VERIFIED PASSING`, `UNTESTABLE IN SHARED TENANT`) have no definition either.

### W12 — The intake standard does not exist

Quoted by the closeout, present nowhere. **The highest-leverage artifact in the system — the Product→Engineering mission intake — has no committed template.** It is recoverable only by induction from the eight missions in compliance-09.

### W13 — Handoff closure is voluntary *(closeout rec #4)*

`alloy-sprint-finish` closes the slot. **Nothing closes the handoff.** The Product→Engineering transition worked because the Product Office chose to verify itself. *"Half of `alloy-sprint-finish`'s value is closing the slot; the other half should be closing the handoff."*

### W14 — No mid-sprint correction ritual *(closeout rec #8)*

Four findings were withdrawn or reclassified by later reviews, each because a layer had not yet been read. The P4 error was committed as a principle before it was caught.

### W15 — Doctrine drift

`managed-sprint-operations.md` is **canonical** and documents only the six-slot mechanical lifecycle. Its completion definition is *"commits, tests, localhost URL, git state, and processes left running"* — **process state, never executed evidence.** That is precisely the hole M7 exists to fill.

---

## 3. New workflow

### 3.1 The category error to fix first

The sprint brief asks whether *Product Office · Engineering Director · Runtime · Configuration · Certification · QA · Promotion · Documentation* should be first-class sprint types.

**No — because they are not the same kind of thing.** They are four kinds wearing one label:

| Proposed "type" | What it actually is |
|---|---|
| Certification, Promotion | **Stages** of the workflow |
| Product Office, Engineering Director, QA | **Roles** (authority to write) |
| Runtime, Configuration, Documentation | **Lanes** (write scope) |
| *(absent)* | **Posture** (environment) |

Making all eight "types" would bake the category error into the toolkit permanently. **Phase 2 separates four orthogonal dimensions that today are collapsed into one fictional permanent slot role (W6).**

> **A sprint declares: `stage · role · lane · posture`. A slot provides: a number, a port, a worktree.**

**Answer to the question: yes to first-class typing — as four dimensions, not eight types.**

### 3.2 The four dimensions

**Stage** — closed set of five. Determines which gates apply.

| Stage | Writes | May not write | Terminates in |
|---|---|---|---|
| **Discovery** | findings, audits | code · Constitution | a finding set + declared unknowns |
| **Constitution** | Product Contract, decisions | code | approval (hash) + handoff |
| **Realization** | code, within a frozen contract | Product Contract | commits + a certification plan |
| **Certification** | evidence only | product code | a leveled verdict |
| **Promotion** | nothing | everything | a human authorization |

Note **Promotion is not a sprint.** The canonical doctrine already says so: *"Promotion is explicit, reviewed, and singular — not part of ordinary sprint execution."* Phase 2 keeps it a gated transition. **Making it a sprint type would be the one change that damages a thing currently working (S7).**

**Role** — the authority to write. `product-office` · `engineering-director` · `worker` · `certifier` · `operator`. **Carried into generated instructions and enforced as write scope** — this is closeout rec #5, finally implementable once roles are unwelded from ports (W6).

**Lane** — Realization only. `runtime` · `configuration` · `documentation` · `infrastructure`. A Documentation sprint and a Runtime sprint differ *only* in lane; both are Realization. This is why they are not types.

**Posture** — see §4.1. Two axes: mutation and tenant class.

### 3.3 The workflow

```
DISCOVERY ──────────────────────────────────────────────────────────
  declares: posture (read-only | shared-read-only)
  produces: findings, each carrying an evidence level
  gate:     UNTESTABLE findings are recorded as UNTESTABLE, never inferred to VERIFIED
      ↓
CONSTITUTION ───────────────────────────────────────────────────────
  produces: Product Contract (hash-frozen) · closed decisions · open decisions
            · protected invariants · evidence standard
  gate:     blocking decisions = zero · visual basis valid · no implementation
            imperatives in Product-owned artifacts  [the 7-string grep — automatable today]
      ↓  ══ HANDOFF CLOSURE (first-class artifact, §4.5) ══
REALIZATION ────────────────────────────────────────────────────────
  declares: constitutional basis (contract hash OR declared absence + reason)
            · lane · posture
  gate:     invariant tripwire → returns to Product before implementation
  produces: commits + a derived certification plan
      ↓
CERTIFICATION ──────────────────────────────────────────────────────
  requires: a posture that can execute the plan  [checked at BOOTSTRAP, not review]
  produces: a leveled verdict (1–5) + evidence at that level
  gate:     L2/L4 findings block · L5 never self-issued
      ↓
PROMOTION ──────────────────────────────────────────────────────────
  requires: stated level + evidence + human authorization
  the toolkit still never pushes, merges, or infers   [S7 preserved exactly]
```

### 3.4 The move that pays for the sprint

> **A certification plan is checked against posture at bootstrap.**

The Product Office discovered *mid-review* that its posture could not execute its mission. If a mission's certification cases require a disposable tenant and the sprint's posture is `shared-read-only`, **the sprint cannot certify — and the toolkit says so in the first-response card, not in the ninth deliverable.**

That single check moves the M7 discovery from review-time to bootstrap-time. **It is the most concrete form of "Alloy teaches AI agents how to build Alloy" available.**

### 3.5 The toolkit's verdicts obey the product's contract

The closeout instructed this explicitly (*"a status table is a trust surface; it is subject to the same standard"*). Phase 2 **adopts the product's own five-level certification contract for the toolkit's own outputs:**

> **The verdict names the level it reached, and never implies a level it did not test.**

Applied:

| Toolkit verdict | Level actually reached | Today's word | Honest word |
|---|---|---|---|
| `alloy-agent-ready` | **L1 — Loadable** (slot bootstrapped) | `READY` | `READY (L1: slot bootstrapped) — no code checks run` |
| `alloy-validate typecheck` | **L2 — Structurally valid** | pass/fail | pass at L2, and say the heap differs from CI |
| `alloy-gate` | **L2/L3** — parity with CI | *(does not exist)* | `GATE PASS (L3) — identical to CI` |
| `alloy-worker-status` | **L1** — must never inherit a cell | asserts | reads, or prints `unknown` |
| product certification | **L4 max computable** | — | **L5 never self-issued** |

**And the reuse that makes W9 free:** *"Level 5 can never be claimed by the product about itself"* maps exactly onto *"an agent may not certify its own implementation."* **The product doctrine already solved the toolkit's reviewer-independence problem.** Reuse it; do not invent a second rule.

---

## 4. Required new concepts

### 4.1 Execution Posture — *the sprint's environment, declared before it runs*

Two axes, both required, **no default**:

| Mutation posture | Meaning |
|---|---|
| `read-only` | no writes of any kind |
| `shared-read-only` | reads shared data; **mutation refused** |
| `isolated-mutable` | destructive and lifecycle mutation permitted |

| Tenant class | Meaning | Certification ceiling |
|---|---|---|
| `shared` | the live hosted tenant; other agents depend on it | **L4** — cannot certify execution |
| `disposable` | seeded, resettable, safely mutable, **contains intentionally invalid configuration** | **L5-eligible** |
| `production-like` | production shape, non-production data | **L5-eligible** |

**Fail closed on silence, not on absence.** A sprint with no posture is refused. A sprint with `shared-read-only` is *allowed* — it just cannot claim execution.

**The disposable tenant's defining property is not that it is safe. It is that it is wrong on purpose:**

> *"A certification environment that only contains correct configuration cannot certify a product whose defining failure is blessing incorrect configuration."*

**Posture must propagate** — bootstrap → readiness → worker package → evidence → certification level. A posture that stops at the first-response card is decoration.

### 4.2 Tenant as an allocatable resource

*"A review or certification sprint should be able to request an isolated environment at bootstrap, the way it requests a port."*

Take that literally. **Ports already have the exact pattern (S8):** permanent mapping, fail-closed refusal when occupied, never silently reassigned. Tenancy copies it. The only existing primitive — `alloy_is_production_supabase_url()` — is a **binary local/remote guard**, not a posture model; it generalizes into the tenant-class resolver.

### 4.3 Verdict Level and Evidence Level

**Verdict Level (1–5)** — the product's certification contract, applied to the toolkit's outputs (§3.5). L2/L4 block. **L5 is recorded, never computed.**

**Evidence Level** — promote the operator's mid-sprint invention (W11) to the default vocabulary, **with the definitions it never had**:

| Level | Means |
|---|---|
| `VERIFIED` | directly observed in the running product, at a stated timestamp and branch |
| `HIGH CONFIDENCE` | inferred from stable configuration evidence, **not executed** |
| `HYPOTHESIS` | a plausible cause the reporter explicitly declines to assert |
| `UNTESTABLE` | not establishable in this environment; **must name the reason** (e.g. `UNTESTABLE IN SHARED TENANT`) |

Plus the two-class rule the reviews already ran on, which Phase 2 should encode:

- **Stable configuration evidence** — reproducible; safe to compare across a sprint.
- **Mutable tenant data** — **timestamped at capture; never compared across timestamps.**

And the ceiling on all of it: **"Source agreement is not evidence."**

### 4.4 Constitutional Basis — *gate the silence, not the absence*

Not every sprint needs a Constitution; a typo fix does not. So the gate is **not** "a contract must exist." It is:

> **Every Realization sprint declares its constitutional basis: a contract hash, or `--no-constitution <reason>` — recorded, and printed in status.**

This closes W10 without forcing ceremony onto small work. **Fail closed on silence.** Today's engineering-only path defaults to no Constitution *invisibly*; Phase 2 makes that a decision someone made.

### 4.5 Handoff Closure — *a first-class artifact*

Required contents, named by the closeout:

> **package commit · verified diff scope · closed decisions · open decisions · protected invariants · evidence standard**

**`alloy-sprint-finish` closes the handoff, not just the slot.**

### 4.6 Certification Plan — *derived, not authored*

The mission intakes **already carry** acceptance · evidence · protected invariants · certification cases. A Certification Plan is their union plus **the posture required to execute them**. Derive it. Then check it against declared posture at bootstrap (§3.4).

### 4.7 Gate Parity — *one source, two consumers*

CI workflow YAML and toolkit config must **not** both hand-maintain command strings. One source; both consume. This is the only structural fix for W4 — every other fix re-drifts.

### 4.8 Invariant Tripwire

15 rows, each an invariant + threatening mission + **one observable signal**. *"Any proposal that violates a §13 invariant returns to Product before implementation."* The highest-severity row is already known: **breaking Laws 7/8 continuity while adding Attention (M4) or Modes (M5)** — the only invariant currently `VERIFIED PASSING` that this initiative could plausibly destroy.

*(Reconcile the 11-row register in compliance-08 §11 with the 15-row matrix in compliance-09 §13. The closeout cites both as "15" — a citation error Phase 2 must not inherit.)*

### 4.9 Correction Ritual

A scheduled mid-sprint checkpoint: **"what have we gotten wrong so far?"** Four findings were withdrawn late; the P4 error was committed as a principle before it was caught. Cheap, and the only proposed concept that costs nothing but a prompt.

---

## 5. Required new commands

**Design constraint: the surface is already 80 commands. Phase 2 adds four, retires one name, and extends five. Anything else is scope creep.**

### New

| Command | Purpose | Why it cannot be an extension |
|---|---|---|
| **`alloy-gate <slot>`** | Runs **exactly** what CI runs, byte-identical, from the shared source (§4.7). Reports a **level**, and names every check it did *not* run. | `ready` is seconds; the gate is minutes. Merging them destroys a working fast signal and produces a slow one nobody runs. **See §6.1 — this is where I disagree with the brief.** |
| **`alloy-tenant request \| release \| status`** | Allocate a tenant to a slot, on the port allocator's fail-closed pattern (§4.2). | No existing command owns environment; the concept does not exist (W2). |
| **`alloy-certify <slot>`** | Record a **product** certification: level + evidence + issuer. **Refuses to issue L5 — it can only record one issued externally.** | The name must be freed first (below). |
| **`alloy-handoff-close <slot>`** | Produce and validate the handoff artifact (§4.5). | May instead land *inside* `alloy-sprint-finish`; prefer that if the artifact is cheap to validate. |

### Retired name

| Today | Becomes | Why |
|---|---|---|
| `alloy-engineering-certify` | **`alloy-toolkit-selftest`** | It certifies the *harness*, not the product (W7). The command is excellent; the word is claimed by the product's five-level contract. **Rename the harness, not the doctrine.** |

### Extended

| Command | Change |
|---|---|
| `alloy-sprint-start` | **requires** `--stage`, `--posture`, `--tenant`; `--role`/`--lane` where applicable. No defaults. Prints them in the first-response card. |
| `alloy-agent-ready` | Reports a **level** and states what it did not check (§3.5). Refuses READY for an execution mission on shared data. |
| `alloy-worker-status` | **Authoritative**: every cell read or `unknown`. **Never inherited.** |
| `alloy-sprint-finish` | Closes the **handoff**, not just the slot. |
| `alloy-validate` | Adds `typecheck:tests` and `docs-lint` kinds (the two blocking CI jobs with no local path). Pins Node against `.nvmrc`. |

**Deliberately not built:** no Constitution generator, no evidence judge, no mission decomposer, no daemon, no dashboard. **S4 is the constraint** — the toolkit carries, gates, and refuses.

---

## 6. Required workflow changes

### 6.1 Answers to the sprint's questions — with one disagreement

| Question | Answer |
|---|---|
| First-class sprint types (the 8)? | **No — yes to typing, no to that list.** Four orthogonal dimensions (`stage · role · lane · posture`), not eight types. The list conflates stages, roles, and lanes (§3.1). |
| Constitution a required gate? | **It already is** — on one of two roads. Don't add a gate; **close the bypass** (W10). Gate the *silence*: declare a hash or declare its absence with a reason (§4.4). |
| Certification required before promotion? | **Yes** — but fix the word first (W7), and put the requirement on the **claim, not the container** (W8). L5 never self-issued ⇒ **W9 solved for free** (§3.5). |
| Distinguish shared / disposable / production-like? | **Yes. The single highest-value change.** Zero occurrences of `tenant` today; nine reviews executed nothing (W2). Allocate it like a port (§4.2). |
| `alloy-agent-ready` = the CI gate? | **No — and this is my disagreement with the brief.** See below. |
| `alloy-sprint-start` *ask* posture? | **Not ask — require.** "Ask" is skippable; the closeout says *"require and print."* No default. And it must **propagate**, or it is decoration. |
| `alloy-worker-status` authoritative? | **Yes**, with a definition: *every cell is read from a source or printed as unknown — never inherited* (W5). |
| Handoff packages first-class? | **Yes.** The artifact already exists on the Product path; the Product Office didn't use it. Make finish close it (§4.5). |
| Product Constitution expected? | **Yes — expected, with declared absence permitted** (§4.4). |
| Engineering Intake mandatory? | **Yes — and first, commit the standard that was quoted but never written** (W12). The *"no implementation imperatives"* check is a **7-string grep, automatable today**. |
| Certification Plans mandatory? | **Yes — derived, not authored** (§4.6), and **checked against posture at bootstrap** (§3.4). |

**The disagreement, stated plainly.** The brief asks: *should `alloy-agent-ready` execute exactly the CI gate?* **No.**

The overlap is empty **by design, not by neglect**. `ready` measures whether the *slot* is bootstrapped — env mode, auth storage, server ownership, browser, instructions. That is a legitimate, necessary, **fast** signal. Merging a minutes-long CI gate into a seconds-long probe destroys the fast signal and produces a slow one that gets skipped.

**Split by verdict level instead** (§3.5): `ready` keeps its job and stops overclaiming; `alloy-gate` runs CI byte-identically.

And note what rec #6 *actually* asked: *"Readiness should run the same command CI runs, **or say plainly that it did not**."* **The "or" is the cheap half, and it should ship first** — it costs one line and it kills the entire "lint green ×9" class of error.

### 6.2 Doctrine changes

1. **`managed-sprint-operations.md` absorbs the workflow.** Its §8 disclaimer (*"not mission orchestration"*) is now false — the toolkit ships it. **Amend the canonical doctrine; do not found a second one.** M8's rule — *no parallel tree* — applies to the toolkit's own docs.
2. **Delete permanent slot roles** from `CHEAT-SHEET.md` (W6). They are fiction, they contradict the canonical doctrine, and they block role-as-lane-property. Slots are numbered resources.
3. **First-response card gains three fields:** stage, posture, tenant. It currently reports a port but not whether the sprint may write.
4. **Completion definition gains evidence.** Today: *"commits, tests, localhost URL, git state, processes left running"* — process state, never executed evidence (W15).
5. **Rename `ENGINEERING-MANAGER.md`** — line 5 disclaims the title in the title's own file.
6. **Add `history[]` to engineering transitions** to match product's audit trail (an existing asymmetry).

---

## 7. Migration strategy

**Four live sprints occupy slots 2–5 right now. Nothing may break them.** Three rules:

**R1 — Additive first, fail-closed last.** Every gate lands in three steps: *record* → *display* → *refuse*. Posture: accept `unknown` and record it → show `unknown` in status → require it for new sprints → refuse READY on `unknown`. **Never introduce a refusal and its concept in the same change.**

**R2 — Fix the trust surface before anything reads it.** W5 is first, not because it is urgent, but because **every other signal is displayed through that table**. Adding posture to a table that inherits cells produces posture that lies. *A trust surface must be trustworthy before it carries new truth.*

**R3 — Migrate by absence, not by backfill.** The live metadata proves the case: `wt3-runtime-continuity.env` has **no sprint fields at all**. Do not backfill guesses. **An absent field must render `unknown`** — which is exactly the W5 fix. **The migration path and the bug fix are the same change.**

**Retirement.** `alloy-engineering-certify` → `alloy-toolkit-selftest` is a rename with one caller (`npm run local-dev:certify`) and no CI dependency (it gates nothing — W7). **Cheapest safe change in the plan; do it early to free the word** before `alloy-certify` needs it.

**The dual front door (W10) is not collapsed by deletion.** Engineering-only initiatives are legitimate. Add the *declaration* (§4.4), then observe how many sprints declare `--no-constitution`. **If that number is high, the Constitution is too expensive — which is a finding, not a violation.** Let the data rule before deleting a road people use.

---

## 8. Phase rollout

Four waves. **Each is independently shippable and independently valuable** — no wave is a down payment on the next.

### Phase 2.0 — Truth *(the toolkit stops asserting what it did not test)*

Fix W5, W3-disclosure, W4-parity, W7-rename. **No new concepts.** Retract overclaims and make the table honest.

**Done when:** every toolkit verdict names its level; no status cell is inherited; the local gate and CI are byte-identical or the difference is printed.
**Value alone:** kills the "lint green ×9" class. **This wave is mostly deletion and disclosure — the cheapest wave and the one that makes the others trustworthy.**

### Phase 2.1 — Posture *(the sprint declares its environment before it runs)*

Posture + tenant class + tenant allocation + posture propagation + the bootstrap certification-plan check (§3.4).

**Done when:** no sprint starts without a declared posture, and a `shared-read-only` sprint carrying execution-certification cases is refused **at bootstrap**.
**Value alone:** the nine-reviews-execute-nothing failure becomes structurally impossible.

### Phase 2.2 — Authority *(the lane carries the role)*

Stage/role/lane dimensions; roles unwelded from ports; roles carried into generated instructions; evidence vocabulary as default; the correction ritual.

**Done when:** "Product Office mode" survives without an operator restating it.
**Value alone:** the convention-that-must-be-restated failure class closes.

### Phase 2.3 — Closure *(handoff, certification, promotion as gates)*

Handoff closure; constitutional basis; certification levels recorded; L5 never self-issued (⇒ reviewer independence); intake standard committed + the 7-string grep; invariant tripwires.

**Done when:** a Product→Engineering transition cannot complete by volunteering, and no agent can certify its own implementation.
**Value alone:** W8, W9, W12, W13 close together — they are one gap seen from four sides.

**Ordering rationale:** Truth before Posture because posture displayed through a lying table is worse than no posture. Posture before Authority because a role without an environment cannot be refused meaningfully. Authority before Closure because closure gates are only enforceable once the toolkit knows who is acting.

---

## 9. Recommended implementation order

Ordered by **leverage ÷ cost**, respecting the dependencies above. **Items 1–4 are Phase 2.0 and are mostly one-line changes.**

| # | Change | Cost | Why here |
|---|---|---|---|
| **1** | **Reset optional metadata fields per row** (`lib/common.sh:258` / `sprint-ops.sh:785`); absent → `unknown` | **~1 line** | The trust surface everything else displays through. **Also the migration path (R3).** Two-sprint-old known defect. |
| **2** | **`alloy-agent-ready` prints what it did *not* check** | **~1 line** | Rec #6's cheap half. Kills the "lint green ×9" class **today**, with no new command. |
| **3** | **Pin Node against `.nvmrc`** | trivial | CI pins 20; **this shell is v16**. Every local result is currently suspect. |
| **4** | **Heap 4096 → 8192; add `typecheck:tests` + `docs-lint` kinds** | small | The two blocking CI jobs have **no local path**. Do *not* fix the drift twice — land #6 with it or accept re-drift. |
| **5** | **Rename `alloy-engineering-certify` → `alloy-toolkit-selftest`** | small | One caller, gates nothing. **Frees the word before `alloy-certify` needs it.** |
| **6** | **Gate parity: one source for CI command strings** | medium | Structural. **Without it, #3/#4 re-drift** — that is exactly how 4096 vs 8192 happened. |
| **7** | **Posture + tenant class required at bootstrap; printed in the card** | medium | Closeout's #1. Blocked on #1 (a lying table cannot carry it). |
| **8** | **Posture propagation + READY refusal on shared-data execution** | medium | Posture that stops at the card is decoration. |
| **9** | **Tenant allocation on the port pattern** | medium | *"…the way it requests a port."* **Reuses S8 wholesale.** |
| **10** | **Certification plan derived + checked against posture at bootstrap** | medium | **§3.4 — the move that pays for the sprint.** Needs #7–#9. |
| **11** | **Delete permanent slot roles; add stage/role/lane** | medium | Roles are already fiction (W6, verified). Unwelds role from port. |
| **12** | **Carry role boundaries into generated instructions** | medium | Rec #5. Impossible before #11. |
| **13** | **Commit the intake standard + the 7-string grep** | small | **The standard is quoted but does not exist.** The check is a grep — cheap, and it is the Product/Engineering boundary. |
| **14** | **Evidence vocabulary as the default reporting convention** | small | Rec #7. Definitions in §4.3; they have never had any. |
| **15** | **Handoff closure inside `alloy-sprint-finish`** | medium | Rec #4. *"…the other half should be closing the handoff."* |
| **16** | **Constitutional basis declared (hash or reason)** | medium | Closes W10 by gating **silence**, not absence. |
| **17** | **Certification levels recorded; L5 never self-issued** | medium | **Solves reviewer independence (W9) for free** — reuse the product's rule. |
| **18** | **Invariant tripwires + correction ritual** | small | Rec #8. Cheapest guard against the P4 class of error. |
| **19** | **Amend `managed-sprint-operations.md`; retire the §8 disclaimer** | small | Ratification. **Last, because it should describe what is true** — not what is planned. |

**#1–#5 are a single afternoon and retire two known defects, one of them two sprints old.**

**#19 is last on purpose.** The canonical doctrine is not a plan; it is a description. **Ratifying it before the behavior exists would be the same defect this entire document is about** — a document asserting a level the system has not reached.

---

## 10. Closing

The Product Office proved the workflow by running it **without the toolkit**, and every process recommendation it produced is a report of knowledge that lived in a human's head instead of a tool: posture discovered mid-review · roles held by restatement · evidence levels invented at week two · a handoff that worked because someone volunteered · a standard quoted from a document that was never written.

**None of the eight recommendations asks for a new idea.** Every one asks the toolkit to carry something it already knows.

That is the same asymmetry the closeout found in the product — *"Not one correction requires a new idea"* — and it is the reason the answer to *"should Alloy teach AI agents how to build Alloy?"* is not a feature. **It is a refusal:**

> **The toolkit must refuse to let a convention live in a prompt.**

The Constitution exists. The handoff is enforced. Certification blocks. Promotion is human. **What is missing is the toolkit's ability to tell the truth about itself:** which stage a sprint is in · whether it may mutate · what a READY means · whose sprint slot 3 is running.

**Phase 2 does not need a new toolkit. It needs the one that exists to stop overclaiming, and to be reachable from the front door.**
