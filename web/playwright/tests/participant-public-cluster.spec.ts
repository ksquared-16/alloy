/**
 * The participant surface, certified through the door a parent actually uses.
 *
 * `/forms/embed/[token]` is a public, token-scoped surface: a parent holds a link, not an account.
 * So this spec authenticates as nobody and touches no operator route — the token is used only for
 * the participant experience it was minted for.
 */
import { test, expect } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const URL = `/forms/embed/${TOKEN}`;

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("public participant conversation", () => {
    test.skip(!TOKEN, "PARTICIPANT_TOKEN not supplied");

    test("renders the conversational topic and one response surface", async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
        page.on("pageerror", (e) => consoleErrors.push(String(e)));

        await page.goto(URL, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-participant-topic]", { timeout: 45_000 });

        const topic = page.locator("[data-participant-topic]").first();
        await expect(topic).toBeVisible();

        // Exactly one answer surface. Three inputs with three buttons is what this replaced.
        const composers = page.locator("textarea, input:not([type=hidden])");
        expect(await composers.count(), "one response surface at a time").toBeLessThanOrEqual(2);

        // The upcoming questions are visible but quiet.
        const upcoming = page.locator("[data-participant-topic-upcoming]");
        if (await upcoming.count()) await expect(upcoming.first()).toBeVisible();

        // No source/OCR leakage in what the parent reads.
        const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        for (const noise of ["Row1", "NúMero", "Apellido", "Segundo Nombre", "Dosis"]) {
            expect(body, `OCR noise must not reach the parent: ${noise}`).not.toContain(noise);
        }
        expect(body, "no second submit paradigm").not.toContain("Use this");

        /*
         * Progress says WHERE the parent is, never how many questions remain.
         *
         * "41 things left" was the last hiding place of the count this product spent the whole
         * slice refusing to show — it began as "Question 17 of 92". A true number, and a
         * discouraging one; the percentage beside the topic already says how far along they are.
         */
        expect(body, "no raw remaining count").not.toMatch(/\d+ things left/);
        expect(page.locator("[data-participant-progress]")).toBeTruthy();

        expect(consoleErrors, "zero console errors").toEqual([]);
    });

    test("is usable at 375px", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 780 });
        await page.goto(URL, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-participant-topic]", { timeout: 45_000 });
        // The page must not scroll sideways on a phone.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "no horizontal overflow at 375px").toBeLessThanOrEqual(1);
    });
});
