# Communications V2 — Phase Next Audit (Communications Hub)

**Path:** `docs/sprints/archive/06_2026/communications-v2/communications_v2_phase_next_audit.md`
**Status:** Audit + forward design — **planning only; no implementation.**
**Date:** 2026-06-22
**Scope owner:** Claude (POS / Documents / Communications / Sprint packages)
**Explicitly out of scope:** provider activation (Twilio, SendGrid/Resend, webhooks, delivery tracking, inbound, 10DLC). This audit proposes the next phase of **operator value that requires no external provider**.

---

## 0. Method & baseline

Grounded in the current `Alloy-Claude` working tree (branch `claude/pos-packet-parent-submission-20260622`), read directly from migrations under `supabase/migrations/`, domain logic under `web/lib/communications/**`, drawer components under `web/components/admin/communications/**`, and the Inbox surface under `web/app/adminV2/messages/**` and `web/app/adminV2/components/**`. Token infrastructure was inventoried across `web/lib/forms/**`, `web/lib/tours/comms/**`, and `web/lib/workflowTemplate.ts`.

**One baseline correction up front.** The earlier `communications_v2_post_import_audit.md` was anchored to local `staging` tip `4c71170b` and lists `communication_templates`, `communication_snippets`, `announcements`, `announcement_targets`, and `announcement_deliveries` as existing tables, plus a Command Center view model and family-workspace assembler. **None of those are present in this working tree.** Here, Announcements and Templates are *reserved feature flags only* (`comms_v2_announcements`, `comms_v2_templates` in `web/lib/communications/v2/flags.ts`) with no schema, no API, and no UI behind them. This is good news for this phase: Announcements and Templates can be designed cleanly rather than retrofitted, and the flags reserved for them already exist. Where this audit says "build," it means build from the V1 foundation; where it says "reuse," the cited code is confirmed present in this tree.

---

## A. Current State Audit

### A.1 Inbox capabilities

The Inbox is a **modal**, not a page. `web/app/adminV2/components/InboxModal.tsx` mounts `web/app/adminV2/messages/InboxPanel.tsx` inside the shared BOS modal shell. `InboxPanel` is a **folder list + thread detail** today, with five folders defined in `web/lib/communications/inboxThreadTypes.ts`:

```
INBOX_FOLDERS = ["inbox", "unread", "sent", "scheduled", "archived"]
```

Threads load through `web/lib/communications/inboxThreadsService.ts` (`listInboxThreads()`), with folder selection, limits, and per-folder caching (`inboxFolderCache.ts`). The `scheduled` folder is special-cased: it renders `listInboxScheduledSends()` (`InboxScheduledSendListItem`) instead of threads, sorted by `scheduled_for`. Selecting a thread maps the conversation back to its owning record via `inboxEntityDrawerTarget.ts` (entity types: `opportunities`, `persons`, `jobs`, `customers`) and can open that record's drawer. Identity/preview resolution lives in `inboxThreadIdentity.ts` and `inboxThreadPersonContext.ts`.

**Capabilities present:** folder navigation, unread state, sent history, a working scheduled-send folder, archive, thread→record deep-linking, location enrichment, warm-cache prefetch.
**Not present in this tree:** the operational-state "Command Center" queue (`commandCenterViewModel.ts` / `OPERATIONAL_QUEUES`) and the family-workspace three-column redesign described in `communications_workspace_ux_redesign.md` are *target designs*, not shipped code here. The Inbox today is folder-keyed, not operational-state-keyed.

### A.2 Drawer communications capabilities

`web/components/admin/communications/CommunicationsDrawerSection.tsx` is the **Communications tab inside an entity drawer** (with `CommunicationsDrawerBackgroundLoader.tsx` for prefetch). It renders the conversation history for that record — message bubbles with delivery state (`deliveryStateAdapter.ts` → `deliveryStatePresentation`/`mapToDeliveryState`), oldest→newest ordering, recipient-key normalization (`recipientKey.ts`) — and a composer for entity types that support it (`supportsDrawerCommunicationsComposer`, `normalizeDrawerCommunicationsEntityType` from `web/lib/adminV2/messaging/drawerCommunicationsEntity.ts`). The composer honors channel availability via `composerChannels.ts`.

Critically for doctrine: **Notes and Tasks are separate drawer sections**, not part of Communications. The drawer layout is defined as discrete field sections (`supabase/migrations/20260531140000_person_drawer_layout_runtime_v1.sql`), where `communications`, `notes`, and `tasks` are sibling sections. The drawer Communications tab is already scoped to *communication history + composition* — it does not own internal notes or operational tasks today.

