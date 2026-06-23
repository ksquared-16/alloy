# Communications V2 — Phase 1 Sprint Plan (Implementation-Ready)

**Path:** `docs/sprints/06_2026/communications-v2/communications_v2_phase1_sprint_plan.md`
**Status:** Implementation-ready plan — **planning only; do not implement yet.**
**Date:** 2026-06-22
**Source of truth:** `communications_v2_phase_next_audit.md` (this folder).
**Scope owner:** Claude (POS / Documents / Communications / Sprint packages).

## Locked decisions (constraints for this sprint)

1. Notes and Tasks stay **separate** from Communications — never merged.
2. Drawer Communications = message history + Email/SMS composer + (future) In-App + (later) attachments. Nothing else.
3. Communications Hub IA = **Inbox · Announcements · Templates · Preferences**.
4. Scheduled stays **embedded** (Inbox `scheduled` folder + Announcements `Scheduled` state). No separate top-level tab.
5. **No provider activation** (no Twilio, SendGrid/Resend, webhooks, inbound replies, delivery tracking, 10DLC).
6. **In-App parent delivery is NOT a dependency.** Verified: no parent/portal surface exists in this tree (`in_app` is referenced only in `web/app/adminV2/messages/InboxPanel.tsx` and the drawer). In Phase 1, "In-App" means an **operator-side timeline/record entry only** — not a family-facing inbox.
7. Email/SMS appear in the UX now but are **provider-gated**: composable, previewable, but **never delivered and never queued** until a real provider binding plus a live sender exist (Phase 3).

## Corrections applied (2026-06-22, post-approval)

1. **Provider-unavailable is `skipped`, not `queued`.** Email/SMS without an active provider binding resolve to `status='skipped'`, `suppressed_reason='provider_unavailable'`. They are marked `queued` **only** when a real provider binding exists *and* a downstream sender can later process them. Since provider activation is Phase 3, Email/SMS resolve to `skipped` throughout Phase 1.
2. **Templates strictly first.** Implement B0 → B1 → B2 → B3 and **validate the Templates MVP before any Announcements work begins** (B4+ are blocked on B3 passing).
3. **In-App stays narrow.** In-App = operator-side timeline/record entry only. No parent-facing inbox, no parent-portal delivery, no family-facing notification behavior.

## What "done" means for Phase 1

A child-care operator can (a) author reusable Email/SMS **templates** with `{{dot.path}}` tokens and preview them against a real family; and (b) compose an **Announcement**, resolve an audience (All / Active / Waitlist / Program / Room / Location) with live counts and consent suppression, and **schedule** it — with the send fan-out writing a canonical message row only where it can do real work: an **operator-side timeline entry for In-App**, and a **`skipped` (provider_unavailable)** outcome for Email/SMS (no row, nothing transmitted) until Phase 3 supplies a binding and live sender. Everything ships behind default-off flags.

---

## A. Schema plan

Five new tables, all additive on the V1 foundation, all following the **exact established pattern** from `20260611140000_comms_v2_preferences_recipients.sql`: `org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE`; FK-less uuid actor ids (repo convention); `created_at/updated_at timestamptz default now()`; RLS enabled with an org-member `SELECT` policy via `user_roles` and a `service_role` `ALL` policy; vocabularies that were free-text in PKG-02/04 are **promoted to DB `CHECK`** here per the audit's enum-drift finding.

Two migrations, in dependency order:

- `2026XXXXNNNNNN_comms_v2_templates.sql` — `communication_templates`, `communication_template_versions`.
- `2026XXXXNNNNNN_comms_v2_announcements.sql` — `announcements`, `announcement_targets`, `announcement_recipients`.

### A.1 `communication_templates`

```
id                uuid pk default gen_random_uuid()
org_id            uuid not null references public.orgs(id) on delete cascade
key               text not null                 -- stable slug, unique per org
name              text not null
category          text not null  CHECK (category IN
                    ('tour','enrollment','billing','attendance','general','workflow'))
channel           text not null  CHECK (channel IN ('email','sms','in_app'))
status            text not null DEFAULT 'draft'
                    CHECK (status IN ('draft','active','archived'))
subject           text                          -- email only; NULL for sms/in_app
body              text not null DEFAULT ''
body_format       text not null DEFAULT 'text'  CHECK (body_format IN ('text','html'))
active_version_id uuid                          -- points at current template_versions row
created_by        uuid
created_at        timestamptz not null default now()
updated_at        timestamptz not null default now()
CONSTRAINT communication_templates_org_key_uq UNIQUE (org_id, key)
-- guard: SMS/in_app carry no subject
CONSTRAINT communication_templates_subject_channel_chk
  CHECK (channel = 'email' OR subject IS NULL)
```

