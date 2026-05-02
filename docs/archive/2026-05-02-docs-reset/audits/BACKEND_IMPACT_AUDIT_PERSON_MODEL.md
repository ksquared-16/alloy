# Backend Impact Audit — Person Model (Post–Backfill)

**Context:** Supabase canonical human model is in place: `persons`, `customer_persons`, `person_relationships`; bridge columns `contacts.person_id`, `customer_members.person_id`; backfill complete. No UI refactor yet.

**Focus:** Backend/API code paths that must be reviewed before refactoring the people module and drawers. Compatibility-preserving changes only; no redesign of jobs/schedules/opportunities.

---

## 1. Workflow / Event Impact

### 1.1 Workflow event emission (entity_status_changed)

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/lib/admin/emitStatusChangedEvent.ts** | Inserts `workflow_events` with `entity_type`, `entity_id`, `payload` (old/new status_key). No contact/member-specific payload shape. | **Leave for compatibility.** Events keyed by entity_type + entity_id; contact and customer_member remain valid entity types. |
| **web/app/api/admin/contacts/[id]/route.ts** | PATCH contact → emits status_changed with entityType `"contacts"`, entityId = contact id. | **Leave for compatibility.** Workflows that trigger on contact status still get contact id; no change until workflows accept person. |
| **web/app/api/admin/customer-members/[id]/route.ts** | PATCH member → emits status_changed with entityType `"customer_members"`, entityId = member id. | **Leave for compatibility.** Same as contacts. |

### 1.2 Workflow payload construction (booking_confirmed)

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/book-v2/confirm/route.ts** (lines ~1198–1222) | Builds `eventPayload` with `contact: contactRow` (full contact from DB), `customer`, `job`, `opportunity`, `schedule`. Passed to `executeWorkflowRun`. Recipients using `payload.contact` or path like `contact.id` get contact record. | **Add person alongside.** Optionally load `person` by `contactRow.person_id` and add `person: personRow` to eventPayload so new workflow configs can use person; keep `contact` for existing configs. **High-value, low-risk.** |

### 1.3 Workflow payload construction (schedule_created, job_action)

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/admin/subscriptions/[id]/generate-next/route.ts** | `eventPayload` has `job`, `schedule`, `job_id`, `schedule_id`; no contact. Vendor-based send_message uses vendors’ primary_contact_id. | **Leave for compatibility.** No contact in payload; recipient resolution is vendor → contact. |
| **web/app/api/admin/jobs/[id]/route.ts** | job_action payload: `job: jobRow` only (no contact/customer). | **Leave for compatibility.** |

### 1.4 Workflow action: send_message (recipient resolution)

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/lib/workflowRun.ts** — `resolveRecipients` | (1) **Payload path:** `r.path` (e.g. `contact.id`) → resolve to contact_id, push `{ contact_id }`. (2) **contacts_by_vendor:** query `contacts` by `vendor_id` + `vendor_contact_role`; push `contact_id` + phone/email. (3) **vendors_query / job_qualified_vendors:** query vendors, then use `v.primary_contact_id` to build recipient list. All recipients end up as `ResolvedRecipient { contact_id?, to_phone?, to_email? }`. | **Leave for compatibility.** Resolution stays contact-based. Optionally: add a recipient type that resolves by `person_id` (e.g. path `person.id`) and then resolve phone/email from `persons`; keep existing contact_id paths. **Refactor to resolve via person** only when UI/workflows are ready to send to “person” instead of “contact”. |
| **web/lib/workflowRun.ts** — `ensureContactPhoneEmail` | If recipient has `contact_id` but no to_phone/to_email, loads `contacts` by id for phone/email. | **Add person fallback.** If contact has `person_id`, optionally resolve phone/email from `persons` when contact row is missing or for consistency; else keep contact lookup. **Add person_id alongside old field.** |
| **web/lib/workflowRun.ts** — send_message outbox insert | Writes `to_contact_id: filled.contact_id`. | **Leave for compatibility.** Keep to_contact_id. Optionally add `to_person_id` (nullable) when filling from person-based resolution later. |

### 1.5 Workflow action: create_message

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/lib/workflowRun.ts** (create_message branch) | Resolves `pl.contact_id` from payload; inserts into `messages` with `contact_id`, `customer_id`, `opportunity_id`, `job_id`. | **Leave for compatibility.** Table `messages` (if used) remains contact-centric. **High-risk / manual review** if there is a separate `messages` consumer that expects person. |

