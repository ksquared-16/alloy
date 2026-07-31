---
title: Conversation Platform V1 — Implementation Planning Package
status: proposal — awaiting Kelly's approval
stage: discovery
sprint: conversation-platform-v1-discovery (slot 2)
base: origin/staging @ 3fc2e0f4e
date: 2026-07-30
---

# Conversation Platform V1 — Implementation Planning Package

**This is a proposal. No production code has been written. Nothing here is approved.**

Evidence for every claim is in [`findings/`](findings/). Seven parallel read-only sweeps covered all 13 workstreams; each finding below cites `file:line`.

---

## 0. Executive summary

### 0.1 The mission's premise is right, and its map is wrong in four places

The brief says Communications "is no longer an architecture problem" and the sprint is about completion, UX, hardening, and polish. **That holds.** 35 API routes, 140 lib files, 20 migrations, a real Command Center, a real identity platform, real provider webhooks. Nothing here argues for a new runtime.

But four premises in the brief are factually wrong against the code, and each changes sequencing:

| Brief says | Reality | Consequence |
|---|---|---|
| "Current platform sends communications. Design how Alloy becomes capable of receiving them." (WS3) | **Inbound SMS is complete end-to-end** — signature-verified webhook, org routing, identity resolution, thread reuse, reply-stamping, attention-state transition, activity event. It lives in the **Python backend** (`backend/app/routes/sms_inbound.py`), invisible to a Next.js-first search. | WS3 is not "build receiving." It is "build inbound **email**, and make inbound **mean something**." |
| WS1 implies interactive actions are a new capability | **The pattern is already proven end-to-end, exactly once.** `api/public/tour-booking/[token]/book/route.ts:90` calls the *same* `createTourBooking` service the operator route calls, running the *same* Platform Transaction. No shadow path. | WS1 is generalization of a working seam, not greenfield. Much cheaper than it looks. |
| WS4 implies composers are separate and need converging | **Convergence is ~70% done at transport and ~40% at UI, and was abandoned.** One runtime already serves four hosts with presentation-only variants. `composerModel.ts:11-19` holds a `ComposerDraft` contract already declaring `attachments`/`templateId`/`scheduledAt` — **the WS4 target, already specified, never mounted.** | WS4 is finishing an abandoned migration, not designing one. |
| "Assume the platform architecture is stable" | Architecture is stable. **Configuration and wiring are not.** Whole subsystems are schema-only: SLA (`sla_events` has zero writers), identity platform (no write path at all), consent (dark flag), recipients table (never INSERTed). | The sprint's dominant risk is *finishing half-built things*, not building new ones. |

### 0.2 The single most important architectural finding

**The platform already treats a conversation as a unit of work.**

`web/lib/workItems/mapCommunicationThreadToWorkItemRow.ts:57-95` projects a `communication_thread` directly into a work-item row — with assignee, due time, family label, and topic, keyed `communications:{threadId}`. And `v2/workspaceModeAvailability.ts:6` already models `email | sms | note | tasks` as four **modes of one workspace**.

The brief's thesis — *"conversation is the product, transport is an implementation detail"* — is not a redesign. It is the conclusion the codebase already reached and stopped one step short of.

### 0.3 What actually blocks the product

Three structural gaps, in dependency order. Everything else in the 13 workstreams is downstream of these.

1. **`communication_messages` has no message CATEGORY.** No column, nothing writes one into `metadata`. Consent, quiet hours, emergency-only, operational-only, and marketing preference are all *unenforceable* because the enforcement point has no input. `enforceConsentForSend` defaults category from channel → every send is `transactional` → always allowed (`v2/consentEnforcement.ts:14-16,27` → `consentGate.ts:52-54`). **This one missing column silently defeats WS8 entirely and half of WS6.**

2. **`communication_messages` has no structured content and no send-time rendering.** One `text` body. `executeCommunicationsSend` takes a pre-rendered string and does zero interpolation (`:56,:298`). No CTA object, no buttons, no `body_html`, no per-channel rendering. **This blocks WS1 (interactive actions), WS11 (attachments), and WS12 (everything past authoring) simultaneously.**

3. **A thread's subject is one polymorphic, unvalidated, mutable pair.** `primary_entity_type text` (no CHECK) + `primary_entity_id uuid` (no FK) on the thread only — messages have no subject at all. There is **no link to business process, process instance, participation, record, or work unit anywhere** (verified by exhaustive grep). Worse, inbound SMS *overrides* the anchor: `_find_canonical_sms_thread()` reuses any thread with the same `recipient_key` regardless of anchor (`communication_inbound.py:184-225`), so the persisted subject is "whatever came first." **This is the direct contradiction of "every conversation attaches to Organization / Business Process / Record / Operational Subject / Current Work / Timeline / Activity / BOS."**

### 0.4 Three findings that outrank the sprint

These are live-tenant exposure, not planning material. **Recommendation: pull them out as a hotfix track ahead of Phase 1.** Detail in §6 and §12.

- **R-CRIT-1 — Opt-out is unenforced.** An operator can set a person to "opted out" and the platform keeps sending. Inbound STOP changes nothing, while the app promises "Reply STOP to unsubscribe." TCPA/CAN-SPAM.
- **R-CRIT-2 — Any authenticated org member can read any document in the tenant**, including children's records, via a route with no role check that bypasses RLS. Compounded by **zero Supabase Storage RLS in the entire repo**.
- **R-CRIT-3 — Templates ship raw `{{tokens}}` to families.** No send path renders them. The guard function written to prevent this is never called.

---

## 1. Existing Capability Inventory

Legend: **✅ works** · **⚠️ built but dark/unwired** · **🔶 partial** · **❌ absent**

### 1.1 Data model

| Table | State | Note |
|---|---|---|
| `communication_threads` | ✅ | V1 core + 10 V2 columns. Single live thread model — **there is no dual V1/V2 thread schema.** |
| `communication_messages` | ✅ | 26 columns. No category, no `template_id`, no sender user, no `updated_at`, no attachments. |
| `communication_message_reads` | ✅ | Per-user per-message. Already the right grain for multi-participant staff threads. |
| `communication_scheduled_sends` | ✅ | Lease + claim-token fencing + CAS. `approved_at` NOT NULL — a scheduled send is structurally impossible without recorded human approval. |
| `communication_delivery_events` | ✅ | Append-only, provider-neutral, idempotent on `(provider, provider_event_id)`. **Strongest existing asset.** |
| `communication_message_recipients` | ⚠️ | **Never INSERTed by runtime.** Only the 2026-06-19 backfill ever created rows. Every message since has none → the webhook per-recipient update is a silent no-op. |
| `communication_preferences` / `_events` | ⚠️ | Real schema; `_events` has zero writers; enforcement behind a default-OFF flag. |
| `conversation_assignment_events` | 🔶 | Written only by the assign route. |
| `sla_events` | ❌ dead | Zero readers, zero writers. Only a name constant. |
| `communication_snippets` | ❌ dead | Zero code references. |
| `announcement_deliveries` | ❌ dead | Superseded by `announcement_recipients`. |
| `communication_templates` / `_versions` | 🔶 | Works, but on a `version`/`version_number` trigger shim (§8.2). |
| `announcements` / `_targets` / `_recipients` | 🔶 | **`announcement_targets` has two incompatible definitions and no repair migration** — sharpest migration risk found (R-CRIT-4). |
| Identity platform (4 tables) | ⚠️ | Schema + backfill + resolver + tests. **No write path anywhere.** Rows exist only from the migration. |
| `communication_provider_bindings` | ✅ legacy | Superseded on paper; still the only thing the Settings UI writes and still the real Python resolution path. |

### 1.2 Runtime

