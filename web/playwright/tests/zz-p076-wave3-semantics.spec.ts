/**
 * WAVE-3 SEMANTIC EQUIVALENCE — what the three converged cards actually SAY.
 *
 * The latency probe answers "when did it stop changing". This answers "is it right", which is the
 * question the drawer-withheld run exists to settle: before convergence, withholding the drawer
 * left business_process reading its generic title with no rail, children reading "—" for a site
 * the row already knew, and household without its contact affordance. A withheld run that is
 * merely FAST is not evidence of anything.
 *
 * Reads each card by its own `data-universal-card-key`, so the capture cannot be satisfied by text
 * that happens to appear elsewhere on the surface.
 *
 * P076_BLOCK_DRAWER=1 withholds the drawer exactly as the latency probe does.
 */
import { test, expect } from "@playwright/test";

const URL_PATH = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
const LABEL = (process.env.P076_LABEL || "sem").replace(/[^a-z0-9_-]/gi, "");
const SETTLE_MS = Number(process.env.P076_SETTLE_MS || 9000);

test("wave-3 card semantics", async ({ page }) => {
    if (process.env.P076_BLOCK_DRAWER === "1") {
        await page.route("**/api/admin/view-models/drawer/**", (r) => r.abort());
        await page.route("**/api/admin/v2/view-models/drawer/**", (r) => r.abort());
    }
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(SETTLE_MS);

    const out = await page.evaluate(() => {
        const cards: Record<string, string> = {};
        document.querySelectorAll("article.alloy-os-ucard").forEach((el) => {
            const k = el.getAttribute("data-universal-card-key") || "unknown";
            cards[k] = (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();
        });
        const body = document.body.innerText || "";
        return {
            cards,
            signedOut: /sign in|log in|unauthor/i.test(body.slice(0, 2000)),
            rows: document.querySelectorAll('[data-work-unit-row], article.alloy-os-ucard, [role="row"]').length,
        };
    });

    expect(out.signedOut, "must be authenticated").toBe(false);
    expect(out.rows, "must have rendered rows").toBeGreaterThan(0);

    const bp = out.cards.business_process ?? "";
    const ch = out.cards.children ?? "";
    const hh = out.cards.household ?? "";
    const has = (s: string, w: string) => (s.includes(w) ? "YES" : "no");

    console.log(
        `[sem] ${LABEL} drawer=${process.env.P076_BLOCK_DRAWER === "1" ? "WITHHELD" : "normal"} ` +
            `cards=${Object.keys(out.cards).length} ` +
            `BP.enrollment=${has(bp, "Enrollment")} ` +
            `BP.rail=${["Lead", "Tour", "Decision", "Waitlist", "Enrolled"].filter((w) => bp.includes(w)).length}/5 ` +
            `CH.northcampus=${has(ch, "North Campus")} ` +
            `CH.emdash=${has(ch, "—")} ` +
            `HH.updated=${/Updated \w+ \d+/.test(hh) ? "YES" : "no"} ` +
            `HH.len=${hh.length}`,
    );
    console.log(`[sem-bp] ${LABEL} ${bp.slice(0, 240)}`);
    console.log(`[sem-ch] ${LABEL} ${ch.slice(0, 240)}`);
    console.log(`[sem-hh] ${LABEL} ${hh.slice(0, 240)}`);
});
