# WS8 Preferences + WS11 Attachments + WS13 Analytics — Discovery Findings

Sprint: `conversation-platform-v1-discovery` (slot 2). Base `origin/staging @ 3fc2e0f4e`. Read-only.

---

## WS8 — Communication Preferences

### 8.1 Person / contact / guardian / household model

| Table | Cite | Notes |
|---|---|---|
| `persons` | `20260329165048_remote_schema.sql:2431-2450` | Canonical identity. `email text`, `phone text` — **single scalar columns each**. Also `first_name/last_name/full_name/preferred_name/date_of_birth/metadata`. |
| `contacts` | `remote_schema.sql:1129-1162` | Legacy CRM row, also single `email`/`phone`; **has `timezone text`** (persons does not); `person_id` back-link `:1161`. |
| `customers` | `remote_schema.sql:1347` | The household/family grain. |
| `customer_members` | `remote_schema.sql:1222` | The child grain. |
| `customer_persons` | `remote_schema.sql:1283-1296` | household↔adult edge: `role_type text`, **`is_primary boolean`**, `status`, `start_date`, `end_date`. |
| `person_child_relationships` | `20260711153000_person_child_relationships.sql:4-17` | Canonical person↔child edge: `relationship_type text`, **`priority integer`**, `status`, unique `(org_id, customer_member_id, person_id)`. |
| `person_child_relationship_roles` | `20260711153000:26-35` | Multi-role per edge (`role_key`). |
| `person_relationships` | `remote_schema.sql:2413-2426` | Generic person↔person, has `is_primary`. |
| `person_locations` | `remote_schema.sql:2377-2387` | person↔location, `is_primary`. |
| `customer_member_contacts` | `remote_schema.sql:1186-1196` | Older child↔contact edge with `role_key`. |

**Emails / phones: single column per person.** There is **no `contact_methods` / `person_emails` / `person_phones` table** — definitively absent (grep over all 297 migrations returns only the string `preferred_contact_method` as a *field key*, `20260531140000_person_drawer_layout_runtime_v1.sql:56,118`). Consequently there is **no primary/preferred flag on an address**, because there is only ever one address per channel per person. `secondary_phone` exists only as an anticipated tenant custom-field key (`identityDisclosureDefaults.ts:18`), unseeded.

Address resolution at send time reads `persons.email` / `persons.phone` directly and normalizes in TS: `drawerEmailRecipients.ts:25-33`, `v2/familyWorkspace/normalizeRecipientContact.ts:2-15`.

**Contact priority / ordering — three unrelated mechanisms, none authoritative:**

1. `person_child_relationships.priority integer` — a real column, exposed as a configurable native field (`personChildRelationshipFieldRegistry.ts:13,52-56`, label "Priority"). **Not consumed by any communications code path.**
2. `customer_persons.is_primary boolean`.
3. A hardcoded role-precedence list in the composer: `v2/familyWorkspace/recipientTierPolicy.ts:4-12,18,33-44` — `PRIMARY_ROLE_KEYS`, `SECONDARY_ROLE_KEYS`, `EXCLUDED_ROLE_KEYS`, `PRIMARY_PRECEDENCE = ["guardian","parent","primary_contact","primary","mother","father","mom","dad"]`. Comment `:1`: "code constants; no config UI."

### 8.2 Migration `20260529210000_person_communication_opt_out_field.sql`

70 lines, creates **no schema**. Seeds one `field_section_definitions` row (`consent` / "Consent") for every org `:5-19` and one `field_definitions` row `:21-70`:

- `field_key = 'communication_opt_out'`, `field_type = 'boolean'`, `is_system = false` `:52`, `section_key = 'consent'`
- Description `:47`: *"When enabled, this person has opted out of operational communications"*

**A single undifferentiated boolean, described as covering OPERATIONAL communications — the inverse of the usual marketing-only opt-out.** No channel granularity, no category, no scope. Values persist to `field_values`, not a column.

**It is never read by any send path.** Every reference is display/edit-only: `personDrawerParentSummaryModel.ts:12,21,81,85`, `personDrawerSummaryDraft.ts:19,30,45,62`, `childcareLayoutFieldCatalog.ts:406`, `PersonDrawerParentSummary.tsx:177,199`. `enforceConsentForSend` queries only `communication_preferences` (`v2/consentEnforcement.ts:29-35`). Because `is_system = false`, a tenant can deactivate or relabel it.

### 8.3 The real (V2) preference model

`communication_preferences` — `20260619140000_comms_v2_preferences_recipients.sql:31-43`:

```
org_id, person_id (uuid, NO FK — :114), category text, state text DEFAULT 'unset',
source, method, updated_by_user_id, UNIQUE (org_id, person_id, category)
```

Plus append-only `communication_preference_events` `:48-60`.

Vocabulary is TS-side free text (`v2/preferences.ts:17-28`): `email_transactional | email_marketing | sms_transactional | sms_marketing | announcements | emergency` × `opted_in | opted_out | unset`.

Gate `v2/consentGate.ts:34-63` — pure, platform-owned, not tenant-configurable. Lead→marketing, enrolled→transactional, safer-default; opt-out always wins; promotional override only for `unset`.

Wired into the live send path but **DARK**: `executeCommunicationsSend.ts:113-120`, gated on `isCommsV2FlagEnabled("comms_v2_compliance")`, default **OFF** (`v2/flags.ts:53-58,69-76`).

**Four parallel consent stores today**, only one of which the (dark) gate reads:

1. `communication_preferences` — the gate's source.
2. `field_values['communication_opt_out']` — display only.
3. `field_values['preferred_contact_method']` — display only (`personDrawerPresentationProfile.ts:94`).
4. `persons.metadata.email_opt_in` / `sms_opt_in` — actually enforced in the family-workspace composer: `v2/familyWorkspace/buildChannelEligibility.ts:4-7,18,27` (`optInIsExplicitFalse`, reason `"Opt-in not recorded"`).

### 8.4 Language / locale / i18n — definitively absent

- No `language`, `locale`, or `preferred_language` column on `persons`, `orgs`, or any table (`grep -rn "preferred_language" supabase/migrations` → 0 hits).
- No i18n library in `web/package.json` (`grep -niE "i18n|intl|lingui|translat"` → exit 1).
- `preferred_language` exists only as an anticipated tenant custom-field key: `identityDisclosureDefaults.ts:18`, `formsCollectionPrefillResolver.ts:54-55`. Nothing seeds it.
- Only timezone-ish signal: `contacts.timezone` (`remote_schema.sql:1139`) — on the *legacy* table, not `persons`.

### 8.5 Message CATEGORY / PURPOSE — the critical gap

**A `communication_messages` row has NO category, purpose, or classification column. Definitively absent.** Full DDL `20260430254100:54-74`; later ALTERs add only `subject` (`20260502120000:2`) and `opened_at/clicked_at/replied_at` (`20260619130000:9-11`). Only `metadata jsonb` could carry one, and nothing writes a category into it.

Consequences, precisely:

- `enforceConsentForSend` **defaults the category from the channel** — `sms → sms_transactional`, `email → email_transactional` (`v2/consentEnforcement.ts:14-16,27`). Absent an explicit caller-supplied category, **every send is classified transactional and therefore always allowed** (`consentGate.ts:52-54`). Marketing enforcement only ever fires if a caller passes `category` explicitly; **no production caller does**.
- Nearest things to a category, none on the message:
  - `communication_templates.category` — CHECK-constrained to `('tour','enrollment','billing','attendance','general','workflow')` (`20260622120000:17-18`). Organizational, not compliance-bearing, and **`communication_messages` has no `template_id`**, so the template's category cannot be recovered from a sent message.
  - `announcements.classification` — added `text NULL` at `20260619150000:56`; TS vocabulary `["emergency","marketing"]` (`v2/templatesAnnouncements.ts:32`). The **superseding** announcements DDL (`20260622123000:19-44`) omits `classification` entirely and `announcementSchema.ts` has no reference → effectively a dead column.

**Therefore quiet hours, emergency-only, operational-only, and opt-out cannot be enforced correctly today — the enforcement point has no input to enforce on.**

### 8.6 Quiet hours

**Absent from the communications platform.** The only implementation is tour-reminder-specific: config type + defaults `tours/comms/tourCommsConfig.ts` (`quiet_hours { start, end, enabled }`, org→location merge); resolver `resolveTourCommsConfig.ts`; timing shift `tourReminderTiming.ts` (`quietHoursAdjusted`, `quietHoursTimezoneSource: "booking"`); persisted as scheduled-send metadata `communicationScheduledSendProcessMetadata.ts` (`quiet_hours_adjusted`); tests `tests/tours/tourReminderTiming.test.ts:74-118`, `tests/tours/resolveTourCommsConfig.test.ts:29-49`.

Scoped to org/location, keyed off the **booking's** timezone — never a person's. `executeCommunicationsSend` does not consult it.

### 8.7 Preferred guardian