Indexes: `(org_id, category, channel)`, `(org_id, status)`.

### A.2 `communication_template_versions` (immutable history)

```
id          uuid pk default gen_random_uuid()
org_id      uuid not null references public.orgs(id) on delete cascade
template_id uuid not null references public.communication_templates(id) on delete cascade
version     integer not null
subject     text
body        text not null
body_format text not null DEFAULT 'text' CHECK (body_format IN ('text','html'))
created_by  uuid
created_at  timestamptz not null default now()
CONSTRAINT communication_template_versions_uq UNIQUE (template_id, version)
```

Append-only (no UPDATE in app code). `communication_templates.active_version_id` is set to the chosen version. Index `(org_id, template_id)`.

### A.3 `announcements`

```
id           uuid pk default gen_random_uuid()
org_id       uuid not null references public.orgs(id) on delete cascade
created_by   uuid
title        text not null
status       text not null DEFAULT 'draft'
              CHECK (status IN ('draft','scheduled','sent','archived'))
channels     text[] not null DEFAULT '{}'      -- subset of email|sms|in_app
template_id  uuid references public.communication_templates(id) on delete set null
subject      text
body         text not null DEFAULT ''
body_format  text not null DEFAULT 'text' CHECK (body_format IN ('text','html'))
send_at      timestamptz                        -- set when status='scheduled'
sent_at      timestamptz
archived_at  timestamptz
metadata     jsonb not null DEFAULT '{}'
created_at   timestamptz not null default now()
updated_at   timestamptz not null default now()
-- channel-vocabulary guard (Postgres array-subset check)
CONSTRAINT announcements_channels_chk
  CHECK (channels <@ ARRAY['email','sms','in_app']::text[])
-- scheduled requires a future send_at
CONSTRAINT announcements_scheduled_chk
  CHECK (status <> 'scheduled' OR send_at IS NOT NULL)
```

Indexes: `(org_id, status)`, `(org_id, status, send_at)` (worker scan for due scheduled).

### A.4 `announcement_targets` (composable segment definition)

```
id              uuid pk default gen_random_uuid()
org_id          uuid not null references public.orgs(id) on delete cascade
announcement_id uuid not null references public.announcements(id) on delete cascade
target_type     text not null CHECK (target_type IN
                  ('all_families','active_families','waitlist',
                   'program','room','location','custom'))
target_ref      uuid              -- program/room/location id; NULL for set-level targets
rule            jsonb not null DEFAULT '{}'   -- reserved for 'custom' composition
created_at      timestamptz not null default now()
```

Multiple rows compose (intersection semantics resolved in the API layer). Index `(org_id, announcement_id)`.

### A.5 `announcement_recipients` (resolved snapshot at schedule/send)

```
id                       uuid pk default gen_random_uuid()
org_id                   uuid not null references public.orgs(id) on delete cascade
announcement_id          uuid not null references public.announcements(id) on delete cascade
person_id                uuid                       -- FK-less, repo convention
channel                  text not null CHECK (channel IN ('email','sms','in_app'))
address                  text                       -- email/e164 snapshot; NULL for in_app
consent_state            text CHECK (consent_state IN ('opted_in','opted_out','unset'))
suppressed_reason        text                       -- e.g. 'no_consent','no_address','provider_unavailable'
status                   text not null DEFAULT 'pending'
                          CHECK (status IN ('pending','queued','sent','skipped','failed'))
communication_message_id uuid references public.communication_messages(id) on delete set null
created_at               timestamptz not null default now()
CONSTRAINT announcement_recipients_uq UNIQUE (announcement_id, person_id, channel)
```

The snapshot is the audit-grade record of *who an announcement targeted, on what channel, with what consent, and what happened* — independent of later roster changes. Index `(org_id, announcement_id, status)`.

### A.6 Required CHECK constraints (summary)

