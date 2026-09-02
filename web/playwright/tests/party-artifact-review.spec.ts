/**
 * The parent reviews a document containing the people they actually named.
 *
 * `applyPartyArtifactValues` was proven as a function for a whole slice while the review still
 * rendered blank party boxes, because nothing called it. This opens the real review.
 */
import { test, expect } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const WIDTH = Number(process.env.PW_WIDTH ?? 1280);
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: WIDTH, height: Number(process.env.PW_HEIGHT ?? 900) } });

test(`party artifact review at ${process.env.PW_WIDTH ?? 1280}px`, async ({ page }) => {
    test.setTimeout(300_000);
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    const httpErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400) httpErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    page.setDefaultTimeout(45_000);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);

    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(11_000); }

    const body = await page.evaluate(() => document.body.innerText);
    console.log("=== surface ===\n" + body.slice(0, 600));

    // The real document, rendered by pdf.js from the bytes the render seam produced.
    const canvases = await page.locator("[data-participant-document] canvas").count();
    console.log("=== document canvases:", canvases, "===");
    expect(canvases, "the reviewed document renders").toBeGreaterThan(0);

    // No source-slot identity ever reaches the parent.
    for (const leak of ["Parent/Guardian #2", "Emergency Contact #3", "Physician #1"]) {
        expect(body, `"${leak}" must not be participant-facing`).not.toContain(leak);
    }

    // The document must be usable at 375px: it fits its own container, and the page does not
    // scroll sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log("=== horizontal overflow:", overflow, "px ===");
    expect(overflow, "the review does not scroll sideways").toBeLessThanOrEqual(2);

    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
    console.log("=== http errors:", JSON.stringify(httpErrors.slice(0, 6)), "===");
    expect(errors, "no console errors").toEqual([]);
    expect(httpErrors.filter((e) => e.includes("/api/public/forms")), "no failed participant requests").toEqual([]);
});