| Capability | State | Cite |
|---|---|---|
| Single guarded send path | ✅ | `executeCommunicationsSend.ts:93` — consent gate → recipient resolution → channel availability → sender resolution → enqueue → worker trigger |
| Canonical enqueue + thread upsert | ✅ | `canonicalOutboundEnqueue.ts:136` |
| Canonical sender identity resolution | ✅ | `resolveSenderIdentity.ts:203` — 7-level precedence, full provenance, typed failure codes. **Genuinely good.** |
| Provider delivery webhooks (Resend + Twilio) | ✅ | Svix/HMAC verified, idempotent persistence |
| Inbound SMS | ✅ | Python only |
| Scheduled-send drain w/ lease + fencing | ✅ | `communicationScheduledSendsService.ts:581` |
| Consent gate | ⚠️ dark | Flag default OFF |
| SLA computation | ❌ | `computeSlaState()` zero callers; SLA columns never written |
| Stale-claim release | ⚠️ | Exists, self-documented as never invoked in production |
| Retry / DLQ | ❌ | No attempt counter, no backoff. `failed` is terminal in both queues. |
| Scheduler / cron | ❌ | **Nothing in-repo drives either drain.** |
| Provider adapter registry | ❌ dead | Zero production callers; interface has no `send()` |
| Inbound email | ❌ | No route, no provider chosen, no candidate package installed |

### 1.3 Operator surfaces

| Surface | State |
|---|---|
| Command Center (conversation queue) | ✅ |
| Family Communication Workspace | ✅ — one runtime, four hosts, presentation-only variants |
| Focus Panel Activity embed | ✅ |
| Record drawer Comms tab | ✅ |
| Inbox (folder model) | ✅ — but a **second, competing** surface reading the same threads |
| Quick Message modal | ✅ — the only composer with template support |
| Announcements workspace | ⚠️ — composes and schedules; **delivery gated off, undisclosed to operators** |
| Templates workspace | ✅ authoring / ❌ delivery |
| Deliverability dashboard | ⚠️ dark (flag OFF, `domainAuth` props never populated) |
| Settings → Communications | 🔶 — reads legacy bindings; **three editable fields total**: label, status, primary |
| Legacy drawer composer | ⚠️ — 1456 lines, unreachable behind a default-ON flag |
| `ComposerV2`, `TemplateBuilder`, `AnnouncementBuilder` | ❌ orphaned — imported by nothing |

### 1.4 Feature-flag reality

Default **ON**: `comms_v2_command_center`, `_record_tab`, `_composer`, `_live_workspace`.
Default **OFF**: `_deliverability`, `_assignment`, `_sla`, `_compliance`, `_preferences`, `_bos`, `_announcements`, `_templates` (`v2/flags.ts:53-58`).

**More than half the shipped V2 surface is dark in production.**

---

## 2. Current Architecture Assessment

### 2.1 What is genuinely well-built — do not touch

1. **`resolveSenderIdentity`** (`:203`) — pure, 7-level precedence, emits `selectionReason` + `fallbackLevel` + `authorization` + `warnings`, typed failure codes, 22 tests. Model citizen.
2. **The delivery-event substrate** — append-only, provider-neutral, idempotent on `(provider, provider_event_id)`, with pure provider→canonical mapping isolated in one module.
3. **The scheduled-send lease** — `FOR UPDATE SKIP LOCKED`, claim-token fencing, compare-and-swap terminal writes, an explicit recovery branch. Correct concurrency design.
4. **The Preview VM pattern** (`familyWorkspace/types.ts:176-191`) — a versioned first-paint projection that reuses the *identical* assembler as the full VM, so eligibility can never diverge between seed and hydrate. **This is the pattern the whole sprint should copy.**
5. **The Platform Transaction Contract** — canonical stage order enforced by a throwing assert, compensator undo stack, `inside`/`outside` boundary semantics, honest `changed:false` only when rollback is proven.

### 2.2 The structural fault lines

**F1 — Two runtimes, one product.** TypeScript enqueues; Python sends and receives. The seam is a fire-and-forget HTTP poke that **silently no-ops if two env vars are unset** (`triggerBackendMessagesQueue.ts:12`), self-documenting its own failure mode at `:322-324`. Two Twilio ingestion surfaces exist in the two runtimes. Two identity resolvers exist with divergent precedence (`binding_resolver.py:87-89` has a "loose org" fallback the TS resolver has no analogue for).

**F2 — Schema without service wiring is the dominant pattern.** PKG-10/PKG-11 were declared in migration comments (`20260619120000:30-37`) and never landed. The result is a platform where reading the schema *overstates* the capability: SLA, recipients, preferences audit, identity platform, snippets, announcement deliveries are all present-and-inert. **Any plan that reads the DDL as a capability inventory will be wrong.**

**F3 — Free-text where a vocabulary was intended.** `status`, `attention_state`, `sla_state`, `primary_entity_type`, `provider_type`, `identity_type`, `category`, preference `state` — all bare `text`, all with vocabularies that exist only in TypeScript. Four runtimes write `communication_messages.status`. Three overlapping delivery-state vocabularies exist in TS (10, 8, and 7 values) with **none authoritative in the DB**.

**F4 — Subject is re-derived per request, never stored.** `commandCenterConversationEnrichment.ts:311-413` walks a customer→opportunity→person ladder on every read, normalizing singular/plural along the way, and produces `opportunity_id`/`customer_id`/`scope_status` that are **persisted nowhere**. It consults `metadata.customer_id`, which **no send or inbound path ever writes**.

**F5 — Duplication as the house style.** Four `{{token}}` render engines. Two composer chromes. Two inbox surfaces. Two analytics stacks (OIP metrics vs `communicationHealth.ts` et al.). Four consent stores. Eight note mechanisms. Two program entities. Each was a reasonable local decision; together they are the sprint's real cost.

### 2.3 Assessment verdict

**The architecture is sound and should be preserved.** The problem is not design — it is that roughly half of what was designed was never wired, and the wiring gaps are invisible from the schema. The correct sprint posture is **finish and converge**, and to treat "delete the dead thing" as a first-class deliverable equal to "build the missing thing."

---

## 3. UX Assessment

### 3.1 What an operator experiences today

**Good:** the Family Workspace is genuinely well-made — review-first two-phase send with a per-recipient ready/blocked list is a better pattern than most commercial products ship. The Preview VM means Activity paints the real workspace with no blank shell.

**Bad, in order of how badly it damages trust:**

| # | Problem | Evidence |
|---|---|---|
| U1 | **Buttons that do nothing.** "Attach" and "Templates" in the primary composer have **no `onClick`** at all. | `FamilyCommunicationWorkspaceView.tsx:832,833` |
| U2 | **"Send later" is dead on the primary composer** — the scheduled-send API accepts `entity_type=opportunities` only, and S1/S4 anchor `persons`. Surfaced as an amber panel. | `messagingComposerScheduleContext.ts:4-5` |
| U3 | **Announcements compose, target, and schedule — and never deliver.** No indication in the UI. | `scheduleAnnouncementSendout.ts:8-9` |
| U4 | **Templates apply and ship raw tokens.** A parent receives `Hi {{contact.first_name}},`. | GAP-1 |
| U5 | **An opted-out person keeps receiving messages.** The toggle operators see is read by nothing. | R-CRIT-1 |
| U6 | **BOS Assist is a stub on all four composers** — renders "Coming next", never writes back — while a real deterministic draft synthesizer sits uncalled. | `ComposerBosEnhanceModal.tsx:97-108` |
| U7 | **Unknown/ambiguous inbound senders are a dead end.** `communications_unknown` threads map to no drawer target and there is **no operator surface to resolve them**. | `inboxEntityDrawerTarget.ts:32` |
| U8 | **Send failure is invisible and unrecoverable.** No UI lists failed messages; no endpoint resends. The `error` column is written and never read back. | §1.2 |
| U9 | **Two inboxes.** Folder inbox and Command Center queue read the same threads with different models. | R16 |
| U10 | **`in_app` is labeled "Internal" and cannot be replied to** — "coming soon". | `inboxThreadIdentity.ts:150` |
| U11 | **Settings offers three editable fields** behind a banner reading "mid-build but useful". | `CommunicationsSetupClient.tsx:109-121` |

