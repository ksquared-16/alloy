---
owner: modules
status: canonical
last_reviewed: 2026-10-27
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

### Consent & preferences (C1)

- **Authority:** `communication_preferences` (org + person + category) with append-only `communication_preference_events`.
- **Eligibility:** `evaluateEligibility` at enqueue + Python `dispatch_eligibility` revalidation. Message `category` is platform-owned (`transactional` | `operational` | `marketing` | `emergency`); `purpose` is compliance-inert.
- **Marketing:** requires explicit `opted_in` per channel (`email_marketing` / `sms_marketing`). Email consent never authorizes SMS marketing.
- **Unsubscribe:** HMAC tokens (`unsubscribeToken.ts`) minted at enqueue into `metadata.unsubscribe_url` for marketing/operational email; List-Unsubscribe emitted at provider send (TS + Python). Route: `/api/communications/unsubscribe`.
- **SMS keywords:** STOP opts out all SMS categories; START restores transactional + operational only (not marketing).
- **Public intake handoff:** `commitMarketingConsentFromIntakeCapture` — Forms/Processing capture evidence before Person exists; commit preserves prior opt-outs. Wired for the S7 public tour journey (Tours I1, below): evidence record `intakeMarketingConsentRecord.ts`, commit-once handoff `lib/pos/processingCase/commitIntakeMarketingConsentForCase.ts`. Intake never re-subscribes an opted-out person — there is no intake re-subscription path.
- **Tour parent mail:** lifecycle notices are `transactional` (`tour_coordination`); invitations are `operational`. Gated by S1 `mayCommunicateForTour`.

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
| **`/adminV2/messages`** | Inbox client | Present; not the primary modal hub |
| **`/admin/communications`** | Legacy path | **No** `app/admin/communications` tree and **no** redirect in `next.config.ts` — do not treat as a live surface |

### Modal navigation (Operational Workspace Doctrine V2)

Communications composes `@/components/workspace/WorkspaceShell` (and related workspace primitives) —
same operational-workspace pattern family as Processing (Digital Mailroom). Presentation only;
send/thread/announcement/template runtimes unchanged.

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
- **A reply does not clear attention.** `attention_state` is written by inbound ingress (`needs_response` /
  `needs_routing_resolution`) and by **operator triage** — not by outbound send/reply paths. The Work
  Items projection reads `attention_state` only (`mapCommunicationThreadToWorkItemRow`). Inbound may
  reopen a `resolved` thread. Matches inference-contract claim: a reply does not clear attention.

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
| **Record New Message composer** (`FamilyNewMessageComposer`: Current Work → Contact Family / Send Message / Tour Invitation, Manage → Send Message / Email / SMS / Tour Invitation) and every `FamilyCommunicationWorkspaceView` composer | **Template ▾** in the editor toolbar (`ComposerTemplateMenu`): channel-filtered active templates; applies `current_version` as an editable copy of subject/body (subject only on a new email) | Canonical `family-send` preview → confirm (`operational` / `family_communication`); template id/version may be accepted by `canonicalSend` when a path supplies them — family composer still primarily copy-on-apply |
| **Compose New without a record** (`QuickMessageModal`, person search) | Channel-filtered picker; applies `current_version` to editable subject/body | Per-recipient `/communications/send` (`quick_message`) — see the runtime contract's legacy exception |
| **Announcements** | `announcements.template_id` FK + picker; apply-on-select copies `current_version` into draft fields | Schedule snapshots `announcements.subject` / `announcements.body` at schedule time — not a live re-resolve from `template_id` |
| **Inbox reply** (`InboxThreadReplyBox`) | Not integrated | Free-text compose (`operational`); **does not** clear attention |
| **Workflow `create_message` / `send_message`** | Inline `body` / `template` strings with payload path tokens | Separate from Template Library |
| **Workflow `send_communication_template`** | Resolves Template Library by id or `system_key` → **current** version at execution | Shipped (`executeSendCommunicationTemplateWorkflowAction`); `canonicalSend` with purpose `automated_family_message` / category `operational`; used by New Lead message automation |
| **Tour Invitation / confirmation / reschedule / cancel / reminder / no-show** | System templates (`system_key`, e.g. `tour_invitation:email`) seeded into Template Library; org-editable versions | Immediate Tour sends resolve **current** library version at send time; **reminders snapshot at schedule time** |

### Doctrine

1. **Templates are the reusable operator-authored asset** for modal Compose, Announcements, and Tour lifecycle copy.
2. **Copy-on-apply, edit freely** — selecting a template fetches `GET …/templates/[id]` → `current_version` and seeds the composer; operators may edit before send/save.
3. **Do not duplicate message bodies** across features when a Template Library entry exists — reference `template_id` / `system_key` where persistence is needed (Announcements + Tour).
4. **Scheduled announcements use saved draft text** — updating a template in the library does not retroactively change already-saved announcement bodies; re-select the template in the picker to refresh from the latest version.
5. **Tour system templates** always exist (`system_key`); orgs edit content/version history but cannot archive away the semantic identity. Code defaults in `tourCommsTemplates.ts` are seed/fallback only.
6. **Email Tour links** render as friendly anchors (full secure href underneath); SMS keeps usable URLs.

