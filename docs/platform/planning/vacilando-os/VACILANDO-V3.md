---
owner: platform
status: proposed
last_reviewed: 2026-08-05
audience: product · design · Director · implementation missions
version: Vacilando V3
constraint: architecture + implementation plan only — do not begin UI coding until this plan is accepted; do not redesign workers, execution, certification, confidence, or mission engines
replaces_as_product_center: docs/platform/planning/vacilando-os/DIRECTOR-EXPERIENCE-V2.md
prior_names: Project Runtime (draft) · Conversation Operating System (draft)
---

# Vacilando V3 — Workspace Runtime

**Complete architecture and implementation plan.** Not a Director Experience sprint. Not a dashboard redesign. A product architecture migration.

**Do not begin coding until this plan is accepted.** After acceptance, propose incremental implementation slices only.

**DX-1…DX-8:** Proven capability. Recompose. Do not discard.

**Engines unchanged:** Workers · execution · certification · confidence · mission compile/dispatch.

---

## 0. Product philosophy

### 0.1 Law of three primitives

Every piece of information in Vacilando must justify itself as **exactly one** of:

| Primitive | Question it answers |
|---|---|
| **Conversation message** | What happened / was said / was decided / was proven in the thread? |
| **Context object** | What is the machine / Current State right now? |
| **Portfolio summary** | Which workspaces need attention? (and Command Center: what actions now?) |

If it cannot justify existing outside those primitives, **it belongs inside the conversation**.

Do not invent additional primary surfaces.

### 0.2 What Vacilando is not

Do **not** recreate Slack, Teams, or Discord. Those are communication systems.

Vacilando is a **conversation operating system**. Every message has operational meaning. Messages become history, evidence, documentation, reviews, approvals, implementation, and certification — automatically — by attachment and kind, not by visiting other apps.

### 0.3 Inversion

| Before | After |
|---|---|
| Mission Control / Mission Dashboard | **Workspace Runtime** |
| Finite “missions” as primary nav | **Long-lived workspaces** |
| Cards and pages | **Messages + thin context** |
| ChatGPT as possible peer | **ChatGPT external only** |
| Pinned metadata summary | **Current State** (conversational context) |
| Reread hundreds of messages | **Context Compression** (deterministic) |

### 0.4 Daily truth

```
Kelly → ChatGPT (external) → Claude → Cursor → Kelly → …
  → Evidence → Implementation → PR → Merge → Continue
```

That flow is **one workspace conversation**. The dashboard was a reconstruction of the thread.

### 0.5 Success

Kelly runs the company almost entirely through workspace conversations. Dashboards are gone as primary UI. Context rail, Portfolio, and Command Center are thin support.

---

## 1. Architecture

### 1.1 Primary runtime — three regions only

```
┌─────────────────┬────────────────────────────────────┬────────────┐
│ Workspaces      │ Conversation                       │ Context    │
│ (~20%)          │ (~70%)                             │ (~10%)     │
│                 │                                    │            │
│ Identity        │  [Current State]                   │ state      │
│ Communications  │  message stream                    │ worker     │
│ Trust           │  inline artifacts                  │ branch     │
│ Runtime         │                                    │ PR         │
│ …               │                                    │ actions    │
│                 ├────────────────────────────────────┤            │
│ Portfolio       │ Composer                           │            │
│ Command Center  │                                    │            │
└─────────────────┴────────────────────────────────────┴────────────┘
```

Nothing else is primary.

### 1.2 Runtime binding (reuse engines)

```
Workspace (product)  ↔  Mission / slot effort (engine)
Conversation         ↔  Durable thread for that workspace
Message              ↔  Projection of events + human/director/worker turns
Artifact             ↔  Existing evidence / files / PRs attached to messages
Current State        ↔  Deterministic projection of posture + continuation
Context Compression  ↔  Deterministic delta since last visit (new capability)
```

Workers still run on slots. Certification and confidence still compute as today. V3 changes **composition and interaction**, not authority.

### 1.3 System diagram (logical)

```
                    ┌──────────────┐
                    │   Portfolio  │  attention summaries
                    │ Command Ctr  │  cross-workspace actions
                    └──────┬───────┘
                           │ open / act
                           ▼
┌──────────┐    ┌─────────────────────┐    ┌─────────────┐
│Workspace │───▶│ Conversation Runtime│◀───│ Context Rail│
│  nav     │    │ messages + composer │    │ + Current   │
└──────────┘    └──────────┬──────────┘    │   State     │
                           │               └──────▲──────┘
                           │ project / attach      │ project
                           ▼                       │
                    ┌──────────────────┐
                    │ Existing engines │
                    │ missions·workers │
                    │ evidence·cert    │
                    │ posture·labels   │
                    └──────────────────┘
```

