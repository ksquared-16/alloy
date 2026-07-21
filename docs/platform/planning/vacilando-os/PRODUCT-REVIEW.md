# Vacilando OS — Product Review Package

**Sprint:** vacilando-os-product-def (slot 6) · **Role:** Director (product definition, no implementation)
**Base:** origin/staging @ `2b554b4b4` · **Prepared:** 2026-07-21
**Status:** For Director approval — *no engineering has begun.*

> **One-line thesis.** The Alloy toolkit is already a mature, secure, six-runtime operating
> system for AI-agent engineering — but it is **headless**: 67 CLI commands over a filesystem
> state tree, with no coherent surface to *see* or *operate* it. **Vacilando OS is the product
> layer** that turns that substrate into a single, live, approvable control plane. A working
> prototype of exactly this — the "Director" — was already built, screenshotted, and then
> **stranded 282 commits behind canonical governance.** This package defines how to land it for real.

---

## 0. How this assessment was produced (Toolkit-orchestrated)

Per the mission's directive to *"use the Toolkit itself wherever possible… a validation that the
Toolkit can orchestrate its own evolution,"* this sprint was bootstrapped and executed through the
canonical Alloy toolkit end-to-end:

- **Bootstrap:** `alloy-root` (root class = canonical) → `alloy-worker-status` (slot survey) →
  `alloy-sprint-start vacilando-os-product-def --provider claude --slot 6 --without-server`.
- **Managed artifacts:** slot 6, worktree `wt6-vacilando-os-product-def`, branch
  `agent/claude/6-vacilando-os-product-def`, port 3016, provider registration + runtime-ownership
  metadata in `~/.local/state/alloy-dev/metadata/wt6-vacilando-os-product-def.env`.
- **Inspection:** read-only fan-out across the 67-command surface, `lib/` internals, live on-disk
  state, governance docs, and git history — *no mutating command was run against production state.*
- **Runtime posture:** none required (product definition is read-only + document/mockup production);
  no Runtime Intent filed; no Docker/Supabase touched.

The bootstrap succeeded on the first attempt with a clean tree, 0/0 vs staging. **The Toolkit can
orchestrate its own evolution — that claim is now evidence, not aspiration.**

---

## 1. Current State Assessment

### 1.1 What Alloy actually is today

A **self-contained Bash + Node toolkit** (`scripts/local-dev/`, ~17k LOC, 67 `alloy-*` commands,
30 `lib/` modules, four test phases) for running up to **six concurrent Cursor/Claude engineering
agents** in isolated git worktrees with deterministic ports and serialized heavyweight validation.

It has grown in deliberate phases, each certified before the next:

| Layer | What it added | Maturity |
|---|---|---|
| **Phase 1** | Worktrees, fixed ports (3011–3016), owned dev servers, validation lock, health/audit/clean | Certified |
| **Phase 2** | Managed agent lifecycle (create/open/status/close/instructions) + AI-health diagnostics | Certified |
| **Phase 3** | Per-slot auth, isolated browser verification, evidence, two-tier secret env | Real-Mac certified (Jul 2026) |
| **Phase 4** | Engineering Runtime — initiative intake → audit → plan → workers → review → merge-readiness | Certified |
| **Product Runtime V1** | Brief → audit → contract → decisions → approval → handoff to Engineering | Certified |
| **Runtime R0–R3** | Docker/Supabase substrate: Registry/Inspection → Intent/Admission → Actuation | Tested; local-Docker cert harness |
| **Managed Sprint Ops** | Six permanent slots as *roles*; sprint-start/pause/resume/finish/doctor | In daily use (this sprint) |

### 1.2 Architectural spine — *one read core, many interfaces*

The entire system rests on a disciplined **read/write split**:

- **`lib/read-core.sh`** ("Shared Read Core") is the *single* implementation of config parsing,
  metadata reads, git/port/process inspection, and JSON emission. It has a written constitution:
  never `source` user files (it *parses* with a KV parser that fails closed on `$()`, backticks,
  pipes, redirects), never write, never mkdir, never touch the network, never mutate git.
- **Mutation runtime** = `lib/common.sh` + the `alloy-*` scripts (all side effects live here).
- **Inspection runtime** = `alloy-ro` (a 55KB read-only CLI) via thin adapters over the read core.
  It accepts only `--json`; every other flag and unknown verb **fails closed (exit 2)**.

The same observe → declare → execute pattern repeats for the infra runtime
(`runtime-core.sh` → `admission-core.sh` → `actuation-*.sh`).

### 1.3 State model — filesystem as the database

There is **no database and no single registry file.** Authoritative state is a tree of atomically
written `.env` (KV) and `.json` files under one configurable root, `ALLOY_RUNTIME_ROOT`
(default `~/.local/state/alloy-dev`). Every subdir is *derived* from that root and exported so
subprocesses cannot fall back to production.

