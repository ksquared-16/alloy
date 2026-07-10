# Processing Identity Resolution — Source-to-Mutation Inventory

**Baseline:** `origin/staging` @ `65afc8527`. Read-only. **[C]** = confirmed by file read; **[I]** = inferred.

**Scope note:** Alloy has two runtimes — the Next.js app (`web/`) and a Python backend (`backend/`, legacy leads + inbound SMS + GHL). Both are inventoried. `scripts/` seeds are excluded except where noted.

**Central finding:** the **Processing Case is opened in parallel to identity writes, never as a gate.** For every case-opening source, business records are already written (or unaffected) by the time `openProcessingCaseFromSource` runs; the case merely references the source by `kind+id`. No inbound source commits identity *through* a Processing Case approval step today.

---

## 1. Source-to-mutation matrix

| # | Source / path | Entry point | Server handler (file:symbol) | Processing Case? | Matching | Direct identity writes (tables) | Downstream | Idempotency | Status | Dup risk |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Public form **draft create** | `app/forms/embed/[token]` | `app/api/public/forms/[token]/submissions/route.ts:POST` | No | derives launch FKs from link metadata | `form_submissions` (draft) — no identity | — | packet returns existing draft; origin-allowlist | active | none |
| 2 | Public form **submit** (lead_capture) | embed client | `app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts:POST` → `lib/forms/intake/applyFormIntakeSafe.ts` | **Yes, marker-gated** (`maybeOpenProcessingCaseFromFormSubmissionSafe`/`…PacketCompletionSafe`) | email→phone, ambiguity→no-write, name-mismatch→review | `persons, customers, customer_persons, opportunities, opportunity_persons, customer_members` | intake lifecycle events; packet projections; parallel case | opportunity dedup (person+child+location); no cross-resubmit key | active | moderate |
| 3 | Public **staff** form submit | operator forms UI | `app/api/admin/forms/submissions/[submissionId]/submit/route.ts:POST` | **Yes, marker-gated** | none (no lead-capture) | `form_submissions` only | case | idempotent case | active | none |
| 4 | Public **tour booking** | `app/tour-booking/[token]` | `app/api/public/tour-booking/[token]/book/route.ts` → `tourBookingService.createTourBooking` | No | operates on existing opportunity's person | `tour_bookings` (+ schedule) — no new identity | booking event | rate-limited, token+location | active | low |
| 5 | **Gutters lead** | `components/gutters/GutterLeadForm.tsx` | `app/api/leads/gutters/route.ts:POST` | No | contact by email→phone | **`contacts` + `opportunities`** (contact-first) | `gutter_lead_submitted` | contact deduped; **opportunity not idempotent** | active — **LEGACY_COMPAT** | **high** |
| 6 | **Vendor application** | vendor form | `app/api/vendor-application/route.ts:POST` → `publicVendorApplication.submitPublicVendorApplication` | No | `findOrCreatePersonInOrgWithMeta`; contact 23505 recovery | **`persons, vendors, vendor_verticals, contacts, documents`** | `vendor_application_submitted`; full rollback | person deduped; **vendor not idempotent** | active | moderate |
| 7 | Marketing demo request | contact page | `app/api/marketing/demo-request/route.ts:POST` | No | n/a | **none** (Resend email only) | email | n/a | active | none |
| 8 | **book-v2 quote-start** | `app/book-v2/BookV2Client.tsx` | `app/api/book-v2/quote-start/route.ts:POST` | No | `findOrCreatePersonInOrg` (**first-match, no ambiguity guard**) | `persons, opportunities, locations, person_locations, field_values` | `quote_started` + workflows | person dedup (first); opportunity 10-min reuse window | active | moderate |
| 9 | book-v2 specialty-quote-start | specialty client | `app/api/book-v2/specialty-quote-start/route.ts:POST` | No | same as #8 | `persons, opportunities, locations, documents` | quote events | same as #8 | active | moderate |
| 10 | book-v2 ensure-customer | BookV2Client | `app/api/book-v2/ensure-customer/route.ts` → `ensureCustomerForPersonNative` | No | existing person id | `customers, customer_persons` | `customer_ensured` | idempotent | active | low |
| 11 | **book-v2 confirm** | BookV2 / PaymentClient | `app/api/book-v2/confirm/route.ts:POST` | No | quote-id reuse + `identityRowMatchesSubmission` | `persons, customers, customer_persons, opportunities, jobs, schedules, customer_subscriptions, customer_payment_methods, discount_redemptions` | `booking_confirmed` + workflows | **idempotent on `booking_attempt_id`**; promo dedup | active | low |
| 12 | **backend /leads/cleaning** | `app/book` (v1), `app/services/cleaning/quote` | `backend/app/routes/leads.py:submit_cleaning_lead` | No | GHL-map→email→phone | **`contacts, opportunities, external_mappings`** + GHL | GHL sync, tags, photos | contact deduped; `find_or_create_opportunity` (mapping+recent window) | active — **LEGACY/transitional** | moderate |
| 13 | backend /leads/pros | pros form | `backend/app/routes/leads.py:submit_pros_application` | No | GHL dedupe | **none in Supabase** (GHL only) | GHL tags | GHL upsert | active | none (external) |
| 14 | **Manual Create Lead** | `CreateLeadCommandSurface.tsx` | `app/api/admin/actions/execute/route.ts:POST` → `createLeadAction` → `entryLifecycleActions.executeCreateLeadAction` (+`executeCreateLeadHouseholdCommit`) | No | `findOrCreatePersonInOrgWithMeta` + intake-resolver review guards (exact+review_required → 400) | **`persons, customers, customer_persons, contacts, opportunities, opportunity_persons, customer_members, process_instances, locations, field_values`** | status-changed event; Enrollment process instance per child | person/link deduped (23505-tolerant); **opportunity not idempotent** | active (admin) | **high** |
| 15 | Add family/related person | person drawer | `lib/admin/person/upsertAndLinkPersonForAdmin.ts` (`executeRelationshipAction`) | No | email/phone dedup + name fallback | `persons, customer_persons, opportunity_persons` | — | dedup + 23505-tolerant | active | low |
| 16 | Admin CRUD (persons) | admin drawer | `app/api/admin/persons/route.ts:POST` | No | **blind insert, no dedup** | `persons` | — | **none** | active (admin) | high if scripted |
| 17 | Admin CRUD (customer-members) | admin drawer | `app/api/admin/customer-members/route.ts:POST/[id]` | No | `findOrCreateChildPersonInOrg` then blind member insert | `customer_members` (+ hard delete `[id]:192`) | — | member not idempotent | active (admin) | moderate |
| 18 | **Admin document upload** | POS intake / drawer | `app/api/admin/documents/upload/route.ts:POST` → `maybeOpenProcessingCaseFromNonFormSourceSafe` | **Yes, opt-in** (`open_processing_case=true`) | classification/extraction = **proposals only** | `documents` + case metadata — **no identity writes** | `document_uploaded`; classify/extract previews | idempotent case | active (admin) | none (identity) |
| 19 | Public packet completion | embed | `…/submit` → `maybeOpenProcessingCaseFromPacketCompletionSafe` | **Yes, marker-gated** | none at ingest | `form_packet_session*`; generated `documents` on approve | packet projections | idempotent case | active | none |
| 20 | **Inbound SMS** | Twilio Messaging Service | `backend/app/routes/sms_inbound.py:_inbound_guarded` → `services/communication_inbound.py:persist_inbound_communication_sms` | No | person by phone: 1→person, 0→`communications_unknown` surrogate, N→ambiguous surrogate; **never creates a person** | `communication_threads, communication_messages, public.messages` — **no identity** | `message_received` event | **weak — no `external_sid`/MessageSid dedup** | active (gated: `COMMUNICATIONS_SMS_INBOUND_ENABLED`, X-Twilio-Signature) | dup messages on retry |
| 21 | Twilio SMS **status** callback | Twilio | `app/api/webhooks/twilio/sms-status/route.ts` (+`/[binding_id]`) → `handleTwilioSmsStatus` | No | n/a | none (patches outbound delivery) | delivery event | idempotent | active | none |
| 22 | Resend email lifecycle | Resend | `app/api/webhooks/resend/route.ts:POST` → `applyOutboundProviderDeliveryPatch` | No | n/a (match outbound by provider id) | none | delivery event | idempotent | active | none |
| 23 | GHL appointment webhook | GoHighLevel | `backend/app/routes/webhooks.py:webhook_appointment_created` | No | GHL contact dedupe | **none in Supabase** (GHL only) | GHL tagging | reconciliation | active | none (external) |
| 24 | Action magic-links | booking/reschedule emails | `app/api/action/[token]/consume`, `action-links/consume-reschedule|consume-accept-job` | No | n/a | existing `schedules/jobs/action_links` — no identity | job/schedule events | `consumed_at` single-use | active | none |
| 25 | CSV / bulk import | — | **none exists** | — | — | — | — | — | absent | — |
| 26 | `applyFormLeadCaptureIntake` | — | `lib/forms/intake/applyFormLeadCaptureIntake.ts` | No | email/phone | (would write persons/customers/opportunities) | — | — | **dead / superseded** (no route caller) | n/a |