### 1.6 Workflow action: update_entity

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/lib/workflowRun.ts** — ENTITY_TABLES | Maps `contact`/`contacts` → table `contacts`, `customer`/`customers` → `customers`. No `customer_members` or `person` in map. | **Leave for compatibility.** update_entity can patch contacts/customers by id; no change until workflows need to patch persons. |
| **web/lib/workflowRun.ts** — update_entity execution | Resolves entity_id from payload; updates row in mapped table with `patch`; uses `org_id` from payload. | **Leave for compatibility.** |

### 1.7 Workflow field catalog / vocab

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/lib/workflowVocab.ts** | Exposes `vendor.primary_contact_id` as field. | **Leave for compatibility.** Add `person` fields in a later pass when workflows can reference person. |

---

## 2. Messaging / Notification Impact

### 2.1 Outbox producer (workflow send_message)

| File | Dependency | Recommended migration approach |
|------|------------|--------------------------------|
| **web/lib/workflowRun.ts** | Builds recipients from contact_id (payload path, vendors_query, job_qualified_vendors, contacts_by_vendor). Fills phone/email from `contacts` when missing. Inserts `messages_outbox` with `to_contact_id`, `to_phone`, `to_email`. | Keep current behavior. Optionally: when resolving from contact, set a nullable `to_person_id` from `contacts.person_id` for analytics/consistency; do not change sending logic. |

### 2.2 Outbox consumers (who sends SMS/email?)

