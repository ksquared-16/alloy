# Enrollment E2E Certification Ledger

**Worktree:** `wt5-epp-runtime-convergence` · **Slot:** 5 · **Port:** 3015  
**Updated:** 2026-08-12 (comms composer convergence)

## Tour — In test

| Item | Result | Notes |
|------|--------|-------|
| Tour scheduling | (prior) | Not reopened this session |
| Tour Work View reaction | (prior) | Not reopened this session |
| Tour invitation initial send | (prior) | Not reopened this session |
| Tour invitation resend after expiry | **FIX LANDED — browser Pass pending Kelly confirm** | Code + API evidence below; leave Pass for Kelly’s product confirmation of full compose→send→Activity loop |

### Defect

**Observed:** After a prior Tour invitation aged out (~4 days), Send Tour Invitation did not reliably produce a fresh usable booking link (expired / unusable invitation semantics blocked or poisoned resend).

**Root cause:** Idempotent mint treated the prior invitation key as authoritative forever:
1. Fingerprint change under the same key → `idempotency_payload_changed` (“key already used…”) blocking resend
2. Matching-key replay returned **empty actions** (tokens not re-derivable) → prepare compose draft without a usable booking URL
3. Expired/terminal priors were still eligible for replay lookup

Class: **invitation-state / token reuse** on the shared mint path (not Communications transport).

### Fix

- `web/lib/tours/invitation/mintTourInvitation.ts` — only draft/active+unexpired rows replay; fingerprint drift supersedes + mints fresh; terminal/expired do not block
- `web/lib/tours/invitation/sendTourInvitation.ts` — empty-action replay supersedes + remints under `:reissue:` key so prepare always gets tokens

### Evidence (localhost:3015)

- Prepare with legacy stable key `send_tour_invitation:org:opp` after prior Aug-8 invite → **200 ok**, `idempotent_replay: false`, new `invitation_id`, short URL `/a/PSy2ZsQN`
- New link resolve → `state: choose`, headline “Choose a time to visit”
- DB: Aug-8 invite `5c1f3b36…` status → **superseded**; new active invites minted
- Unit: `mintTourInvitation` + `sendTourInvitation` — 61 passed

### Acceptance checklist (Kelly)

- [ ] Tour → Send Tour Invitation opens compose (no auto-send)
- [ ] Fresh booking link in draft; old link remains expired/out-of-date
- [ ] Confirm send via Communications; Activity once
- [ ] Invoke Send Tour Invitation again afterward

### Follow-up defect (same session) — child Waitlist subject id

**Observed:** Tour → Send Tour Invitation on child Waitlist What's Next showed "This record is no longer available."

**Cause:** `CurrentWorkCard` passed Attention `subject.id` (child `process_instances.id`) as `opportunityId`. Prepare looked up `opportunities` by that id → 404.

**Fix:** `CurrentWorkCard` uses `resolveFocusPanelMutationOpportunityId` (same as SchedulingCard) so prepare keys the family opportunity (`context_id` / `child.family_opportunity_id`).

---

## Tour — composer + send confirmation (In test → FIX LANDED)

| Item | Result | Notes |
|------|--------|-------|
| Tour invitation composer convergence | **FIX LANDED** | Path A seeds link; Path B Insert ▾ |
| Shared centered send confirmation | **FIX LANDED — browser PASS (Message)** | `FamilySendConfirmationDialog` |
| Post-send Done → Focus Panel (no summary card) | **FIX LANDED — browser PASS** | `closeWorkspace` on Done; no handoff notice |
| Tour invitation send + Activity | **RE-CERTIFY Tour path** | Message confirm/success/Done certified; Tour uses same seam |

### Product distinction (required)

```text
Tour → Send Tour Invitation  → prepare complete draft; fresh URL already in editable body
Message / Send Message       → blank New Message; optional Insert ▾ → Tour Invitation Link
```

One provisioning authority: `provisionTourInvitationPrepare` → `send_tour_invitation` mode `prepare`.

### Send confirmation seam

Compose → Send → centered **Ready to send** (exact draft) → Confirm send → **Message sent** / **Tour invitation sent** → Done → Focus Panel (no redundant handoff summary card).

### Unit evidence

- `tests/communications/familySendConfirmationLifecycle.test.ts`
- `tests/communications/tourInvitationComposerInsertConvergence.test.ts`
- `tests/communications/familyComposeIntentConvergence.test.ts`
- `tests/communications/familyWorkspaceWorkspaceInbox.parity.test.tsx` (Reply → confirm → Done)
- `tests/tours/tourInvitationPrepareWarmCache.test.ts`