---

## 2. Direct-write violation inventory (classified)

| Path | Classification | Rationale |
|---|---|---|
| #5 gutters lead | **Must retire** | contact-first, LEGACY_COMPAT header, non-idempotent opportunity; superseded by person-first quote-start |
| #12 backend `submit_cleaning_lead` | **Must retire** | contact-first + GHL; header: keep "until redirected to /book-v2" |
| #26 `applyFormLeadCaptureIntake.ts` | **Dead code** | no live caller (tests + a type import only); retire after person-uniqueness decision |
| #2 `applyFormIntakeSafe` | **Must wrap** | writes full identity graph before the parallel case; the central pre-resolution commit; **first shadow target (C1)**; reviewed-commit cutover (D5) follows the Manual Create Lead cutover (D4) per Decision I |
| #8/#9 book-v2 quote-start | **Must wrap** | `findOrCreatePersonInOrg` first-match, no ambiguity guard → silent mis-attach on shared email/phone; must share the ambiguity-aware matcher |
| #14 manual Create Lead | **Legitimate operational** (add idempotency) | operator-initiated household creation; opportunity lacks idempotency key |
| #6 vendor application | **Legitimate operational** | application funnel with own `vendors.status='pending'` gate; add idempotency |
| #11 book-v2 confirm | **Legitimate operational** | well-guarded by `booking_attempt_id` + identity-match; leave in place, share resolver |
| #16 admin persons POST | **Must wrap if bulk caller exists** | blind insert, no dedup/onConflict |
| #20 inbound SMS | **Legitimate (comms); fix idempotency** | never writes identity; add `external_sid` dedup |
| `20260423143000_opportunity_identity_seed_childcare_org.sql`, `web/scripts/seed*.ts` | **Migration-only (acceptable)** | idempotent (`WHERE NOT EXISTS` / `ON CONFLICT` / `seed_key`); tsx CLI, not route-reachable |