**No `preferred_guardian` field and no "contact this person for this child" pointer.** The model expresses it only by composition:

- `person_child_relationships` (`20260711153000:4-17`) + `…_roles:26-35` give the edge, its `relationship_type`, and an unused `priority`.
- `customer_persons.is_primary` (`remote_schema.sql:1289`) gives a household-level primary adult.
- At send time the composer sorts by `is_primary desc → hardcoded guardian precedence → display name` (`recipientTierPolicy.ts:33-44`) and tiers into "Parent/Guardian" vs "Other contacts" `:14-17`.
- "Suggested default" recipient is derived, not stored: `drawerEmailRecipients.ts:23` (`is_suggested_default`), resolved from `opportunities.primary_person_id` / `primary_contact_id` `:50-58`.
- Channel preference is **inferred from message history**, not stored: `v2/communicationHealth.ts:43-52` (`inferChannelPreference` = modal channel of past messages).

### 8.8 Who owns preferences

The schema says **PERSON, org-scoped**, unambiguously:

- `communication_preferences (org_id, person_id, category)` UNIQUE — `20260619140000:42`; table comment `:112` reads *"per-PERSON communication consent"*.
- `communication_preference_events (org_id, person_id, category)` `:48-60`.
- Household is a **read-only projection**, not a store: `v2/householdCommunicationPreferences.ts:81-89` (`resolveHouseholdPreferenceProfile` = "display uses the primary contact; falls back to first person in roster" `:80`) and `combineMarketingStates` strictest-wins `:29-33`.
- **No participation-level and no org-level policy table exists.** `grep "org_settings"` under `web/lib/communications` returns nothing.

### Gaps — WS8

| # | Gap |
|---|---|
| P1 | **No message category/purpose** → consent, quiet hours, emergency-only, and operational-only are all unenforceable. **Highest-leverage single gap in the sprint.** |
| P2 | **Consent enforcement ships dark** — `comms_v2_compliance` defaults false; with it on, the channel-derived default category makes every send transactional-and-allowed. |
| P3 | **Four competing consent stores** with no reconciliation and no migration between them. |
| P4 | **No quiet hours** outside tour reminders; no person timezone (`persons` has none; only `contacts.timezone`). |
| P5 | **No language/locale anywhere; no i18n infrastructure.** Zero foundation for multilingual sends. |
| P6 | **Single email/phone per person** — "preferred email"/"preferred phone" are not expressible. Requires a `contact_methods` table (net-new). |
| P7 | **`person_child_relationships.priority` exists but is dead** in comms; recipient ordering is a hardcoded TS list, not tenant-configurable. |
| P8 | **No preferred-guardian designation**; derived from `is_primary` + role-name string matching, which fails for tenant-authored role vocabularies outside `PRIMARY_ROLE_KEYS`. |
| P9 | `communication_preferences.person_id` has **no FK** (deliberate, `:5,114`) → orphan preferences survive person deletion. |
| P10 | **No preference ownership above person** — sibling/household-wide "text mom, not dad" and org policy defaults have no home. |

---

## WS11 — Attachments

### 11.1 Attachments on a communication message — definitively absent

- No `attachment` column anywhere in comms schema. `grep -rni attachment supabase/migrations` returns 5 hits, **all** the unrelated `processing_case_sources.source_kind` enum value `'email_attachment'` (`20260612120100_pos_processing_cases_v1.sql:68`, `20260615120000:67`, `20260718120000:14`, `20260724120000:41`) plus a comment at `20260506100000_forms_engine_v1_foundation.sql:577`.
- `communication_messages` DDL (`20260430254100:54-74`) — body/body_format/subject only. No attachments table.
- Send path carries none: `v2/providers/` contains only `resendEmailAdapter.ts`, `twilioSmsAdapter.ts`, `deferredAdapters.ts`, `registry.ts`, `types.ts` — zero `attach`/`media` references.
- Backend likewise: `backend/app/integrations/resend_client.py:18-44` builds a payload of exactly `{to, from, subject}` + `html`/`text` and POSTs to `api.resend.com/emails`; `backend/app/integrations/twilio_client.py:25` is `send_sms(to_number, body, *, status_callback)` — **no `MediaUrl`, so no MMS either**.
- The only carrier available without schema change is `communication_messages.metadata jsonb` (`20260430254100:70`).

### 11.2 Existing document capability

