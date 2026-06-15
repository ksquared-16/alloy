# Family Communication Workspace — Data Contract (proposed)

**Status:** design only. No implementation. This defines the view-model the workspace will consume, then maps it to what exists today (fixtures + API/models) and what is still missing. It documents *data shape*, not architecture or backend changes.

**Requirements this must support**

1. Real communication messages in the timeline.
2. Contact selection for the composer, based on people related to the family / opportunity / child.
3. Multiple children per family.
4. Consent and channel availability **per contact**.
5. Family-level timeline, with the ability to show child / opportunity context.

---

## 1. Proposed view model — `FamilyCommunicationWorkspaceVM`

```ts
type Id = string;
type ISO = string;                                  // ISO-8601 timestamp
type Channel = "email" | "sms" | "in_app";
type Direction = "inbound" | "outbound" | "internal";
type ConsentState = "opted_in" | "opted_out" | "unset";
type LifecycleStage = "lead" | "enrolled" | "unknown";

interface FamilyCommunicationWorkspaceVM {
  family: FamilyRef;
  children: ChildRef[];                             // req 3 — array, not a string
  contacts: Contact[];                              // req 2 — resolved people
  selectedContactIds: Id[];                         // composer recipient selection
  consentByContactChannel: Record<Id, ContactConsent>; // req 4 — keyed by contact (person) id
  timelineEvents: TimelineEvent[];                  // req 1 + 5 — family-scoped, context-tagged
  health: CommunicationHealthVM;
  composerDraft: ComposerDraftVM;
  scope: WorkspaceScope;                            // req 5 — family default, optional child/opp focus
}

interface FamilyRef {
  id: Id;                       // household / family id (stable anchor)
  label: string;                // "The Rivera Family"
  program: string | null;       // summary program label
  location: { id: Id | null; label: string | null };
  stage: string | null;         // pipeline label (Tour complete, Enrolling…)
  ownerUserId: Id | null;
  ownerLabel: string | null;
  lifecycleStage: LifecycleStage; // drives consent classification (consentGate)
}

interface ChildRef {
  id: Id;
  name: string;
  program: string | null;
  stage: string | null;
  opportunityId: Id | null;     // enrollment opportunity for this child
}

interface Contact {
  id: Id;                       // person_id
  displayName: string;
  role: "primary" | "parent" | "guardian" | "emergency" | string | null;
  email: string | null;         // normalized
  phone: string | null;         // E.164-style
  isPrimary: boolean;
  relations: { type: "family" | "opportunity" | "child"; refId: Id }[]; // why they are a contact
}

interface ContactConsent { email: ChannelConsent; sms: ChannelConsent; }

interface ChannelConsent {
  channel: "email" | "sms";
  hasAddress: boolean;          // recipient has email / phone
  providerBound: boolean;       // org has an email / sms provider binding
  available: boolean;           // resolveAvailableChannels() result
  unavailableReason: string | null;
  marketing: ConsentState;      // pref: email_marketing / sms_marketing
  transactional: ConsentState;  // pref: email_transactional / sms_transactional
  canSendTransactional: boolean;// evaluateConsent()
  canSendMarketing: boolean;    // evaluateConsent() (+ optional promo override)
}

interface TimelineEvent {
  id: Id;
  kind: "email" | "sms" | "call" | "note" | "system" | "announcement" | string;
  direction: Direction;
  channel: Channel | null;
  body: string | null;
  preview: string | null;       // truncated
  createdAt: ISO | null;
  status: string | null;        // queued / sent / delivered / failed
  deliveredAt: ISO | null;
  openedAt: ISO | null;
  repliedAt: ISO | null;
  contactId: Id | null;         // person to/from
  childId: Id | null;           // req 5 — child context
  opportunityId: Id | null;     // req 5 — opportunity context
  threadId: Id | null;          // source thread
  actorLabel: string | null;    // staff name for outbound / notes
}

interface CommunicationHealthVM {
  status: "healthy" | "at_risk" | "unresponsive";
  engagementScore: number;      // 0..100
  responseRate: number | null;  // 0..1
  openRate: number | null;
  lastContactAt: ISO | null;
  unreadCount: number;
  channelPreference: string | null;
}

interface ComposerDraftVM {
  channel: "email" | "sms" | "note";
  recipientContactIds: Id[];           // resolved → addresses at send
  subject: string | null;
  body: string;
  availableChannels: { email: boolean; sms: boolean; note: boolean; reasons: Record<string,string> };
  consentBlockers: { contactId: Id; channel: string; reason: string }[];
  // future: templateId, attachments, bosDraftId
}

interface WorkspaceScope {
  level: "family";
  focusChildId: Id | null;
  focusOpportunityId: Id | null;
}
```

