# WS4 Composer Runtime Convergence + WS12 Template Platform — Discovery Findings

Sprint: `conversation-platform-v1-discovery` (slot 2). Base `origin/staging @ 3fc2e0f4e`. Read-only.

---

## WS4 — Composer Runtime Convergence

### 4.1 Headline

**Convergence is already ~70% done at the transport layer and ~40% done at the UI layer, and nobody finished it.** Three of the four live operator composers already funnel into one function (`executeCommunicationsSend`), but there are **two independent composer UI runtimes**, **one dead-by-default third**, **three orphaned composers that no route mounts**, and **four separate token/merge-field render engines**.

The single biggest structural finding: **templates never reach a send.** Two surfaces can apply a template into a draft, and the applied body carries raw `{{tokens}}` that **no send path ever resolves** — `executeCommunicationsSend` does zero token rendering. See GAP-1.

### 4.2 Compose surfaces — inventory

#### S1. Family Communication Workspace (the de-facto primary composer)

- View `web/app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx:211` (1145 lines)
- Runtime hook `web/lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts:174`
- Send `POST /api/admin/communications/family-send` at `useFamilyCommunicationRuntime.ts:429`

Mounted in **four** hosts through one shared runtime — this is the convergence that *did* happen:

| Host | File:line | `surfaceVariant` |
|---|---|---|
| Command Center modal | `CommandCenterShell.tsx:596` | `default` |
| Compose-New modal | `ComposeNewCommunicationModal.tsx:233` | `workspace_inbox` |
| Record drawer Comms tab | `RecordCommunicationsTab.tsx:44` → `FamilyCommunicationWorkspace.tsx:57` | `default` |
| Focus Panel Activity embed | `CurrentWorkActionPanel.tsx:121`, `OpportunityFocusPanelEmbeddedWorkspace.tsx:131` | `activity_embed` |

`surfaceVariant` (`v2/familyWorkspace/surfaceVariant.ts:2`) is explicitly documented as **presentation-only** — "Runtime behavior is shared; variants alter presentation only." This is the pattern a Composer Runtime should generalize.

**Supports:** multi-recipient toggle from `vm.recipientGroups` `:333`; email/sms/note modes; **review-first two-phase send** (`confirm:false` preflight → per-recipient ready/blocked list → `confirm:true` fan-out, `:853-884`); per-recipient consent blocking; internal notes; Send-later modal; BOS Assist button.

**Cannot do:** **attachments** — `<button aria-label="Attach">` `:832` has **no `onClick`**. **Templates** — `<button aria-label="Templates">` `:833` has **no `onClick`**. Emoji `:830` likewise inert. No template application, no token preview, no variable resolution, no scheduling for non-opportunity anchors (S7), no attachments anywhere in the stack.

#### S2. Drawer Messaging Composer (**dead by default**)

- `web/components/adminV2/messaging/DrawerMessagingComposer.tsx`; host `components/admin/communications/CommunicationsDrawerSection.tsx`, send loop `:1005`
- Send `POST /api/admin/communications/send`, **one HTTP request per recipient** in a `for` loop `:993-1020`

**Critical:** `CommunicationsDrawerSection.tsx:1441-1454` forks on `isCommsV2FlagEnabled("comms_v2_record_tab")`, which is in `CORE_COMMS_V2_FLAGS` and **defaults ON** (`v2/flags.ts:53-58`). The entire 1456-line `CommunicationsDrawerSectionLegacy` + `DrawerMessagingComposer` path is **unreachable unless an operator explicitly sets `NEXT_PUBLIC_COMMS_V2_RECORD_TAB=false`**. It is a dormant fallback carrying real capability — optimistic message rows, contact-attempt association notes, `dispatchOpportunityDrawerScopedUpdate` activity invalidation `:1057` — that the live S1 path does **not** replicate.

**Supports:** recipient chips filtered by channel `:105-106`, channel toggle with per-reason disable, subject, Send-later, BOS Assist, optimistic rows, starter-copy seeding via `lib/communications/opportunityComposeTemplates.ts` (hardcoded per-`status_key` strings, **not** the template platform).
**Cannot do:** attachments, templates, preview, batching, scheduling for non-opportunity entities.

#### S3. Inbox Thread Reply Box

- `web/components/adminV2/messaging/InboxThreadReplyBox.tsx:89`; host `app/adminV2/messages/InboxPanel.tsx:547`; send `POST /api/admin/communications/send`

**Supports:** channel toggle gated by `reply_email_available`/`reply_sms_available` `:61-65`, subject, Send-later, BOS Assist, reply-target resolution via `inboxThreadIdentity.ts`.
**Cannot do:** **multi-recipient** — single `replyTarget` only; "Add recipient" `:118-127` does not add a recipient, it opens `QuickMessageModal` (S4) as a separate compose. No templates, attachments, or preview.

#### S4. Quick Message Modal (**the only composer with real template support**)

