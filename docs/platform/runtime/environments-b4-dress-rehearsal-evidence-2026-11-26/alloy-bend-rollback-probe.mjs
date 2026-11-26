// B4 step 3: does B2's production tenancy check touch a rollback to the old project?
import { readFileSync } from "node:fs";
import { checkProductionTenantIsolation, checkProductionBefore, firstPromotionConfig } from "../../../../scripts/release/release-lib.mjs";
const base = JSON.parse(readFileSync(process.argv[2], "utf8"));
const cfg = firstPromotionConfig(base, "rehearsalnewprojectr");
const BEND = { id: "7803388d-cdee-4afb-89cf-23a137f39423", status: "active", name: "Alloy Bend" };
const out = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
out("1 old project listing holding Alloy Bend -> checkProductionTenantIsolation", checkProductionTenantIsolation(cfg.tenancy, [BEND]));
out("2 the same, Alloy Bend retired", checkProductionTenantIsolation(cfg.tenancy, [{ ...BEND, status: "retired" }]));
const oldMain = "bbfbec76d7795cc3392b0c61e1c8ce829adaf9d2";
const bi = { gitSha: oldMain, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: "vslwnntzzgpnmrpjipat" };
out("3 step-7 production-before (old main on the old ref; reads build-info only, no orgs)", checkProductionBefore({ config: cfg, candidate: { production_before_sha: oldMain }, buildInfo: bi, firstPromotion: true, fingerprint: { tables: "0" } }));
const oldCfg = { ...cfg, environments: { ...cfg.environments, production: { ...cfg.environments.production, supabase_project_ref: "vslwnntzzgpnmrpjipat" } } };
try { firstPromotionConfig({ ...base }, "vslwnntzzgpnmrpjipat"); out("4 first-promotion-config --new-ref <old ref>", "accepted"); } catch (e) { out("4 first-promotion-config --new-ref <old ref>", `refused: ${e.message}`); }
