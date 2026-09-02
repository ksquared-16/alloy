/**
 * Settled history is a semantic record you can still edit — proved in a real browser, both widths.
 *
 * The four properties that made the previous build feel unfinished: a confirmed group collapsed to
 * "Yes, that's right" and lost what was agreed; a settled answer became immutable; Change on an
 * address left the composer waiting for prose; and the active question was styled like a headline.
 */
import { test, expect, type Page } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const WIDTH = Number(process.env.PW_WIDTH ?? 1280);
const HEIGHT = Number(process.env.PW_HEIGHT ?? 900);

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: WIDTH, height: HEIGHT } });

const RECORD = "[data-participant-settled-record]";
const GROUP = "[data-participant-confirmation-group]";

async function settle(page: Page, ms = 2500) {
    await page.waitForTimeout(ms);
}

test(`confirmation convergence at ${process.env.PW_WIDTH ?? 1280}px`, async ({ page }) => {
    test.setTimeout(300_000);
    test.skip(!TOKEN, "no token");

    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.setDefaultTimeout(45_000);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(GROUP, { timeout: 60_000 });

    // ---- 6. TYPOGRAPHY — the active question is not a headline -------------------------------
    const question = page.locator("[data-said='alloy'][data-depth='current'] p").first();
    const type = await question.evaluate((n) => {
        const s = getComputedStyle(n);
        return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight) };
    });
    console.log("=== active question type:", JSON.stringify(type), "===");
    expect(type.size, "the active question is no longer headline-sized").toBeLessThanOrEqual(16);
    expect(type.weight, "and carries no headline weight").toBeLessThanOrEqual(500);

    // ---- 1. A CONFIRMED GROUP RETAINS ITS CONTENT ---------------------------------------------
    await page.getByRole("button", { name: "Yes, that's right" }).first().click();
    await settle(page);
    await page.waitForSelector(RECORD, { timeout: 60_000 });
    const childRecord = page.locator("[data-participant-settled-group]").first();
    const childText = await childRecord.innerText();
    console.log("=== settled child record ===\n" + childText);
    // The heading is uppercased in CSS, so compare on the text rather than its casing.
    expect(childText.toLowerCase()).toContain("chidinma's details");
    expect(childText, "the values survive the confirmation").toContain("Chidinma");
    expect(childText).toContain("Okonkwo");
    expect(childText).toContain("Apr 2, 2021");
    expect(childText).toContain("Female");
    expect(childText.toLowerCase()).toContain("confirmed");
    // NOT a button transcript.
    expect(childText).not.toContain("Yes, that's right");

    // ---- 1b. The guardian group keeps its content too ------------------------------------------
    await page.waitForSelector(GROUP, { timeout: 60_000 });
    await page.getByRole("button", { name: "Yes, that's right" }).first().click();
    await settle(page);
    const groups = page.locator("[data-participant-settled-group]");
    await expect(groups).toHaveCount(2, { timeout: 30_000 });
    const guardianText = await groups.nth(1).innerText();
    console.log("=== settled guardian record ===\n" + guardianText);
    expect(guardianText).toContain("Adaeze Okonkwo");
    expect(guardianText).toContain("(503) 555-0142");
    expect(guardianText).toContain("adaeze.okonkwo@example.com");
    // Two people, two records — still never merged.
    expect(guardianText).not.toContain("Chidinma");

    // ---- 2. EDIT REMAINS AVAILABLE AFTER MOVING ON --------------------------------------------
    const childEdits = childRecord.getByRole("button", { name: "Edit" });
    expect(await childEdits.count(), "the child's facts are still editable two turns later").toBeGreaterThan(0);

    // ---- 2b. Edit ONE fact and prove the siblings do not move ----------------------------------
    const before: Record<string, string> = {};
    for (const cell of await childRecord.locator("[data-participant-settled-value]").all()) {
        before[(await cell.getAttribute("data-participant-settled-value")) ?? ""] = (await cell.innerText()).trim();
    }
    const birthdayRow = childRecord.locator("[data-participant-settled-fact]").filter({ hasText: "Birthday" }).first();
    const birthdayRef = (await birthdayRow.getAttribute("data-participant-settled-fact")) ?? "";
    await birthdayRow.getByRole("button", { name: "Edit" }).click();
    await page.waitForTimeout(500);
    await birthdayRow.locator("input").first().fill("2021-04-03");
    await birthdayRow.getByRole("button", { name: "Save" }).click();
    await settle(page);

    const childAfter = page.locator("[data-participant-settled-group]").first();
    for (const [ref, value] of Object.entries(before)) {
        if (ref === birthdayRef) continue;
        const cell = childAfter.locator(`[data-participant-settled-value="${ref}"]`);
        if (await cell.count()) {
            expect((await cell.innerText()).trim(), `sibling ${ref} unchanged`).toBe(value);
        }
    }
    const editedText = await childAfter.innerText();
    console.log("=== after editing a settled fact ===\n" + editedText);
    expect(editedText).toContain("Apr 3, 2021");
    expect(editedText.toLowerCase()).toContain("updated");

    // ---- 3. CHANGE OPENS STRUCTURED ADDRESS EDITING -------------------------------------------
    await page.waitForTimeout(1500);
    const bodyNow = await page.evaluate(() => document.body.innerText);
    expect(bodyNow, "the address is the live question").toContain("address");
    await page.getByRole("button", { name: "Change" }).first().click();
    await page.waitForTimeout(700);
    const addressEditor = page.locator("[data-participant-address-editor]");
    await expect(addressEditor, "Change opens street/city/state/ZIP, not a blank composer").toBeVisible();
    // Prefilled from the value being corrected, so fixing a city does not mean retyping a street.
    await expect(addressEditor.getByLabel("Street")).toHaveValue("418 NE Hancock St");
    await expect(addressEditor.getByLabel("City")).toHaveValue("Portland");
    await expect(addressEditor.getByLabel("State")).toHaveValue("OR");
    await expect(addressEditor.getByLabel("ZIP")).toHaveValue("97212");
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.waitForTimeout(400);

    // ---- 4. "it's Bend" FOLLOWS D-101 TRUTHFULLY ----------------------------------------------
    /*
     * `customer:address` is NOT on the D-101 admitted list — the list admits the componentized
     * address domains, which this tenant's packet does not bind. So there is no `city` for "Bend" to
     * be a candidate correction to, and refusing is correct. What must NOT happen is the dead end:
     * an apology with no way forward.
     */
    await page.locator("textarea").first().fill("it's Bend");
    await page.getByRole("button", { name: "Send" }).click();
    await settle(page, 4000);
    const afterWords = await page.evaluate(() => document.body.innerText);
    console.log("=== after \"it's Bend\" ===\n" + afterWords.slice(-700));
    expect(afterWords, "the runtime says what it CAN do").toContain("change just the part that's wrong");
    expect(
        afterWords.includes("Sorry — I didn't catch that. You can use the buttons"),
        "no bare apology when a structured path exists",
    ).toBe(false);
    await expect(page.locator("[data-participant-address-editor]"), "and opens the editor").toBeVisible();

    // ---- 4b. Correcting the city leaves the street and ZIP alone -------------------------------
    const editor = page.locator("[data-participant-address-editor]");
    await editor.getByLabel("City").fill("Bend");
    await page.getByRole("button", { name: "Save" }).first().click();
    await settle(page, 3500);
    const finalBody = await page.evaluate(() => document.body.innerText);
    console.log("=== after correcting the city ===\n" + finalBody.slice(0, 1200));
    expect(finalBody, "the city moved").toContain("Bend");
    expect(finalBody, "and the street survived").toContain("418 NE Hancock St");
    expect(finalBody, "and so did the ZIP").toContain("97212");

    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
    expect(errors, "no console errors").toEqual([]);
});