Promoted to the DB (not TS-only), closing the enum-drift class flagged in the audit: template `category`/`channel`/`status`/`body_format`; announcement `status`/`body_format` + `channels` array-subset + scheduled-needs-`send_at`; target `target_type`; recipient `channel`/`consent_state`/`status`. TS vocabularies (in `web/lib/communications/v2/*`) must be asserted equal to these via schema-parity tests (§E), exactly like `commsV2ConversationCoreSchema.test.ts` does today.

### A.7 RLS / security assumptions

Mirror the foundation pattern verbatim for all five tables:

```
ALTER TABLE … ENABLE ROW LEVEL SECURITY;
CREATE POLICY …_select_org  ON … FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.org_id = ….org_id));
CREATE POLICY …_service_all ON … FOR ALL    TO authenticated
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
GRANT … TO service_role;  -- mutations only via service_role
```

Assumptions, carried from the foundation: org members **read** via `user_roles`; **all writes go through the Next admin API as `service_role`** (RLS bypassed), so **app-layer `org_id` scoping is the only write-side tenant boundary** — every new route must scope by `ctx.orgId` on both reads and writes. This is the same posture the audit flagged on the receipt path; new Phase-1 writers must not repeat that omission. No new RLS *primitive* is introduced. Permission gate on every route: `requireAdminOrOps()` (matching `web/app/api/admin/communications/**`).

### A.8 Feature flags

All flags already exist in `web/lib/communications/v2/flags.ts` and default OFF — no new flag keys needed:

| Surface | Flag |
|---|---|
| Templates tab + CRUD | `comms_v2_templates` |
| Announcements tab + builder | `comms_v2_announcements` |
| Preferences tab | `comms_v2_preferences` |
| Hub shell / Inbox redesign | `comms_v2_command_center` |

Provider gating is **separate** from these flags: Email/SMS UX renders under the feature flags, but actual transmission is gated by binding availability (`composerChannels.ts` → `activeOutboundBindings`). With no active binding, Email/SMS recipients resolve to `status='queued'`, `suppressed_reason='provider_unavailable'` and are never transmitted.

---

## B. API plan

All routes under `web/app/api/admin/communications/`, using the established shape: `requireAdminOrOps()` → `getAdminContextCached()` (→ `ctx.orgId`) → `createAdminClient()`, UUID validation, explicit `org_id` predicates on every query. JSON in/out, 400 on bad input, 403 via the guard.

### B.1 Template CRUD

```
GET    /communications/templates              ?category=&channel=&status=   list (org-scoped)
POST   /communications/templates              create (draft) + initial version
GET    /communications/templates/[id]         read (with active version)
PATCH  /communications/templates/[id]         update meta/status; new version on body change
DELETE /communications/templates/[id]         archive (soft: status='archived', not row delete)
```

`PATCH` that changes `subject`/`body` inserts a new `communication_template_versions` row and repoints `active_version_id` (immutable history). Validation rejects `subject` on non-email channels.

### B.2 Template preview / render

```
POST /communications/templates/[id]/preview
  body: { sample_person_id? , sample_opportunity_id? }
  → { subject, body, tokens: [{path, status: resolved|missing|unknown, value}],
      sms?: { length, segments } }
```

Pure render path (no send, no provider). Builds a context object from the sample record, runs the §D engine, returns resolved output + token diagnostics. Reuses the forms resolution shape (`InlineFieldTokenResolution`) adapted to `{{dot.path}}`.

### B.3 Announcement CRUD

```
GET    /communications/announcements          ?status=    list grouped by lifecycle
POST   /communications/announcements          create (draft)
GET    /communications/announcements/[id]      read (+ targets)
PATCH  /communications/announcements/[id]      update draft (title/channels/body/template_id/targets)
DELETE /communications/announcements/[id]      archive
```

### B.4 Announcement audience preview

```
POST /communications/announcements/[id]/audience-preview
  → { resolved_count, by_channel: {email, sms, in_app},
      suppressed: {no_consent, no_address, provider_unavailable},
      sample: [{person_id, name, channel, consent_state}] }
```

Resolves `announcement_targets` against CRM joins (customers / customer_members / opportunities / locations), intersects composed targets, filters through `communication_preferences` for the `announcements` category + per-channel consent. **Read-only** — writes nothing.

### B.5 Announcement schedule / cancel

