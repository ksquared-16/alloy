# UI-5A Implementation Plan — Family Roster + Recipient Eligibility

**Source of truth:** UI-5 audit (customers anchor, `customer_members` children, `customer_persons` → `persons` recipients).  
**Constraint:** No locked UI changes, no send logic, no consent enforcement, no schema changes.

---

## 1. Objective

Deliver a **server-side `FamilyCommunicationWorkspaceVM` foundation** that the locked Command Center can consume later via flag-gated fetch — without altering layout, components, or fixture mode behavior in this phase.

**UI-5A delivers:**

| In scope | Out of scope (5B/5C) |
|----------|----------------------|
| `family`, `children[]` | `timelineEvents[]`, real `messages[]` |
| `recipientGroups` (Primary / Secondary) | Thread aggregation |
| `eligibleRecipients` / `disabledRecipients` | Send / multi-recipient |
| Channel eligibility (email/phone + bindings) | Consent gate enforcement |
| `composerDraft.availableChannels` | Health computation |
| `scope`, default `selectedRecipients` | UI wiring (optional thin hook only) |

---

## 2. Exact files to create / edit

### Create (new)

| File | Purpose |
|------|---------|
| `web/lib/communications/v2/familyWorkspace/types.ts` | Shared VM types — single contract for fixtures + API |
| `web/lib/communications/v2/familyWorkspace/recipientTierPolicy.ts` | Pure: `role_type` → `primary` \| `secondary` \| `excluded` |
| `web/lib/communications/v2/familyWorkspace/normalizeRecipientContact.ts` | Email/phone normalization (reuse logic from `drawerEmailRecipients.ts`) |
| `web/lib/communications/v2/familyWorkspace/buildChannelEligibility.ts` | Per-person × channel availability (address + provider binding) |
| `web/lib/communications/v2/familyWorkspace/loadFamilyWorkspaceData.ts` | Supabase query batch (no VM assembly) |
| `web/lib/communications/v2/familyWorkspace/resolveFamilyCommunicationWorkspace.ts` | Main resolver: raw rows → VM |
| `web/lib/communications/v2/familyWorkspace/stubFamilyWorkspaceTail.ts` | Fills 5B/5C fields with stable empty defaults |
| `web/lib/communications/v2/familyWorkspace/index.ts` | Public exports |
| `web/app/api/admin/communications/family-workspace/route.ts` | `GET` endpoint |
| `web/tests/communications/v2/recipientTierPolicy.test.ts` | Tier policy unit tests |
| `web/tests/communications/v2/buildChannelEligibility.test.ts` | Eligibility unit tests |
| `web/tests/communications/v2/resolveFamilyCommunicationWorkspace.test.ts` | Resolver integration-style tests (mocked rows) |

### Edit (minimal)

| File | Change |
|------|--------|
| `web/lib/communications/drawerEmailRecipients.ts` | Extract shared `trimEmail` / `smsToOrNull` / `personLabel` into `normalizeRecipientContact.ts` (or import from new module to avoid duplication) — **small refactor only** |
| `comunications_wip/FamilyCommunicationWorkspace_DataContract.md` | Add pointer: "canonical types live in `web/lib/communications/v2/familyWorkspace/types.ts`" (optional doc sync) |

### Do not edit (this phase)

- `CommandCenterShell.tsx`, `fixtures.ts` (locked UI bundle) — types only imported when bundle merges
- `executeCommunicationsSend.ts`, send route
- Any migration / schema
- Runtime-sensitive drawer reveal files

---

## 3. Resolver / query plan

### Entry point

```ts
resolveFamilyCommunicationWorkspace(supabase, orgId, {
  customerId: string,
  focusChildId?: string | null,      // customer_members.id — passthrough to scope only in 5A
  focusOpportunityId?: string | null,
  composerChannel?: "email" | "sms" | "note", // default "email" for eligibility split
})
```

### Phase 0 — Auth / guard (route layer)

1. `requireAdminOrgContextLight()`
2. `assertRowOrg(supabase, "customers", customerId, orgId)` → 404 if missing

### Phase 1 — Parallel load (single round-trip batch)

Follow the pattern in `attachPersonDrawerVisibility.ts` (Promise.all, bounded limits).

