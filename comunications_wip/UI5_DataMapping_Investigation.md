# UI-5 — Data Mapping Investigation (Family Communication Workspace)

**Status:** investigation + documentation only. No schema/migration/seed/backend work. Findings are grounded in the actual staging schema (`20260329165048_remote_schema.sql`), the comms_v2 migrations, and existing resolvers in `web/lib/communications`.

## TL;DR

There is **no first-class "family" or "child" table.** The de-facto family anchor is **`customers`** (the household/account); contacts hang off it via **`customer_persons`** (role_type + is_primary); children are **persons** linked by **`person_relationships`** and/or represented by **enrollment `opportunities`**. Consent already exists per person in **`communication_preferences`**. Communication is stored as **`communication_threads`** keyed to a single entity (customer / person / opportunity) — so a family spans *multiple* threads and the workspace must **aggregate**. The send path is **single-recipient per call** today, though the recipient table and `buildSendPayloads` already support fan-out.

---

## Family — what is the canonical anchor?

**Answer: `customers`** (household/account). Columns: `id, name, customer_type, status, primary_contact_id, location?, metadata, org_id`. In childcare a "family" = a customer.

- Communication threads are seen keying `primary_entity_type` = **`customer`** and **`person`** (`inboxThreadsService.ts:817`, `threads/route.ts:153`), and opportunities elsewhere — so "customer" is the closest existing family anchor.
- **Lead vs Person vs Opportunity:** a Lead is an early `opportunity`/`person`; once it's a household it's a `customer`. `consentGate` needs `lifecycleStage` (lead/enrolled) — **not present on customer/thread**; would be derived from `customers.status` or the enrollment opportunity stage.

## Children — how do we retrieve `children[]`?

**No `children` table.** Two candidate sources (decision needed):

1. **Persons via `person_relationships`** — `from_person_id → to_person_id`, `relationship_type` (e.g. parent/child/guardian), `is_primary`. A child is a `persons` row reachable from a family contact by a child relationship.
2. **Enrollment `opportunities`** — childcare typically models each child's enrollment as an `opportunity` under `customer_id` (has `location_id`, `pipeline_stage_id`, `metadata`). Child name may live in opportunity `metadata`/`title` or a linked person.