**Requirement → VM field traceability**

| Req | Satisfied by |
|---|---|
| 1 Real messages in timeline | `timelineEvents[]` (from `communication_messages` + receipts) |
| 2 Contact selection from related people | `contacts[]`, `selectedContactIds[]`, `composerDraft.recipientContactIds` |
| 3 Multiple children | `children: ChildRef[]` |
| 4 Consent + channel availability per contact | `consentByContactChannel[contactId]` → `ChannelConsent` |
| 5 Family timeline w/ child/opportunity context | `timelineEvents[].childId/opportunityId/threadId` + `scope.focus*` |

---

## 2. Mapping A — current fixture fields → VM

Source: `web/app/adminV2/communications/fixtures.ts`.

| Fixture field | VM target | Notes / gap |
|---|---|---|
| `FIXTURE_CONVERSATIONS[].family_label` | `family.label` | ok |
| `FIXTURE_CONVERSATIONS[].id` (`fx-…`) | `family.id` (proxy) | actually a conversation/thread id, **not** a household id |
| `.location_id` | `family.location.id` | label missing |
| `.assigned_user_id` | `family.ownerUserId` | label via `FAMILY_DETAILS.owner` |
| `.sla_state / attention_state / assignment_state / unread / last_message_at / channel` | queue + `health` (partial) | queue-level; `unread`→`health.unreadCount`, `last_message_at`→`health.lastContactAt` (proxy) |
| `FIXTURE_FAMILY_DETAILS.children` (string `"Elena & Mateo"`) | `children[]` | **string, not structured** — no per-child id/opportunity/stage |
| `.program / .location / .stage / .owner` | `family.program / location.label / stage / ownerLabel` | ok (display only) |
| `.recipient` (string) | `contacts[0]` | **single, unstructured** — no person_id, role, multiple contacts |
| `.consent {email,sms,marketing}` (family-level) | `consentByContactChannel` | **family-level, not per-contact**; no transactional vs marketing split per channel; no availability |
| `FIXTURE_MESSAGES[]` `{id,direction,channel,body,created_at,opened_at?,replied_at?,kind}` | `timelineEvents[]` | maps well; missing `status, deliveredAt, contactId, childId, opportunityId, threadId, actorLabel, preview` |

---

## 3. Mapping B — current API / model fields → VM