| Query | Table(s) | Select | Filter |
|-------|----------|--------|--------|
| **A. Customer shell** | `customers` | `id, name, status, status_key, primary_contact_id` | `org_id`, `id = customerId` |
| **B. Children** | `customer_members` | `id, display_name, first_name, last_name, dob, person_id, relationship, status_key, is_active` | `customer_id`, `relationship = 'child'`, `is_active = true` |
| **C. Enrollment mirror** | `opportunity_customer_members` + `opportunities` | OCM: `customer_member_id, opportunity_id, outcome_status_key, desired_program_type, location_id`; Opp: `id, name, status_key, pipeline_stage_id, location_id, primary_person_id` | `customer_member_id IN (:childMemberIds)` |
| **D. Household adults** | `customer_persons` | `person_id, role_type, is_primary, status, end_date` | `customer_id = customerId` |
| **E. Opportunity-linked adults** | `opportunities` → `opportunity_persons` | `person_id, role_type, opportunity_id` | `opportunities.customer_id = customerId` |
| **F. Person rows** | `persons` | `id, first_name, last_name, full_name, email, phone, archived_at, status_key, metadata` | `id IN (:allPersonIds)` |
| **G. Role labels** | `customer_person_role_types` | `key, label` | org + keys from D/E |
| **H. Provider bindings** | `communication_provider_bindings` | same as bindings route | `org_id` |
| **I. Status labels** (optional) | `status_definitions` via `resolveStatusLabel` | child stage, opp stage | keys from B/C |
| **J. Primary contact bridge** | `contacts` | `person_id` | only if `customers.primary_contact_id` set and person not already in set |

**Limits:** `PERSON_VISIBILITY_LIMIT = 25` per table (match person drawer).

**Dedup rule:** Map adults by `person_id`. Prefer `customer_persons` role when both customer and opportunity links exist. Merge multiple `customer_persons` rows per person via `mergeHouseholdAdultLinks` pattern (`web/lib/admin/person/mergeHouseholdAdultLinks.ts`).

**Exclude from recipients:**

- Child persons (`customer_members.person_id` where relationship = child)
- `persons.archived_at IS NOT NULL`
- `customer_persons.end_date` in the past (if set)
- `customer_persons.status` explicitly inactive (if org uses it — filter when value is known inactive)
- Tier = `excluded` (non-messageable role types — see policy below)

### Phase 2 — Pure assembly (no I/O)

1. **Build `family`** from customer row + rollup from newest active OCM/opportunity (program, location, stage, lifecycleStage).
2. **Build `children[]`** from B + C join:
   - `id` = `customer_members.id`
   - `personId` = `customer_members.person_id`
   - `name`, `dob`, `ageLabel` via `personDrawerHouseholdAgeLabel`
   - `program`, `stage`, `opportunityId` from best OCM row (most recent `updated_at`)
3. **Build adult roster** from D + E + J, joined to F.
4. **Assign tier** via `recipientTierPolicy` (see §3.1).
5. **Compute channel eligibility** via `buildChannelEligibility` for each adult × `{email, sms}`.
6. **Split** into `eligibleRecipients` vs `disabledRecipients` for `composerChannel` (and expose both channels on each recipient).
7. **Default selection:** all Primary-tier recipients that are eligible for active channel; if none, first eligible any tier.
8. **Stub tail** via `stubFamilyWorkspaceTail()` — empty threads/messages/timeline/health; consent fields `unset`.

### 3.1 Primary / Secondary tier policy (5A — code constants, no config UI)

Reuse sets from `personDrawerHouseholdRoles.ts`:

| Tier | UI label | `role_type` keys |
|------|----------|------------------|
| **primary** | Parent/Guardian | `parent`, `guardian`, `primary_contact`, `primary` |
| **secondary** | Other contacts | `emergency_contact`, `emergency`, `authorized_pickup`, `pickup`, `grandparent` |
| **excluded** | — | `child`, staff/vendor keys, unknown non-adult roles |

Sort within tier: `is_primary` desc → `guardianRolePrecedence` → display name (same as `resolveDrawerHouseholdContacts`).

### 3.2 Lifecycle stage (family header only)

| Condition | `lifecycleStage` |
|-----------|------------------|
| Any child OCM with enrolled-like `outcome_status_key` | `"enrolled"` |
| Any opportunity on customer | `"lead"` |
| Else | `"unknown"` |

(Enrolled-like keys: resolve via existing status_definitions category — or conservative: any non-null OCM outcome → `"enrolled"` for 5A.)

### 3.3 Channel eligibility (5A)

For each recipient and channel:

```
hasAddress     = email valid OR phone valid (normalizeRecipientContact)
providerBound  = availableComposerChannels(bindings) includes channel
available      = hasAddress && providerBound && !archived
unavailableReason = first failing reason ("No email on file", "SMS not configured", "Person archived")
```

**Consent (5A passive only):**

- `marketing` / `transactional` = `"unset"`
- `canSendTransactional` / `canSendMarketing` = `available` (no block)
- If `persons.metadata.sms_opt_in === false` or `email_opt_in === false` (when present): set matching channel `available = false`, reason `"Opt-in not recorded"` — **read-only, no new storage**

---

## 4. API contract

### `GET /api/admin/communications/family-workspace`