### Browser evidence (2026-08-12 · localhost:3015 · Lennon Kurzman)

Dir: `docs/audits/active/enrollment-e2e-comms-composer-convergence/`

| Check | Result |
|-------|--------|
| A Send Tour Invitation — link already in body | **PASS** · `A-send-tour-invitation-seeded.png` |
| B Message blank + Insert Tour link | **PASS** · `B-send-message-blank.png`, `B-insert-tour-invitation-link.png` |
| C Fresh link per invoke | **PASS (observed)** |
| D Activity Topics + Reply | **PASS** · `D-activity-history.png` |
| Centered confirm + success + Done → Focus Panel | **PASS (Message)** · `confirm-B/C/D-*.png` · `browser-qa-send-confirm.json` |

Do **not** mark full Pass until Kelly confirms Tour confirm-send path on stable 3015.

---

## Communications parity

| Path | Result | Notes |
|------|--------|-------|
| Contact Family / Message → New Message | **BROWSER PASS pending Kelly** | Shared host + centered confirm |
| Activity → Reply/history | **BROWSER PASS pending Kelly** | Topics + Reply; parity unit covers Done |
| Send Tour Invitation → seeded New Message | **BROWSER PASS pending Kelly** | Link in body; confirm seam shared |

---

## Waitlist What's Next semantics (IN TEST)

**Updated:** 2026-08-12

| Item | Result | Notes |
|------|--------|-------|
| Stage-led Waitlist headline | **FIX LANDED — browser Pass pending** | Presentation prefers `runtime.stage_label` over work title |
| No fake mini-lifecycle | **FIX LANDED — browser Pass pending** | Sequential progress requires completed step or repeated attempts |
| Recent activity left-aligned | **FIX LANDED — browser Pass pending** | Lone activity no longer parks in right grid column |
| Capability Close → full Focus Panel | **FIX LANDED — browser Pass pending** | Close/complete clears Current Work workspace elevation |
| Tour ▾ Alloy menu polish | **FIX LANDED — browser Pass pending** | Shared `DropdownMenu` + Midnight/Pine chrome |

### Why What's Next showed “Review waitlist position → Offer spot”

1. Waitlist stage operating plan configures **two** work templates (`review_waitlist_position`, `offer_spot`) — both optional / concurrent while membership is already Waitlist.
2. Surface title preferred the **open work label** over `stage_label`.
3. Progress presentation treated any multi-item runtime sequence as a sequential strip, so open review + planned offer painted as a fake lifecycle ladder.

### Owner corrected

**Presentation / projection semantics** (`buildWhatsNextCardPresentation`, `buildWhatsNextProgressPresentation`, surface title preference) — not ranking, EPP, outcomes, or Tour/comms runtimes.

### Unit evidence

- `tests/adminV2/runtime/whatsNextCardV2Presentation.test.ts` — Scenario 7b Waitlist concurrent work
- Tour menu composition assertion updated in `currentWorkFocusWorkspace.test.tsx`

### Browser

Evidence dir: `docs/audits/active/enrollment-e2e-waitlist-whats-next/`

| Check | Result | Notes |
|------|--------|-------|
| Headline **Waitlist** (not Review…) | **Observed** | `01-waitlist-whats-next-summary.png` + `browser-qa.json` insight=`Waitlist` |
| No `1 → 2` mini-lifecycle | **Observed** | `progress: false` |
| Current work kept | **Observed** | `Current work · Review waitlist position` |
| Close capability → leave elevation | **Partial** | Send form opened (`focused`+capability); Close cleared elevation (`elevated:false`). Queue then hit `preparation did not terminate within 10000 ms` before Tour menu capture |
| Tour menu polish | **Pending** | Server dropped before Tour probe; Close/scrim z-index fix landed (`capability-close` + scrim `pointer-events:none` while capability active) |
| Status chip **Waitlisted** | **Not yet** | Chip still `In progress` — durable `child.status` not on Focus Panel truth for this subject |
| Placement context facts | **Not yet** | Position/waiting-since not on Focus Panel truth bag (queue row has `1/1`; card facts empty) |

Do **not** mark Pass until Kelly confirms on a stable 3015 (queue prep must succeed through Close + Tour menu).