| Source (route / model) | Real fields | VM target |
|---|---|---|
| `GET …/conversations` → `ConversationSummary` | id, attention_state, channel, assignment_state, assigned_user_id, location_id, sla_state, last_message_at, unread, family_label | `family.*` (partial) + queue; no children/contacts/lifecycle |
| `GET …/threads/[id]/messages` → `communication_messages` | id, created_at, direction, channel, status, body, from_address, to_address, provider, sent_at, provider_message_id, metadata, delivered_at | `timelineEvents[]` (body, channel, direction, createdAt, status, deliveredAt) |
| `communication_message_recipients` | person_id, address, recipient_role(to/cc/bcc), status, delivered_at, **opened_at, clicked_at, replied_at** | `timelineEvents[].contactId/openedAt/repliedAt/status` (per-recipient receipts — **needs join**) |
| `communication_delivery_events` | message_id, event_type, provider, occurred_at, payload | receipt provenance for `status/deliveredAt/openedAt` |
| `communication_preferences` | person_id, **category** (email/sms × marketing/transactional, emergency), **state** (opted_in/out/unset), source, method | `consentByContactChannel[personId].{marketing,transactional}` |
| `consentGate.evaluateConsent({category, lifecycleStage, state, promotionalOverride})` → {allowed, reason, effectiveClass} | — | `ChannelConsent.canSend{Transactional,Marketing}` + `composerDraft.consentBlockers[]` |
| `composerModel.resolveAvailableChannels({hasEmailBinding, hasSmsBinding, recipientHasEmail, recipientHasPhone})` → ChannelAvailability | — | `ChannelConsent.available/unavailableReason`, `composerDraft.availableChannels` |
| `composerModel.ComposerDraft` | channel, subject?, body, recipients?[] | `composerDraft.{channel,subject,body}` (+ `recipientContactIds`→addresses via `buildSendPayloads`) |
| `GET …/drawer-recipients` → `DrawerEmailRecipientRow` | person_id, email, phone, display_name (from opportunity_persons / customer_persons / primary_person_id) | `contacts[]` (per-entity; **not** family-aggregated; **excludes** child-guardian linkage by design) |
| `communicationHealth.computeCommunicationHealth` → CommunicationHealth | lastContactAt, lastReadAt, unreadCount, responseRate, engagementScore, channelPreference, consentStatus | `health.*` (+ derived `status` label, `openRate`) |
| `recordTabModel.buildRecordCommunicationsModel` → RecordCommunicationsModel | timeline[{id,kind,direction,created_at,preview}], lastContactAt, unread, consentDisplay | record-scoped analogue of `timelineEvents` + `health` (reusable for family scope) |
| `communication_provider_bindings` (bindings route) | org email/sms provider bindings | `ChannelConsent.providerBound` |

---

## 4. Mapping C — fields the VM needs that **no current source provides**

These are data gaps to fill before wiring (call-outs, not an architecture proposal):

1. **Family/household identity + lifecycle.** Today the unit is a *thread* tied to one `primary_entity` (opportunity/person/child). The VM is **family-scoped** and spans multiple threads/entities/children. Need a household/family id and `lifecycleStage` (lead/enrolled) — `lifecycleStage` is required by `consentGate` but is absent from `ConversationSummary`.
2. **Structured `children[]`.** Fixtures carry a single display string; need real child records (id, program, stage) and each child's enrollment `opportunityId`.
3. **Family-aggregated `contacts[]`.** `drawer-recipients` resolves per opportunity/person/job and deliberately omits child-guardian anchors. Need a family-level union across opportunity_persons + customer_persons + child guardians + primary contacts, with `role` and `relations[]` provenance.
4. **Per-contact × per-channel consent matrix.** `communication_preferences` exists (person × category × state) but no endpoint composes it into `consentByContactChannel`. Need a resolver joining preferences + `evaluateConsent` for the family's contacts.
5. **Per-contact channel availability.** Compose `hasEmail/PhoneBinding` (org `communication_provider_bindings`) with each contact's email/phone presence → `ChannelConsent.available`. No single source returns this today.
6. **Timeline receipts + context tags.** Messages route returns message rows but not per-recipient `openedAt/repliedAt` (those live in `communication_message_recipients`) and not `childId/opportunityId/threadId` context. Family timeline needs to union messages across the family's threads and tag each event with its source thread's `primary_entity` (child/opportunity) for req 5.
7. **Actor/staff labels** for outbound + notes (sender display); notes source (internal notes table) to feed `kind:"note"` events.
8. **Family-level health.** `health` route is per `thread_id`; family health needs aggregation across the family's threads/children.

---

## 5. Open questions to confirm before UI-5

- What is the canonical **family/household** anchor (households table? primary opportunity? person group?) and how is `lifecycleStage` derived for it?
- Are child↔guardian and family↔contact relationships already modeled (tables/joins), or is a resolver needed?
- Should the family timeline union **all** threads for the family's people+children, or only the selected child/opportunity in focus?
- Composer multi-recipient: send one message to multiple selected contacts, or per-contact sends? (`buildSendPayloads` already fans out per recipient.)

No code until this contract + the open questions are settled.