- `web/app/adminV2/components/QuickMessageModal.tsx` (991 lines), send `:501`; hosts `TopNavBar.tsx:239` (global), `InboxPanel.tsx:674`
- Send `POST /api/admin/communications/send` with `quick_message: true`, **per-recipient loop** `:489-518`

**Supports:** person search (`/api/admin/communications/person-search`), multi-recipient, channel auto-selection when a recipient has only one contact method `:465-470`, **template dropdown** — `GET /api/admin/communications/templates?status=active` `:195`, filtered to channel `:158-161`, applied via `fetchCommunicationTemplateCurrentVersion` `:228` → `communicationTemplateDraftSeedFromPreview` `:230`. Send-later.
**Cannot do:** **token resolution on the applied template** (raw `{{contact.first_name}}` lands in the textarea and ships), preview, attachments, review-first preflight, batched send.

#### S5. Announcements Workspace (broadcast composer)

- `web/app/adminV2/communications/AnnouncementsWorkspace.tsx` (1102 lines); host `CommunicationsModalTabPanel.tsx:118`; API `/api/admin/communications/announcements/**`

**Supports:** title/subject/body, `channels` array, audience targeting + `recipient-preview`, schedule, cancel, archive, **live token preview** via `segmentCommunicationTemplate(draft.body, SAMPLE_CONTEXT)` `:685`, template application `:448`.
**Cannot do:** **actually deliver.** `v2/scheduleAnnouncementSendout.ts:8-9`: *"Actual provider send of announcement rows is GATED OFF in the due-claim (Phase 3) — this orchestrates scheduling only."* Announcement rows are written to `communication_scheduled_sends` and never dispatched. No attachments, no per-recipient token binding (preview uses static `SAMPLE_CONTEXT` `:115-120`).

#### S6. Internal-note composer

`FamilyCommunicationWorkspaceView.tsx:637` (textarea) → `CommandCenterShell.tsx:262` → `POST /api/admin/communications/family-note`. No channel, no recipients, no transport. Distinct auth path: `requireAdminOrgContextLight` **without** `assertCommunicationsSendAllowed` (`family-note/route.ts:14-18`).

#### S7. Schedule-Send Modal (shared across S1–S4)

`web/components/adminV2/messaging/ComposerScheduleSendModal.tsx:105` → `POST /api/admin/communication-scheduled-sends`. **The one genuinely shared composer sub-component**, crippled by a server contract mismatch documented in the code itself — `lib/adminV2/messaging/messagingComposerScheduleContext.ts:4-5`:

> "POST /api/admin/communication-scheduled-sends accepts `entity_type=opportunities` only, `source=task_assist`, and a `recipient_person_id`. Inbox/Compose scheduling for person-only threads or non-opportunity anchors requires extending `validateCommunicationScheduledSendCreateBody`…"

Enforced at `communicationScheduledSendsService.ts:116-117` (`ENTITY_TYPE_UNSUPPORTED`) and `:156-157` (`SOURCE_INVALID`). **"Send later" is therefore disabled for every person-anchored thread** — i.e. every send S1 and S4 make. It also hard-limits to **one recipient** (`messagingComposerScheduleContext.ts:62-68`).

#### S8–S10. Orphans (imported by nothing)

| File | Status |
|---|---|
| `app/adminV2/communications/composer/ComposerV2.tsx` | Full "Unified Composer V2" with its own `v2/composerModel.ts` — **never mounted**. Its flag `comms_v2_composer` is CORE/default-ON, so this is dead code, not dark rollout. |
| `app/adminV2/communications/templates/TemplateBuilder.tsx` | Uses a *second* render engine (`templateRender.ts`) — never mounted |
| `app/adminV2/communications/announcements/AnnouncementBuilder.tsx` | Never mounted |

`composerModel.ts` is where the *intended* contract lives — `ComposerDraft` `:11-19` already declares `attachments?: string[]`, `templateId?: string | null`, `scheduledAt?: string | null`. **None of those three fields is implemented anywhere in the live stack.** This is the abandoned design of the runtime WS4 is asking for.

#### S11. Legacy surfaces — not composers

Confirmed **absent**, not "not found": `legacy-admin/messaging/MessagingClient.tsx:51` renders `<ComingSoon>` for Messages; Outbox is a read-only 50-row table. `legacy-admin/messages-outbox/MessagesOutboxClient.tsx` read-only. `components/admin/communications/` holds only `CommunicationPreferencesEditor`, `PersonCommunicationPreferencesSection`, `CommunicationsDrawerBackgroundLoader`, plus `CommunicationsDrawerSection` (S2). `lib/admin/communications/` has one file, `communicationsDrawerPrefetch.ts`.

#### S12. "What's Next" — not a compose surface