---

## 2. Information architecture

### 2.1 Left — Workspaces (~20%)

Long-lived workspaces (not finite projects), e.g.:

Identity · Communications · Trust · Runtime · Processing · Director Experience · Attendance · Billing · …

**Opening a workspace immediately opens its conversation.**

Secondary entries (not work homes): Portfolio · Command Center · Settings · History (archived).

### 2.2 Center — Conversation (~70%)

Primary runtime. ChatGPT-like thread + composer. Structured messages with operational meaning.

### 2.3 Right — Context (~10%)

Current State (or jump to it) · Worker · Branch · Server · PR · Evidence jump · Files · Settings · Actions.

No dashboard. No journey board. No evidence library.

### 2.4 Removed as primary destinations

Mission Dashboard · Workers home · Evidence page · Confidence page · Collaboration notes UI · Journey-as-page · Needs You as a separate product (→ Portfolio badges).

---

## 3. Conversation runtime

### 3.1 Behavior

- One durable conversation per workspace for its life.  
- Continuations = new messages / phases in the **same** workspace — never a new workspace by default.  
- Participants post turns; artifacts attach; actions appear on messages.  
- Expand screenshots / docs / cert briefings **inline**.

### 3.2 Composer

Bottom. ChatGPT parity. Natural language only. No special forms. No modal workflow as the default path.

Kelly speaks → Director interprets (existing counsel paths) → Claude/Cursor continue via existing dispatch.

### 3.3 Operational meaning of messages

Message kinds carry work automatically:

| Kind | Becomes |
|---|---|
| `human` | Intent / decision / imported ChatGPT conclusion |
| `director_counsel` / `director_decision` | Counsel / approvals requested |
| `worker_update` | Implementation / discovery progress |
| `evidence_bundle` / screenshots | Proof |
| `document` | Architecture / proposals |
| `certification` | Deliverable cert briefing |
| `approval_result` | What Kelly chose |
| `system` | Lifecycle facts (muted) |
| `state_compression` | Output of Summarize Current State (see §9) |

---

## 4. Workspace model

```
Workspace {
  workspaceId
  title                 // Director display name (renameable)
  missionId | slotId    // engine binding
  conversationId
  createdAt, updatedAt
  archived
  lastVisitedAt         // for Context Compression
}
```

| Property | Rule |
|---|---|
| Lifetime | Ongoing — not a finite ticket |
| Nav unit | Workspace |
| Binding | Existing mission/slot (slot-as-mission) |
| Rename | Display title only; toolkit key underneath |
| Continuity | Same conversation forever (until archive) |

---

## 5. Participant model

| Participant | Runtime? | Role |
|---|---|---|
| Kelly | Yes | Composer · final decisions |
| Director | Yes | Counsel in thread · never owns the decision |
| Claude | Yes | Worker updates + artifacts |
| Cursor | Yes | Worker updates + artifacts |
| System | Yes | Quiet facts |
| Future providers | Yes | Same worker contract |
| **ChatGPT** | **No** | External executive thinking only |

Kelly intentionally brings important ChatGPT conclusions into the workspace as `human` messages. Vacilando records the decision. It does **not** synchronize ChatGPT.

---

## 6. Message model

```
Message {
  messageId
  workspaceId
  from
  kind
  body                  // text + optional structured blocks
  createdAt
  artifacts[]
  actions[]             // existing action kinds only
  metadata?             // e.g. confidence band
  replyToMessageId?
}
```

---

## 7. Context model

**Context objects** are the only non-message, non-portfolio facts shown by default.

```
ContextSnapshot {
  workspaceId
  currentState          // §8
  worker { provider, health, slot }
  branch, worktree
  server { port, status }
  pr { url, state }?
  evidenceJump { latestMessageId, count }
  files[]               // recent artifact refs → source messages
  actions { primary, secondary }
  advanced?             // confidence factors, usage, ids — collapsed
}
```

Rail renders `ContextSnapshot`. It must stay ~10%. Narrative belongs in messages.

---

## 8. Current State model

Replaces “pinned summary / metadata card.” **Current State is conversational context** — orientation for the Director, derived deterministically.

### 8.1 Fields

