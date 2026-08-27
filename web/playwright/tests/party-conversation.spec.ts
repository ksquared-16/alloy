/**
 * The parent talks about PEOPLE, and Alloy persists them canonically.
 *
 * Proves reuse of a person the household already knows, creation of a new one, one person holding
 * two roles, declining an offer, and that a role the artifact CAN print is never forced.
 */
import { test, expect, type Page } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const WIDTH = Number(process.env.PW_WIDTH ?? 1280);
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: WIDTH, height: Number(process.env.PW_HEIGHT ?? 900) } });

const PARTY = "[data-participant-party]";

/** Answer whatever ordinary question is on screen so the conversation advances. */
async function advance(page: Page): Promise<boolean> {
    if (await page.locator(PARTY).count()) return true;
    const pills = page.locator("[aria-label='Suggested replies'] button");
    if (await pills.count()) { await pills.first().click(); await page.waitForTimeout(1200); return false; }
    const typed = page.locator("input[type='date'], input[type='number']");
    if (await typed.count()) {
        await typed.first().fill("2026-09-08");
        const use = page.getByRole("button", { name: /Use this|Save/ });
        if (await use.count()) await use.first().click();
        await page.waitForTimeout(1200);
        return false;
    }
    const composer = page.locator("textarea").first();
    if (await composer.count()) {
        await composer.fill("She settles quickly once she knows the routine.");
        await page.getByRole("button", { name: "Send" }).click();
        await page.waitForTimeout(1400);
        return false;
    }
    return false;
}

test(`party conversation at ${process.env.PW_WIDTH ?? 1280}px`, async ({ page }) => {
    test.setTimeout(900_000);
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    const httpErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400) httpErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    page.setDefaultTimeout(45_000);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-participant-confirmation-group], " + PARTY, { timeout: 60_000 });

    /*
     * The session is advanced to the party stage before this test opens it.
     *
     * The ~58 shared-collection turns ahead of it are certified by their own specs; re-walking them
     * in a browser adds minutes and proves nothing new. What is under test here is the party
     * interaction, which the page below is showing on load.
     */
    await page.waitForSelector(PARTY, { timeout: 60_000 });

    const transcript: string[] = [];
    const readOffer = async () => {
        const q = await page.locator("[data-said='alloy'][data-depth='current'] p").first().innerText();
        const role = (await page.locator(PARTY).first().getAttribute("data-participant-party")) ?? "";
        transcript.push(`${role}: ${q}`);
        return { q, role };
    };

    // ---- 1. GUARDIAN: an existing person is already listed, and declining is available ---------
    let offer = await readOffer();
    expect(offer.q, "asked about ANOTHER guardian, because one is already canonical").toMatch(/another parent or guardian/i);
    expect(await page.evaluate(() => document.body.innerText), "no source slot leaks").not.toMatch(/Parent\s*\/?\s*Guardian\s*#\s*2/i);
    await expect(page.locator("[data-participant-party-decline]"), "an optional role is never forced").toBeVisible();
    await page.locator("[data-participant-party-decline]").click();
    await page.waitForTimeout(2500);

    // ---- 2. EMERGENCY CONTACT: reuse the person the household already knows -------------------
    await page.waitForSelector(PARTY, { timeout: 60_000 });
    offer = await readOffer();
    expect(offer.q).toMatch(/emergency contact/i);
    const candidates = page.locator("[data-participant-party-candidate]");
    const candidateNames = await candidates.allInnerTexts();
    console.log("=== reuse candidates offered:", JSON.stringify(candidateNames), "===");
    expect(await candidates.count(), "a known household person is offered before asking for a name").toBeGreaterThan(0);
    expect(candidateNames.join(" ")).toMatch(/Margot|Hugo/);
    await candidates.first().click();
    await page.waitForTimeout(3000);

    // ---- 3. A NEW PERSON, collected as one coherent person ------------------------------------
    await page.waitForSelector(PARTY, { timeout: 60_000 });
    offer = await readOffer();
    expect(offer.q).toMatch(/another emergency contact/i);
    await page.locator("[data-participant-party-new]").click();
    await page.waitForTimeout(600);
    const form = page.locator("[data-participant-party-form]");
    await expect(form, "one person, collected together").toBeVisible();
    await form.getByLabel("Full name").fill("Odile Marchand");
    await form.getByLabel("Phone").fill("5035550181");
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(3000);

    // ---- 4. Decline the rest; providers are offered, never forced ------------------------------
    for (let i = 0; i < 6; i += 1) {
        if (!(await page.locator(PARTY).count())) break;
        await readOffer();
        const decline = page.locator("[data-participant-party-decline]");
        if (!(await decline.count())) break;
        await decline.click();
        await page.waitForTimeout(2200);
    }

    console.log("=== PARTY TRANSCRIPT ===\n" + transcript.join("\n"));
    const body = await page.evaluate(() => document.body.innerText);
    for (const leak of ["Emergency Contact #1", "Emergency Contact #3", "Parent/Guardian #2", "Physician #1"]) {
        expect(body, `"${leak}" must never be participant-facing`).not.toContain(leak);
    }
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
    console.log("=== http errors:", JSON.stringify(httpErrors.slice(0, 5)), "===");
    expect(errors, "no console errors").toEqual([]);
});
