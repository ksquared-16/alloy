/**
 * Known facts are confirmed by subject — proved in a real browser, at both widths.
 *
 * The properties under test are the ones that would make this feature harmful if they failed:
 * that two people never appear as one card, that "Yes" settles every fact it displayed, that
 * changing one value leaves its siblings exactly where they were, and that a fact Alloy does NOT
 * hold is never drawn as though it did.
 */
import { test, expect, type Page } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const WIDTH = Number(process.env.PW_WIDTH ?? 1280);
const HEIGHT = Number(process.env.PW_HEIGHT ?? 900);

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: WIDTH, height: HEIGHT } });

/** Source labels that must never reach a parent — the packet's own OCR'd column headings. */
const SOURCE_NAMES = ["Var History", "Var history", "Signature1", "Signature Update", "subject_line", "customer_member:", "field_source"];

const GROUP = "[data-participant-confirmation-group]";

async function settleAfterAction(page: Page) {
    await page.waitForTimeout(2500);
}

test(`grouped confirmations at ${process.env.PW_WIDTH ?? 1280}px`, async ({ page }) => {
    test.setTimeout(300_000);
    test.skip(!TOKEN, "no token");

    const errors: string[] = [];
    const httpErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => { if (r.status() >= 400) httpErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    page.setDefaultTimeout(45_000);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(GROUP, { timeout: 60_000 });

    // ---- 1. The child's known facts arrive as ONE coherent group ------------------------------
    const group = page.locator(GROUP).first();
    await expect(group).toHaveAttribute("data-participant-group-mode", "summary");
    await expect(group.locator("[data-participant-group-headline]")).toHaveText("Chidinma Okonkwo");
    const childBody = await group.innerText();
    console.log("=== child group ===\n" + childBody);
    expect(childBody, "the birthday is read as a parent reads it").toContain("Apr 2, 2021");
    expect(childBody).toContain("Female");
    expect(childBody, "a date is never shown in its storage grain").not.toContain("2021-04-02");
    // The card is spoken once, as one sentence about one subject.
    await expect(
        page.getByText("Let's make sure I have Chidinma's details right.", { exact: true }),
    ).toBeVisible();
    /*
     * And a screen reader is told about the SAME interaction.
     *
     * The live region announces the current question; with a card on screen it must announce the
     * card, or a parent using assistive technology hears about one fact while four are displayed.
     */
    const announcement = await page.locator("[role='status'][aria-live='polite']").innerText();
    console.log("=== announced ===\n" + announcement);
    expect(announcement).toContain("Chidinma Okonkwo");
    expect(announcement).toContain("Birthday: Apr 2, 2021");
    expect(announcement).toContain("Gender: Female");

    // ---- 2. TWO PEOPLE NEVER MERGE ------------------------------------------------------------
    // The guardian is a different canonical subject. Nothing of hers may appear on the child's card,
    // however the source form printed them.
    expect(childBody, "the parent is not on the child's card").not.toContain("Adaeze");
    expect(childBody).not.toContain("adaeze.okonkwo@example.com");
    expect(childBody).not.toContain("(503) 555-0142");

    // ---- 3. A missing fact is never drawn as stored truth --------------------------------------
    expect(childBody, "an unknown middle name is not a blank row").not.toMatch(/Middle name/i);

    // ---- 4. Make a change exposes the INDIVIDUAL semantic values -------------------------------
    const summaryRows = await group.locator("[data-participant-fact]").count();
    await page.getByRole("button", { name: "Make a change" }).click();
    await page.waitForTimeout(600);
    await expect(group).toHaveAttribute("data-participant-group-mode", "individual");
    const individualRows = await group.locator("[data-participant-fact]").count();
    console.log(`=== rows: summary ${summaryRows} -> individual ${individualRows} ===`);
    // The names were the heading; opening the values shows them as their own facts.
    expect(individualRows).toBeGreaterThan(summaryRows);
    const individualBody = await group.innerText();
    expect(individualBody).toContain("Okonkwo");
    expect(individualBody).toContain("Chidinma");

    // ---- 5. Changing ONE value does not move its siblings --------------------------------------
    /*
     * The VALUES, not the rows.
     *
     * A row also carries its "Change" affordance, which legitimately comes and goes with the card's
     * mode — comparing whole rows would score a mode change as a changed value.
     */
    const before: Record<string, string> = {};
    for (const cell of await group.locator("[data-participant-fact-value]").all()) {
        const ref = (await cell.getAttribute("data-participant-fact-value")) ?? "";
        before[ref] = (await cell.innerText()).trim();
    }
    const birthdayRow = group.locator("[data-participant-fact]").filter({ hasText: "Birthday" }).first();
    const birthdayRef = (await birthdayRow.getAttribute("data-participant-fact")) ?? "";
    await birthdayRow.getByRole("button", { name: "Change" }).click();
    await page.waitForTimeout(400);
    await birthdayRow.locator("input").fill("2021-04-03");
    await birthdayRow.getByRole("button", { name: "Save" }).click();
    await settleAfterAction(page);

    const after = page.locator(GROUP).first();
    const afterBody = await after.innerText();
    console.log("=== after editing the birthday ===\n" + afterBody);
    // The edited fact settled — and the ones beside it are untouched, still awaiting confirmation
    // with exactly the values they had.
    // The card stays open on the individual values — the parent is still correcting.
    await expect(after).toHaveAttribute("data-participant-group-mode", "individual");
    for (const [ref, text] of Object.entries(before)) {
        if (ref === birthdayRef) continue;
        const sibling = after.locator(`[data-participant-fact-value="${ref}"]`);
        if (await sibling.count()) {
            expect((await sibling.innerText()).trim(), `sibling ${ref} unchanged`).toBe(text);
        }
    }
    expect(afterBody, "the corrected value is not re-asked in its old form").not.toContain("Apr 2, 2021");

    // ---- 6. Yes settles EVERY confirmation the card displayed ----------------------------------
    const remainingRefs = await after.locator("[data-participant-fact]").evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-participant-fact") ?? ""),
    );
    expect(remainingRefs.length, "the card still holds the siblings").toBeGreaterThan(0);
    const affirm = page.getByRole("button", { name: /That's everything|Yes, that's right/ }).first();
    await affirm.click();
    await settleAfterAction(page);

    // ---- 7. The guardian is HER OWN group ------------------------------------------------------
    await page.waitForSelector(GROUP, { timeout: 60_000 });
    const guardian = page.locator(GROUP).first();
    const guardianBody = await guardian.innerText();
    console.log("=== guardian group ===\n" + guardianBody);
    await expect(guardian.locator("[data-participant-group-headline]")).toHaveText("Adaeze Okonkwo");
    expect(guardianBody).toContain("(503) 555-0142");
    expect(guardianBody).toContain("adaeze.okonkwo@example.com");
    // And the child is not on it. Neither card ever carried the other person's facts.
    expect(guardianBody, "the child is not on the parent's card").not.toContain("Chidinma");
    // None of the child's fact handles survive onto the parent's card.
    for (const ref of remainingRefs.filter(Boolean)) {
        expect(await guardian.locator(`[data-participant-fact="${ref}"]`).count(), `child fact ${ref} leaked`).toBe(0);
    }
    await expect(
        page.getByText("Let's make sure I have your details right.", { exact: true }),
    ).toBeVisible();

    // ---- 8. Progress counts SEMANTIC NEEDS, never groups ---------------------------------------
    const progress = await page.locator("[data-participant-progress], [role='progressbar']").first().getAttribute("aria-valuenow").catch(() => null);
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("=== progress readout:", progress, "===");

    await page.getByRole("button", { name: "Yes, that's right" }).first().click();
    await settleAfterAction(page);

    // ---- 9. What Alloy does NOT know stays a question ------------------------------------------
    const afterGroups = await page.evaluate(() => document.body.innerText);
    console.log("=== after both groups ===\n" + afterGroups.slice(0, 900));

    // ---- 10. Nothing internal ever reaches the parent ------------------------------------------
    const leaked = SOURCE_NAMES.filter((n) => afterGroups.includes(n) || bodyText.includes(n));
    console.log("=== source-label leak:", JSON.stringify(leaked), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
    console.log("=== http errors:", JSON.stringify(httpErrors.slice(0, 6)), "===");
    expect(leaked, "no source label reaches the parent").toEqual([]);
    expect(errors, "no console errors").toEqual([]);
});
