---
owner: platform
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Toolkit Phase 2 — Realization Plan

**The execution model required before Phase 5 begins.**

**Date:** 2026-07-16 · **Role:** Toolkit Architect · **Customer:** every future Alloy sprint.

**Accepted inputs, implemented not redesigned:** Product Office Closeout · [Toolkit Phase 2 design](toolkit-phase-2.md) · [Managed Sprint Operations](managed-sprint-operations.md) · Engineering Mission Intake (`docs/product/reviews/compliance-09-engineering-mission-intake.md`) · Product Completion Plan (`compliance-08`).

---

## 0. What the realization audit found

The design concluded: *the workflow is already built and unreachable from the front door.* Realization found the structural cause, and it is blunter than the design assumed.

> **The slot metadata has 21 fields. Not one of them names an initiative.**

The toolkit keeps **two state substrates that cannot see each other**:

| | **Slot** (the front door) | **Initiative** (the workflow) |
|---|---|---|
| Store | `~/.local/state/alloy-dev/metadata/<name>.env` | `~/.local/state/alloy-dev/initiatives/<key>/state.json` |
| Format | shell KV, **`source`d into the caller's global scope** (`lib/common.sh:258`) | JSON, read via node |
| Schema | **none** — 5 presence assertions, no enums, no unknown-key rejection | typed fields |
| State machine | **none** — one free-text `ALLOY_WORKER_LIFECYCLE` | **11 product states + 14 engineering states, `validate-transition`-enforced** (`product-io.mjs:54-76`, `engineering-io.mjs:56-84`) |
| History | none | product yes (`lib/product.sh:76-77`); **engineering no** |
| Knows the other exists? | **No** | Yes — `workers{}` records slot, path, branch |

The link is **strictly one-directional**. `alloy-initiative-start` can find its slots. **A slot can never find its initiative** — no code performs the reverse lookup, and the only place that needs it (`alloy-initiative-start:116-128`) does it by loading a *known* initiative and searching its workers. The status table's SPRINT column is free text validated against nothing:

```bash
sprint="${ALLOY_SPRINT_NAME:-${name#wt*-}}"      # lib/sprint-ops.sh:785
```

**Consequences that decide this plan:**

1. `alloy-sprint-start` can create a sprint with **no initiative at all** — the two substrates are independently creatable. The Product Runtime is unreachable from the front door because **the front door has no field for it.**
2. `alloy-worker-status` cannot name the initiative a slot serves. Not "does not" — **cannot**.
3. `alloy-sprint-finish` **deletes the slot record** (`sprint-ops.sh:1043-1045`) and never touches the initiative. The sprint ends and the workflow never learns.
4. Every gate the design praised lives on the substrate the entry point cannot address.

**Therefore the realization is one join, not nine builds.** The **Sprint Manifest** is the keystone; Role, Phase, Posture, Handoff, and Promotion become **fields on it**, not new systems. That is the literal form of *Connect · Declare · Retract*.

### The second finding: one mission cannot be solved by the toolkit at all

**Canonical Root is not a missing check. It is a doctrine contradiction.**

`docs/platform/governance/agent-repo-boundaries.md:24-26` — canonical governance, which `CLAUDE.md:11` points agents to — **sanctions** `/Users/Kelly/Alloy-Claude` as the *"Claude / Cowork specialist workspace — POS, documents/forms, communications, sprint packages, design reviews, architecture reviews."* Meanwhile `.cursor/rules/repo-boundry.mdc` says never touch it.

**An agent working in Alloy-Claude is currently obeying doctrine, not violating it.** This plan was written in Alloy-Claude, on a branch 1481 commits behind `origin/staging` that **does not contain `scripts/local-dev` at all** — and by the accepted doctrine that was correct, because a design review is exactly what that workspace is for. **The failure reproduced on the sprint that documented it.**

Worse, `CLAUDE.md` and `.cursor/rules/` live *inside* `/Users/Kelly/Alloy`. **An agent that started in the wrong root never loads the rule telling it the root is wrong.** Root discipline is published exclusively at the destination it exists to route agents toward.

And every toolkit guard runs *after* an agent chose to invoke the toolkit — **reaching for the toolkit is the very act a misrooted agent omits.** No guard can fix this. TM-1 is therefore mostly documentation, and it is still first.

---

## Toolkit Missions

Nine missions, organized by operator capability. **TM-1 is first because everything else is void from the wrong tree. TM-2 is the keystone: TM-3 through TM-8 are fields on it.**

---

### TM-1 · Canonical Root — *"I know where I am, and so does the toolkit"*

**Purpose.** Make the sprint's root impossible to misunderstand — repository, worktree, and toolkit provenance — before any work begins.

**Current behavior.**
- `alloy_verify_canonical_repo` (`lib/common.sh:296-314`) checks **liveness, not identity**. It refuses only: unset `ALLOY_REPO`, no `.git`, unreadable tree, missing `origin`. Line 299's `-f "$repo/.git"` test is the signature of a **linked worktree** — pointing `ALLOY_REPO` at a worktree passes cleanly. Line 311 `warn`s (never dies) on a **substring** match for `*alloy*`. **Line 306 declares `expected=""` and never reads it — the identity check, fossilized in the source as a dead variable.**
- `alloy_validate_worktree_boundary` (`lib/sprint-ops.sh:416-431`) only ever validates **paths the toolkit itself minted**. It is never called on `$PWD`. Nothing asks *"is the directory I am standing in sanctioned?"*
- Behind-count is computed in **six** places and enforced in **zero**. The reporting paths (`lib/agent.sh:159`, `lib/verify.sh:860`, `lib/sprint-ops.sh:791`) **do not fetch** — `alloy-worker-status` can print `behind: 0` against a weeks-stale cached ref. **The number that would have caught "1481 behind" is computed against an unrefreshed ref and printed as fact.**
- No provenance check on the toolkit itself. `~/bin/alloy-dev → <checkout>/scripts/local-dev`, and `alloy_load_config` sources `alloy-config.example` **from the installed tree** — so a bad install **supplies its own `ALLOY_REPO` default and is self-perpetuating**. An exported `ALLOY_REPO` is silently clobbered by the example (verified).
- Doctrine contradicts itself (§0). Zero test coverage for either guard.
- **Sound today:** creation-time freshness *is* enforced — `alloy-worktree-create:57-63` fetches and dies on a missing base. Worktrees the toolkit creates are genuinely fresh. **The gap is everything that bypasses creation.**