| File | Dependency | Recommended migration approach |
|------|------------|--------------------------------|
| **web/app/admin/messages-outbox/page.tsx**, **MessagesOutboxClient.tsx**, **web/app/admin/messaging/** | Read `messages_outbox` and display `to_contact_id`, `to_phone`, `to_email`. No sender logic in repo (likely Twilio/cron elsewhere). | **Leave for compatibility.** Display remains contact_id + phone/email. When a sender service exists, ensure it uses to_phone/to_email (already present); to_contact_id is for reference only. |

### 2.3 Related records: contact messages

| File | Dependency | Recommended migration approach |
|------|------------|--------------------------------|
| **web/app/api/admin/related/[entity]/[id]/route.ts** | For entity=contact: loads `messages_outbox` by `to_contact_id = id`. For entity=customer: loads contact ids from contacts, then messages by `to_contact_id` in that list. | **Leave for compatibility.** Contact id remains correct; backfill did not change contact ids. |

---

## 3. Documents Impact

### 3.1 owner_contact_id usage

| File | What it assumes | Recommended approach |
|------|-----------------|----------------------|
| **web/app/api/admin/related/[entity]/[id]/route.ts** (entity=contact) | Loads documents with `.eq("owner_contact_id", id)` for contact drawer “Documents” tab. | **Leave for compatibility.** Contact id unchanged; documents stay linked to contact. To support person-backed resolution: add optional query by `owner_person_id` when table has that column and merge with owner_contact_id results, or add a view that unions both. Do not remove owner_contact_id. |

### 3.2 Document loaders by entity_type / entity_id

| File | What it assumes | Recommended approach |
|------|-----------------|----------------------|
| **web/app/api/admin/related/[entity]/[id]/route.ts** | customer: documents where `entity_type = 'customer'` and `entity_id = id`. opportunity: `entity_type` in (opportunity, opportunities). job: entity_type in (job, jobs). customer_member: `entity_type = 'customer_member'`, `entity_id = id`. | **Leave for compatibility.** No owner_contact_id here; entity_type/entity_id are stable. Person-backed “documents for this person” can be added later (e.g. documents.owner_person_id or a link table) without changing these loaders. |

### 3.3 Entity presentation (filterKey for documents)

| File | What it assumes | Recommended approach |
|------|-----------------|----------------------|
| **web/lib/entityPresentation.ts** (contacts related) | `filterKey: "owner_contact_id"` for contact’s related “Documents”. | **Leave for compatibility.** Preserves compatibility while introducing person-backed resolution: when adding person drawer/related, add a documents filter by owner_person_id or by person’s contact ids; keep owner_contact_id for contact entity. |

---

## 4. Jobs / Schedules / Opportunities Impact

### 4.1 Job POST validation and insert

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/admin/jobs/route.ts** | Accepts `primary_contact_id`; validates that contact exists, same org, and `contact.customer_id === customer_id`. Inserts job with `primary_contact_id`. | **Leave for compatibility.** Validation and insert stay contact-based. Optional: accept optional `primary_person_id`; if provided, resolve to contact (e.g. first customer_persons contact for that person for this customer) and set primary_contact_id server-side so DB stays consistent. **Add person_id alongside old field** (API contract only; DB can stay contact_id). |

### 4.2 Job PATCH (primary_contact_id)

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/admin/jobs/[id]/route.ts** | ALLOWED_KEYS includes `primary_contact_id`; updates job. No validation that contact belongs to job’s customer. | **Leave for compatibility.** Optional: same as POST — allow primary_person_id in body and resolve to contact before update. |

### 4.3 Opportunity PATCH

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/admin/opportunities/[id]/route.ts** | Can update opportunity; primary_contact_id if in body. | **Leave for compatibility.** Same optional primary_person_id resolution as jobs. |

### 4.4 Entity GET: job, opportunity, schedule, customer (primary contact load)

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/admin/entity/[type]/[id]/route.ts** | **jobs:** loads contact by `job.primary_contact_id` → _contact_name. **opportunities:** loads contact by `opp.primary_contact_id` → _contact_name, _primary_contact_name. **customers:** loads contact by `primary_contact_id` → _primary_contact*, _primary_contact. **schedules:** loads job then contact by job.primary_contact_id → _contact. **vendors:** loads primary_contact_id, vendor_contacts + contacts. **discount_redemptions:** loads contact by redemption.contact_id. | **Leave for compatibility.** All reads are by contact_id; backfill did not change contact ids. Optionally: also load person (by contact.person_id) and expose _primary_person_id / _person_name in response for future UI; keep _contact_name etc. **Add person_id alongside old field** in response only. |

### 4.5 Book-v2 confirm (opportunity/job/schedule creation and integrity)

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/book-v2/confirm/route.ts** | Resolves/creates contact; sets opportunity and job `primary_contact_id` to contactId; discount_redemption.contact_id; integrity check compares job.primary_contact_id and opportunity.primary_contact_id to contactId. | **Leave for compatibility.** Flow remains contact-based; contact_id is still the source of truth for booking. Person is already populated via backfill; no code change required for confirm. |

### 4.6 Subscription generate-next

| File | What it assumes | Recommended treatment |
|------|-----------------|------------------------|
| **web/app/api/admin/subscriptions/[id]/generate-next/route.ts** | Reads `customer_subscriptions.primary_contact_id`; does not pass it to workflow payload. Creates schedule; workflow payload has job + schedule only. | **Leave for compatibility.** No change needed. |

---

## 5. Search / Related Records / Entity Drawer Loaders

### 5.1 Related records API (contact, customer, vendor, customer_member)

| File | What it assumes | Update first vs later |
|------|-----------------|------------------------|
| **web/app/api/admin/related/[entity]/[id]/route.ts** | **contact:** linkedCustomer/linkedVendor from contact row; opportunities/jobs/subs by primary_contact_id; customer_member_contacts, vendor_contacts, messages_outbox, documents (owner_contact_id), discount_redemptions by contact id. **customer:** contacts by customer_id; members by customer_id; subs, jobs, opportunities, etc.; _primary_contact_id. **vendor:** vendor_contacts then contacts by contact_id; jobs by assigned_vendor_id. **customer_member:** customer_member_contacts (contact_id, contact join), documents by entity_type/entity_id. | **Later.** Keep as-is for compatibility. When building “person” drawer/related, add new entity=person branch that loads customer_persons, person_relationships, and optionally related opportunities/jobs via contact_ids derived from person (person → contacts → existing queries). |

### 5.2 Entity GET (drawer single-record load)

| File | What it assumes | Update first vs later |
|------|-----------------|------------------------|
| **web/app/api/admin/entity/[type]/[id]/route.ts** | type=contacts, customers, customer_members, jobs, opportunities, schedules, vendors, discount_redemptions: all load contact or member by id or by primary_contact_id; contact/member rows and joins. | **Later.** No change before UI refactor. When adding person drawer: add type=persons (or person) and load from persons + customer_persons + optional contact/member for compatibility labels. |

### 5.3 Contact options (job primary contact dropdown)

| File | What it assumes | Update first vs later |
|------|-----------------|------------------------|
| **web/app/api/admin/contact-options/route.ts** | GET: customer_id required; returns contacts for that customer (id, label). Used for job primary contact selector. | **Later.** Keep contact-based list. When UI has “person” picker, add e.g. person-options by customer_id (from customer_persons) returning person id + label; job form can still submit primary_contact_id (resolved from selected person if needed). |

### 5.4 Entity presentation (link targets, related modules, filter keys)

| File | What it assumes | Update first vs later |
|------|-----------------|------------------------|
| **web/lib/entityPresentation.ts** | primary_contact_id linkTarget entityType "contacts"; filterKey primary_contact_id for customer/vendor/opportunities/jobs/schedules; owner_contact_id for documents (contact). contact_id linkTarget for discount_redemptions. | **Later.** When person becomes primary in UI, add person-based link targets and related config; keep contact-based config for compatibility. |

### 5.5 Deletion eligibility (contact / member)

| File | What it assumes | Update first vs later |
|------|-----------------|------------------------|
| **web/lib/admin/deletionEligibility.ts** | evalContacts: counts customer_member_contacts by contact_id; blocks delete if links exist. evalCustomerMembers: counts customer_member_contacts by customer_member_id; blocks delete if links exist. | **Leave for compatibility.** Logic remains correct (contact/member links). Optionally: when “delete person” is added, add evaluator that checks customer_persons and person_relationships; do not change contact/member evaluators. |

---

## 6. Recommended Implementation Order (Backend-First, Before UI Refactor)

1. **No breaking changes**
   - Do not remove or change any contact_id / primary_contact_id / customer_member_id usage in DB or API contracts until UI and workflows are ready.

2. **Optional: enrich workflow payload with person (booking_confirmed)**
   - In **book-v2/confirm**: when building eventPayload, load `person` by `contactRow.person_id` and add `person: personRow` to eventPayload. Keeps `contact`; enables future workflow conditions/actions on person.

3. **Optional: outbox and recipient resolution**
   - In **workflowRun.ts** `ensureContactPhoneEmail`: if contact has `person_id`, optionally read phone/email from `persons` as fallback (or always prefer person for phone/email when present). Keeps to_contact_id in outbox.
   - If messages_outbox gets a `to_person_id` column, set it when resolving from contact (contact.person_id) in send_message. No change to sending logic.

4. **Optional: entity GET responses add person hints**
   - In **entity/[type]/[id]** for jobs, opportunities, customers, vendors, schedules: when loading contact by primary_contact_id, also load person (by contact.person_id) and add to response e.g. `_primary_person_id`, `_primary_person_name`. Response shape remains backward compatible.

5. **New backend surface only when needed for UI**
   - Add **related/[entity]/[id]** branch for entity=person (load customer_persons, person_relationships, and optionally related data via person’s contact ids).
   - Add **entity/[type]/[id]** for type=person (load persons row + customer_persons + optional contact/member labels).
   - Add **person-options** or extend contact-options to return person id + label when caller needs person picker; job/opportunity create can still send primary_contact_id (resolved from person on server if needed).

6. **Documents**
   - Leave owner_contact_id as-is. When adding owner_person_id to documents table (if desired), add loader that returns documents for person (by owner_person_id or by contact ids that have person_id = id); keep owner_contact_id loader for contact entity.

7. **Workflow actions**
   - Leave send_message recipient resolution contact-based. Add “resolve by person” path only when workflows are configured to use person; then resolve person → phone/email (and optionally to_contact_id for audit).

8. **Backend (Python) / GHL**
   - Out of scope for this audit; ensure any Supabase contact_id usage (resolve_or_create_contact_and_customer, resolve_contact_id_from_ghl, etc.) continues to work; backfill did not change contact ids, so no change required for compatibility.

---

**Summary:** All current paths can **stay as-is for compatibility**. Recommended backend work before UI refactor is **additive only**: optional person in workflow payload, optional person in entity GET responses, optional to_person_id in outbox, and when ready new person-related API branches (related, entity, options). No removal of contact_id or primary_contact_id until UI and workflows are migrated.