**Hard-delete authority (prohibited-action note):** `lib/admin/opportunity/deleteOpportunityLead.ts` (via `app/api/admin/opportunities/[id]/delete/route.ts`) raw-cascade hard-deletes `opportunity_customer_members`, `opportunity_persons`, `placement_candidates`, `opportunities`, and — guarded by a reachability graph — `customer_members`, `customer_persons`, `customers`, `contacts`, `persons`, and their `field_values`. This is the only path that permanently deletes identity data; it is entirely raw and must not be reachable from Processing commit. **[C]**

---

## 3. Record mutation authority map

| Record | Physical model | Creation paths | Update paths | Intended authority | Actual authority | Problems |
|---|---|---|---|---|---|---|
| **Person** | `persons` (canonical) | `findOrCreatePersonInOrgWithMeta`; `findOrCreateChildPersonInOrg`; `upsertAndLinkPersonForAdmin`; `executeRelationshipAction`; `executeCreateLeadHouseholdCommit`; `applyFormIntakeSafe`; `app/api/admin/persons/route.ts`; `approveHandoff` | `persons/[id]` PATCH (+archive); DOB backfill; vendor app | `person_status` domain declared, **no handler** | ~8 raw find-or-create + REST PATCH | no merge/dedup command; no DELETE route (hard-delete via lead purge only) |
| **Parent/Guardian** | `customer_persons` link (`role_type`, `is_primary`) | `ensureCustomerPersonsPrimaryLink`; `upsertAndLinkPersonForAdmin`; `executeCreateLeadHouseholdCommit`; `ensureCustomerPersonRoleLink` | primary demote/promote; `setHouseholdPrimaryContact` | none | ~4 raw helpers (23505-tolerant) | guardian is a link row, not an entity |
| **Child** | `customer_members` (`person_id?`, `dob`) | `customer-members/route.ts`; `applyIntakeChildToOpportunity`; `executeRelationshipAction`; `createLeadChildOcmPersistence` | `customer-members/[id]` PATCH | none | REST + 3 lib inserts | member inserts largely blind; hard DELETE at `[id]:192` |
| **Customer / Family / Household** | `customers` (single table); membership = `customer_persons` + `customer_members`; **no household table** | `ensureCustomerForPersonNative`; `bookingResolver` (legacy); via create-lead | `customers/[id]`; confirm vertical backfill; payment denorm | none | raw find-or-create (reuse via `customer_persons`) | "household" is a join, not a row |
| **Lead / Case** | `opportunities` (`status_key`) | book-v2 (`quote-start/confirm/specialty`); `insertOpportunityWithPersonFirst`; `applyFormIntakeSafe`; `executeCreateLeadAction` | `status_key`: RPC `execute_lead_status_mutation` **AND** raw `updateOpportunityStatusWithEvent` + ~30 raw sites | `lead_status` domain (the one wired place) | **split** — runtime RPC + 3 raw writers | creation never touches runtime; 3 status authorities |
| **Enrollment (per-child)** | `opportunity_customer_members` (`outcome_status_key`) | `opportunity-customer-members/route.ts`; `applyEnrollmentDecisionSplit`; `applyIntakeChildToOpportunity`; `executeRelationshipAction` | RPC `execute_enrollment_status_mutation` **AND** raw `updateOpportunityCustomerMemberLifecycleStatus` (~10 sites) | `enrollment_status` domain | mostly raw helper | **dual substrate** — create-lead now writes `process_instances`, others write OCM |
| **Contact + roles** | `contacts` (legacy) + `customer_member_contacts` | `contacts/route.ts`; `bookingResolver` (legacy); vendor app; `ensureContactForPerson` | `contacts/[id]` (+archive/unarchive); person_id backfill | none | raw REST + booking + intake | LEGACY_COMPAT; dual person representation |
| **Address** | `locations` (household) / `contacts.*` (inline) / `field_values` (person) / `person_locations` | `patchHouseholdCustomerAddress`; `quoteStartLocationHelpers` | location PATCH; person_locations | none | 3 physical stores | **no single address authority** |
| **Comm preferences** | `field_values` (dynamic; `sms_opt_in`, etc.) | via person PATCH (`saveLayoutRuntimePersonNativeEdits`) | person PATCH routes non-native keys to `field_values` | none | raw field_values | mislabeled "native" in code; also `communication_preferences` table exists (person-first, no FK) |
| **Documents / attachments** | `documents` (polymorphic `entity_type/id`) | upload; specialty-quote-start; vendor app; generated PDFs | `documents/[id]`; `pos/documents/[id]` | none | raw REST + intake/pdf | no FK to identity; hard-deletes exist |

