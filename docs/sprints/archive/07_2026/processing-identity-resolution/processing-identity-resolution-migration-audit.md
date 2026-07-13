# Processing Identity Resolution V1 — Migration Audit

**Status:** Implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.

**Scope:** Sprint-introduced migrations under `supabase/migrations/` (20260716–20260718 Processing Identity + `has_org_role` fix). Prerequisite Processing case foundation (`20260612120100`, `20260615120000`) predates this sprint and remains a dependency.

## Inventory (replay order)

| Order | File | Purpose | Additive? |
|---:|---|---|---|
| 1 | `20260716120000_processing_identity_b0_tenant_security.sql` | `persons.org_id` FK; org-scoped identity policies | Policy replacement/hardening + FK |
| 2 | `20260716130000_processing_identity_b2_facts.sql` | Facts / evidence; person normalized columns/indexes | Additive |
| 3 | `20260716140000_processing_identity_b3_resolutions.sql` | Durable resolutions + RLS | Additive |
| 4 | `20260717120000`–`20260717126000_processing_identity_d1_*` | Commit plans, ops, approvals, indexes, immutability guards, RLS | Additive (+ guards) |
| 5 | `20260717130000_processing_identity_d2_executor.sql` | Attempts, exceptions, `execute_processing_identity_group` RPC | Additive |
| 6 | `20260718120000_processing_identity_d4_d5_source_kinds.sql` | Allow `create_lead` source_kind | Additive constraint widen |
| 7 | `20260718130000_processing_identity_d2_rpc_customer_persons_fix.sql` | Align RPC ON CONFLICT with `customer_persons` unique key | Function replacement |
| 8 | `20260718140000_has_org_role_security_definer.sql` | Break authenticated `has_org_role` RLS recursion | Function hardening |

## Verification notes

- Ordering is chronological and satifies dependencies (cases → facts → resolutions → plans → executor → source kinds → RPC fix → `has_org_role`).
- Fresh isolated replay succeeded during local certification.
- No V1 migration drops identity business tables or business data.
- Rollback assumption: prefer application deployment rollback; schema reverse only on disposable/no-data staging (see rollback plan).
- No migration defects discovered during this closeout; files were not modified.

## Indexes / policies / functions / triggers

Generated schema docs (`docs/schema/*` and `docs/supabase/reference/*.csv`) should be regenerated against the certified isolated stack after migration replay. Sprint-owned objects: `processing_*` tables, immutability/append-only guards, `execute_processing_identity_group`, org-scoped RLS policies, and hardened `has_org_role`.
