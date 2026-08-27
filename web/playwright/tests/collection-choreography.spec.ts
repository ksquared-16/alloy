/**
 * The conversation is choreographed by subject, not by the order boxes sit on a PDF.
 */
import { test, expect } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const WIDTH = Number(process.env.PW_WIDTH ?? 1280);
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: WIDTH, height: Number(process.env.PW_HEIGHT ?? 900) } });

test(`collection choreography at ${process.env.PW_WIDTH ?? 1280}px`, async ({ page }) => {
    test.setTimeout(300_000);
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.setDefaultTimeout(45_000);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-participant-confirmation-group]", { timeout: 60_000 });

    // ---- 1. THE PROMPT INTRODUCES THE CARD -----------------------------------------------------
    const turn = page.locator("[data-said='alloy'][data-depth='current']").first();
    const order = await turn.evaluate((n) => {
        const seq: string[] = [];
        n.querySelectorAll("*").forEach((el) => {
            if (el.hasAttribute("data-participant-confirmation-group")) seq.push("CARD");
            else if (el.tagName === "P" && (el.textContent ?? "").includes("make sure")) seq.push("PROMPT");
        });
        return seq;
    });
    console.log("=== render order:", JSON.stringify(order), "===");
    expect(order[0], "the sentence introducing the card comes first").toBe("PROMPT");
    expect(order).toContain("CARD");

    // ---- 2. THE CHILD BLOCK IS COHERENT --------------------------------------------------------
    const card = page.locator("[data-participant-confirmation-group]").first();
    const childText = await card.innerText();
    console.log("=== child block ===\n" + childText);
    expect(childText).toContain("Chidinma Okonkwo");
    expect(childText, "the guardian is a different subject").not.toContain("Adaeze");

    // ---- 3. CHILD THEN GUARDIAN, EACH FINISHED BEFORE THE NEXT ---------------------------------
    await page.getByRole("button", { name: "Yes, that's right" }).first().click();
    await page.waitForTimeout(3000);
    await page.waitForSelector("[data-participant-confirmation-group]", { timeout: 60_000 });
    const guardianText = await page.locator("[data-participant-confirmation-group]").first().innerText();
    console.log("=== next subject ===\n" + guardianText);
    expect(guardianText, "the very next subject is the guardian").toContain("Adaeze Okonkwo");

    await page.getByRole("button", { name: "Yes, that's right" }).first().click();
    await page.waitForTimeout(3000);

    // ---- 4. NO NAKED FIELD LABEL AS AN ACTIVE QUESTION -----------------------------------------
    const seen: string[] = [];
    for (let i = 0; i < 14; i += 1) {
        const question = await page.locator("[data-said='alloy'][data-depth='current'] p").first().innerText().catch(() => "");
        if (!question) break;
        seen.push(question);
        expect(question, `"${question}" must not be a naked column heading`).not.toMatch(/^Middle Name\??$/i);
        const composer = page.locator("textarea").first();
        if (!(await composer.count())) break;
        const skip = page.getByRole("button", { name: /Nothing to add|No known allergies/ });
        if (await skip.count()) { await skip.first().click(); } else {
            const opts = page.locator("[aria-label='Suggested replies'] button");
            if (await opts.count()) await opts.first().click();
            else { await composer.fill("Noted for QA"); await page.getByRole("button", { name: "Send" }).click(); }
        }
        await page.waitForTimeout(2200);
    }
    console.log("=== questions seen ===\n" + seen.join("\n"));
    const middle = seen.find((q) => /middle/i.test(q));
    if (middle) {
        console.log("=== middle-name question:", middle, "===");
        expect(middle, "the runtime names the child").toMatch(/Chidinma/);
    }

    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
    expect(errors, "no console errors").toEqual([]);
});