### 3.2 The UX principle this sprint should adopt

**A control that cannot act must not render.** U1/U2/U3/U6 are all the same defect: capability and presentation are not coupled. The fix is architectural, not cosmetic — the composer capability registry proposed in §10.1 makes an inert button *impossible to write*.

---

## 4. Runtime Reuse Assessment

The brief says "do not invent parallel runtimes." Here is what exists to reuse, and what genuinely must be new.

| Need | Reuse | Cite |
|---|---|---|
| Hierarchy resolution (WS6) | **`resolveConfigRule`** — flat filter → total sort → take first; `room(4) > program(3) > site(2) > org(1)`; effective-dated; deterministic tiebreak; **first-class provenance** (`AppliedOperationalRule` reports *every* applicable rule and which one bound). Already reused across capacity, ratios, schedules, regulatory ceilings, and **financials**. | `childcareOperational/config/resolveConfigRule.ts:130`; `location/operationalResolutionContracts.ts:49` |
| Which fields a location may override | `resolveEffectiveConfiguration` — per-field policy `organization_locked \| location_may_override \| location_must_supply \| runtime_derived` | `configPublication/effectiveResolution.ts:24` |
| Identity resolution for inbound (WS3) | **`web/lib/intake/resolve/` + `web/lib/identity/`** — confidence-tiered (`exact_match \| probable_match \| possible_match \| conflict \| no_match`), explicit `ambiguous_email`/`ambiguous_phone`, household graph, versioned. **Zero imports from communications today. Highest-leverage reuse in the sprint.** | `intake/resolve/matchIdentity.ts:78,186`; `identity/householdGraph.ts:23` |
| Analytics (WS13) | **OIP metric registry** — a `communications` pack already exists with 3 live metrics reading the delivery-event substrate | `metrics/registry.ts:102-135` |
| Attachments (WS11) | **`documents` table + `org_documents` bucket + `form_submission_documents` join pattern + `ProcessingImportAction` drag/drop** | `remote_schema.sql:1743`; `20260506100000:419-435`; `ProcessingImportAction.tsx:66-80` |
| External action execution (WS1) | **The public tour-booking route** — same service fn, same Platform Transaction, differing only in envelope | `public/tour-booking/[token]/book/route.ts:90` |
| Composer convergence (WS4) | **`FamilyWorkspaceSurfaceVariant` + the Preview VM + `ComposerDraft`** | `familyWorkspace/surfaceVariant.ts:2`; `composerModel.ts:11-19` |
| Event substrate (WS5/WS13) | **`workflow_events`** — generic `{event_type, entity_type, entity_id, payload}`, `FORCE ROW LEVEL SECURITY`, already carries comms traffic | `remote_schema.sql:3134`; `emitEvent.ts:22` |
| Internal conversations (WS7) | **`communication_message_reads`** (per-user per-message — the hardest thing to retrofit, already built) + assignment/audit tables | `20260430254100:83-88`; `20260619120000:40-70` |
| Escaping (WS12) | `plainTextToSimpleHtml` — the codebase already knows how; the template platform never adopted it | `tourCommsTemplates.ts:196-203` |

### 4.1 What must genuinely be new

Only five things:

1. **A message category vocabulary + column.** Nothing analogous exists.
2. **A thread participant table.** No `thread_participants` anywhere; a thread has one assignee, not members.
3. **A recipient-bound token that resolves to a person**, plus an external-actor representation in the command runtime. Today `executeCommandInvocation.ts:163-170` *overwrites* the actor with the server session — there is no way to say "an external recipient did this."
4. **A structured content model on messages** (blocks / CTA objects) + send-time rendering.
5. **A staff notification substrate.** No `notifications` table, no in-app center, no push, no digest. WS7's @mentions/assignments/handoffs are all inert without it.

Everything else in 13 workstreams is composition of things that already exist.

---

## 5. Gap Analysis

Consolidated and de-duplicated across all seven sweeps. Full per-workstream gap tables are in `findings/`.

### 5.1 Blocking (nothing downstream works without these)

| ID | Gap | Blocks |
|---|---|---|
| **B1** | No message **category/purpose** on `communication_messages` | WS8 entirely, WS6 compliance, quiet hours, opt-out correctness |
| **B2** | No **structured content** + no send-time rendering | WS1, WS11, WS12 delivery |
| **B3** | Subject is one polymorphic mutable pair; **no BP/process-instance/participation/work-unit link at all**; inbound overrides it | The brief's core thesis |
| **B4** | **No scheduler.** Nothing drives `process-due` or the Python queue | WS10 entirely; tour reminders will not fire |
| **B5** | **No recipient identity token**; command runtime closed to non-operator actors | WS1 |
| **B6** | **No staff notification substrate** | WS7 |

### 5.2 Correctness defects in shipped surfaces

| ID | Defect |
|---|---|
| **D1** | Templates ship unrendered `{{tokens}}` (R-CRIT-3) |
| **D2** | Opt-out unenforced; STOP unprocessed (R-CRIT-1) |
| **D3** | `announcement_targets` dual schema, no repair migration; live API writes the shape that may not exist (R-CRIT-4) |
| **D4** | `communication_message_recipients` never INSERTed → per-recipient webhook updates are silent no-ops |
| **D5** | Delivery webhooks emit **nothing** to the timeline; the only `message_delivered` event is an optimistic fake fired when Twilio *accepts* |
| **D6** | Queue B polls with **no lease** → concurrent workers double-send |
| **D7** | No retry, no DLQ; `failed` terminal in both queues; no operator remediation |
| **D8** | Comms metrics ignore operator location scope → a site-scoped operator sees org-wide counts |
| **D9** | Silent cross-tenant credential fallback on email send — an `unconfigured` tenant still sends on the platform's global key and From address |
| **D10** | `bounced` conflates bounce and spam-complaint; inbound rows inserted as `delivered` |
| **D11** | No unique constraint on `provider_message_id` → webhook retries double-insert |
| **D12** | Three send-capable routes lack `assertCommunicationsSendAllowed` (`process-due`, `family-note`, `form-deliver`); the cron path processes **all orgs** |
| **D13** | Firefly has **zero** `when_domain_signal` rules — migration `20260622205001:126` wholesale-replaced the plan added 55 minutes earlier, and being explicit now blocks the default |
| **D14** | Public tour-booking flattens transaction errors, discarding `changed`/`integrityBreach` → double-booking risk |

### 5.3 Dead / duplicated (deletion is a deliverable)

`sla_events` · `communication_snippets` · `announcement_deliveries` · `communication_preference_events` · `emitCommsV2Event` (8-event catalog, zero call sites) · the TS provider registry and its adapters · `resolveInboundIdentity` (TS) · the dead TS inbound layer duplicating live Python · `ComposerV2` / `TemplateBuilder` / `AnnouncementBuilder` · `CommunicationsDrawerSectionLegacy` (1456 lines, unreachable) · engine C `templateRender.ts` · `threads.archived_at` (schema-only) · `threads.last_read_at` (schema-only) · `body_format` (never written) · `approval_status` (dead but still CHECK-constrained) · dead tour ICS routes · tour public-booking links with no delivery path.

### 5.4 Absent, correctly scoped as new work

Inbound email · attachments (all layers) · interactive/CTA content · thread participants · @mentions · notifications · presence/realtime · language/locale (no i18n at all) · quiet hours outside tours · `contact_methods` (preferred email/phone inexpressible — one column each today) · brand entity · template inheritance · approval workflow · open/click tracking owned by Alloy · unsubscribe links · suppression list.

