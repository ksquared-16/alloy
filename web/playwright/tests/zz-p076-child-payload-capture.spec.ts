/**
 * WHAT DOES THE COMMIT-TIME `_inquiry_children` ENTRY ACTUALLY CONTAIN?
 *
 * The previous provenance repair failed because I inferred the payload's shape instead of reading
 * it: I assumed a missing `location_id` key meant "provenance unanswered", gated on key presence,
 * and shipped green tests over a fixture that did not match production. This reads the real thing
 * from the document the commit model consumes, so the next repair starts from evidence.
 *
 * Reads the streamed RSC payload rather than React state: the commit answer arrives inside the
 * document, and that is the boundary the commit model is handed.
 */
import { test } from "@playwright/test";

test("capture commit child payload", async ({ page }) => {
    // Drawer withheld so nothing settled can contaminate what we attribute to COMMIT.
    await page.route("**/api/admin/view-models/drawer/**", (r) => r.abort());
    await page.route("**/api/admin/v2/view-models/drawer/**", (r) => r.abort());
    await page.goto(process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads", {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(Number(process.env.P076_SETTLE_MS || 9000));

    const out = await page.evaluate(() => {
        const blobs: string[] = [];
        document.querySelectorAll("script").forEach((s) => {
            const t = s.textContent || "";
            if (t.includes("_inquiry_children")) blobs.push(t);
        });
        // Pull the first object that follows an `_inquiry_children` marker, brace-balanced.
        const found: string[] = [];
        for (const b of blobs) {
            let i = b.indexOf("_inquiry_children");
            while (i !== -1 && found.length < 3) {
                const open = b.indexOf("{", i);
                if (open === -1) break;
                let depth = 0;
                let end = -1;
                for (let j = open; j < Math.min(b.length, open + 6000); j++) {
                    if (b[j] === "{") depth++;
                    else if (b[j] === "}") {
                        depth--;
                        if (depth === 0) { end = j; break; }
                    }
                }
                if (end > open) found.push(b.slice(open, end + 1));
                i = b.indexOf("_inquiry_children", i + 1);
            }
        }
        return { scriptsWithKey: blobs.length, samples: found.slice(0, 3) };
    });

    console.log(`[cap] scriptsWithKey=${out.scriptsWithKey} samples=${out.samples.length}`);
    out.samples.forEach((s, i) => console.log(`[cap-${i}] ${s.slice(0, 1400)}`));
});