**Canonical table `documents`** — `remote_schema.sql:1743-1770`: `id`, `org_id`, `owner_contact_id`, `entity_type`, `entity_id`, `doc_type`, `title`, `original_filename`, `mime_type`, `byte_size`, `bucket`, `storage_path`, `public_url`, `checksum_sha256`, `status`, `metadata jsonb`, `extracted_text`, `extracted_data`, `extraction_status/provider/error/extracted_at`, `generated_from_document_id`, `template_key`.

**Storage.** Single Supabase Storage bucket `org_documents` — `web/lib/storage/orgDocumentsBucket.ts:7`, `web/app/api/admin/documents/upload/route.ts:38` (`DEFAULT_ORG_DOCUMENTS_BUCKET`, overridable via `ADMIN_DOCUMENTS_BUCKET`).

**Path convention** (`upload/route.ts:7,168-170`): `{org_id}/{canonical_entity_type}/{entity_id}/{uuid}-{safe_filename}`, or `{org_id}/pos_intake/…` for entity-less Processing intake.

**Access control.** Upload route: `getAdminContextCached()` + hard `ctx.role !== "admin"` → 403 `:96-103`, then `assertEntityInOrg` `:160-165`. Writes via `createAdminClient()` (service role, bypasses RLS); `org_id` from admin context. `documents` table RLS (`remote_schema.sql:7534-7549`): SELECT for `owner|admin|ops|manager`, INSERT/UPDATE for `owner|admin|ops`, DELETE for `owner|admin`, via `has_org_role(org_id, …)`.

**Signed URLs.** `web/app/api/admin/documents/[id]/signed-url/route.ts` — `EXPIRES_IN = 60 * 10` (10 min) `:6`; row fetched `.eq("id", id).eq("org_id", ctx.orgId)` `:25-26` then `createSignedUrl(path, EXPIRES_IN)` `:54`. Siblings: `vendors/[id]/documents/signed-url/route.ts:39-40`, `persons/[id]/profile-photo/route.ts:108`.

**MIME handling.** Format capability model `web/lib/pos/processingSourceCapabilities.ts:28-90` — per-format `store/preview/textExtraction/questionDetection` + `acceptMime`/`acceptExt`. Supported: pdf, docx, doc, png, jpeg, txt, csv; **heic `store: false`** `:74-81`. Enforced on upload `upload/route.ts:142-153` → HTTP 415 `UNSUPPORTED_FORMAT`. The check keys off `detectProcessingSourceFormat(name, mime)` — client-declared `file.type` + extension, **no magic-byte sniffing**.

**Size limits: ABSENT.** No `MAX_FILE_SIZE`/`maxSize` constant exists; `byte_size` is recorded post-hoc `upload/route.ts:219`. Only Next.js/Vercel body limits apply.

**Virus scanning: ABSENT.** `grep -rniE "clamav|virus|malware|antivirus|scan_file"` over `web/`, `backend/` (excluding `.venv`) → zero hits.

**PDF generation / OCR.** `web/lib/forms/pdf/createGeneratedPdfForSubmission.ts` (idempotency-keyed `:55-60`), `web/lib/pos/processingCase/structure/pdfTextExtract.ts`, `.../ocrExtract.ts` (`ocrImageBytes`, `ocrPdfBytes`, `OCR_METHOD`), persisted by `applyOcrDocumentUpdate` `upload/route.ts:71-92`.

**Packets.** `form_packet_definitions` / `_items` / `_sessions` / `_session_items` — `20260510120000_forms_packet_foundation.sql:11,38,135,251`.

### 11.3 A stable id a message could carry — YES

- `documents.id uuid` PK (`remote_schema.sql:1744`) is the stable handle for any file, uploaded or generated. Generation lineage is first-class: `generated_from_document_id` + `template_key` `:1769-1770`.
- Generated form PDFs return exactly that id: `CreateGeneratedPdfResult = { ok: true; document_id: string; reused: boolean }` — `createGeneratedPdfForSubmission.ts:13-15`.
- Submission↔document join with role vocabulary: `form_submission_documents` — `20260506100000:419-435`, `role IN ('generated_pdf','signature_asset','upload','other')`, UNIQUE `(form_submission_id, document_id)`, org-consistency triggers `:445-462`.
- Attachment parent resolution already exists: `resolveFormSubmissionDocumentParent` (member → opportunity → customer → person), `createGeneratedPdfForSubmission.ts:34-53`.

A `communication_message_attachments (message_id, document_id, …)` join is the natural, low-risk shape.

### 11.4 Drag/drop upload + preview UI — exists, reusable

