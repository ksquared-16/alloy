/**
 * A confirmation is pre-existing truth the parent verified — proved in a real browser, both widths.
 *
 * The defect: settled history was projected from `state === "confirmed"`, which also covers every
 * value the participant SUPPLIED (the runtime records D-99 evidence for those too, or a corrected
 * fact re-opens and gets asked again). So a card headed "Your family's details · Confirmed" carried
 * employers, emergency contacts, custody arrangements, a physician, sleep, fears, previous schools
 * and a material fee, thirty-one of them behind a "Show 31 more".
 */
import { test, expect } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const WIDTH = Number(process.env.PW_WIDTH ?? 1280);
const HEIGHT = Number(process.env.PW_HEIGHT ?? 900);

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: WIDTH, height: HEIGHT } });

test(`confirmation vs collection at ${process.env.PW_WIDTH ?? 1280}px`, async ({ page }) => {
    test.setTimeout(300_000);
    test.skip(!TOKEN, "no token");

    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.setDefaultTimeout(45_000);

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-participant-settled-record]", { timeout: 60_000 });

    // ---- 1. CONFIRMATION CARDS HOLD ONLY PRE-EXISTING TRUTH -----------------------------------
    const groups = page.locator("[data-participant-settled-group]");
    const headings = await groups.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-participant-settled-group") ?? ""),
    );
    console.log("=== confirmation cards:", JSON.stringify(headings), "===");

    const child = groups.filter({ hasText: /Chidinma/i }).first();
    const childText = await child.innerText();
    console.log("=== child card ===\n" + childText);
    // Exactly the pre-existing child facts, and nothing collected in this session.
    expect(await child.locator("[data-participant-settled-fact]").count()).toBe(4);
    for (const value of ["Chidinma", "Okonkwo", "Apr 2, 2021", "Female"]) {
        expect(childText).toContain(value);
    }
    for (const collected of ["Employer", "Emergency", "Physician", "Toilet", "nap", "Fee", "sibling"]) {
        expect(childText, `"${collected}" must not be in a confirmation card`).not.toContain(collected);
    }

    const guardian = groups.filter({ hasText: /Adaeze/i }).first();
    const guardianText = await guardian.innerText();
    console.log("=== guardian card ===\n" + guardianText);
    expect(await guardian.locator("[data-participant-settled-fact]").count()).toBe(3);
    expect(guardianText).toContain("(503) 555-0142");
    expect(guardianText).toContain("adaeze.okonkwo@example.com");

    // ---- 2. NO GIANT FAMILY CARD, AND NO FOLD ON A CONFIRMATION --------------------------------
    const family = groups.filter({ hasText: /family/i }).first();
    if (await family.count()) {
        const familyFacts = await family.locator("[data-participant-settled-fact]").count();
        console.log("=== family card facts:", familyFacts, "===");
        // The household subject holds the ADDRESS. It is not a bucket for every household question.
        expect(familyFacts).toBeLessThanOrEqual(2);
        expect(await family.innerText()).toContain("418 NE Hancock St");
    }
    // A confirmation card whose contents need a fold is proof the boundary is wrong.
    for (const heading of headings) {
        const card = page.locator(`[data-participant-settled-group="${heading}"]`);
        expect(await card.getByRole("button", { name: /Show \d+ more/ }).count(), `${heading} needs no fold`).toBe(0);
    }

    // ---- 3. COLLECTED ANSWERS LIVE OUTSIDE CONFIRMATION CARDS ----------------------------------
    const collected = page.locator("[data-participant-collected]");
    await expect(collected, "the session's own answers have their own place").toBeVisible();
    const collectedCount = Number((await collected.getAttribute("data-participant-collected")) ?? "0");
    console.log("=== collected answers:", collectedCount, "===");
    expect(collectedCount).toBeGreaterThan(20);
    expect(await collected.innerText()).not.toContain("Confirmed");

    // ---- 4. NO FAKE VALUE ----------------------------------------------------------------------
    const body = await page.evaluate(() => document.body.innerText);
    expect(body, "a placeholder must never read as a participant's answer").not.toContain("Noted");

    // ---- 5. EDIT REMAINS AVAILABLE -------------------------------------------------------------
    expect(await child.getByRole("button", { name: "Edit" }).count()).toBeGreaterThan(0);
    expect(await collected.getByRole("button", { name: "Edit" }).count()).toBeGreaterThan(0);

    // ---- 6. REQUIRED EVIDENCE COMES BEFORE PREPARATION -----------------------------------------
    const evidence = page.locator("[data-participant-evidence-turn]");
    await expect(evidence, "the attachment is asked for before the paperwork").toBeVisible();
    console.log("=== evidence turn ===\n" + (await evidence.innerText()));
    expect(body).toContain("Before I prepare the paperwork");
    // The untrue sentence must NOT have been said, and review must not be reachable.
    expect(body, "no claim of finished paperwork while evidence is outstanding").not.toContain("I filled out");
    expect(await page.locator("[data-review-paperwork]").count(), "[Review paperwork] is not reachable yet").toBe(0);

    // ---- 7. ATTACH, THEN PREPARATION BECOMES TRUE ----------------------------------------------
    const PNG = Buffer.from(
        // A 1x1 PNG — real bytes, so the route's own content sniffing accepts it.
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
    );
    console.log("=== required attachments owed:", await evidence.locator("input[type='file']").count(), "===");
    /*
     * Always the FIRST remaining input, re-queried each time.
     *
     * The list is the platform's answer to "what is still owed", so it SHRINKS as each document
     * lands — indexing into the original list reaches for a row that no longer exists. Re-querying
     * is also the stronger assertion: it proves the obligation is actually being retired.
     */
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const remaining = page.locator("[data-participant-evidence-turn] input[type='file']");
        if ((await remaining.count()) === 0) break;
        await remaining.first().setInputFiles({ name: `record-${attempt}.png`, mimeType: "image/png", buffer: PNG });
        await page.waitForTimeout(4500);
    }
    await page.waitForTimeout(4000);

    const afterUpload = await page.evaluate(() => document.body.innerText);
    console.log("=== after attaching ===\n" + afterUpload.slice(-600));

    // ---- 8. ONLY NOW is preparation claimed, and the CTA is Bend Pine -------------------------
    expect(afterUpload, "preparation is described once evidence is in").toContain("preparing");
    const cta = page.locator("[data-review-paperwork]");
    await expect(cta, "[Review paperwork] becomes reachable").toBeVisible({ timeout: 30_000 });
    const ctaStyle = await cta.evaluate((n) => getComputedStyle(n).backgroundColor);
    const pine = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.className = "bg-alloy-bend-pine";
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c;
    });
    console.log("=== CTA background:", ctaStyle, "| bend pine token:", pine, "===");
    // Compared against the TOKEN, never a literal colour.
    expect(ctaStyle, "the primary action speaks the runtime's primary language").toBe(pine);

    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
    expect(errors, "no console errors").toEqual([]);
});