Live matches are `InspectorPanel.tsx:95-147` fed by `canvas/mockDepartmentActions.ts` (**mock data**), and the Focus Panel `currentWork` card. The only communications link is read-only evidence: `focusPanel/communications/buildCommunicationsCardEvidence.ts` — a Summary-archetype card reporting scheduled-send count and next follow-up, explicitly *"never fabricates thread counts, message bodies"* `:6-7`. The compose operators reach from Focus Panel is S1 via `activity_embed`.

### 4.3 Capability matrix

Live surfaces only. `—` absent · `~` partial/inert · `✓` works.

| Capability | S1 Family WS | S2 Drawer (dead) | S3 Inbox Reply | S4 Quick Msg | S5 Announce | S6 Note |
|---|---|---|---|---|---|---|
| Recipient search | — | — | — | ✓ `:94` | — (audience) | — |
| Multi-recipient | ✓ | ✓ | **—** | ✓ | ✓ | n/a |
| Batched send (1 request) | ✓ | **—** N loops | n/a | **—** N loops | ✓ | n/a |
| Channel email | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| Channel SMS | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| Channel in-app | — | — | — | — | ~ skipped | n/a |
| Internal note | ✓ | — | — | — | — | ✓ |
| Subject (email) | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| **Template selection** | **~ inert `:833`** | **—** | **—** | **✓ `:222-239`** | **✓ `:448`** | — |
| **Variable substitution at send** | **—** | **—** | **—** | **—** | **—** | — |
| Token preview | — | — | — | — | ✓ static `:685` | — |
| **Attachments** | **~ inert `:832`** | **—** | **—** | **—** | **—** | — |
| Rich-text toolbar | ✓ own impl `:824-829` | ✓ `ComposerMessageTextToolbar` | ✓ same | ✓ same | ✓ `CommsMessageTextToolbar` | — |
| Schedule / send-later | ~ blocked (S7) | ~ blocked | ~ blocked | ~ blocked | ✓ own path | — |
| Message preview | — | — | — | — | ✓ token-only | — |
| Review-first preflight | ✓ | — | — | — | ~ recipient-preview | — |
| Consent enforcement | ✓ per-recipient | ✓ in exec | ✓ in exec | ✓ in exec | ✓ fanout | n/a |
| Optimistic thread update | — | ✓ `:1053` | — | — | n/a | ✓ refetch |
| Contact-attempt association | — | ✓ | ✓ if opp | — | — | — |
| BOS Assist | ~ stub | ~ stub | ~ stub | ~ stub | — | — |

**BOS Assist is a stub on every surface** — `ComposerBosEnhanceModal.tsx:97-108` shows the draft, offers intent chips, renders a "Coming next" panel. It never calls a model and never writes back. Meanwhile `lib/adminV2/bos/communication/generateOperationalDraft.ts` implements a real deterministic draft synthesizer that **no composer calls**.

### 4.4 Where they diverge — the four fault lines

1. **Two composer chrome implementations.** `MessagingComposerFrame.tsx` (166 lines, 22 props) serves S2/S3/S4. S1 hand-rolls its own toolbar + textarea inline in a 1145-line view. They diverge on capability *and* on which inert buttons they show.
2. **Two send-payload shapes.** `/send` takes `{entity_type, entity_id, channel, body, subject?, recipient_person_id?, to?}` and is called **once per recipient**. `/family-send` takes `{customer_id, recipient_person_ids[], channel, subject, body, confirm}` and fans out server-side with a preflight. Only `/family-send` has review-first.
3. **Two entity-anchoring models.** `/send` normalizes to `opportunities | jobs | persons` (`send/route.ts:95-105`); `quick_message:true` **overwrites the caller's entity** to `persons` `:91-93`. `/family-send` anchors on `customers`. `/communication-scheduled-sends` accepts **only** `opportunities`. Nothing reconciles these — which is exactly why Send-later is dead on the primary composer.
4. **Four token/merge engines** — §12.3.

### 4.5 "Preview VM" and "embedded runtime" — both exist and are real

**Preview VM** = `FamilyCommunicationWorkspacePreviewVM`, `v2/familyWorkspace/types.ts:176-191`. **Not** a message preview — a **first-paint view model**. Docblock `:163-172`:

> "Path C — lightweight Activity communications FIRST-PAINT VM. Loads with the selected Focus Panel record (row-select), so Activity can render the real workspace (channels, recipients, recent thread, composer defaults) with NO blank shell. Deliberately excludes the heavy tail the full VM adds later… SMS enable/disable + eligibility come from the SAME assembler rules as the full VM (**projected, never recomputed**)."

Versioned `"preview-1"` `:174`. Built server-side by `resolveFamilyCommunicationWorkspacePreview.ts:30`, capped at 8 threads / 24 timeline events `:27-28`, reusing the identical `assembleFamilyWorkspace` used for the full VM `:73` — so eligibility can never diverge between seed and hydrate. Consumed `useFamilyCommunicationRuntime.ts:76`. Warm-cache plumbing: `drawerFamilyWorkspacePrefetchCache.ts`, `drawerFamilyWorkspacePrefetchTiming.ts`, `focusPanelActivityPrewarm.ts`.

