# Entity model

## Purpose

Describe the main database-backed entities and how **persons**, **customer_persons**, **contacts**, and CRM objects relate — grounded in schema and code, not old doctrine.

## Current state

- Postgres schema under **`public`** with strong **`org_id`** presence on tenant-owned tables.
- **Persons:** `persons` holds human identity fields used across booking, CRM, and admin.
- **Customer linkage:** `customer_persons` joins `person_id` ↔ `customer_id` with `role_type`, `is_primary`, optional status/dates, org-scoped uniqueness on `(org_id, customer_id, person_id, role_type)` per baseline SQL.
- **Contacts:** `contacts` table still exists; admin drawer and entity APIs include `contacts` as an entity type. Some inbound flows (e.g. lead capture) still reference contact IDs; opportunity rows may carry `primary_contact_id` depending on migration age.
- **Opportunities:** `opportunities` tie pipeline state to customers and work units; migrations add person-flavored FKs (verify migration `*_opportunity_persons_*` in repo).
- **Jobs, schedules, payments, documents:** First-class entities with org scoping; used across workspace, billing, and communications.

## How it works

- **Identity resolution:** Server helpers resolve booking/customer context using persons + `customer_persons` where implemented (`web/lib/bookingPersonCustomerResolve.ts`, `web/lib/bookingCustomerPersonLink.ts`).
- **Role types:** Org-configurable role labels/keys via `customer_person_role_types` and admin helpers (`web/lib/admin/personTypeSettings.ts`).
- **Admin presentation:** `AdminEntityDrawer` loads related `customer_persons` arrays when viewing a person; opportunities and customers show linked people/contacts per current UI.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Baseline tables | `supabase/migrations/`, `prod_baseline.sql` |
| Admin entity GET (many types) | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Person type / role settings | `web/lib/admin/personTypeSettings.ts` |
| Drawer UI | `web/components/admin/AdminEntityDrawer.tsx` |
| Opportunity status entity typing | `web/lib/admin/statusDefinitionsAdminEntityTypes.ts` |

## Guardrails

- **Do not** design new CRM or booking features assuming **`contacts`** are the long-term source of truth for people.
- **Do** use **`persons` + `customer_persons`** for new relationship modeling.
- When both `primary_contact_id` and `primary_person_id` exist on a row, **do not guess** which is authoritative without reading the row and migration notes — prefer **`primary_person_id`** for new code when populated.

## Known gaps / risks

- **Needs verification:** Complete mapping of which inbound APIs still create **`contacts`** only vs **`persons`**.
- **Needs verification:** Share of production **`opportunities`** rows populated on `primary_person_id` vs legacy contact fields.

## When this doc must be updated

New entity types, FK migrations on `opportunities`/`customers`, or retirement of `contacts` from APIs/UI.
