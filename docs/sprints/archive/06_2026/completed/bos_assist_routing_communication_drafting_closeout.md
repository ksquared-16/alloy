# BOS Assist Routing + Communication Drafting — Sprint Closeout

**Path:** `docs/sprints/archive/06_2026/completed/bos_assist_routing_communication_drafting_closeout.md`  
**Status:** **COMPLETE** (functionally closed 2026-05-26)  
**Wall-clock span:** 2026-05-21 → 2026-05-26 (fix passes through channel-aware drafting)

**Program parent:** [`../../05_2026/bos_operational_recommendation_intelligence_sprint.md`](../../05_2026/bos_operational_recommendation_intelligence_sprint.md)  
**GATE 0 doctrine:** [`../../05_2026/completed/bos_operational_recommendation_intelligence_gate0.md`](../../05_2026/completed/bos_operational_recommendation_intelligence_gate0.md)

---

## Sprint intent

Stabilize AdminV2 **operational copilot** behavior on the opportunity drawer and command surface:

- deterministic **BOS assist routing** (no NL misroute to wrong specialist)
- useful **operational recommendations** and Review Assist UX
- **communication draft synthesis** separate from internal recommendation copy
- **channel-aware** SMS vs email drafting in the review card
- drawer loading stability and native **Work with BOS** CTA alignment

**Not in scope:** autonomous send, new agent personas, messaging infrastructure (templates/inbox), bounded AI enrich (see Phase 4 planning pack).

---

## Chronology (preserve order)

| When | Pack | Path |
|------|------|------|
| Program Phases 1–2 | Recommendation intelligence + operational UX | [`05_2026/completed/bos_operational_recommendation_phase1_execution.md`](../../05_2026/completed/bos_operational_recommendation_phase1_execution.md), [`phase2_operational_ux.md`](../../05_2026/completed/bos_operational_recommendation_phase2_operational_ux.md) |
| UX refinement + queue/drawer | Work-unit parity, Review Assist placement | [`bos_operational_ux_refinement_pass.md`](./bos_operational_ux_refinement_pass.md) |
| Assist routing fix | Handoff intent + `taskAssistHandoffIntent` | `bos_operational_ux_refinement_pass.md` § Final quality pass; `web/lib/adminV2/bos/bosAssistHandoffRouting.ts` |
| Communication synthesis | Objectives + channel compose | `communicationObjectives.ts`, `communicationDraftChannelCompose.ts`, `generateOperationalDraft.ts` |
| Drawer + CTA polish | Loading doctrine, header action primitive | `AdminEntityDrawer.tsx`, `OpportunityDrawerHeaderActionButton.tsx`, `BosDrawerAssistCta.tsx` |
| Channel UI fix | Per-channel bodies in compact card | `taskAssistChannelDraftBodies.ts`, `TaskAssistCompactDraftCard.tsx` |

**Forward planning (not this sprint):** [`../../future/bos_operational_assist_phase2.md`](../../future/bos_operational_assist_phase2.md); legacy phase packs [`bos_operational_intelligence_phase3_workflow_comms.md`](../../future/bos_operational_intelligence_phase3_workflow_comms.md), [`bos_operational_intelligence_phase4_bounded_ai_enrich.md`](../../future/bos_operational_intelligence_phase4_bounded_ai_enrich.md).

---

## Shipped capabilities (code-grounded)

### Assist routing

| Behavior | Module |
|----------|--------|
| Map recommendation → `draft_message` \| `schedule_message` \| `create_reminder` \| `workflow_assist` | `bosAssistHandoffRouting.ts` |
| Auto-submit uses `taskAssistHandoffIntent` (bypasses NL `parseTaskAssistCommandIntent` misroute) | `AICommandSurfaceShell.tsx`, `bosDrawerAssistHandoff.ts` |
| Queue L0 handoff preview | `queueBosHandoffPreviewFromOperationalRead` |

### Communication drafting

| Layer | Module |
|-------|--------|
| Objectives | `communicationObjectives.ts` |
| Email + SMS compose (separate strategies) | `communicationDraftChannelCompose.ts` |
| Synthesis entry | `communicationDraftSynthesis.ts` |
| Handoff bootstrap | `buildBosAssistHandoffBootstrap` in `bosAssistHandoffRouting.ts` |
| Propose API | `task-assist/propose` + `taskAssistDeterministicProposal.ts` |
| UI channel swap | `taskAssistChannelDraftBodies.ts`, `TaskAssistCompactDraftCard.tsx` |

### Review Assist + drawer

| Behavior | Module |
|----------|--------|
| Review Assist in inquiry right column | `OpportunityInquirySummaryRightColumn.tsx` |
| **Work with BOS** in assist band | `BosDrawerAssistCta.tsx` |
| Native header action chrome | `OpportunityDrawerHeaderActionButton.tsx`, `OpportunityDrawerHeaderActionsPanel.tsx` |
| Structural reveal gating | `opportunityInquiryDrawerShellStructurallyReady`, `AdminEntityDrawer.tsx` |
| Priority explainability | `operationalPriorityExplainability.ts`, queue/drawer chips |

---

## Architectural doctrine (binding for future work)

### Recommendations are not customer communication

| Layer | Audience | Content |
|-------|----------|---------|
| **Operational recommendation** (`OperationalRecommendationV1`, Review Assist rows) | Operator | What to do next, why now, urgency — **internal** |
| **Communication draft** (`synthesized_draft`, propose body) | Family/contact | Outbound SMS/email — **customer-facing** |

Recommendation strings must **never** be pasted into `draft_body` without synthesis.

### Deterministic-first assist

| Concern | Policy |
|---------|--------|
| Routing, workflow authority, operational state, recommendation logic | **Deterministic-first** |
| Wording polish | May use bounded AI later (`attention_enrich`, future draft provider) — **never** auto-apply |

### BOS is operational assistance, not chatbot AI

BOS should read as:

- operational narrator
- guided reviewer
- workflow copilot

BOS must **not** read as:

- open-ended AI chat
- autonomous agent
- recommendation spam feed

Copy guardrails: avoid “Operational proposal”, “Task Assist”, “Using active record” in operator-facing synthesis paths where calmer framing exists.

---

## Verification

| Check | Command / area |
|-------|----------------|
| Communication + routing tests | `web/tests/adminV2/bos/**`, `web/tests/agent/taskAssist/taskAssistChannelDraftBodies.test.tsx` |
| Drawer contracts | `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts` |
| Manual | Work with BOS → message draft; SMS tab shows single-line SMS; Email tab shows paragraphs + signature |

---

## Known limitations (honest)

| Gap | Owner |
|-----|--------|
| Operator display name from email local-part only | Identity / Phase 2 |
| No communication history in draft context | Messaging infrastructure |
| No org tone profiles | Config + future AI provider |
| Task preview chips may hydrate after primary paint | Drawer performance follow-up |
| Phase 3 workflow-native assist / Phase 4 bounded enrich | **Future** — see planning doc |

---

## Closeout checklist

- [x] Deterministic assist routing shipped + tested
- [x] Communication synthesis separate from recommendation copy
- [x] SMS/email channel bodies diverge in synthesis and UI
- [x] Review Assist + drawer stability materially improved
- [x] BOS CTA uses shared header action primitive + panel chrome
- [x] Forward planning doc created — not implemented
- [x] Active topic docs updated

**Sprint closed.** Maintain and harden only; expansion → [`../../future/bos_operational_assist_phase2.md`](../../future/bos_operational_assist_phase2.md).
