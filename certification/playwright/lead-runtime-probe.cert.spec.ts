/**
 * Does the elevation work? The outcomes live in `CurrentWorkFocusedSurface`, reached by the
 * card-footer "View details →" (`[data-work-action="open-focused"]`). The audit clicked by text
 * and nothing happened — this clicks the real control and reports what the runtime already holds
 * versus what reaches the screen.
 *
 * Diagnostic only. Opt-in via WALKTHROUGH=1.
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env.WALKTHROUGH === "1";
const OUT = path.join(__dirname, "..", "evidence", "lead-walkthrough");
const log: string[] = [];
const note = (l: string) => {
    log.push(l);
    console.log(`[probe] ${l}`);
};

const OUTCOMES = ["Reached", "Tour Scheduled", "Left Message", "Awaiting Response", "Unable to Reach", "Closed Lost"];

test.describe("Current Work — elevation probe", () => {
    test.skip(!RUN, "set WALKTHROUGH=1");

    test("click the real drill-in control and report what appears", async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1512, height: 982 });
        await page.goto("/workspace/work-unit/new-leads");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(6000);

        const bos = page.getByRole("button", { name: "Close", exact: true });
        if (await bos.count()) await bos.first().click().catch(() => {});
        await page.waitForTimeout(1500);

        // Select a lead — after a tenant reset nothing is auto-selected, and an unselected panel
        // renders no Current Work card at all (which is not the thing under test).
        const target = process.env.PROBE_ROW || 'Test Family';
        const row = page.locator('[role="option"], [data-testid^="queue-row"], button').filter({ hasText: target }).first();
        if (await row.count()) {
            await row.click().catch(() => {});
            await page.waitForTimeout(4500);
            note("selected a lead row");
        } else {
            note("no lead row found to select");
        }

        const body = () => page.locator("body").innerText().then((t) => t.replace(/\s+/g, " "));

        const before = await body();
        const blockedNodes = await page.locator('[data-work-outcome-blocked="true"]').count();
        note(`BLOCK REASON rendered: ${blockedNodes} node(s)`);
        if (blockedNodes) {
            note(`BLOCK REASON text: "${(await page.locator('[data-work-outcome-blocked="true"]').first().innerText()).trim()}"`);
        }
        note(`SUMMARY outcomes visible: ${OUTCOMES.filter((o) => before.includes(o)).join(", ") || "(none)"}`);

        const drill = page.locator('[data-work-action="open-focused"]');
        note(`drill-in control count: ${await drill.count()}`);

        if (await drill.count()) {
            await drill.first().click({ timeout: 15_000 }).catch((e) => note(`click failed: ${String(e).slice(0, 120)}`));
            await page.waitForTimeout(3500);
            const after = await body();
            note(`FOCUSED outcomes visible: ${OUTCOMES.filter((o) => after.includes(o)).join(", ") || "(none)"}`);
            note(`FOCUSED grew by ${after.length - before.length} chars`);
            note(`"Record outcome" present: ${/record outcome/i.test(after)}`);
            note(`block reason phrases: ${
                (after.match(/[^.]*\b(cannot be recorded|blocked because|still needed|missing)\b[^.]*/i) ?? ["(none)"])[0].slice(0, 180)
            }`);
            await page.screenshot({ path: path.join(OUT, "10-focused-surface.png"), fullPage: true });
        }

        // What the runtime HOLDS for this record, regardless of what is drawn.
        const holds = await page.evaluate(() => {
            const out: Record<string, unknown> = {};
            const el = document.querySelector('[data-work-action="open-focused"]');
            out.drillPresent = Boolean(el);
            // Any element carrying resolution/outcome test hooks.
            out.outcomeNodes = document.querySelectorAll('[data-outcome-key], [data-resolution-key]').length;
            out.statusChips = Array.from(document.querySelectorAll("[data-work-status], [data-status]"))
                .map((n) => (n as HTMLElement).innerText?.trim())
                .filter(Boolean)
                .slice(0, 8);
            return out;
        });
        note(`RUNTIME hooks in DOM: ${JSON.stringify(holds)}`);

        fs.writeFileSync(path.join(OUT, "probe.log"), log.join("\n") + "\n");
        expect(log.length).toBeGreaterThan(0);
    });
});
