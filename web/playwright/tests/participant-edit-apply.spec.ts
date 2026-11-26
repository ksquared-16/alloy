/** A correction changes the semantic answer, and the actual document follows. */
import { test, expect } from "@playwright/test";
const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });

const docSha = async (page: import("@playwright/test").Page, token: string) =>
    page.evaluate(async (t) => {
        const r = await fetch(`/api/public/forms/${t}/enrollment-document?rev=${Date.now()}`);
        const b = new Uint8Array(await r.arrayBuffer());
        const d = await crypto.subtle.digest("SHA-256", b);
        return { bytes: b.length, sha: [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16) };
    }, token);

test("editing a semantic answer regenerates the actual document", async ({ page }) => {
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(9000); }

    const before = await docSha(page, TOKEN);
    console.log("=== document BEFORE:", JSON.stringify(before), "===");

    await page.locator("[data-make-a-change]").first().click();
    await page.waitForTimeout(3500);

    // The row for the child's last name — a semantic answer that fills several source boxes.
    const row = page.locator("div,li,tr").filter({ hasText: /childs last name/i }).filter({ has: page.getByRole("button", { name: /^Edit$/ }) }).last();
    await row.getByRole("button", { name: /^Edit$/ }).click();
    await page.waitForTimeout(1500);

    const field = page.locator("input:not([type=hidden]), textarea").first();
    await field.fill("Verticalson");
    const save = page.getByRole("button", { name: /save|done|update|apply/i }).first();
    if (await save.count()) await save.click();
    await page.waitForTimeout(7000);

    const seen = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    console.log("=== shows new value:", /Verticalson/.test(seen), "===");

    const after = await docSha(page, TOKEN);
    console.log("=== document AFTER:", JSON.stringify(after), "===");
    console.log("=== document regenerated:", after.sha !== before.sha, "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 3)), "===");
    expect(after.sha).not.toBe(before.sha);
});
