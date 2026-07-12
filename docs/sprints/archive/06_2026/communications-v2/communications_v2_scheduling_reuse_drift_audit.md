# Communications V2 — Scheduling/Sending Reuse & Drift Audit (pre‑B7)

**Path:** `docs/sprints/archive/06_2026/communications-v2/communications_v2_scheduling_reuse_drift_audit.md`
**Status:** Audit — **planning only, no code.** Gate for any announcement schedule/send work (B7).
**Date:** 2026-06-22
**Scope owner:** Claude (POS / Documents / Communications / Sprint packages)

## Doctrine being enforced

- Announcements are **campaign / broadcast** objects.
- Scheduled sends are **delivery‑execution** objects.
- Do **not** duplicate delivery‑execution tables.
- Do **not** create a second scheduling system.
- Email/SMS without a provider binding → **skipped / provider_unavailable**, never queued.
- In‑App stays **operator‑side only** unless a parent‑facing surface exists (none does today).

**Verification basis:** read directly from `communication_scheduled_sends` migration (`20260521103000_task_assist_v1_1_foundation.sql`) + claim RPC (`20260522140000…`) + source extension (`20260527150000…`); `web/lib/communications/executeCommunicationsSend.ts`, `canonicalOutboundEnqueue.ts`, `composerChannels.ts`, `communicationScheduledSendsService.ts`; routes under `web/app/api/admin/communication-scheduled-sends/**`; `backend/app/services/communication_message_sender.py` + `communications/binding_resolver.py`; delivery models `deliveryStateAdapter.ts`, `v2/deliveryReceipts.ts`; the V1 foundation (`20260430254100…`) and B4 announcements (`20260622123000…`).

---

## 1. What already exists for SCHEDULING messages

A complete, single‑recipient scheduling engine already exists — built for Task Assist and reused by Tour Scheduling. **It is the only scheduler in the system.**

**Table `communication_scheduled_sends`** (one row = one recipient, one channel, one future send):
`org_id`, `created_by`, `proposal_id`→task_assist_proposals, **`entity_type` CHECK = `'opportunities'` only**, **`entity_id` FK→opportunities NOT NULL**, **`recipient_person_id` FK→persons NOT NULL**, `channel` CHECK(`sms`|`email`), `subject_snapshot`, `body_snapshot`, `communication_provider_binding_id`→bindings, `scheduled_for`, `status` CHECK(`pending`→`claimed`→`queued`→`sent`|`canceled`|`failed`), `approved_at/by`, `communication_message_id`→messages, **`source` CHECK(`task_assist`|`tour_scheduling`)**, `metadata`, `claimed_at`, `claim_token`. Guard: `scheduled_for > approved_at`.

**Claim RPC `claim_due_communication_scheduled_sends(p_limit, p_now, p_org_id)`** — atomically claims due rows (`status='pending' AND scheduled_for<=now AND communication_message_id IS NULL`) with `FOR UPDATE … SKIP LOCKED`, stamps `claimed` + `claim_token` + `claimed_at`. `service_role` only.

**Orchestrator `processDueCommunicationScheduledSends()`** (`communicationScheduledSendsService.ts`) — calls the claim RPC, then per claimed row re‑fetches (idempotency: skips if `communication_message_id` already set), calls `executeCommunicationsSend()`, and writes `queued`+`communication_message_id` on success or `failed`+`metadata.last_process_error` on failure.

**APIs** (`web/app/api/admin/communication-scheduled-sends/**`): `POST` create, `GET` list/summary, `PATCH [id]` cancel (`status='canceled'`, pending/failed only) and edit/reschedule (pending/failed only; failed→pending reset), `POST process-due` (x‑cron‑token **or** admin/ops session, org‑scoped, limit≤100).

**UI**: `ComposerScheduleSendModal.tsx` (send‑later from composer/Task Assist), `ScheduledSendDetailPopover.tsx` (edit/reschedule, process‑now, cancel). Service surface: `create/list/get/cancel/update/processDue/releaseStaleClaimed/summarizeAttention`.

