/** Signing the actual document, through the parent's public door. */
import { test } from "@playwright/test";
const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });

test("the parent can sign their document", async ({ page }) => {
    // Signing regenerates and flattens a 570KB source PDF; the default 30s is not the budget for it.
    test.setTimeout(180_000);
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(9000); }

    const surface = async (label: string) => {
        const t = await page.evaluate(() => {
            const out: string[] = [];
            document.querySelectorAll<HTMLElement>("h1,h2,h3,p,button,span").forEach((el) => {
                if (el.children.length || el.closest(".sr-only")) return;
                const s = (el.innerText || "").trim();
                if (s && s.length < 90) out.push(s);
            });
            return [...new Set(out)];
        });
        console.log(`=== ${label} ===\n` + t.join("\n"));
    };
    await surface("REVIEW");

    // Advance toward signing the way a parent would.
    const proceed = page.getByRole("button", { name: /everything looks good|continue|sign/i }).first();
    if (await proceed.count()) { await proceed.click(); await page.waitForTimeout(8000); }
    await surface("AFTER PROCEED");

    console.log("=== canvases:", await page.locator("[data-participant-document] canvas").count(), "===");
    console.log("=== tap-to-sign present:", await page.getByText(/tap to sign/i).count(), "===");
    // Open the capture and draw the way a parent would — pointer events, not a synthetic value.
    await page.getByText(/tap to sign/i).first().click();
    await page.waitForTimeout(2500);
    await surface("CAPTURE OPEN");

    const pad = page.locator("canvas").last();
    const box = await pad.boundingBox();
    if (box) {
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
        await page.mouse.down();
        for (const [dx, dy] of [[0.3, 0.35], [0.45, 0.7], [0.6, 0.4], [0.75, 0.6]]) {
            await page.mouse.move(box.x + box.width * dx, box.y + box.height * dy, { steps: 8 });
        }
        await page.mouse.up();
        await page.waitForTimeout(800);
        console.log("=== drew on pad", Math.round(box.width) + "x" + Math.round(box.height), "===");
    }
    // Policy requires the parent to acknowledge before Done becomes available — tick it as they would.
    const ack = page.getByRole("checkbox").last();
    if (await ack.count()) { await ack.check(); await page.waitForTimeout(500); }

    const done = page.getByRole("button", { name: /^done$/i }).first();
    console.log("=== Done enabled after acknowledgement:", await done.isEnabled(), "===");
    console.log("=== Done available:", await done.count(), "===");
    if (await done.count()) { await done.click(); await page.waitForTimeout(6000); }
    await surface("AFTER DONE");
    // The signed artifact itself — fetched and hashed, not inferred from a toast.
    const signed = await page.evaluate(async (t) => {
        const r = await fetch(`/api/public/forms/${t}/enrollment-document?rev=signed${Date.now()}`);
        const b = new Uint8Array(await r.arrayBuffer());
        const d = await crypto.subtle.digest("SHA-256", b);
        return { status: r.status, bytes: b.length, sha: [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 16) };
    }, TOKEN);
    console.log("=== signed artifact:", JSON.stringify(signed), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 3)), "===");
});