| Field | Example | Source (existing) |
|---|---|---|
| Workspace title | Identity | Display name |
| Working on | Authentication | Goal / continuation / brief |
| Current phase | Implementation Wave 3 | Posture / phase |
| Last completed | Role Model | Latest accepted deliverable / milestone |
| Blocked by | Nothing | Blocker or none |
| Next expected checkpoint | Browser Certification | Checkpoint / continuation |
| Recommendation | Continue Implementation | DX-5.5 recommended next |

### 8.2 Placement

Sticky region at top of conversation **and/or** first section of Context rail (same object — one source). Prefer conversation-top so it reads as part of the thread chrome, not a dashboard widget.

### 8.3 DX map

Executive Overview (DX-1) + Continuation recommendation (DX-5.5) → **Current State**.

---

## 9. Context Compression model (only major new capability)

### 9.1 Intent

Kelly never has to read hundreds of messages to regain context.

**Summarize Current State** is **not** an LLM chat summary. It is **deterministic context compression**.

### 9.2 Trigger

- Explicit action: “Summarize Current State”  
- Optional auto-offer when `now - lastVisitedAt` exceeds a threshold and unread/worker activity exists  

### 9.3 Inputs (deterministic)

- Messages since `lastVisitedAt` (kinds, counts, actors)  
- Artifacts attached since then  
- Posture / blocker / recommendation now vs at last visit  
- Open decisions / cert messages still needing Kelly  
- Completed assignments / milestones since last visit  

### 9.4 Output shape (fixed schema → `state_compression` message)

Must answer:

1. What changed since my last visit?  
2. Current work  
3. Completed work  
4. Remaining blockers  
5. Next recommendation  
6. Expected checkpoint  

Example body (structured, not free-prose LLM):

```
Since your last visit (Tue 2:14p)

Changed
· Cursor posted implementation + 3 screenshots
· PR opened
· Director recommended Continue

Current work
· Authentication — Implementation Wave 3

Completed
· Role Model

Blocked by
· Nothing

Next recommendation
· Continue Implementation

Expected checkpoint
· Browser Certification
```

### 9.5 Rules

- No generative storytelling required for V1. Template + facts from engines/messages.  
- Optional later: LLM polish **on top of** the same structured facts — never instead of them.  
- Compression message is pinned or inserted at read-cursor; does not delete history.

---

## 10. Artifact & evidence model

Evidence is never a destination. Attachments on messages:

```
Claude
Implementation complete.
[Browser certification] [Screenshots ×3] [Architecture.md] [PR]
```

Expand inline. DX-5 becomes the expander, not a gallery home. Documentation same pattern.

---

## 11. Portfolio

**Workspace attention summary** (portfolio summary primitive).

Answers exactly one question: **Which workspaces need my attention?**

- Rows = workspaces  
- Badges = Needs you / Blocked / etc.  
- CTA = **Open Workspace** → conversation  
- DX-7 counts/focus remain as aggregation only  

Nothing more.

---

## 12. Command Center

**Cross-workspace action center.**

Answers exactly one question: **What actions can I perform?**

Approve · Merge · Review · Continue · Open Workspace  
(+ existing action kinds only)

Act → confirm → write `approval_result` into the workspace conversation, or open workspace at the actionable message.

DX-8 lanes remain; CTAs rewired.

---

## 13. DX recomposition map

| Built capability | V3 home |
|---|---|
| Executive Overview | **Current State** |
| Mission Journey | **Conversation history** |
| Evidence | **Inline attachments** |
| Confidence | **Message metadata** (+ rail Advanced) |
| Continuation | **Conversation actions** |
| Collaboration | **Conversation** |
| Portfolio | **Workspace summary** (attention) |
| Command Center | **Cross-workspace action center** |
| Mission Dashboard | **Removed** |
| Slot-as-mission + rename | Workspace titles |

---

## 14. Migration strategy

### 14.1 Principles

1. Recompose DX — do not rewrite engines.  
2. Default entry becomes Workspace Runtime.  
3. Legacy dashboard behind flag during migration.  
4. Every old page must pass the three-primitives test or die as primary.

### 14.2 Compatibility

| Old route / surface | Migration |
|---|---|
| `/#/missions` dashboard home | → Workspace Runtime or Portfolio |
| Mission detail dashboard | → Workspace conversation |
| Evidence / Confidence / Workers tabs | → Inline / metadata / rail |
| Collaboration UI | → Director/Kelly messages |
| `?legacy=1` | Temporary engineer escape hatch |

### 14.3 Data