### A.3 Existing schema objects

All additive on the V1 foundation. Present in this tree:

| Migration | Objects |
|---|---|
| `20260430254100_communications_v1_foundation.sql` | `communication_provider_bindings`, `communication_threads`, `communication_messages`, `communication_message_reads`. Thread identity `UNIQUE(org_id, primary_entity_type, primary_entity_id, channel, recipient_key)`. `channel` CHECK `sms\|email\|in_app`; `direction` CHECK `inbound\|outbound`. |
| `20260502120000_communication_messages_subject.sql` | `subject` on messages. |
| `20260611120001_comms_v2_conversation_core.sql` | Thread cols: `assigned_user_id`, `assigned_team_id`, `assignment_state`, `attention_state`, `first_response_at`, `sla_due_at`, `sla_state`, `last_read_at`. Tables: `conversation_assignment_events`, `sla_events`. |
| `20260611130000_comms_v2_delivery_events_receipts.sql` | `communication_delivery_events` (append-only, provider-neutral); message receipt stamps `opened_at`, `clicked_at`, `replied_at`. |
| `20260611140000_comms_v2_preferences_recipients.sql` | `communication_message_recipients` (per-recipient lifecycle), `communication_preferences`, `communication_preference_events`. |
| `20260521103000_task_assist_v1_1_foundation.sql` (+ `20260522140000`, `20260527150000`) | `communication_scheduled_sends` + `claim_due_communication_scheduled_sends()` worker claim. |
| `20260529210000_person_communication_opt_out_field.sql` | Legacy drawer `communication_opt_out` boolean field. |

**No** `communication_templates`, `communication_snippets`, `announcements`, `announcement_targets`, or `announcement_deliveries` exist here.

### A.4 Existing communication-preferences functionality

`web/lib/communications/v2/preferences.ts` + the `communication_preferences` table provide **per-person, per-category consent** with an immutable audit trail (`communication_preference_events`, `from_state→to_state`, `source`, `method`, `actor_user_id`). Six categories, three states:

```
categories: email_transactional, email_marketing, sms_transactional, sms_marketing, announcements, emergency
states:     opted_in, opted_out, unset
```

Two things matter for Phase Next. First, **`announcements` is already a first-class consent category** — the consent model for an Announcements feature is already in the schema; nothing new is needed to gate announcement opt-out. Second, **consent is currently fragmented across three sources** (the canonical `communication_preferences` store, legacy `persons.metadata.*_opt_in`, and the legacy `communication_opt_out` drawer field). A Communications Hub must read one source.

### A.5 Existing scheduled-send functionality

Scheduled send **already exists end to end** for the one-to-one, proposal-driven case. `communication_scheduled_sends` carries `channel` (`sms|email`), `subject_snapshot`, `body_snapshot`, `scheduled_for`, `status` (`pending|claimed|queued|sent|canceled|failed`), `source` (`task_assist|tour_scheduling`), and a `claim_token`; `claim_due_communication_scheduled_sends()` is a `SKIP LOCKED` worker claim. These rows already surface in the Inbox `scheduled` folder. The gaps relative to a Hub: it is **single-recipient and proposal-originated** (Task Assist / tour scheduling), there is no operator-composed bulk scheduling, and `source` has no announcement origin.

### A.6 Existing template support

No communication-template object exists in this tree. What exists is **four proven token/merge systems** that are directly reusable:

- `web/lib/forms/inlineFieldTokens.ts` — `{{field_key}}` resolution with status segments (`resolved|missing|unknown`), validation, and display formatting. Strong **validation/preview** pattern.
- `web/lib/forms/packets/enrollmentPacketEmailTemplate.ts` — `applyEnrollmentEmailPlaceholders()` / `finalizeEnrollmentOutboundEmail()`. Simple subject+body placeholder fill, length checks.
- `web/lib/tours/comms/tourCommsTemplates.ts` (+ `tourCommsTemplateContext.ts`, `tourCommsConfig.ts`) — `buildTourCommsMergeFields(ctx)` → `applyTourCommsPlaceholders()` → `renderTourCommsTemplate()`, with **per-channel (email/SMS) rendering**, HTML polish, and empty-line omission. This is the closest analog to a communication template engine and already branches on channel.
- `web/lib/workflowTemplate.ts` — `renderTemplate()` + `getByPath()` supporting **`{{dot.path}}` nested tokens**, with a documented merge-path catalog in `web/lib/agent/workflowAssist/workflowAssistMessageVariablesV1.ts`.

