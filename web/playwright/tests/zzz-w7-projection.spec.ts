/** Does the frame settlement carry `cards`, and does it name financials? */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the projection payload, inspected", async ({ page }) => {
    const seen: Record<string, unknown>[] = [];
    page.on("response", async (r) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "");
        if (!/^\/api\//.test(u)) return;
        const entry: Record<string, unknown> = { url: u.split("?")[0], status: r.status() };
        if (/provisioning-answer|frame|settle|work-unit/.test(u)) {
            try {
                const j = (await r.json()) as Record<string, unknown>;
                const dig = (o: unknown, path: string[]): unknown =>
                    path.reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), o);
                const cards = dig(j, ["answer", "operationalProjection", "cards"])
                    ?? dig(j, ["operationalProjection", "cards"])
                    ?? dig(j, ["settlement", "operationalProjection", "cards"]);
                entry.topKeys = Object.keys(j).slice(0, 12);
                entry.cardsPresent = cards != null;
                entry.cardKeys = cards && typeof cards === "object" ? Object.keys(cards as object) : null;
                const fin = cards && typeof cards === "object" ? (cards as Record<string, unknown>).financials : undefined;
                entry.financials = fin == null ? String(fin) : JSON.stringify(fin).slice(0, 220);
            } catch (e) { entry.parse = String(e).slice(0, 60); }
        }
        seen.push(entry);
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(75_000);

    const interesting = seen.filter((s) => "cardsPresent" in s);
    log(`PROJECTION RESPONSES (${interesting.length}):`);
    for (const i of interesting) log(`  ${JSON.stringify(i)}`);
    log(`ALL API PATHS: ${JSON.stringify([...new Set(seen.map((s) => s.url))].slice(0, 25))}`);

    /* Are the sibling producer-backed cards stuck too, or is it financials alone? */
    const siblings = await page.evaluate(() => ({
        financials: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "absent",
        attendanceSkeleton: document.querySelectorAll("[data-attendance-card-skeleton], [data-attendance-empty]").length,
        healthSkeleton: document.querySelectorAll("[data-health-card-skeleton], [data-health-empty]").length,
        cardKeys: [...document.querySelectorAll("[data-universal-card-key]")].map((e) => e.getAttribute("data-universal-card-key")),
    }));
    log(`SIBLINGS: ${JSON.stringify(siblings)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/projection-payload.json`, JSON.stringify({ interesting, siblings, paths: [...new Set(seen.map((s) => s.url))] }, null, 2));
    expect(seen.length).toBeGreaterThan(0);
});
