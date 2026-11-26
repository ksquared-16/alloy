/**
 * F3 — the decisive fork. In the stuck state, does the host's projection carry a READY financials
 * entry or not?  The Focus Panel load path is gated on `provisioned?.state === "ready"`, so:
 *   · not ready  -> the card is correctly waiting and the defect is in the PRODUCER
 *   · ready      -> the gate passed and the defect is in the EFFECT (scheduled, cancelled, or lost)
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
const DRAWER = "/api/admin/view-models/drawer/opportunity/e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const out: Record<string, unknown>[] = [];

for (let pass = 1; pass <= 4; pass++) {
    test(`pass ${pass} · stuck or resolved, and what the projection said`, async ({ page }) => {
        let cardRequests = 0;
        page.on("response", (r) => { if (/\/api\/admin\/financials\/card/.test(r.url())) cardRequests += 1; });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(60_000);

        const dom = await page.evaluate(() => ({
            mounted: !!document.querySelector("[data-financials-card]"),
            skeleton: !!document.querySelector("[data-financials-card-skeleton]"),
            empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "absent",
            nav: !!document.querySelector("[data-financials-nav='details']"),
        }));
        const stuck = dom.mounted && cardRequests === 0;

        /* Ask the host what it would have handed the card. Read, never a mutation. */
        const projection = await page.evaluate(async (url) => {
            try {
                const res = await fetch(url, { credentials: "include" });
                const j = (await res.json()) as Record<string, unknown>;
                const find = (o: unknown, d = 0): unknown => {
                    if (d > 7 || o == null || typeof o !== "object") return undefined;
                    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
                        if (k === "cards" && v && typeof v === "object") return v;
                        const hit = find(v, d + 1);
                        if (hit !== undefined) return hit;
                    }
                    return undefined;
                };
                const cards = find(j) as Record<string, unknown> | undefined;
                const fin = cards?.financials as Record<string, unknown> | undefined;
                return {
                    status: res.status,
                    topKeys: Object.keys(j).slice(0, 10),
                    cardsFound: !!cards,
                    cardKeys: cards ? Object.keys(cards) : null,
                    financialsPresent: fin !== undefined,
                    financialsState: fin?.state ?? null,
                    financialsKeys: fin ? Object.keys(fin) : null,
                    financialsSample: fin ? JSON.stringify(fin).slice(0, 300) : null,
                };
            } catch (e) { return { error: String(e).slice(0, 120) }; }
        }, DRAWER);

        log(`PASS ${pass}: ${stuck ? "STUCK" : "RESOLVED"} cardRequests=${cardRequests} dom=${JSON.stringify(dom)}`);
        log(`   projection: ${JSON.stringify(projection)}`);
        out.push({ pass, stuck, cardRequests, dom, projection });
        mkdirSync(OUT, { recursive: true });
        writeFileSync(`${OUT}/f3-projection-fork.json`, JSON.stringify(out, null, 2));
        expect(true).toBe(true);
    });
}
