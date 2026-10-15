---
owner: modules
status: canonical
last_reviewed: 2026-10-09
supersedes: []
---

# Communications platform

**Status:** Canonical platform module doc.

Canonical Communications V1 — threads, messages, provider bindings, scheduled sends.

**Identity platform (Phase 2):** [Communications Identity Platform](./communications-identity-platform.md) — provider accounts, communication identities, canonical sender resolution.

**Runtime contract:** [communications-runtime-contract.md](./communications-runtime-contract.md)

---

## Capabilities

| Area | Status |
|------|--------|
| Canonical threads/messages | Complete |
| Outbound enqueue + worker | Complete |
| Provider webhooks (Twilio/Resend) | Complete |
| Entity-scoped drawer UI | Complete |
| Scheduled sends (tours) | Complete |
| Legacy `messages` table | Compatibility — retirement path documented |

---

## Architecture

- **Threads:** `communication_threads` — org + entity + channel + recipient_key
- **Messages:** `communication_messages` — queued → sent/failed lifecycle
- **Bindings:** `communication_provider_bindings` per org/channel
- **Enqueue:** `canonicalOutboundEnqueue.ts` — server-only writes (service role)

---

## Rules

- No client direct DB writes for outbound
- Stage work may auto-associate contact attempts (enrollment Contacting stage) — only when the
  sending entry point declares the work consequence (Current Work); a generic send never completes
  work (see [`stage-membership-and-outcomes.md`](../core/stage-membership-and-outcomes.md) § Command-result sufficiency)
- Drawer/inbox warm deferred on work-unit entry for performance

---

## Operator surfaces (Communications V2, July 2026)

| Surface | Entry | Purpose |
|---------|-------|---------|
| **Communications modal** | `/workspace` → top nav **Inbox** | Primary operator hub when `comms_v2_command_center` is enabled |
| **Drawer Communications** | Entity drawer tab | Record-specific conversations only |
| **Configuration → Communications** | `/organization/communications` | Provider bindings / channel setup (also embedded in modal Channels tab) |
| **`/adminV2/communications`** | Direct URL | Deprecated notice — not in nav |
| **`/admin/communications`** | Legacy path | Deprecated / non-primary |

### Modal navigation (Operational Workspace Doctrine V2)

Communications composes `@/components/workspace/doctrine` — same primitive stack as Processing (Digital Mailroom). Presentation only; send/thread/announcement/template runtimes unchanged.

| Mode | Sections |
|------|----------|
| **Work** | Overview · Inbox · Announcements · Scheduled |
| **Studio** | Templates · Channels · Rules |

Default Work tab on open: **Overview**. Header action: **Compose New** (Overview + Inbox).

Implementation: `CommunicationsWorkspaceShell`, `CommunicationsModalTabPanel`, `InboxModal`. Sprint closeout: `../../sprints/archive/07_2026/communications-product-shell-translation/README.md` (historical: `../../sprints/archive/07_2026/communications-product-shell-translation/README.md`).

**Operational health (Doctrine V3):** Work → Inbox, Announcements, and Scheduled (and Studio → Templates) render a flat `WorkspaceOperationalHealth` nav band via `CommunicationsWorkspaceKpiStrip` — same primitive and adapter pattern as Processing and Work Items. Overview omits the nav band. Metrics are operational only (no inventory totals such as Categories or Sent 7d). Each metric reserves a trend placeholder line.

Templates and Announcements inside the modal do not require separate feature flags beyond command center. See `../../sprints/archive/06_2026/communications-v2/operator-surface-consolidation.md`.


### Work Items convergence (Needs Reply — July 2026)

Communications **Needs Reply** threads (`attention_state` ∈ `needs_response`, `awaiting_parent_reply`) may project into Work Items as virtual rows (`communications:{threadId}`) when loadable and not resolved.

- **No** `operational_tasks` row is created.
- Unread alone does not project.
- **View in Work Items** / **Open in Communications** use shared navigation events and command-center pending selection.
- Authoritative resolution or reply through Communications removes the projection after operational refresh.

QA: `../../sprints/archive/08_2026/work-items-v3-platform/qa/slice-6/`.

