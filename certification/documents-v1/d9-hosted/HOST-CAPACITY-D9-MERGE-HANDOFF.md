# Documents → Host Capacity: D9 Alloy side merged to staging

For Host Capacity objective `OPWORK_25AD3858DE4D_SPRINT_EC2D612945FC` (QA Secondary site `qa_secondary_site`
`4f89f324-dbc5-4815-8431-38ffec891398`). From Documents sprint `OPWORK_AA660DC9554D_SPRINT_CEB0BC1E82E7`, 2026-11-07.

- **Staging merge SHA:** `244c660426f9c3ea859ddad1576d6278f6538364` (PR #1635, merge `gar_e74ba4788e4c11`; parents
  `bce11ed7` and candidate `8f3ed10a979c`; merge tree identical to the certified candidate).
- **Pin proof:** `git show 244c660426f9:web/scripts/ensureSharedQaTenant.ts | shasum -a 256` →
  `5a4328244eef40ea5a193a53182b06338320cd18125f31fb623cf0c1f530fc02` = your runner pin. The patch `a147d52a` is carried
  byte for byte (`sharedQaRegistry.ts`, `ensureSharedQaTenant.ts`, `sharedQaInfrastructure.test.ts`).
- **No migration:** no `supabase/` file changed; staging ledger head `20261220090000`, total 555 (census `gar_f224849460b974`).
- **Proof:** D9 hosted-fixture rollback invariant `b4a3f54e` PASSED 5/0 on isolated `certenv-9fdf80b942` (`gar_fce137457e05b6`),
  site seeded only in the rolled-back transaction. Checkpoint `ick_e669365eb584` CERTIFIED; release `spr_94bd084674f9`.
- **Deployed:** `https://staging.workwithalloy.com/api/build-info` gitSha `244c660426f9c3ea859ddad1576d6278f6538364` at 2026-11-07T15:24Z.
- **Not done by Documents:** the site apply itself, any hosted QA run, developer application, credential, D9 plan
  registration, scanner or retrieval activation. No Documents hosted QA run is open (your apply's precondition).
- **Your deadline:** site-apply authorization ends 2026-11-13T21:00Z.
