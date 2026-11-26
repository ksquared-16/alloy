---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Evidence record for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 — not doctrine.
---

# Environments and promotion — P1S code-derived settings checklist (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P1S, in the scope the owner
approved as its replacement: derive, **from code and configuration only**, every setting the web app (Vercel), the backend
(Render) and the Supabase project need, with where each one is read. It is the checklist the owner works through in the
Vercel, Render and Supabase dashboards at cutover. Builds on [P1](environments-p1-production-census-2026-11-25.md)–[P6](environments-p6-release-rehearsal-2026-11-25.md); it closes the
*names* half of P3's B3 and gives B4/B5 their setting names.

**No setting value appears here.** No dashboard, credential, live service, environment file or environment dump was read.
Where a row says what to set (`production`, "the production origin"), it is the value the **code** defines or expects,
not a value copied from anywhere.

## Method

1. **Scanner.** [`scripts/release/settings-inventory.mjs`](../../../scripts/release/settings-inventory.mjs) reads the source that
   ships, per tier, and nothing else:

   | Tier | Roots scanned (tests, `__tests__`, `*.test.*` excluded) |
   |---|---|
   | web (Vercel) | `web/app`, `web/lib`, `web/components`, `web/contexts`, `web/hooks`, `web/middleware.ts`, `web/next.config.ts`, `web/scripts/vercel-ignored-build.sh` |
   | backend (Render) | `backend/app`, `backend/main.py` |
   | Supabase | `supabase/migrations` |

   It finds `process.env.X` and `process.env["X"]`; `env.X` where a function takes the environment as `env`; Python
   `os.getenv("X")`, `os.environ.get("X")`, `os.environ["X"]` and `e.get("X")`; shell `$X`; `"env:X"` provider-binding secret references; and, in
   any file that looks a name up through a variable (`process.env[name]`, `envInt("X")`, `for name in (…)`), every
   env-shaped string literal as a candidate. In SQL it finds Vault secret names read from `vault.decrypted_secrets`,
   `create extension` and `insert into storage.buckets`.
2. **Classification.** Each key was read at its call site to decide what unset means and whether production needs it.
3. **Validation.** [`scripts/release/tests/settings-checklist.test.mjs`](../../../scripts/release/tests/settings-checklist.test.mjs)
   (`npm run test:settings-checklist`) fails when the scanner finds a key that is in neither a checklist table nor the
   *not a setting* list, when a table names a key the scanner does not find, when a cited file does not contain its key,
   or when this document contains anything shaped like a credential. It also tests the scanner on a fixture tree.

Scan result: **196** web, **20** backend and **11** Supabase entries. 13 web candidates are not settings (error codes and
a comment placeholder, listed at the end), leaving **183 web + 20 backend + 11 Supabase** checklist rows, plus the
dashboard settings in §C.2 that have no environment name.

## How to read the tables

| Class | Meaning | Production action |
|---|---|---|
| **R** | Required: the app is broken or unsafe without it | Set |
| **C** | Required if that capability is live in production (payments, email, SMS, AI) | Set when the capability is on |
| **O** | Optional; unset uses a code default | Leave unset unless the owner decides otherwise |
| **F** | Feature flag; unset uses a code default | Owner decision: match staging only where staging sets it |
| **A** | Alias or fallback of another key | Leave unset, or equal to the primary |
| **L** | Legacy path | Owner decision; usually unset |
| **S** | Staging marker | Must not be set (or must not say `staging`) on production |
| **D** | Diagnostics or debug | Leave unset |
| **X** | Certification, QA, test or local only | Must not be set on any deployed scope |
| **B** | Build tooling | Leave unset |
| **P** | Provided by the platform | Do not set |

`NEXT_PUBLIC_*` keys are **build-time**: Next inlines them when `next build` runs. Set them in the Vercel **Production**
scope *before* the production build, and redeploy after any change; editing one changes nothing in a running build.
"Read at" is the first location the scanner found; most keys are read in more places.

## A. Vercel — web app (Production scope)

### A.1 Project settings (from `web/vercel.json`, `web/next.config.ts` and the repo's deploy doc)

| Setting | What the code expects | Source |
|---|---|---|
| Root Directory | `web` | `deployment-and-environments.md` → *Vercel auto-deploy policy* |
| Ignored Build Step | `bash scripts/vercel-ignored-build.sh` (reads `VERCEL_GIT_COMMIT_REF`) | `web/vercel.json` `ignoreCommand` |
| Git deployments | `staging`, `main`, `master` only | `web/vercel.json` `git.deploymentEnabled` |
| Production branch | `main`; production must be a Vercel **Production** deployment, not a preview alias | `deployment-and-environments.md` (environment identity) |
| Function region | `pdx1`; chosen to sit beside the database, so check the production Supabase project's region | `web/vercel.json` `regions`; `deployment-and-environments.md` → *Compute placement* |
| Cron | `/api/scheduled-work/wake` every 5 minutes; fires only from a Production deployment, and only sends `Authorization` when `CRON_SECRET` is set | `web/vercel.json` `crons`; P4 H2 decides whether it or `pg_cron` is the production clock |
| System environment variables | *Automatically expose System Environment Variables* on (the app reads `VERCEL_*` for build info and URLs) | class **P** rows below |
| Instant Rollback | available on the plan, and who may use it | P6 owner action 7 |

### A.2 Environment variables

