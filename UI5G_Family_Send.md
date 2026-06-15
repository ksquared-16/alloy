# UI-5G — Family Send Orchestrator

**Commit:** `23737f1` (UI-5 Batch 2) → `5858787`. **Bundle:** `communications-v2-ui5g-family-send.bundle`.
Implements the UI-5F contract. **No migrations, no send-route changes, no BOS, no announcements, no persisted drafts, no UI-4H layout change.** Reuses `executeCommunicationsSend` unchanged.

## What shipped

- **`POST /api/admin/communications/family-send`** (new, additive, dark behind `comms_v2_command_center`).
- **`orchestrateFamilySend`** — pure, deps-injected orchestration (testable): per-recipient eligibility → consent → preflight/send → results + summary.
- **CommandCenterShell** — flag-gated (`comms_v2_live_workspace`) Send-now → preflight review → Confirm → execute → refresh. Composer toolbar/Attach/Templates/BOS remain inert.

## API contract

`POST /api/admin/communications/family-send`
```jsonc
// request
{ "customer_id":"uuid", "recipient_person_ids":["uuid",...], "channel":"email"|"sms",
  "subject":"string|null", "body":"string",
  "reply_to_thread_id":"uuid|null", "client_token":"string|null", "confirm":true|false }
// 200
{ "mode":"preflight"|"sent",
  "results":[ { "person_id","display_name","status":"ready"|"sent"|"blocked"|"failed",
                "reason":string|null, "thread_id":string|null, "communication_message_id":string|null } ],
  "summary":{ "requested","ready","sent","blocked","failed" },
  "meta":{ "customer_id","channel","confirm","consent_enforced":bool } }
```
- `confirm` omitted/false ⇒ **preflight** (per-recipient evaluation, **zero sends**). `confirm:true` ⇒ fan out, one `executeCommunicationsSend` per recipient (person-anchored, `quickMessage`).
- **Errors:** 400 (bad `customer_id`, empty `recipient_person_ids`, missing `body`, email without `subject`, channel not email/sms), 404 (customer not in org), 500.
- **Note:** `channel:"note"` is intentionally **400** in 5G (internal notes deferred). Unchanged: `/send`, `/family-workspace`, `/threads/[id]/messages`.

## Behavior (per the 7 decisions)

1. **Multi-recipient:** one logical request fans out; reuses `executeCommunicationsSend`.
2. **Threads:** per-recipient person-anchored threads (transport); merged in the UI timeline — unchanged.
3. **Review-first:** preflight returns `ready`/`blocked` with reasons and sends nothing; Confirm sends.
4. **Consent:** evaluated per recipient/channel/category via `enforceConsentForSend` (active only when `comms_v2_compliance` on; else passive). Ineligible (no email/phone, provider not configured) ⇒ `blocked` with reason; opted-out ⇒ `blocked`.
5. **Failure:** partial success, **no rollback** — each recipient is independent; `results[]` + `summary` carry the full picture.
6. **Draft:** client-only (UI-5E); not persisted.
7. **Mom ✓ / Dad ✗:** both returned (e.g., Mom `sent`, Dad `blocked — No email on file`); the UI lists each with a status dot; successful sends refresh into the timeline.

## Tests

- **`orchestrateFamilySend.test.ts`** (mocked deps): preflight performs no sends; confirm sends; ineligible blocked; consent blocked; send-failure `failed` and `consent_blocked` code → `blocked`; partial success summary; unknown recipient `failed` + id dedup.
- Sandbox: all modules strip-check; **4 Node harnesses pass 54/54** (23 roster + 16 aggregation + 8 selection + 7 send-orchestration). `.tsx` brace/geometry/flag verified.
- Gate: `cd web && npx tsc --noEmit && npm run test -- tests/communications/v2/`.

## Manual QA (staging)

Prereq: a Firefly customer with `customer_persons` parents (one without an email), real email binding configured; put the customer id on a fixture (`FIXTURE_FAMILY_DETAILS["fx-rivera"].customerId`).

1. `tsc --noEmit` + `npm run test -- tests/communications/v2/` → green.
2. **API preflight:** `POST /family-send` `{customer_id, recipient_person_ids:[mom,dad], channel:"email", subject:"Hi", body:"Test"}` (no `confirm`) → `mode:"preflight"`, mom `ready`, dad `blocked — No email on file`, no sends.
3. **API send:** same body + `"confirm":true` → mom `sent` (thread_id + communication_message_id), dad `blocked`; `summary.sent=1, blocked=1`. Re-query `/family-workspace` → mom's message in the timeline.
4. **Consent:** with `comms_v2_compliance=1` and mom opted out of `email_transactional` → mom `blocked` with the consent reason; `meta.consent_enforced:true`.
5. **UI:** `.env.local` `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1`, `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE=1` (+ `NEXT_PUBLIC_COMMS_V2_COMPLIANCE=1` to enforce). `npm run dev`, open the family, select recipients, type subject/body → **Send now** shows the review list → **Confirm send (N)** → results show per recipient; timeline refreshes. Disabled recipients can't be selected.
6. **Lock check:** unset `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE` → Send now is inert; UI-4H byte-identical.

## Blockers — receipts / open tracking (not in 5G)

`family-send` returns synchronous `queued`/`sent`/`failed` only. **Delivered / opened / replied are not tracked yet** and require, all additive (no schema — columns already exist on `communication_message_recipients` + `communication_delivery_events`):

1. **Provider webhook ingestion** (Resend/Twilio → `communication_delivery_events` → `communication_message_recipients.delivered_at/opened_at`). This is the gating infra dependency.
2. **Receipts join** in `aggregateFamilyTimeline`/`loadFamilyThreadsData` to surface `deliveredAt/openedAt/repliedAt` on `TimelineEventVM` (currently `null`).
3. **Reply tracking** — inbound route + `selectOutboundToMarkReplied` to set `replied_at`.
4. **Per-thread `unread`** join (currently `0`).

None block UI-5G send; they're the next phase (receipts/inbound).
