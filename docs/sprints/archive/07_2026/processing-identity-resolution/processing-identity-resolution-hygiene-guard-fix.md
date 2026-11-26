# Processing Identity — operatorRuntimeDataHygieneGuards fix

**Status:** Forward hygiene fix for staging (post–PR #192).  
**Branch:** `fix/processing-identity-hygiene-guard`  
**Date:** 2026-07-14

## Problem

`web/tests/adminV2/operatorRuntimeDataHygieneGuards.test.ts` failed on:

- `supabase/migrations/20260717130000_processing_identity_d2_executor.sql`
- `supabase/migrations/20260718130000_processing_identity_d2_rpc_customer_persons_fix.sql`

## Failing SQL pattern

Both files contain `INSERT INTO persons|customers|customer_persons|customer_members` **inside** the dollar-quoted body of `CREATE OR REPLACE FUNCTION public.execute_processing_identity_group(...)`.

Those statements are **not** executed when the migration applies. They run only when the SECURITY DEFINER RPC is invoked by the D2 commit executor (`service_role`) during an approved Commit Plan.

## Doctrine assessment

The hygiene rule’s intent is: **demo/operator record rows must not be seeded by auto-migrations** (migration-time side effects). Allowlisting seed files is for historical applied seeds only.

Classifying RPC function-body `INSERT`s as “migration seeds” is a **false positive**. The D2 pattern is a safe, canonical platform mutation RPC (same class as other SECURITY DEFINER write functions). The migrations do **not** violate operator-runtime data-hygiene doctrine.

## Approach chosen

| Option | Used? | Why |
|--------|-------|-----|
| Rewrite applied D2 migrations in place | **No** | Files are already on `origin/staging` (PR #192); treated as immutable |
| Forward-only corrective migration rewriting the RPC | **No** | Runtime function is already correct; no DB behavior to change |
| Refine the hygiene guard | **Yes** | Rule was incorrectly classifying function-body INSERT as apply-time seed |

Guard change: strip PostgreSQL dollar-quoted bodies before scanning for operator-record `INSERT`s. Top-level seed inserts still fail. No file allowlist for the D2 migrations. Assertions are not weakened.

## Preserved behavior

D2 atomicity, idempotency, rollback, org scoping, semantic-command execution, and `customer_persons` ON CONFLICT `(org_id, customer_id, person_id, role_type)` are unchanged — no migration or RPC body edits.
