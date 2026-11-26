---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 02 — Target Operator Experience

## Product realization (Horizon 1)

```text
Actions → Create Lead → BOS conversational command experience
                              ├─ Conversation
                              └─ Form
```

Both modes share one command, one draft, one preview, one confirmation, one execute path, one audit path, one success contract.

---

## 1. Surface ownership

| Question | Decision |
|---|---|
| Where does Create Lead open? | Existing **persistent BOS** (`CommandRailBosMount` / `AICommandSurfaceShell`). If closed → open floating (default) or pinned. Immediate acknowledgement turn: “Starting Create Lead.” |
| Expand into panel? | Yes — command-session mode expands the BOS body (conversation + draft/review regions). Prefer pinned when Form needs width. |
| Overlay vs workspace? | Reuse BOS presentation states (closed / floating / pinned). **No new shell.** |
| Focus Panel interaction? | Before lead exists: no subject Focus Panel. After commit: success offers **Open Lead** (explicit); does not auto-steal focus. Actions remain on Work Unit / Focus Panel chrome independently of BOS geometry. |
| No subject yet? | Command session is subjectless; draft holds provisional people/children. |
| From Work Unit Actions? | Same BOS session; invocation carries `work_unit_id` + placement `work_unit_actions`. |
| From Workspace Actions? | Same; placement `workspace_actions_menu` / right rail. |
| From slash (H2)? | Resolves registered capability → same session factory. |
| Prior conversation? | Command session is **scoped**. Starting Create Lead isolates a command thread segment; general Orchestrator turns remain in ambient transcript. Session can be collapsed after success. |
| One session per command? | Yes. `BosCommandSession` id per invocation. Re-invoking Create Lead while one is open focuses the open session (no silent duplicate). |

### Immediate click response

1. Action click → BOS opens/focuses within one frame.
2. System turn: “Create Lead — Conversation or Form.”
3. No blank modal flash; deprecate modal as primary entry over Phase 5.

---

## 2. Conversation and Form switching

| Topic | Spec |
|---|---|
| Default mode | **Conversation** |
| How Form is offered | Persistent toggle in command-session header: Conversation \| Form. Also offered after first parse if many fields still missing. |
| Switch anytime? | Yes, until execute starts. During Processing review, Form is read-only summary + link into identity review (Processing owns that phase). |
| Shared state | One `BosCommandDraft`. Mode is a projection, not a second store. |
| Form → Conversation | Conversation summary turn reflects current draft values (“Here’s what we have…”) with evidence labels. |
| Conversation → Form | Form fields hydrate from draft; inferred/parsed marked. |
| Operator edits | Replace inference; evidence → `operator_entered` / `confirmed`. |
| Clear value | Sets missing; removes evidence; required blockers reappear. |
| Multi parent/child | Same household model as today (`CreateLeadCommitSelection`). Conversation may ask follow-ups; Form shows repeaters. |
| Form placement | **Inline inside expanded BOS panel** using existing intake field components. Minimum usable width: pinned rail ≥ ~420px or temporary widen; below that, stack and prefer Conversation. |
| Responsive | Follow Adaptive Workspace assistant-region rules; do not invent a second responsive system. |

---

## 3. Information states (operator-visible)

Prefer calm language + evidence chips. **No confidence percentages** in operator UI.

| State | Operator language | Visual |
|---|---|---|
| `confirmed` | Confirmed | Solid / check |
| `operator_entered` | Entered by you | Neutral filled |
| `parsed_from_source` | From your note/email | Soft evidence |
| `inferred` | Suggested | Dashed / “Suggested” |
| `unresolved` | Needs review | Amber |
| `ambiguous` | More than one match | Amber + choices |
| `conflicting` | Conflict | Red + explanation |
| `invalid` | Can’t use this value | Red inline |
| `missing_optional` | Optional | Quiet placeholder |
| `missing_required` | Still needed | Required marker |

---

## 4. Preview and confirmation

Before registered execute, operator sees a structured preview:

- What will be prepared for Processing (parents, children, household)
- Which existing identities may link (candidates summarized; final identity authority remains Processing)
- Campus / program / room / schedule requests
- Extra captured facts / notes (preserved even if not required)
- Warnings / unresolved optional fields
- Process / stage / work unit destination
- Side effects: “Opens Processing review — records are created only after you approve and commit.”

Confirm CTA: **Continue to Processing review** (not “Create forever” language that implies instant records).

---

## 5. Success experience

Honor current Create Lead success doctrine:

- After Processing **commit**: created lead summary via `buildCreateLeadSuccess`.
- **Do not auto-open** the lead.
- Explicit **Open Lead** action → Focus Panel Work mode.
- Refresh: opportunity + work unit queue/pill counts (`dispatchOpportunityQueueUpdated`).
- BOS retains a success turn in transcript; command session collapses to completed state.
- Follow-up offers (optional): Schedule tour / Send message — only if authorized placements exist (H2 wiring later; V1 may show static “What’s next” text without inventing commands).
- Duplicate confirm: idempotent Processing case reuse; no second household.

---

## 6. Failure and recovery

| Failure | Operator experience | Recovery |
|---|---|---|
| Parser failure | “I couldn’t read that. Try Form or paste again.” | Draft preserved |
| Invalid mapping | Field-level invalid state | Edit in either mode |
| Stale config | “Create Lead isn’t configured for this process/location.” | Fix config; session stays |
| Unauthorized | Capability hidden; if forced, server 403 | Close session |
| Identity ambiguity | Surfaced in Processing review (authoritative) | Standard Processing decisions |
| Command blocked | Blockers list from eligibility | Supply missing inputs |
| Required missing | Conversation asks only for required gaps | Or switch to Form |
| Processing plan stale | Existing Processing UX | Rebuild plan |
| Server error | Failure turn + Retry | Same draft / same idempotency key |
| Duplicate submit | Idempotent case reuse | Continue existing case |
| Lost connection | Retry with preserved draft | |
| Close and return | Same-tab `sessionStorage` restores unfinished session | |
| Config changes mid-session | Revalidate on preview/execute; show delta | |

---

## Horizons 2–3 (experience only; not V1 build)

### Slash menu (`/`)

- Opens searchable catalog of **registered + authorized** commands for current workspace/subject/placement.
- Selecting `/create lead` starts the same command session factory.
- No hardcoded aliases disconnected from the registry.

### Daily briefing

- Morning message in ambient BOS transcript (not inside an open command session).
- Priorities from canonical projections / MetricEngine / OIP — never LLM-invented metrics.
- Recommendation CTAs launch registered command sessions.
- Explicit frequency, scope, recency, dismiss/read behavior (see `09`).
