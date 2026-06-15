# UI-5 Batch 2 — Contact selection (5C) · Thread interaction (5D) · Composer draft (5E)

**Commits:** `8d19075` (UI-5B) → `e899441` (A: semantics + selection helper) → `23737f1` (B: 5C/5D/5E UI).
**Bundle:** `communications-v2-ui5cde-contact-thread-composer.bundle`.
**Guardrails honored:** no BOS, no modal-shell geometry, no migrations, no provider send, no announcements, no redesign. All UI changes are flag-gated behind `comms_v2_live_workspace` (default OFF ⇒ UI-4H render byte-identical) except controlled inputs (5E), which look identical.

## 1. Thread / recipient semantics (decision)

Documented in `web/lib/communications/v2/familyWorkspace/THREAD_SEMANTICS.md` and referenced from `aggregateFamilyTimeline.ts` (the merge point):

- The workspace presents **one unified family conversation**.
- Transport (`communication_threads`) may create **one thread per recipient + channel** (keyed by `primary_entity + channel + recipient_key`).
- The UI **merges** all of a family's transport threads into a single family timeline; selecting a thread filters to that recipient/channel sub-conversation without leaving the workspace.
- Sending to multiple recipients will **fan out** into per-recipient/channel threads (`buildSendPayloads` already does this); the operator still sees one merged conversation. (Send not implemented — see §6.)

## 2. UI-5C — Contact selection

The composer `To` area becomes a real selector built from the VM's `recipientGroups` / per-recipient channel eligibility:

- Groups labeled **Parent/Guardian** and **Other contacts** (never "Contact").
- Eligible recipients are **multi-selectable** chips (a primary parent/guardian, multiple parents/guardians, and/or secondary recipients). Selected = pine fill + check.
- Ineligible recipients are shown **greyed with the reason** ("No email on file", "No phone on file", "Email not configured", "SMS not configured"). They can never be selected (`toggleRecipientSelection` no-ops on ineligible).
- Selection is client state (`selectedRecipientIds`), seeded from the VM's default (eligible primary). Pure helpers in `composerSelection.ts` (unit-tested).

## 3. UI-5D — Real selected thread / message interaction

- Clicking a timeline message **opens/selects its thread**; the conversation column re-fetches and shows **that thread's** messages (`?thread_id=`, reusing the existing per-thread endpoint).
- A **"Viewing one thread · All messages"** affordance returns to the merged family timeline.
- The Family Snapshot band is preserved; locked UI-4H layout unchanged.

## 4. UI-5E — Composer draft state

- `To` (selectedRecipientIds), `Subject` (`subjectDraft`), and `Body` (`bodyDraft`) are real controlled client state; reset when switching families.
- Formatting toolbar, Attach, Templates, BOS Enhance remain visual/inert. **No provider send.**

## 5. Tests / verification

- New unit test `composerSelection.test.ts` (toggle, eligibility, summary). Plus all prior 5A/5B suites (your gate reports 5 files / 26 tests; this adds a 6th).
- Sandbox (no vitest): all `.ts` modules strip-type-check; **3 Node logic harnesses pass 47/47** (23 roster/eligibility + 16 aggregation/adapter + 8 selection). `CommandCenterShell.tsx` is JSX (not strip-checkable) — braces/geometry/icon-usage verified; live path flag-gated.
- Gate: `cd web && npx tsc --noEmit && npm run test -- tests/communications/v2/`.

## 6. API contract changes

**None new in Batch 2.** 5C/5D consume fields already in the VM: `recipientGroups`, `eligibleRecipients`/`disabledRecipients` (UI-5A) and `threads`/`messages`/`selectedThread` + the `thread_id` param (UI-5B). The `family-workspace` envelope is unchanged.

## 7. Migration requirements

**None.** Read-only over existing tables; no schema/seeds.

## 8. Manual QA (staging)

Prereq: a Firefly **customer** with `customer_members` (children), `customer_persons` (parents, incl. one without an email), and threads+messages keyed to the customer / a family person / an opportunity. Put that customer id on a fixture: `FIXTURE_FAMILY_DETAILS["fx-rivera"].customerId = "<id>"`.

1. `cd web && npx tsc --noEmit && npm run test -- tests/communications/v2/` → green.
2. `.env.local`: `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1`, `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE=1`. `npm run dev`, open the modal, select that family.
3. **5C:** To shows **Parent/Guardian** + **Other contacts**; click to select multiple; the parent without an email appears greyed with "No email on file" and won't select.
4. **5D:** click a message → conversation shows that thread; "All messages" returns to the merged timeline. Snapshot persists.
5. **5E:** type a Subject/Body and toggle recipients — state holds; switching families clears it. Toolbar/Attach/Templates/BOS Enhance do nothing (inert). Nothing sends.
6. **Lock check:** unset `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE` → To reverts to the single chip; UI-4H byte-identical.

## 9. Blockers to resolve BEFORE send / multi-recipient

1. **Send route is single-recipient.** `executeCommunicationsSend` takes one `recipient_person_id`. Mom+Dad ⇒ either N calls or a new multi-recipient path looping `buildSendPayloads`. Decision needed.
2. **Send entity context.** `executeCommunicationsSend` needs `entity_type`/`entity_id` per recipient (which transport thread to write). The composer has person ids (`selectedRecipientIds`) but not the per-recipient send entity — needs a `recipientContactId → {entityType, entityId, recipientPersonId}` resolver (extends the family roster).
3. **Consent enforcement.** 5A–5C treat consent as **passive (`unset`)**. Send must enforce per recipient/channel via the existing `enforceConsentForSend` / `consentGate` (currently not on this path).
4. **Queue → customer wiring.** Live UI needs a `customerId` per queue entry. Today the queue is fixtures; `resolveCustomerIdFromWorkspaceEntry` exists but the conversations API doesn't yet expose `primary_entity`/customer to drive it. Real queue anchoring is the prerequisite for live mode without fixture edits.
5. **Receipts/unread (cosmetic).** `opened_at`/`replied_at` live on `communication_message_recipients` and per-thread `unread` is `0` until those joins are added (additive, no schema).