- No new source of truth for evidence/cert/posture.  
- New: `lastVisitedAt`, compression messages, message projection index if needed for performance.  
- Workspace titles = existing mission labels.

---

## 15. Wireframes

### 15.1 Shell

§1.1 — Workspaces / Conversation / Context.

### 15.2 Current State + thread

```
[Current State — Identity]
Working on Authentication · Phase Implementation Wave 3
Last completed Role Model · Blocked by Nothing
Next Browser Certification · Recommend Continue Implementation

Claude · Implementation complete. [shots] [cert] [Architecture.md] [PR]

Kelly · Can we simplify the role editor?

Director · Approved. Proceed.  [Continue Implementation]

Cursor · Implemented. Evidence attached.
```

### 15.3 Context Compression insert

After “Summarize Current State”, a `state_compression` message appears (or replaces the orientation strip temporarily) with the fixed schema in §9.4.

---

## 16. Interaction model

1. Land: Portfolio if Needs you; else last workspace.  
2. Open workspace → conversation + Current State.  
3. If stale visit → offer **Summarize Current State**.  
4. Read latest turns; expand proof inline.  
5. Reply in composer or press conversation action.  
6. Rail only for machine facts / secondary actions.  
7. Import ChatGPT conclusions as Kelly messages when needed.  

### Anti-patterns

- Landing on a dashboard  
- Extra primary surfaces beyond the three primitives  
- LLM-only “summarize this chat” without structured facts  
- ChatGPT as a participant  
- Expanding Context rail into a board  
- Recreating Slack channels without operational message kinds  

---

## 17. Incremental rollout (implementation slices — after accept)

**Coding starts only after architecture acceptance.**

| Slice | Name | Delivers | Depends |
|---|---|---|---|
| **V3-0** | Accept plan | This document locked | — |
| **V3-1** | Workspace Runtime shell | 20/70/10 chrome; workspace nav; empty thread; thin rail | V3-0 |
| **V3-2** | Message projection | Timeline/decisions/assignments → messages | V3-1 |
| **V3-3** | Current State | Deterministic orientation object | V3-2 |
| **V3-4** | Inline artifacts | Evidence/screenshots/docs/PR expanders | V3-2 |
| **V3-5** | Conversation actions | Continue/decide/certify in thread | V3-3, V3-4 |
| **V3-6** | Context Compression | Summarize Current State (deterministic) | V3-3 |
| **V3-7** | Portfolio / CC rewire | Open Workspace; narrowed copy | V3-5 |
| **V3-8** | IA cleanup | Remove primary dashboard tabs | V3-7 |
| **V3-9** | Composer → Director | Counsel routing | V3-5 |
| **V3-10** | Polish | Unread, lastVisitedAt, rename, jump-to-message | V3-6+ |

**First coding proposal after accept:** V3-1 → V3-2 → V3-3 (shell, projection, Current State). Context Compression (V3-6) follows once messages exist.

Each slice: presentation/projection tests; no engine redesign; Mac app checkout remains the V3 worktree when shipping shell.

---

## 18. Acceptance criteria

1. Only three primary information primitives in product law.  
2. Opening a workspace opens its conversation immediately.  
3. Layout is conversation-first (~70% center).  
4. Current State orients without rereading the full thread.  
5. Context Compression answers the six fixed questions deterministically.  
6. Evidence/docs are inline — never primary destinations.  
7. ChatGPT is not a runtime participant.  
8. Portfolio / Command Center answer only their one question each.  
9. Mission Dashboard is not the default product.  
10. DX-1…DX-8 capabilities remain available via recomposition.  
11. Workers, certification, confidence, mission engines unchanged.  
12. Vacilando does not feel like Slack/Teams/Discord.

---

## 19. Open items for Kelly (non-blocking)

1. Auto-offer Context Compression after N hours away — threshold preference?  
2. Current State sticky in thread vs rail-first — recommend **thread-top + rail mirror**.  
3. Workspace list order — attention-first vs alphabetical vs manual?

---

## 20. Document map

| Doc | Role |
|---|---|
| **This file** | Vacilando V3 architecture + implementation plan (canonical) |
| `DIRECTOR-EXPERIENCE-V2.md` | Supporting capability reference |
| `CONVERSATION-OPERATING-SYSTEM.md` | Historical draft |
| Slot-as-mission | Workspace title binding |

---

*Vacilando V3 — conversation operating system. Three primitives. Workspaces. Current State. Deterministic Context Compression. Recompose DX. Do not code until accepted.*