### Canonical communications runtime (Phase 2, July 2026)

Communications has **one canonical runtime** with multiple presentation surfaces. Activity (`activity_embed`) is the compact presentation; Workspace Inbox (`workspace_inbox`) is the operational presentation. Both consume the same runtime contract for Preview VM hydration, thread selection, composer state, recipient state, send preflight/confirm, stale request protection, post-send refresh, reply collapse, and cache ownership.

**Send confirmation (operator):** Compose → **Send** opens a shared centered confirmation (`FamilySendConfirmationDialog`) that previews the **exact current draft** (subject/body, including any Tour Invitation Link already in the body). **Back to edit** dismisses without sending. **Confirm send** invokes canonical `family-send` once. Success shows a centered acknowledgement (**Message sent** / **Tour invitation sent**); **Done** closes the Current Work command surface and returns to the Focus Panel (no redundant post-send What's Next summary card). Activity/work refreshes fire on confirm; the acknowledgement is presentation-only.

**Operator Activity projection (Enrollment Focus Panel):** What's Next Recent Activity and Focus Panel → Activity share one normalized timeline (`resolveLayoutRuntimeActivityTimeline` / `formatOpportunityActivityTimelineEvent`). Headlines answer *what happened* (e.g. **Tour invitation sent**, **Email sent**, **Wrigley Kurzman moved to Waitlist**, **Lead created**) — not which work template was open (`Contact Family`). Technical duplicates from one send (message_queued/sent + work-template `action_executed`) collapse behind the richer fact; contact-attempt outcomes may remain as a distinct secondary row when they carry separate operational meaning. Child-grain stage moves must name the child; family/case moves must not invent one.

Canonical contract: [`communications-runtime-contract.md`](communications-runtime-contract.md).

Workspace Inbox owns only the operational queue and surrounding context controls. It must not maintain a separate family-workspace load/send/thread lifecycle.

---

## Template Library (Communications V2)

**Canonical asset:** `communication_templates` + immutable `communication_template_versions` (`current_version_id` on the template row). Org-scoped list/create/update via `/api/admin/communications/templates`.

### Integration by surface

| Surface | Template integration | Send / schedule behavior |
|---------|---------------------|--------------------------|
| **Template Library** (modal tab) | Authoring + versioning | N/A — registry only |
| **Record New Message composer** (`FamilyNewMessageComposer`: Current Work → Contact Family / Send Message / Tour Invitation, Manage → Send Message / Email / SMS / Tour Invitation) and every `FamilyCommunicationWorkspaceView` composer | **Template ▾** in the editor toolbar (`ComposerTemplateMenu`): channel-filtered active templates; applies `current_version` as an editable copy of subject/body (subject only on a new email) | Canonical `family-send` preview → confirm; composed text only (no `template_id` on message row today) |
| **Compose New without a record** (`QuickMessageModal`, person search) | Channel-filtered picker; applies `current_version` to editable subject/body | Per-recipient `/communications/send` (`quick_message`) — see the runtime contract's legacy exception |
| **Announcements** | `announcements.template_id` FK + picker; apply-on-select copies `current_version` into draft fields | Schedule snapshots `announcements.subject` / `announcements.body` at schedule time — not a live re-resolve from `template_id` |
| **Inbox reply** (`InboxThreadReplyBox`) | Not integrated | Free-text compose |
| **Workflow `create_message` / `send_message`** | Inline `body` / `template` strings with payload path tokens | Separate from Template Library — no `communication_template_id` yet |
| **Tour Invitation / confirmation / reschedule / cancel / reminder / no-show** | System templates (`system_key`, e.g. `tour_invitation:email`) seeded into Template Library; org-editable versions | Immediate Tour sends resolve **current** library version at send time; Send Tour Invitation seeds New Message from Tour Invitation template; **reminders snapshot at schedule time** |

### Doctrine

1. **Templates are the reusable operator-authored asset** for modal Compose, Announcements, and Tour lifecycle copy.
2. **Copy-on-apply, edit freely** — selecting a template fetches `GET …/templates/[id]` → `current_version` and seeds the composer; operators may edit before send/save.
3. **Do not duplicate message bodies** across features when a Template Library entry exists — reference `template_id` / `system_key` where persistence is needed (Announcements + Tour).
4. **Scheduled announcements use saved draft text** — updating a template in the library does not retroactively change already-saved announcement bodies; re-select the template in the picker to refresh from the latest version.
5. **Tour system templates** always exist (`system_key`); orgs edit content/version history but cannot archive away the semantic identity. Code defaults in `tourCommsTemplates.ts` are seed/fallback only.
6. **Email Tour links** render as friendly anchors (full secure href underneath); SMS keeps usable URLs.

Shared client helper: `web/lib/communications/v2/communicationTemplateDraftSeed.ts` (`fetchCommunicationTemplateCurrentVersion`, `communicationTemplateDraftSeedFromPreview`).

**Next increment (not shipped):** optional `communication_template_id` on workflow communication actions with runtime resolve of `current_version`; keep inline body as override during migration.

---

## Focus Panel Activity embed (July 2026) — **frozen**

**Surface:** `surfaceVariant="activity_embed"` on `FamilyCommunicationWorkspace` inside the Activity cockpit (`OpportunityFocusPanelEmbeddedWorkspace`).

**Operator model:** Conversation **topics** — business context titles (Tour Scheduling, Enrollment Packet, General) — with SMS/Email icons indicating transport only. Transport threads remain per-recipient/channel under the hood (`THREAD_SEMANTICS.md`); the Activity UI presents a topic rail + read/compose pane.

**Load path (canonical embedded workspace doctrine):**

```
Selected record (queue row)
  → Preview VM on drawer/focus payload (first paint)
  → Activity embed renders immediately (channels, recipients, recent threads, composer)
  → Background prefetch → full FamilyCommunicationWorkspace VM
  → Warm cache (`drawerFamilyWorkspacePrefetchCache`) on revisit
```

Full doctrine: `../../sprints/archive/2026-07/communications-preview-vm-doctrine.md` (historical: `../../sprints/archive/2026-07/communications-preview-vm-doctrine.md`).

**Topic rail:** `threadsForActivityTopicRail` hides zero-message threads; titles from `deriveThreadTopicTitle` (email: thread subject → workflow → message subject → metadata → General; SMS: session continuity, no message-subject fallback).

### Activity responsive composition (Adaptive Workspace Presentation)

Composition derives from existing operator state — no parallel load/send/cache lifecycle:

| State | When | Topic rail | Priority |
|-------|------|------------|----------|
| **empty** | No conversations | Hidden | Composer / New affordance |
| **reading** | ≥1 conversation and not composing | Shown | Topic selection + readable timeline |
| **composing** | New message or reply composer expanded | Hidden / collapsed | Timeline + composer width |

Helpers: `deriveActivityCommsCompositionState`, `shouldShowActivityTopicRail` in `adaptiveWorkspacePresentation.ts`. Cancel/send restore prior reading/selection without clearing draft/VM caches beyond existing reply lifecycle.

**Reply vs New Message:**

| Mode | Selection | Composer | Recipients |
|------|-----------|----------|------------|
| **Thread selected** | `selectedThreadId` set | Collapsed Reply → expand; channel locked | Thread transport participants only |
| **+ New** | `selectedThreadId` null | Expanded immediately | Household defaults |

**Post-send lifecycle:** Confirm send keeps thread selected (or opens `createdThreadId` from new message); composer clears; reply bar collapses; timeline reloads.

**Presentation helpers:** `threadTopicPresentation.ts`, `timelinePresentation.ts`.

**Out of scope (next sprint) — CORRECTED 2026-09-30.** This line was written 2026-07-12 and two of its
items shipped afterwards. Measured on the certification stack:

| Listed out of scope | Measured state |
|---|---|
| **inbound email** | **IMPLEMENTED AND IN USE.** `communication_inbound_ingress` holds **32 rows**, every one paired with a `communication_ingress_eligibility_observations` row, and `lib/communications/email/inboundEmailIngestion.ts` writes threads, messages and ingress records. All 32 inbound messages are `channel = email`, `direction = inbound` |
| **Announcements/Templates expansion** | **Templates are in use** — `communication_templates` 12 rows with `communication_template_versions`, authored through four `communications.templates.manage` handlers. `announcements` holds 0 rows |
| attachments · rich editor · Configuration/provider onboarding · compliance UX · Test Email/SMS | not measured by this pass; treat as unverified rather than as shipped |

Command Center modal layout and send runtime unchanged.

Sprint closeout: `../../sprints/archive/2026-07/communications-activity-sprint-closeout.md` (historical: `../../sprints/archive/2026-07/communications-activity-sprint-closeout.md`).

---

## Certification record — measured 2026-09-30

**State:** `COMMUNICATIONS_DOCUMENTATION_CONTEXT_READY`. Measured against staging `c500c7a4e`. Row counts
are from the certification stack.

### Providers — measured from implementation, not from this document

**There are no provider SDKs in `package.json`.** Both providers are called over raw HTTP, which is why a
dependency scan finds nothing and why the endpoints below are the evidence.

| Channel | Provider | Evidence | Webhook authority |
|---|---|---|---|
| email (outbound) | **Resend** | `https://api.resend.com/emails`; `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | — |
| email (domains) | **Resend** | `https://api.resend.com/domains` | — |
| email (status/inbound) | **Resend** | `app/api/webhooks/resend` | **Svix**: `svix-id` / `svix-timestamp` / `svix-signature` verified by `Webhook.verify` against `RESEND_WEBHOOK_SECRET`; refuses 503 unconfigured, 400 on missing headers |
| SMS | **Twilio** | `https://api.twilio.com/2010-04-01/`; `TWILIO_AUTH_TOKEN` | **`X-Twilio-Signature`** verified per binding inside `lib/communications/twilioSmsStatusWebhook.ts`, falling back to the global token, refusing when none resolves |

The doc's existing claim that Twilio/Resend webhooks are "Complete" is **correct**. Verification lives in
the handler library, not the route file — a route-level scan reports these as ungated and is wrong.

**SMS is implemented and unexercised here:** all 35 messages are `email` (32 inbound, 3 outbound). Zero SMS
rows on this stack, which is not the same as unimplemented.

### Storage and thread model

`thread_id` on `communication_messages` is **NOT NULL** with a foreign key to `communication_threads`
(`ON DELETE CASCADE`). **A message cannot exist without a thread.** Measured: 35 messages, all referencing
a single thread, **zero orphans**. `channel` and `direction` are both NOT NULL, so every message declares
which pipe it came through and which way it went; `provider_message_id` is nullable, because Alloy records
the message before the provider has answered.

`communication_delivery_events` and `communication_message_recipients` hold **0 rows** here — the delivery
state model exists and is unexercised on this stack. `messages` and `messages_outbox` (0 rows) are the
legacy pair, reachable only from `legacy-admin/messages-outbox`.

### Writers — 21 files, all classified, zero unexplained

| Class | Files |
|---|---|
| CANONICAL_OPERATOR | 8 route handlers: bindings ×2, conversation assign/triage, provider-connection, templates ×3 |
| CANONICAL | `canonicalOutboundEnqueue.ts` (the outbound path — threads + messages), `inboxThreadsService.ts`, `communicationScheduledSendsService.ts`, `deliverQueuedEmailHtml.ts` |
| PROVIDER_INGRESS | `email/inboundEmailIngestion.ts` |
| PROVIDER_STATUS | `providerDeliveryPersistence.ts` (messages, recipients, delivery events) |
| SYSTEM_GENERATED | `v2/scheduleAnnouncementSendout.ts`, `tours/comms/tourSchedulingScheduledSends.ts`, `tours/comms/tourSystemTemplates.ts` |
| IDENTITY PROJECTION | `identity/applyBindingIdentityProjection.ts` |
| CROSS-DOMAIN | `lib/pos/processingIdentity/commands/ports.ts` — **the only writer of `communication_preferences`** |
| SCRIPT | two seed scripts |

**Consent is authored from the POS processing-identity command path, not from any communications
surface**, and `communication_preferences` holds 0 rows here. That is worth knowing before assuming a
consent record exists.

### Surface and authority census — exact

43 route files · **54 handlers** (32 write, 22 read) · 4 mounted UI pages
(`adminV2/communications`, `adminV2/messages`, `adminV2/settings/organization/communications`, and the
legacy `legacy-admin/messages-outbox`).

**Every write resolves to real authority — zero unresolved, zero session-only:**

| Authority class | Writes | Detail |
|---|---|---|
| CAPABILITY | **28** | `communications.bulk.send` 9 · `communications.send` 8 · `communications.provider.configure` 5 · `communications.templates.manage` 4 · `communications.assign` 1 · `communications.read` 1 |
| PROVIDER_SIGNATURE | 3 | the Resend webhook and both Twilio status callbacks |
| TOKEN | 1 | `communications/unsubscribe` — `verifyUnsubscribeToken` with expiry and tamper handling, and the token deliberately does not widen what the link authorizes |

`communications.assign` governs conversation assignment specifically because assignment **grants scope**:
an assigned thread bypasses site scope, so bundling it with `communications.send` would let a
site-restricted sender reach every conversation in the organisation.

### Benchmark inference contract

**SAFE, because measured:** communication intent is owned by Alloy and recorded before the provider
answers; provider delivery state is transport evidence carried in `communication_delivery_events` and
`provider_message_id`, not domain intent; a message always belongs to a thread; inbound email is real and
each ingress produces an eligibility observation; both providers' webhooks are signature-verified;
`communications.assign` is separate because assignment grants scope.

**FORBIDDEN:** an email address is a Person (Identity/Access owns identity, and `resolveLinkedPersonId`
refuses an email fallback) · provider *accepted* means delivered · delivery means a business outcome ·
holding someone's contact information implies consent (consent is `communication_preferences`, written
only from the POS processing path, 0 rows here) · an unmatched inbound message must belong to a Person ·
a provider webhook is trusted without verification · a template is sent-message truth
(`communication_templates` is configuration; `communication_messages` is what was sent) · SMS is unused
because this stack has no SMS rows · `announcements` or `messages_outbox` are live (0 rows; the latter is
legacy).