The conclusion for §D: do not invent a fifth token syntax. Standardize on the workflow `{{dot.path}}` engine for the catalog and the forms `inlineFieldTokens` resolver for authoring-time validation/preview.

### A.7 Channels

`channel` is a CHECK-constrained text (`sms|email|in_app`) on both threads and messages. `web/lib/communications/composerChannels.ts` computes availability: `in_app` is always available; `email`/`sms` require an active, configured `communication_provider_binding`. Delivery presentation is provider-neutral (`deliveryStateAdapter.ts`, `web/lib/communications/v2/deliveryReceipts.ts` with the `queued→sent→delivered→opened→clicked→replied` ladder). **In-app is the channel that needs no provider** — it is the natural first activation target for this phase.

### A.8 Audience / segmentation primitives

No first-class audience object exists. The raw materials do: `communication_threads.location_id`; `primary_entity_type` linking to `customers` (families) / `customer_members` (children) / `opportunities`; and `communication_preferences` (queryable for opted-in/out by category). Programs, rooms, and locations are modeled in the CRM. There is **no saved-segment concept** and no reusable "All Families / Active Families / Waitlist" resolver — that is net-new for §C, but it builds on existing CRM joins rather than new core data.

---

## B. Proposed Information Architecture

Recommended top-level Communications navigation:

```
Communications
├── Inbox          conversations & operational queue (1:1, two-way)
├── Announcements  one-to-many operator broadcasts (1:N, mostly one-way)
├── Templates      reusable, tokenized message bodies (email & SMS)
└── Preferences    per-person consent & channel governance
```

The organizing principle is the **shape of the message, not its channel**. Inbox is where a *conversation* with one family lives. Announcements is where a *broadcast* to many families lives. Templates is *reusable content* consumed by both. Preferences is the *consent substrate* both must obey. Email and SMS are channels *within* each surface, never tabs of their own — which is why a future In-App channel slots in without an IA change.

This maps onto reserved flags already in the tree (`comms_v2_command_center`/`record_tab`/`composer` → Inbox; `comms_v2_announcements` → Announcements; `comms_v2_templates` → Templates; `comms_v2_preferences` → Preferences), so the IA is already anticipated by the flag set.

### Should "Scheduled" be a separate tab or embedded?

**Embed it — do not make Scheduled a top-level tab.** Scheduling is a *state of a message*, not a destination, and it appears in two different shapes that already have homes:

1. **One-to-one scheduled replies** (the existing `communication_scheduled_sends` rows from Task Assist / tour scheduling) belong in **Inbox**, where the `scheduled` folder already renders them. Keep that folder.
2. **One-to-many scheduled broadcasts** belong in **Announcements**, as the `Scheduled` status of the announcement lifecycle (Draft → Scheduled → Sent → Archived).

A separate "Scheduled" tab would fragment the same concept across two owners and force operators to context-switch to answer "what's going out and when." Surfacing scheduled items *in situ* — a scheduled reply in Inbox, a scheduled announcement in Announcements — keeps each item next to the work it belongs to. A single read-only "Outbox / upcoming sends" view can be offered later as a *filter across both*, not a fifth nav item.

---

## C. Announcements Design

A first-class **Announcement** is a one-to-many operator broadcast that fans out to per-recipient deliveries through the *existing* send spine. It is composed once, targeted at an audience, sent or scheduled on one or more channels, and tracked as a single object — distinct from a thread (which is a two-way conversation).

### Lifecycle states

```
Draft → Scheduled → Sent → Archived
              │        │
              └─ (cancel back to Draft)
```

- **Draft** — being authored; no recipients resolved yet, no sends.
- **Scheduled** — audience resolved to a recipient snapshot, `send_at` set; awaiting the worker. Cancelable back to Draft.
- **Sent** — fan-out enqueued; per-recipient deliveries tracked. (Per-channel *delivery* receipts are Phase 3, provider-dependent; the *send* record is not.)
- **Archived** — retained for history/reporting; removed from active lists.

### Audience targeting

