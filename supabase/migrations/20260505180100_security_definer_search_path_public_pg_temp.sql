-- SECURITY DEFINER hardening: pin search_path for elevated helpers (no logic changes).

ALTER FUNCTION public.is_org_member(uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.post_ledger_transaction(uuid) SET search_path TO public, pg_temp;
ALTER FUNCTION public.seed_default_rbac(uuid) SET search_path TO public, pg_temp;