- **`web/app/adminV2/pos/ProcessingImportAction.tsx`** — `onDragOver`/`onDragLeave`/`onDrop` `:66-80`, hidden `<input type="file" accept={processingImportAcceptList()}>` `:101-110`, `:131-137`, drag-active ring `:112`, two variants (`card` / inline). Delegates to `ProcessingImportIntentModal` `:82-95` with `initialFile`.
- Other drop-target components are layout builders, not file uploads (`FocusPanelGridCanvasBuilder.tsx`, `PriorityRuleOrderEditor.tsx`).
- Preview / list surfaces: `components/admin/EntityDocumentsSection.tsx`, `app/adminV2/processing/ProcessingCaseDetailContent.tsx`, `components/forms/packets/PacketReviewRollupView.tsx`, `app/legacy-admin/documents/DocumentsClient.tsx`.

### Gaps — WS11

| # | Gap |
|---|---|
| A1 | No attachment schema, no attachment UI, no provider attachment support — greenfield at every layer. |
| A2 | Twilio adapter is SMS-only; **MMS requires a new `MediaUrl` code path** (`twilio_client.py:25`). |
| A3 | Resend adapter posts a fixed payload (`resend_client.py:33-44`); adding `attachments` means base64-inlining or hosting, plus a provider size ceiling nobody has picked. |
| A4 | No size limit and no virus scan → attaching inbound files is an unbounded ingestion surface. |
| A5 | Inbound attachments have nowhere to land: `communication_inbound.py` and `v2/inboundNormalization.ts` have no media handling. |
| A6 | Signed URLs are 10-minute — fine for in-app preview, **wrong for an emailed link**. A recipient-facing document link needs a different, longer-lived, revocable token concept that does not exist. |

---

## WS13 — Conversation Analytics

### 13.1 The Operational Intelligence subsystem — architecture

Two stacked layers.

#### Layer 1 — OIP V1 (code-owned registry, live resolvers) — `web/lib/metrics/`

- **Definition**: typed TS objects, not DB rows. `MetricDefinition = {key, label, description, pack, computationKind, format, defaultWindow, sources, snapshotSemantics?, supportsDimensions?}` (`metrics/types.ts:54-67`). Registry `metrics/registry.ts:3` (`DEFINITIONS: Record<OipMetricKey, MetricDefinition>`). 17 keys, closed union `types.ts:5-22`.
- **Computation**: **live per-request Supabase queries**, dispatched by an exhaustive switch — `metricEngine.ts:42-83`. Three `computationKind`s: `event_window | entity_snapshot | evaluator_snapshot` (`types.ts:31-34`). Resolvers in `metrics/resolvers/` (7 files). Snapshots are an **optional cache/history only, never authoritative**: `metric_snapshots` (`20260623120000_metric_snapshots.sql:4-20`, comment `:22-23` — *"Live MetricEngine resolvers remain authoritative"*); writers `snapshots/writeMetricSnapshot.ts`, `writeOrgMetricSnapshots.ts`. **No scheduled job wires them** (migration header `:2` says "cron/job Phase 2").
- **Permissioning**: `getAdminAccessContextCached()` + `scopeDimensionsFromAccess()` + `assertMetricSiteAccess()` in `metrics/resolve/route.ts:1-6`; per-resolver `resolveMetricScopeFilter` (`scopeFilter.ts:22-50`) expands site→descendant location ids and returns `constraints | locationIds | impossible`. RLS on `metric_snapshots` is `org_id = current_org_id()` `20260623120000:37-39`.
- **Surfacing**: `GET /api/admin/metrics/resolve?keys=…&window=…&site_id=…&mode=live|snapshot` (`metrics/resolve/route.ts:70-79`); UI `app/adminV2/settings/organization/operational-intelligence/page.tsx`, `components/adminV2/settings/operationalIntelligence/OperationalIntelligenceWorkspace.tsx`, `app/adminV2/analytics/AnalyticsWorkspacePanel.tsx`.

#### Layer 1b — Operational Calculation governance overlay

`web/lib/analytics/calculations/registry.ts:1-40` — each calc **wraps** an OIP `MetricDefinition` via `defineCalculation(key, governance)` so format/dimensions/sources/snapshot-strategy "cannot drift" `:5-8`, adding `questionAnswered`, `grains`, business process. Doctrine `docs/platform/core/operational-calculations.md`.

#### Layer 2 — Analytics V2 (DB-configurable)