**Embedded runtime** = the composer mounted inside the Focus Panel Activity cockpit rather than its own route. `OpportunityFocusPanelEmbeddedWorkspace.tsx:37-46`:

> "Focus Panel Activity mode — one-viewport operational cockpit. **Composes existing runtimes rather than inventing new ones**: … Communications (hero) ← CommunicationsDrawerSection (embedded comms runtime)."

Mechanically: `CommunicationsDrawerSection` → (flag on) `RecordCommunicationsTab` → `FamilyCommunicationWorkspace` with `surfaceVariant="activity_embed"`.

**These two are the proof the convergence thesis works.** One runtime, one assembler, one eligibility rule set, three presentation variants, seeded by a versioned projection. A Composer Runtime is the same move one level down.

### 4.6 How a Composer Runtime fits the established pattern

Alloy's runtime doctrine (`lib/adminV2/runtime/contract/index.ts:1-5`): *"AdminV2 runtime contract — **composer-owned reveal, not section-owned loading**. New drawer sections must register in `registry/*` and pass `validateDrawerSectionRegistry`."* The Focus Panel realizes it via `focusPanelCardRegistry.ts` + `focusPanelCardCatalog.ts` + `focusPanelCardModel.ts` + pure evidence builders.

Shape to copy, honoring "compose small contracts":

1. **Contract** `v2/composer/composerContract.ts` — resurrect `ComposerDraft` from `composerModel.ts:11-19` (already declares `attachments`/`templateId`/`scheduledAt`) as the registered surface contract, mirroring `drawerSectionContract.ts`.
2. **Capability registry** — one entry per surface declaring `{ multiRecipient, templates, attachments, schedule, preview, reviewFirst }`, validated like `validateDrawerSectionRegistry`. Inert buttons then become impossible: a surface either declares the capability or doesn't render the control.
3. **Preview VM seed** — extend `FamilyCommunicationWorkspacePreviewVM` (bump past `"preview-1"`) to carry `composerDraft` + resolved token context, so the composer paints with real recipient tokens rather than `SAMPLE_CONTEXT`.
4. **Presentation variants** — generalize `FamilyWorkspaceSurfaceVariant` to `"modal" | "drawer" | "activity_embed" | "inbox_reply" | "quick" | "broadcast"`, preserving "runtime behavior is shared; variants alter presentation only".
5. **One send seam** — collapse `/send` and `/family-send` behind the `/family-send` shape (batched, review-first), with `executeCommunicationsSend` staying the single transport primitive it already is. Then extend `validateCommunicationScheduledSendCreateBody` to accept `persons`/`customers` and non-`task_assist` sources, unblocking Send-later everywhere at once.

---

## WS12 — Template Platform

### 12.1 Migration archaeology — four migrations, two schemas, one trigger

**M1 — `20260619150000_comms_v2_templates_announcements.sql` (PKG-05).** Creates `communication_templates` `:6-18` with `channel CHECK IN ('email','sms')`, **`approval_status` CHECK IN ('draft','pending','approved')** `:12`, `current_version_id uuid` with **no FK** `:13` (deliberate — circular), `created_by_user_id`. Unique `(org_id, name)` `:17`. Creates `communication_template_versions` `:22-34` with **`version integer NOT NULL`**, `body_format text DEFAULT 'html'`, `variables jsonb DEFAULT '[]'`. Also `communication_snippets` `:38-48`, `announcements`, `announcement_targets`, `announcement_deliveries`. RLS `:100-176`.

**M2 — `20260622120000_comms_v2_templates.sql` (Phase 1/B1).** Written as if the tables don't exist — `CREATE TABLE IF NOT EXISTS` `:12`, `:68` defining a **different** schema: `status` instead of `approval_status`, `category CHECK IN ('tour','enrollment','billing','attendance','general','workflow')`, `channel` adds `'in_app'`, `created_by`/`updated_by`, and **`version_number`** instead of `version`, plus `token_paths text[]`, `metadata jsonb`. Because M1 already created the tables, both `CREATE TABLE` statements are **no-ops on any DB that ran M1**; the author knew and added `ALTER TABLE … ADD COLUMN IF NOT EXISTS` patches `:33-36`, `:83-86` plus a `DO $$` backfill of `status` from `approval_status` `:38-55` and `version_number` from `version` `:88-100`.

**M3 — `20260623130000_comms_v2_templates_schema_align.sql`.** Header `:1-3`: *"align template tables when PKG-05 already exists and B1 `CREATE TABLE IF NOT EXISTS` was a no-op on remote."* Repeats M2's adds and backfills, then evolves constraints: **drops the `category` CHECK entirely**, making category free text `:34`; widens `channel` to `('email','sms','in_app')` `:37-39`; adds `status CHECK IN ('draft','active','archived')` `:41-43`; mirrors `created_by_user_id → created_by` `:22-24`, `:57-59`.