---

## 6. Risks

Ranked by expected harm.

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-CRIT-1** | **Regulatory: opt-out unenforced, STOP unprocessed, while the app promises "Reply STOP to unsubscribe"** | **Critical** | Hotfix track, §14 Phase 0 |
| **R-CRIT-2** | **Any authenticated org member reads any document in the tenant** (no role check + RLS bypass); **zero Storage RLS repo-wide**; public vendor upload violates the org-prefix convention with driver's licenses | **Critical** | Hotfix + **live-project verification required** (§6.1) |
| **R-CRIT-3** | **Templates ship raw tokens to families** | **High** | Hotfix track |
| **R-CRIT-4** | **`announcement_targets` schema divergence with no repair migration**; a migration ordering difference between environments changes the shipped schema | **High** | Phase 0 schema reconciliation + a schema-drift assertion test |
| R-1 | **No DB-backed and no route-level tests across the entire communications suite.** ~23 "contract" tests are `readFileSync` + regex asserting code *shape*. `executeCommunicationsSend` has **no test file**. | High | §17 QA strategy is a deliverable, not an afterthought |
| R-2 | **All worktrees write the same live Supabase tenant.** A config sprint from an older branch silently destroys fields that exist only on a newer branch. | High | Stop other dev servers; never run two servers from one worktree |
| R-3 | Identity-platform certification was **never actually executed** ("local migration apply blocked: Docker unavailable") | Med-High | Re-certify before building on it |
| R-4 | **Cross-runtime divergence** (TS vs Python resolvers, two Twilio surfaces, dead TS inbound duplicating live Python) — a fix applied in one runtime silently doesn't apply in the other | Med-High | Pick one owner per concern; delete the loser |
| R-5 | **Free-text vocabularies** mean any new writer can introduce an unknown value with no DB rejection | Medium | CHECK constraints as part of each phase |
| R-6 | **Scope creep into a portal.** Interactive conversations edge naturally toward "just build a parent portal" — explicitly out of scope and a different security model | Medium | Token-scoped single-action only; §7 D4 |
| R-7 | **Scope creep into a second messaging platform** (WS7). Eight note mechanisms already compete. | Medium | Runtime, not a new store; §10.7 |
| R-8 | **Grants fail open** — six per-identity capability bits provide no restriction until a grant row exists, and nothing anywhere inserts one | Medium | Decide fail-open vs fail-closed (D6) |
| R-9 | Adding Gmail/Graph is a **platform change, not an adapter drop-in** — the `ProviderAdapter` interface has no `send()`, all transport is Python, no OAuth token store exists | Medium | Scope honestly; §14 Phase 5 |
| R-10 | **Sprint fatigue on deletion.** Dead code removal always slips. If it slips here, every subsequent sprint pays the duplication tax again. | Medium | Make deletion an acceptance criterion, not a task |

### 6.1 Cannot be answered from the repository — needs live verification

1. **Is the `org_documents` bucket public in any environment?** There is no bucket-creation migration and no `storage.objects` policy anywhere. If it is public, every tenant's documents are enumerable and R-CRIT-2 escalates from High to Critical.
2. **Does the Python Resend path send `body` as HTML?** Determines whether the missing template escaping (GAP-4) is a real injection vector or latent.
3. **What actually drives `process-due` and `/internal/messages/process` in production?** The only documented scheduler is an external Render Cron for Queue B; nothing documents Queue A.
4. **Is open/click tracking enabled in the Resend dashboard?** `opened_at`/`clicked_at` depend entirely on a setting with no repo representation.

---

## 7. Required Decisions

**These are Kelly's, not mine. Phase 1 cannot start without D1–D4.**

| # | Decision | Options | My recommendation |
|---|---|---|---|
| **D1** | **What is a conversation's subject?** | (a) keep `primary_entity_*`, add a CHECK; (b) add nullable BP/process-instance/work-unit columns; (c) a `communication_thread_links` many-to-many with `link_role` — **the 2026-06 architecture doc already proposed exactly this** (`messaging_v2_architecture.md:75-90`) and it was never built | **(c)**, phased in additively. The brief demands multi-attachment ("Organization, Business Process, Record, Operational Subject, Current Work, Timeline, Activity, BOS") and one column pair cannot express it. Keep `primary_entity_*` as the denormalized primary. |
| **D2** | **What is the message category vocabulary, and who owns it?** | Platform-fixed vs tenant-configurable; and the exact set (`operational` / `marketing` / `emergency` / `transactional` / …) | **Platform-fixed, closed CHECK, NOT NULL with a safe default.** Compliance semantics must not be tenant-editable. This is the highest-leverage single decision in the sprint. |
| **D3** | **Does the inbound anchor override (G4) stay?** Today a long-lived SMS thread anchors to whatever came first, and later work on other subjects lands on it. | (a) keep — "the conversation is the relationship"; (b) re-anchor per message; (c) keep the thread, attach subjects per message via D1(c) | **(c).** It preserves the (correct) relationship instinct while making per-message subject truthful. |
| **D4** | **What authority does a recipient token carry?** | (a) single-action, single-use, short-lived, bound to one command + one subject; (b) session-like, multi-action; (c) full portal | **(a), strictly.** (b)/(c) is a portal and a different security model. Explicitly out of scope for V1. |
| **D5** | **Where does internal conversation live?** | (a) Communications channel; (b) BOS; (c) a Conversation Runtime presentation | **(c).** BOS is architecturally disqualified — `sessionStorage`-only, tab-scoped, single-operator, defined to terminate on command execution, and its own charter forbids it. (a) produces "a message to a parent with a lie flag on it." Evidence in `findings/ws7-internal-ws9-ai.md`. |
| **D6** | **Do identity grants fail open or closed?** Today: open, and nothing can create a grant. | fail-open (documented intent) vs fail-closed | **Fail-open until a grant-management UI exists**, then flip. Flipping first locks everyone out. |
| **D7** | **Legacy `public.messages` / `messages_outbox` — retire now or later?** Still written and drained in the same request as the canonical queue. | now / Phase N / not this sprint | **Not this sprint.** A retirement plan already exists (`legacy-messages-retirement-plan.md`) with Phase 5 unscheduled. Freeze writes, don't drop. |
| **D8** | **Does WS7 include real-time/presence?** Nothing in Alloy is real-time today; Supabase Realtime is used nowhere. | in V1 / deferred | **Defer.** Read status and unread counts ship without it and cover most of the value. Presence is a platform-wide first. |
| **D9** | **Announcements: fix delivery or hide the surface?** It composes and schedules and never delivers, silently. | wire Phase-3 delivery / disclose in UI / hide behind its flag | **Disclose immediately (one-line banner), wire in Phase 4.** Silently accepting a schedule that will never fire is the worst option and is shipping today. |
| **D10** | **`brands` — create the entity, or collapse WS6 to Org→Location→Program→Room?** No brand table exists and nothing anticipates one. | create / defer | **Defer brand.** Ship 4 levels on the canonical `resolveConfigRule` pattern; brand slots in later as one `SCOPE_SPECIFICITY` entry + one nullable FK per table. |
| **D11** | **Which program entity?** `location_program_categories` (site-scoped) vs `programs` (org-scoped). | — | Needs your call — it depends on where the org is heading with Configuration Publication. |
| **D12** | **Do the three critical findings become a hotfix track ahead of Phase 1?** | yes / fold into Phase 1 | **Yes.** R-CRIT-1 is live regulatory exposure. |

---

## 8. Database Changes

All additive-and-nullable-first, per the standing migration rule (Scope Freeze §4). Ordered by phase.

### 8.1 Phase 0 — corrective

