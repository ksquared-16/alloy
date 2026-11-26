# Relationship Edge Field Platform — Certification Closeout

**Branch:** `feat/relationship-edge-field-platform`  
**Base:** `1d76bf969` → commits on branch  
**Status:** Committed locally; PR opened for Preview certification  
**Non-goals:** Focus Panel product migration, Processing commit execution, new consumers

## Canonical model

```text
Alex → Person (persons)
Alex ↔ Mia → person_child_relationships (relationship instance)
Emergency Contact → person_child_relationship_roles (operational role)
Aunt → relationship_type (Choice Option on edge)
Pickup Instructions → field_values (entity_type=person_child_relationship)
```

## 1. Final schema

| Table | Purpose |
|-------|---------|
| `person_child_relationships` | Canonical edge: one row per (org, customer_member, person) |
| `person_child_relationship_roles` | Operational roles per edge |
| `field_values` | Custom relationship attributes |

Constraints: cross-org alignment triggers, unique edge, unique role, inactive-relationship role guard, RLS org-scoped.

## 2. Migration certification

| Migration | Contents |
|-----------|----------|
| `20260711153000_person_child_relationships.sql` | Tables, triggers, RLS, indexes |
| `20260711153100_person_child_relationship_type_option_set.sql` | Section, option set, field_definitions seeds |

Static review: FK targets (`orgs`, `customers`, `customer_members`, `persons`) verified against remote schema. Uses `org_id` convention, `gen_random_uuid()`, `set_updated_at`, `has_org_role` RLS helpers — matches staging patterns.

**Live certification:** Pending Supabase Preview apply (PR gate).

## 3. Seed behavior

**Existing orgs:** Idempotent `INSERT … FROM public.orgs o ON CONFLICT DO UPDATE` for option set, items, field_definitions, section.

**Future orgs:** Follows established platform pattern (same as `person_gender`, `customer_member` field seeds) — migration-time materialization for orgs present at apply. Post-migration org creation inherits the platform-wide gap; no relationship-only provisioning mechanism added.

## 4. Write authority

`personChildRelationshipService.ts` — sole canonical write path. Legacy writes blocked (`personChildRelationshipLegacyPolicy.ts`).

## 5. Admin API

`/api/admin/person-child-relationships` (+ id, roles routes). Auth: admin context + `requireAdminOrOps`.

## 6. Provider / resolver / mutation

Catalog merge via `personChildRelationshipProviderCatalogIntegration.ts` → `buildCanonicalDataProviderCatalog`. DB resolver: `personChildRelationshipResolverRegistry.ts`. Mutation: `resolveMutationCapability` + `personChildRelationshipPatch`.

## 7. Custom relationship fields

Tenant fields on `person_child_relationship` entity merge into catalog. `/settings/fields` supports entity owner. Live proof pending Preview.

## 8. Alex / Mia / Noah evidence

- **Unit/resolver:** `alexAcceptanceFlow.test.ts` ✅
- **Service mock:** `personChildRelationshipService.test.ts` ✅
- **Live Preview:** Pending PR certification pass

## 9. Rollback / forward-fix

Forward-fix preferred. Deactivate admin routes if needed; legacy read adapter remains. Manual reconciliation if canonical rows created.

## 10. Deferred

- Focus Panel Parents/Guardians + Emergency Contacts product migration
- Processing commit execution
- Automatic legacy backfill
- Live RLS two-org certification (Preview gate)

## References

- `family-relationship-projection-audit.md`
- `web/lib/fields/personChildRelationship/*`

---

## Operational completion (2026-07-12)

- Staging migrations verified applied
- Org provisioning + repair script added
- Lead creation writes canonical PCR instances
- Focus Panel Emergency Contacts consume `_person_child_relationships_by_member`
- Household emergency_contacts group prefers canonical evidence
- Children surface optional `emergency_contacts` section with person + PCR field picker