**M4 — `20260623140000_comms_v2_template_version_legacy_compat.sql` — THE SHIM.** 39 lines: (1) two-way backfill `version ↔ version_number` `:6-12`; (2) `CREATE OR REPLACE FUNCTION public.sync_communication_template_version_legacy()` `:14-26` — `version_number` wins; if set and differing from `version`, overwrite `version`; else if only `version` is set, copy to `version_number`; (3) `CREATE TRIGGER trg_sync_communication_template_version_legacy BEFORE INSERT OR UPDATE OF version, version_number … FOR EACH ROW` `:28-33`.

**Why this is a migration risk, precisely:**

- **The trigger is load-bearing but not the only defense, and the two can drift.** M1 left `version NOT NULL` with no default. Every insert must populate it. The API *also* writes both — `buildTemplateVersionInsertPayload` (`v2/templateService.ts:237-253`) emits `version_number` **and** `version` `:243-244` plus `created_by` **and** `created_by_user_id` `:249-251`. Belt *and* braces. But **any writer that isn't this helper** — a psql fixup, a seed, a future route, a Supabase Studio edit — depends entirely on the trigger. Drop or `CREATE OR REPLACE` the function wrong and inserts fail with a `NOT NULL` violation on a column no application code names.
- **Two columns are the source of truth for one fact, and reads use only one.** The unique constraint is on the *legacy* pair (`communication_template_versions_template_version_uq UNIQUE (template_id, version)`, M1 `:33`); M2 declares `UNIQUE (template_id, version_number)` `:79` but that `CREATE TABLE` **never executes** on an M1 database. Every application read orders and filters by `version_number` (`templates/[id]/route.ts:57`, `:22`). **The integrity guarantee is on a column the app never reads**, enforced only because a trigger keeps the two equal.
- **The DB state is not derivable from the migration list.** A fresh DB running M1→M4 has `version` NOT NULL, `version_number` nullable, `approval_status` present-and-ignored, `category` free-text. M3 exists purely because the remote diverged. Tooling that reasons about "what does this schema look like" from the SQL alone will be wrong.
- **Dead columns are still constrained.** `approval_status` retains `NOT NULL DEFAULT 'draft' CHECK IN ('draft','pending','approved')` and **no application code reads or writes it** — the only repo reference is a test asserting the migration text (`tests/communications/commsV2TemplatesAnnouncementsSchema.test.ts:35`). `body_format` and `variables` are likewise never written. `communication_snippets` has **zero code references**.

**Effective schema (post-M4, M1-first DB):**

`communication_templates` — `id` PK · `org_id NOT NULL FK orgs CASCADE` · `name NOT NULL` · `description` · `category text DEFAULT 'general'` (no CHECK) · `channel NOT NULL CHECK ('email','sms','in_app')` · `status DEFAULT 'draft' CHECK ('draft','active','archived')` · `approval_status NOT NULL DEFAULT 'draft' CHECK ('draft','pending','approved')` **[dead]** · `current_version_id` (no FK) · `created_by` · `updated_by` · `created_by_user_id` **[legacy]** · `created_at`/`updated_at`. Unique `(org_id, name)`. Indexes on `(org_id, channel, approval_status)`, `(org_id)`, `(org_id, category, channel)`, `(org_id, status)`.

`communication_template_versions` — `id` PK · `org_id NOT NULL FK` · `template_id NOT NULL FK CASCADE` · `version integer NOT NULL` **[legacy, trigger-synced, carries the unique constraint]** · `version_number integer NULL` **[app-facing]** · `subject` · `body NOT NULL DEFAULT ''` · `body_format NOT NULL DEFAULT 'html'` **[dead]** · `variables jsonb NOT NULL DEFAULT '[]'` **[dead]** · `token_paths text[] NOT NULL DEFAULT '{}'` · `metadata jsonb` · `created_by` · `created_by_user_id` **[legacy]** · `created_at`. Unique `(template_id, version)`. Trigger `trg_sync_communication_template_version_legacy`.

**No `location_id` on either table** — confirms org-only scoping (§12.7).

### 12.2 Answers to the WS12 questions

| Question | Answer |
|---|---|
| Variable syntax | `{{dot.path}}` |
| Variable set typed/registered? | **Yes** for comms templates — `COMMUNICATION_TOKEN_CATALOG`, 24 entries |
| HTML escaping? | **No** — §12.4 |
| Conditional sections | **ABSENT** |
| Loops | **ABSENT** |
| Partials/snippets | Table exists, zero code — effectively **ABSENT** |
| Preview | Client-side live + server render-only endpoint; **synthetic sample data only** |
| Approval workflow | **ABSENT** (column exists, dead) |
| Versioning | **Present** — append-only, content-diff-triggered |
| Publishing / draft-vs-live | **ABSENT** as a promotion step; `status` is a filter, not a gate |
| Brand theming / email layout wrapper | **ABSENT** for the template platform (exists only for tour comms) |
| Template inheritance org/location | **ABSENT** |

