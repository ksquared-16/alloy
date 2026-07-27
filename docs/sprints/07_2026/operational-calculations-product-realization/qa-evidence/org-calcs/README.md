# Organization Calculations — proving-slice QA evidence

**Date:** 2026-07-27  
**Slot:** 4 · port 3014  
**DB:** staging `ikaxilmwmrmbagoidedu`  
**Auth:** Slot 4 storage-state  

## Result

Authenticated API proving flow **PASS** — see `api-qa-ledger.json`.

UI captures: `01-authoring-home.png`, `02-draft-saved.png`, `08-locations-context.png`, `09-narrow-layout.png`.

### Certified

1. Create draft `min(physical, licensed)` AST  
2. Evaluate two real rooms (Bears, Giraffe) + effective date  
3. Missing inputs → `not_configured` / ∅ with explanation (staging has no `childcare_capacity_rules`)  
4. Cross-org room rejected (404)  
5. Publish immutable v1 → bind runtime → fork draft → publish v2  
6. Runtime consumer remains on **exact v1** until rebound  
7. Archive removes that calc from the runtime surface  

Unit tests: `tests/organizationCalculations/*`, `organizationCalculationsProvingProduct.test.ts` — pass.