```sql
-- D3/R-CRIT-4: reconcile announcement_targets (repair migration, mirroring the templates repair)
ALTER TABLE announcement_targets ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE announcement_targets ADD COLUMN IF NOT EXISTS target_ref  uuid;
ALTER TABLE announcement_targets ADD COLUMN IF NOT EXISTS rule        jsonb NOT NULL DEFAULT '{}';
ALTER TABLE announcement_targets ALTER COLUMN target_spec DROP NOT NULL;
-- + backfill target_spec -> target_type/target_ref where derivable
-- + a test asserting both shapes coexist

-- D11: idempotency on inbound
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_comm_messages_provider_message_id
  ON communication_messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- D10 + F3: pin the status vocabulary that four runtimes write
ALTER TABLE communication_messages
  ADD CONSTRAINT communication_messages_status_chk
  CHECK (status IN ('queued','sent','delivered','failed','bounced','complained','replied','received'));

ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS updated_at timestamptz;  -- R? no update ts today
```

### 8.2 Phase 1 — the three blocking gaps

```sql
-- B1: message category (D2). NOT NULL with a safe default, closed CHECK.
ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'operational';
ALTER TABLE communication_messages
  ADD CONSTRAINT communication_messages_category_chk
  CHECK (category IN ('operational','transactional','marketing','emergency','internal'));

-- B3 / D1(c): multi-subject attachment. primary_entity_* stays as denormalized primary.
CREATE TABLE communication_thread_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  subject_type text NOT NULL,       -- CHECK-constrained, see below
  subject_id uuid NOT NULL,
  link_role text NOT NULL,          -- 'primary' | 'context' | 'derived'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, subject_type, subject_id, link_role)
);
-- subject_type CHECK: organization|location|person|customer|opportunity|job
--                     |business_process|process_instance|participation|work_unit
-- Optional per-message override for D3(c):
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS subject_link_id uuid
  REFERENCES communication_thread_links(id) ON DELETE SET NULL;

-- F3: pin the anchor vocabulary, singular-normalized, after a backfill normalizing plural forms
-- (deferred to Phase 2 — needs a data audit first)
```

### 8.3 Phase 2 — telemetry + reliability

```sql
-- D4: make the recipients table real (it is currently never INSERTed)
--   -> no DDL; this is a code fix in canonicalOutboundEnqueue.ts

-- D7: retry + DLQ
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS attempts        integer NOT NULL DEFAULT 0;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS max_attempts    integer NOT NULL DEFAULT 5;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS locked_at       timestamptz;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS locked_by       text;

-- N2/N3: analytics attribution
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS template_id      uuid REFERENCES communication_templates(id) ON DELETE SET NULL;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS template_version integer;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS sender_user_id   uuid;

-- G15: pin attention/sla vocabularies (the PKG-10/11 debt)
ALTER TABLE communication_threads
  ADD CONSTRAINT communication_threads_attention_state_chk
  CHECK (attention_state IS NULL OR attention_state IN
         ('needs_response','awaiting_parent_reply','waiting_on_us','resolved','snoozed'));
```

### 8.4 Phase 3 — interactive + attachments

```sql
CREATE TABLE communication_message_actions (      -- B2: CTA as a first-class object
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  action_key text NOT NULL,          -- capability key, externalInvocable only
  label text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  subject_type text NOT NULL, subject_id uuid NOT NULL,
  token_hash text NOT NULL,          -- SHA-256, mirroring form_public_links
  recipient_person_id uuid,          -- B5: the token resolves to a PERSON
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz, consumed_by_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON communication_message_actions (token_hash);

CREATE TABLE communication_message_attachments (  -- WS11
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  disposition text NOT NULL DEFAULT 'attachment',  -- attachment | inline | link
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, document_id)
);
```

### 8.5 Phase 4 — hierarchy + preferences

```sql
-- WS6: adopt the canonical resolveConfigRule shape exactly
CREATE TABLE communication_identity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('org','site','program','room')),
  site_location_id uuid REFERENCES locations(id),
  program_category_id uuid REFERENCES location_program_categories(id),
  room_location_id uuid REFERENCES locations(id),
  channel text NOT NULL CHECK (channel IN ('sms','email')),
  identity_id uuid REFERENCES communication_identities(id) ON DELETE CASCADE,
  reply_to text, signature text,
  quiet_hours jsonb, business_hours jsonb, compliance jsonb,
  effective_start date NOT NULL, effective_end date,
  source_key text, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_identity_rules_scope_shape CHECK (
    (scope_type='org'     AND site_location_id IS NULL AND program_category_id IS NULL AND room_location_id IS NULL) OR
    (scope_type='site'    AND site_location_id IS NOT NULL AND program_category_id IS NULL AND room_location_id IS NULL) OR
    (scope_type='program' AND program_category_id IS NOT NULL AND room_location_id IS NULL) OR
    (scope_type='room'    AND room_location_id IS NOT NULL))
);
-- + reuse validate_childcare_config_scope()-style trigger for site/room type integrity

-- WS8: preferred email/phone become expressible
CREATE TABLE contact_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email','phone')),
  value text NOT NULL, normalized_value text NOT NULL,
  is_preferred boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, person_id, kind, normalized_value)
);
ALTER TABLE persons ADD COLUMN IF NOT EXISTS preferred_language text;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS timezone text;

-- consent audit gets a writer (table already exists, currently dead)
```

### 8.6 Phase 5 — internal conversations

```sql
CREATE TABLE communication_thread_participants (   -- the genuinely missing primitive
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  participant_type text NOT NULL CHECK (participant_type IN ('user','person','team')),
  participant_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  added_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz,
  UNIQUE (thread_id, participant_type, participant_id)
);

ALTER TABLE communication_messages DROP CONSTRAINT communication_messages_direction_check;
ALTER TABLE communication_messages ADD  CONSTRAINT communication_messages_direction_check
  CHECK (direction IN ('inbound','outbound','internal'));   -- the DB currently makes staff↔staff unrepresentable

ALTER TABLE communication_threads ALTER COLUMN primary_entity_type DROP NOT NULL;  -- a staff thread may have no family
ALTER TABLE communication_threads ALTER COLUMN primary_entity_id   DROP NOT NULL;

CREATE TABLE notifications (...);   -- B6 — platform-wide, not comms-specific
CREATE TABLE message_mentions (...);
```

### 8.7 RLS posture — a standing correction

Every new table follows the existing `_select_org` pattern **but must not repeat two existing mistakes**: drop `GRANT ALL ... TO anon` (grant `SELECT` to `authenticated` only, as `metric_snapshots` correctly does), and drop the incoherent `_service_all ... TO authenticated USING (auth.role() = 'service_role')` policy, replacing it with an explicit comment that writes go through service-role server code.

---

## 9. API Changes

### 9.1 New

| Route | Purpose | Phase |
|---|---|---|
| `POST /api/public/actions/[token]/execute` | **The generalization of the tour-booking precedent.** Token-scoped, single-action, single-use; resolves token → `{capability, subject, recipient_person_id}`; rejects any capability not flagged `externalInvocable`; runs the same Platform Transaction with an `external_recipient` actor. | 3 |
| `GET /api/public/actions/[token]` | Resolve token → renderable action (e.g. available tour times) without executing | 3 |
| `POST /api/public/actions/[token]/upload` | External document upload (G5) — the UI already promises "Sign & upload" | 3 |
| `POST /api/webhooks/inbound-email/[provider]` | Inbound email ingestion; provider TBD (D-provider) | 5 |
| `POST /api/admin/communications/messages/[id]/retry` | Operator remediation for failed sends (U8, D7) | 2 |
| `GET /api/admin/communications/failures` | Failed-send queue surface | 2 |
| `POST /api/admin/communications/conversations/[id]/resolve-sender` | Assign an unknown/ambiguous inbound sender (U7) | 2 |
| `POST/PATCH/DELETE /api/admin/communications/identities/**` | **The identity platform's missing write path** (I1) | 4 |
| `POST/DELETE /api/admin/communications/identities/[id]/grants` | Grant management (D6) | 4 |
| `GET/PUT /api/admin/communications/hierarchy/rules` | WS6 authoring | 4 |
| `GET /api/admin/communications/hierarchy/resolve` | Resolution **with provenance** — which level bound, and why | 4 |
| `POST /api/admin/communications/templates/[id]/publish` | Approval transition (GAP-6) | 4 |
| `POST /api/admin/communications/threads/[id]/participants` | WS7 | 5 |