| Path | Holds |
|---|---|
| `metadata/<name>.env` | **Primary slot/worker/agent registry** — one file per worktree (slot, port, branch, agent, sprint, lifecycle, provider session id) |
| `pids/<name>.provider.{pid,meta}` | Provider (Cursor/Claude) process registry + **ownership-proof kill guard** |
| `manifests/<name>.json` | Sprint manifest (stage, role, lane, **posture**, basis, handoff) |
| `initiatives/<key>/` | Engineering + Product state machines (`state.json`), contracts, `decisions/`, `final/` packages |
| `runtimes/<ns>.env` | Docker/Supabase runtime registry (owner = explicit-only; association = inference-only) |
| `intents/` · `reservations/` · `executions/` | Runtime Intent → Admission → Actuation records |
| `locks/validate.lock/owner.env` | Global heavy-validation mutex (atomic `mkdir`, PID-liveness stale detection) |
| `auth/` · `evidence/` · `pause-state/` · `finished-meta/` | Per-slot browser storage state, verification artifacts, pause snapshots, closeouts |

### 1.4 Security posture (already strong)

- **Two-tier env:** agents see only a sanitized `web/.env.local.agent` (allowlist + denylist that
  *always wins* on `SECRET/PASSWORD/TOKEN/SERVICE_ROLE/DATABASE_URL/API_KEY`, values never printed).
  Privileged vars are injected only into the toolkit-owned Next process. `npm run dev` is prohibited.