```
POST /communications/announcements/[id]/schedule   body: { send_at }   draft→scheduled, snapshot recipients
POST /communications/announcements/[id]/cancel                          scheduled→draft, clear snapshot/send_at
```

`schedule` resolves the audience and **writes the `announcement_recipients` snapshot** so a later roster change can't alter an in-flight send (validates `send_at` is in the future, mirroring `communication_scheduled_sends.scheduled_for > approved_at`).

### B.6 Announcement send / queue placeholder (provider-unavailable safe)

```
POST /communications/announcements/[id]/send       send now: resolve (if needed) → fan-out → status='sent'
POST /communications/communications/announcements/process-due   worker: claim due scheduled, fan-out
```

Fan-out iterates the recipient snapshot and, per recipient/channel, **calls the existing canonical enqueue (`executeCommunicationsSend.ts`)** to create one `communication_messages` row. Provider boundary:

- **In-App** → message row created, appears in the **operator-side** timeline/record entry → recipient `status='sent'` (no provider, no parent-facing delivery).
- **Email / SMS** → recipient `status='skipped'`, `suppressed_reason='provider_unavailable'` whenever no active provider binding exists. **Do NOT mark `queued` unless a real provider binding exists AND a downstream sender can later process it.** Provider activation is Phase 3 (no live sender yet), so Email/SMS resolve to `skipped` in Phase 1. **No message row is created for skipped recipients; nothing is transmitted.**

The scheduled worker reuses the `SKIP LOCKED` claim pattern from `claim_due_communication_scheduled_sends()` — either extend that function for `source='announcement'` or add an analogous `claim_due_announcements()`. Idempotency via the recipient `UNIQUE (announcement_id, person_id, channel)` + status guard (never re-enqueue a non-`pending` recipient).

---

## C. UI plan

All gated by the flags in A.8; renders nothing new when off.

### C.1 Communications Hub top-level tabs

Introduce the Hub shell hosting **Inbox · Announcements · Templates · Preferences** as sibling tabs. Inbox reuses the existing `InboxModal`→`InboxPanel`; the new tabs mount alongside. No new route — consistent with the locked "modal stays" doctrine in the UX redesign doc. **Scheduled is not a tab**: scheduled replies remain the Inbox `scheduled` folder; scheduled announcements are the `Scheduled` group in the Announcements list.

### C.2 Templates list / editor / preview

- **List:** filter by category/channel/status; columns name, channel, category, status, updated.
- **Editor:** name/key, category, channel (email/sms/in_app), subject (email only — hidden for SMS), body with a **token picker** sourced from the §D catalog; channel-aware (SMS shows length/segment meter, no subject).
- **Preview:** pick a sample family → live resolved subject/body, a token panel marking `resolved | missing | unknown` (reuse the forms `InlineFieldTokenSegment` visual pattern), SMS segment count.

### C.3 Announcements list / builder / review

- **List:** grouped by lifecycle (Draft / Scheduled / Sent / Archived).
- **Builder (3 steps):** **Compose** (title, channels, template-or-freeform body, token preview) → **Audience** (segment rules with live resolved count + consent-suppression count from B.4) → **Review** (per-channel ready vs. suppressed breakdown; Send now / Schedule). Review-first; never auto-send.
- **Provider-gated affordances:** Email/SMS selectable and previewable always; when no active binding, the Review step shows a non-blocking "Will not send — provider not yet active" notice and those recipients render as suppressed `provider_unavailable` (`skipped`). In-App always available (operator-side timeline entry only).

### C.4 Drawer communications cleanup + SMS UX provider-gating

- **Cleanup:** confirm the drawer Communications tab (`CommunicationsDrawerSection.tsx`) renders **only** message history + composer; assert Notes/Tasks are not referenced here (they are sibling drawer sections per `20260531140000_person_drawer_layout_runtime_v1.sql`). Remove/await any decorative controls that imply unavailable capability (attachments is **later**, not Phase 1 — no attach button that does nothing).
- **SMS UX provider-gating:** the SMS channel toggle stays visible via `composerChannels.ts`, but when no active SMS binding exists the composer shows a clear "SMS not yet active — will not send" state and disables transmission entirely (no send, no queue; resolves `skipped`), matching decision 7. Same treatment for Email.

---

## D. Token plan

### D.1 Standardize on `{{dot.path}}`

