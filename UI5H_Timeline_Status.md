# UI-5H — Delivery / receipt / reply status in the family timeline

**Commit:** `5858787` (UI-5G) → `19e1d65`. **Bundle:** `communications-v2-ui5h-timeline-status.bundle`.
**Existing tables only — no schema, no provider webhook, no send-route/BOS/announcement/drawer changes, no UI-4H layout change.**

## Implementation

- **`aggregateFamilyTimeline.ts`**
  - `rollupRecipientReceipts(rows)` (pure): for each message, the most-progressed `delivered_at`/`opened_at`/`replied_at` across its `communication_message_recipients` rows.
  - `deriveTimelineStatus(message, direction)` (pure): single display status — `received` (inbound) · `failed` · `replied` · `opened` · `delivered` · `sent` · `queued` (notes/system → `null`).
  - `TimelineEventVM` gains `status` + `sentAt` (alongside existing `deliveredAt/openedAt/repliedAt`).
- **`loadFamilyThreadsData.ts`**: now selects `communication_messages.status` + `sent_at`, then reads `communication_message_recipients` for the loaded messages and rolls receipts onto each message. Read-only; capped.
- **`CommandCenterShell.tsx`**: a **subtle** per-message status on **outbound** timeline items (Sent / Delivered / Opened / Replied / Failed), in the meta line, color-cued (opened/replied pine, delivered/sent slate, failed red). Live-only (`comms_v2_live_workspace`); fixtures unchanged; inbound shows no badge.

## Tests / verification

- New `receiptStatus.test.ts`: rollup max-across-recipients, status precedence (failed > replied > opened > delivered > sent > queued), inbound/note handling, `buildTimelineEvents` passthrough.
- Sandbox: all modules strip-check; **5 Node harnesses pass 66/66** (23+16+8+7+12). `.tsx` brace/geometry-verified.
- Gate: `cd web && npx tsc --noEmit && npm run test -- tests/communications/v2/`.

## API contract notes

No new endpoints or params. The `family-workspace` VM's `TimelineEventVM[]` (`timelineEvents` + selected-thread `messages`) now carries populated `status`, `sentAt`, `deliveredAt`, `openedAt`, `repliedAt` (previously `null`). Consumers reading those fields get real values where receipts exist; absent receipts ⇒ status falls back to `sent`/`queued` from the message row.

## Manual QA (staging)

1. `tsc --noEmit` + `npm run test -- tests/communications/v2/` → green.
2. **API:** `GET /family-workspace?customer_id=<id>` → outbound `timelineEvents[].status` is `sent`/`queued` for messages with no receipts; if a message has `communication_message_recipients` rows with `delivered_at`/`opened_at`, that event shows `delivered`/`opened`; a message with `status='failed'` shows `failed`.
3. **Receipt rollup:** insert (or have) two recipient rows for one message with different `delivered_at`/`opened_at` → the event reflects the most-progressed timestamp.
4. **UI:** `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1` + `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE=1`, open a family → outbound bubbles show a subtle status (e.g., "· Delivered"); inbound shows none. Send via UI-5G → new message appears as "· Sent"/"· Queued".
5. **Lock check:** unset `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE` → no status text; UI-4H byte-identical.

## Blockers — provider webhook ingestion (next phase)

UI-5H **reads** receipts but nothing **writes** the advanced states yet, so in practice outbound items will sit at `sent`/`queued` until ingestion lands:

1. **Provider webhooks (the gating dependency):** Resend (email) + Twilio (SMS) delivery/open/click callbacks → append to `communication_delivery_events` and update `communication_message_recipients.delivered_at/opened_at` (+ message `status`). Tables/columns already exist (no schema); the webhook **routes + signature verification + mapping** are unbuilt. (A `twilioWebhookSignature` helper exists; an inbound SMS path exists in Python — email delivery webhooks are not wired.)
2. **Reply tracking (`replied_at`):** inbound-message route + `selectOutboundToMarkReplied` to mark the prior outbound as replied. Inbound email has no receiving route in the repo (architecture decision for provider infra).
3. **Per-thread `unread`:** message-reads join (currently `0`).

None block UI-5H; they are the receipts/inbound infra phase. Recommend scoping that next, starting with the Resend + Twilio delivery webhooks (highest signal, no schema).