### A pre-existing condition this certification does not fix

**13 files in `tests/communications` fail on staging, and none of them is caused by this pass** — which
changed documentation and added one lock test, with no production code. Six are `commsV2*Schema` tests
failing one assertion: *"contains NO destructive DDL (additive-only guardrail)"*, because the Communications
V2 migrations contain `DROP` statements. Those migrations date from **2026-06-19 to 2026-06-23**, so this
is three-month-old guardrail debt rather than a migration in flight — Communications is not mid-mutation,
and `web/lib/communications` has had no semantic change since. The remaining seven are UI lifecycle and
warm-cache tests.

**Why this does not block the certification, stated so a reader can disagree with the judgement rather
than discover it.** Every claim above is measured from the schema, the provider endpoints, the writer set
and the authority chain directly — not from those suites. The failing guards concern migration DDL policy
and presentation timing, neither of which the certification asserts. If the additive-only guardrail is
meant to hold, six red guards are real debt worth a decision; they are simply not evidence about who may
send a message or whether a webhook is verified.

### Owner set

DIRECT: this document and
[`communications-identity-platform.md`](./communications-identity-platform.md) (canonical, 2026-09-10 —
provider accounts, communication identities, canonical sender resolution).
REFERENCE_ON_DEMAND: [`communications-runtime-contract.md`](./communications-runtime-contract.md) for
transport detail. EXCLUDE_HISTORY: `docs/platform/communications/COMMUNICATIONS-V1-CLOSEOUT.md` and the
`public-link-origin-defect` record — both prove releases and defects, not current doctrine.

---

## Related

- `../../archive/2026-06-product/communications.md` (transitional expanded reference)
- `../operator/operational-workspace-shell.md` — modal workspace shell + Doctrine V2 primitives
- `../../sprints/archive/06_2026/communications-v2/operator-surface-consolidation.md`
- `../../sprints/archive/07_2026/communications-product-shell-translation/README.md` — Communications Doctrine V2 adoption closeout
- `docs/schema/schema-policies-and-security.md`
- `docs/audits/supabase-schema-alignment-audit.md`