`20260624120000_analytics_v2_metric_platform.sql` — `metric_definitions` `:8-41` (tenant- or global-scoped, `org_id NULL` = global template `:36`, with `source_type`, `source_key`, `aggregation`, `numerator_config`, `denominator_config`, `filter_config`, `dimension_config`, `default_period_config`, `is_kpi`, `target_config`, `threshold_config`, `status draft|active|archived`, `version`); `metric_visualizations` `:60`; `metric_placements` `:98-124` (`surface` CHECK includes `workspace_header | business_process_tile | work_unit_header | drawer | operational_intelligence | dashboard | report | portal | mobile`); `metric_rollups` `:172`; `metric_platform_snapshots` `:137+`. Configurable definitions bind to a **whitelisted source registry**, not arbitrary SQL: `metrics/platform/metricSourceRegistry.ts` (each entry carries `oipMetricKey`, `supportedFilters`, `supportedDimensions`; validation `:189,:206`). Also `org_settings.metadata.oi_org_calc_measurements` (`metrics/oiOrgCalcMeasurements.ts:83-84`).

### 13.2 Existing communications metrics — present (3)

Registry `metrics/registry.ts:102-135`, pack `communications`:

| Key | Def | Resolver | Semantics |
|---|---|---|---|
| `comms.delivery_rate` | `registry.ts:102-113` | `resolvers/commsMetrics.ts:66-101` | delivered-events ÷ outbound with `sent_at` |
| `comms.reply_rate` | `registry.ts:114-124` | `commsMetrics.ts:103-123` | `replied_at` non-null ÷ outbound with `sent_at` |
| `comms.failed_delivery_count` | `registry.ts:125-135` | `commsMetrics.ts:125-153` | `event_type IN ('failed','bounced')` |

`comms.delivery_rate` is also a KPI (`types.ts:24-30`) and the only comms entry in the V2 source registry (`metricSourceRegistry.ts:104-112`).

Separately, **outside OIP**: pure comms KPI/health models — `v2/communicationHealth.ts` (lastContactAt, lastReadAt, unreadCount, responseRate, engagementScore 0-100, channelPreference, consentStatus `:26-34`), `v2/communicationsWorkspaceKpiModel.ts`, `v2/communicationsOperationalHealthModel.ts`, `v2/deliverability.ts`, `v2/assignmentSla.ts`.

### 13.3 Raw data available today

**`communication_messages`:** `created_at`, `sent_at`, `delivered_at` (`20260430254100:71-73`); `opened_at`, `clicked_at`, `replied_at` (`20260619130000:9-11`); `direction`, `status`, `channel`, `provider`, `provider_message_id`, `from_address`, `to_address`, `subject`, `workflow_run_id`, `communication_provider_binding_id`, `metadata`.

**`communication_threads`:** `primary_entity_type/id`, `channel`, `recipient_key`, **`location_id`** (`20260430254100:42`), `archived_at`, `last_message_at` (`20260604100000:2-3`, trigger-maintained `:39-52`), `assigned_user_id`, `assigned_team_id`, `assignment_state`, `attention_state`, **`first_response_at`**, `sla_due_at`, `sla_state`, `last_read_at` (`20260619120000:8-16`).

**`communication_message_recipients`:** `person_id`, `address`, `recipient_role`, `status`, `delivered_at`, `opened_at`, `clicked_at`, `replied_at` (`20260619140000:8-22`) + `queued_at`, `sent_at`, `bounced_at`, `complained_at`, `failed_at`, `last_event_at`, `provider_message_id` (`20260619160000:29-40`), backfilled one row per outbound message `:44-51`.

**`communication_delivery_events`:** `event_type`, `provider`, `occurred_at`, `payload`, `recipient_id`, `channel`, `provider_message_id`, `provider_event_id` (unique idempotency index `20260619160000:22-24`), `event_status`, `received_at`, `raw_payload`.

Feasibility:

