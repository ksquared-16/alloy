/**
 * The card mounted and said "No assignment on this record to price." That sentence has two very
 * different causes — the pricing read answered with no assignments, or the read never happened
 * because the card could not name an opportunity — and they are told apart by the NETWORK, not by
 * the sentence. So this records every admin request the panel makes and what the subject is.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("what does the panel ask for, and who is the subject", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const reqs: string[] = [];
    page.on("request", (r) => {
        const u = r.url().replace(/^https?:\/\/[^/]+/, "");
        if (u.startsWith("/api/")) reqs.push(`${r.method()} ${u}`);
    });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);

    const dom = await page.evaluate(() => {
        const attrs = (sel: string) =>
            Array.from(document.querySelectorAll(sel)).slice(0, 6).map((e) => {
                const out: Record<string, string> = { tag: e.tagName.toLowerCase() };
                for (const a of Array.from(e.attributes)) if (a.name.startsWith("data-")) out[a.name] = a.value;
                return out;
            });
        return {
            cardHosts: attrs("[data-universal-card-key]"),
            subjectish: attrs("[data-subject-id],[data-subject-type],[data-focus-panel-subject],[data-participant-scope],[data-opportunity-id]"),
            url: location.pathname + location.search,
            tuitionHost: attrs("[data-assignment-tuition]"),
        };
    });

    const financial = reqs.filter((r) => /financial-config/.test(r));
    writeFileSync(`${OUT}/v161-diag.json`, JSON.stringify({ requests: reqs, financial, dom }, null, 2));
    log(`\nURL: ${dom.url}`);
    log(`financial-config requests: ${JSON.stringify(financial)}`);
    log(`card hosts:\n${dom.cardHosts.map((c) => JSON.stringify(c)).join("\n")}`);
    log(`subject-ish:\n${dom.subjectish.map((c) => JSON.stringify(c)).join("\n")}`);
    log(`\nall /api requests (${reqs.length}):\n${[...new Set(reqs)].join("\n")}`);
});