Shared client helper: `web/lib/communications/v2/communicationTemplateDraftSeed.ts` (`fetchCommunicationTemplateCurrentVersion`, `communicationTemplateDraftSeedFromPreview`).

---

## Tour communications authority (S1, 2026-10-22)

Tour booking product semantics route provisionally under the **Enrollment / Placement** context lane
(Director D-02, 2026-10-27); this section records only the **communications** boundary Tours relies
on (consent preference truth and canonical send enqueue). Evidence: `certification/tours-calendar-forms/s1/`.

- **One policy decides whether a booking may be talked about:** `mayCommunicateForTour(intent, state)`
  (`web/lib/tours/comms/tourCommsEligibility.ts`), evaluated against the booking **re-read from the
  database** at decision time — never the triggering event's name and never the caller's row.
  Confirmation, reschedule notice and reminder require an approved booking (`confirmed` / `rescheduled`)
  whose opportunity exists in the org (the lead approval boundary: a public lead has no opportunity until
  Processing **Approve**). A cancellation notice requires that the booking was confirmed before it was
  canceled — rejecting a pending request is not "your tour was canceled".
  **Staff calendar invite debt:** `tourInternalCalendarInvite` enqueues `audience: "internal"` on email,
  which `evaluateEligibility` blocks (`INTERNAL_TO_PROVIDER`) — do not document the invite as a sending
  path until that classification is fixed and guarded.
- **Every tour outbound path asks it:** `orchestrateTourCommsForBooking` (immediate sends, reminder
  scheduling, internal ICS), `processDueCommunicationScheduledSends` for `source = tour_scheduling`
  (a due reminder is re-decided at dispatch; an ineligible one is set `canceled` with
  `metadata.dispatch_revalidation`, an unreadable booking fails the row), and org workflows on tour
  events (messaging actions refused; see `actions-and-workflows.md` § Rules).
- **It is not recipient eligibility.** Opt-out, suppression, STOP holds and channel usability stay with
  canonical enqueue eligibility, which still runs after the tour policy and is never bypassed by it.
  Scheduled sends now carry the resolved `recipientPersonId` into canonical enqueue
  (`executeLegacyCommunicationsSendAdapter`); before 2026-10-22 every due scheduled send — tour reminders
  included — was blocked `RECIPIENT_UNRESOLVED`.
- **Classification (settled by C1, integrated in Tours I1):** parent lifecycle notices — confirmation,
  reminder, reschedule, cancel, no-show follow-up — pass `category: transactional`
  (`tourCommsMessageCategory.ts`); the invitation is `operational`; due reminders carry it through
  `processDueCommunicationScheduledSends`. **Consequence:** canonical eligibility does not let a
  preference opt-out suppress a transactional notice, so a parent with `email_transactional` /
  `email_operational` opted out now RECEIVES the confirmation of a tour they requested; only channel
  suppression (bounce / complaint), STOP holds and channel usability still block it. Before C1 the send
  fell back to `operational` and an opt-out blocked it (live: `publicTourIntake` 14·17).
- **Public tour requests (S7, 2026-10-26):** a time a family picks on a school's public tour calendar
  is pending intent on the Processing case — there is no booking and no Opportunity, so no tour message
  of any kind can be produced before Approve, and the family's screen says "received", never "booked".
  After Approve books the time, the ONE confirmation goes through `orchestrateTourBookingConfirmed`
  (per-booking idempotency key; a retry completes a missing send and never doubles one), then canonical
  enqueue eligibility; the outcome (`sent` / `suppressed` with the policy code / `not_applicable`) is
  recorded on the case for the operator. A rule that requires tour approval yields `pending_approval`
  and stays silent until staff confirm under `tours.book`. There is no family ICS today (only the staff
  calendar invite).
- **Public intake marketing consent (Tours I1, 2026-10-26):** a lead-capture intake link whose tour
  calendar is published (`publicLinkOffersMarketingConsent` — the link decides, never the body) shows
  two optional, unchecked boxes in the Forms runtime: marketing email and marketing texts, each with its
  own versioned wording (`INTAKE_MARKETING_CONSENT_LANGUAGE`). Submit records the answer — only a
  literal `true` is consent; unchecked or absent is recorded as "no"; malformed is refused (400) — as
  evidence on the Processing case (`metadata.marketing_consent`, wording, version, time, link,
  submission). No person, preference or message exists before Approve. Approve commits it once for the
  resolved person (created, or the existing one linked) through C1's commit authority: an existing
  opt-out is preserved (`preserved_opt_out`); a replay writes nothing; an ambiguous identity holds the
  evidence uncommitted with the case. Capturing consent sends nothing. The preference event carries
  `source=public_intake`, `method=form_checkbox`; the full evidence stays on the case
  (`certification/tours-calendar-forms/i1/`).

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

### Providers — two runtimes (remeasured 2026-10-27)