| Metric | Status |
|---|---|
| **Open rate** | **Columns exist, unpopulated.** Migration header says webhook wiring lands "in PKG-07/PKG-16"; no adapter writes it. No tracking-pixel or link-rewrite infrastructure exists. |
| **Response rate** | **Shipping** — `comms.reply_rate` (`commsMetrics.ts:36-46`), depends on `replied_at`, same population question as opens. `communicationHealth.responseRate` computes it purely `:29`. |
| **Average response time** | **NOT computable.** Requires operator-reply-minus-inbound. `communication_threads.first_response_at` exists (`20260619120000:13`, "Populated by PKG-10") but is **never written** — `grep -rn first_response_at web/lib web/app` returns exactly one hit, a column-name constant `v2/conversationCore.ts:35`. `sla_events` is created `:58-66` and never inserted into — the only writer in the codebase is `conversation_assignment_events` at `conversations/[id]/assign/route.ts:71`. Per-message `created_at` + `direction` **do** allow computing it retroactively; nothing does. |
| **Template performance** | **NOT computable.** `communication_messages` has **no `template_id`**. `template_id` lives only on `announcements` (`20260622123000:28`). Sent messages carry no template provenance. |
| **Operator responsiveness** | **NOT computable.** No `sender_user_id`/`actor_user_id` on `communication_messages`. Only thread-level `assigned_user_id` `20260619120000:9` and assignment audit rows. Who actually typed and sent a message is not recorded. |
| **Location comparison** | **Data exists, unused.** `communication_threads.location_id` and `communication_provider_bindings.location_id`. **No comms resolver joins to it** — see SECURITY #1. |
| **Conversation health** | **Partial.** `communicationHealth.ts` computes 7 fields purely, but `channelPreference` is *inferred from message counts* `:43-52`, `consentStatus` must be supplied, `unreadCount` comes from `communication_message_reads`, and thread `attention_state`/`sla_state` are free-text-and-unpopulated. |

### 13.4 Event / time-series tables that could carry comms events

1. **`workflow_events`** — `remote_schema.sql:3134-3144`: `id, org_id, event_type, entity_type, entity_id, action_type, payload jsonb, occurred_at, created_at`. **Generic subject_type/subject_id shape, `FORCE ROW LEVEL SECURITY` `:3146`.** The canonical event layer, written by `emitEvent()` (`lib/emitEvent.ts:22-46`). **Comms already writes to it**: `message_queued` from `canonicalOutboundEnqueue.ts:231-239`, plus a typed catalog of 8 comms events at `v2/telemetry.ts:14-30` (`comm_health_computed, delivery_event_recorded, message_receipt_updated, consent_changed, conversation_assigned, sla_state_changed, template_rendered, announcement_sent`), namespaced `comms_v2.*` `:28-30`, emitted best-effort `:45-60`. **This is the right substrate — it exists and already has comms traffic.**
2. **`communication_delivery_events`** — comms-specific, append-only, provider-neutral, idempotent (`20260619130000:22-33`, `20260619160000:22-24`).
3. **`conversation_assignment_events`** and **`sla_events`** — `20260619120000:40-51,58-66`. Thread-scoped, append-only, purpose-built for exactly the responsiveness metrics above. **Only `conversation_assignment_events` is ever written.**
4. **`activity_log`** — `remote_schema.sql:969-978`. Generic but **has no `org_id`** — not usable for tenant-scoped analytics.
5. `metric_snapshots` and `metric_platform_snapshots` for derived time series.

### Gaps — WS13

