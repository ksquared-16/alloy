# Director Conversations V1 — Engineering Closeout

**Status:** BUILT · browser-certified end-to-end · nothing pushed/merged/promoted.
**Branch:** `agent/claude/6-vacilando-os-product-def` · worktree `wt6-vacilando-os-product-def` · server :3020.
**Builds on:** Director Experience V1. This sprint added no new preparation intelligence — it turned the workspace into **one living conversation**.

Delivered: the operator no longer thinks "I'm creating a mission." They think "I'm talking with Director about a piece of work." The architecture disappears behind the conversation.

---

## 1. Experience audit (where it felt like records)

Before, the Director workspace was CRUD-shaped: a **"Missions · N" grid of cards** titled "… Implementation Proposal", a **"Mission package"** panel, a **"Prepare"** button, **"prepared again"** toasts, and a mission chip-list. The operator was *managing records*, not collaborating.

## 2. New conversation model

A conversation is **not a new record** — it is the mission re-told as a dialogue, `assembleConversation()` building a transcript + insights deterministically from durable facts already on disk (intent, product decisions, package versions, verdict, lifecycle). No separate chat store → reproducible and always in sync. Endpoints: `GET /api/director/conversations` (inbox), `GET /api/director/conversation?id` (full thread).

## 3. Conversation workspace

Selecting a conversation opens a three-column, **one-window** workspace:
- **Left — Conversation:** the dialogue as chat bubbles (Director left, you right) + a **reply composer**.
- **Center — Where things stand:** the vertical preparation timeline + "What Director prepared" (goal, deliverables, how-we'll-know-it's-done, decisions, risks).
- **Right — Director's read:** *What we're doing · What Director knows · What Director still needs.*
The operator always knows the goal, what Director has, and what it needs.

## 4. Timeline redesign (the narrative)

The transcript reads like a story from real facts:
> You: *Improve Onboarding* → Director: *I found Onboarding.* → *I pulled together a first draft of the package.* → You: *Onboarding is a guided checklist…* → Director: *I updated the package — needs product decisions → ready.* → *Everything I need is in place. Ready for your review.*

## 5. Living package

The package is no longer a static artifact the operator "generates." Every reply that shapes the work is recorded as a product decision and **Director updates the package** — the version climbs (v1 → v2) with a diff, narrated in the thread ("I updated the package — Needs Product Decisions → Ready"). Version history remains in the lineage.

## 6. Director language audit

De-CRUD'd throughout: *Prepare → Start*, *Mission package → What Director prepared*, *prepared again → Director updated the package*, *missions → conversations*, *"Couldn't prepare" → "Director is on it"*. Director speaks in the first person ("I found…", "I still need…", "Everything I need is in place"). Leaks removed: no "this **mission**" in readiness copy; no "defined from operator intent" echo; deliverable path uses the **capability slug** (not the raw `cap_…` id); empty `()`/`[]` dropped from the objective.

## 7. First-time operator findings (Phase 9)

Assessed as someone who has never seen Vacilando, asked to "Improve Scheduling":
| Could they understand… | Result |
|---|---|
| What Director is doing | ✅ the transcript narrates it in plain language |
| Why Director is waiting | ✅ "Director doesn't yet have the product decisions this work depends on" + "What Director still needs" |
| What they need to do | ✅ the reply composer invites a decision |
| How to continue | ✅ reply → "Director updated the package" |
| How to send work | ✅ "Approve & Send to Worker" appears only when Ready |
An unknown capability no longer dead-ends: **"Director hasn't worked on X before — Start it anyway."**

## 8. Before/after

- **Before:** "Missions · 13" grid of "… Implementation Proposal" cards; a mission detail with a "Mission package" panel and "Prepare again".
- **After:** "What are we working on?" → a **conversation inbox** (Retention · *Needs Product Decisions · Continue →*, Reporting · *Ready for review · Review →*) → a three-column **conversation workspace** with a live dialogue.
Screenshots captured in the session (host calm windows).

## 9. Remaining UX gaps

1. **Reply is single-purpose.** A reply is always recorded as a *product decision*; free-form questions/clarifications to Director aren't yet distinguished. Next: classify replies (decision vs question) — questions could annotate the conversation without a recompile.
2. **Other blockers still route through decisions.** Needs References / Acceptance Criteria don't yet have dedicated in-conversation resolutions (Knowledge/Acceptance editors — carried from Experience V1).
3. **No true persisted operator prose.** The transcript is derived; a genuinely free-form operator note isn't stored (a lightweight conversation-events log would add that without breaking reproducibility).
4. **Run-target still defaults to slot 6** — surface "will run in <worktree>" at approval.
5. The legacy worker "Mission" tab still carries the old runtime copy ("the Mission Compiler assembles a Mission Package"); the Director workspace supersedes it, but that surface wasn't cleaned this sprint.

## 10. Recommendation for Director Conversations V2

1. **Two-way replies** — let the operator ask Director a question, and have Director answer inline (deterministic answers from the gap report / knowledge snapshot; provider-backed later behind the existing seam).
2. **In-conversation resolutions for every blocker** — a decision, a reference, a criterion — each resolvable from the thread, each narrated as "Director updated the package."
3. **Persisted conversation events** (append-only) layered over the derived narrative, so operator prose and Director's own questions survive verbatim.
4. **Execution in the thread** — once sent, the worker's progress and acceptance appear as continued messages ("I've started.", "I hit a question.", "Done — here's what changed.").
5. **Retire the legacy Mission tab** in favor of the conversation workspace.

---

## Verification

- `node --test scripts/local-dev/tests/mission-runtime.test.mjs` → **22/22**.
- Browser-certified on :3020: conversation inbox with mixed states; opened Onboarding; **replied to Director → package updated to v2 → Ready** (narrated in the thread; "Director's read" → "Nothing — ready for your review"). Zero console errors.

## Commits (this arc)

`0d465eeb9` Director Conversations V1 (conversation model, inbox, three-column workspace, reply loop, language + leak fixes).

## Governance (held)

Loopback only · fixed executables · `shell:false` · **nothing pushed/merged/promoted**. "Approve & Send to Worker" runs the existing governed start (preview → confirm); no provider turn executed during certification.
