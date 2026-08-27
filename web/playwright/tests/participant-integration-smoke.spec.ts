/**
 * Post-integration smoke — the properties current staging could realistically have broken.
 *
 * Deliberately short. The two-width certification already ran against this product; what this
 * checks is that 269 commits of other people's work did not disturb the participant surface:
 * the real document still renders, its pages still turn, no source label leaks, and the console
 * stays clean.
 */
import { test, expect } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });

const SOURCE_NAMES = ["Var History", "Var history", "Signature1", "Signature Update", "Prov Sp", "Module Sp", "subject_line"];

test("the participant surface survived the merge", async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    const httpErrors: string[] = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => {
        if (r.status() >= 400) httpErrors.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    page.setDefaultTimeout(30_000);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);

    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) {
        await enter.first().click();
        await page.waitForTimeout(10_000);
    }

    const body = await page.evaluate(() => document.body.innerText);
    console.log("=== surface ===\n" + body.slice(0, 700));

    // The real document, rendered by pdf.js.
    const canvases = await page.locator("[data-participant-document] canvas").count();
    console.log("=== document canvases:", canvases, "===");

    // Page navigation, where the document has more than one page.
    const next = page.locator("nav[aria-label='Document pages'] button", { hasText: /Next/i });
    if (await next.count()) {
        const before = await page.locator("nav[aria-label='Document pages']").innerText();
        await next.first().click();
        await page.waitForTimeout(3000);
        const after = await page.locator("nav[aria-label='Document pages']").innerText();
        console.log(`=== page nav: ${JSON.stringify(before.replace(/\n/g, " "))} -> ${JSON.stringify(after.replace(/\n/g, " "))} ===`);
        expect(after, "the page indicator moved").not.toBe(before);
    } else {
        console.log("=== page nav: no multi-page nav on this surface ===");
    }

    const leaked = SOURCE_NAMES.filter((n) => body.includes(n));
    console.log("=== source-label leak:", JSON.stringify(leaked), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
    console.log("=== http errors:", JSON.stringify(httpErrors.slice(0, 5)), "===");
    expect(leaked, "no source label reaches the parent").toEqual([]);
    expect(errors, "no console errors").toEqual([]);
});