### 12.3 Four render engines

| # | Module | Syntax | Catalog | Used by |
|---|---|---|---|---|
| **A** | `lib/workflowTemplate.ts:19` `renderTemplate` | `/\{\{([^}]+)\}\}/g`, dot-path, missing → `""` | none | Workflows (`workflowRun.ts` ×8), and **wrapped by B** |
| **B** | `v2/templateTokens.ts` | `\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}` `:23` | **`COMMUNICATION_TOKEN_CATALOG` `:75-122`** | Templates Workspace, Announcements, preview API |
| **C** | `v2/templateRender.ts:8` | `/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g` | none | **`TemplateBuilder.tsx` only — orphan** |
| **D** | `lib/tours/comms/tourCommsTemplates.ts:170` `applyTourCommsPlaceholders` | `split(\`{{${key}}}\`).join(val)` — **flat keys, no dot-paths, no regex** | `buildTourCommsMergeFields` (`tourCommsTemplateContext.ts:84-124`, ~24 flat keys) | Tour confirm/reschedule/cancel/reminder/no-show |

**Engine C is a near-duplicate of B that also carries the only unused-but-correct safety helpers in the codebase:** `hasUnresolvedTokens` `:38` (docblock: *"used to block broken sends"*) and `canSendTemplate(approvalStatus)` `:44`. Both are **called by nothing**.

**Canonical engine = B.** Docblock `templateTokens.ts:1-14` states it standardizes on `{{dot.path}}` and *"reuses the canonical, already-tested render engine in `@/lib/workflowTemplate`"*; `renderCommunicationTemplate` `:290-295` is a pass-through to A.

**The registry (B):** 24 entries `:75-122`, grouped into 8 operator-facing groups `:29-38` (family, contact, child, location, program, enrollment, schedule, org). Each carries `{path, label, group, sample}`. Membership makes a path `known` vs `unknown` `:70-73`. Three-state resolution — `unknown` / `missing` / `resolved` `:252-267`. `segmentCommunicationTemplate` `:231` returns text/token segments so the editor can chip-render tokens.

**Catalog coverage gaps:** no billing/invoice/balance tokens; no staff/teacher tokens; no date-formatting or fallback syntax (`{{x | default:"there"}}` unsupported); and **no `person.first_name` for the parent** — `contact.first_name` is the parent while `person.first_name` is labeled "Child first name" `:80`, an easy authoring trap.

### 12.4 Escaping — no injection defense on the template path

`lib/workflowTemplate.ts:19-27` does `String(val)` with **no escaping**. `templateTokens.ts:265` likewise. There is **no `escapeHtml`, no sanitizer, no DOMPurify** anywhere under `lib/communications/`.

Bounded severity:

- **Preview UI is safe.** `TemplatesWorkspace.tsx:474` and `AnnouncementsWorkspace.tsx:685` render `segments` as React children, which React escapes. `dangerouslySetInnerHTML` across `app/adminV2/communications`, `components/adminV2/messaging`, `components/admin/communications`, `app/adminV2/messages` — **zero hits**.
- **Outbound email is where it matters, and it is unresolved.** `composerModel.ts:90` sets `body_format: "html"` for email; `announcementService.ts:23` allows `'text'|'html'`. `enqueueCanonicalOutboundMessage` stores `body` verbatim, and provider dispatch happens in the Python backend. **Whether the backend sends `body` as HTML could not be confirmed from the TS side alone** — this needs a one-line check in `resend_client.py` before the risk is graded.
- **The one path that escapes correctly is tour comms** — `plainTextToSimpleHtml` (`tourCommsTemplates.ts:196-203`) escapes `& < >` before wrapping in `<p>`/`<br/>`. The codebase knows how; the template platform never adopted it.

### 12.5 Preview — two mechanisms, neither uses real data

**Live client preview** — `TemplatesWorkspace.tsx:474-488`. Sample context is **machine-generated from the catalog itself**: `buildSampleContext()` `:154-167` walks `COMMUNICATION_TOKEN_CATALOG` and materializes each `def.sample`. Preview always renders `Mateo`, `The Rivera Family`, `North Campus`, `Bright Beginnings`. Surfaces `unknownTokens` `:479-482` and `missingTokens` `:483-488`.

**Server preview** — `POST /api/admin/communications/templates/[id]/preview` `:17`. Renders `current_version` only. Sample context is an **optional caller-supplied `{context}` blob defaulting to `{}`** `:27-36` — every token reports `missing`. Returns rendered text + segments + `missing_tokens` + `unknown_tokens`. Docblock `:11`: *"NO send, NO queue, NO provider behavior."* **No application code calls it**; the only reference is `playwright/tests/canonical-workspace-runtime.spec.ts:70`.

