# Focus Panel Emergency Contact Convergence

## Staging migration application

- Staging branch `ikaxilmwmrmbagoidedu` has migrations through `20260715120000`, including:
  - `20260711153000_person_child_relationships.sql`
  - `20260711153100_person_child_relationship_type_option_set.sql`
- Verified via pooler `:5432`: both PCR tables present; 2 orgs each have 3 native fields, 1 section, 1 option set.

## Current-org seed verification

| Org | PCR fields | Sections | Option sets |
|-----|------------|----------|-------------|
| Alloy Bend | 3 | 1 | 1 |
| Firefly Early Learning | 3 | 1 | 1 |

Repair script: `web/scripts/repairPersonChildRelationshipPlatformSeeds.ts`

## Future-org provisioning

- `provisionPersonChildRelationshipPlatformConfig()` mirrors migration `53100`
- Hooked into `createOrgAndAssignAdmin` — new orgs receive section, option set, native fields idempotently

## Focus Panel Emergency Contact architecture

```
Opportunity GET → attachPersonChildRelationshipsToEntityRecord
  → truth._person_child_relationships_by_member
Focus Panel Household / Children
  → buildEmergencyContactsEvidence(ForChild)
  → buildFocusPanelRelationshipInstanceViewModels
  → presentation (Person fields + relationship fields separate)
```

## Legacy writer migration

- `persistCreateLeadChildScopedContacts` now calls `applyCanonicalChildScopedRelationships`
- Writes `person_child_relationships` + `person_child_relationship_roles` (not `customer_member_contacts`)

## Legacy reconciliation

- Dry-run utility: `web/scripts/reconcileLegacyCustomerMemberContacts.ts`
- Classifies legacy rows; `--apply` gated (dry-run default)

## Settings / Fields

- Entity `person_child_relationship` visible in `/settings/fields`
- Relationship to Child bound to `person_child_relationship_type` option set
- Custom fields (e.g. Pickup Instructions) configurable without code registration

## Alex / Mia / Noah acceptance

- One Person (Alex), two relationship edges, roles/types/fields child-scoped
- Covered by `buildEmergencyContactsEvidence.test.ts` and `alexAcceptanceFlow.test.ts`

## Remaining consumers

- Parents/Guardians Focus Panel (deferred — reuse same adapter after Emergency Contacts stable)
- Forms collection authoring for emergency contacts (deferred)
- Authorized Pickup Focus Panel section (separate consumer)

## Rollback

- Revert PR; legacy read adapter continues projecting `customer_member_contacts`
- Canonical rows preserved; no destructive legacy deletion in this sprint

## Completion (feat/focus-panel-emergency-contact-completion)

- **Child drill-in:** `EmergencyContactsSection` renders configured `emergency_contacts` at focused-child details depth (`ChildrenCard` + `FocusedChild`).
- **Field rendering:** `emergencyContactsFieldRuntime.ts` resolves `person.*` vs `person_child_relationship.*` provider refs per relationship instance.
- **Actions:** `executeRelationshipAction` `child_scoped_contact` writes via `applyCanonicalChildScopedRelationships` (PCR tables); refresh includes `_person_child_relationships_by_member`.
- **Role lifecycle:** `removePersonChildRelationshipRole` deactivates edge when no active roles remain; Focus Panel truth merge preserves other roles on the same edge.
- **Legacy dedupe:** canonical `_person_child_relationships_by_member` bag wins over `_customer_member_contacts` projection per member.
- **Alex / Mia / Noah:** covered by `buildEmergencyContactsEvidence.test.ts` (Mia shows Alex emergency; Noah excludes without role).

## Gap closure

- Choice fields use canonical SelectFieldControl + option sets.
- link_existing_person writes PCR, not legacy contacts.
- Staging certification script: web/scripts/certifyPersonChildRelationshipStagingApi.ts.
