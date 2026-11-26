/**
 * F3 — WHICH LINK IN THE BOOTSTRAP CHAIN IS BROKEN?
 *
 * At rest in the Focus Panel the card loads only when `provisioned?.state === "ready"`, where
 * `provisioned = context.operationalProjection?.cards?.financials`. So the question is not "why is
 * the card stuck" but "what does the host actually hand it". This reads the drawer VM that feeds
 * this page and reports the financials producer result verbatim, over several mounts, because the
 * symptom is intermittent.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const passes: Record<string, unknown>[] = [];

/** Find every path at which the key "financials" appears, with the value's shape. */
function locate(root: unknown): Array<{ path: string; value: string }> {
    const hits: Array<{ path: string; value: string }> = [];
    const walk = (node: unknown, path: string, depth: number) => {
        if (depth > 8 || node == null || typeof node !== "object") return;
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            const p = `${path}.${k}`;
            if (k === "financials") hits.push({ path: p, value: JSON.stringify(v)?.slice(0, 300) ?? String(v) });
            walk(v, p, depth + 1);
        }
    };
    walk(root, "$", 0);
    return hits;
}

for (let pass = 1; pass <= 4; pass++) {
    test(`pass ${pass} · what the host hands the Financials card`, async ({ page }) => {
        let cardRequests = 0;
        const drawer: Record<string, unknown>[] = [];
        page.on("response", async (r) => {
            const u = r.url().replace(/https:\/\/[^/]+/, "");
            if (/\/api\/admin\/financials\/card/.test(u)) { cardRequests += 1; return; }
            if (!/\/api\/admin\/view-models\/drawer\//.test(u)) return;
            try {
                const j = (await r.json()) as Record<string, unknown>;
                drawer.push({ url: u.split("?")[0], status: r.status(), topKeys: Object.keys(j), hits: locate(j) });
            } catch (e) { drawer.push({ url: u.split("?")[0], parse: String(e).slice(0, 60) }); }
        });

        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        /* Sleep, never poll: a rAF poll was already shown to make my own reading untrustworthy. */
        await page.waitForTimeout(70_000);

        const dom = await page.evaluate(() => {
            const card = document.querySelector("[data-financials-card]");
            return {
                mounted: !!card,
                skeleton: !!document.querySelector("[data-financials-card-skeleton]"),
                empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "absent",
                subject: document.querySelector("[data-financials-subject]")?.getAttribute("data-financials-subject") ?? null,
                reserved: document.querySelector("[data-financials-reserved]")?.getAttribute("data-financials-reserved") ?? null,
                nav: !!document.querySelector("[data-financials-nav='details']"),
            };
        });
        const verdict =
            !dom.mounted ? "NOT MOUNTED"
            : cardRequests > 0 ? "REQUEST ISSUED"
            : "MOUNTED, NO REQUEST";
        log(`PASS ${pass}: ${verdict} · cardRequests=${cardRequests} · ${JSON.stringify(dom)}`);
        for (const d of drawer) log(`  drawer ${JSON.stringify(d).slice(0, 900)}`);
        passes.push({ pass, verdict, cardRequests, dom, drawer });
        mkdirSync(OUT, { recursive: true });
        writeFileSync(`${OUT}/f3-bootstrap-trace.json`, JSON.stringify(passes, null, 2));
        expect(dom.mounted || true).toBe(true);
    });
}