**Announcements preview** — static `SAMPLE_CONTEXT` literal, 4 keys `:115-120`.

**No surface previews a template against a real recipient.** There is no bind-recipient-then-preview flow anywhere.

### 12.6 Approval, versioning, publishing

- **Approval: ABSENT.** `approval_status` dead. `canSendTemplate()` exists in orphan engine C, uncalled. No pending/approve/reject route, no reviewer field, no audit.
- **Versioning: PRESENT and reasonable.** `shouldCreateNewVersion` (`templateService.ts:206-215`) — new version **iff** a content field was supplied **and** the resulting subject/body differs; metadata-only edits never version. `nextVersionNumber` `:218-221`. PATCH appends then repoints `current_version_id` — route docblock says *"simple, **no rollback**"* (`templates/[id]/route.ts:67-68`). History is readable (`GET` returns all versions `:64`) but **no UI or API restores an old version**.
- **Publishing: ABSENT as a step.** `status` is `draft|active|archived`, set freely on create or PATCH with no transition rules, used only as a **fetch filter** (`QuickMessageModal.tsx:195`, `AnnouncementsWorkspace.tsx:343`). Nothing prevents flipping a template to `active` with unknown tokens in its body. Archive is soft (`archive/route.ts:31`).

### 12.7 Brand theming and inheritance — both absent

**Brand/layout wrapper: ABSENT for the template platform.** No logo, header/footer, color, or MJML anywhere in `lib/communications/`. `package.json` has **no** `mjml`, `handlebars`, `mustache`, `liquid`, `nunjucks`, or `ejs`. The only unsubscribe handling is SMS STOP-keyword parsing (`v2/smsKeywords.ts:9`) — **no email unsubscribe footer**, a compliance concern for the broadcast path.

The one email wrapper that exists is **tour-only**: `polishTourCommsEmailHtml` (`tourCommsTemplates.ts:206-228`) rewrites known plain-text CTA lines into inline-styled `<a>` tags, and `resolveEffectiveTemplate` `:230-243` implements **per-field override-else-default inheritance** for tour templates. Tours therefore have a themed, inheriting template system the actual template platform lacks.

**Org/location inheritance: ABSENT.** Both tables carry `org_id` only — no `location_id`, no `parent_template_id`, no `scope`. Every query filters `.eq("org_id", orgId)` exclusively (`templates/route.ts:47,:70`; `[id]/route.ts:45,:56`; `archive/route.ts:34`; `preview/route.ts:45,:59`). A multi-location org gets one flat template list.

### 12.8 Template API — routes and permission checks

All four use the identical guard triple: `requireAdminOrOps()` → `getAdminContextCached()` → `createAdminClient()` (service_role), with `org_id` on every query.

| Route | Method | Guard | Behavior |
|---|---|---|---|
| `/templates` | GET | `route.ts:26` | List + optional `category`/`channel`/`status`, `limit` clamped 1–200 `:40`; joins `current_version` |
| `/templates` | POST | `route.ts:89` | Validate → pre-check name uniqueness `:110-118` → insert template → insert version 1 → repoint `current_version_id`. **Three sequential writes, no transaction** |
| `/templates/[id]` | GET | `[id]/route.ts:31` | Template + `current_version` + all versions desc |
| `/templates/[id]` | PATCH | `[id]/route.ts:~78` | Metadata patch; appends a version iff content changed |
| `/templates/[id]/archive` | POST | `archive/route.ts:19` | `status='archived'` (soft) |
| `/templates/[id]/preview` | POST | `preview/route.ts:18` | Render-only; 409 if no `current_version` `:52` |

**Permission findings:**

- **No route has any template-specific permission check.** All four gate on `requireAdminOrOps()` alone. There is **no `communications.templates.write` key**. Contrast the send path, which layers `assertCommunicationsSendAllowed` on top (`send/route.ts:47-56`) enforcing `communications.send` with admin/ops bypass and legacy alias `ops.messaging.write` (`communicationPermissions.ts:22-36`). **Anyone who can send can also author and activate the templates everyone else sends.**
- **Writes bypass RLS.** All mutations run through `createAdminClient()`. RLS policies are SELECT-only for `authenticated` (M2 `:114-132`). Tenant isolation on writes rests entirely on the explicit `.eq("org_id", orgId)` in each route — correct today, one omission from cross-tenant write.
- **POST is non-atomic.** `route.ts:121-175` performs insert-template → insert-version → update-pointer as three unguarded round-trips. A failure at step 2 leaves an orphan template with `current_version_id = null`, which the preview route then 409s on `preview/route.ts:52`. No cleanup path.
- `GRANT ALL … TO anon` on both tables (M1 `:109,:122`; M2 `:134-139`) — inert while RLS is on and no `anon` policy exists, but a latent footgun.

---

## Gaps

### Correctness / user-visible-wrong