**Takeaway:** scheduling = the `communication_scheduled_sends` row + claim RPC + process‑due + cancel/reschedule semantics + the cron pattern. It is single‑recipient/single‑channel grain — **exactly the grain an announcement fan‑out needs** — but it is **hard‑coupled to opportunities** (`entity_type`/`entity_id` FK) and its `source` CHECK does not yet include announcements.

## 2. What already exists for SENDING messages

**`executeCommunicationsSend.ts`** — resolves the `to` address (from `recipient_person_id` for email/sms), loads `communication_provider_bindings`, checks channel availability via `availableComposerChannels()`, picks a binding via `activeOutboundBindings()`, and calls `enqueueCanonicalOutboundMessage()`. **It rejects early** with `channel_unavailable` / `binding_missing` when no active binding exists — it never inserts a message for an unsendable channel.

**`enqueueCanonicalOutboundMessage()`** (`canonicalOutboundEnqueue.ts`) — upserts `communication_threads` (unique on org+entity+channel+recipient_key), inserts `communication_messages` with `direction='outbound'`, `status='queued'`, `to_address`, `communication_provider_binding_id`, `metadata`; emits `workflow_events`; triggers the backend queue. **It does NOT write `communication_message_recipients`** — recipient identity is encoded in `thread.recipient_key` + `message.to_address`.

**Python worker `communication_message_sender.py`** — polls `communication_messages WHERE direction='outbound' AND status='queued'`; resolves the binding (`find_binding_by_id` or `resolve_outbound_binding` precedence user>location>org); calls Twilio (sms) / Resend (email); sets `sent`+`sent_at`+`provider`+`provider_message_id`, or `failed`+`error`. In‑app → `sent` with no provider. **No active binding → RuntimeError → `failed`** (there is no `skipped`/`provider_unavailable` state in the live send path).

**Bindings/availability** — `communication_provider_bindings` (`channel`, `provider`, `scope`, `status` active|disabled|pending_verification, `is_primary`, `secret_ref`). `composerChannels.ts`: in‑app always available; sms/email available only with an active, credential‑ready binding.

**Delivery/receipt/status** — `communication_messages.status` (`queued`|`sent`|`failed`|`delivered`); `communication_delivery_events` (append‑only, PKG‑03); `deliveryStateAdapter.ts` (`DeliveryState`: queued/sent_to_provider/provider_accepted/delivered/failed/bounced); `v2/deliveryReceipts.ts` (`ReceiptState` ladder bounced>failed>replied>clicked>opened>delivered>sent>queued). **`communication_message_recipients` (PKG‑04) exists but is not written by the live send path** (the prior post‑import audit flagged this as gap H‑3).

## 3. What Announcements should REUSE (do not rebuild)

| Concern | Reuse | Why |
|---|---|---|
| Scheduling row + due‑claim | `communication_scheduled_sends` + `claim_due_communication_scheduled_sends` RPC | The only scheduler; correct single‑recipient grain; SKIP‑LOCKED concurrency already solved |
| Schedule orchestration | `processDueCommunicationScheduledSends()` + `POST process-due` (+ cron token) | Idempotent claim→enqueue→status already built |
| Cancel / reschedule | `cancelCommunicationScheduledSend()` / `updateCommunicationScheduledSend()` semantics (pending/failed only) | Avoids a second cancel path |
| Sending | `executeCommunicationsSend()` → `enqueueCanonicalOutboundMessage()` → worker | Single canonical send spine; provider‑neutral |
| Provider availability | `communication_provider_bindings` + `composerChannels.activeOutboundBindings()` | One source of truth for "can this channel send" |
| Delivery/status truth | `communication_messages` (+ `communication_delivery_events`, receipts) | The execution + delivery substrate |

**Net:** Announcements should not introduce any new claim function, worker, send function, or provider logic.

## 4. What Announcement‑specific tables should stay SEPARATE

