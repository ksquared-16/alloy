import { test } from "@playwright/test";

/**
 * OX SLICE 1 — WHAT THE OPERATOR CAN ACTUALLY NAVIGATE TO, read from the deployed app.
 *
 * The journeys must use real configured surfaces and real records. Inferring them from the repo
 * would measure routes that may not be the ones an operator reaches. This enumerates the live
 * navigation targets on /adminV2/workspace so the seven journeys can be pinned to real specimens.
 */
test("ox1 surface discovery", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(12000);

    const out = await page.evaluate(() => {
        const txt = (e: Element) => (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
        const links = [...document.querySelectorAll("a[href]")]
            .map((a) => ({ href: a.getAttribute("href") ?? "", label: txt(a) }))
            .filter((l) => l.href.startsWith("/") && !l.href.startsWith("//"));
        const uniq = new Map<string, { href: string; label: string }>();
        for (const l of links) if (!uniq.has(l.href)) uniq.set(l.href, l);
        // Clickable non-anchor navigation (tiles, pills, cards) carries its own data attributes.
        const attrs = new Set<string>();
        document.querySelectorAll("*").forEach((el) => {
            for (const a of el.getAttributeNames()) {
                if (/^data-(alloy|workspace|work-unit|lifecycle|surface|queue|focus|nav|tab)/.test(a)) attrs.add(a);
            }
        });
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            title: document.title,
            url: location.pathname,
            links: [...uniq.values()].slice(0, 60),
            dataAttrs: [...attrs].sort().slice(0, 80),
            headings: [...document.querySelectorAll("h1,h2,h3")].map(txt).filter(Boolean).slice(0, 30),
            buttons: [...document.querySelectorAll("button")].map((b) =>
                (b.getAttribute("aria-label") || b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
            ).filter(Boolean).slice(0, 40),
        };
    });
    console.log(`[disc] ${JSON.stringify(out)}`);
});