- **Fail-closed everywhere:** illegal state transitions, occupied ports ("refuse, never silently
  re-pick"), unproven-ownership kills, and unknown `alloy-ro` verbs all refuse rather than guess.
- **Hard Docker redaction:** the observe layer runs only field-restricted `docker ps`/`stats` —
  never `inspect`/`logs`/`exec`/`.Env` — so runtime secrets are physically unreachable.
- **Human-only promotion:** nothing pushes, merges, or deploys without explicit Kelly authorization.

### 1.5 The defining gap — it is **headless**

The README states the boundary in its own words: *"developer experience tooling only… **No
dashboards, daemons, or sprint automation.**"* Every runtime governance doc ends by naming a
**"future Director"** — an out-of-repo, unbuilt orchestrator that would sequence missions, hold
approvals, and drive the runtime pipeline. Today an operator runs the whole organization by:

- reading `alloy-worker-status` tables in a terminal,
- opening a provider, **pasting a worker package once** (no GUI automation by design),
- reviewing decision YAML files by hand,
- approving contracts/plans/QA/promotion via discrete CLI commands.

**There is no single pane. No live view. No queue. No mobile. No notifications. No autonomy.**
That absence *is the product opportunity.*

### 1.6 The pivotal finding — a Director V1 already exists, stranded

Live state under `~/.local/state/alloy-dev/director/` revealed a substantial prior effort:
**`alloy-director-local-control-plane-v1`**, four committed tasks culminating in
*"Complete operator-usable Director V1"* (`417c246de`). It shipped:

- **`lib/director.mjs`** (2,093 LOC) — deterministic **projections** (mission/worker/decision/
  evidence/QA/release) over the *existing* runtime state. Its law: *"Missions ARE initiatives —
  never a parallel model."* Plus a **fixed command allowlist** (`mission.pause/resume/prioritize/
  launch`, `decision.resolve`, submit-review, approve-QA, approve-promotion) that **fails closed**,
  and inert-text handling so brief/conversation content can never execute shell.
- **`lib/director-server.mjs`** — a **loopback-only (127.0.0.1)** HTTP API + **SSE live stream**
  that never auto-starts; `POST /api/commands` routes JSON through the allowlist with a pure
  **preview-before-confirm** endpoint.
- **`apps/director/`** — a **dependency-free single-page web app** (`index.html`, 707-line
  `styles.css` dark design system, 1,224-line `app.js`), a demo seeder, and a Playwright
  screenshot harness. **Rendered desktop + tablet screenshots exist.**
- **`contracts/director-v1/events.json`** — a stable, delivery-adapter-independent **event contract**
  (7 event types, deterministic sha256 ids, replayable).
- A **scheduler** (`missionEligible` / dependency + blocking-decision gating → `mission.launch`),
  **macOS notification delivery** (`notifications.json` shows `delivered: true`), and it actually
  **ran headless provider sessions** (Claude Opus, 64 turns, resumed, ~$8.57, streamed to
  `provider.stream.jsonl`) — i.e., a working slice of *autonomous execution*.

**Why it's stranded:** it forked on **Jul 15**; staging has moved **282 commits** since. It predates
the entire canonical **Runtime Intent/Admission/Actuation** and **Managed Sprint Operations** layer.
Its diff against current staging reads as deleting `sprint-ops.sh`, `runtime-core.sh`, the whole
`alloy-ro` family, and 15 runtime/sprint test files — because *staging added all of those after the
branch diverged.* The Director is therefore **both stranded and stale**: invaluable as proven
design and data-model prior art, but it cannot be cherry-picked onto today's governance model.

---

## 2. Capability Inventory (implemented vs. missing)

Mapped to the six target runtimes. **✅ = solid CLI+state substrate · 🟨 = partial/prototype ·
❌ = absent on canonical staging.**

### 2.1 Project Runtime — *WHAT / WHY (initiatives, products, contracts, decisions)*

| Capability | Status | Evidence |
|---|---|---|
| Product brief intake (clipboard/file/stdin, untrusted-data safe) | ✅ | `alloy-product-create/import` |
| Product contract generation + doctrine grounding | ✅ | `alloy-product-audit/contract`, `product-io.mjs` state machine |
| Human Decision Queue (durable, blocking vs non-blocking) | ✅ | `alloy-product-decide/decisions`, `decisions/decision-NNN.yaml` |
| Engineering initiative lifecycle (audit→plan→approve→start→review→package→close) | ✅ | `alloy-initiative-*`, `engineering-io.mjs` |
| Product → Engineering handoff (hash-locked contract) | ✅ | `alloy-product-handoff`, `handoff-manifest.json` |
| **Visual read model / portfolio view of all projects** | ❌ | terminal `*-status` only |
| **LLM-assisted decomposition / autonomous strategy** | ❌ (by design) | docs disclaim it repeatedly |

### 2.2 Sprint Runtime — *sprint lifecycle & resource governance*

| Capability | Status | Evidence |
|---|---|---|
| Slot allocation, worktree, deps, env, provider open | ✅ | `alloy-sprint-start` |
| Pause / resume / finish / doctor (ownership-safe) | ✅ | `alloy-worker-pause/resume/finish/doctor`, `sprint-ops.sh` |
| Resource guardrails (max providers/servers/installs/heavy) | ✅ | config `ALLOY_MAX_*`, validation mutex |
| Sprint manifest (posture, basis, lane, handoff) | ✅ | `alloy-manifest`, `manifests/<name>.json` |
| **Live six-slot view (beyond a static table)** | 🟨 | `alloy-worker-status` table; Director prototype had it |
| **Scheduler / auto-advance of a mission queue** | 🟨 | prototyped in `director.mjs`; ❌ on staging |

### 2.3 Worker Runtime — *provider/agent execution*

| Capability | Status | Evidence |
|---|---|---|
| Managed agent open/close/status/instructions | ✅ | `alloy-agent-*` (12 commands) |
| Provider PID registry + **ownership-proof kill guard** | ✅ | `pids/*.provider.meta`, `sprint-ops.sh` |
| Worker package delivery (clipboard + app open) | ✅ (manual paste) | `alloy-worker-open/package` |
| Structured worker report ingest (conversational "done" rejected) | ✅ | `alloy-worker-report`, `reports/<task>-result.json` |
| Browser verification + evidence (per-slot isolated) | ✅ | `alloy-agent-login/verify/ready`, `agent-*.mjs` |
| **Live worker activity stream (turns, elapsed, result)** | 🟨 | `provider.stream.jsonl` + Director cards; ❌ on staging |
| **Headless/autonomous provider execution** | 🟨 | Director ran Claude `-p` sessions; ❌ on staging |

### 2.4 Repository Runtime — *roots, worktrees, git boundaries, promotion*

| Capability | Status | Evidence |
|---|---|---|
| Canonical-root guard / boundary classification | ✅ | `alloy-root` (canonical/managed/retired/unmanaged) |
| Worktree create/sync/remove (safe, non-force) | ✅ | `alloy-worktree-*` |
| Staging-based branch conventions, unmerged-refuse removal | ✅ | worktree lifecycle |
| **Promotion / PR orchestration** | 🟨 (human, uninstrumented) | manual push/PR; no UI, no status |
| **Cross-worktree / boundary visualization** | ❌ | — |

### 2.5 Approval Runtime — *human gates*

| Capability | Status | Evidence |
|---|---|---|
| Product contract & plan approval (approver, frozen hash) | ✅ | `alloy-product-approve`, `alloy-initiative-approve` |
| Product decision resolution (regenerates contract sections) | ✅ | `alloy-product-decide` |
| Review pipeline (advisory / gate / final; reviewer ≠ implementer) | ✅ | `alloy-initiative-review`, `REVIEW-PIPELINE.md` |
| Fail-closed gates (release-before-QA, blocking decisions) | ✅ | state machines |
| **Unified approval queue surface** | 🟨 | Director decision queue prototype; ❌ on staging |
| **Remote / mobile / notified approvals** | ❌ | all local CLI |

### 2.6 Knowledge Runtime — *observability & read model*

| Capability | Status | Evidence |
|---|---|---|
| Autonomous read-only inspection surface (fail-closed) | ✅ | `alloy-ro` + `ro-capabilities.json` |
| Shared Read Core (one read implementation) | ✅ | `read-core.sh` |
| Runtime registry + reconciliation (registered/discovered/orphaned) | ✅ | `alloy-runtime-register`, `runtime-core.sh` |
| Evidence, health, audit, AI-health diagnostics | ✅ | `alloy-agent-evidence/health/audit/ai-health` |
| Stable event contract (replayable, adapter-independent) | 🟨 | `director-v1/events.json`; ❌ on staging |
| **`alloy-ro` coverage of health/status/decisions** | 🟨 | out of scope in V1 — agents can't safely read those yet |
| **Knowledge base / doctrine surfacing in a UI** | ❌ | markdown files only |

### 2.7 Infra Runtime substrate (cross-cutting, feeds Sprint + Knowledge)

Intent → Admission → Actuation → Registration is **✅ implemented and tested** (including a
local-Docker cert harness), with the central rule *"a zero provider exit code is not success —
independent verification is."* No UI; entirely CLI + `alloy-ro` reads.

---

## 3. Gap Analysis

The substrate is ~85% present as CLI+state. The gaps are almost entirely **surface, orchestration,
and reach** — plus reconciling the stranded prototype.

### 3.1 Structural gaps (the product)

1. **No unified operating surface.** The six runtimes are operated through ~67 discrete commands and
   hand-read files. There is no single live pane, no cross-runtime view, no queue.
2. **No live projection.** State is only observable by re-running read commands; nothing streams
   change. (The Director's SSE + event contract solved this — off-staging.)
3. **No orchestration.** No scheduler advances a mission queue; dependency/eligibility logic exists
   in the prototype only. Every step is a manual command.
4. **Manual worker delivery.** One human paste per worker; conversational completion rejected. Safe,
   but a hard ceiling on throughput and remote operation.
5. **No reach.** No mobile, no notifications on canonical, no remote approvals. The organization can
   only be run from the one Mac at the terminal.

### 3.2 Reconciliation gaps (the prototype)

6. **Director V1 is 282 commits stale** and predates canonical governance. Its projections read
   *initiatives* directly; canonical now has Sprint Manifests, Intent/Admission/Actuation, and the
   Managed Sprint Ops registry the prototype never saw. Landing it = **re-implementation onto the
   canonical read-core + governance model**, not a cherry-pick.
7. **Event contract vs. runtime events.** `director-v1/events.json` (7 mission-centric types) must be
   widened to the six-runtime vocabulary (sprint/worker/repo/approval/knowledge/infra events).

### 3.3 Hygiene / debt gaps (found during inspection)

8. **Namespace overload:** `alloy-worker-*` means *both* Managed-Sprint-Ops slot control *and*
   Phase-4 initiative workers; `alloy-agent-*` overlaps `alloy-worker-*`. Confusing to operators and
   to any UI that models them.
9. **Two entry points into Engineering** (`--from brief` vs. `--from-handoff`) are under-reconciled
   vs. the "handoff is the only normal bridge" doctrine.
10. **Doc contradictions:** `agent-repo-boundaries.md` §1 retires `/Users/Kelly/Alloy-Claude` while §5
    still tells operators to pull staging into it; README phase-roadmap omits the R0–R3 runtime track.
11. **Known isolation-incident history:** `alloy-cert-leak-*` exists because certification fixtures
    once leaked into the production registry — the isolation guarantees are *"hardened after an
    incident,"* not *"never failed."* A control plane must treat cert/fixture state as first-class.
12. **`alloy-ro` blind spots:** `health`, `audit`, `initiative-status`, `product-status`,
    `product-decisions` are out of the read-only surface — so an autonomous/UI reader cannot yet see
    them through the safe channel. Vacilando needs these promoted into `alloy-ro`.

---

## 4. Product Architecture

### 4.1 Product definition

> **Vacilando OS is the operator control plane for the Alloy engineering organization** — a
> local-first, projection-and-command surface that lets one Director *see* and *run* all six
> runtimes as a single system, from observe-only today to notified, remote, and progressively
> autonomous tomorrow.

**Name meaning.** *Vacilando* — to travel where the experience of the journey matters more than the
destination. The Director sets direction and approves; the OS carries the missions.

### 4.2 First principles (inherited, non-negotiable)

1. **Projection, not parallel truth.** The filesystem state tree remains the single source of truth.
   Vacilando *reads* it and issues *commands* that go through the existing CLIs/state machines. It
   never invents a second model. (Directly inherited from `director.mjs`.)
2. **Fail-closed command allowlist.** Every operator action is one of a fixed, enumerated set;
   payloads are inert data; nothing evaluates content or shells arbitrary strings. Consequential
   commands require **preview → explicit confirm.**
3. **Loopback-first.** The control plane binds `127.0.0.1`, never auto-starts, exposes no external
   interface. Remote reach is a *later, deliberately gated adapter* — never the default.
4. **Human owns every quality/promotion gate.** Autonomy may *sequence and prepare*; humans *approve*.
   Release is never auto-approved.
5. **One read core.** All reads flow through the Shared Read Core / `alloy-ro`, so the UI can never
   disagree with the CLI about state, and can never see a secret.

### 4.3 The three planes

```
┌──────────────────────────────────────────────────────────────────────┐
│  VACILANDO OS  (localhost:302x control plane, loopback-only)           │
│                                                                        │
│  ── OBSERVE PLANE ─────────  read-only projections + SSE live stream   │
│     projects · sprints · workers · repos · approvals · knowledge       │
│                                                                        │
│  ── COMMAND PLANE ─────────  fixed allowlist, preview→confirm          │
│     start/pause/resume sprint · resolve decision · approve · promote   │
│                                                                        │
│  ── ORCHESTRATE PLANE ─────  (Phase 2) scheduler · notifications ·     │
│     eligibility/dependency advance · remote gateway · autonomy         │
└──────────────────────────────────────────────────────────────────────┘
        │ reads (never sources)              │ commands (allowlist → CLIs)
        ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ALLOY TOOLKIT  — Shared Read Core · 67 alloy-* commands · state machines│
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STATE TREE  ~/.local/state/alloy-dev/   (single source of truth)       │
│  metadata · manifests · initiatives · runtimes · intents · locks · …    │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.4 The six runtimes as product surfaces

| Runtime | Vacilando surface | Primary read source | Primary commands (allowlist) |
|---|---|---|---|
| **Project** | Portfolio + Mission/Initiative workspace, contract + decision review | `initiatives/*/state.json`, `decisions/` | resolve decision, approve contract/plan, handoff |
| **Sprint** | Six-slot live board, sprint queue, resource-governance meters | `metadata/*.env`, `manifests/*.json` | start/pause/resume/finish, prioritize |
| **Worker** | Per-worker cards (provider, role, step, elapsed, result, evidence), live activity | `pids/*.provider.meta`, `provider.stream.jsonl`, `evidence/` | open, verify, ingest report |
| **Repository** | Root/worktree/boundary map, promotion tracker | `alloy-root`, git projections | (Phase 2) prepare-PR, record promotion |
| **Approval** | Unified decision + gate queue with mission context | `decisions/`, review packages, gate states | resolve, approve QA, approve promotion |
| **Knowledge** | Runtime-health, registry reconciliation, evidence, doctrine surfacing | `alloy-ro` verbs, `runtimes/*.env`, evidence | (read-only) |

---

## 5. User Flows

Actor: **Kelly (Director)** unless noted. Each flow lists the surface, the underlying command(s),
and the gate.

### 5.1 Review & approve a Product Contract  *(Approval + Project)*
1. Notification / queue badge: *"Locations Config — contract awaiting approval, 0 blocking decisions."*
2. Open **Mission Workspace → Contract** tab; read the frozen contract, scope, acceptance, visual basis.
3. Any open **blocking decisions** appear inline; resolve each (`decision.resolve`) with a note.
4. **Approve** (preview → confirm) → `alloy-product-approve --approver Kelly`; contract hash frozen.
5. **Hand off** to Engineering → `alloy-product-handoff`. Gate: human-only; fail-closed if unmet.

### 5.2 Start a sprint and watch it live  *(Sprint + Worker)*
1. From the **Sprint Board**, pick a queued mission → **Start** (preview shows slot/port/branch/base).
2. Confirm → `alloy-sprint-start …`; a slot fills, worktree + env prepared, provider opened.
3. Worker cards go live (role, step, elapsed, last activity, result) via SSE from `provider.stream.jsonl`.
4. Resource meters (active missions / workers / heavy validations) update against guardrails.
5. **Pause** overnight (`alloy-worker-pause`), **Resume** next morning (`alloy-worker-resume`).

### 5.3 Resolve a blocking decision  *(Approval)*
1. **Decision Queue** shows *"Architecture conflict — two runtimes claim the compliance event stream."*
2. Card shows mission context, options, recommendation (★), and a resolution-note field.
3. Choose an option + note → `alloy-product-decide`; contract sections regenerate; queue unblocks.

### 5.4 Approve QA and promotion  *(Approval + Repository)*
1. **QA-ready** event → review evidence (routes, screenshots, console/network errors, risks).
2. **Approve QA** (`approve-qa`), then **Product Review** with structured multi-finding feedback.
3. On pass → **Approve promotion** (preview shows exact commit/branch/localhost target) →
   human executes the single push/PR into staging → `alloy-sprint-finish`. Gate: release never auto.

### 5.5 (Phase 2) Overnight autonomous run → morning review
1. Kelly queues N missions with dependencies, sets autonomy = *"advance until a gate."*
2. Scheduler launches eligible missions one at a time (max-one-active), runs headless providers,
   ingests reports, halts at every human gate — emitting **push notifications** on gate/failure.
3. Morning: Kelly opens Vacilando (or mobile), works the accumulated **Approval Queue**, promotes.

---

## 6. High-Fidelity UI Mockups

Delivered as a standalone, self-contained, living artifact:
[`mockups/vacilando-os-mockups.html`](mockups/vacilando-os-mockups.html) (published to a private
Artifact URL for review).

**Chosen visual identity — "Vacilando" (warm desert-wanderer).** Rather than the utilitarian dark
command-center of the stranded Director prototype, the product adopts a **warm, human, light-theme**
identity that suits a tool the Director opens all day:

- **Forest-green navigation rail** with a **terracotta script wordmark** and a **desert-horizon
  illustration** (the *vacilando* — journey — motif).
- **Warm cream canvas** (`#f6f2ea`), white cards, one restrained **terracotta accent** (`#cf6f47`)
  reserved for "needs you," with **green** for healthy/live and a separate, muted **semantic status
  set** (running blue, review amber, blocked terracotta, complete green, planning slate).
- **Per-sprint desert glyphs** (sun, cactus, mountain, wave, leaf, bus) as lightweight identity marks
  — playful but legible, rendered as inline SVG (no emoji/platform variance).
- A **project switcher** (Alloy Platform / Marketing / Personal Tools / Sandbox) — the product spans
  *multiple* projects, one runtime per project.
- A single **committed light theme** — a deliberate identity choice, not an omission.

**Screen delivered — Command Center (desktop + mobile companion):**
- **Metric strip** — Active Sprints, Workers Running (4/6), **Questions Pending (needs you)**,
  PRs Ready, Tests Passing, Staging Sync.
- **Active Sprints** — each sprint as a row: glyph, title, lifecycle chip
  (Implementation / Review / Complete / Planning / Blocked), phase + owner, live progress, worker +
  status, branch, commits/PR, overflow menu.
- **Worker Pool · Recent Activity · Quick Actions** — the running providers, a live event feed, and
  the operator's common commands (Start Sprint, Ask Architect, Review & Approve, Promote, Merge).
- **"Needs Your Attention" dock** — the small set of items that actually require the human: a worker
  **Question**, a **PR ready to merge**, a **mockup ready** — each with a direct action.
- **Mobile companion** — an approval-first phone view (Today / Sprints / Approvals) for handling
  questions and gates away from the desk (Phase 2 reach; identity already defined here).

**Reading the mockup faithfully:** every number, worker, and card is a **projection** of real toolkit
state; every action maps to one entry in the **fail-closed command allowlist** that calls the
existing `alloy-*` commands; consequential actions preview before they confirm; release is never
auto-approved.

**Further screens to storyboard in the build phase** (same identity, not yet drawn): Sprint Board
(six permanent slots), Mission Workspace (contract/decisions/evidence tabs), full Approval Queue,
and Knowledge/Runtime-Health.

**Prior-art reference.** The stranded Director V1's own screenshots are preserved under
[`_prior-director-v1/`](_prior-director-v1/) (`director-home.png`, `director-tablet.png`). Vacilando
**keeps its data model and event contract** (projections, allowlist, SSE) and **replaces its visual
identity** with the warmer system above.

---

## 7. Runtime Architecture (of Vacilando OS itself)

```
Browser SPA (dependency-free)  ──HTTP/SSE──▶  vacilando-server.mjs  (127.0.0.1 only)
   observe · command · orchestrate                │
                                                   ├─ projections/  (read-core / alloy-ro)
                                                   │     read ~/.local/state/alloy-dev/*
                                                   ├─ command allowlist  → alloy-* CLIs / state machines
                                                   ├─ event bus  (director-v1 contract → six-runtime v2)
                                                   ├─ notification adapters (macOS ✓ prototyped, push, email)
                                                   └─ (Phase 2) scheduler · remote gateway (authn, TLS)
```

- **Boundary module** (`vacilando.mjs`, evolving `director.mjs`): deterministic projections + the
  fail-closed command boundary; imported by both server and CLI. *Missions are initiatives; workers/
  decisions/evidence/QA/release are projected from the same records.*
- **Server** (`vacilando-server.mjs`, evolving `director-server.mjs`): loopback HTTP + SSE; static
  SPA; `POST /api/commands` (+ `/preview`); `GET /api/state|missions|events|review-access|providers`.
- **Read path**: strictly through the Shared Read Core / `alloy-ro` — the UI cannot see a secret and
  cannot disagree with the CLI. *Prereq work:* promote `health/status/decisions` into `alloy-ro`.
- **Command path**: each UI action → one allowlisted verb → the existing CLI/state machine. No new
  authority is created in the UI; it can only do what the CLI already permits.
- **Event path**: an emitter injects timestamps (projections never read the wall clock) and produces
  replayable, deterministic-id events; adapters (SSE now; WebSocket/push/mobile later) are swappable
  without changing event shapes.
- **Persistence**: none of its own beyond a small event log; all durable truth stays in the toolkit
  state tree.

---

## 8. Phase 1 Implementation Plan — *smallest usable version*

**Goal:** replace "read `alloy-worker-status` + hand-read decision files + run approval commands"
with **one live, loopback pane that observes all six runtimes and executes the human gates.**
Explicitly **observe + approve**, *not* autonomy.

**Guiding cut:** ship the narrowest thing that a Director would open *every day instead of the
terminal.* That is: see the six slots live, see the queue, resolve decisions, approve
contract/plan/QA/promotion — nothing more.

| # | Increment | Scope | Depends on |
|---|---|---|---|
| **P1.0** | **Read-core coverage** | Promote `health`, `worker/agent/dev-status`, `initiative-status`, `product-status`, `product-decisions` into `alloy-ro` (fail-closed, `--json`) | — |
| **P1.1** | **Projection library** | `vacilando.mjs`: re-implement Director projections onto *canonical* state (metadata + manifests + initiatives + runtimes). Missions-are-initiatives. Deterministic, recovery-tolerant. | P1.0 |
| **P1.2** | **Loopback server + SPA shell** | `vacilando-server.mjs` (127.0.0.1, no auto-start) + `apps/vacilando/` shell reusing the Director design system. `GET /api/state`, SSE `/api/events`. | P1.1 |
| **P1.3** | **Command Home + Sprint Board** | Six-runtime status strip; live six-slot board (read from `metadata/*.env`, git, ports); resource meters. **Read-only.** | P1.2 |
| **P1.4** | **Command allowlist (safe subset)** | `sprint.start/pause/resume/finish`, `mission.prioritize` → the existing CLIs, with preview→confirm. Fail-closed. | P1.3 |
| **P1.5** | **Approval Queue** | Unified decision + gate queue; `decision.resolve`, `approve-contract/plan/QA/promotion` via existing commands. | P1.4 |
| **P1.6** | **Certification harness** | `vacilando-certify` in the mold of `alloy-*-certify`: disposable `ALLOY_RUNTIME_ROOT`, fixture ports (391x), assert production state byte-unchanged, loopback-only proof, no push/merge. | P1.4 |

**Phase 1 done = usable when:** Kelly can start/pause/resume a sprint, watch workers live, resolve
decisions, and approve contract→plan→QA→promotion — all from one loopback pane — with the toolkit
state tree provably unchanged except through allowlisted commands, and a green certification run.

**Explicitly *out* of Phase 1:** autonomy/scheduler, notifications, mobile, remote access, headless
provider execution, PR automation. All manual paths remain available and authoritative.

**Effort shape (for planning, not a commitment):** P1.0–P1.2 are the foundation (read coverage +
projection + server); P1.3–P1.5 are UI + commands; P1.6 gates the first real use. Most of this has a
*reference implementation* in the stranded Director — the work is reconciliation, not invention.

---

## 9. Phase 2 Roadmap — *mobile, notifications, automation, remote approvals, autonomy*

Sequenced by dependency and by safety (each step widens reach or authority and must be gated).

1. **Notifications** *(nearest — prototype exists).* Harden the macOS adapter (`notifications.json`
   already shows delivered events) behind the swappable event contract; add gate/failure/QA-ready
   triggers. Foundation for every later "reach" feature.
2. **Automation / scheduler** *(prototype exists in `director.mjs`).* Reintroduce eligibility +
   dependency advance (max-one-active) onto canonical governance — **advance-until-a-gate**, never
   past a human approval. Opt-in per mission queue.
3. **Mobile PWA (approval-first).** A responsive, approval-queue-centric view (the tablet layout
   already exists) so gates can be worked away from the desk. Read-only + approve; no sprint launch.
4. **Remote approvals / gateway.** The one feature that breaks loopback — therefore the most gated:
   authenticated, TLS, least-privilege (approve-only), audited. Explicit design + security review
   before any build. Likely a narrow reverse-tunnel to the loopback server, not a hosted rewrite.
5. **Autonomous execution.** Adopt the Director's headless provider streaming (Claude `-p`,
   session resume, cost/turn accounting) as an *opt-in* execution mode with hard budgets, one-active
   concurrency, and mandatory human gates at QA/promotion. Highest cost/safety surface — last.

**Sequencing rationale:** notifications and scheduler reuse existing prototypes and stay local →
lowest risk, highest daily value. Mobile extends an existing layout. Remote and autonomy each expand
the trust boundary and are deferred behind explicit security review.

---

## 10. Risks, Assumptions, and Open Decisions

### 10.1 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Parallel-model drift** — the UI accretes its own state and diverges from the toolkit | High | Enforce projection-only; all writes via allowlist→CLI; certify state-unchanged |
| R2 | **Stale-prototype trap** — cherry-picking Director V1 reintroduces pre-governance assumptions | High | Treat V1 as reference; re-implement onto canonical read-core + runtime governance |
| R3 | **Remote-access blast radius** — any external interface undermines the loopback guarantee | High | Defer to Phase 2 step 4 behind a dedicated security review; approve-only least privilege |
| R4 | **Autonomy over-reach** — scheduler advances past a gate or burns budget | High | Advance-until-gate only; hard budgets; one-active; human release always required |
| R5 | **Secret exposure through the UI** | High | Read only via Shared Read Core / `alloy-ro`; hard Docker redaction; never render env values |
| R6 | **Namespace confusion** (`agent-*` vs `worker-*`) modeled into the UI | Medium | Resolve vocabulary before UI data model freezes (see D2) |
| R7 | **Cert/fixture leakage into a live control plane** | Medium | First-class fixture isolation; surface `cert-leak-report`; fixture ports 391x |
| R8 | **Single-operator / single-Mac dependency** | Medium | Phase-2 reach features; keep all CLI paths authoritative as fallback |

### 10.2 Assumptions

- A1. The six target runtimes are the intended operating model, and the existing Alloy substrate is
  the system Vacilando surfaces (not a greenfield rewrite).
- A2. Local-first / loopback is acceptable for Phase 1; remote is a later, gated capability.
- A3. Human-in-the-loop at every quality/promotion gate remains a product invariant, not a temporary
  limitation.
- A4. Deliverables live in-repo under `docs/platform/planning/vacilando-os/`; the eventual app lives
  under `scripts/local-dev/apps/vacilando/` alongside the toolkit it operates.

### 10.3 Open Decisions — *require Director approval before engineering*

> These are framed for approval; each carries a recommendation. **No build starts until these are set.**

- **D1 — Product boundary: local control plane vs. hosted product.**
  *Recommendation:* **local-first loopback** control plane; remote as a gated Phase-2 adapter, not a
  hosted rewrite. (Preserves the entire security model; matches the prototype.)
- **D2 — Prototype disposition: revive Director V1 vs. clean re-implement.**
  *Recommendation:* **harvest, don't cherry-pick** — reuse V1's design system, event contract, and
  projection/command *shapes* as the spec; re-implement onto canonical governance (it is 282 commits
  and one whole runtime layer stale).
- **D3 — Autonomy ceiling for Phase 2.**
  *Recommendation:* **advance-until-a-gate**, opt-in per queue, human approval mandatory at QA and
  promotion; no auto-release, ever.
- **D4 — Worker execution model.**
  *Recommendation:* keep **manual paste authoritative** in Phase 1; introduce the Director's
  **headless provider streaming as opt-in** in Phase 2 with hard budgets and one-active concurrency.
- **D5 — Naming & vocabulary.** Confirm "**Vacilando OS**" as the product name and resolve the
  `agent-*`/`worker-*` namespace overload before the UI data model is frozen.
  *Recommendation:* adopt Vacilando OS; standardize on **Mission / Sprint / Worker** as the operator
  vocabulary, mapping legacy command prefixes underneath.
- **D6 — Home for the deliverable & app.**
  *Recommendation:* docs under `docs/platform/planning/vacilando-os/`; app under
  `scripts/local-dev/apps/vacilando/`. Confirm this is where it should live vs. a separate product
  module.

---

## Appendix A — Evidence index

- **Command surface:** 67 `alloy-*` commands catalogued by runtime domain (Project/Sprint/Worker/
  Repository/Approval/Knowledge/Infra).
- **Internals:** 30 `lib/` modules; Shared Read Core constitution; atomic KV/JSON state; `mkdir`
  locks; deterministic slot→port; ownership-proof provider kill guard.
- **Live state inspected (read-only):** `~/.local/state/alloy-dev/{metadata,director,pids,evidence,…}`.
- **Stranded prototype:** branch `agent/claude/2-alloy-director-local-control-plane-v1-t001`, tip
  `417c246de` ("Complete operator-usable Director V1"), forked `09cc004dc` (Jul 15), **282 commits**
  behind `origin/staging` @ `2b554b4b4`. Assets preserved under `_prior-director-v1/`.
- **Governance grounding:** `managed-sprint-operations.md`, `agent-repo-boundaries.md`,
  `RUNTIME-INTENT-ADMISSION.md`, `RUNTIME-ACTUATION.md`, `PRODUCT-RUNTIME.md`, `REVIEW-PIPELINE.md`,
  `VERIFICATION-SECURITY.md`, `AUTONOMOUS-INSPECTION-SURFACE.md`.

*End of package. Prepared as Director deliverable — no engineering performed.*