**Web `package.json` has no Twilio/Resend SDKs** — TS outbound email uses raw HTTP (`deliverQueuedEmailHtml`).
The **Python** communications worker **does** depend on `twilio` and uses `requests` for Resend
(`backend/requirements.txt`, `integrations/twilio_client.py`). Pattern: **TypeScript authors and
enqueues**; **Python dispatches** the queue. Inbound SMS webhook: `backend/app/routes/sms_inbound.py`
(`/sms/inbound`, `COMMUNICATIONS_SMS_INBOUND_ENABLED`, Twilio signature verification).

| Channel | Provider | Evidence | Webhook authority |
|---|---|---|---|
| email (outbound) | **Resend** | `https://api.resend.com/emails`; `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | — |
| email (domains) | **Resend** | `https://api.resend.com/domains` | — |
| email (status/inbound) | **Resend** | `app/api/webhooks/resend` | **Svix** against `RESEND_WEBHOOK_SECRET` |
| SMS (status) | **Twilio** | `lib/communications/twilioSmsStatusWebhook.ts` | **`X-Twilio-Signature`** |
| SMS (inbound) | **Twilio** | Python `/sms/inbound` | Twilio signature helper |

Webhook signature verification lives in the handler library — a route-level scan that reports these as
ungated is wrong.

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
| CROSS-DOMAIN | `lib/pos/processingIdentity/commands/ports.ts` — a caller of the one preference authority (below) |
| SCRIPT | two seed scripts |

**Consent has two writers (one per runtime):**
1. TypeScript — `lib/communications/v2/persistCommunicationPreference.ts` (row + append-only event).
   Callers include Processing identity commit, public intake commit, recipient unsubscribe, and
   person preference services. Bound in part by `tests/docs/communicationsCertificationClaims.test.ts`.
2. Python — `backend/app/services/communication_preferences.py::apply_preference_changes` for inbound
   STOP/START keyword handling.

**Operator preference locks (`allowedPreferenceChanges`):** an operator must not opt a person **in** to
marketing, and only the person reverses STOP/unsubscribe (`SELF_SERVICE_OPT_OUT_SOURCES`). The person
preference admin route uses the locked service; the Command Center preferences PATCH currently maps
status and persists with `source: "admin_command_center"` **without** calling that lock — record as
debt, do not document as authorized unlock.

A second, flagged consent path (`consentGate` / `consentEnforcement` under `comms_v2_compliance`) still
exists for some legacy/family-send adapters — do not confuse it with the canonical preference writers.

### Eligibility and send authority (summary)

Canonical enqueue freezes an `EligibilitySnapshot` (`evaluateEligibility`, policy `2026-07-31.1`).
Live re-checks at Python dispatch cover only selected facts. Documented categories include quiet hours
(parameter exists; **no caller currently supplies it**), STOP endpoint holds, unevaluable consent on
thread-bound sends, emergency permission, internal-audience rule (`INTERNAL_TO_PROVIDER`),
bounce/complaint suppression, and render/link-origin gates. Family-send is fixed to `operational` /
`family_communication`; inbox reply is `operational`.

### Surface and authority census — exact (2026-09-30 stack)

**Historical census at staging `c500c7a4e`:** 43 route files · 54 handlers (32 write, 22 read).
**Re-count debt (2026-10-27):** a scoped script count of `*communications*` routes + webhooks yields
~38 files / ~48 handlers — define census scope and bind a guard before treating either number as current.

| Authority class | Writes (2026-09-30) | Detail |
|---|---|---|
| CAPABILITY | **28** | `communications.bulk.send` · `communications.send` · `communications.provider.configure` · `communications.templates.manage` · `communications.assign` · `communications.read` |
| PROVIDER_SIGNATURE | 3 | Resend webhook and Twilio status callbacks |
| TOKEN | 1 | `communications/unsubscribe` |

`communications.assign` governs conversation assignment specifically because assignment **grants scope**:
an assigned thread bypasses site scope, so bundling it with `communications.send` would let a
site-restricted sender reach every conversation in the organisation.

### Benchmark inference contract

**SAFE, because measured:** communication intent is owned by Alloy and recorded before the provider
answers; provider delivery state is transport evidence carried in `communication_delivery_events` and
`provider_message_id`, not domain intent; a message always belongs to a thread; inbound email is real and
each ingress produces an eligibility observation; both providers' webhooks are signature-verified;
`communications.assign` is separate because assignment grants scope.

**FORBIDDEN:** an email address is a Person · inbound identity is `resolveLinkedPersonId` (that helper is
the **staff user→person** link — SMS inbound uses phone canonicalization / exactly-one-or-nobody;
email inbound uses `resolvePersonByEmail`) · a reply clears attention · provider *accepted* means
delivered · delivery means a business outcome · holding contact information implies consent · an
unmatched inbound message must belong to a Person · a provider webhook is trusted without verification ·
a template is sent-message truth · SMS is unused because a cert stack had no SMS rows · measured "0 rows"
on announcements/`messages_outbox` proves permanent disuse · the staff tour calendar invite currently
sends.

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