| # | Gap |
|---|---|
| N1 | **PKG-10 (Assignment & SLA) service wiring was never done.** `first_response_at`, `sla_due_at`, `sla_state`, `attention_state`, and the entire `sla_events` table are schema-only. Every responsiveness/SLA metric is blocked on this, **not** on new schema. |
| N2 | **No `template_id` on `communication_messages`** → template performance is unattributable. One additive column unblocks it. |
| N3 | **No sender/actor identity on a message** → operator responsiveness unattributable. |
| N4 | **Comms metrics are org-wide only** — location comparison impossible despite `communication_threads.location_id` existing (see SECURITY #1). |
| N5 | **Open/click receipts depend on provider webhooks not implemented** (PKG-07/PKG-16). `opened_at`/`clicked_at` read null. |
| N6 | **Snapshots are never scheduled** — `mode=snapshot` reads whatever was last written manually; trends are effectively empty. |
| N7 | **The comms KPI/health work is a second, parallel analytics stack** (`communicationHealth.ts`, `communicationsWorkspaceKpiModel.ts`, `communicationsOperationalHealthModel.ts`) that does **not** flow through OIP definitions, placements, or governance. Two sources of truth for "how are communications doing". |
| N8 | OIP dimensions are a closed two-value union — `lifecycle_stage \| status_key` (`types.ts:49`). Comms-relevant dimensions (channel, direction, template, location, assignee) are not expressible. |
| N9 | `comms.*` metrics query `communication_messages` unpaginated within the window (`commsMetrics.ts:52-64`, then `.in("message_id", messageIds)` `:87`) — unbounded row scan and a PostgREST `IN`-list ceiling at volume. |

---

## Security concerns

**1 — Comms metrics ignore the operator's access scope (real leak, not theoretical).** All three resolvers call `resolveMetricScopeFilter(...)` and then use the result **only** to test `filter.impossible`, never applying `filter.locationIds` or `filter.constraints` to the query: `resolvers/commsMetrics.ts:70-92,107-115,129-142`. Contrast the correct pattern in `resolvers/eventWindowMetrics.ts:141,163,216` (`applyOpportunityScopeToQuery`, `applyTourBookingLocationScope`) and `resolvers/operationalHealthMetrics.ts:90,145`. **A location-scoped operator passing `site_id` sees org-wide delivery/reply/failure counts.** `resolvers/formsMetrics.ts:58-59,85-86` has the identical defect. Tenant isolation holds (`.eq("org_id", …)`); intra-tenant scope does not.

**2 — Zero Supabase Storage RLS in the repository.** `grep -rn "\bstorage\." supabase/migrations/*.sql` returns **one** hit, an unrelated comment (`20260711000001_commercial_products_primitive.sql:10`). There are **no `storage.buckets` rows, no `storage.objects` policies, and no bucket-creation migration**. The `org_documents` bucket is provisioned out-of-band per environment (acknowledged at `documents/upload/route.ts:3-9`). Tenant isolation of *file bytes* therefore rests **entirely on (a) the `{org_id}/…` path convention and (b) `.eq("org_id", ctx.orgId)` in the signed-URL route** (`documents/[id]/signed-url/route.ts:26`). **Path convention is not enforcement. If that bucket is public in any environment, every tenant's documents are enumerable.** Unverifiable from the repo — check against the live project.

**3 — The public vendor-application upload violates the org-prefix path convention.** `web/lib/vendors/publicVendorApplication.ts:352-353` writes to `vendors/{vendorId}/insurance/…` and `vendors/{vendorId}/drivers_license/…` — **no `{org_id}/` prefix**, into the same `org_documents` bucket. Any future `storage.objects` policy written against the documented convention will silently fail to cover these objects, which contain driver's licenses and insurance certificates. Reached from the **unauthenticated** `web/app/api/vendor-application/route.ts`.

**4 — Unauthenticated upload with no size limit and no MIME allowlist.** `web/app/api/vendor-application/route.ts:77-80` checks only `file.size === 0`; `:98` passes `file.type || "application/octet-stream"` straight to storage. No format-capability gate (unlike the admin route's 415 at `documents/upload/route.ts:142-153`), no size cap anywhere, no virus scanning anywhere.

**5 — MIME trust.** Even the admin path derives format from client-supplied `file.type` plus filename extension (`upload/route.ts:141-142`) and stores `contentType: file.type` `:172`. No magic-byte verification. A file declared `application/pdf` is served back with that `Content-Type` on a signed URL.

**6 — `GRANT ALL … TO anon` on every communications table.** `20260430254100:149-163` (bindings, threads, messages, reads), `20260619120000:110-115`, `20260619130000`, `20260619140000:101-109` (recipients, **preferences, preference events**). RLS is the only thing between the anon key and message bodies, recipient addresses, and consent records. `metric_snapshots` was done correctly by comparison — `GRANT SELECT … TO authenticated` only (`20260623120000:46`).

**7 — The `*_service_all` RLS policies are `FOR ALL TO authenticated USING (auth.role() = 'service_role')`** — `20260430254100:107-110,119-122,131-134,143-146`. Granting to `authenticated` then testing for `service_role` is incoherent (service_role bypasses RLS regardless). Harmless today because the predicate is unsatisfiable for a real authenticated user, but it means **there is no working INSERT/UPDATE/DELETE policy** and all writes must go through service-role server code — the actual security boundary, undocumented as such.

**8 — Any authenticated org member can read any document in the org.** `documents/[id]/signed-url/route.ts:10-16` checks only `ctx.ok` — no role check, unlike the upload route's `ctx.role !== "admin"` `:100`. Table RLS restricts SELECT to `owner|admin|ops|manager` (`remote_schema.sql:7541`), but this route uses `createAdminClient()` and **bypasses it**. A `viewer`/`staff` role reaching this endpoint gets a 10-minute unauthenticated URL to any document in the tenant, including a child's records or a vendor's driver's license.

**9 — Consent enforcement is off by default and would be ineffective if switched on.** `comms_v2_compliance` defaults false (`v2/flags.ts:53-58,69-76`), and when enabled, the missing message category means `enforceConsentForSend` classifies every send as transactional (`v2/consentEnforcement.ts:14-16,27` → `consentGate.ts:52-54` → always allowed). Meanwhile the operator-visible "Communication opt-out" toggle (`20260529210000:47`) is **read by nothing**. **An operator can today set a person to "opted out" and the platform will keep sending to them.** TCPA/CAN-SPAM exposure, not just a product gap.