**Required behavior.**
1. **Reconcile the doctrine contradiction.** One rule: toolkit and product work happens in `/Users/Kelly/Alloy`. Amend `agent-repo-boundaries.md`; either retire the Alloy-Claude lane or scope it to work that touches no repository artifact. **Until this lands, no guard is legitimate — the agent is following the rules.**
2. **Publish root discipline in the wrong root.** A `CLAUDE.md` at `/Users/Kelly/Alloy-Claude` that names the sanctioned root and the conditions for being there. **The only artifact a misrooted agent will actually read.** This is the whole answer to the bootstrap paradox.
3. **Retract the claim in the name.** Fill the dead `expected=""`: exact remote-URL identity, refuse a worktree as canonical, require `scripts/local-dev` present. Die, don't warn. If that is not wanted, **rename the function to what it does.** The name is a claim (TM-9).
4. **Fetch before printing a behind-count**, or label it `stale`. Never print an unrefreshed number as fact.
5. **Toolkit provenance** in the first-response card: installed source path + its SHA + behind-count vs `origin/staging`.

**Acceptance criteria.**
- `agent-repo-boundaries.md` and `.cursor/rules/repo-boundry.mdc` state the same rule; a reader cannot derive both "Alloy-Claude is my workspace" and "never touch Alloy-Claude."
- An agent that opens `/Users/Kelly/Alloy-Claude` for repository work reads, in that directory, that it is in the wrong tree.
- `ALLOY_REPO` pointed at a worktree, a fork, or a checkout lacking `scripts/local-dev` → **refused**, with the reason.
- No surface prints a behind-count computed against an unfetched ref without labelling it.
- Tests exist for both guards (currently zero).

**Dependencies.** None. **This mission is the only one with no upstream — and doctrine reconciliation blocks its own guards.**

**Implementation scope.** Two docs (reconcile + Alloy-Claude `CLAUDE.md`) — **hours, no code**. One function body (`common.sh:296-314`). One fetch call on reporting paths. Two test files.

**Risk.** **Medium-high, and it is a governance risk, not a technical one.** Adding the guard before reconciling the doctrine makes the toolkit refuse work that canonical governance sanctions — the toolkit would be wrong. Reconciliation is a decision only the operator can make: **it retires a workspace that is in active use.** Low technical risk: identity checks are cheap; the fetch adds seconds to status.

---

### TM-2 · Sprint Manifest — *"the sprint knows what it is"* **(keystone)**

**Purpose.** One record that answers: role · authority · phase · inputs · outputs · handoff target · certification requirements · promotion requirements — **without prompt repetition.**

**Current behavior.**
- 21 fields across three writers, **none naming an initiative, phase, posture, lane, or promotion target**: `ALLOY_WORKTREE_{NAME,SLOT,PATH,BRANCH}`, `ALLOY_AGENT`, `PORT`, `NEXT_PUBLIC_APP_URL`, `ALLOY_CREATED_AT`, `ALLOY_AGENT_{ROLE,STATUS,INSTRUCTIONS,OPENED_AT,CLOSED_AT}`, `ALLOY_SPRINT_{NAME,OBJECTIVE}`, `ALLOY_WORKER_LIFECYCLE`, `ALLOY_PROVIDER_SESSION_ID`, `ALLOY_PAUSE_RECORDED_AT`, `ALLOY_FINISHED_AT`.
- The file is **`source`d as shell** (`common.sh:258`). No schema, no enums, no unknown-key rejection. **The toolkit greps imported briefs for `bash|curl|rm -rf|sudo|eval` and refuses to execute them — then executes its own metadata as shell.** The strength (S10) and the defect share one file.
- It mixes **app env** (`PORT`, `NEXT_PUBLIC_APP_URL`) with **toolkit state** in one sourced file. That mixture is why the state is shell in the first place.
- The initiative side already has what the slot lacks: typed JSON, validated transitions, and (on the product side) `history[]`.

**Required behavior.**
1. **The manifest is JSON, schema-validated, never sourced.** This is not a new substrate — it is **the substrate half the toolkit already uses correctly.** Converge; do not invent.
2. **Split the file by purpose.** `.env` keeps only what the dev server needs (`PORT`, `NEXT_PUBLIC_APP_URL`) — small, mandatory, no optional fields, **so the leak class cannot recur by construction** (TM-9). Toolkit state moves to `manifest.json`.
3. **The manifest carries the join and the declarations:**

| Field | Source | Why |
|---|---|---|
| `initiative_key` | required or explicitly `null` | **the missing join** |
| `stage` | declared | TM-4 |
| `role` · `lane` | declared | TM-5 |
| `posture` · `tenant_class` | declared | TM-3 |
| `constitutional_basis` | contract hash **or** `{none, reason}` | design §4.4 — gate the silence |
| `handoff_target` | declared | TM-7 |
| `certification_requirements` | derived from the intake | TM-6 |
| `promotion_target` | declared, default `origin/staging` | TM-8 |
| `root` | canonical repo + SHA + toolkit provenance | TM-1 |
| `history[]` | appended on every transition | matches product; closes the engineering asymmetry |

4. **`alloy-sprint-start` writes it. Every surface reads it. `alloy-sprint-finish` closes it** rather than deleting it.
5. **`initiative_key: null` is legal and visible.** Not every sprint has an initiative; a sprint that doesn't must *say so*.

**Acceptance criteria.**
- `alloy-worker-status` names the initiative each slot serves, read from the manifest — **not inferred from a worktree name.**
- No toolkit state file is `source`d. `alloy_load_metadata` no longer places optional fields in caller scope.
- A manifest with an unknown key or an invalid enum is **refused**, not sourced.
- `alloy-sprint-start` cannot produce a sprint with an absent stage, role, posture, or constitutional basis — each is a value or an explicit declared absence.
- A sprint's full authority is answerable from one file, without reading a prompt.

