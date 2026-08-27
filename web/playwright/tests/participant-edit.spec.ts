/** Semantic correction from the review surface, through the parent's public door. */
import { test } from "@playwright/test";
const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });

test("Make a change shows semantic answers", async ({ page }) => {
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(9000); }

    await page.locator("[data-make-a-change]").first().click();
    await page.waitForTimeout(4000);

    const seen = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll<HTMLElement>("h1,h2,h3,p,button,span,label,li").forEach((el) => {
            if (el.children.length || el.closest(".sr-only")) return;
            const t = (el.innerText || "").trim();
            if (t && t.length < 110) out.push(t);
        });
        return out;
    });
    console.log("=== EDIT SURFACE ===\n" + seen.slice(0, 40).join("\n"));
    // The semantic rows, as the parent reads them.
    const rows = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll<HTMLElement>("[data-semantic-answer], li, tr, div").forEach((el) => {
            const btn = el.querySelector("button");
            if (!btn || !/^Edit$/i.test((btn.innerText || "").trim())) return;
            const t = (el.innerText || "").replace(/\s+/g, " ").trim();
            if (t.length < 120) out.push(t);
        });
        return [...new Set(out)];
    });
    console.log("=== SEMANTIC ROWS ===\n" + rows.join("\n"));
    console.log("=== inputs:", await page.locator("input:not([type=hidden]), textarea, select").count(), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 3)), "===");
    await page.screenshot({ path: "playwright-report/edit-surface.png", fullPage: false });
});
