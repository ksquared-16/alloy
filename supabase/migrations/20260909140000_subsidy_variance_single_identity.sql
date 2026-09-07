-- =============================================================================
-- ONE IDENTITY PER VARIANCE, AND ONLY ONE INDEX ENFORCING IT.
--
-- The variance table carried two unique indexes that meant the same thing: `(org_id,
-- idempotency_key)` where the key is `fsv:<claim_line_id>`, and `(org_id, claim_line_id)`. An upsert
-- can name only ONE of them as its conflict target, so under concurrent reconciliation two writers
-- both passed the claim-line arbiter and the loser died on the other index instead of converging.
--
-- The claim line IS the identity — one live variance per line, because a second would double-count
-- the same missing money — so the redundant index goes and the column stays for lineage.
-- =============================================================================

drop index if exists public.financial_subsidy_variances_idempotency_unique;
