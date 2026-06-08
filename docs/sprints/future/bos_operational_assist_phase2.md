# BOS Operational Assist — Phase 2 (Forward Planning)

**Path:** `docs/sprints/future/bos_operational_assist_phase2.md`  
**Status:** **Forward-looking / not implemented**  
**Created:** 2026-05-26

This document captures enhancement opportunities discovered during the **BOS Assist Routing + Communication Drafting** closeout ([`../06_2026/completed/bos_assist_routing_communication_drafting_closeout.md`](../06_2026/completed/bos_assist_routing_communication_drafting_closeout.md)). It is **planning only** — not an active sprint, not approved for implementation.

**Related legacy planning packs (also not implemented):**

- [`bos_operational_intelligence_phase3_workflow_comms.md`](./bos_operational_intelligence_phase3_workflow_comms.md) — workflow-native operational intelligence
- [`bos_operational_intelligence_phase4_bounded_ai_enrich.md`](./bos_operational_intelligence_phase4_bounded_ai_enrich.md) — bounded AI enrich on grounded inputs

---

## Guardrails (all categories)

Maintain across any Phase 2 work:

- **Deterministic governance** for routing, authority, and operational state
- **Review-first** — no autonomous send
- **No chatbot UX** — calm operational surfaces, not conversational AI
- **No fake intelligence** — no opaque scores, hallucinated facts, or autonomous operations

---

## A. Communication intelligence enhancements

Potential future work:

| Theme | Notes |
|-------|--------|
| AI-assisted bounded draft synthesis provider | Optional provider behind `generateOperationalDraft`; org policy + human review; **not** auto-send |
| Richer contextual grounding | Thread history, last outbound/inbound, tour state — only when data exists |
| Organization tone profiles | Tenant-configured voice; still deterministic-first defaults |
| Role/campus-specific signatures | Canonical operator + site/department signatures (not email local-part) |
| Channel-specific SMS optimization | Further length, segment, and compliance tuning |
| Multilingual drafting | Locale-aware templates + policy |
| Communication history awareness | Requires messaging read APIs — see § B |
| Operator draft personalization | Per-operator defaults and saved phrasing preferences |
| Escalation-aware messaging | Tie recommendation severity to draft tone constraints |
| Parent portal continuity | Align family-facing copy with portal surfaces when product exists |

**Boundary:** BOS cognition proposes and explains; **messaging infrastructure** sends, stores threads, and manages preferences.

---

## B. Messaging infrastructure enhancements

Belongs to a **future Messaging sprint**, not BOS cognition expansion:

| Theme | Notes |
|-------|--------|
| Multi-recipient orchestration | CC/BCC, household-aware recipient sets |
| Recipient selection UX | Stronger defaults, validation, channel eligibility |
| Communication templates | Org-level reusable templates |
| Saved drafts | Persist operator edits beyond ephemeral propose |
| Draft history | Audit trail of proposed/sent variants |
| Scheduled send management | Ops UI beyond Task Assist card |
| Inbox/thread awareness | Entity-scoped thread context in assist (not global inbox) |
| Signature management | Org/operator signatures in Settings |
| Communication preferences | Opt-out, quiet hours, channel prefs |
| Campaign separation | Marketing vs operational message classes |

Clarify for roadmap readers: **Task Assist today** uses canonical enqueue after approval; Phase 2 messaging work **extends platform plumbing**, not Orchestrator routing logic.

---

## C. Operational intelligence improvements

Potential future work:

| Theme | Notes |
|-------|--------|
| Richer recommendation differentiation | More distinct action families without catalog spam |
| Communication inactivity intelligence | Grounded “no reply since …” signals |
| Lifecycle-sensitive urgency | Stage-aware urgency, not one global stale rule |
| Workload-aware prioritization | Operator capacity signals (careful — no surveillance tone) |
| Staffing-aware recommendations | Site/dept coverage hints when configured |
| SLA policy configurability | Tenant-defined thresholds |
| Explanation refinement | Shorter, more scannable Review Assist rows |
| Recommendation confidence semantics | Explicit “grounded” vs “inferred” labels |
| Recommendation grouping | Cluster related actions on one record |
| Timeline/context awareness | Activity stream integration in assist band |

Avoid: fake scores, black-box ranking explanations, autonomous queue reorder.

---

## D. Queue + drawer assist evolution

Potential future work:

| Theme | Notes |
|-------|--------|
| Richer queue handoff payloads | More than `doNext` / `whyNow` L0 preview |
| Lightweight contextual previews | Hover/expand without full drawer open |
| Queue-aware communication drafting | Objective hints from queue sort/filters |
| Action clustering | Related recommendations presented as one decision |
| Workflow-native assist launches | Deep links into Workflow Assist with context |
| Operational timeline integration | Assist band shows recent events |
| Recommendation persistence | Cross-session continuity of dismissed/accepted guidance |
| Assist continuity between surfaces | Queue → drawer → command bar same context |

Maintain: calm UX, deterministic-first, no giant AI surfaces.

---

## E. Identity + personalization

Potential future work:

| Theme | Notes |
|-------|--------|
| Canonical operator display names | `app_users` / person link — not email local-part |
| Org-level signatures | Default sign-off blocks |
| Department/campus signatures | Site-specific outbound identity |
| Role-aware messaging voice | Director vs front-desk tone presets |
| Staff identity normalization | Single display name across drawer, drafts, audit |
| Operator preferences | Default channel, greeting style |
| Communication defaults | Per-org SMS/email norms |

---

## F. Drawer/runtime performance doctrine follow-up

The May 2026 closeout **stabilized major UX issues**; further optimization remains optional:

| Theme | Notes |
|-------|--------|
| Fully coordinated drawer prefetching | Header actions + Review Assist + primary in one wave |
| Shell prewarming | Reduce perceived open latency |
| Background hydration strategies | Secondary intelligence after stable paint |
| Drawer cache contracts | Session-scoped entity snapshots |
| Stable layout orchestration | Fewer intersection-gated layout flips |
| Deferred secondary intelligence | Task/activity blocks after shell contract |
| Render-path audits | Periodic regression on inquiry summary grid |

See also: [`../05_2026/completed/adminv2_performance_closeout.md`](../05_2026/completed/adminv2_performance_closeout.md).

---

## Suggested sequencing (roadmap input)

| Priority | Track | Rationale |
|----------|-------|-----------|
| 1 | Operational completion (forms, waitlist, tours) | Per [`../../execution/roadmap-and-gaps.md`](../../execution/roadmap-and-gaps.md) |
| 2 | Messaging infrastructure (§ B) | Unlocks history, templates, signatures for better drafts |
| 3 | Identity + personalization (§ E) | Quick operator trust win |
| 4 | Communication intelligence provider (§ A, bounded) | After messaging + identity |
| 5 | Operational intelligence depth (§ C) | Incremental catalog/rules — avoid big-bang “AI” |
| 6 | Queue/drawer evolution (§ D) | Builds on stable Phase 1 UX |
| 7 | Drawer performance (§ F) | Continuous hardening |
| 8 | Workflow-native + bounded enrich | Legacy phase 3/4 packs — only when pilots justify |

**BOS expansion remains paused** as a default execution lane; items above are **candidate** work, not committed sprints.