---

## 4. Sources already routing through Processing / `lib/intake`

**Open a Processing Case** (only these): public form submit (#2/#3), packet completion (#19), admin document upload (#18, opt-in). Source kinds `upload`, `email_attachment`, `import`, `recreated_document` are **type-allowed but unwired** — `processingImportIntent.ts` is metadata vocabulary; no importer emits an `import`-kind case at runtime. **[C]**

**Use `lib/intake` resolver** (proposals only, no commit): manual Create Lead (#14) via `parseCreateLeadIntakeText` → `matchIdentity` → `buildProposals` → `applyResolutionToCommitSelection`; and the read-only `POST /api/admin/intake/record-resolution` route (`resolveIntakeRecordResolution`, writes nothing). **[C]**

**Crucial:** even for the four case-opening sources, the case does **not gate** identity writes. `applyFormIntakeSafe` has written `persons/customers/opportunities` before the case opens; the case only references the submission.

---

## 5. Idempotency posture

| Present | Absent (gaps) |
|---|---|
| `processing_case_sources.uq_pcs_primary_source_once` (org+kind+source, primary) | `form_submissions` — no submission idempotency key |
| `messages_outbox.dedupe_key` (global partial) | `workflow_events` — no event-id |
| `form_public_links.token_hash`; `document_versions(document_id, version_number)`; `placement_candidates.seed_key` | `persons` / `customer_members` — no external_id uniqueness; opportunity/vendor rows lack idempotency keys |
| book-v2 confirm `booking_attempt_id`; opportunity dedup (`metadata.idempotency_key`); 10-min quote reuse | inbound SMS — no `external_sid`/MessageSid dedup (Twilio retry double-inserts) |
| communications backfill idempotent (`legacy_binding_id`) | Create Lead / gutters / vendor — resubmit duplicates the opportunity/vendor |

---

## 6. CONFIRMED vs INFERRED

- **CONFIRMED:** all webhook routes; public form draft+submit incl. `applyFormIntakeSafe`; tour-booking; gutters; vendor; demo-request; book-v2 quote-start/specialty/ensure-customer/confirm; backend `sms_inbound`/`leads.py`/`webhooks.py`; admin documents upload; POS case openers + types; `findOrCreatePersonInOrg`; manual Create Lead chain; record authority map; RLS predicates; DB constraints; the resolver seam stub.
- **INFERRED:** the exact full table set of book-v2 confirm beyond the read insert sites; that `resolveInboundIdentity` (web) is unwired (zero non-self callers found, but may be reserved for a future web-side inbound migration — the live inbound path is the Python `resolve_inbound_sms_anchor_with_metadata`); the org-scope impact of `admin_ops_full_access` (predicate confirmed; blast radius depends on `app_users` membership policy).