**Dependencies.** TM-1 (a manifest naming the wrong root is worse than none). Everything else depends on **this**.

**Implementation scope.** **The largest mission, and the only large one.** New `manifest.json` writer/reader/validator (mirror `engineering-io.mjs`'s shape — do not write a second validator idiom). `alloy-sprint-start` gains the declaration flags. `alloy_load_metadata` splits. Every reader migrates. Reuse `validate-transition` for `history[]`.

**Risk.** **High — and it is the only high-risk mission.** It touches the substrate four live sprints stand on. Mitigations: additive (manifest written alongside `.env`; readers prefer manifest, fall back, and **print `unknown` rather than guessing**); new sprints only; **no backfill** (§Migration R3). The `.env` remains valid for app env indefinitely — this is a split, not a replacement.

---

### TM-3 · Execution Posture — *"the sprint knows what it may touch"*

**Purpose.** Every sprint declares, before execution: shared vs disposable tenant · mutation allowed · certification allowed · promotion target.

**Current behavior.** **The concept does not exist.** `tenant` appears **zero times** in fourteen toolkit docs. `--with-server|--without-server` is the only posture-shaped flag and it concerns a dev server, not mutation. The only real primitive is `alloy_is_production_supabase_url()` — a **binary local/remote** guard, not a posture model. Cost, in the Product Office's words: *"discovered **mid-review** that it targeted a shared hosted database — after which nine reviews could execute nothing."*

**Required behavior.**
1. Two required axes, **no default, refuse on silence**: `mutation ∈ {read-only, shared-read-only, isolated-mutable}` · `tenant_class ∈ {shared, disposable, production-like}`.
2. **Posture sets the certification ceiling**, mechanically: `shared` → **L4 max, cannot certify execution**. `disposable` / `production-like` → L5-eligible.
3. **Propagate**: bootstrap → first-response card → readiness → worker package → evidence → certification level. *A posture that stops at the card is decoration.*
4. **Declare now; allocate later.** **The toolkit must not build the disposable tenant — M7 owns that.** The toolkit must be able to *name and refuse* before M7 lands, so Phase 5 sprints pointed at shared data cannot claim execution on day one.

**Acceptance criteria.**
- `alloy-sprint-start` refuses without both axes.
- The first-response card prints posture and tenant class.
- A `shared` sprint attempting an execution-certification claim is **refused with the reason**, not warned.
- `UNTESTABLE IN SHARED TENANT` is derivable **from the manifest**, not from a reviewer's discipline.

**Dependencies.** TM-2 (the field). **Not** M7 — declaration precedes allocation.

**Implementation scope.** Small once TM-2 exists: two enums, two flags, one ceiling rule, card + readiness wiring. **No allocator.**

**Risk.** Low. The failure mode is over-declaration (every sprint claims `isolated-mutable` because it's permissive). Mitigate by binding posture to the **certification ceiling**, not to permission — over-claiming then costs you a verdict you can't issue, so honesty is the cheaper path.

---

### TM-4 · Phase Runtime — *"the sprint knows what stage it is in"*

**Purpose.** Enforce Discovery → Constitution → Realization → Certification → Promotion.

**Current behavior.** **The state machines exist and work** — 11 product states, 14 engineering states, both `validate-transition`-enforced before any write; `alloy-initiative-start` dies on unapproved, un-handed-off, or hash-missing state. **The slot cannot see any of it** (§0). Three real holes:
- **`alloy-initiative-close:46-55` force-writes `closed` outside the state machine** when not in `awaiting_promotion_approval`, bypassing `validate-transition`. **The guarantee has a documented bypass.**
- Engineering keeps no `history[]` — the path through the lifecycle is unrecoverable; only the terminal state survives.
- `superseded` is a valid product state **no transition can reach**.

**Required behavior.**
1. **Connect, do not rebuild.** The manifest carries `stage` + `initiative_key`; the existing transitions then apply to sprints. **Do not write a third state machine.**
2. **Blocked** (the four that matter for Phase 5):
   - Realization with **no declared constitutional basis** → refuse. *Gate the silence, not the absence* — `--no-constitution <reason>` is legal and visible.
   - Certification whose **certification plan exceeds its posture** → refuse **at bootstrap**. **This is the move that pays for the sprint** (design §3.4): the M7 discovery moves from review-time to bootstrap-time.
   - Promotion with **no recorded certification** → refuse (TM-8).
   - A worker **certifying its own implementation** → refuse (TM-6; L5 never self-issued).
3. **Required:** every sprint declares a stage; every transition appends to `history[]`; close the force-write bypass.

**Acceptance criteria.**
- A Realization sprint cannot begin without a contract hash or a recorded reason for its absence.
- A Certification sprint on a `shared` tenant carrying execution cases is refused **before any work**, naming the missing posture.
- No path writes a state outside `validate-transition`.
- Engineering `history[]` reconstructs the lifecycle.
- `superseded` is reachable or removed.

**Dependencies.** TM-2 (stage + join), TM-3 (the posture check needs posture).

**Implementation scope.** Small-to-medium. Two refusals in `alloy-sprint-start`, one in the promotion path, one bypass closed, `history[]` mirrored from `lib/product.sh:70-79` into `lib/engineering.sh:249-256`. **Zero new state machinery.**

**Risk.** Medium. Refusals on a live workflow can strand a sprint mid-flight. Mitigate with record→display→refuse (§Migration R1) and a documented escape (`blocked`, which every state already reaches).

---

### TM-5 · Role Runtime — *"the sprint knows what it may write"*

**Purpose.** Make role separation a lane property, not a prompt convention. *"Product Office mode held for nine reviews only because the operator restated it."*

**Current behavior.** `ALLOY_AGENT_ROLE` **already exists in the metadata** — and is populated from `alloy_slot_role <slot>`, i.e. **derived from the slot number**. That is the source of the fiction (verified live): slot 2 is labelled `"Architecture / doctrine"` and runs locations-config; slot 3 is labelled `"Performance"` and runs runtime-continuity. `CHEAT-SHEET.md` declares six permanent roles; **the canonical doctrine does not define them at all.** The roles are welded to ports, so two Product sprints are impossible and a Product sprint landing in slot 3 silently becomes "Performance."

**Required behavior.**

**Answer to the question — should Product Office · Engineering Director · Runtime · Configuration · Certification · QA · Promotion · Documentation become first-class sprint roles? No. They are three kinds of thing, and the accepted design already separated them.** Implementing that separation:

| Named | Becomes | Value |
|---|---|---|
| Product Office | **role** | `product-office` |
| Engineering Director | **role** | `engineering-director` |
| QA · Certification *(as an actor)* | **role** | `certifier` |
| Runtime · Configuration · Documentation | **lane** | `runtime` · `configuration` · `documentation` |
| *(from the intake owners)* | **lane** | `ux` · `infrastructure` |
| Certification | **stage** | TM-4 |
| Promotion | **stage** — never a sprint | TM-8 |

*A role is the authority you hold; a lane is the files you may write.* Runtime, Configuration, UX, and Documentation are all **worker** authority in different files — which is why they are lanes. `ux` is added because the intake's own owners name it (M4, M5, M6).

1. **Retarget the existing field**: `ALLOY_AGENT_ROLE` ← declared at sprint-start, not derived from the slot. **Retract `alloy_slot_role`. Delete the permanent-role table from `CHEAT-SHEET.md`** — it is fiction, and it contradicts the canonical doctrine.
2. **Carry role and lane boundaries into generated instructions** — this is closeout rec #5, and it is *only* implementable once role is unwelded from port.
3. **Before Phase 5: declare and carry. Enforcement of write scope can wait** — see §2.

**Acceptance criteria.**
- Role and lane come from the manifest; **no toolkit surface derives a role from a slot number.**
- Two concurrent `product-office` sprints are possible.
- Generated instructions state the role's boundaries **without the operator restating them**.
- No slot's displayed role contradicts its actual sprint.

**Dependencies.** TM-2.

**Implementation scope.** Small — **mostly retraction.** The field exists; change its source, delete the derivation, delete the table, extend the instruction template.

**Risk.** Low technically. The real risk is **declared-but-unenforced roles reading as enforced** — a `product-office` label on a sprint that writes code. Mitigate by TM-9's rule: the card states role **and** that it is declarative, until enforcement lands.

---

### TM-6 · Readiness — *"the sprint knows what it has earned"*

**Purpose.** Replace one ambiguous word with three distinct questions. **Do not collapse them.**

| | Question | Cost | Verdict |
|---|---|---|---|
| **READY** | Can work begin? | seconds | slot bootstrapped (**L1**) |
| **GATE** | Would CI likely pass? | minutes | parity with CI (**L2/L3**) |
| **CERTIFY** | Can this be promoted? | human + evidence | **L4 computed · L5 recorded, never issued** |

**Current behavior.**
- `alloy-agent-ready` runs **fourteen** checks — branch, dirty, server ownership, URL, env mode/leak, QA identity, auth, browser, instructions. **Its overlap with CI is empty. Not partial — empty.** Zero typecheck, test, lint, build. It is a slot-bootstrap probe wearing a fitness word. *"I reported 'lint green' nine times from the non-blocking lint variant; CI's blocking mode caught a defect I introduced in the first artifact."*
- **GATE does not exist.** The two blocking CI jobs (`typecheck:tests`, `docs-lint --ci`) have **no first-class local invocation**. Heap is **4096 local vs 8192 CI**. **Local Node is v16.20.2; CI pins `.nvmrc` = 20; the toolkit only checks that `node` exists.** And all three CI workflows are `pull_request`-only — **a direct merge to unprotected `staging` runs no CI at all**, so the local gate is the only gate on the path actually used.
- **CERTIFY does not exist** for the product. `alloy-engineering-certify` certifies the **toolkit's own harness** and gates nothing.

**Required behavior.**
1. **READY keeps its job and stops overclaiming** — `READY (L1: slot bootstrapped) — no code checks run`. **Rec #6's cheap half is one line and kills the entire "lint green ×9" class.**
2. **`alloy-gate` runs exactly what CI runs**, byte-identical, **from one shared source**. Two hand-maintained copies is how 4096 vs 8192 happened; a fix that leaves two copies re-drifts. Pin Node against `.nvmrc`.
3. **`alloy-certify` records a product certification** — level + evidence + issuer. **It refuses to issue L5.** It can only record one issued externally.
4. **`alloy-engineering-certify` → `alloy-toolkit-selftest`.** One caller, gates nothing; frees the word before `alloy-certify` needs it.
5. **L5-never-self-issued *is* reviewer independence.** *"Level 5 can never be claimed by the product about itself"* maps exactly onto *"an agent may not certify its own implementation."* **The product doctrine already solved this. Reuse it; do not write a second rule.**

**Acceptance criteria.**
- Each verdict names its level and lists what it did **not** check.
- `alloy-gate` and CI are byte-identical, or the difference is **printed**.
- Node mismatch vs `.nvmrc` → refused.
- `alloy-certify` cannot emit L5. An issuer equal to the implementer → refused.
- No command's verdict implies a level it did not test.

**Dependencies.** TM-2 (certification requirements + issuer identity), TM-3 (the ceiling). **The READY wording retraction depends on nothing — ship it first.**

**Implementation scope.** Retraction: one line. `alloy-gate`: small, plus **the shared command source (medium — the only structural piece)**. `alloy-certify`: small. Rename: trivial.

**Risk.** Low-medium. `alloy-gate` invites "run it before every commit" and it is minutes long — keep READY fast or people will skip both. **Naming risk is the real one:** three verdicts are only useful if nobody re-collapses them; the words must appear in the card, the instructions, and the report schema.

---

### TM-7 · Handoffs — *"work crosses a boundary as an artifact"*

**Purpose.** Product → Engineering, Engineering → QA, QA → Promotion become explicit toolkit artifacts. **No prompt-only handoffs.**

**Current behavior.**
- **Product → Engineering is genuinely enforced** — `alloy-product-handoff` is *"the only normal bridge,"* hash-validated, and `alloy-initiative-start:56` dies if state isn't `handed_off`. **But the guard fires only `if alloy_product_exists`** — an engineering-only initiative bypasses it silently. And **the Product Office never used it**: the handoff worked because it *volunteered* a verification.
- **Engineering → QA** is enforced by review modes: `advisory` never promotes; `final` is required for READY.
- **QA → Promotion** is computed then human-terminated — correct by design.
- **`alloy-sprint-finish` closes the slot and never closes the handoff.** It never resolves an initiative; it deletes the slot record and the workflow never learns. *"Half of `alloy-sprint-finish`'s value is closing the slot; the other half should be closing the handoff."*

**Required behavior.**
1. **A handoff artifact with the contents the closeout named**: package commit · verified diff scope · closed decisions · open decisions · protected invariants · evidence standard.
2. **`alloy-sprint-finish` closes the handoff**, using `handoff_target` from the manifest. A sprint whose stage has a handoff target cannot finish without producing one.
3. **Close the dual-front-door bypass** by declaration, not deletion (TM-4): engineering-only initiatives stay legal and must **say** they have no Constitution.

**Acceptance criteria.**
- A Product → Engineering transition **cannot complete by volunteering**; the artifact exists or finish refuses.
- The artifact names all six required contents; a missing one refuses.
- Every sprint's handoff target is answerable from the manifest.
- An engineering-only initiative records **why** it has no Constitution.

**Dependencies.** TM-2 (`handoff_target`), TM-4 (stage).

**Implementation scope.** Small-to-medium. The Product artifact **already exists** (`product/final/engineering-handoff.yaml`, `handoff-manifest.json`) — **generalize it across boundaries rather than authoring a new one**, and add the finish-time gate.

**Risk.** Medium. A required artifact on a boundary people currently cross informally will be felt as friction on day one of Phase 5 — with 8 missions and one sequential edge (M1→M2). Mitigate: **derive** contents from what the intake already carries; require review, not authorship.

---

### TM-8 · Promotion — *"promotion is recorded, not asserted"*

**Purpose.** Make branch · worktree · promotion · artifact · PR lifecycles explicit toolkit concepts.

**Current behavior.**
- **`--promotion-recorded` records nothing.** It is a pure assertion flag — a gate on the terminal transition (`alloy-initiative-close:43-45`), **never written to `state.json`, never dated, never attributed.** With no engineering `history[]`, **the claim that promotion happened leaves no trace** — and `closed` via this path is indistinguishable from `closed` via the force-write bypass. **The flag's name asserts a record that does not exist.**
- **`classify_promotion` fails open.** Risks come from a hardcoded `reports/task-001-result.json` with `|| echo 1` — **a missing report yields `risks=1` → `READY_WITH_KNOWN_RISKS`**, a promotion-eligible verdict. **Absence produces a softer-sounding pass, not a refusal.** `task-001`/`task-002` are hardcoded, so **multi-worker initiatives are packaged from task-001's report alone.**
- **No promotion target exists.** `grep promotion_target` → zero hits. `ALLOY_BASE_BRANCH` is one global, and `alloy-initiative-package:143` **hardcodes `gh pr create --base staging`, ignoring it.** `alloy_base_ref` conflates three roles: branch cut point, baseline SHA, and the unmerged-guard denominator.
- **Nothing tracks whether a branch was merged.** The only merge-awareness is an ephemeral ahead-count in `alloy-worktree-remove:68`, never persisted. `state.json.promotion` records `{classification, packaged_at}` — **a recommendation, not an outcome.** `cost_summary.push_count`/`pr_count` exist with **no incrementer**.
- **Correct and must not change:** the toolkit never pushes, merges, or infers. The only `git push`/`gh pr create` strings in the tree are **printed and unexecuted**. **Preserve this exactly.**
- **Lifecycle gaps:** `alloy-sprint-finish` deletes the slot record; `alloy-agent-close` does *not* free the slot; artifacts are never archived and never pruned — everything accretes forever.

**Required behavior.**
1. **Record the promotion**: `{promoted_at, promoted_by, target, merge_sha, certification_level, issuer}` appended to `history[]`. **A flag named `--promotion-recorded` must write a record or lose the name.**
2. **`promotion_target` becomes a manifest field**, default `origin/staging`; the printed PR command reads it instead of hardcoding.
3. **Fail closed**: a missing report → `NOT_READY`, never `READY_WITH_KNOWN_RISKS`. De-hardcode task-001/002 **before the first multi-worker package**.
4. **Promotion requires a recorded certification** at a level the posture permits (TM-3, TM-6).
5. **Preserve** the never-push property, verbatim.

**Acceptance criteria.**
- `state.json` proves *whether, when, by whom, to what, at what level* a promotion occurred.
- A missing report **cannot** produce a promotion-eligible verdict.
- The printed PR command matches the declared target.
- Promotion without a recorded certification is refused.
- The toolkit still executes **zero** pushes, merges, or PRs.

**Dependencies.** TM-2 (`promotion_target`, `history[]`), TM-6 (`alloy-certify`), TM-4 (bypass closed).

**Implementation scope.** Small for the fail-open fix and the target field. Medium for the promotion record + de-hardcoding. **Explicitly deferred:** branch merge-state tracking, artifact retention, the `alloy-agent-close`/`alloy-sprint-finish` slot-freeing asymmetry.

**Risk.** **Low — and the highest-value-per-line in the plan.** The fail-open fix is a few lines and closes a path where *missing evidence reads as promotable*. Main risk is over-building: promotion is human-terminal by design (S7) and **must stay a record, never an actor.**

---

### TM-9 · Trust — *"no surface claims what it did not read"*

**Purpose.** Apply the Configuration Health standard to the toolkit's own surfaces: *the verdict names the level it reached, and never implies a level it did not test.*

**Current behavior — every item verified this sprint.**

| Surface | Technically true | Operationally misleading |
|---|---|---|
| `alloy-worker-status` **SPRINT** | the variable is set | **it names the wrong sprint.** `wt3`'s file has no `ALLOY_SPRINT_NAME`; `alloy_load_metadata` `source`s into one shell without resetting optional fields; slot 3 inherits slot 2's value and `${VAR:-fallback}` never fires. **Mandatory fields are guarded (`common.sh:259-265`); optional ones leak.** Reported two sprints ago; still live. |
| `alloy-worker-status` **A/B** | true of the cached ref | **computed against an unfetched `origin/staging`** — prints `behind: 0` while 1481 behind |
| `alloy-agent-ready` **READY** | the slot is bootstrapped | reads as "checks pass"; **empty overlap with CI** |
| `--promotion-recorded` | the transition was gated | **nothing was recorded** |
| `classify_promotion` | risks were counted | **a missing report counts as 1 risk → `READY_WITH_KNOWN_RISKS`** |
| `alloy-initiative-close` | state is `closed` | **force-written outside `validate-transition`** |
| `alloy_verify_canonical_repo` | the repo is alive | **the name claims identity verification that line 306 fossilized as a dead variable** |
| `HEALTH` column | a value is printed | undefined semantics — two slots read `unhealthy` while working normally |

**Required behavior — one rule, four corollaries.**

> **A toolkit surface may state only what it read.**

1. **Never inherit.** Absent → `unknown`. (The manifest's JSON substrate removes the class; the `unset` is the stopgap.)
2. **Never print a stale computation as fact.** Fetch, or label `stale`.
3. **Never let absence produce a positive verdict.** Missing report → `NOT_READY`.
4. **The name is a claim.** A flag named `--promotion-recorded` writes a record, or is renamed. A function named `verify_canonical_repo` verifies canonical-ness, or is renamed.

Plus: **the evidence vocabulary becomes default** — `VERIFIED` / `HIGH CONFIDENCE` / `HYPOTHESIS` / `UNTESTABLE` (with a required reason), and the two-class rule — *stable configuration evidence* is comparable; *mutable tenant data* is timestamped at capture and **never compared across timestamps**. Ceiling: **"Source agreement is not evidence."**

**Acceptance criteria.**
- No status cell is inherited; absent renders `unknown`.
- No count is printed against an unrefreshed ref without a label.
- No absence yields a positive verdict anywhere.
- Every verdict word names its level.
- `HEALTH` has a stated definition or is removed.
- A regression test asserts the slot-3 leak cannot recur.

**Dependencies.** The `unset` and the wording retractions depend on **nothing** — they ship first. The structural fix arrives with TM-2.

**Implementation scope.** **Mostly deletion and disclosure.** One `unset` (~1 line). One fetch. One fail-open flip. Two renames. One regression test. **The cheapest mission and the one that makes the others trustworthy.**

**Risk.** **Lowest in the plan, and it is the prerequisite for everything.** Adding posture, phase, and role to a table that inherits cells produces *posture, phase, and role that lie.* Only real risk: `unknown` appearing where a name used to — which is the point, and should read as a fix, not a regression.

---

## 1. Toolkit changes required before Phase 5

**Principle: Phase 5 needs the toolkit to *declare and refuse*, not to *allocate and enforce*.** Phase 5 runs **eight concurrent missions** where the Product Office ran one — and its prompt discipline held only because one operator restated it nine times. **That does not scale to eight lanes.**

| # | Change | Mission | Why it cannot wait |
|---|---|---|---|
| 1 | Doctrine reconciliation + `CLAUDE.md` in Alloy-Claude | TM-1 | Phase 5 agents will be misrouted by **canonical doctrine**. Free; docs only. |
| 2 | Stop the status leak; absent → `unknown` | TM-9 | Eight missions across six slots is unreadable on a table that inherits. |
| 3 | READY states what it did not check | TM-9/TM-6 | One line; kills "lint green ×9" before Phase 5 writes real code. |
| 4 | Fetch before printing behind-count | TM-9/TM-1 | The number that catches wrong-root sprints. |
| 5 | `classify_promotion` fails closed | TM-9/TM-8 | **Missing evidence currently reads as promotable.** |
| 6 | Close the `initiative-close` force-write bypass | TM-4 | The state machine's guarantee must be real before Phase 5 relies on it. |
| 7 | **Sprint Manifest** (join · stage · role · lane · posture · basis · target) | TM-2 | **The keystone.** Without it nothing below can be declared. |
| 8 | Posture declared + certification ceiling | TM-3 | **M7 gates every mission's completion claim.** Declaration must precede M7, or Phase 5 repeats "nine reviews executed nothing" eight times. |
| 9 | Constitutional-basis refusal on silence | TM-4 | Phase 5 *is* Realization under a frozen Constitution. |
| 10 | Certification plan vs posture, checked at bootstrap | TM-4 | **The move that pays for the sprint** — moves the M7 discovery from review-time to bootstrap-time. |
| 11 | Role declared, not slot-derived; carried into instructions | TM-5 | Eight missions, eight owners. Slot-derived roles are already fiction. |
| 12 | `alloy-gate` + one shared CI command source + Node pin | TM-6 | Phase 5 writes real code, and **CI is `pull_request`-only** — the local gate is the only gate on the path used. |
| 13 | `alloy-engineering-certify` → `alloy-toolkit-selftest` | TM-6 | Frees the word before `alloy-certify`. Trivial; one caller. |

**#1–#6 are a single afternoon** and retire two known defects, one of them two sprints old.

## 2. Toolkit changes that may wait until after Phase 5

| Change | Why it can wait |
|---|---|
| **Tenant allocator** (`alloy-tenant request/release`) | **M7 owns building the disposable tenant.** There is nothing to allocate until it exists. Declaring posture is what Phase 5 needs; allocating is what Phase 6 needs. **Building it now would be the toolkit reinventing a Phase 5 mission.** |
| **Role write-scope enforcement** | Declaration + carried instructions closes the restatement gap. Enforcement needs lane→path mappings that will be wrong until Phase 5 shows where lanes actually write. |
| **Manifest migration of live/finished sprints** | New sprints only. **No backfill** (R3). |
| **Engineering `history[]` beyond promotion** | Promotion recording is the load-bearing slice; full lifecycle history is forensics. |
| **De-hardcoding `task-001`/`task-002`** | Needed **before the first multi-worker package**, not before Phase 5 starts. Track it against M1. |
| **Branch merge-state tracking · artifact retention · `agent-close`/`sprint-finish` slot asymmetry · `superseded`** | Real, none blocking. Everything accretes forever — a disk problem, not a truth problem. |
| **`alloy-certify` full evidence corroboration** | Recording level + issuer + refusing self-issued L5 gets the property. Semantic corroboration would violate S4 (*carry, gate, refuse — never assert*). |
| **Amend `managed-sprint-operations.md`; retire the §8 disclaimer** | **Last on purpose.** Doctrine describes what is true. Ratifying before the behavior exists is the same defect this plan is about. |

## 3. Recommended implementation order

| # | Change | Wave | Cost |
|---|---|---|---|
| 1 | Doctrine reconciliation (`agent-repo-boundaries.md` ↔ `repo-boundry.mdc`) | Root | hours, docs |
| 2 | `CLAUDE.md` in `/Users/Kelly/Alloy-Claude` | Root | hours, docs |
| 3 | `unset` optional metadata per row; absent → `unknown`; regression test | Truth | ~1 line + test |
| 4 | READY prints what it did not check | Truth | ~1 line |
| 5 | Fetch before behind-count, or label `stale` | Truth | small |
| 6 | `classify_promotion` → `NOT_READY` on missing report | Truth | few lines |
| 7 | Close the `initiative-close` force-write bypass | Truth | small |
| 8 | Retract or rename `verify_canonical_repo` (fill `expected=""`) | Truth | small |
| 9 | Rename `alloy-engineering-certify` → `alloy-toolkit-selftest` | Truth | trivial |
| 10 | Node pin vs `.nvmrc`; heap 4096→8192 | Gate | trivial |
| 11 | **One shared CI command source**; add `typecheck:tests` + `docs-lint` kinds | Gate | medium — **do not land 10 without 6-in-order or it re-drifts** |
| 12 | `alloy-gate` | Gate | small once 11 exists |
| 13 | **Sprint Manifest**: schema, writer, reader, validator, `history[]` | Manifest | **large — the only large item** |
| 14 | `.env` / `manifest.json` split | Manifest | medium |
| 15 | Readers migrate; `alloy-worker-status` names the initiative | Manifest | medium |
| 16 | Posture + tenant class declared; ceiling rule; card | Declare | small |
| 17 | Role/lane declared; retract `alloy_slot_role`; delete the CHEAT-SHEET table | Declare | small |
| 18 | Role/lane boundaries into generated instructions | Declare | small |
| 19 | Constitutional-basis refusal on silence | Gate | small |
| 20 | Certification plan derived; checked vs posture at bootstrap | Gate | medium |
| 21 | `alloy-certify` — records level + issuer; refuses self-issued L5 | Gate | small |
| 22 | Handoff artifact generalized; `sprint-finish` closes it | Close | medium |
| 23 | Promotion record + `promotion_target`; PR command reads it | Close | medium |
| 24 | Amend `managed-sprint-operations.md` | Ratify | small |

**Ordering rationale.** Root before Truth: a true statement about the wrong tree is still wrong. Truth before Manifest: **new declarations displayed through a lying table are new lies.** Manifest before Declare: the fields need a home. Gate parity early: Phase 5 writes code from day one. Ratify last.

## 4. Engineering decomposition

Seven tasks. **T1–T3 are fully parallel; T4 is the bottleneck; T5–T7 fan out behind it.**

| Task | Scope | Owner lane | Slot | Depends on | Parallel? |
|---|---|---|---|---|---|
| **T1 · Root Reconciliation** | Order 1–2. **Docs only, zero code.** Reconcile doctrine; publish `CLAUDE.md` in the wrong root. | documentation | any | — | ✅ **Start now** |
| **T2 · Truth Retractions** | Order 3–9. Independent one-liners in different files; ships as one coherent commit. | infrastructure | any | — | ✅ **Start now** |
| **T3 · Gate Parity** | Order 10–12. Shared CI command source; `alloy-gate`; Node pin. | infrastructure | any | — | ✅ **Start now** |
| **T4 · Sprint Manifest** | Order 13–15. **Keystone. The only large task. One owner, no split** — a substrate two agents edit concurrently is a merge conflict with a state machine in it. | infrastructure | dedicated | T2 (build on an honest table) | ❌ **serialize** |
| **T5 · Declarations** | Order 16–18. Posture, role, lane; retract `alloy_slot_role`. | infrastructure | any | T4 | ✅ after T4 |
| **T6 · Phase Gates** | Order 19–21. Basis refusal; plan-vs-posture; `alloy-certify`. | infrastructure | any | T4, T5 | ✅ after T5 |
| **T7 · Closure** | Order 22–23. Handoff artifact; promotion record. | infrastructure | any | T4, T6 | ✅ after T6 |

**Critical path:** T2 → T4 → T5 → T6 → T7. **T1 and T3 are off it entirely and should start immediately.**

**Sequencing note.** T1 is first in *order* and off the *critical path* — it is docs, it blocks nothing technical, and it is the only task that must land before Phase 5 agents are dispatched. **Do it first because it is free and because every misrouted Phase 5 sprint is currently sanctioned by doctrine.**

**Posture for this work.** All seven are `isolated-mutable` on a **`disposable`** tenant — none touches product data. **The toolkit's own realization needs no tenant Phase 5 hasn't built yet**, which is exactly why declaration can precede M7.

## 5. Migration strategy

**Four live sprints occupy slots 2–5. Nothing may break them.**

- **R1 · Additive first, fail-closed last.** Every gate lands in three steps: **record → display → refuse.** Posture: accept and record `unknown` → show `unknown` → require for new sprints → refuse READY on `unknown`. **Never introduce a refusal and its concept in the same change.**
- **R2 · Fix the trust surface before anything reads it.** T2 precedes T4 not because it is urgent but because **every other signal is displayed through that table.**
- **R3 · Migrate by absence, not by backfill.** `wt3-runtime-continuity.env` has **no sprint fields at all**. Do not backfill guesses — **an absent field renders `unknown`**, which is the T2 fix. **The migration path and the bug fix are the same change.**
- **R4 · The manifest is additive; the `.env` survives.** Manifest written alongside; readers prefer it, fall back, print `unknown` rather than guess. The `.env` remains valid for app env (`PORT`, `NEXT_PUBLIC_APP_URL`) indefinitely. **A split, not a replacement.**
- **R5 · New sprints only.** Live sprints keep running on `.env`; the first fully-manifested sprint is the first Phase 5 sprint.
- **R6 · The dual front door is closed by declaration, not deletion.** Engineering-only initiatives stay legal. **Observe how many Phase 5 sprints declare `--no-constitution`. If that number is high, the Constitution is too expensive — a finding, not a violation.**
- **R7 · Retire names early.** `alloy-engineering-certify` → `alloy-toolkit-selftest`: one caller, no CI dependency. Cheapest safe change; **do it before `alloy-certify` needs the word.**

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Doctrine reconciliation retires a workspace in active use** | **High — operator decision, not technical** | Only Kelly can rule. **Until then the toolkit cannot legitimately refuse Alloy-Claude — the agent is following the rules.** This blocks TM-1's guards, not its docs. |
| **Manifest substrate change breaks live sprints** | **High** | R4/R5: additive, new sprints only, no backfill, `.env` survives. T4 gets one owner. |
| **The plan becomes a toolkit sprint that delays Phase 5** | **High** | **§1 is the whole gate: declare + retract + one join.** Allocators, enforcement, retention, and history all wait. If §1 slips, ship 1–6 alone — they are an afternoon and retire real defects. |
| **The toolkit reinvents M7** | Medium | **Explicit boundary: the toolkit declares posture; M7 builds the tenant.** No allocator before M7. |
| **Refusals strand a live sprint** | Medium | R1 record→display→refuse; `blocked` is reachable from every state. |
| **Declared-but-unenforced reads as enforced** | Medium | TM-9's rule: the card states the declaration *and its enforcement status*. |
| **Gate parity re-drifts** | Medium | **One source, two consumers.** A fix that leaves two copies is the bug that produced 4096 vs 8192. |
| **Handoff artifacts feel like friction on Phase 5 day one** | Medium | Derive from what the intake already carries; require review, not authorship. |
| **`unknown` reads as regression** | Low | It is the fix. State it in the release note. |
| **Over-building promotion** | Low | Promotion stays a **record**, never an actor. Preserve the zero-push property verbatim. |

## 7. What should become mandatory in every Alloy sprint

The standing contract. **Each line exists because a human had to restate it.**

1. **Declare your root.** Canonical repo + SHA + toolkit provenance, printed in the first response. *A sprint in the wrong tree is void, and today it is also sanctioned.*
2. **Carry a manifest**: `initiative_key` (or explicit `null`) · stage · role · lane · posture · tenant class · constitutional basis · handoff target · promotion target. *The sprint's authority is answerable from a file, not a prompt.*
3. **Declare posture before execution. No default.** `shared` cannot certify execution — **mechanically**, not by discipline.
4. **Name the level of every verdict.** *The verdict names the level it reached and never implies a level it did not test.* READY ≠ GATE ≠ CERTIFY.
5. **Report in the evidence vocabulary**: `VERIFIED` / `HIGH CONFIDENCE` / `HYPOTHESIS` / `UNTESTABLE` — with a **reason** on UNTESTABLE. Mutable tenant data is timestamped at capture and never compared across timestamps. **Source agreement is not evidence.**
6. **Nothing self-certifies.** L5 is recorded, never issued. **An agent may not certify its own implementation.**
7. **Cross boundaries as artifacts.** A handoff is produced and reviewed — never volunteered, never a prompt.
8. **Promotion is recorded, not asserted** — whether, when, by whom, to what, at what level. And **the toolkit still never pushes.**
9. **Absence is a value.** `unknown`, `--no-constitution <reason>`, `UNTESTABLE IN SHARED TENANT`. **Fail closed on silence, never on absence.**
10. **The meta-rule:** *anything an operator must restate is a toolkit defect.* **File it as one.**

---

## 8. Closing

The audit set out to find what to build and found, twice, that the thing was already there.

The state machines exist — 11 product states and 14 engineering states, validated before every write. The Constitution is hash-frozen with a real refusal behind it. The handoff is a command. Certification blocks READY. Promotion is human-terminal and executes zero pushes. **What is missing is a field.** The slot — the thing every sprint actually starts from — is a 21-key shell file that names no initiative, no phase, no role, no posture, and no target, `source`d into a global scope that lets one slot inherit another's identity.

**That is the whole distance between the toolkit Alloy has and the toolkit Phase 5 needs: one join, a set of declarations, and a handful of retracted claims.**

The one mission that resists this is Canonical Root, and it resists because it is not a toolkit problem. Canonical governance currently tells a Claude agent that `/Users/Kelly/Alloy-Claude` is its workspace for design reviews and sprint packages — which is what this plan is, and where it was written, on a branch 1481 commits behind that contains no toolkit at all. **No guard can settle that, because a misrooted agent never calls the toolkit. Only the doctrine can, and only Kelly can amend the doctrine.**

Phase 4 proved the workflow by running it without the toolkit. **Phase 5 will run eight missions in parallel where Phase 4 ran one — and Phase 4's discipline held only because one operator restated it nine times.** Eight lanes will not hold that way.

**The toolkit does not need to become smarter. It needs to stop overclaiming, learn the address of the work it is already doing, and refuse to let a convention live in a prompt.**
