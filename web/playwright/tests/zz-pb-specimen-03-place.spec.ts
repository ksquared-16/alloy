/**
 * §5–§7 continued: give the specimen a placement, then read what tuition now applies.
 *
 * Tuition resolves from program, location and days. The schedule supplied days; the placement
 * supplies the other two. School Age at North Campus is chosen deliberately — it is a program the
 * organisation already prices WEEKLY, and a weekly cadence anchored on today gives exactly one
 * fully-covered canonical period, which is the shape §7 asks for. A monthly term accepted
 * mid-month would be a partial period, and Firefly has no proration policy, so it would refuse.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const AGREEMENT = "9134bf85-e00f-4bc6-8917-a02cda58395f";
const SITE = "1a5644a7-45c4-413b-9021-5f556118b6e2";
const OPP = "ebe6cb44-957b-48f0-9a6d-603670443ec2";
const OCM = "e9965c7c-608e-4f68-a15b-2475374e2ecf";

test("place specimen", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);

    const r = await page.evaluate(async ({ agreement, site, opp, ocm }) => {
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; } };
        const post = async (u: string, b: unknown) => {
            const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) });
            const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; }
        };

        const cats = await get("/api/admin/location-program-categories?include_inactive=true");
        const locs = await get("/api/admin/locations?hierarchy=1");

        /* Rooms under the chosen site, and the program the organisation prices weekly. */
        const flat = JSON.stringify(locs.j);
        const catList = (cats.j as { categories?: Array<Record<string, unknown>> })?.categories
            ?? (Array.isArray(cats.j) ? cats.j as Array<Record<string, unknown>> : []);
        const schoolAge = catList.find((c) => /school\s*age/i.test(String(c.label ?? c.name ?? c.key ?? "")))
            ?? catList[0] ?? null;

        return {
            catsStatus: cats.s,
            categories: catList.map((c) => ({ id: c.id, label: c.label ?? c.name, key: c.key, site: c.site_location_id ?? c.location_id })).slice(0, 25),
            chosenCategory: schoolAge,
            locsStatus: locs.s,
            locSample: flat.slice(0, 900),
            agreement, site, opp, ocm,
        };
    }, { agreement: AGREEMENT, site: SITE, opp: OPP, ocm: OCM });

    log(JSON.stringify(r, null, 1).slice(0, 5000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimen-placement-options.json`, JSON.stringify(r, null, 2));
});