These three (B4) are **campaign‑side** and have no equivalent in the execution layer — keep them:

- **`announcements`** — the campaign/broadcast object (title, channels, template_id, subject/body, `status` draft→scheduled→sent→archived, `send_at`). This is the *campaign*, not a send.
- **`announcement_targets`** — the composable segment definition (audience config). Unique to announcements.
- **`announcement_recipients`** — the **resolved audience snapshot + per‑recipient campaign outcome** (who/channel/consent/`suppressed_reason`/outcome, `communication_message_id` back‑link). Keep it as the campaign's immutable membership record — **not** as an execution queue (see §5/§6).

## 5. announcement_recipients as source rows vs scheduled_sends referencing announcements

**Recommendation: a layered model — both, with clear roles. announcement_recipients are the SNAPSHOT/SOURCE; the fan‑out creates `communication_scheduled_sends` execution rows that reference the announcement.**

- `announcement_recipients` = immutable **campaign snapshot** written once at schedule time (audience truth: person, channel, address, consent_state, `suppressed_reason`, outcome rollup). One row per `(announcement, person, channel)` (already `UNIQUE`).
- The fan‑out **reads** `announcement_recipients` and, for every recipient that actually needs provider delivery (email/sms **with** an active binding), creates one `communication_scheduled_sends` row — the **execution object** — that **directly references the announcement** (new `announcement_id`) and back‑links to its recipient row.
- Recipients that need **no execution** get **no** scheduled_send: in‑app → operator‑side timeline entry only; email/sms with **no binding** → `announcement_recipients.status='skipped'`, `suppressed_reason='provider_unavailable'`.

Why not "announcement_recipients ARE the execution/queue rows": that would make `announcement_recipients` a second delivery‑execution table with its own claim/lifecycle — a direct violation of the doctrine ("do not duplicate delivery‑execution tables / no second scheduling system"). Why not "scheduled_sends only, drop announcement_recipients": you lose the immutable audience snapshot, the skipped/suppressed record (which has no home in `communication_scheduled_sends`), and the campaign membership rollup. The layered model keeps **one** execution table and **one** scheduler while preserving the campaign record.

## 6. Duplicate concepts introduced by B4/B5 (drift to correct before B7)

