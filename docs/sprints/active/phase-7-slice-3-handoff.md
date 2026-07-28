---
owner: platform
status: handoff
for_slice: 3
last_reviewed: 2026-07-25
---

# Phase 7 — Slice 3 Handoff (Participant Conversation Runtime)

Slice 1 (document → reviewed published form incl. governed OCR) and Slice 2 (packet composition +
requirement responsibility) are **complete and certified**. This is the handoff for the next session.

## Worktree / branch
- Worktree: `wt1-phase7-document-packet-journey` (managed slot 1, port 3011 — server currently STOPPED; restart with `alloy-dev-start wt1-phase7-document-packet-journey`, auth via the Playwright service-role helper).
- Branch: `agent/claude/1-phase7-document-packet-journey` — **28 ahead / 0 behind `origin/staging`**, working tree clean, **NOT pushed**. Backup tag `phase7-slice2-prebase` at pre-rebase HEAD.
- Final commit range (this segment): `da63da7cb` (Stage B) … `551b46056` (ledger). Slice 2 span begins at `1a4087095` (foundation).

## Accepted architecture (FROZEN — do not reopen)
- Hierarchy: **Packet → Forms → Requirements → Responsibility Rules → Conversation Runtime.** Packets compose forms; obligations live inside forms as section dispositions. No packet/item "assignment" model; no separate guardian packets; no second responsibility engine.
- Responsibility rule = three stable axes: `applies_to` (household/participant/child/document/packet) × `responsible_party` (either/all/specific/financial/primary guardian, child, role) × `satisfied_by` (one/assigned/every-assigned/one-per-child/one-per-document).
- Durable requirement identity: `{ form_definition_id, section_id?, field_id? }` (field > section > form); stable schema ids, never labels/positions; dangling ref → blocking validation, never silent rebind.
- Rules ride packet-definition `metadata.requirement_responsibilities` (no migration); promote to a table later with the SAME axes + projection unchanged.
- Packet Studio: `ProcessingPacketsStudio` = definition **manager**; its single **create** path = the responsibility composer (`PosPacketsPanel` `composerOnly`). One creator.

## The participant-runtime limitation Slice 3 must solve (root cause, proven at code level)
Independent completion by two DISTINCT guardians of the SAME requirement is impossible today because:
1. `crm_snapshot.person_id` is pinned to the FIRST link that launches the family-instance session (`lib/forms/packets/formPacketService.ts` `ensurePacketSessionForPublicLink` ~:259), and every draft-create prefers the snapshot over the resolving link's own `recipient_person_id` (`app/api/public/forms/[token]/submissions/route.ts` ~:134, merge in `formPacketService.ts` ~:34-45). → all submissions carry one person_id.
2. The session is sequential single-active-step (`advancePacketSessionAfterSubmit`), so a step advances after one submit — two guardians can't each submit the same step.

**Minimal unlocks (Slice 3):** (a) attribute each submission to the resolving link's `recipient_person_id` (per-recipient attribution), and (b) per-recipient step instances (or re-submittable per-recipient steps) so an all-guardian/every-assigned requirement can collect one completion per responsible participant. These are runtime changes deliberately scoped to Slice 3.

## Exact next proving journey (Slice 3)
Launch one household packet (2 guardians, 2 children) and prove LIVE, via real submission paths:
A completes an either-guardian requirement → satisfied for both; A completes Child A → Child B outstanding; A acknowledges the all-guardian handbook → packet incomplete → B acknowledges → satisfied; financial guardian completes the financial requirement; all required instances complete → packet complete with **per-participant attribution**; re-eval idempotent; one correctable requirement reopens → packet incomplete. Then the Processing Case reflects per-participant results.

## Files/endpoints Slice 3 should CONSUME (do not re-implement — this is the seam)
- Core (pure, 37 unit tests): `lib/pos/packet/requirementResponsibility.ts` (identity, resolve, `deriveParticipantRequirements`, `evaluateCompletion`, `isPacketComplete`, `validateProjection`), `packetResponsibilityProjection.ts` (`projectPacketResponsibilities`, `buildRequirementSubmissions`, `evaluatePacketCompletion`, `projectForParticipant`), `requirementResponsibilityLabels.ts`.
- DB adapters: `loadPacketProjection.ts`, `loadParticipantProjection.ts`, `loadFormRequirements.ts`, `loadPacketPreview.ts`.
- Endpoints: `GET /api/admin/pos/packets/requirements`, `POST …/preview`, `GET …/[id]/projection`, `GET …/sessions/[sessionId]/participant-projection?person_id=`; compose persists rules + `pos_connected`.
- On-ramp (idempotent, live-certified): `lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe.ts` + `openProcessingCaseFromSource`.
- Certs: `web/playwright/tests/phase7-packet-responsibility.spec.ts` (operator + live handoff, both green).

## Do-NOT boundaries
Do not: reopen the responsibility/packet/forms architecture; create separate guardian packets; add a second assignment or responsibility engine; introduce first-class packet item types mirroring form requirements; redesign Processing; build mailbox ingestion / subsidy / BOS agents; push, merge, or rebase again without instruction.

## Known baseline debt (NOT introduced here)
`typecheck:tests` has **35 staging-owned errors** in queue/surfaces tests (`tests/adminV2/runtime/*`, `tests/layout/*`, `tests/presentation/runtime/*`) — pre-existing, zero in Phase-7 files. Unit baseline: 26 pre-existing failures (tests/pos 2, tests/forms 24). Source typecheck is 0 errors. No new test/typecheck failures introduced by Slice 1 or 2.
