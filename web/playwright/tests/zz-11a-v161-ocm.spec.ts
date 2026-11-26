/**
 * Is there an assignment at all? `buildOpportunityTuitionViews` reads
 * `opportunity_customer_members` for the opportunity, and answered with none — while the Children
 * card renders both children under an `unlinked:` prefix. Those two facts point at the same thing
 * and it has to be established, not assumed, because "no assignment to price" is either a false
 * unavailable state or the literal truth of this fixture.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OPP = "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";
const ATTN = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const CHILD_B = "46105cd4-6030-417d-a7cb-faf409071c0d";

test("assignment reach", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async ({ opp, attn, childB }) => {
        const j = async (u: string) => {
            const r = await fetch(u, { credentials: "include" });
            const b = await r.json().catch(() => null);
            return { url: u, status: r.status, body: b };
        };
        const related = await j(`/api/admin/related/opportunity/${opp}`);
        const relTxt = JSON.stringify(related.body ?? {});
        return {
            relatedStatus: related.status,
            relatedKeys: related.body && typeof related.body === "object" ? Object.keys(related.body as object) : null,
            relatedMentionsAttn: relTxt.includes(attn),
            relatedMentionsChildB: relTxt.includes(childB),
            ocmIdsInRelated: Array.from(new Set(relTxt.match(/"opportunity_customer_member_id"\s*:\s*"([0-9a-f-]{36})"/g) ?? [])).slice(0, 10),
            relatedSample: relTxt.slice(0, 2500),
            // The attention subject, taken at face value as an assignment id.
            asAssignment: await j(`/api/admin/financial-config/opportunity/${opp}`),
        };
    }, { opp: OPP, attn: ATTN, childB: CHILD_B });
    writeFileSync(`${OUT}/v161-ocm.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify({ ...out, relatedSample: out.relatedSample.slice(0, 1800) }, null, 2).slice(0, 6000));
});
