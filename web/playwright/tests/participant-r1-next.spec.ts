/** Where the parent lands after finishing an artifact. */
import { test } from "@playwright/test";
const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });

test("the next artifact", async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", async (r) => {
        if (r.status() < 400) return;
        let b = ""; try { b = (await r.text()).slice(0, 500); } catch { /* consumed */ }
        console.log(`=== HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${b} ===`);
    });
    const surface = async (label: string) => {
        const t = await page.evaluate(() => {
            const out: string[] = [];
            document.querySelectorAll<HTMLElement>("h1,h2,h3,p,button,span,label").forEach((el) => {
                if (el.children.length || el.closest(".sr-only")) return;
                const s = (el.innerText || "").trim();
                if (s && s.length < 120) out.push(s);
            });
            return [...new Set(out)];
        });
        console.log(`=== ${label} ===\n` + t.join("\n"));
    };
    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await surface("ON ARRIVAL");
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(9000); }
    await surface("AFTER ENTER");
    console.log("=== title:", await page.title(), "===");
    console.log("=== uploads presented:", await page.locator("[data-upload-request]").count(), "===");
    for (let i = 0; i < await page.locator("[data-upload-request]").count(); i++) {
        console.log("   -", (await page.locator("[data-upload-request]").nth(i).innerText()).replace(/\n/g, " | "));
    }
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 5)), "===");
});