| ID | Gap |
|---|---|
| **GAP-1** | **Templates ship with unresolved `{{tokens}}` to real families. ABSENT.** Template application (`QuickMessageModal.tsx:228-232`, `AnnouncementsWorkspace.tsx:448`) copies the raw version body into the draft via `communicationTemplateDraftSeedFromPreview` (`v2/communicationTemplateDraftSeed.ts:31-40`). Every call site of `renderCommunicationTemplate` / `segmentCommunicationTemplate` / `renderTemplate` was checked — **not one is in a send path**. `executeCommunicationsSend` performs zero substitution. `hasUnresolvedTokens` (`templateRender.ts:38`), whose docblock says *"used to block broken sends"*, is **never called**. A parent receives literally `Hi {{contact.first_name}},`. |
| **GAP-2** | **"Send later" is unavailable on the primary composer. ABSENT (self-documented).** `communicationScheduledSendsService.ts:116-117`/`:156-157` restrict scheduled sends to `entity_type=opportunities` + `source=task_assist`. S1 and S4 anchor `persons`. Written down at `messagingComposerScheduleContext.ts:4-5`; surfaced to operators as an amber panel `ComposerScheduleSendModal.tsx:149-153`. Fix is one validator + one process-due metadata branch. |
| **GAP-3** | **Announcements can be composed and scheduled but never deliver. ABSENT by design, undisclosed to operators.** `scheduleAnnouncementSendout.ts:8-9`. The UI presents a complete schedule flow with no indication delivery won't occur. |

### Security / compliance

| ID | Gap |
|---|---|
| **GAP-4** | **No HTML escaping on any template render. ABSENT.** §12.4. Preview is React-safe; outbound email escaping unverified from the TS side. Tour comms already implement the correct escape — pattern exists, unadopted. |
| **GAP-5** | **No template-authoring permission. ABSENT.** §12.8. No key analogous to `communications.send`. |
| **GAP-6** | **No approval workflow. ABSENT.** A template can go `active` with unknown tokens and no review. |
| **GAP-7** | **No email unsubscribe footer / brand wrapper. ABSENT.** §12.7. Relevant to the broadcast path specifically. |

### Structural / migration risk

| ID | Gap |
|---|---|
| **GAP-8** | **The `version`/`version_number` shim.** §12.1 M4. Dual-write + `BEFORE INSERT OR UPDATE` trigger keep two columns equal for one fact; the unique constraint sits on the column the app never reads. |
| **GAP-9** | **Dead schema still constrained.** `approval_status` (NOT NULL + CHECK), `body_format`, `variables`, and the whole `communication_snippets` table have zero code readers. |
| **GAP-10** | **Non-atomic template creation.** `templates/route.ts:121-175`, three writes, no transaction, no compensation. |

### Convergence debt

| ID | Gap |
|---|---|
| **GAP-11** | **Three orphaned composers.** `ComposerV2.tsx`, `TemplateBuilder.tsx`, `AnnouncementBuilder.tsx` imported by nothing. `ComposerV2`'s flag is CORE/default-ON, so this is dead code, not dark rollout. `composerModel.ts` holds the abandoned `ComposerDraft` contract with `attachments`/`templateId`/`scheduledAt` — the WS4 target, already specified. |
| **GAP-12** | **The legacy drawer composer is unreachable.** `CommunicationsDrawerSection.tsx:1441` forks on a default-ON core flag, stranding 1456 lines that hold capability (optimistic rows, activity invalidation, contact-attempt notes) the live path lacks. |
| **GAP-13** | **Four render engines.** §12.3. B canonical; C a near-duplicate holding the only unused safety helpers; D a separate flat-key engine with the only working theming/inheritance. |
| **GAP-14** | **Attachments. ABSENT everywhere.** No upload, no storage binding, no provider attachment field. Two inert buttons and one unimplemented type field. |
| **GAP-15** | **BOS Assist is a stub on all four composers.** `ComposerBosEnhanceModal.tsx:97-108` renders "Coming next" and never writes back, while `generateOperationalDraft.ts` implements real deterministic draft synthesis no composer calls. |
| **GAP-16** | **Per-recipient send loops.** S2 `:993` and S4 `:489` issue N HTTP requests for N recipients, no transaction, partial-failure reporting only. S1's `/family-send` already solves this — adopting it is most of the convergence. |
| **GAP-17** | **No preview against real recipient data.** §12.5. |
| **GAP-18** | **No conditionals, loops, or snippets.** ABSENT. Greps for `{{#`, `{%`, `{{if`, `{{each`, and five template-engine package names all returned zero. |
| **GAP-19** | **No org/location template inheritance.** ABSENT. §12.7. |
| **GAP-20** | **Token catalog coverage.** No billing/invoice/balance, no staff, no date formatting or default-value syntax; `person.first_name` labeled "Child first name" `:80` while `contact.first_name` is the parent — an authoring trap. |
