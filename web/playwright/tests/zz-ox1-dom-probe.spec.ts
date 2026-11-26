import { test } from "@playwright/test";
/** OX1 — what the queue rows and work-view pills are actually made of, so J4/J5 target real nodes. */
test("ox1 dom probe", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);
    const out = await page.evaluate(() => {
        const sig = (el: Element) => ({
            tag: el.tagName,
            attrs: el.getAttributeNames().filter((a) => a.startsWith("data-") || a === "role" || a === "aria-selected").slice(0, 8),
            cls: (typeof el.className === "string" ? el.className : "").split(" ").filter(Boolean).slice(0, 4),
            text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50),
        });
        const counts: Record<string, number> = {};
        for (const s of ["[data-queue-row-entity-id]", "[data-queue-row]", '[role="row"]', ".alloy-os-queue-row-card",
                         '[role="tab"]', "[data-work-view-pill]", "[data-alloy-work-view]", '[aria-selected="true"]',
                         "[data-universal-card-key]", '[data-alloy-section-id="WU-09"]']) {
            try { counts[s] = document.querySelectorAll(s).length; } catch { counts[s] = -1; }
        }
        // Anything repeated many times with a stable class is a row candidate.
        const byClass: Record<string, number> = {};
        document.querySelectorAll("div,li,button,article").forEach((el) => {
            const c = (typeof el.className === "string" ? el.className : "").split(" ")[0];
            if (c && el.clientHeight > 30) byClass[c] = (byClass[c] || 0) + 1;
        });
        const repeated = Object.entries(byClass).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 12);
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            url: location.pathname + location.search,
            counts, repeated,
            tabs: [...document.querySelectorAll('[role="tab"]')].map(sig).slice(0, 8),
            selected: [...document.querySelectorAll('[aria-selected="true"]')].map(sig).slice(0, 6),
        };
    });
    console.log(`[dom] ${JSON.stringify(out)}`);
});