A reusable **segment definition** resolved at schedule/send time into a recipient snapshot (so a later roster change can't silently alter an in-flight send). Targeting examples and how each resolves from existing data:

| Target | Resolution source |
|---|---|
| All Families | `customers` in org |
| Active Families | `customers` with active enrollment lifecycle |
| Waitlist Families | `customers` in waitlist stage / opportunity stage |
| Program | filter by program on `customer_members` / opportunity |
| Room | filter by room assignment |
| Location | `communication_threads.location_id` / customer location |

Targets are composable (e.g. *Active Families ∩ Location: North*). Every resolved recipient is filtered through `communication_preferences` for the relevant category (the `announcements` and `emergency` categories already exist) **and** per-channel consent before a delivery row is created.

### Channels

`Email`, `SMS`, `In-App (future)` — reusing the `channel` CHECK vocabulary already in the schema. An announcement may target multiple channels; channel availability per org follows `composerChannels.ts` (in-app always; email/SMS gated on bindings). **In-App is the only channel that ships in this phase** since it needs no provider.

### Schema additions

```
announcements
  id, org_id, created_by, title, status (draft|scheduled|sent|archived),
  channels text[] (subset of sms|email|in_app), subject, body, body_format,
  template_id (nullable FK → communication_templates), send_at,
  sent_at, archived_at, metadata, created_at, updated_at

announcement_targets            -- the segment definition (composable rules)
  id, org_id, announcement_id, target_type
  (all_families|active_families|waitlist|program|room|location|custom),
  target_ref (program/room/location id, nullable), rule jsonb, created_at

announcement_recipients         -- resolved snapshot at schedule/send time
  id, org_id, announcement_id, person_id, channel, address,
  consent_state, suppressed_reason (nullable), status
  (pending|queued|sent|skipped|failed), communication_message_id (nullable),
  created_at
```

Add `announcement` to `communication_scheduled_sends.source` (or, preferably, drive announcement scheduling through the same worker-claim mechanism keyed on `announcements.send_at`). Promote `status` vocabularies to DB CHECK constraints — this is the class of bug the prior audit flagged (TS-only enums drifting from writers/readers).

### APIs

- `POST/PATCH /api/admin/communications/announcements` — CRUD + transition (draft↔scheduled, archive).
- `POST …/announcements/[id]/preview` — resolve audience → counts + sample rendered messages (no send).
- `POST …/announcements/[id]/schedule` and `…/cancel`.
- `POST …/announcements/[id]/send` — enqueue fan-out **through the existing `executeCommunicationsSend` enqueue path**, one canonical outbound message per recipient/channel.

### UI requirements

A three-step composer inside the Announcements tab: **Compose** (title, channel(s), template or freeform body, token preview) → **Audience** (segment builder with live resolved count and consent-suppression count) → **Review & Schedule/Send** (per-channel recipient breakdown, ready vs. suppressed, send now / schedule). A list view grouped by lifecycle state. Review-first by doctrine: never auto-send.

### Reuse from existing infrastructure

- **Send spine:** `executeCommunicationsSend.ts` → canonical enqueue (do not build a parallel sender).
- **Scheduling:** the `communication_scheduled_sends` claim-worker pattern (`claim_due_…` `SKIP LOCKED`).
- **Consent:** `communication_preferences` (`announcements`/`emergency` categories already present).
- **Receipts:** `communication_delivery_events` + per-recipient lifecycle (`communication_message_recipients`) — same provider-neutral model, lit up when providers come in Phase 3.
- **Channel availability:** `composerChannels.ts`.
- **Bodies:** Templates (§D) and the token engine.

---

## D. Templates Design

A **Template** is a reusable, tokenized message body (subject + body, per channel) that both the Inbox composer and Announcements can consume. Designed now to later back Tours, Enrollment, Billing, Attendance, General communications, and Workflow automation — i.e. the same template a workflow fires automatically, an operator can also pick manually.

### Schema additions

```
communication_templates
  id, org_id, key (stable slug), name, category
  (tour|enrollment|billing|attendance|general|workflow),
  channel (email|sms|in_app), status (draft|active|archived),
  subject (email only), body, body_format, created_by, created_at, updated_at

communication_template_versions   -- immutable history; active_version_id on parent
  id, template_id, version, subject, body, created_by, created_at
```

Channel-typed because SMS has no subject and a length budget; email carries subject + HTML. `category` lets each operational area (Tours, Enrollment, Billing, Attendance) filter to its own templates while sharing one engine.

### Email vs. SMS templates

- **Email:** subject + HTML/plaintext body; tokens in both; preview renders HTML.
- **SMS:** body only, plaintext; preview shows resolved length and segment count; reuse the empty-line/optional-omission pattern from `omitEmptyOptionalTourCommsLines()` so missing tokens don't leave dangling fragments.

### Variable / token system

**Reuse, don't reinvent.** Standardize on the workflow engine: `{{dot.path}}` syntax with `getByPath()` and `renderTemplate()` from `web/lib/workflowTemplate.ts`, and the documented merge-path catalog in `web/lib/agent/workflowAssist/workflowAssistMessageVariablesV1.ts` (`WORKFLOW_DOCUMENTED_MERGE_PATHS` — contact / person / opportunity / customer / job / schedule / location). This already covers the entities communications care about (family, child, program, location, staff). For authoring-time safety, reuse the forms resolver pattern (`web/lib/forms/inlineFieldTokens.ts`): `parse → validate against catalog → segment as resolved|missing|unknown`. Tours' `buildTourCommsMergeFields` is the reference for assembling a per-send context object.

### Preview experience

Authoring-time preview that (a) lists every token referenced, flags unknown/misspelled tokens against the catalog, and marks required-but-missing ones; (b) renders subject + body against a chosen sample record (a real family in the org) so the operator sees the actual resolved message; (c) for SMS shows character/segment count. This is the forms `InlineFieldTokenResolution` model applied to messages — proven and present.

### Can Forms/Documents token infrastructure be reused?

**Yes, substantially.** Three reusable layers already exist in the tree: the **render layer** (workflow `{{dot.path}}` + `getByPath`/`renderTemplate`), the **validation/preview layer** (forms `inlineFieldTokens` status segmentation), and the **per-channel context-assembly layer** (tour comms `buildTourCommsMergeFields` + channel branching + HTML polish). What is genuinely net-new is small: a **single shared catalog** of comms-available tokens (today each system declares its own) and the template CRUD/preview UI. Estimated reuse is high; the risk to avoid is introducing a *fourth* token syntax — pick `{{dot.path}}` and converge.

---

## E. Drawer Communications Review

The drawer Communications tab (`CommunicationsDrawerSection.tsx`) today already shows conversation history + composer and does **not** own Notes or Tasks (they are sibling drawer sections per `20260531140000_person_drawer_layout_runtime_v1.sql`). The review confirms and tightens this boundary.

**1. Should Notes remain separate? — Yes.** Notes are *internal records* (staff observations, context) and are never transmitted to a family. Folding them into Communications would blur "what we said to the family" with "what we said about the family" — the exact mixing Alloy doctrine forbids. Keep Notes as its own drawer section.

**2. Should Tasks remain separate? — Yes.** Tasks are *operational execution* (follow-ups, to-dos). A task may *result in* a communication, but the task itself is work tracking, not a message. Keep Tasks as its own drawer section; link a task to a resulting communication by reference if useful, but do not merge the surfaces.

**3. Should Communications be limited to Email / SMS / In-App / conversation history / attachments? — Yes.** The drawer Communications tab should be exactly: outbound + inbound **Email** and **SMS**, **In-App** (future), the unified **conversation history** for that record, and **attachments** (note: no attachment/MMS media schema exists yet — that is future schema, not present today). Nothing internal, nothing operational.

**Final recommendation & rationale.** Preserve the three-way separation — **Communications = communications, Notes = internal records, Tasks = operational execution** — and keep the drawer's Communications tab focused on *communication history + conversation + composer* only. The codebase already implements this separation; the recommendation is to **hold the line and not let Announcements/Templates leak internal or operational concepts into the conversation surface**. The drawer answers "what is our message history with this family"; the Inbox answers "which conversations need work"; Announcements answers "what are we broadcasting"; none should absorb Notes or Tasks.

---

## F. Implementation Plan

Sequenced so every phase ships operator value with **flags default-off** and **no provider dependency until Phase 3**. Aligns to the requested phasing.

### Phase 1 — Announcements MVP + Templates MVP (no providers)

- **Templates MVP:** `communication_templates` (+ versions) schema; converge on the `{{dot.path}}` engine + forms-style validation; authoring UI with live preview against a sample record; email + SMS template types. No sending required to land value — templates are immediately useful to the existing composers.
- **Announcements MVP:** `announcements` / `announcement_targets` / `announcement_recipients` schema; compose → audience → review flow; audience resolvers for All / Active / Waitlist / Program / Room / Location with live counts; consent suppression via `communication_preferences`.
- **Ship channel: In-App only.** In-app needs no provider, so the full Announcements loop (compose → target → review → deliver → appears in recipient timeline) is demonstrable end-to-end now. Email/SMS are composable and previewable but **queued, not delivered**, until Phase 3.
- Promote new `status`/vocabulary columns to DB CHECK constraints from the start.

### Phase 2 — SMS UX activation + Template variables + Scheduled sends

- **SMS UX activation:** full SMS authoring/preview parity (length/segment counts, no-subject handling) across composer, templates, announcements — UX only; still no live SMS provider traffic.
- **Template variables:** wire the shared token catalog into both the Inbox composer and Announcements; required-token enforcement; per-record preview substitution.
- **Scheduled sends:** extend `communication_scheduled_sends` (or the announcement worker) for **operator-composed and bulk** scheduling; surface scheduled announcements under the Announcements `Scheduled` state and scheduled replies under the Inbox `scheduled` folder (no new tab, per §B). Reconcile consent to a single source (`communication_preferences`) read by both eligibility and the send gate.

### Phase 3 — Provider activation (out of scope for this phase)

- Provider/binding administration, Email + SMS live delivery, **delivery tracking** (light up `communication_delivery_events` + per-recipient receipts), **replies / inbound** (email inbound provider decision required), and **in-app messaging** maturation. This is the existing provider-activation track (ACT-7 etc.) and the pre-activation hardening from `communications_v2_post_import_audit.md` (org-scoping the receipt write path, enum reconciliation, send↔receipt coupling) gate it.

### Doctrine guardrails (all phases)

- **Communications are communications; Notes are internal records; Work/Tasks are operational execution** — never merged (§E).
- **Reuse the canonical send spine, scheduling worker, consent store, receipt model, and token engines** — no parallel implementations.
- **Review-first, flags default-off, no auto-send.**
- **Channels live inside surfaces** (Inbox / Announcements), never as their own nav — so In-App and future channels slot in without IA change.

---

## Appendix — Load-bearing files (this tree)

| Concern | File(s) |
|---|---|
| Inbox surface | `web/app/adminV2/components/InboxModal.tsx`, `web/app/adminV2/messages/InboxPanel.tsx` |
| Folders / threads | `web/lib/communications/inboxThreadTypes.ts`, `inboxThreadsService.ts`, `inboxFolderCache.ts`, `inboxEntityDrawerTarget.ts` |
| Drawer communications | `web/components/admin/communications/CommunicationsDrawerSection.tsx`, `web/lib/adminV2/messaging/drawerCommunicationsEntity.ts` |
| Send path | `web/lib/communications/executeCommunicationsSend.ts` |
| Channels / delivery | `web/lib/communications/composerChannels.ts`, `deliveryStateAdapter.ts`, `web/lib/communications/v2/deliveryReceipts.ts` |
| Preferences | `web/lib/communications/v2/preferences.ts`, `supabase/migrations/20260611140000_comms_v2_preferences_recipients.sql` |
| Scheduled sends | `supabase/migrations/20260521103000_task_assist_v1_1_foundation.sql`, `20260522140000_claim_due_communication_scheduled_sends.sql` |
| Token engines (reuse) | `web/lib/workflowTemplate.ts`, `web/lib/agent/workflowAssist/workflowAssistMessageVariablesV1.ts`, `web/lib/forms/inlineFieldTokens.ts`, `web/lib/tours/comms/tourCommsTemplates.ts` |
| Flags | `web/lib/communications/v2/flags.ts` |
| Schema (foundation) | `supabase/migrations/20260430254100_communications_v1_foundation.sql`, `20260611120001_…conversation_core.sql`, `20260611130000_…delivery_events_receipts.sql` |

## Appendix — Open questions for Kelly

1. **Branch baseline:** this audit reflects `claude/pos-packet-parent-submission-20260622`, where Announcements/Templates are reserved flags only. The prior staging audit (`4c71170b`) listed announcement/template *tables* as existing. Confirm whether staging already has partial Announcements/Templates schema this proposal should converge with rather than create fresh.
2. **In-App scope:** is an in-app/notification inbox surface for families in scope as the Phase-1 delivery target, or is in-app strictly an operator-side timeline entry for now?
3. **Segment persistence:** should audience segments be saved, named, reusable objects (recommended), or per-announcement only in the MVP?
4. **Token syntax convergence:** OK to standardize all communication templates on the workflow `{{dot.path}}` engine and retire the per-feature placeholder variants over time?