One syntax for all communication templates: `{{dot.path}}`, e.g. `{{person.first_name}}`, `{{location.name}}`, `{{opportunity.metadata.tour_date}}`. Retire the per-feature placeholder variants (enrollment `{{household_name}}`, tour `{{parent_name}}`) **over time** by mapping them onto catalog paths — not in Phase 1, but Phase 1 introduces no new competing syntax.

### D.2 Reuse `workflowTemplate.ts`

Render through the existing, tested engine — confirmed signatures:

- `getByPath(obj, path)` — dot traversal.
- `renderTemplate(templateString, eventPayload)` — replaces `{{path}}` via `getByPath`, **`null/undefined → ""`** (graceful missing-token behavior, no crash).

No new render code; the template/announcement render path calls `renderTemplate` with a context object. SMS empty-line cleanup reuses `omitEmptyOptionalTourCommsLines` from `web/lib/tours/comms/tourCommsTemplates.ts`.

### D.3 Reuse forms inline-token validation pattern

Authoring-time validation/preview adopts the model from `web/lib/forms/inlineFieldTokens.ts` (`resolveInlineFieldTokens`, `InlineFieldTokenResolution`, segment statuses `resolved|missing|unknown`, `parseInlineFieldTokenKeys`, `validateInlineFieldTokenKeys`). New thin module `web/lib/communications/v2/templateTokens.ts` adapts these to `{{dot.path}}`: parse paths, validate against the catalog (D.4), segment for preview. This is the only net-new token code, and it is small.

### D.4 Initial communication token catalog

Seed from `WORKFLOW_DOCUMENTED_MERGE_PATHS` (`web/lib/agent/workflowAssist/workflowAssistMessageVariablesV1.ts`), filtered/renamed for communications and grouped for the picker. Initial set:

```
family   : {{customer.id}}, {{customer.name}}
child    : {{person.first_name}}, {{person.name}}, {{person.id}}
contact  : {{contact.email}}, {{contact.phone}}
location : {{location.name}}
program  : {{opportunity.program}}            (where available)
tour     : {{opportunity.metadata.tour_date}}, {{opportunity.metadata.tour_time}}
org      : {{org.name}}
```

The catalog is a single typed source of truth (`COMMUNICATION_TOKEN_CATALOG` in `templateTokens.ts`) consumed by the editor picker, the validator, and the preview. Each entry: `{ path, label, group, sample }`. Unknown paths in a body are flagged `unknown` at authoring time; missing-at-render values resolve to empty string per D.2.

---

## E. Testing plan

Vitest (`vitest run`), tests under `web/tests/communications/`, matching existing naming.

### E.1 Unit tests

- `commsV2TemplatesSchema.test.ts` / `commsV2AnnouncementsSchema.test.ts` — **schema-parity** (TS vocabularies ⇔ migration CHECKs), mirroring `commsV2ConversationCoreSchema.test.ts`. The enum-drift guard.
- `templateTokens.test.ts` — parse/validate/segment `{{dot.path}}`; unknown vs missing; SMS empty-line omission.
- `templateRender.test.ts` — `renderTemplate` integration for email (subject+body) and SMS (length/segments); null→empty.
- `announcementAudience.test.ts` — pure target-composition/intersection logic; consent suppression buckets; recipient snapshot determinism.
- `announcementFanout.test.ts` — provider-boundary routing: in_app→sent (operator-side row), email/sms with no live sender→skipped(provider_unavailable) with **no** message row; `queued` only when a real binding + downstream sender exist; idempotency on re-run.

### E.2 API tests

- Template CRUD: create→version-on-edit→archive; org-scoping (cannot read/write across `org_id`); subject-on-non-email rejected.
- Template preview: resolved/missing/unknown token reporting; no writes.
- Announcement CRUD + schedule/cancel: draft→scheduled writes snapshot; cancel clears it; `send_at` future-only.
- Send/queue: asserts **no transmission** occurs and Email/SMS land `skipped` (provider_unavailable) — never `queued`, never `sent` — when no live sender exists.

### E.3 UI smoke tests

- Hub renders 4 tabs only when flags on; renders nothing when off.
- Templates editor: SMS hides subject + shows segment meter; email shows subject.
- Announcements builder: 3-step flow advances; audience step shows counts; review shows ready/suppressed.
- Drawer: Communications tab shows history+composer only; no Notes/Tasks leakage; no dead attachment control.

