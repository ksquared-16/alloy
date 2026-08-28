/** The review surface, through the parent's own public door. */
import { test, expect } from "@playwright/test";
const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });

test("the parent reaches their actual document", async ({ page }) => {
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    // Review is a distinct MODE, entered deliberately — the conversation hands off, it does not
    // dump a document underneath itself.
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) {
        await enter.first().click();
        await page.waitForTimeout(9000);
    }

    const seen = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll<HTMLElement>("h1,h2,h3,p,button,span").forEach((el) => {
            if (el.children.length || el.closest(".sr-only")) return;
            const t = (el.innerText || "").trim();
            if (t && t.length < 120) out.push(t);
        });
        return [...new Set(out)];
    });
    console.log("=== SEEN ===\n" + seen.join("\n"));
    console.log("=== document container:", await page.locator("[data-participant-document]").count(), "===");
    console.log("=== rendered page canvases:", await page.locator("[data-participant-document] canvas").count(), "===");
    console.log("=== make-a-change present:", await page.locator("[data-make-a-change]").count(), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 3)), "===");
    // One page at a time, and turning it renders only the new page.
    expect(await page.locator("[data-participant-document] canvas").count(), "one page at a time").toBe(1);
    const nav = page.locator("[data-participant-document-nav]");
    if (await nav.count()) {
        await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
        // Scoped to the document nav: the dev-tools overlay also has a button matching /Next/.
        await nav.getByRole("button", { name: /Next/ }).click();
        await page.waitForTimeout(2500);
        await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
        expect(await page.locator("[data-participant-document] canvas").count()).toBe(1);
        await nav.getByRole("button", { name: /Previous/ }).click();
        await page.waitForTimeout(2000);
        await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
    }
    await page.screenshot({ path: "playwright-report/review-desktop.png", fullPage: false });

    // A phone must review paperwork, not squint at a shrunk desktop PDF.
    await page.setViewportSize({ width: 375, height: 780 });
    await page.waitForTimeout(2500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log("=== 375px horizontal overflow:", overflow, "===");
    expect(overflow, "no sideways shell overflow at 375px").toBeLessThanOrEqual(1);
    const navBox = await page.locator("[data-participant-document-nav] button").first().boundingBox();
    console.log("=== mobile nav button height:", navBox?.height, "===");
    expect(navBox?.height ?? 0, "touch target").toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: "playwright-report/review-375.png", fullPage: false });
});
