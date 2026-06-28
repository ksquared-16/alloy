# API index (generated)

**Generated:** 2026-06-28 by `scripts/generate-api-inventory.mjs`. Do not edit by hand — re-run the script.

**Routes:** 460 `route.ts` handlers under `web/app/api/**`.

This is a static, heuristic inventory. Columns are extracted from source text:

- **Auth** — detected gate helpers (`route-gate`, `admin-context`, `access-scope`, `admin-or-ops`, `provider-signature`, `token`, …). `none-detected` means no known helper matched (verify manually — may delegate to a shared loader).
- **Val** — validation signal: `zod`, `schema`, `manual` (explicit 400 checks), or `none`.
- **SR** — uses the service-role Supabase client (`createAdminClient`). Org scoping is then the handler's responsibility.
- **W** — performs writes (insert/update/upsert/delete/rpc). **E** — emits events / revalidation / workflow side effects.
- **Tables** — first tables/RPCs referenced via `.from()` / `.rpc()` (truncated).

## Counts

| Domain | Routes |
|---|---|
| [Admin / Configuration](admin-configuration-api.md) | 76 |
| [Workspace / Queue / Focus Panel](workspace-api.md) | 48 |
| [Entity / Record / Resolver](entity-record-api.md) | 126 |
| [Business Process / Status / Lifecycle](business-process-api.md) | 45 |
| [Actions / Workflows](actions-workflows-api.md) | 31 |
| [Documents / Forms](documents-forms-api.md) | 46 |
| [Communications](communications-api.md) | 39 |
| [AI / BOS](ai-bos-api.md) | 23 |
| [Internal / System / Diagnostics](internal-system-api.md) | 26 |
| **Total** | **460** |

| Stability | Routes |
|---|---|
| admin-only | 409 |
| experimental | 8 |
| internal | 13 |
| public/tokenized | 27 |
| webhook | 3 |

## Admin / Configuration