1. **Three overlapping "delivery progress" status vocabularies.** `announcement_recipients.status` = `pending|queued|sent|skipped|failed` overlaps `communication_scheduled_sends.status` = `pending|claimed|queued|sent|canceled|failed` and `communication_messages.status` = `queued|sent|failed|delivered`. **Risk:** `announcement_recipients.status='queued'` could be read as an execution state, turning the snapshot into a shadow queue. **Fix:** treat `announcement_recipients.status` as a **campaign outcome rollup derived from the execution row**, not an independent queue. Recommended outcome set: `pending` (snapshot, pre‑schedule), `skipped` (provider_unavailable / no consent / no address), `scheduled`/`sent`/`failed` mirrored from the linked execution row. Avoid `queued` meaning two things; if kept, define it strictly as "execution row exists and is pending."
2. **`announcement_recipients` columns mirror `communication_message_recipients`** (`person_id`, `channel`, `address`, `consent_state`, lifecycle). Not an *active* duplicate today (the live path doesn't write `communication_message_recipients`), but conceptually two per‑recipient tables now exist. **Fix:** keep `announcement_recipients` as campaign‑scoped; do not also start writing `communication_message_recipients` for announcements. Flag for future convergence (ties into post‑import H‑3).
3. **Scheduling time exists at two grains:** `announcements.send_at` (campaign) vs `communication_scheduled_sends.scheduled_for` (per‑send). **Not a duplicate** if the fan‑out sets every child `scheduled_for = announcements.send_at`. Keep the campaign `send_at` authoritative; children inherit it.
4. **No new scheduler/worker was introduced by B4/B5** (good) — B5's `[id]/targets` and B6's recipient‑preview are read/config only. The only *latent* duplication is the `announcement_recipients` status enum behaving like a queue (item 1).

## 7. Recommended integration path (for B7 — not built here)

The one structural prerequisite: **generalize the single scheduler** rather than add a second. An **additive** migration to `communication_scheduled_sends`: add `'announcement'` to the `source` CHECK; add nullable `announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE`; relax the opportunity coupling so announcement rows are legal (make `entity_id` nullable and allow `entity_type='announcements'`, or gate the opportunities FK to non‑announcement sources). `recipient_person_id`→persons already fits announcement recipients. This keeps **one** execution table.

- **Schedule announcement.** `announcements`: draft→`scheduled`, set `send_at`. **Generate the recipient snapshot now** (§"generate" below). For each snapshot recipient that needs provider delivery, create a `communication_scheduled_sends` row (`source='announcement'`, `announcement_id`, `recipient_person_id`, `channel`, `subject/body_snapshot` from the announcement/template, `scheduled_for = send_at`, resolved `communication_provider_binding_id`). Reuse the existing **process‑due** at `send_at` — no new timer.
- **Cancel scheduled announcement.** `announcements`: `scheduled`→`draft` (or `archived`). Cascade‑cancel child `communication_scheduled_sends` via the existing cancel semantics (`status='canceled'`, only pending/claimed). Mark the snapshot `canceled` (or discard). No new cancel mechanism.
- **Generate recipient snapshot.** At **schedule** time (not draft), run the B6 read‑only resolver (`resolveAnnouncementAudience`) to expand targets → persons/channels, then **write `announcement_recipients` once** (idempotent on the existing `UNIQUE(announcement_id, person_id, channel)`). This is the *only* new writer of `announcement_recipients`. Consent/suppression decided here.
- **Provider‑unavailable behavior.** Decided at snapshot/fan‑out time via `composerChannels.activeOutboundBindings()`. No active binding for an email/sms recipient → `announcement_recipients.status='skipped'`, `suppressed_reason='provider_unavailable'`, **and no `communication_scheduled_sends` row** (nothing to queue). This satisfies the doctrine exactly. (Note: the live worker currently maps "no binding" to `failed`; for announcements the *skip* decision is made **before** enqueue, so unsendable recipients never reach the worker.)
- **Status rollups.** No new vocabulary. Each `announcement_recipients.status` mirrors its linked execution row (`scheduled`/`sent`/`failed`) or is `skipped` at snapshot. `announcements.status` → `sent` once all children are terminal (or compute a counts‑by‑status aggregate from `announcement_recipients`; optionally denormalize counters into `announcements.metadata`). Reuse existing terminal states (`sent`/`failed`); do not invent campaign‑only progress states.

### One‑line integration summary

Keep `announcements`/`announcement_targets`/`announcement_recipients` as the **campaign** layer; **generalize `communication_scheduled_sends` (add `announcement_id` + `source='announcement'`)** as the single **execution/scheduling** layer; fan‑out reads the snapshot and creates execution rows only for sendable recipients; skipped/provider_unavailable is recorded campaign‑side with no execution row; reuse the existing claim RPC, process‑due, cancel/reschedule, send path, worker, bindings, and receipts unchanged.

## Open questions for Kelly (decide before B7)

1. **Generalize `communication_scheduled_sends`** (add `announcement_id` + relax `entity_type`/`entity_id`) vs. accept a small purpose‑built execution table for announcements? Recommendation: generalize — it preserves "one scheduler." This touches a Task‑Assist‑owned table, so it needs sign‑off.
2. **`announcement_recipients.status`** — redefine as an outcome rollup (drop/redefine `queued`) to remove the shadow‑queue ambiguity?
3. **In‑app delivery** — confirm in‑app announcement recipients are operator‑side timeline entries only (no parent surface), consistent with the locked doctrine.
4. **`communication_message_recipients` convergence** (post‑import H‑3) — out of scope for B7, but should announcements eventually feed it, or stay campaign‑scoped on `announcement_recipients`?