### E.4 Provider-gated behavior tests

The compliance backbone of the sprint — assert decisions 5 & 7:

- With no active binding (Phase 1 default): Email/SMS recipients resolve `skipped` + `provider_unavailable`; **never `queued`**; **zero** `communication_messages` rows for those; **zero** provider calls.
- In-App with no provider: succeeds (`sent`), appears in the operator-side timeline only (no parent-facing delivery).
- Flags on but bindings absent: UX renders, transmission does not occur, nothing is queued.
- Negative test: no code path in this sprint imports/touches Twilio/Resend/webhook/inbound modules (guard test grepping the new files' imports).

---

## F. Delivery sequence (small, independently-validatable batches)

Each batch is independently reviewable, lands behind default-off flags, and is gated by its own tests before the next begins.

| Batch | Deliverable | Validates against | Depends on |
|---|---|---|---|
| **B0 — Token core** | `templateTokens.ts` (catalog + `{{dot.path}}` parse/validate/segment) wrapping `workflowTemplate.renderTemplate`; no schema, no UI | `templateTokens.test.ts`, `templateRender.test.ts` | — |
| **B1 — Template schema** | `comms_v2_templates.sql` (templates + versions, CHECKs, RLS) | `commsV2TemplatesSchema.test.ts` (parity) | — |
| **B2 — Template API** | CRUD + preview/render routes | API tests (E.2), org-scoping | B0, B1 |
| **B3 — Template UI** | Templates list/editor/preview behind `comms_v2_templates` | UI smoke (E.3) | B2 |
| **— Templates MVP gate —** | **B0–B3 must be merged and validated before any batch below starts.** | | |
| **B4 — Announcement schema** | `comms_v2_announcements.sql` (announcements + targets + recipients, CHECKs, RLS) | `commsV2AnnouncementsSchema.test.ts` | **B3 validated** |
| **B5 — Audience resolver** | Pure target→recipient resolution + consent suppression; `audience-preview` route | `announcementAudience.test.ts`, API test | B4 |
| **B6 — Announcement CRUD + schedule/cancel** | CRUD + schedule (snapshot) + cancel routes | API tests (E.2) | B4, B5 |
| **B7 — Fan-out + provider boundary** | send route + scheduled worker claim; provider-gated routing (skip, never queue) | `announcementFanout.test.ts`, provider-gated tests (E.4) | B5, B6 |
| **B8 — Announcement UI** | List + 3-step builder + review behind `comms_v2_announcements` | UI smoke (E.3) | B7, B3 |
| **B9 — Drawer cleanup + SMS UX gating** | Drawer Communications scoped to history+composer; Email/SMS skip-only gating | UI smoke + provider-gated tests | B3 |

**Sequencing notes (corrected — Templates strictly first).** Phase 1 runs the **Templates track first and in order: B0 → B1 → B2 → B3.** No Announcements batch (B4+) or drawer batch (B9) begins until the **Templates MVP (B0–B3) is validated** (schema-parity + API + UI smoke green). Within the Templates track, B0 (token core, no schema/UI) is the foundation and is the only batch in scope right now. After the gate, the Announcements track (B4→B5→B6→B7→B8) runs in order; B7 is the **compliance-critical** batch — its provider-boundary tests (E.4) are the gate proving decisions 1, 5 & 7 hold (Email/SMS `skipped`, never `queued`, no provider code).

## Out of scope (must not appear in any Phase-1 batch)

Provider activation, Twilio, SendGrid/Resend, webhooks, inbound replies, delivery tracking, 10DLC, attachment/MMS media schema, a parent-facing In-App surface, and any Command Center/family-workspace redesign beyond hosting the four Hub tabs. Email/SMS transmission stops at `queued`; In-App stops at the operator timeline.

## Open items to confirm before B0

1. **Staging convergence:** does staging already carry partial `announcements`/`communication_templates` schema (the prior `4c71170b` audit referenced them)? If so, B1/B4 reconcile rather than create.
2. **`opportunity.program` availability:** confirm the program token's source path before seeding the catalog (D.4) — it may need a resolver rather than a direct path.
3. **Scheduled worker:** extend `claim_due_communication_scheduled_sends()` for `source='announcement'`, or add a parallel `claim_due_announcements()`? (Plan assumes the latter for isolation; either is fine.)