Detailed conventions: [`admin-configuration-api.md`](admin-configuration-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/activity` | admin-context, admin-or-ops | manual | y | — | y | admin-only | workflow_events |
| GET POST | `/api/admin/addons` | admin-context | manual | y | y | — | admin-only | pricing_addons, verticals |
| DELETE PATCH | `/api/admin/addons/[id]` | admin-context | manual | y | y | — | admin-only | pricing_addons |
| GET POST | `/api/admin/childcare-attendance` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/childcare-attendance/expected-vs-actual` | admin-context | manual | y | — | — | admin-only | — |
| PUT | `/api/admin/config/field-definition-visibility` | admin-context | manual | y | — | — | admin-only | field_definitions |
| GET | `/api/admin/config/layout-integrity` | admin-context | schema | y | — | — | admin-only | field_definitions, field_section_definitions, option_set_items, option_sets |
| PUT | `/api/admin/config/record-overview-layout` | admin-context | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/departments` | route-gate, access-scope, admin-context | manual | y | y | — | admin-only | departments |
| GET | `/api/admin/discount-code-options` | admin-context | none | y | — | — | admin-only | — |
| GET | `/api/admin/discount-redemptions` | access-scope, admin-context, admin-or-ops | none | y | — | — | admin-only | contacts, customers, discount_codes, discount_redemptions, jobs, opportunities |
| GET POST | `/api/admin/discounts` | admin-context | schema | y | — | — | admin-only | — |
| DELETE PATCH | `/api/admin/discounts/[id]` | admin-context | schema | y | — | — | admin-only | — |
| GET | `/api/admin/documents` | access-scope, admin-context | manual | y | — | — | admin-only | contacts, customers, documents, jobs, opportunities, persons, +2 |
| GET PUT DELETE | `/api/admin/entity-labels` | route-gate, admin-context | schema | y | y | y | admin-only | entity_labels |
| GET POST | `/api/admin/entity-layouts` | admin-context | manual | y | — | — | admin-only | — |
| GET PATCH DELETE | `/api/admin/entity-layouts/[id]` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/entity-layouts/[id]/duplicate` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/entity-layouts/[id]/publish` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/entity-layouts/[id]/rollback` | admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/entity-layouts/effective` | admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/entity-layouts/field-catalog` | admin-context | none | y | — | — | admin-only | field_definitions |
| GET | `/api/admin/entity-layouts/focus-panel-summary` | admin-context | none | y | — | — | admin-only | — |
| GET POST | `/api/admin/field-definitions` | admin-context | schema | y | y | — | admin-only | field_definitions |
| GET PATCH DELETE | `/api/admin/field-definitions/[id]` | admin-context | schema | y | y | — | admin-only | field_definitions |
| PATCH | `/api/admin/field-definitions/batch-placement` | admin-context | schema | y | y | — | admin-only | field_definitions, field_section_definitions |
| POST GET | `/api/admin/field-definitions/ensure-platform-field` | admin-context | manual | y | y | — | admin-only | field_definitions |
| GET POST | `/api/admin/field-sections` | admin-context | manual | y | y | — | admin-only | field_section_definitions |
| PATCH DELETE | `/api/admin/field-sections/[id]` | admin-context | manual | y | y | — | admin-only | field_definitions, field_section_definitions |
| GET | `/api/admin/industries` | admin-context | none | y | — | — | admin-only | industries |
| GET | `/api/admin/industries/[id]` | admin-context | manual | y | — | — | admin-only | industries, industry_default_entity_labels |
| GET | `/api/admin/lifecycle-catalog` | route-gate | none | y | — | — | admin-only | — |
| GET | `/api/admin/operational-expectations` | admin-context | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/option-sets` | admin-context | schema | y | y | — | admin-only | option_set_items, option_sets |
| GET PATCH DELETE | `/api/admin/option-sets/[setKey]` | admin-context | schema | y | y | — | admin-only | option_set_items, option_sets |
| POST | `/api/admin/option-sets/[setKey]/items` | admin-context | manual | y | y | — | admin-only | option_set_items, option_sets |
| PATCH DELETE | `/api/admin/option-sets/[setKey]/items/[itemId]` | admin-context | manual | y | y | — | admin-only | option_set_items, option_sets |
| GET PATCH | `/api/admin/org-settings` | admin-context | manual | y | y | — | admin-only | org_settings |
| PATCH | `/api/admin/org/industry` | admin-context | manual | y | y | — | admin-only | industries, orgs |
| GET POST | `/api/admin/pricing-dimension-values` | admin-context | manual | y | y | — | admin-only | pricing_dimension_values, pricing_dimensions |
| DELETE PATCH | `/api/admin/pricing-dimension-values/[id]` | admin-context | manual | y | y | — | admin-only | pricing_dimension_values |
| GET POST | `/api/admin/pricing-dimensions` | admin-context | manual | y | y | — | admin-only | pricing_dimensions, verticals |
| DELETE PATCH | `/api/admin/pricing-dimensions/[id]` | admin-context | manual | y | y | — | admin-only | pricing_dimensions |
| GET POST | `/api/admin/pricing-modes` | admin-context | manual | y | y | — | admin-only | pricing_modes |
| DELETE PATCH | `/api/admin/pricing-modes/[id]` | admin-context | manual | y | y | — | admin-only | pricing_modes |
| GET POST | `/api/admin/pricing/first-clean-prices` | admin-context | manual | y | y | — | admin-only | pricing_dimension_values, pricing_first_clean_prices, pricing_services, pricing_square_footage_tiers, service_offerings |
| PATCH | `/api/admin/pricing/first-clean-prices/[id]` | admin-context | manual | y | y | — | admin-only | pricing_first_clean_prices |
| GET POST | `/api/admin/pricing/matrix` | admin-context | manual | y | y | — | admin-only | pricing_dimension_values, pricing_dimensions, pricing_matrix, pricing_modes, service_offerings, service_plan_templates, +1 |
| PATCH | `/api/admin/pricing/matrix/[id]` | admin-context | manual | y | y | — | admin-only | pricing_matrix |
| GET | `/api/admin/pricing/options` | admin-context | none | y | — | — | admin-only | pricing_dimension_values, pricing_dimensions, pricing_frequencies, pricing_modes, pricing_services, pricing_square_footage_tiers, +3 |
| GET POST | `/api/admin/pricing/recurring-prices` | admin-context | manual | y | y | — | admin-only | pricing_dimension_values, pricing_frequencies, pricing_recurring_prices, pricing_services, pricing_square_footage_tiers, service_offerings, +1 |
| PATCH | `/api/admin/pricing/recurring-prices/[id]` | admin-context | manual | y | y | — | admin-only | pricing_recurring_prices |
| GET | `/api/admin/quote-intake/catalog` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET PUT | `/api/admin/rbac/grants` | users-roles-gate | manual | y | y | — | admin-only | permission_definitions, role_permission_grants |
| GET | `/api/admin/rbac/permissions` | users-roles-gate | none | y | — | — | admin-only | permission_definitions |
| GET POST | `/api/admin/rbac/roles` | users-roles-gate | manual | y | y | — | admin-only | role_definitions |
| PATCH | `/api/admin/rbac/roles/[role_key]` | users-roles-gate | manual | y | y | — | admin-only | role_definitions |
| PATCH | `/api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements` | admin-context | manual | y | — | — | admin-only | field_definitions |
| PATCH | `/api/admin/record-drawer-layouts/opportunity-workflow-v1-order` | admin-context | schema | y | y | — | admin-only | field_definitions, field_section_definitions, record_drawer_layouts |
| PATCH | `/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections` | admin-context | schema | y | — | — | admin-only | field_definitions, field_section_definitions |
| GET | `/api/admin/record-layouts` | admin-context | manual | y | — | — | admin-only | record_drawer_layouts, record_layouts |
| GET | `/api/admin/record-layouts/effective-preview` | admin-context | manual | y | — | — | admin-only | field_definitions, field_section_definitions |
| GET | `/api/admin/record-overview-layouts` | admin-context | manual | y | — | — | admin-only | record_overview_layouts |
| GET | `/api/admin/service-frequency-options` | admin-context | none | y | — | — | admin-only | pricing_frequencies |
| GET POST | `/api/admin/service-offerings` | admin-context | manual | y | y | — | admin-only | service_offerings, verticals |
| DELETE PATCH | `/api/admin/service-offerings/[id]` | admin-context | manual | y | y | — | admin-only | service_offerings |
| GET POST | `/api/admin/service-plan-templates` | admin-context | manual | y | y | — | admin-only | service_plan_templates |
| DELETE PATCH | `/api/admin/service-plan-templates/[id]` | admin-context | manual | y | y | — | admin-only | service_plan_templates |
| GET | `/api/admin/settings/users-roles/members` | users-roles-gate | none | y | — | — | admin-only | departments, locations, user_access_profiles, user_department_access, user_roles, user_site_access |
| GET | `/api/admin/surface-layouts/registry` | admin-context | none | — | — | — | admin-only | — |
| GET POST | `/api/admin/users` | admin-context, users-roles-gate | manual | y | y | — | admin-only | role_definitions, user_roles |
| GET PATCH | `/api/admin/users/[userId]/access-scope` | users-roles-gate | manual | y | y | — | admin-only | departments, locations, user_access_profiles, user_department_access, user_roles, user_site_access |
| POST | `/api/admin/users/[userId]/remove` | users-roles-gate | manual | y | y | — | admin-only | user_roles |
| PATCH | `/api/admin/users/[userId]/role` | users-roles-gate | manual | y | y | — | admin-only | role_definitions, user_roles |
| GET POST | `/api/admin/verticals` | admin-context, require-admin | manual | y | y | — | admin-only | verticals |
| PATCH | `/api/admin/verticals/[id]` | admin-context, require-admin | manual | y | y | — | admin-only | verticals |

## Workspace / Queue / Focus Panel

Detailed conventions: [`workspace-api.md`](workspace-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| GET POST | `/api/admin/analytics/metrics` | analytics-gate | schema | y | y | — | admin-only | metric_definitions |
| GET PATCH | `/api/admin/analytics/metrics/[id]` | analytics-gate | schema | y | y | — | admin-only | metric_definitions |
| POST | `/api/admin/analytics/metrics/[id]/copy` | analytics-gate | manual | y | — | — | admin-only | — |
| POST | `/api/admin/analytics/metrics/[id]/preview` | access-scope, admin-context, analytics-gate | schema | y | — | — | admin-only | — |
| POST | `/api/admin/analytics/metrics/[id]/snapshot` | access-scope, admin-context, analytics-gate | none | y | — | — | admin-only | — |
| GET | `/api/admin/analytics/metrics/[id]/trend` | access-scope, admin-context, analytics-gate | schema | y | — | — | admin-only | — |
| GET POST | `/api/admin/analytics/placements` | analytics-gate | schema | y | y | — | admin-only | metric_placements |
| PATCH GET | `/api/admin/analytics/placements/[id]` | analytics-gate | schema | y | y | — | admin-only | metric_placements |
| GET | `/api/admin/analytics/render` | analytics-gate | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/analytics/rollups` | analytics-gate | schema | y | y | — | admin-only | metric_rollups |
| PATCH GET | `/api/admin/analytics/rollups/[id]` | analytics-gate | schema | y | y | — | admin-only | metric_rollups |
| POST | `/api/admin/analytics/snapshots/run` | admin-context, cron-token | manual | y | — | — | admin-only | — |
| GET | `/api/admin/analytics/surfaces/[surface]/placements` | analytics-gate | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/analytics/visualizations` | analytics-gate | schema | y | y | — | admin-only | metric_visualizations |
| PATCH GET | `/api/admin/analytics/visualizations/[id]` | analytics-gate | schema | y | y | — | admin-only | metric_visualizations |
| POST | `/api/admin/analytics/visualizations/[id]/copy` | analytics-gate | manual | y | — | — | admin-only | metric_definitions, metric_visualizations |
| GET | `/api/admin/global-search` | access-scope, admin-context, admin-or-ops, token | manual | y | — | — | admin-only | — |
| GET | `/api/admin/layout-proof/opportunities` | admin-context | none | y | — | — | internal | contacts, customers, locations, opportunities, status_definitions, verticals |
| GET | `/api/admin/layout-proof/opportunity-drawer-shadow` | route-gate | none | y | — | — | internal | — |
| GET | `/api/admin/layout-proof/waitlist-candidates` | admin-context | none | y | — | — | internal | contacts, customers, locations, persons, placement_candidates, placement_overrides |
| GET | `/api/admin/layout-runtime/child-drawer-body` | route-gate | manual | y | — | — | admin-only | — |
| GET | `/api/admin/layout-runtime/opportunity-drawer-body` | route-gate | manual | y | — | — | admin-only | — |
| GET | `/api/admin/layout-runtime/opportunity-drawer-shadow` | route-gate | manual | y | — | — | internal | — |
| GET | `/api/admin/layout-runtime/opportunity-queue-layout` | route-gate | none | y | — | — | admin-only | — |
| GET | `/api/admin/layout-runtime/opportunity-queue-row-shadow` | route-gate | none | y | — | — | internal | — |
| GET | `/api/admin/layout-runtime/person-drawer-body` | route-gate | manual | y | — | — | admin-only | — |
| GET PATCH | `/api/admin/metrics/kpi-targets` | admin-context | manual | y | y | — | admin-only | org_settings |
| GET | `/api/admin/metrics/resolve` | access-scope, admin-context | manual | y | — | — | admin-only | org_settings |
| POST | `/api/admin/metrics/snapshots/write` | access-scope, admin-context, admin-or-ops, cron-token | manual | y | — | — | admin-only | org_settings |
| GET | `/api/admin/metrics/trends` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/operational-enrollment/summary` | admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/queues/[workUnitId]/[queueKey]` | route-gate | manual | y | — | — | admin-only | work_units |
| GET | `/api/admin/v2/view-models/drawer/child/[id]` | re-export | none | — | — | — | admin-only | — |
| GET | `/api/admin/v2/view-models/drawer/opportunity/[id]` | re-export | none | — | — | — | admin-only | — |
| GET | `/api/admin/v2/view-models/drawer/person/[id]` | re-export | none | — | — | — | admin-only | — |
| GET | `/api/admin/view-models/drawer/child/[id]` | route-gate | manual | y | — | — | admin-only | — |
| GET | `/api/admin/view-models/drawer/opportunity/[id]` | route-gate | manual | y | — | — | admin-only | — |
| GET | `/api/admin/view-models/drawer/person/[id]` | route-gate | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/work-units` | route-gate, access-scope, admin-context | manual | y | y | — | admin-only | departments, work_units |
| GET PATCH DELETE | `/api/admin/work-units/[id]` | access-scope, admin-context | schema | y | y | — | admin-only | work_units |
| GET | `/api/admin/work-units/[id]/lane-previews` | route-gate | manual | y | — | — | admin-only | — |
| GET | `/api/admin/work-units/[id]/operational-bootstrap` | route-gate | manual | y | — | — | admin-only | — |
| GET | `/api/admin/work-units/[id]/opportunity-attention-queue` | access-scope, admin-context | manual | y | — | — | admin-only | departments, work_units |
| GET | `/api/admin/work-units/[id]/opportunity-queue` | access-scope, admin-context | manual | y | — | — | admin-only | customers, departments, work_units |
| GET | `/api/admin/work-units/[id]/queues` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/work-units/by-slug/[workUnitSlug]` | route-gate | manual | y | — | — | admin-only | departments |
| GET POST PATCH DELETE | `/api/admin/workspace-kpi-placements` | route-gate, admin-context | schema | y | y | — | admin-only | work_units, workspace_kpi_placement |
| GET | `/api/admin/workspace/site-filter` | route-gate | none | y | — | — | admin-only | — |

## Entity / Record / Resolver

Detailed conventions: [`entity-record-api.md`](entity-record-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| GET POST | `/api/admin/child-enrollment-agreements` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/child-enrollment-agreements/[id]` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/child-enrollment-agreements/[id]/cancel` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/child-enrollment-agreements/[id]/ended` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/child-enrollment-agreements/[id]/ending` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/child-placements` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/contact-options` | admin-context | manual | y | — | — | admin-only | contacts |
| GET POST | `/api/admin/contacts` | admin-context | manual | y | y | — | admin-only | contacts, customers, vendors |
| PATCH | `/api/admin/contacts/[id]` | admin-context | manual | y | y | — | admin-only | contacts |
| POST | `/api/admin/contacts/[id]/archive` | admin-context | manual | y | y | — | admin-only | contacts |
| POST | `/api/admin/contacts/[id]/unarchive` | admin-context | manual | y | y | — | admin-only | contacts |
| GET | `/api/admin/customer-member-contact-roles` | admin-context | none | y | — | — | admin-only | customer_member_contact_roles |
| GET POST | `/api/admin/customer-member-contacts` | admin-context | manual | y | y | — | admin-only | contacts, customer_member_contact_roles, customer_member_contacts, customer_members |
| DELETE | `/api/admin/customer-member-contacts/[id]` | admin-context | manual | y | y | — | admin-only | customer_member_contacts |
| GET | `/api/admin/customer-member-relationship-types` | admin-context | none | y | — | — | admin-only | customer_member_relationship_types |
| GET POST | `/api/admin/customer-members` | admin-context, admin-or-ops | manual | y | y | — | admin-only | customer_member_contacts, customer_member_relationship_types, customer_members, customers |
| GET PATCH DELETE | `/api/admin/customer-members/[id]` | admin-context | schema | y | y | — | admin-only | customer_members, customers |
| GET | `/api/admin/customer-options` | admin-context | none | y | — | — | admin-only | customers |
| GET POST | `/api/admin/customer-person-role-types` | admin-context | manual | y | y | — | admin-only | customer_person_role_types, orgs |
| PATCH DELETE | `/api/admin/customer-person-role-types/[id]` | admin-context | manual | y | y | — | admin-only | customer_person_role_types |
| GET | `/api/admin/customers` | access-scope, admin-context | none | y | — | — | admin-only | contacts, customers, jobs, opportunities, persons, verticals |
| PATCH | `/api/admin/customers/[id]` | admin-context, admin-or-ops | manual | y | y | — | admin-only | customers |
| PATCH | `/api/admin/customers/[id]/household-primary-contact` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/deletion-eligibility` | admin-context | manual | — | — | — | admin-only | — |
| GET | `/api/admin/entity/[type]/[id]` | access-scope, admin-context | none | y | — | — | admin-only | access_methods, assignment_statuses, assignments, cleaning_job_details, contacts, customer_member_contact_roles, +30 |
| GET POST | `/api/admin/financials/accounts` | admin-context | manual | y | y | — | admin-only | gl_accounts |
| GET PATCH | `/api/admin/financials/accounts/[id]` | admin-context | manual | y | y | — | admin-only | gl_accounts |
| GET | `/api/admin/financials/job/[id]` | access-scope, admin-context | manual | y | — | — | admin-only | gl_account_mappings, gl_journal_entries, gl_journal_lines, jobs, schedules |
| GET | `/api/admin/financials/journal-entries` | admin-context | none | y | — | — | admin-only | gl_journal_entries, gl_journal_lines |
| GET | `/api/admin/financials/journal-entries/[id]` | access-scope, admin-context | manual | y | — | — | admin-only | gl_accounts, gl_journal_entries, gl_journal_lines |
| GET | `/api/admin/financials/ledger` | admin-context | none | y | — | — | admin-only | customers, jobs, ledger_transactions, schedules, vendors |
| GET | `/api/admin/financials/ledger/[id]` | admin-context | manual | y | — | — | admin-only | customers, gl_accounts, gl_journal_entries, gl_journal_lines, jobs, ledger_transactions, +2 |
| GET | `/api/admin/financials/schedule/[id]` | access-scope, admin-context | manual | y | — | — | admin-only | gl_accounts, gl_journal_entries, gl_journal_lines, jobs, org_settings, schedules, +1 |
| GET | `/api/admin/financials/snapshot` | admin-context | none | y | — | — | admin-only | — |
| GET | `/api/admin/financials/statements` | admin-context | manual | y | — | — | admin-only | gl_accounts, gl_journal_entries, gl_journal_lines |
| POST | `/api/admin/intake/record-resolution` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/jobs` | access-scope, admin-context | manual | y | y | — | admin-only | contacts, customers, departments, jobs, locations, persons, +4 |
| GET PATCH | `/api/admin/jobs/[id]` | access-scope, admin-context | manual | y | y | — | admin-only | contacts, customers, job_statuses, jobs, persons, vendors, +3 |
| POST | `/api/admin/jobs/[id]/apply-vendor-to-upcoming` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | jobs, workflows |
| POST | `/api/admin/jobs/[id]/archive` | access-scope, admin-context | manual | y | y | — | admin-only | jobs |
| POST | `/api/admin/jobs/[id]/assign-vendor` | access-scope, admin-context | manual | y | y | — | admin-only | jobs, org_settings, schedules, vendors |
| POST | `/api/admin/jobs/[id]/charges` | access-scope, admin-context | manual | y | y | — | admin-only | charges, jobs |
| PATCH | `/api/admin/jobs/[id]/location` | access-scope, admin-context | manual | y | y | — | admin-only | jobs, locations |
| GET | `/api/admin/jobs/[id]/payment-collect-context` | access-scope, admin-context | manual | y | — | — | admin-only | customer_payment_methods, customers, jobs, schedules |
| GET | `/api/admin/jobs/[id]/payments` | access-scope, admin-context | manual | y | — | — | admin-only | jobs, payments |
| GET | `/api/admin/jobs/[id]/payout` | access-scope, admin-context | manual | y | — | — | admin-only | jobs, org_settings, schedules, vendors |
| POST | `/api/admin/jobs/[id]/unarchive` | access-scope, admin-context | manual | y | y | — | admin-only | jobs |
| GET | `/api/admin/jobs/[id]/vendors-for-assign` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | jobs, vendor_verticals, vendors |
| GET | `/api/admin/location-options` | admin-context | none | y | — | — | admin-only | locations |
| GET PATCH POST | `/api/admin/location-program-categories` | admin-context | manual | y | y | — | admin-only | location_program_categories, locations |
| GET | `/api/admin/location-types` | admin-context | none | y | — | — | admin-only | location_types |
| GET POST | `/api/admin/locations` | admin-context | manual | y | y | — | admin-only | customers, field_definitions, field_values, location_types, locations |
| PATCH | `/api/admin/locations/[id]` | admin-context | manual | y | y | — | admin-only | location_types, locations |
| GET POST | `/api/admin/operational-tasks` | admin-context-light | schema | y | — | — | admin-only | — |
| PATCH | `/api/admin/operational-tasks/[id]` | admin-context, admin-or-ops | schema | y | — | — | admin-only | — |
| PATCH | `/api/admin/opportunities/[id]` | access-scope, admin-context | schema | y | y | — | admin-only | locations, opportunities, work_units |
| GET | `/api/admin/opportunities/[id]/activity-signal` | access-scope, admin-context | manual | y | — | y | admin-only | opportunities |
| GET POST | `/api/admin/opportunities/[id]/decision-split` | admin-context, admin-or-ops | manual | y | — | — | admin-only | departments, opportunities |
| POST | `/api/admin/opportunities/[id]/delete` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/opportunities/[id]/delete-preview` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/opportunities/[id]/drawer-operational-bootstrap` | route-gate | schema | y | — | — | admin-only | — |
| POST | `/api/admin/opportunities/[id]/enrollment-packet-launch` | access-scope, admin-context, admin-or-ops | schema | y | — | y | admin-only | communication_messages, communication_provider_bindings, customer_members, customers, form_packet_definitions, opportunities, +2 |
| GET | `/api/admin/opportunities/[id]/enrollment-packets` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | form_definitions, form_packet_definitions, form_packet_items, form_packet_session_items, form_packet_sessions, form_public_links, +1 |
| POST | `/api/admin/opportunities/[id]/form-send` | admin-context | none | y | — | — | admin-only | — |
| GET | `/api/admin/opportunities/[id]/intake-source` | admin-context, admin-or-ops | manual | y | — | — | admin-only | form_definitions, form_submissions |
| GET | `/api/admin/opportunities/[id]/placement-candidates` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/opportunities/[id]/stage-transition-reconciliation/preflight` | admin-context | manual | y | — | — | admin-only | opportunities |
| POST | `/api/admin/opportunity-customer-members` | admin-context, admin-or-ops | manual | y | y | — | admin-only | customer_members, opportunities, opportunity_customer_members |
| PATCH | `/api/admin/opportunity-customer-members/[id]` | admin-context, admin-or-ops | schema | y | y | — | admin-only | opportunity_customer_members |
| GET | `/api/admin/opportunity-options` | admin-context | none | y | — | — | admin-only | opportunities |
| GET | `/api/admin/payments` | access-scope, admin-context, admin-or-ops | none | y | — | — | admin-only | charges, customers, jobs, payment_allocations, payments |
| PATCH | `/api/admin/payments/[id]` | access-scope, admin-context, admin-or-ops | manual | y | y | — | admin-only | payments |
| POST | `/api/admin/payments/run` | admin-context, require-admin | schema | y | — | y | admin-only | — |
| GET | `/api/admin/person-options` | admin-context | none | y | — | — | admin-only | contacts, customer_persons, persons |
| GET POST | `/api/admin/person-relationship-type-settings` | admin-context | manual | y | y | — | admin-only | orgs, person_relationship_type_settings |
| PATCH DELETE | `/api/admin/person-relationship-type-settings/[id]` | admin-context | manual | y | y | — | admin-only | person_relationship_type_settings |
| GET POST | `/api/admin/persons` | access-scope, admin-context | manual | y | y | — | admin-only | contacts, customer_members, customer_persons, persons |
| PATCH | `/api/admin/persons/[id]` | admin-context | manual | y | y | — | admin-only | persons |
| POST | `/api/admin/placement-candidates/[candidateId]/manual-position` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | placement_candidates |
| POST | `/api/admin/placement-candidates/[candidateId]/overrides` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | placement_candidates |
| POST | `/api/admin/placement-candidates/[candidateId]/overrides/[overrideId]/release` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | placement_candidates |
| GET | `/api/admin/processing/cases/[caseId]` | admin-context | none | y | — | — | admin-only | — |
| POST | `/api/admin/processing/cases/[caseId]/approve` | admin-context | none | y | — | — | admin-only | processing_case_sources, processing_cases |
| PATCH | `/api/admin/processing/cases/[caseId]/classification` | admin-context | schema | y | — | — | admin-only | processing_cases |
| POST | `/api/admin/processing/cases/[caseId]/form-draft` | admin-context | none | y | — | — | admin-only | processing_cases |
| POST | `/api/admin/processing/cases/[caseId]/form-draft/create` | admin-context | none | y | — | — | admin-only | — |
| POST | `/api/admin/processing/cases/[caseId]/form-draft/save` | admin-context | none | y | — | — | admin-only | documents, processing_case_sources, processing_cases |
| GET | `/api/admin/processing/cases/[caseId]/recommendation` | admin-context | none | y | — | — | admin-only | processing_case_sources, processing_cases |
| GET | `/api/admin/processing/queue` | admin-context | none | y | — | — | admin-only | processing_cases |
| GET | `/api/admin/related/[entity]/[id]` | admin-context | manual | y | — | — | admin-only | assignments, contacts, customer_member_contact_roles, customer_member_contacts, customer_members, customer_person_role_types, +23 |
| GET POST | `/api/admin/schedule-assignments` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/schedule-patterns` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| PATCH | `/api/admin/schedule-patterns/[id]` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/schedules` | access-scope, admin-context | manual | y | y | — | admin-only | assignments, customers, jobs, locations, schedules, vendors, +1 |
| GET PATCH | `/api/admin/schedules/[id]` | access-scope, admin-context | manual | y | y | — | admin-only | assignments, customers, jobs, schedules, vendors |
| POST | `/api/admin/schedules/[id]/assign` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | schedules, workflows |
| PATCH | `/api/admin/schedules/[id]/assignment` | access-scope, admin-context, admin-or-ops | manual | y | y | — | admin-only | assignment_statuses, assignments, schedules, workflows |
| POST | `/api/admin/schedules/[id]/cancel` | access-scope, admin-context | manual | y | y | — | admin-only | schedules |
| PATCH | `/api/admin/schedules/[id]/location` | access-scope, admin-context | manual | y | y | — | admin-only | locations, schedules |
| POST | `/api/admin/schedules/[id]/post-completion` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/schedules/[id]/post-customer-payment` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/schedules/[id]/post-vendor-payout` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/schedules/[id]/reschedule` | access-scope, admin-context | manual | y | y | — | admin-only | assignment_statuses, assignments, jobs, schedules, workflows |
| GET | `/api/admin/schedules/[id]/vendors-for-assign` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | jobs, schedules, vendor_verticals, vendors |
| PATCH | `/api/admin/subscriptions/[id]` | admin-context, admin-or-ops | manual | y | y | — | admin-only | customer_subscriptions, customers |
| POST | `/api/admin/subscriptions/[id]/generate-next` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/tours/availability-rules` | admin-context, admin-or-ops | manual | y | y | — | admin-only | locations, tour_availability_rules |
| PATCH DELETE | `/api/admin/tours/availability-rules/[ruleId]` | admin-context, admin-or-ops | manual | y | y | — | admin-only | locations, tour_availability_rules |
| POST | `/api/admin/tours/bookings` | admin-context, admin-or-ops | manual | y | — | — | admin-only | locations |
| POST | `/api/admin/tours/bookings/[bookingId]/cancel` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/tours/bookings/[bookingId]/complete` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/tours/bookings/[bookingId]/confirm` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/tours/bookings/[bookingId]/no-show` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/tours/bookings/[bookingId]/reschedule` | admin-context, admin-or-ops | manual | y | — | — | admin-only | locations, opportunities, tour_bookings |
| GET | `/api/admin/tours/opportunities/[opportunityId]/bookings` | admin-context, admin-or-ops | manual | y | — | — | admin-only | opportunities, tour_bookings |
| POST | `/api/admin/tours/public-booking-links` | admin-context, admin-or-ops, token | manual | y | y | — | admin-only | locations, tour_public_booking_links |
| GET | `/api/admin/tours/slots` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/vendor-options` | admin-context | none | y | — | — | admin-only | vendors |
| GET | `/api/admin/vendors` | admin-context | none | y | — | — | admin-only | vendors |
| PATCH | `/api/admin/vendors/[id]` | admin-context, admin-or-ops | manual | y | y | — | admin-only | vendors |
| POST | `/api/admin/vendors/[id]/contacts` | admin-context, admin-or-ops | manual | y | y | — | admin-only | vendor_contacts |
| DELETE | `/api/admin/vendors/[id]/contacts/[contactId]` | admin-context, admin-or-ops | manual | y | y | — | admin-only | vendor_contacts |
| GET | `/api/admin/vendors/[id]/contacts/available` | admin-context, admin-or-ops | manual | y | — | — | admin-only | contacts, vendor_contacts |
| GET | `/api/admin/vendors/[id]/documents/signed-url` | admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/vendors/[id]/payout` | admin-context | manual | y | — | — | admin-only | org_settings, schedules, vendors |
| PATCH | `/api/admin/vendors/[id]/payout-policy` | admin-context | manual | y | y | — | admin-only | vendors |

## Business Process / Status / Lifecycle

Detailed conventions: [`business-process-api.md`](business-process-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| GET PUT POST | `/api/admin/business-process-layout-assignments` | admin-context | schema | y | — | — | admin-only | — |
| GET PATCH DELETE | `/api/admin/departments/[departmentId]` | access-scope, admin-context | manual | y | y | — | admin-only | departments, work_units |
| GET PUT | `/api/admin/departments/[departmentId]/lifecycle-actions-matrix` | access-scope, admin-context | manual | y | y | — | admin-only | departments |
| GET PATCH DELETE | `/api/admin/departments/[departmentId]/lifecycle-activation` | access-scope, admin-context | manual | y | y | — | admin-only | departments |
| GET | `/api/admin/departments/[departmentId]/lifecycle-activation/validate` | access-scope, admin-context | schema | y | — | — | admin-only | departments |
| GET PATCH | `/api/admin/departments/[departmentId]/lifecycle-builder` | access-scope, admin-context | manual | y | y | — | admin-only | departments |
| GET | `/api/admin/departments/[departmentId]/lifecycle-queue-filter-audit` | access-scope, admin-context | manual | y | — | — | admin-only | departments |
| GET PATCH | `/api/admin/departments/[departmentId]/lifecycle-requirements` | access-scope, admin-context | manual | y | y | — | admin-only | departments |
| GET | `/api/admin/departments/[departmentId]/operational-bootstrap` | route-gate | manual | y | — | — | admin-only | — |
| GET | `/api/admin/departments/[departmentId]/opportunity-attention-preview` | route-gate | manual | y | — | — | admin-only | departments |
| GET | `/api/admin/departments/[departmentId]/opportunity-lifecycle-kpis` | access-scope, admin-context | manual | y | — | — | admin-only | opportunities, work_units |
| GET | `/api/admin/departments/[departmentId]/persistence-audit` | route-gate | none | y | — | — | internal | — |
| GET | `/api/admin/departments/[departmentId]/pipeline-exact-count` | admin-context | manual | y | — | — | admin-only | work_units |
| GET | `/api/admin/departments/[departmentId]/work-unit-queue-summaries` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/enrollment-process/form-coverage` | access-scope, admin-context | manual | y | — | — | admin-only | departments, form_definition_versions, form_public_links |
| GET POST | `/api/admin/enrollment-process/stage-actions` | admin-context, admin-or-ops | manual | y | y | — | admin-only | action_placements, departments |
| POST | `/api/admin/enrollment-process/stage-runtime-config` | access-scope, admin-context, admin-or-ops | schema | y | — | — | admin-only | departments |
| GET POST PATCH DELETE | `/api/admin/enrollment-process/stage-work-unit` | access-scope, admin-context, admin-or-ops | schema | y | y | — | admin-only | departments, opportunities, work_units |
| GET PATCH | `/api/admin/enrollment-process/status-stages` | access-scope, admin-context | schema | y | y | — | admin-only | departments, status_definitions |
| POST | `/api/admin/enrollment-status-transition/context` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/enrollment-status-transition/execute` | admin-context, admin-or-ops | schema | y | — | y | admin-only | — |
| POST | `/api/admin/enrollment-status-transition/preflight` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/job-statuses` | admin-context | none | y | — | — | admin-only | job_statuses |
| POST | `/api/admin/lifecycle-builder/complete-stage-work` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/lifecycle-builder/process-work-views` | access-scope, admin-context | manual | y | — | — | admin-only | departments |
| GET | `/api/admin/lifecycle-builder/queue-membership-status-options` | access-scope, admin-context | manual | y | — | — | admin-only | departments |
| GET | `/api/admin/lifecycle-builder/stage-bootstrap` | access-scope, admin-context | manual | y | — | — | admin-only | departments |
| GET | `/api/admin/lifecycle-builder/stage-work-outcomes` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/lifecycle-catalog/attach-records` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/lifecycle-catalog/cleanup-test` | admin-context | none | y | — | — | internal | — |
| POST | `/api/admin/lifecycle-catalog/delete` | access-scope, admin-context | manual | y | y | — | admin-only | departments |
| POST | `/api/admin/lifecycle-catalog/repair` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/lifecycle-catalog/repair-work-units` | access-scope, admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/lifecycle/action-intake-spec` | admin-context, admin-or-ops | manual | y | — | — | admin-only | departments |
| GET POST | `/api/admin/pipeline-stages` | admin-context, require-admin | manual | y | y | — | admin-only | pipeline_stages, pipelines |
| PATCH DELETE | `/api/admin/pipeline-stages/[id]` | admin-context, require-admin | manual | y | y | — | admin-only | pipeline_stages |
| GET POST | `/api/admin/pipelines` | admin-context, require-admin | manual | y | y | — | admin-only | pipelines |
| PATCH DELETE | `/api/admin/pipelines/[id]` | admin-context, require-admin | manual | y | y | — | admin-only | pipelines |
| GET | `/api/admin/schedule-statuses` | admin-context | none | y | — | — | admin-only | schedule_statuses |
| GET POST | `/api/admin/status-definitions` | admin-context | schema | y | y | — | admin-only | status_definitions |
| PATCH DELETE | `/api/admin/status-definitions/[id]` | admin-context | schema | y | y | — | admin-only | status_definitions |
| GET | `/api/admin/status-definitions/inventory` | admin-context | none | y | — | — | admin-only | — |
| GET | `/api/admin/status-options` | admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/admin/status-transition-rules` | admin-context, admin-or-ops | none | y | — | — | admin-only | status_transition_rules |
| GET | `/api/admin/vendor-statuses` | admin-or-ops | none | y | — | — | admin-only | vendor_statuses |

## Actions / Workflows

Detailed conventions: [`actions-workflows-api.md`](actions-workflows-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/action-links/consume-accept-job` | public-org, token | manual | y | y | y | public/tokenized | action_links, contacts, customers, jobs, opportunities, vendors, +1 |
| POST | `/api/action-links/consume-reschedule` | none-detected | manual | y | y | — | public/tokenized | action_links, schedules, workflows |
| GET | `/api/action-links/resolve` | none-detected | none | y | — | — | public/tokenized | action_links |
| GET | `/api/action/[token]` | token | manual | y | — | — | public/tokenized | action_links |
| POST | `/api/action/[token]/consume` | public-org | manual | y | y | — | public/tokenized | action_links, workflows |
| PATCH | `/api/admin/action-definitions/[id]` | admin-context | schema | y | y | y | admin-only | action_definitions |
| POST | `/api/admin/action-placements` | admin-context | schema | y | y | y | admin-only | action_definitions, action_placements |
| PATCH DELETE | `/api/admin/action-placements/[id]` | admin-context | schema | y | y | y | admin-only | action_placements |
| GET | `/api/admin/actions` | route-gate | schema | y | — | — | admin-only | work_units |
| GET | `/api/admin/actions/definition-catalog` | admin-context, admin-or-ops | none | y | — | — | admin-only | action_definitions |
| POST | `/api/admin/actions/eligibility` | access-scope, admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/actions/execute` | access-scope, admin-context, admin-or-ops | schema | y | — | y | admin-only | — |
| GET | `/api/admin/actions/inventory` | admin-context, admin-or-ops | none | y | — | — | admin-only | action_definitions, action_placements |
| POST | `/api/admin/actions/preflight` | admin-context, admin-or-ops | zod | y | — | — | admin-only | — |
| GET | `/api/admin/actions/right-rail-bundle` | route-gate | manual | — | — | — | admin-only | — |
| GET | `/api/admin/actions/workspace-root-bundle` | route-gate | none | — | — | — | admin-only | — |
| GET | `/api/admin/record-actions` | admin-context | manual | y | — | — | admin-only | record_actions |
| POST | `/api/admin/relationship-actions/add-emergency-contact` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/relationship-actions/execute` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/workflow-events` | admin-context, admin-or-ops | none | y | — | y | admin-only | workflow_events |
| GET | `/api/admin/workflow-runs` | admin-context-light | none | y | — | y | admin-only | workflow_action_runs, workflow_events, workflow_runs, workflows |
| GET | `/api/admin/workflow-runs/[runId]` | admin-context, admin-or-ops | manual | y | — | y | admin-only | workflow_action_runs, workflow_events, workflow_runs, workflows |
| GET | `/api/admin/workflow-runs/[runId]/action-runs` | admin-context, admin-or-ops | manual | y | — | — | admin-only | workflow_action_runs, workflow_runs |
| GET POST | `/api/admin/workflows` | admin-context, require-admin | manual | y | y | — | admin-only | workflows |
| GET PATCH DELETE | `/api/admin/workflows/[id]` | admin-context, require-admin | manual | y | y | — | admin-only | workflow_actions, workflow_conditions, workflows |
| GET PUT | `/api/admin/workflows/[id]/actions` | admin-context, require-admin | manual | y | y | — | admin-only | workflow_actions |
| GET PUT | `/api/admin/workflows/[id]/conditions` | admin-context, require-admin | manual | y | y | — | admin-only | workflow_conditions |
| POST | `/api/admin/workflows/[id]/run` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/workflows/debug-vendor-enrichment` | admin-context, admin-or-ops | manual | y | — | — | internal | vendor_statuses, vendor_verticals, vendors, verticals |
| GET | `/api/admin/workflows/field-catalog` | admin-context, admin-or-ops | manual | y | y | — | admin-only | rpc:get_workflow_entity_columns |
| GET | `/api/admin/workflows/summary` | admin-context-light | none | y | — | — | admin-only | workflow_action_runs, workflow_actions, workflow_runs, workflows |

## Documents / Forms

Detailed conventions: [`documents-forms-api.md`](documents-forms-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| GET POST | `/api/admin/document-field-definitions` | admin-context | manual | y | y | — | admin-only | document_field_definitions |
| PATCH DELETE | `/api/admin/document-field-definitions/[id]` | admin-context | manual | y | y | — | admin-only | document_field_definitions |
| PATCH | `/api/admin/documents/[id]` | admin-context | manual | y | y | — | admin-only | documents |
| GET | `/api/admin/documents/[id]/signed-url` | admin-context | manual | y | — | — | admin-only | documents |
| GET | `/api/admin/documents/entity-options` | admin-context | manual | y | — | — | admin-only | contacts, customers, jobs, opportunities, persons, schedules, +1 |
| POST | `/api/admin/documents/upload` | admin-context | manual | y | y | — | admin-only | documents |
| GET POST | `/api/admin/forms` | admin-context | manual | y | — | — | admin-only | — |
| GET PATCH | `/api/admin/forms/[formId]` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/forms/[formId]/archive` | admin-context | none | y | — | — | admin-only | — |
| POST | `/api/admin/forms/[formId]/duplicate` | admin-context | none | y | — | — | admin-only | — |
| GET PATCH | `/api/admin/forms/[formId]/lifecycle-coverage` | access-scope, admin-context | manual | y | — | — | admin-only | form_definitions |
| GET | `/api/admin/forms/[formId]/outcome-labels` | access-scope, admin-context | none | y | — | — | admin-only | — |
| GET POST | `/api/admin/forms/[formId]/public-links` | admin-context, token | schema | y | — | — | admin-only | locations |
| PATCH | `/api/admin/forms/[formId]/public-links/[linkId]` | admin-context, token | schema | y | — | — | admin-only | — |
| POST | `/api/admin/forms/[formId]/versions` | admin-context | schema | y | — | — | admin-only | — |
| GET PATCH | `/api/admin/forms/[formId]/versions/[versionId]` | admin-context | schema | y | — | — | admin-only | — |
| POST | `/api/admin/forms/[formId]/versions/[versionId]/archive` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/forms/[formId]/versions/[versionId]/publish` | admin-context | schema | y | — | — | admin-only | — |
| GET | `/api/admin/forms/crm-entity-search` | admin-context, token | manual | y | — | — | admin-only | customer_members, customers, opportunities, persons |
| GET POST | `/api/admin/forms/packet-definitions` | admin-context | manual | y | y | — | admin-only | form_packet_definitions |
| GET PATCH | `/api/admin/forms/packet-definitions/[packetDefId]` | admin-context | manual | y | y | — | admin-only | form_definition_versions, form_packet_definitions, form_packet_items |
| PUT | `/api/admin/forms/packet-definitions/[packetDefId]/items` | admin-context | manual | y | y | — | admin-only | form_definition_versions, form_definitions, form_packet_definitions, form_packet_items, form_packet_sessions |
| GET | `/api/admin/forms/packet-definitions/[packetDefId]/public-links` | admin-context | none | y | — | — | admin-only | form_packet_definitions, form_public_links |
| POST | `/api/admin/forms/packet-links` | admin-context | none | y | — | — | admin-only | — |
| GET | `/api/admin/forms/packet-sessions` | admin-context | none | y | — | — | admin-only | form_packet_sessions |
| GET | `/api/admin/forms/packet-sessions/[packetSessionId]` | admin-context | none | y | — | — | admin-only | form_definitions, form_packet_items, form_packet_session_items, form_packet_sessions |
| PATCH | `/api/admin/forms/packet-sessions/[packetSessionId]/review` | admin-context, admin-or-ops | manual | y | y | — | admin-only | form_packet_sessions |
| GET | `/api/admin/forms/packet-sessions/[packetSessionId]/review-insight` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/forms/packet-sessions/[packetSessionId]/review-rollup` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/forms/submissions` | admin-context | schema | y | — | — | admin-only | — |
| GET | `/api/admin/forms/submissions/[submissionId]` | admin-context | none | y | — | — | admin-only | — |
| POST | `/api/admin/forms/submissions/[submissionId]/confirm-linkage` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/forms/submissions/[submissionId]/generate-document` | admin-context | none | y | — | — | admin-only | — |
| POST | `/api/admin/forms/submissions/[submissionId]/manual-link` | admin-context | manual | y | — | — | admin-only | customer_members, opportunities |
| POST | `/api/admin/forms/submissions/[submissionId]/submit` | admin-context | schema | y | — | — | admin-only | — |
| GET | `/api/admin/pos/documents` | admin-context | none | y | — | — | admin-only | documents, processing_case_sources, processing_cases |
| DELETE | `/api/admin/pos/documents/[id]` | admin-context | none | y | y | — | admin-only | documents, processing_case_sources, processing_cases |
| GET | `/api/admin/pos/documents/[id]/extracted-text` | admin-context | none | y | — | — | admin-only | documents |
| GET | `/api/admin/pos/packets` | admin-context | none | y | — | — | admin-only | customer_members, form_definitions, form_packet_definitions, form_packet_items, form_packet_sessions, form_public_links, +1 |
| POST | `/api/admin/pos/packets/compose` | admin-context | manual | y | y | — | admin-only | form_packet_definitions, form_packet_items |
| POST | `/api/admin/pos/packets/from-template` | admin-context, token | none | y | — | — | admin-only | — |
| GET | `/api/admin/pos/packets/roster` | admin-context | none | y | — | — | admin-only | — |
| GET | `/api/public/forms/[token]/resolve` | token | zod | y | — | — | public/tokenized | — |
| POST | `/api/public/forms/[token]/submissions` | token | zod | y | y | — | public/tokenized | form_definitions, form_packet_session_items, form_packet_sessions, form_submissions |
| GET PATCH | `/api/public/forms/[token]/submissions/[submissionId]` | token | zod | y | y | — | public/tokenized | form_definition_versions, form_submissions |
| POST | `/api/public/forms/[token]/submissions/[submissionId]/submit` | token | zod | y | y | — | public/tokenized | form_definition_versions, form_packet_session_items, form_submissions |

## Communications

Detailed conventions: [`communications-api.md`](communications-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| GET POST | `/api/admin/communication-scheduled-sends` | admin-context, admin-or-ops | schema | y | — | — | admin-only | — |
| PATCH | `/api/admin/communication-scheduled-sends/[id]` | admin-context, admin-or-ops | schema | y | — | — | admin-only | — |
| POST | `/api/admin/communication-scheduled-sends/process-due` | admin-context, admin-or-ops, cron-token | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/communications/announcements` | admin-context, admin-or-ops | schema | y | y | — | admin-only | announcements |
| GET PATCH | `/api/admin/communications/announcements/[id]` | admin-context, admin-or-ops | schema | y | y | — | admin-only | announcement_targets, announcements |
| POST | `/api/admin/communications/announcements/[id]/archive` | admin-context, admin-or-ops | manual | y | y | — | admin-only | announcements |
| POST | `/api/admin/communications/announcements/[id]/cancel` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/communications/announcements/[id]/recipient-preview` | admin-context, admin-or-ops | manual | y | — | — | admin-only | announcement_targets, announcements |
| POST | `/api/admin/communications/announcements/[id]/schedule` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET PUT | `/api/admin/communications/announcements/[id]/targets` | admin-context, admin-or-ops | schema | y | y | — | admin-only | announcement_targets, announcements |
| POST | `/api/admin/communications/announcements/recipient-preview` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/communications/bindings` | admin-context-light | none | y | — | — | admin-only | communication_provider_bindings |
| PATCH | `/api/admin/communications/bindings/[bindingId]` | admin-context, admin-or-ops | manual | y | y | — | admin-only | communication_provider_bindings |
| GET | `/api/admin/communications/conversations` | admin-context-light | none | y | — | — | admin-only | communication_message_reads, communication_messages, communication_threads |
| POST | `/api/admin/communications/conversations/[id]/assign` | admin-context, admin-or-ops | manual | y | y | — | admin-only | communication_threads, conversation_assignment_events |
| POST | `/api/admin/communications/conversations/[id]/triage` | admin-context-light | manual | y | y | — | admin-only | communication_threads |
| GET | `/api/admin/communications/deliverability` | admin-context-light | none | y | — | — | admin-only | communication_delivery_events |
| GET | `/api/admin/communications/drawer-recipients` | admin-context-light | manual | y | — | — | admin-only | — |
| POST | `/api/admin/communications/family-note` | admin-context-light | manual | y | — | — | admin-only | customers |
| POST | `/api/admin/communications/family-send` | admin-context-light | manual | y | — | — | admin-only | — |
| GET | `/api/admin/communications/family-workspace` | admin-context-light | manual | y | — | — | admin-only | — |
| GET | `/api/admin/communications/health` | admin-context-light | manual | y | — | — | admin-only | communication_messages |
| POST | `/api/admin/communications/messages/mark-read` | admin-context, admin-or-ops | manual | y | y | — | admin-only | communication_message_reads, communication_messages |
| GET | `/api/admin/communications/person-search` | admin-context, admin-or-ops | manual | y | — | — | admin-only | persons |
| GET PATCH | `/api/admin/communications/preferences` | admin-context-light | manual | y | — | — | admin-only | communication_preferences |
| POST | `/api/admin/communications/send` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/communications/status-options` | admin-context, admin-or-ops | manual | y | — | — | admin-only | status_definitions |
| GET POST | `/api/admin/communications/templates` | admin-context, admin-or-ops | schema | y | y | — | admin-only | communication_template_versions, communication_templates |
| GET PATCH | `/api/admin/communications/templates/[id]` | admin-context, admin-or-ops | schema | y | y | — | admin-only | communication_template_versions, communication_templates |
| POST | `/api/admin/communications/templates/[id]/archive` | admin-context, admin-or-ops | manual | y | y | — | admin-only | communication_templates |
| POST | `/api/admin/communications/templates/[id]/preview` | admin-context, admin-or-ops | manual | y | — | — | admin-only | communication_template_versions, communication_templates |
| GET | `/api/admin/communications/threads` | admin-context-light | schema | y | — | — | admin-only | communication_messages, communication_threads |
| GET | `/api/admin/communications/threads/[threadId]/messages` | admin-context, admin-or-ops | manual | y | — | — | admin-only | communication_message_reads, communication_messages, communication_threads |
| GET | `/api/admin/communications/unread-count` | admin-context-light | none | y | — | — | admin-only | communication_message_reads, communication_messages |
| GET | `/api/admin/inbox/threads` | admin-context-light | none | y | — | — | admin-only | — |
| PATCH | `/api/admin/inbox/threads/[threadId]` | admin-context-light, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/webhooks/resend` | provider-signature | manual | y | — | — | webhook | — |
| POST | `/api/webhooks/twilio/sms-status` | provider-signature | none | — | — | — | webhook | — |
| POST | `/api/webhooks/twilio/sms-status/[binding_id]` | none-detected | none | — | — | — | webhook | — |

## AI / BOS

Detailed conventions: [`ai-bos-api.md`](ai-bos-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/admin/agent/v0/queue-definition` | admin-context | none | y | — | — | experimental | work_units |
| GET | `/api/admin/agent/v1/activity` | admin-context-light | none | y | — | — | experimental | agent_v1_record_layout_apply_audit, agent_v1_record_layout_proposals, record_overview_layouts |
| POST | `/api/admin/agent/v1/record-overview-layout` | admin-context | none | y | — | — | experimental | record_overview_layouts |
| POST | `/api/admin/agent/v2/field-visibility` | admin-context | none | y | — | — | experimental | field_definitions |
| GET | `/api/admin/ai/config-layout-assist/capabilities` | scoped-gate | none | — | — | — | admin-only | — |
| POST | `/api/admin/ai/config-layout-assist/field-setup` | scoped-gate | manual | y | — | — | admin-only | — |
| POST | `/api/admin/ai/config-layout-assist/field-setup/confirm` | scoped-gate | manual | y | — | — | admin-only | — |
| POST | `/api/admin/ai/config-layout-assist/propose` | scoped-gate | manual | y | — | — | admin-only | — |
| POST | `/api/admin/ai/enrich-attention-suggestion` | access-scope, admin-context | manual | y | — | — | admin-only | org_settings |
| POST | `/api/admin/ai/task-assist/apply` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| GET | `/api/admin/ai/task-assist/entity-search` | access-scope, admin-context, admin-or-ops, token | manual | y | — | — | admin-only | — |
| GET POST | `/api/admin/ai/task-assist/proposals` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/ai/task-assist/proposals/[id]/approve` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/ai/task-assist/proposals/[id]/reject` | admin-context, admin-or-ops | manual | y | — | — | admin-only | — |
| POST | `/api/admin/ai/task-assist/propose` | access-scope, admin-context | schema | y | — | — | admin-only | org_settings |
| POST | `/api/admin/ai/workflow-assist/apply` | admin-context, require-admin | schema | y | — | — | admin-only | — |
| GET | `/api/admin/ai/workflow-assist/capabilities` | admin-context-light, require-admin | none | — | — | — | admin-only | — |
| GET | `/api/admin/ai/workflow-assist/explain` | admin-context, admin-or-ops | none | y | — | y | admin-only | — |
| POST | `/api/admin/ai/workflow-assist/propose` | access-scope, admin-context, require-admin | manual | y | — | — | admin-only | org_settings, workflows |
| GET POST | `/api/admin/config-layout-assist/proposals` | scoped-gate | manual | y | — | — | experimental | — |
| GET | `/api/admin/config-layout-assist/proposals/[id]` | scoped-gate | manual | y | — | — | experimental | — |
| POST | `/api/admin/config-layout-assist/proposals/[id]/apply` | scoped-gate | manual | y | y | — | experimental | config_layout_assist_proposals |
| PATCH | `/api/admin/config-layout-assist/proposals/[id]/state` | scoped-gate | manual | y | — | — | experimental | — |

## Internal / System / Diagnostics

Detailed conventions: [`internal-system-api.md`](internal-system-api.md).

| Methods | Path | Auth | Val | SR | W | E | Stability | Tables / RPC |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/admin/access-scope-debug` | route-gate | none | y | — | — | internal | user_access_profiles |
| GET | `/api/admin/db-relationships` | admin-context | none | y | — | — | internal | customer_person_role_types, customer_persons, customers, person_relationship_type_settings, person_relationships, persons |
| GET | `/api/admin/debug/context` | admin-context | none | y | — | — | internal | orgs |
| POST | `/api/admin/debug/platform-perf-trace` | admin-context | manual | — | — | — | internal | — |
| POST | `/api/admin/dev/create-org` | admin-context | manual | y | — | — | internal | — |
| POST | `/api/admin/send-password-reset` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/tenant-bootstrap` | admin-context | manual | y | — | — | admin-only | — |
| POST | `/api/admin/vertical-bootstrap` | admin-context | manual | y | — | — | admin-only | — |
| GET | `/api/book-v2/availability` | public-org | none | y | — | — | public/tokenized | schedules |
| POST | `/api/book-v2/confirm` | public-org | manual | y | y | y | public/tokenized | cleaning_job_details, customer_persons, customer_subscriptions, customers, discount_redemptions, jobs, +8 |
| POST | `/api/book-v2/ensure-customer` | public-org | manual | y | — | — | public/tokenized | verticals |
| POST | `/api/book-v2/opportunity-discount` | none-detected | manual | y | y | — | public/tokenized | opportunities |
| POST | `/api/book-v2/quote-refine` | none-detected | manual | y | y | — | public/tokenized | locations, opportunities, verticals, rpc:get_quote_pricing |
| POST | `/api/book-v2/quote-start` | public-org | manual | y | y | — | public/tokenized | locations, opportunities, verticals, workflows, rpc:get_quote_pricing |
| POST | `/api/book-v2/service-details` | none-detected | manual | y | y | — | public/tokenized | locations, opportunities |
| POST | `/api/book-v2/specialty-quote-start` | public-org | schema | y | y | — | public/tokenized | documents, locations, opportunities, pipeline_stages, verticals, workflows |
| POST | `/api/book-v2/validate-promo` | none-detected | schema | y | — | — | public/tokenized | — |
| POST | `/api/leads/gutters` | public-org | manual | — | — | — | public/tokenized | — |
| POST | `/api/marketing/demo-request` | none-detected | manual | — | — | — | public/tokenized | — |
| GET | `/api/public/booking-config` | public-org | none | y | — | — | public/tokenized | — |
| GET | `/api/public/field-definitions` | public-org | manual | y | — | — | public/tokenized | field_definitions, field_section_definitions |
| POST | `/api/public/tour-booking/[token]/book` | token | none | y | — | — | public/tokenized | tour_availability_rules |
| GET | `/api/public/tour-booking/[token]/resolve` | token | none | y | — | — | public/tokenized | — |
| GET | `/api/public/tour-booking/[token]/slots` | token | none | y | — | — | public/tokenized | — |
| POST | `/api/vendor-application` | public-org | manual | y | — | — | public/tokenized | — |
| GET | `/api/verticals` | none-detected | none | y | — | — | public/tokenized | verticals |

