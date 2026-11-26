// B1: release-lib's own tenancy checks over the org listings the test captured with ORGS_SQL.
// Usage (repo root): node <this> <evidence-dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkProductionTenantIsolation, checkStagingTenancy, parseOrgs } from "../../../../scripts/release/release-lib.mjs";

const ev = process.argv[2];
const { tenancy } = JSON.parse(readFileSync("scripts/release/release-config.json", "utf8"));
// Staging also holds Firefly; it is added so checkStagingTenancy judges only the W-17 row.
const firefly = { id: tenancy.staging_school.id, status: "active", name: tenancy.staging_school.name };
let bad = 0;
for (const tag of ["A-after-chain", "B1-before-retirement", "B2-after-retirement", "B3-after-reapply"]) {
    const orgs = parseOrgs(readFileSync(join(ev, `${tag}-orgs.txt`), "utf8"));
    const prod = checkProductionTenantIsolation(tenancy, orgs);
    const stg = checkStagingTenancy(tenancy, [firefly, ...orgs]);
    const ok = prod.length === 0 && stg.failures.length === 0 && stg.warnings.length === 0;
    if (tag !== "B1-before-retirement" && !ok) bad += 1;
    console.log(`${tag}: ${JSON.stringify(orgs)}`);
    console.log(`  checkProductionTenantIsolation (release-lib.mjs:429) failures=${JSON.stringify(prod)}`);
    console.log(`  checkStagingTenancy failures=${JSON.stringify(stg.failures)} warnings=${JSON.stringify(stg.warnings)}`);
}
console.log(bad ? `RESULT: ${bad} post-migration listing(s) fail` : "RESULT: every post-migration listing passes both checks");
process.exit(bad ? 1 : 0);