**Auth:** `requireAdminOrgContextLight` (same as drawer-recipients).

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `customer_id` | ✅ | UUID — household anchor |
| `focus_child_id` | | `customer_members.id` — scope only in 5A |
| `focus_opportunity_id` | | Opportunity UUID — scope only in 5A |
| `composer_channel` | | `email` \| `sms` \| `note` — default `email`; drives eligible/disabled split |

**Response 200:**

```json
{
  "workspace": { /* FamilyCommunicationWorkspaceVM — full shape, 5A-populated + stubs */ },
  "meta": {
    "resolver_version": "5a",
    "customer_id": "uuid",
    "generated_at": "ISO-8601",
    "adult_count": 2,
    "child_count": 2,
    "eligible_count": 1,
    "disabled_count": 1
  }
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| 400 | Missing/invalid `customer_id` |
| 404 | Customer not in org |
| 500 | Supabase error |

**Example workspace subset (5A fields populated):**

```json
{
  "family": {
    "id": "cust-uuid",
    "label": "The Rivera Family",
    "program": "Full Day Preschool",
    "location": { "id": "loc-uuid", "label": "Firefly Main" },
    "stage": "Tour complete",
    "ownerUserId": null,
    "ownerLabel": null,
    "lifecycleStage": "lead"
  },
  "children": [
    {
      "id": "cm-uuid-1",
      "personId": "person-child-1",
      "name": "Elena Rivera",
      "ageLabel": "3",
      "dob": "2022-04-01",
      "program": "Full Day Preschool",
      "stage": "Inquiry",
      "opportunityId": "opp-uuid"
    }
  ],
  "recipientGroups": [
    {
      "tier": "primary",
      "uiLabel": "Parent/Guardian",
      "recipients": [/* RecipientVM[] */]
    },
    {
      "tier": "secondary",
      "uiLabel": "Other contacts",
      "recipients": [/* RecipientVM[] */]
    }
  ],
  "eligibleRecipients": [/* selectable for composer_channel */],
  "disabledRecipients": [
    {
      "id": "person-dad",
      "displayName": "Carlos Rivera",
      "roleType": "parent",
      "roleLabel": "Parent",
      "isPrimary": false,
      "email": null,
      "phone": "+15550199",
      "channels": {
        "email": {
          "hasAddress": false,
          "providerBound": true,
          "available": false,
          "unavailableReason": "No email on file",
          "marketing": "unset",
          "transactional": "unset",
          "canSendTransactional": false,
          "canSendMarketing": false
        },
        "sms": { "available": true, "...": "..." }
      }
    }
  ],
  "selectedRecipients": [/* default eligible primary recipients */],
  "consentSummary": {
    "byContact": {},
    "displayFlags": { "email": true, "sms": true, "marketing": false }
  },
  "composerDraft": {
    "channel": "email",
    "recipientContactIds": ["person-mom"],
    "subject": null,
    "body": "",
    "availableChannels": {
      "email": true,
      "sms": true,
      "note": true,
      "reasons": {}
    },
    "consentBlockers": []
  },
  "scope": {
    "level": "family",
    "customerId": "cust-uuid",
    "focusChildId": null,
    "focusOpportunityId": null,
    "focusPersonId": null
  },
  "threads": [],
  "selectedThread": null,
  "messages": [],
  "timelineEvents": [],
  "healthSummary": {
    "status": "healthy",
    "engagementScore": 0,
    "responseRate": null,
    "lastContactAt": null,
    "unreadCount": 0
  }
}
```

---

## 5. Fixture VM ↔ real VM — same shape

### Single type module

All shapes live in `web/lib/communications/v2/familyWorkspace/types.ts`:

- Export `FamilyCommunicationWorkspaceVM` and nested types
- Export type guards / constants: `FAMILY_WORKSPACE_RESOLVER_VERSION = "5a"`

### Fixture path (unchanged UI)

When the UI bundle merges, `fixtures.ts` should:

```ts
import type { FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace";
import { stubFamilyWorkspaceTail } from "@/lib/communications/v2/familyWorkspace/stubFamilyWorkspaceTail";

export function buildFixtureWorkspace(conversationId: string): FamilyCommunicationWorkspaceVM {
  return {
    family: { id: "fx-cust-rivera", label: "The Rivera Family", ... },
    children: [ /* structured, not string */ ],
    recipientGroups: [ ... ],
    eligibleRecipients: [ ... ],
    disabledRecipients: [ ... ],
    selectedRecipients: [ ... ],
    ...stubFamilyWorkspaceTail({ /* fixture timeline/health */ }),
  };
}
```

### Real path

```ts
const workspace = await resolveFamilyCommunicationWorkspace(supabase, orgId, opts);
// Same type — CommandCenterShell props unchanged
```

### Adapter for queue row → customer id

Queue fixtures use thread/conversation ids today. Add a **lookup helper** (5A, data layer only):

```ts
// resolveCustomerIdFromWorkspaceEntry({ threadId?, opportunityId?, customerId? })
```

Priority: explicit `customer_id` param → thread `primary_entity` if type `customers` → opportunity.customer_id. Used by future UI fetch, not required to change queue UI in 5A.

### Field parity checklist

| Field | Fixture (today) | Real resolver (5A) |
|-------|-----------------|---------------------|
| `family.label` | string | `customers.name` |
| `family.id` | thread id ❌ | `customers.id` ✅ |
| `children` | display string ❌ | `ChildRef[]` ✅ |
| `recipientGroups` | implicit single recipient ❌ | Primary/Secondary ✅ |
| `eligible/disabled` | absent ❌ | per channel ✅ |
| `consentSummary` | family-level ❌ | per-contact `unset` ✅ |
| `timelineEvents` | fixture messages | `[]` stub (5B) |

---

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Adults only on `opportunity_persons`, not `customer_persons`** | Medium | Union D + E; test with seed org (`20260423143000_opportunity_identity_seed_childcare_org.sql`) |
| **Child linked as person appears in both children and adults** | Medium | Explicit exclude set from child `person_id`s before building roster |
| **Duplicate normalization logic** | Low | Extract from `drawerEmailRecipients.ts` once |
| **UI bundle not merged — types unused in UI** | Expected | 5A still valuable: API + tests; UI stays on fixtures |
| **False eligibility without consent table** | Accepted | Document in API `meta`; 5C adds enforcement |
| **`metadata` opt-in keys inconsistent** | Low | Only honor explicit `false`; never infer opt-in from absence |
| **Performance on large households** | Low | 25-row caps; single parallel batch |
| **primary_contact_id → contacts legacy path** | Low | J query as fallback only |

---

## 7. Test plan

### Unit tests (pure, no DB)

**`recipientTierPolicy.test.ts`**

- `parent` → primary
- `emergency_contact` → secondary
- `child` / unknown → excluded
- Primary sort order matches `guardianRolePrecedence`

**`buildChannelEligibility.test.ts`**

- Email available when address + binding
- Disabled when no email ("No email on file")
- Disabled when binding missing ("Email not configured")
- SMS digits normalization (10+ digits)
- `metadata.sms_opt_in: false` disables SMS only

**`resolveFamilyCommunicationWorkspace.test.ts`** (inject row fixtures, no Supabase)

- Rivera-shaped household: 2 children, 2 adults, dad no email → disabled for email, eligible for SMS
- Archived person excluded entirely
- Empty household: `children: []`, `recipientGroups: []`, still valid VM
- Opportunity-only adult merged with customer_persons
- `selectedRecipients` defaults to primary eligible only

### Route test (optional, lightweight)

**`familyWorkspaceRoute.test.ts`**

- 400 on bad UUID
- Mock resolver; assert JSON envelope shape

### Manual QA (staging)

1. Use seed org household from `20260423143000_opportunity_identity_seed_childcare_org.sql`
2. `curl`/browser: `GET /api/admin/communications/family-workspace?customer_id=<rivera-customer-id>`
3. Verify: structured children, Ava as primary eligible, roles labeled Parent/Guardian not "Contact"
4. Remove email from a person in DB → re-fetch → moves to `disabledRecipients` for `composer_channel=email`

### CI commands

```bash
cd web && npm run test -- tests/communications/v2/
cd web && npx tsc --noEmit
```

---

## 8. Suggested implementation order

1. **`types.ts`** + **`stubFamilyWorkspaceTail.ts`** — lock the contract
2. **`recipientTierPolicy.ts`** + **`normalizeRecipientContact.ts`** + tests
3. **`buildChannelEligibility.ts`** + tests
4. **`loadFamilyWorkspaceData.ts`** — query batch only
5. **`resolveFamilyCommunicationWorkspace.ts`** — assembly
6. **`route.ts`** — wire auth + resolver
7. **Refactor** `drawerEmailRecipients.ts` to share normalizers (optional last)

**Estimated touch surface:** ~8 new files, ~1 small edit, ~3 test files, **0 UI files**, **0 migrations**.

---

## 9. Suggested commit message (when implemented)

```
Add family workspace resolver (UI-5A) for roster and recipient eligibility.

Introduces GET /api/admin/communications/family-workspace and shared
FamilyCommunicationWorkspaceVM types so the locked Command Center can
later swap fixtures for customer-scoped children and parent/guardian
recipients with per-channel eligibility.
```

---

## Related docs

- UI-5 audit: `comunications_wip/UI5_DataMapping_Investigation.md`
- Data contract: `comunications_wip/FamilyCommunicationWorkspace_DataContract.md`
- UI lock: `UI4H_Visual_Lock.md`
- Entity doctrine: `docs/platform/core/entity-model.md`
