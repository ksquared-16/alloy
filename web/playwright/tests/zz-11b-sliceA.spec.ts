/** Slice A mounted: accepted-term read-back, billing period, review state, responsive. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("assignment commercial section", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(14_000);

    const read = async () => page.evaluate(() => {
        const sel = document.querySelector("select[data-assignment-tuition-embed='true']") as HTMLSelectElement | null;
        const q = (a: string) => document.querySelector(`[${a}]`);
        const accepted = q("data-assignment-accepted-term") as HTMLElement | null;
        const period = q("data-assignment-billing-period") as HTMLElement | null;
        return {
            embedMarkers: document.querySelectorAll("[data-assignment-tuition-embed]").length,
            regionMarker: document.querySelectorAll("[data-assignment-tuition-region]").length,
            selectIsSelect: sel?.tagName ?? null,
            options: sel ? Array.from(sel.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).textContent?.trim()) : [],
            acceptedState: accepted?.getAttribute("data-assignment-accepted-term") ?? null,
            acceptedText: accepted?.innerText ?? null,
            frequency: period?.getAttribute("data-assignment-billing-frequency") ?? null,
            currentPeriod: period?.getAttribute("data-assignment-billing-period") ?? null,
            nextPeriod: period?.getAttribute("data-assignment-next-billing-period") ?? null,
            periodText: period?.innerText ?? null,
            review: Boolean(q("data-assignment-tuition-review")),
            overrideReasonShown: Boolean(q("data-assignment-override-reason")),
        };
    });
    const before = await read();
    log(`\nCERTA (weekly fixture):\n${JSON.stringify(before, null, 1)}`);

    // Choosing a non-recommended option must reveal the governed reason field, and nothing else.
    const sel = page.locator("select[data-assignment-tuition-embed='true']");
    const values = await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    log(`selectable options: ${values.length}`);
    if (values.length > 1) {
        await sel.selectOption(values[1]);
        await page.waitForTimeout(2500);
        log(`override reason revealed on non-recommended: ${(await read()).overrideReasonShown}`);
    }
    await page.screenshot({ path: `${OUT}/sliceA-assignment.png`, fullPage: true });

    const resp: Record<string, unknown> = {};
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2500);
        resp[w] = await page.evaluate(() => {
            const region = document.querySelector("[data-assignment-tuition-region]") as HTMLElement | null;
            if (!region) return { missing: true };
            const r = region.getBoundingClientRect();
            return {
                width: Math.round(r.width),
                overflowsViewport: r.right > window.innerWidth + 1,
                clipped: region.scrollWidth > region.clientWidth + 1,
                heightPx: Math.round(r.height),
            };
        });
        log(`${w}: ${JSON.stringify(resp[w])}`);
    }
    writeFileSync(`${OUT}/sliceA.json`, JSON.stringify({ before, responsive: resp }, null, 2));
});