<!-- settings:web -->
| Key | Class | Production | Notes | Read at |
|---|---|---|---|---|
| `ALLOY_ENVIRONMENT` | R | Set: `production` (the code's enum) | Fail-closed outbound guard: unset or any other word refuses every real recipient. Set before the guard reaches `main` | `web/lib/communications/stagingOutboundRecipientGuard.ts:13` |
| `COMMAND_DESTRUCTIVE_PREVIEW_SECRET` | R | Set: its own secret | Production throws without it or `INTERNAL_CRON_TOKEN` | `web/lib/communications/preferences/unsubscribeToken.ts:83` |
| `COMMUNICATION_UNSUBSCRIBE_SECRET` | R | Set: its own secret | Production throws if it and its fallbacks are all unset. Fallback chain → `COMMAND_DESTRUCTIVE_PREVIEW_SECRET` → `INTERNAL_CRON_TOKEN` | `web/lib/communications/preferences/unsubscribeToken.ts:82` |
| `CRON_SECRET` | R | Set: a new high-entropy secret | `/api/scheduled-work/wake` bearer. Vercel Cron sends it only when set. Same value as Vault `scheduled_work_wake_credential` if that is the sender | `web/app/api/scheduled-work/wake/route.ts:46` |
| `INTERNAL_CRON_TOKEN` | R | Set: a new secret, same value as Render `INTERNAL_CRON_TOKEN` | `x-cron-token` for wake, `process-due` and the backend call. Also the last fallback for three signing secrets (below) | `web/app/api/admin/communication-scheduled-sends/process-due/route.ts:14` |
| `INTERNAL_MESSAGES_PROCESS_URL` | R | Set: production backend URL + `/internal/messages/process` | Unset leaves SMS rows queued (`lib/workflowRun.ts`) | `web/lib/communications/executeLegacyCommunicationsSendAdapter.ts:443` |
| `NEXT_PUBLIC_APP_URL` | R | Set: the production origin (`https://` + host, no path) | Build-time. Links in mail, Stripe return URL, Supabase Auth `redirectTo` (`/reset-password`, `/login`) | `web/app/api/admin/send-password-reset/route.ts:58` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | R | Set: production anon key | Build-time; ships to the browser | `web/app/api/dev/supabase-origin/route.ts:25` |
| `NEXT_PUBLIC_SUPABASE_URL` | R | Set: production project URL | Build-time. Auth cookies are keyed from this host; server reads prefer it | `web/app/api/admin/jobs/[id]/assign-vendor/route.ts:44` |
| `SUPABASE_SERVICE_ROLE_KEY` | R | Set: production service-role key | Server only. Never `NEXT_PUBLIC_*` | `web/app/api/public/booking-config/route.ts:22` |
| `SUPABASE_URL` | R | Set: same URL as `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabaseAdmin.ts` reads it first; a different URL splits auth cookies (`warnIfAuthSupabaseUrlMismatch`) | `web/app/api/admin/jobs/[id]/assign-vendor/route.ts:44` |
| `DOCUMENT_API_UPLOAD_SECRET` | C | Set if the public document-upload API is used; its own secret | Falls back to the three secrets above; in production with none, uploads are refused | `web/lib/documents/external/externalDocumentWrites.ts:91` |
| `MARKETING_DEMO_FROM` | C | Set: a verified sender for the demo-request mail | Code default is Resend's onboarding sender | `web/app/api/marketing/demo-request/route.ts:61` |
| `NEXT_PUBLIC_META_PIXEL_ID` | C | Owner decision: set only if the production marketing pixel is wanted | Build-time; ships to the browser | `web/components/MetaPixel.tsx:8` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | C | Set if payments are live: live publishable key | Build-time. Must be the same Stripe account and mode as the secret key | `web/lib/financials/payments/stripePublishableKey.ts:31` |
| `OPENAI_API_KEY` | C | Set if AI enrichment is wanted in production | Live enrichment needs both this and `OPENAI_MODEL` | `web/lib/ai/aiEnrichmentEnv.ts:23` |
| `OPENAI_MODEL` | C | Set with `OPENAI_API_KEY` |  | `web/lib/ai/aiEnrichmentEnv.ts:24` |
| `RESEND_API_KEY` | C | Set if email is live | Also the default `env:RESEND_API_KEY` binding secret reference | `web/app/api/marketing/demo-request/route.ts:45` |
| `RESEND_FROM_EMAIL` | C | Set if email is live: a verified sender | Fallback sender when a binding has none | `web/lib/communications/deliverQueuedEmailHtml.ts:104` |
| `RESEND_WEBHOOK_SECRET` | C | Set if email is live: signing secret of the production Resend webhook | Endpoint `/api/webhooks/resend` | `web/app/api/webhooks/resend/route.ts:95` |
| `STRIPE_SECRET_KEY` | C | Set if payments are live: live-mode secret key | Server only. `/api/admin/financials/payments-health` reports presence and mode | `web/lib/financials/payments/collectionAttempt.ts:269` |
| `STRIPE_WEBHOOK_SECRET` | C | Set if payments are live: signing secret of the production webhook endpoint | Endpoint `/api/stripe/webhook` | `web/app/api/stripe/webhook/route.ts:34` |
| `TWILIO_AUTH_TOKEN` | C | Set if SMS is live | Webhook signature checks; default `env:TWILIO_AUTH_TOKEN` binding reference | `web/lib/communications/providerCredentialCatalog.ts:100` |
| `ADMIN_DOCUMENTS_BUCKET` | O | Leave unset (default bucket `org_documents`, created by migration) | If set, the bucket must exist in the production project | `web/app/api/admin/documents/upload/route.ts:216` |
| `ALLOY_CANCELLATION_FEE_CENTS` | O | Owner decision: carry staging's only if it is a business setting; else code default |  | `web/lib/charges/cancellationFeeCharge.ts:12` |
| `ALLOY_CANCELLATION_FEE_WITHIN_HOURS` | O | Owner decision: carry staging's only if it is a business setting; else code default |  | `web/lib/charges/cancellationFeeCharge.ts:41` |
| `ALLOY_DEFAULT_BUSINESS_TIMEZONE` | O | Owner decision: carry staging's only if it is a business setting; else code default |  | `web/lib/bookingConfirmationSms.ts:12` |
| `MARKETING_DEMO_INBOX` | O | Leave unset to use the code default sales inbox |  | `web/app/api/marketing/demo-request/route.ts:6` |
| `NEXT_PUBLIC_BOOKING_PATH` | O | Owner decision: carry staging's only if it is a business setting; else code default |  | `web/lib/booking.ts:17` |
| `OPENAI_BASE_URL` | O | Leave unset unless staging deliberately overrides | Code default applies | `web/lib/ai/aiEnrichmentEnv.ts:35` |
| `OPENAI_CHAT_TEMPERATURE` | O | Leave unset unless staging deliberately overrides | Code default applies | `web/lib/ai/openAiModelCapabilities.ts:15` |
| `OPENAI_REQUEST_TIMEOUT_MS` | O | Leave unset unless staging deliberately overrides | Code default applies | `web/lib/ai/aiEnrichmentEnv.ts:52` |
| `PUBLIC_TWILIO_WEBHOOK_BASE_URL` | O | Leave unset unless Twilio calls a different origin than `NEXT_PUBLIC_APP_URL` | Base URL for Twilio status-webhook signature checks; falls back to `NEXT_PUBLIC_APP_URL` | `web/lib/communications/twilioSmsStatusWebhook.ts:42` |
| `AGENT_CONFIG_LAB_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/app/legacy-admin/agent-lab/page.tsx:8` |
| `AGENT_V0_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/app/api/admin/agent/v0/queue-definition/route.ts:12` |
| `AGENT_V1_RECORD_LAYOUT_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/app/api/admin/agent/v1/activity/route.ts:6` |
| `AGENT_V2_FIELD_VISIBILITY_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/app/api/admin/agent/v2/field-visibility/route.ts:15` |
| `AI_ENRICHMENT_TELEMETRY_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/ai/aiEnrichmentEnv.ts:18` |
| `AI_ENRICHMENT_USE_PERMISSION_REQUIRED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/ai/aiEnrichmentPermissions.ts:41` |
| `ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/childcareOperational/materializeEnrollmentFromProcessInstance.ts:81` |
| `ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/queues/enrollmentQueueMembershipFlags.ts:9` |
| `ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/orchestration/placement/childWaitlistPlacementEligibility.ts:12` |
| `ALLOY_PLACEMENT_HOUSEHOLD_FACTS_METADATA_FALLBACK` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/orchestration/placement/householdPlacementFacts.ts:259` |
| `ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/orchestration/placement/placementCandidateLifecycleHook.ts:435` |
| `ALLOY_QUEUE_CHILD_GRAIN_LANES` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/queues/childGrainLanesFeatureFlag.ts:26` |
| `ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/queues/childGrainEnrollmentQueue.ts:25` |
| `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/queues/queueMembershipFromBuilderFeatureFlag.ts:11` |
| `ALLOY_QUEUE_ROW_CONTEXT_DISABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/workUnits/attachQueueRowContextToItems.ts:21` |
| `ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/queues/candidateGrainWaitlistQueue.ts:79` |
| `ANALYTICS_V2_METRIC_PLATFORM_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/metrics/platform/featureFlag.ts:16` |
| `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/childcareOperational/featureFlag.ts:38` |
| `COMMUNICATION_DUAL_WRITE` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/communications/communicationsEnabled.ts:3` |
| `DOCUMENTS_MALWARE_SCANNER_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/documents/malware/inboundReevaluation.ts:35` |
| `DRAWER_SUMMARY_STRIP_BOUNDARY` | F | Owner decision: match staging if staging sets it; else leave unset | Unset defaults OFF in production and ON in staging, so staging's behaviour is not production's by default | `web/lib/layout/featureFlag.ts:287` |
| `FIELD_REQUIREMENT_POLICY_ENFORCEMENT_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/fields/fieldRequirementPolicyEnv.ts:7` |
| `FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:255` |
| `INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/communications/email/inboundAttachmentRetrieval.ts:9` |
| `LAYOUT_RUNTIME_CHILD_DRAWER` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:175` |
| `LAYOUT_RUNTIME_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:69` |
| `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:31` |
| `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:93` |
| `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:145` |
| `LAYOUT_RUNTIME_OPPORTUNITY_QUEUE` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:192` |
| `LAYOUT_RUNTIME_PERSON_DRAWER` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:158` |
| `LAYOUT_RUNTIME_SHADOW_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:79` |
| `LAYOUT_V2_PREVIEW_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/layout/featureFlag.ts:64` |
| `NEXT_PUBLIC_ADMINV2_DRAWER_BOOTSTRAP` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/admin/opportunityDrawerBootstrapClient.ts:11` |
| `NEXT_PUBLIC_ADMINV2_DRAWER_VM` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover.ts:34` |
| `NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/adminV2/shellNavigation.ts:32` |
| `NEXT_PUBLIC_AGENT_LAB_ASSISTANT_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/components/admin/agentLab/AgentLabAssistantPanel.tsx:17` |
| `NEXT_PUBLIC_ALLOY_OS_IDLE_LOGOUT` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/adminV2/runtime/useIdleSessionLogout.ts:16` |
| `NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/metrics/platform/featureFlag.ts:20` |
| `NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/bos/commandSession/bosCreateLeadSessionFlag.ts:6` |
| `NEXT_PUBLIC_CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/childcareOperational/featureFlag.ts:43` |
| `NEXT_PUBLIC_COMMS_V2_ANNOUNCEMENTS` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:104` |
| `NEXT_PUBLIC_COMMS_V2_ASSIGNMENT` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:98` |
| `NEXT_PUBLIC_COMMS_V2_BOS` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:108` |
| `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:88` |
| `NEXT_PUBLIC_COMMS_V2_COMPLIANCE` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:96` |
| `NEXT_PUBLIC_COMMS_V2_COMPOSER` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:92` |
| `NEXT_PUBLIC_COMMS_V2_DELIVERABILITY` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:106` |
| `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:110` |
| `NEXT_PUBLIC_COMMS_V2_PREFERENCES` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:94` |
| `NEXT_PUBLIC_COMMS_V2_RECORD_TAB` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:90` |
| `NEXT_PUBLIC_COMMS_V2_SLA` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:100` |
| `NEXT_PUBLIC_COMMS_V2_TEMPLATES` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/communications/v2/flags.ts:102` |
| `NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/adminV2/runtime/configurationRuntimeConvergenceFlag.ts:12` |
| `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time. Same environment-dependent default | `web/lib/layout/featureFlag.ts:291` |
| `NEXT_PUBLIC_FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:259` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_CHILD_DRAWER` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:179` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:74` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:35` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:97` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:152` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_QUEUE` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:196` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_PERSON_DRAWER` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:162` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_SHADOW_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:83` |
| `NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/layout/featureFlag.ts:26` |
| `NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/admin/operationalWork/operationalWorkV1UiGate.ts:9` |
| `NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset | Build-time | `web/lib/adminV2/viewModel/drawer/opportunity/initialPanelResource.ts:74` |
| `OE_LEDGER_AUTHOR_ENABLED` | F | Owner decision: match staging if staging sets it; else leave unset |  | `web/lib/operationalExpectations/intake/ledgerAuthoringFeatureFlag.ts:34` |
| `ALLOY_PUBLIC_APP_URL` | A | Leave unset, or equal to `NEXT_PUBLIC_APP_URL` | Fallback origin after `NEXT_PUBLIC_APP_URL` and `APP_CANONICAL_URL` | `web/lib/publicAppUrl.ts:128` |
| `APP_CANONICAL_URL` | A | Leave unset, or equal to `NEXT_PUBLIC_APP_URL` | Fallback origin after `NEXT_PUBLIC_APP_URL` | `web/lib/publicAppUrl.ts:127` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE` | A | Leave unset | Older name, read only when the canonical one is empty | `web/lib/financials/payments/stripePublishableKey.ts:33` |
| `SUPABASE_ANON_KEY` | A | Leave unset, or the same key as `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Server fallback only | `web/lib/supabase/auth-env.ts:16` |
| `APP_ENV` | S | Leave unset (or `production`). `staging` here makes production restricted | A staging signal to the outbound guard. Several reads default to production when unset | `web/lib/communications/stagingOutboundRecipientGuard.ts:72` |
| `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST` | S | Must not be set on Production | Only meaningful in a restricted runtime | `web/lib/communications/stagingOutboundRecipientGuard.ts:27` |
| `COMMUNICATIONS_STAGING_SMS_ALLOWLIST` | S | Must not be set on Production | Only meaningful in a restricted runtime | `web/lib/communications/stagingOutboundRecipientGuard.ts:28` |
| `NEXT_PUBLIC_APP_ENV` | S | Leave unset (or `production`). `staging` here makes production restricted | A staging signal to the outbound guard. Several reads default to production when unset | `web/app/api/leads/gutters/route.ts:131` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG` | S | Must not be set on Production | Staging diagnostics | `web/lib/layout/runtime/layoutRuntimeEvidenceClient.ts:9` |
| `ALLOY_PUBLIC_ORG_ID` | L | Owner decision | Default org for older public intake routes (`/api/vendor-application`, `/api/leads/gutters`, action-link consume) | `web/app/api/action/[token]/consume/route.ts:58` |
| `BOOK_V2_BOOKED_STAGE_ID` | L | Owner decision; ids are per database, so a staging value is wrong in production | Book v2 pipeline stage ids | `web/lib/book-v2/resolvePipelineStage.ts:162` |
| `BOOK_V2_NEEDS_A_QUOTE_STAGE_ID` | L | Owner decision; ids are per database, so a staging value is wrong in production | Book v2 pipeline stage ids | `web/lib/book-v2/resolvePipelineStage.ts:159` |
| `BOOK_V2_QUOTE_STARTED_STAGE_ID` | L | Owner decision; ids are per database, so a staging value is wrong in production | Book v2 pipeline stage ids | `web/lib/book-v2/resolvePipelineStage.ts:155` |
| `NEXT_PUBLIC_API_BASE_URL` | L | Leave unset | Read only by `web/lib/api.ts`, which nothing in the runtime roots imports | `web/lib/api.ts:6` |
| `ADMIN_PERF_TRACE` | D | Leave unset |  | `web/app/api/admin/debug/inbound-ingress/route.ts:34` |
| `ALLOY_PLACEMENT_FACT_SOURCES_DEBUG` | D | Leave unset |  | `web/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows.ts:263` |
| `ALLOY_PLACEMENT_LOAD_DIAGNOSTICS` | D | Leave unset |  | `web/lib/orchestration/placement/placementCandidateLoadDiagnostics.ts:27` |
| `ALLOY_QUEUE_LANE_PARITY_DEBUG` | D | Leave unset |  | `web/lib/queues/queueLaneParityDebug.ts:3` |
| `ALLOY_ROUTE_TIMING` | D | Leave unset |  | `web/app/api/admin/p076-first-order-prototype/route.ts:49` |
| `COMMAND_RUNTIME_COMPAT_LOG` | D | Leave unset |  | `web/lib/platform/commands/runtime/commandExecuteCompatDiagnostics.ts:35` |
| `COMMUNICATIONS_INGRESS_DIAGNOSTICS` | D | Leave unset |  | `web/app/api/admin/debug/inbound-ingress/route.ts:33` |
| `CREATE_LEAD_PERF_DEBUG` | D | Leave unset |  | `web/lib/platform/commands/createLead/createLeadPhaseTiming.ts:28` |
| `LOG_PIPELINE_STAGE_RESOLVE` | D | Leave unset |  | `web/lib/book-v2/resolvePipelineStage.ts:35` |
| `NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH` | D | Leave unset | Despite the name, only copied into a diagnostic snapshot; through a dynamic `process.env[key]`, which Next does not inline into the browser bundle | `web/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover.ts:31` |
| `NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG` | D | Leave unset |  | `web/lib/adminV2/drawer/drawerRuntimeDebug.ts:34` |
| `NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH` | D | Leave unset | Despite the name, only copied into a diagnostic snapshot; through a dynamic `process.env[key]`, which Next does not inline into the browser bundle | `web/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover.ts:29` |
| `NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW` | D | Leave unset |  | `web/lib/adminV2/viewModel/drawer/shadow/drawerViewModelShadowGate.ts:7` |
| `NEXT_PUBLIC_ADMINV2_JANK_BUDGET` | D | Leave unset |  | `web/lib/perf/adminV2JankBudget.ts:31` |
| `NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH` | D | Leave unset | Despite the name, only copied into a diagnostic snapshot; through a dynamic `process.env[key]`, which Next does not inline into the browser bundle | `web/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover.ts:30` |
| `NEXT_PUBLIC_ADMINV2_WORK_UNIT_VM_SHADOW` | D | Leave unset |  | `web/lib/adminV2/viewModel/workUnit/workUnitVmShadowGate.ts:6` |
| `NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG` | D | Leave unset |  | `web/lib/perf/platformSurfacePerfTrace.ts:21` |
| `NEXT_PUBLIC_ALLOY_PLATFORM_PERF_SERVER_LOG` | D | Leave unset |  | `web/lib/perf/platformSurfacePerfServerRelay.ts:9` |
| `NEXT_PUBLIC_COMMAND_SURFACE_SEARCH_DEBUG` | D | Leave unset |  | `web/app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx:173` |
| `NEXT_PUBLIC_ENROLLMENT_STATUS_DEBUG` | D | Leave unset |  | `web/components/admin/opportunity/actions/ChangeEnrollmentStatusModal.tsx:26` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_LINK_DEBUG` | D | Leave unset |  | `web/lib/layout/runtime/layoutRuntimeLinkDebug.ts:10` |
| `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_SHADOW_DIAGNOSTICS` | D | Leave unset |  | `web/lib/layout/featureFlag.ts:229` |
| `NEXT_PUBLIC_LIFECYCLE_DEBUG_UI` | D | Leave unset |  | `web/lib/lifecycle/lifecycleDebugUi.ts:7` |
| `NEXT_PUBLIC_PERF_PERCEIVED_MARKS` | D | Leave unset |  | `web/lib/configRuntime/configurationContinuity.ts:96` |
| `NEXT_PUBLIC_PROCESSING_DEBUG` | D | Leave unset |  | `web/app/adminV2/pos/ProcessingOverviewLanding.tsx:92` |
| `NEXT_PUBLIC_QUEUE_ROW_CLICK_DEBUG` | D | Leave unset |  | `web/lib/debug/queueRowClickDebug.ts:10` |
| `NEXT_PUBLIC_QUEUE_ROW_LINK_QA` | D | Leave unset |  | `web/lib/debug/queueRowLinkQa.ts:9` |
| `PERSON_PAYLOAD_TIMING` | D | Leave unset |  | `web/app/api/admin/entity/[type]/[id]/route.ts:113` |
| `PLATFORM_PERF_SERVER_LOG` | D | Leave unset |  | `web/app/api/admin/debug/platform-perf-trace/route.ts:16` |
| `AI_ENRICHMENT_STUB_ENABLED` | X | Must not be set | Stub AI responses | `web/lib/ai/aiEnrichmentEnv.ts:13` |
| `ALLOY_AGENT_ENV` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/publicAppUrl.ts:94` |
| `ALLOY_BUILD_SHA` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/financialsDirectorQa/readiness.ts:135` |
| `ALLOY_CERTIFICATION` | X | Must not be set | Offers synthetic provider credentials when `1` | `web/app/api/admin/debug/certification/inbound-email/route.ts:37` |
| `ALLOY_CERT_APP_ORIGIN` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/certification/enrollmentE2ePhases.ts:477` |
| `ALLOY_CERT_FIXTURE` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:159` |
| `ALLOY_CERT_FIXTURE_ORG_ID` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:234` |
| `ALLOY_CERT_FIXTURE_ORG_SOURCE` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:233` |
| `ALLOY_CERT_NAMESPACE` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:160` |
| `ALLOY_DEV_STRICT_MODE` | X | Must not be set | Certification, QA, test or local-development only | `web/next.config.ts:55` |
| `ALLOY_PROD_CERT_DIST` | X | Must not be set | Certification, QA, test or local-development only | `web/next.config.ts:48` |
| `ALLOY_QA_AUTHORITY_FILE` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:264` |
| `ALLOY_QA_AUTHORITY_SHA256` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:243` |
| `ALLOY_QA_BINDING_DIGEST` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:242` |
| `ALLOY_QA_BINDING_EXPIRES_AT` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:248` |
| `ALLOY_QA_CANDIDATE_SHA` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:244` |
| `ALLOY_QA_ENVIRONMENT_ID` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:162` |
| `ALLOY_QA_PREVIEW_ORIGIN` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:236` |
| `ALLOY_QA_REQUEST_ID` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:245` |
| `ALLOY_QA_RUN_ID` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:161` |
| `ALLOY_QA_SESSION_FILE` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:231` |
| `ALLOY_QA_SESSION_ORIGIN` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:238` |
| `ALLOY_QA_SESSION_SHA256` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/qa/toursFixture/toursCertificationFixture.ts:241` |
| `DEV_TENANT_SPINUP_ENABLED` | X | Must not be set | `true` enables `/api/admin/dev/create-org` | `web/app/api/admin/dev/create-org/route.ts:13` |
| `NEXT_PUBLIC_COMMS_V2_FIXTURES` | X | Must not be set | Build-time; fixture data in the communications UI | `web/app/adminV2/communications/fixtures.ts:8` |
| `VITEST` | X | Must not be set | Certification, QA, test or local-development only | `web/lib/admin/drawer/personDrawerDevDirectOpen.ts:14` |
| `GIT_COMMIT_SHA` | B | Leave unset | Non-Vercel fallback for the build SHA | `web/app/api/runtime-info/route.ts:17` |
| `SKIP_BUILD_TYPECHECK` | B | Leave unset | `1` skips the build type check | `web/next.config.ts:14` |
| `NEXT_PUBLIC_BUILD_SHA` | P | Do not set | `next.config.ts` inlines it from `VERCEL_GIT_COMMIT_SHA` | `web/lib/runtime/buildInfo.ts:11` |
| `NEXT_PUBLIC_VERCEL_ENV` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/components/admin/focusPanel/cards/HouseholdCard.tsx:704` |
| `NODE_ENV` | P | Do not set | Set by `next build` / `next start` | `web/app/adminV2/components/AlloyOsLayoutSurfaceDiagnostics.tsx:34` |
| `VERCEL` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/lib/publicAppUrl.ts:93` |
| `VERCEL_DEPLOYMENT_ID` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/app/api/build-info/route.ts:51` |
| `VERCEL_ENV` | P | Do not set | Production must be a Vercel **Production** deployment: `preview` is a staging signal and also means Vercel Cron never fires | `web/app/api/admin/dev/health-m1/route.ts:22` |
| `VERCEL_GIT_COMMIT_MESSAGE` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/app/api/build-info/route.ts:48` |
| `VERCEL_GIT_COMMIT_REF` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/app/api/build-info/route.ts:47` |
| `VERCEL_GIT_COMMIT_SHA` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/app/api/admin/queues/[workUnitId]/[queueKey]/route.ts:202` |
| `VERCEL_PROJECT_PRODUCTION_URL` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/lib/publicAppUrl.ts:131` |
| `VERCEL_URL` | P | Do not set (Vercel system variable) | Needs *Automatically expose System Environment Variables* on | `web/app/api/build-info/route.ts:50` |
<!-- /settings -->

## B. Render — backend service (production service)

### B.1 Service settings (from `backend/`)

| Setting | What the code expects | Source |
|---|---|---|
| Start command | `uvicorn backend.main:app` (the app is `backend/app/server.py`) | `backend/main.py`, `backend/README_refactor.md` |
| Python | 3.10.5 | `backend/.python-version` |
| Dependencies | `pip install -r backend/requirements.txt` | `backend/README-environment.md` |
| Routes callers depend on | `POST /internal/messages/process` (web, via `INTERNAL_MESSAGES_PROCESS_URL`), `/sms/*` (Twilio inbound), `GET /build-info` | `backend/app/server.py` |
| Scheduled call of `/internal/messages/process` | **Not in the repository.** The backend README describes a Render Cron Job; whether one exists for staging, and whether production needs one, is not recorded | `backend/README_MESSAGES_SENDER.md` |

### B.2 Environment variables

<!-- settings:backend -->
| Key | Class | Production | Notes | Read at |
|---|---|---|---|---|
| `ALLOY_ENVIRONMENT` | R | Set: `production` (the code's enum) | Same fail-closed guard as the web app | `backend/app/integrations/staging_outbound_guard.py:36` |
| `INTERNAL_CRON_TOKEN` | R | Set: same value as Vercel `INTERNAL_CRON_TOKEN` | Guards `POST /internal/messages/process` | `backend/app/settings.py:84` |
| `SUPABASE_SERVICE_ROLE_KEY` | R | Set: production service-role key |  | `backend/app/settings.py:43` |
| `SUPABASE_URL` | R | Set: production project URL | Unset: the backend boots but skips every write | `backend/app/integrations/staging_outbound_guard.py:79` |
| `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL` | C | Set if SMS is live: the public origin Twilio calls | Behind Render's proxy the URL the app sees can differ from the URL Twilio signed | `backend/app/settings.py:68` |
| `PUBLIC_TWILIO_STATUS_CALLBACK_BASE` | C | Set if per-message delivery receipts are wanted | Unset: no `statusCallback` is attached | `backend/app/settings.py:81` |
| `RESEND_API_KEY` | C | Set if email is live | Read through the default `env:RESEND_API_KEY` binding reference | `backend/app/services/communication_message_sender.py:497` |
| `RESEND_FROM_EMAIL` | C | Set if email is live: a verified sender |  | `backend/app/integrations/resend_client.py:100` |
| `TWILIO_ACCOUNT_SID` | C | Set if SMS is live | The app boots without them | `backend/app/settings.py:57` |
| `TWILIO_AUTH_TOKEN` | C | Set if SMS is live | Inbound `/sms/*` signature checks; default `env:` binding reference | `backend/app/settings.py:58` |
| `TWILIO_MESSAGING_SERVICE_SID` | C | Set if SMS is live | The app boots without them | `backend/app/settings.py:59` |
| `COMMUNICATIONS_SMS_INBOUND_ENABLED` | O | Leave unset (enabled) | `0`/`false`/`no`/`off` disables inbound SMS | `backend/app/settings.py:62` |
| `APP_ENV` | S | Leave unset on Render | Read only as a staging signal; `staging` makes the backend restricted | `backend/app/integrations/staging_outbound_guard.py:74` |
| `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST` | S | Must not be set on the production service |  | `backend/app/integrations/staging_outbound_guard.py:31` |
| `COMMUNICATIONS_STAGING_SMS_ALLOWLIST` | S | Must not be set on the production service |  | `backend/app/integrations/staging_outbound_guard.py:32` |
| `NEXT_PUBLIC_APP_ENV` | S | Leave unset on Render | Read only as a staging signal; `staging` makes the backend restricted | `backend/app/integrations/staging_outbound_guard.py:74` |
| `NEXT_PUBLIC_SUPABASE_URL` | S | Leave unset on Render | Read only as a staging signal (the staging project ref) | `backend/app/integrations/staging_outbound_guard.py:79` |
| `VERCEL_ENV` | S | Leave unset on Render | Read only as a staging signal (`preview`) | `backend/app/integrations/staging_outbound_guard.py:77` |
| `RENDER_GIT_BRANCH` | P | Do not set (Render-provided) | Served by `GET /build-info` | `backend/app/server.py:47` |
| `RENDER_GIT_COMMIT` | P | Do not set (Render-provided) | Served by `GET /build-info` | `backend/app/server.py:46` |
<!-- /settings -->

## C. Supabase — production project

### C.1 Schema-level settings (from `supabase/migrations`)

The migrations create each of these, but production has not had the staging migration chain applied (P2, P4), so check
each one after the first promotion's schema step.

<!-- settings:supabase -->
| Key | Class | Production | Notes | Read at |
|---|---|---|---|---|
| `bucket:org_documents` | R | Storage: private bucket `org_documents` (migration creates it) | Default for `ADMIN_DOCUMENTS_BUCKET`; inbound attachments and generated PDFs | `supabase/migrations/20261207181600_org_documents_bucket_governance.sql:30` |
| `extension:btree_gist` | R | Enabled (migration creates it) |  | `supabase/migrations/20260904180000_financial_periods_and_journal.sql:44` |
| `extension:pg_cron` | R | Database → Extensions: enabled (migration creates it) | The scheduled-work clock | `supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:28` |
| `extension:pg_net` | R | Database → Extensions: enabled (migration creates it) | The scheduled-work clock | `supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:29` |
| `extension:pgcrypto` | R | Enabled (migration creates it) |  | `supabase/migrations/20260329165048_remote_schema.sql:40` |
| `extension:supabase_vault` | R | Enabled (migration creates it) | Holds the two wake secrets and org-owned provider credentials | `supabase/migrations/20260329165048_remote_schema.sql:47` |
| `extension:uuid-ossp` | R | Enabled (migration creates it) |  | `supabase/migrations/20260329165048_remote_schema.sql:54` |
| `scheduled_work_wake_credential` | R | Create in Vault: equal to Vercel `CRON_SECRET` or `INTERNAL_CRON_TOKEN` (the job sends it as both the bearer and `x-cron-token`) | Without it the job sends no request rows (its `FROM` returns nothing) | `supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:59` |
| `scheduled_work_wake_url` | R | Create in Vault: the production origin + `/api/scheduled-work/wake` | **Unset falls back to the staging URL** in the `pg_cron` job, so a production clock without it wakes staging | `supabase/migrations/20261002120000_scheduled_work_clock_pg_cron.sql:48` |
| `extension:pg_graphql` | O | Present in the baseline schema; no runtime code calls GraphQL |  | `supabase/migrations/20260329165048_remote_schema.sql:26` |
| `extension:pg_stat_statements` | O | Present in the baseline schema; diagnostics only |  | `supabase/migrations/20260329165048_remote_schema.sql:33` |
<!-- /settings -->

### C.2 Dashboard settings (from the Auth and API calls the code makes; no environment name)

| Setting | What the code expects | Source |
|---|---|---|
| API → Project URL, `anon` key, `service_role` key | Feed `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` on Vercel, and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` on Render, all from the **same** project | `web/lib/supabase/auth-env.ts`, `backend/app/settings.py` |
| API → exposed schemas | `public` (every server read is `@supabase/supabase-js` against PostgREST; no `.schema(…)` call in the runtime roots) | `web/lib/supabaseAdmin.ts` |
| Authentication → Providers → Email | Enabled, with password sign-in (`signInWithPassword`); no OAuth or OTP call exists in the runtime roots | `web/app/login/page.tsx` |
| Authentication → URL Configuration → Site URL | The production origin (the same as `NEXT_PUBLIC_APP_URL`) | — |
| Authentication → URL Configuration → Redirect URLs | `<production origin>/reset-password` and `<production origin>/login` | `web/app/forgot-password/page.tsx`, `web/app/api/admin/send-password-reset/route.ts`, `web/app/api/admin/users/route.ts` (`inviteUserByEmail`) |
| Authentication → Emails → SMTP | Production: a **delivering** sender for invite and recovery mail. Staging: a capture-only sandbox (P3 B5). The code calls `inviteUserByEmail` and `resetPasswordForEmail`, so the *Invite user* and *Reset password* templates are the ones in use | `deployment-and-environments.md` → *Supabase Auth mail* |
| Database → connection pooling | Release applies use the session pooler (port 5432), not 6543 | `production-release-procedure.md`, P6 owner action 5 |
| Database → backups / PITR | Tier that release step 5 relies on | P6 owner action 6 |

## D. Settings that must agree across platforms

| Pair | Where each is set | Rule |
|---|---|---|
| Supabase project | Vercel `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`; Render `SUPABASE_URL`; the keys beside them | One production project ref for all of them |
| `ALLOY_ENVIRONMENT` | Vercel Production scope and the Render production service | Both say production, before the outbound guard reaches `main` (`deployment-and-environments.md`) |
| `INTERNAL_CRON_TOKEN` | Vercel and Render | Same secret: the web app sends it to the backend |
| Wake credential | Vercel `CRON_SECRET` (or `INTERNAL_CRON_TOKEN`) and Vault `scheduled_work_wake_credential` | Equal, if `pg_cron` is the production clock |
| Wake URL | Vault `scheduled_work_wake_url` and the production origin | Must point at production; unset, the job wakes **staging** |
| Backend URL | Vercel `INTERNAL_MESSAGES_PROCESS_URL` and the Render service's public URL | The production service, never the staging one |
| Origin | Vercel `NEXT_PUBLIC_APP_URL`, Supabase Site URL and redirect URLs, Render `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL` (the backend's own origin) | One production origin per service |
| Provider credentials | `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` on both Vercel and Render | Same production account on both |
| Stripe | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | One account, live mode, the production endpoint's signing secret |

Three web signing secrets fall back to one another and finally to `INTERNAL_CRON_TOKEN`
(`COMMUNICATION_UNSUBSCRIBE_SECRET` → `COMMAND_DESTRUCTIVE_PREVIEW_SECRET` → `INTERNAL_CRON_TOKEN`, and
`DOCUMENT_API_UPLOAD_SECRET` ahead of all three). Setting only `INTERNAL_CRON_TOKEN` works, but then one secret, which is
also shared with Render, signs unsubscribe links, destructive-command previews and upload ids. The checklist asks for a
separate secret for each.

## E. What the code cannot tell you (uncovered)

1. **Staging's actual settings.** Which F, O and L keys staging sets, and to what, needs the Vercel and Render dashboards.
   For each F row, read whether the name exists on staging and decide. Without that, production gets the code defaults,
   and those differ from staging's behaviour in at least one place (`DRAWER_SUMMARY_STRIP_BOUNDARY` defaults on in staging
   and off in production).
2. **Keys set on a platform that no code reads.** Not detectable from code. Anything on staging's lists that is not in
   this document should not be carried. One example is already in the repo: `backend/README_MESSAGES_SENDER.md` lists
   `TWILIO_FROM_NUMBER` as required, and no backend code reads it.
3. **Secret names stored as data.** A provider binding's `secret_ref` can be any `env:NAME`; the code's defaults
   (`env:RESEND_API_KEY`, `env:TWILIO_AUTH_TOKEN`) are listed, but a binding row could name another. Org-owned `vault:`
   credentials (`org_provider_credential_resolve`) live in the database, are per organization and are re-provisioned per
   environment (P3 C15/B4). Neither can be listed without reading binding rows.
4. **Names built at runtime.** The scanner resolves names passed as literals to a helper or held in a constant. A name
   assembled from parts (`` `FOO_${x}` ``) would be missed; none was found, but the scanner cannot prove absence.
5. **Callers outside the three platforms.** Provider dashboards must point at production: Stripe webhook →
   `/api/stripe/webhook`, Resend webhook → `/api/webhooks/resend`, Twilio inbound → the backend's `/sms/*` and the web
   status webhook. Their URLs and signing secrets are set in Stripe, Resend and Twilio, not here.
6. **Out of scope by design.** Keys read only by `web/scripts`, tests, Playwright and certification harnesses (about 300
   more names) are operator-shell settings, never platform settings. `current_setting('alloy.*')` reads in migrations
   are transaction-local guards that the code sets itself, not project settings.

## F. Where this sits in the first promotion

This checklist is an input to the first promotion, not a step that authorizes anything. **The P5 owner approval gate is
unchanged:** nothing here grants, satisfies or replaces it, and no setting may be changed on production because this
document lists it. At cutover, in the order the code needs:

1. Before the first production build: every **R** row in A.2 and the **C** rows for the capabilities going live. The
   `NEXT_PUBLIC_*` rows must be in place before `next build`.
2. Before the backend serves production traffic: the **R** and **C** rows in B.2, with the §D pairs matching.
3. After the schema step: §C.1 (extensions, bucket, the two Vault secrets), then the clock decision (P4 H2).
4. §C.2 before the first invite or password reset goes out.
5. Every **S** and **X** row checked **absent** on the production scopes.

## Not a setting (scanner candidates excluded)

<!-- settings:excluded -->
| Candidate | Why it is not a setting | Found at |
|---|---|---|
| `web:AI_ENRICHMENT_FORBIDDEN` | error code returned to the caller | `web/lib/ai/aiEnrichmentPermissions.ts:100` |
| `web:AUDIT_UNAVAILABLE` | error code | `web/lib/documents/external/externalDocumentWrites.ts:203` |
| `web:CONTENT_MISMATCH` | error code | `web/lib/documents/external/externalDocumentWrites.ts:188` |
| `web:FILE_TOO_LARGE` | error code | `web/lib/documents/external/externalDocumentWrites.ts:143` |
| `web:NOT_FOUND` | error code | `web/lib/documents/external/externalDocumentWrites.ts:171` |
| `web:ORG_CONTEXT_MISMATCH` | error code | `web/lib/ai/aiEnrichmentPermissions.ts:75` |
| `web:PRIMARY_REQUIRED` | error code | `web/lib/documents/external/externalDocumentWrites.ts:314` |
| `web:ROOM_IDENTITY_FUTURE_GATE` | name of a code comment marker, not read from the environment | `web/app/api/admin/communications/bindings/route.ts:265` |
| `web:SCREENING_REFUSED` | error code | `web/lib/documents/external/externalDocumentWrites.ts:190` |
| `web:STORAGE_UNAVAILABLE` | error code | `web/lib/documents/external/externalDocumentWrites.ts:207` |
| `web:SUBJECT_NOT_IN_ORG` | error code | `web/lib/documents/external/externalDocumentWrites.ts:313` |
| `web:UNSUPPORTED_FORMAT` | error code | `web/lib/documents/external/externalDocumentWrites.ts:145` |
| `web:VAR_NAME` | placeholder in a doc comment (`env:VAR_NAME`) | `web/lib/communications/twilioAuthToken.ts:9` |
<!-- /settings -->