There is **no direct customer→children join**; it must be resolved through `person_relationships` and/or `opportunities`. (Today's fixture `children` string is display-only.)

## Contacts — how do we retrieve `contacts[]` (Mom / Dad / Guardian / Emergency)?

**Answer: `customer_persons`** (+ `opportunity_persons` for an enrollment). Columns: `customer_id, person_id, role_type, is_primary`. Observed `role_type` vocabulary (from tests/components): **`parent`, `guardian`, `emergency`, `primary` / `primary_contact`**. Person details (`first_name, last_name, full_name, email, phone`) come from `persons`.

**Existing resolvers already do most of this:**
- `lib/communications/drawerEmailRecipients.ts` → `DrawerEmailRecipientRow { person_id, email, phone, display_name }`, aggregating `opportunity_persons` + `customer_persons` (with `role_type`, `is_primary`) + primary person/contact. Variants for opportunity / job / person.
- `resolveDrawerHouseholdContacts` (per tests) resolves household contacts with `role_type` primary/guardian/emergency/parent.
- Route: `GET /api/admin/communications/drawer-recipients?entity_type=opportunities|jobs|persons`.

**Gap:** these are scoped per opportunity/person/job, **not customer/family-level**, and `drawer-recipients` deliberately omits child-as-recipient. A **customer-scoped contact roster** resolver is the missing piece.

## Consent — how do we resolve email / sms / marketing per contact?

**Answer: `communication_preferences`** — `person_id, category, state(opted_in|opted_out|unset), source, method`, unique per `(org_id, person_id, category)`. Categories: `email_marketing, email_transactional, sms_marketing, sms_transactional, emergency`.

- Decision logic: `consentGate.evaluateConsent({ category, lifecycleStage, state, promotionalOverride })` → `{ allowed, reason, effectiveClass }`; already enforced in the send path via `enforceConsentForSend` (`executeCommunicationsSend.ts:114`).
- Per-contact, per-channel matrix = join `communication_preferences` by `person_id` × category, then run `evaluateConsent`. **Gap:** no resolver/endpoint composes this into `consentByContactChannel` for the workspace.

## Threads — how do current records map to the workspace? Aggregate or single?

**Answer: aggregate.** `communication_threads` is keyed to **one** `primary_entity_type/primary_entity_id` (customer | person | opportunity), unique per `(org, entity_type, entity_id, channel, recipient_key)`. comms_v2 added assignment/SLA/attention to it. Messages live in `communication_messages` (thread_id, direction, channel, body, receipts), per-recipient receipts in `communication_message_recipients`.

So a single family produces **multiple threads** (the customer thread, each contact's person thread, each enrollment opportunity thread). The Family Communication Workspace must **union threads belonging to the family** (customer + its persons + its opportunities) and present them as the conversation list. **Gaps:** (a) no family→threads aggregation exists; (b) `communication_threads` has **no subject/topic** field — the UI-4G thread titles need a source (derive from first message, metadata, or add display logic — not schema).

## Composer — can one message target Mom only / Dad only / Mom + Dad?

**Data layer: yes.** `communication_message_recipients` supports multiple recipients per message with `recipient_role` (to/cc/bcc) + `person_id`; `composerModel.buildSendPayloads` fans out **one payload per recipient**. Candidate recipients (with email/phone + role) come from `drawerEmailRecipients`.

**Current send path: single-recipient.** `executeCommunicationsSend` takes one `recipient_person_id` per call and enforces consent for that person. So "Mom + Dad" today = **two sends** (or a new multi-recipient send path that loops `buildSendPayloads`). The UI selection model (`selectedContactIds[]`) maps cleanly to either.

---

## Proposed `FamilyCommunicationWorkspaceVM` (source-annotated)

```ts
interface FamilyCommunicationWorkspaceVM {
  family: {                         // ← customers
    id: string; label: string;      // customers.id / customers.name
    program: string | null;         // from enrollment opportunity / metadata
    location: { id: string | null; label: string | null };
    stage: string | null;           // opportunity pipeline_stage label
    owner: { userId: string | null; label: string | null }; // thread.assigned_user_id
    lifecycleStage: "lead" | "enrolled" | "unknown"; // DERIVED (customers.status / opp stage)
  };
  children: Array<{                 // ← person_relationships(child) OR opportunities
    id: string; name: string; program: string | null; opportunityId: string | null;
  }>;
  contacts: Array<{                 // ← customer_persons (+opportunity_persons), persons
    id: string; displayName: string;
    role: "parent" | "guardian" | "emergency" | "primary" | string | null; // role_type
    email: string | null; phone: string | null; isPrimary: boolean;        // persons + is_primary
  }>;
  selectedContactIds: string[];     // composer targeting (Mom / Dad / both)
  consentByContactChannel: Record<string, {   // ← communication_preferences + evaluateConsent
    email: { marketing: ConsentState; transactional: ConsentState; canSendTransactional: boolean; canSendMarketing: boolean; hasAddress: boolean; providerBound: boolean; available: boolean };
    sms:   { marketing: ConsentState; transactional: ConsentState; canSendTransactional: boolean; canSendMarketing: boolean; hasAddress: boolean; providerBound: boolean; available: boolean };
  }>;
  threads: Array<{                  // ← UNION of communication_threads for the family
    id: string; subject: string | null;  // subject DERIVED (no column today)
    channel: "email" | "sms" | "in_app";
    messageCount: number; lastActivityAt: string | null; unread: number;
    primaryEntity: { type: "customer" | "person" | "opportunity"; id: string };
    childId: string | null; opportunityId: string | null;  // context tags (req: child/opp)
  }>;
  selectedThreadId: string | null;
  timelineEvents: Array<{           // ← communication_messages (+ message_recipients receipts)
    id: string; threadId: string; kind: string; direction: "inbound" | "outbound" | "internal";
    channel: string | null; body: string | null; createdAt: string | null;
    deliveredAt: string | null; openedAt: string | null; repliedAt: string | null; // message_recipients
    contactId: string | null; actorLabel: string | null;
  }>;
  health: CommunicationHealthVM;    // ← computeCommunicationHealth (aggregate across threads)
  composerDraft: {                  // ← composerModel.ComposerDraft (+ targeting)
    channel: "email" | "sms" | "note"; recipientContactIds: string[];
    subject: string | null; body: string;
    availableChannels: { email: boolean; sms: boolean; note: boolean; reasons: Record<string,string> };
    consentBlockers: Array<{ contactId: string; channel: string; reason: string }>;
  };
}
```

## Gaps between current backend and the required UI-5 model

| # | Gap | Have today | Needed |
|---|---|---|---|
| 1 | Canonical family object | `customers` + per-entity threads | a family resolver that maps customer → its persons, opportunities, and threads |
| 2 | First-class children | none (persons via `person_relationships` / enrollment `opportunities`) | decide the canonical child source; build `children[]` resolver |
| 3 | Family-level thread aggregation | per-entity `communication_threads` (customer/person/opportunity) | union threads by family + context tags (childId/opportunityId) |
| 4 | Thread subject/topic | no `subject` column on threads | derive (first message / metadata) — display logic, not schema |
| 5 | Family contact roster for comms | per-opportunity/person `drawerEmailRecipients`, `resolveDrawerHouseholdContacts` | customer/family-scoped roster with roles (mom/dad/guardian/emergency) |
| 6 | Per-contact consent matrix | `communication_preferences` + `evaluateConsent` (per send) | resolver → `consentByContactChannel` for the whole roster |
| 7 | `lifecycleStage` for consent | not on customer/thread | derive from `customers.status` / opportunity stage |
| 8 | Multi-recipient send | single `recipient_person_id` per call; `message_recipients` + `buildSendPayloads` support fan-out | multi-target send (loop or new path) for Mom + Dad |
| 9 | Channel availability per contact | provider bindings + per-person email/phone exist separately | compose into `ChannelConsent.available` |

**Recommended UI-5 build order (later, on approval):** family/contacts resolver (customers + customer_persons) → consent matrix → thread aggregation (+derived subject) → timeline receipts → composer targeting/multi-recipient. No schema changes required for 1–7; multi-recipient send (8) reuses existing fan-out.