### 9.2 Changed

| Route | Change | Phase |
|---|---|---|
| `POST /api/admin/communications/send` | Accept `category` (required), `template_id`, `attachments[]`, `actions[]`; **render tokens server-side before enqueue** (fixes R-CRIT-3) | 1–3 |
| `POST /api/admin/communications/family-send` | Same; becomes **the** canonical send shape (batched, review-first). `/send` becomes a thin adapter. | 1 |
| `POST /api/admin/communication-scheduled-sends` | Accept `persons` / `customers` entity types and non-`task_assist` sources (fixes U2/GAP-2) | 1 |
| `POST /api/admin/communication-scheduled-sends/process-due` | Add `assertCommunicationsSendAllowed` on the session path; keep cron-token path but log all-org scope explicitly (D12) | 0 |
| `POST /api/admin/communications/family-note` | Add the send-permission gate (D12) | 0 |
| `POST /api/admin/opportunities/[id]/form-deliver` | Add the send-permission gate (D12) | 0 |
| Resend + Twilio webhooks | **Emit `workflow_events`** so delivery reaches the timeline (D5); stop conflating `bounced`/`complained` (D10) | 2 |
| `web/middleware.ts` | Add `/api/webhooks/twilio/sms-status/[binding_id]` to the public-webhook bypass (R19) | 0 |

### 9.3 Deleted

`GET /api/admin/communications/identities` in its current GET-only form is superseded by the full CRUD set. The two overlapping `announcements/recipient-preview` routes collapse to one.

---

## 10. UI Changes

### 10.1 The Composer Runtime (WS4) — the sprint's centerpiece

Finish the abandoned migration, following the pattern the Family Workspace already proves:

1. **Contract** — resurrect `ComposerDraft` (`composerModel.ts:11-19`) as a registered surface contract, mirroring `drawerSectionContract.ts`.
2. **Capability registry** — one entry per surface: `{multiRecipient, templates, attachments, schedule, preview, reviewFirst, internalNote}`, validated like `validateDrawerSectionRegistry`. **This makes U1's inert buttons impossible to write** — a surface either declares the capability or does not render the control.
3. **Presentation variants** — generalize `FamilyWorkspaceSurfaceVariant` to `modal | drawer | activity_embed | inbox_reply | quick | broadcast`, preserving "runtime behavior is shared; variants alter presentation only."
4. **Preview VM seed** — extend past `"preview-1"` to carry `composerDraft` + resolved token context, so preview renders against the **real recipient** rather than `SAMPLE_CONTEXT`.
5. **One send seam** — everything behind the `/family-send` shape.

Then delete: `ComposerV2`, `TemplateBuilder`, `AnnouncementBuilder`, `MessagingComposerFrame` (absorbed), and `CommunicationsDrawerSectionLegacy` — but **first port its unique capabilities** (optimistic rows, activity invalidation, contact-attempt notes) which the live path lacks.

### 10.2 Other UI work

| Change | Phase |
|---|---|
| Announcements: disclose that delivery is gated (D9) — a one-line banner | **0** |
| Failed-send queue + retry control (U8) | 2 |
| Unknown-sender resolution surface (U7) | 2 |
| Template editor: unresolved-token blocker before `active` (R-CRIT-3) | 1 |
| Preview against a real recipient | 3 |
| Attachment drag/drop — reuse `ProcessingImportAction`'s handlers | 3 |
| Interactive action builder in the composer | 3 |
| Recipient-facing action page (`/action/[token]`) — mobile-first, single-purpose | 3 |
| Identity/provider admin UX (I1) + grant management | 4 |
| Hierarchy editor with **provenance display** ("inherited from Organization" / "overridden by North Campus") — reuse `organizationLocationScope.ts:6,14` | 4 |
| Merge the two inbox surfaces (U9) | 4 |
| Internal thread presentation + mentions + notification center | 5 |

---

## 11. Settings Changes

Today: three editable fields behind a "mid-build" banner.

| Setting | Level | Phase |
|---|---|---|
| Provider account CRUD (add/verify/disable) | Org | 4 |
| Sender identity CRUD + verification workflow (`verification_state` currently has **no writer**) | Org/Location | 4 |
| Identity → location binding + priority + default | Location | 4 |
| Per-user identity grants | Org | 4 |
| Reply-to, signature (**neither exists in any schema today**) | Org→Room | 4 |
| Business hours (reuse `childcare_operating_windows`) | Org→Room | 4 |
| Quiet hours (generalize out of tours; today JSON-blob on the anti-pattern) | Org→Room | 4 |
| Compliance: unsubscribe footer, STOP handling, suppression list | Org | 1 |
| Message-category defaults per template category | Org | 1 |
| Template approval requirement toggle | Org | 4 |
| Preference defaults + preferred-guardian policy | Org | 4 |

---

## 12. Security Considerations

### 12.1 Must fix before or during Phase 1

