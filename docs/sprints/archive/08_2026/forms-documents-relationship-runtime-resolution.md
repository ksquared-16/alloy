# Forms / Documents P3A — Canonical Relationship Runtime Resolution

**Status:** Architecture-hardened — **not committed** (review gate)  
**Branch:** `feat/relationship-runtime-resolution`  
**Baseline:** staging `958341e25` (rebased; includes P2 #133 + staging through PR #140)

## Mission

One canonical relationship runtime resolver for deterministic read resolution. Focus Panel is the active operational consumer — not legacy drawers.

## Canonical Primary Contact authority (evidence-based)

Repository evidence **overrides** the default assumption that `customers.primary_contact_id` is canonical:

| Signal | Owner | Write authority | Read role | Can disagree? |
| --- | --- | --- | --- | --- |
| `customer_persons` (`primary_contact` + `is_primary`) | household | **Yes** — `setHouseholdPrimaryContactForCustomer` | **Canonical household pointer** | Yes |
| `opportunities.primary_person_id` | lead | Yes — synced on make-primary | **Canonical opportunity pointer** | Yes |
| `customers.primary_contact_id` | customer | Legacy booking only — **not** updated by make-primary | Legacy reconciliation | Yes |

**Policy:** household/opportunity canonical pointer wins; legacy FK is compatibility evidence only. Conflicting legacy signals emit `relationship_data_conflict` — not `ambiguous`.

## Resolution metadata

```ts
resolution_source: "canonical_pointer" | "legacy_fallback" | "role_assignment" | "derived"
diagnostics: "relationship_data_conflict" | "canonical_pointer_invalid" | "legacy_reconciliation_required"
```

## Active consumer architecture

```
Canonical relationship source
        ↓
primaryContactAuthority / canonicalRelationshipResolver
        ↓
Focus Panel / Queue Rows / Forms adapters
        ↓
Presentation
```

### Focus Panel
- `buildHouseholdCardEvidence` → `resolvePrimaryContactAuthority` (replaces `resolveLeadSummaryPrimaryPersonId` for primary id)
- Household card buckets remain collection-oriented for plural roles

### Queue Rows
- Primary contact via preview context / opportunity FK projection
- No singular secondary/billing/emergency leaves (unchanged)

### Legacy drawer modules
- **Retained, compatibility:** layout contact blocks, drawer VM record builders, FamilyContactsPanel
- **Shared helpers extracted to canonical layer:** `primaryContactAuthority.ts`, `householdPrimaryContact.ts`
- **Not deleted** in P3A — competing first-match paths documented for P3B convergence

## Per-role semantic shape

| Role | Shape | Singular designation | Picker (P3A) |
| --- | --- | --- | --- |
| Primary | optional_singular | Yes (household + opp pointers) | **Enabled** read-only |
| Secondary | collection | No | Deferred |
| Parents/Guardians | collection | No | Deferred |
| Emergency | contextual_collection | No | Deferred |
| Billing | collection | No | Deferred |

## Collection recommendations (future)

- `person.contact_role.parents[]` — household guardians collection
- `person.contact_role.emergency[]` — child-scoped emergency contacts
- `person.contact_role.secondary[]` — secondary contacts collection

## Primary conflict UX (Forms)

- Valid canonical pointer + legacy conflict → show value + `operatorDiagnostics: [relationship_data_conflict]`
- Legacy fallback → value + `legacy_reconciliation_required`
- Multiple legacy candidates → explicit ambiguous state

## Write-readiness (P3B)

- Make-primary writes `customer_persons` + `opportunities.primary_person_id` only
- `customers.primary_contact_id` drift requires bounded reconciliation/backfill sprint
- No P3A write convergence

## Key files

- `web/lib/fields/relationship/primaryContactAuthority.ts`
- `web/lib/fields/relationship/canonicalRelationshipResolver.ts`
- `web/lib/fields/relationship/relationshipSemanticShape.ts`
- `web/lib/forms/prefill/formsRelationshipPrefillResolver.ts`
- `web/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence.ts`
