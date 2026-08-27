/**
 * The artifact half, through the parent's own public door.
 *
 * This spec RECORDS a blocker rather than asserting a pass. With the conversation settled, the
 * parent reaches review and is shown a compiled HTML representation instead of the actual Oregon
 * CIS — because no published version carries a `pdf_mapping_json`, so the fidelity engine has
 * nothing to fill and correctly falls back. The absence is on v1 as well as v2, and
 * `insertVersion` in the realization service has no parameter for it: Processing has never been
 * able to produce one.
 *
 * Kept as a spec so the day a mapping exists, the proof runs.
 */
import { test, expect } from "@playwright/test";
const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });

test("conversation hands off to the actual document", async ({ page }) => {
    test.skip(!TOKEN, "no token");
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const seen = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll<HTMLElement>("h1,h2,h3,p,button,span,li").forEach((el) => {
            if (el.children.length) return;
            if (el.closest(".sr-only")) return;
            const t = (el.innerText || "").trim();
            if (t && t.length < 160) out.push(t);
        });
        return [...new Set(out)];
    });
    console.log("=== SEEN ===\n" + seen.join("\n"));

    const doc = page.locator("[data-participant-document]");
    console.log("=== document canvas present:", await doc.count(), "===");
    const canvases = page.locator("[data-participant-document] canvas");
    console.log("=== rendered PDF page canvases:", await canvases.count(), "===");
    console.log("=== console errors:", JSON.stringify(errors.slice(0, 4)), "===");

    // The document endpoint's own verdict, recorded verbatim.
    const doc404 = await page.evaluate(async (t) => {
        const r = await fetch(`/api/public/forms/${t}/enrollment-document`);
        return { status: r.status, body: (await r.text()).slice(0, 120) };
    }, TOKEN);
    console.log("=== enrollment-document:", JSON.stringify(doc404), "===");
    expect(errors, "zero console errors at review").toEqual([]);
});