| # | Issue | Fix |
|---|---|---|
| S1 | **Opt-out unenforced; STOP unprocessed** (R-CRIT-1) | Wire `communication_opt_out` → `communication_preferences`; enable `comms_v2_compliance`; wire `parseSmsKeyword` into the Python inbound path; add category (B1) so the gate has an input |
| S2 | **Doc signed-URL route has no role check and bypasses RLS** (R-CRIT-2) | Add role gate; stop using `createAdminClient()` for reads a user should be RLS-scoped to |
| S3 | **Zero Supabase Storage RLS repo-wide** | Author `storage.objects` policies; **verify bucket visibility in the live project first** |
| S4 | **Public vendor upload writes outside the `{org_id}/` convention** (driver's licenses, insurance) | Re-path + backfill; any future storage policy will silently miss these |
| S5 | **Unauthenticated upload: no size limit, no MIME allowlist, no virus scan anywhere in the repo** | Size cap + allowlist + magic-byte check; decide on scanning |
| S6 | **Silent cross-tenant credential fallback on email send** (D9) | Remove the unconditional `env:RESEND_API_KEY` fallback; fail closed like the SMS branch already does |
| S7 | **Three send-capable routes lack the send-permission gate**; cron path processes all orgs | Add gates; scope or explicitly log all-org runs |
| S8 | **Comms metrics ignore operator location scope** (D8) | Apply `filter.locationIds`/`constraints`, as `eventWindowMetrics.ts` already does correctly |
| S9 | **`GRANT ALL … TO anon` on every communications table** | Revoke; grant `SELECT` to `authenticated` only |
| S10 | **`secret_ref` readable by every org member** via PostgREST | Column-level revoke or a view |

### 12.2 New security surface this sprint introduces

**Recipient tokens are the single largest new attack surface.** Requirements, non-negotiable:

- SHA-256 hashed at rest (follow `form_public_links`, **not** the plaintext `action_links` generation)
- Short expiry, single-use, `consumed_at` recorded
- Bound to exactly one capability + one subject + one person
- Rate-limited per token and per IP
- **Capability allowlist enforced server-side** — `externalInvocable` on the definition, never inferred from the request
- Actor recorded as `external_recipient` with the resolved `person_id` — **never** as a null actor, and never as an operator
- **No enumeration**: identical response shape and timing for invalid, expired, and consumed
- Revocable when the underlying subject changes state

**Attachments** add: recipient-facing document links need a **different, longer-lived, revocable** token than the current 10-minute operator signed URL (A6). Do not reuse the operator mechanism.

**Provider credentials** remain platform-global (`env:VAR` only). True BYO-credential multi-tenancy is architecturally impossible under the current `secret_ref` grammar — worth naming explicitly as a V2 decision rather than discovering it during an enterprise sale.

---

## 13. Migration Strategy

**Standing rule (Scope Freeze §4): all additive and nullable first; no destructive change in place.**

### 13.1 Sequence per change

1. Add nullable column / new table
2. Backfill idempotently in a `DO $$` block that **skips rather than fabricates** (the identity backfill `20260715120000:317-341` is the model)
3. Dual-write in code
4. Verify parity with a test that reads both paths
5. Switch reads
6. Add the CHECK / NOT NULL constraint
7. Retire the old writer
8. Drop the old column — **a later sprint, never the same one**

### 13.2 Specific hazards

| Hazard | Handling |
|---|---|
| **`announcement_targets` divergence** | Repair migration must be **idempotent and shape-agnostic** — it may run against either shape. Add a test asserting both coexist. Do this **before** any announcement work. |
| **`version`/`version_number` trigger shim** | Do not remove in this sprint. Add a test that the trigger exists and that a raw insert without `version` succeeds. Document that any non-helper writer depends on it. |
| **`primary_entity_type` plural/singular drift** | Audit live data **before** adding a CHECK. Normalize in a dedicated migration with a reversible mapping. |
| **`category` NOT NULL** | Ship with `DEFAULT 'operational'` so no existing row breaks; tighten only after every writer supplies it explicitly. |
| **Legacy `public.messages`** | Freeze writes; do not drop. A retirement plan exists with Phase 5 unscheduled (D7). |
| **All worktrees share one live tenant (R-2)** | Stop other dev servers before any config-touching work. Never run two servers from one worktree. |
| **Identity platform never certified locally** | Re-run `supabase db reset` + backfill certification before Phase 4. |

---

## 14. Workstream Dependencies

```
                  ┌─────────────────────────────────────────┐
   PHASE 0        │ HOTFIX: opt-out · doc access · tokens   │
   corrective     │ announcement_targets · perm gates       │
                  └────────────────┬────────────────────────┘
                                   ▼
   PHASE 1        ┌──────────────────────────────────────────┐
   foundations    │ B1 category  ·  B3 subject links         │
                  │ send-time rendering  ·  scheduled-send    │
                  │ entity generalization                     │
                  └───┬───────────────┬──────────────┬────────┘
                      ▼               ▼              ▼
   PHASE 2      ┌──────────┐   ┌───────────┐  ┌──────────────┐
   reliability  │ WS5      │   │ WS4       │  │ B4 scheduler │
   + convergence│ telemetry│   │ composer  │  │ + retry/DLQ  │
                └────┬─────┘   └─────┬─────┘  └──────┬───────┘
                     │               │                │
                     ▼               ▼                ▼
   PHASE 3      ┌────────────────────────────────────────────┐
   interactive  │ B5 tokens → WS1 interactive · WS11 attach   │
                │ WS12 delivery (render/escape/preview)       │
                └────────────────┬───────────────────────────┘
                                 ▼
   PHASE 4      ┌────────────────────────────────────────────┐
   config       │ WS2 identity write path · WS6 hierarchy     │
                │ WS8 preferences · WS10 automation · WS13    │
                └────────────────┬───────────────────────────┘
                                 ▼
   PHASE 5      ┌────────────────────────────────────────────┐
   expansion    │ WS3 inbound email · WS7 internal + notifs   │
                │ WS9 AI assist                               │
                └────────────────────────────────────────────┘
```

### 14.1 Hard dependencies

- **WS8 → B1.** Preferences are decorative without a message category. Do not start WS8 first.
- **WS6 compliance → B1.** Quiet hours cannot gate what it cannot classify.
- **WS1 → B2 + B5.** Interactive actions need structured content *and* recipient tokens.
- **WS11 → B2.** Attachments need a content model.
- **WS12 delivery → B2.** Rendering is the gap, not authoring.
- **WS10 → B4.** Without a scheduler, no automation fires — including the tour reminders that already exist.
- **WS7 → B6.** Mentions/assignments/handoffs are inert without notifications.
- **WS13 → WS5 + `template_id` + `sender_user_id`.** Four of seven target metrics are simply not computable today.
- **WS3 inbound email → a provider decision.** No receiving provider exists in the repo; this is a procurement decision, not an engineering one.

### 14.2 Independent (can parallelize)

WS4 composer convergence · WS12 authoring improvements · WS2 identity write path · dead-code deletion.

---

## 15. Recommended Sprint Sequencing

**One sprint per phase. Each returns for approval.** I am deliberately **not** proposing a single mega-sprint — the discovery shows the dominant failure mode in this codebase is *half-wired subsystems*, and long sprints are how that happens.

| Sprint | Name | Scope | Exit condition |
|---|---|---|---|
| **0** | Conversation Platform Hotfix | R-CRIT-1/2/3/4 + permission gates + middleware bypass + announcements disclosure | No live regulatory or data-access exposure; schema reconciled |
| **1** | Conversation Foundations | Message category · subject links · send-time rendering · scheduled-send generalization | A message has a truthful category and subject; templates render; Send-later works everywhere |
| **2** | Reliability & Composer Convergence | Recipients INSERT · webhook→timeline · retry/DLQ · scheduler · failed-send UI · composer runtime · dead-code deletion | No silent send failure; one composer runtime; orphans deleted |
| **3** | Interactive Conversations | Recipient tokens · `externalInvocable` · public action execute · attachments · external upload · preview-against-real-recipient | A parent picks a tour time from an email and the tour books through the Platform Transaction |
| **4** | Configuration & Intelligence | Identity write path · hierarchy on `resolveConfigRule` · preferences · automation `send_communication` target · OIP metrics | An operator configures identity/hours/preferences per level and sees provenance |
| **5** | Inbound & Internal | Inbound email · threading headers · identity-resolution convergence · internal conversations · notifications | A parent's email reply lands on the right thread and advances the right work |

### 15.1 If you want the shortest path to visible product value

**Sprint 0 → Sprint 1 → Sprint 3.** Skip 2 and 4 temporarily. Interactive tour scheduling in an email is the most demonstrable capability in the whole brief, and the seam already exists. The cost of skipping is that reliability debt (D5–D7) compounds — acceptable for a demo, not for production.

---

## 16. Estimated Implementation Phases

Estimates are **relative sizing, not calendar commitments** — I have no velocity data for this team.

| Phase | Size | Confidence | Driver of uncertainty |
|---|---|---|---|
| 0 Hotfix | S | High | Well-understood; bounded |
| 1 Foundations | M | High | Backfill of `primary_entity_type` drift is the unknown |
| 2 Reliability + Composer | L | Medium | Composer convergence touches 6 surfaces; deletion is politically slow |
| 3 Interactive | L | **Low-Medium** | Net-new security surface; external-actor representation in the command runtime is genuinely novel |
| 4 Configuration | L | Medium | Hierarchy is mechanically well-understood (canonical pattern) but broad |
| 5 Inbound + Internal | XL | **Low** | Inbound email needs a provider decision; notifications + realtime are platform-wide firsts |

**The two low-confidence phases are low-confidence for different reasons.** Phase 3 is novel-but-bounded. Phase 5 has an unresolved external dependency (provider choice) and two platform-wide prerequisites. I would not commit to Phase 5 scope until Phase 3 lands.

---

## 17. QA Strategy

### 17.1 The honest starting point

**The communications test suite is 98 files and 615 cases, and it proves very little about behavior.**

- **Zero tests touch a database.** No `createClient`, no `SUPABASE_SERVICE_ROLE`.
- **Zero tests import a route handler.** Every claim of "route coverage" is `readFileSync` + regex asserting code *shape*.
- **~23 tests assert source text**, and 9 more regex migration SQL.
- **`executeCommunicationsSend` — the single guarded send path — has no test file.**
- `canonicalOutboundEnqueue` is reached only indirectly, through 2 cases with 5 mocks.
- Untested entirely: both Twilio webhook modules, `loadIdentityContext`, `consentEnforcement`, and the whole `commandCenterConversationEnrichment` subject-resolution ladder.

**A shape test that passes while the behavior is broken is worse than no test** — it produces false confidence, which is exactly what R-CRIT-1 and D4 look like from the outside.

### 17.2 What this sprint must add

| Layer | Requirement |
|---|---|
| **DB-backed integration** | A real Supabase test stack. Non-negotiable for: the scheduled-send lease under concurrency, the recipients INSERT, RLS behavior, the `announcement_targets` dual shape, and inbound thread matching. |
| **Route-level** | Import and invoke handlers. Every route asserts: auth gate present, org scoping applied, permission gate present. Replaces the regex contract tests. |
| **Cross-runtime parity** | TS `resolveSenderIdentity` vs Python `identity_resolver` must agree on a shared fixture matrix. Two divergent resolvers is R-4. |
| **Consent matrix** | Every (category × preference state × channel × lifecycle stage) combination, asserted against `consentGate`. This is the regression fence for R-CRIT-1. |
| **Token security** | Expiry, single-use, wrong-subject, wrong-capability, enumeration timing, rate limit. |
| **Rendering** | No template reaches a provider with unresolved tokens. Escaping asserted for every field type. |
| **Schema-drift assertions** | A test that fails if `announcement_targets` or the template version shim drifts. |
| **Browser certification** | Per house practice: authed Playwright against the real app on the slot port (3012), never a `/dev` harness, never seeded fake data. Entry point is opening a real child and acting. |

### 17.3 Explicit non-goals

Do not add more `readFileSync` shape tests. Where one exists and a real test replaces it, **delete the shape test** — leaving both is how the false-confidence problem persists.

---

## 18. Acceptance Criteria

### Phase 0 — Hotfix

- [ ] A person marked "opted out" receives **zero** subsequent operational sends — proven by an integration test and a live-tenant check
- [ ] An inbound `STOP` sets the corresponding preference to `opted_out` and is reflected in the operator UI
- [ ] No document is retrievable by a role below the RLS-declared set; the signed-URL route enforces a role gate
- [ ] `storage.objects` policies exist, or a written, dated exception records why not
- [ ] `announcement_targets` is reconciled; a test asserts both shapes coexist; the targets route succeeds on a PKG-05-first database
- [ ] `process-due`, `family-note`, and `form-deliver` all enforce `assertCommunicationsSendAllowed`
- [ ] Announcements UI states that delivery is not yet enabled

### Phase 1 — Foundations

- [ ] Every `communication_messages` row has a non-null `category` from the closed vocabulary; every writer supplies it explicitly
- [ ] `enforceConsentForSend` is **enabled by default** and blocks a marketing send to an opted-out person
- [ ] No message reaches a provider containing `{{`; the template editor blocks `active` with unresolved tokens
- [ ] A thread carries ≥1 `communication_thread_links` row; a thread can attach to a business process **and** a record simultaneously
- [ ] "Send later" works from every composer for `persons`- and `customers`-anchored threads

### Phase 2 — Reliability & Convergence

- [ ] Every outbound message creates its `communication_message_recipients` row(s); per-recipient webhook updates take effect
- [ ] Delivery, open, click, bounce, and complaint each emit a `workflow_events` row in the `communications` timeline category
- [ ] The optimistic fake `message_delivered` is removed
- [ ] A failed send retries with backoff and lands in a DLQ after `max_attempts`; an operator can see and retry it
- [ ] A committed scheduler drives both drains; a documented runbook exists
- [ ] Concurrent workers cannot double-send (proven by a DB-backed concurrency test)
- [ ] One composer runtime serves all surfaces; no rendered control lacks a handler
- [ ] `ComposerV2`, `TemplateBuilder`, `AnnouncementBuilder`, and `CommunicationsDrawerSectionLegacy` are deleted, with unique capabilities ported first

### Phase 3 — Interactive

- [ ] **A parent receives an email listing tour times, taps one, and the tour books through the same Platform Transaction as the operator path** — the mission's flagship scenario, certified in a browser
- [ ] The same action renders as an SMS short link and completes identically
- [ ] A token is single-use, expiring, hashed at rest, bound to one capability + subject + person; invalid/expired/consumed are indistinguishable
- [ ] A capability without `externalInvocable` is rejected server-side
- [ ] The action is recorded with an `external_recipient` actor — not null, not an operator
- [ ] A parent uploads a document from a link; it lands in `documents` with correct tenant isolation
- [ ] Composer preview renders against the real recipient

### Phase 4 — Configuration & Intelligence

- [ ] An operator creates a provider account and sender identity **in the UI** — no SQL
- [ ] Identity resolution honors Org→Location→Program→Room and **reports which level bound and why**
- [ ] Quiet hours suppress a non-emergency send and defer it; an `emergency`-category message is not suppressed
- [ ] A `send_communication` rule target exists; tour-booked → 24h reminder → 2h reminder → no-show → follow-up task → Current Work fires end-to-end **from configuration, not code**
- [ ] Comms metrics respect operator location scope; response time, template performance, and operator responsiveness are computable

### Phase 5 — Inbound & Internal

- [ ] A parent's email reply lands on the correct existing thread via message-id headers
- [ ] Inbound uses the confidence-tiered identity resolver; ambiguous senders reach an operator resolution surface rather than a dead end
- [ ] An inbound reply advances the configured business process
- [ ] Staff hold an internal thread on a record with mentions, read state, and assignment — with **no second messaging store**
- [ ] The eight legacy note mechanisms are migrated or deleted

### Cross-cutting — every phase

- [ ] No new free-text column where a vocabulary is intended
- [ ] No new `GRANT ALL … TO anon`
- [ ] Every new route: auth gate + org scoping + permission gate, asserted by a route-level test
- [ ] Dead code identified in that phase is **deleted in that phase**
- [ ] Browser certification via authed Playwright on port 3012 against the real app

---

## Appendix — Evidence index

| File | Covers |
|---|---|
| [`findings/core-architecture-baseline.md`](findings/core-architecture-baseline.md) | Schema, runtime, API surface, workers, subject attachment, docs, tests, 20-item risk ledger |
| [`findings/ws1-interactive-ws10-automation.md`](findings/ws1-interactive-ws10-automation.md) | WS1, WS10 — command runtime contract, token generations, automation engines, 11 doc/code contradictions |
| [`findings/ws2-identity-ws6-hierarchy.md`](findings/ws2-identity-ws6-hierarchy.md) | WS2, WS6 — identity schema, providers, credentials, the canonical inheritance pattern, 8 security concerns |
| [`findings/ws3-ingestion-ws5-intelligence.md`](findings/ws3-ingestion-ws5-intelligence.md) | WS3, WS5 — inbound reality, threading, identity engines, delivery telemetry, retry |
| [`findings/ws4-composer-ws12-templates.md`](findings/ws4-composer-ws12-templates.md) | WS4, WS12 — 12 compose surfaces, capability matrix, template migration archaeology, 20 gaps |
| [`findings/ws7-internal-ws9-ai.md`](findings/ws7-internal-ws9-ai.md) | WS7, WS9 — note mechanisms, BOS architecture, complete AI inventory, placement recommendation |
| [`findings/ws8-preferences-ws11-attachments-ws13-analytics.md`](findings/ws8-preferences-ws11-attachments-ws13-analytics.md) | WS8, WS11, WS13 — person model, consent stores, documents, OIP, 9 security concerns |
