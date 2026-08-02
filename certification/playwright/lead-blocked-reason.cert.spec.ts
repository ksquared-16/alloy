/**
 * "Contact Family — Blocked". Can the operator find out WHY, and record an outcome anyway?
 *
 * The surface computes an `outcomeCompletionBlockReason`. Whether it reaches the screen decides
 * between a Critical finding (dead end) and a Medium one (explained, one click away).
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env.WALKTHROUGH === "1";
const OUT = path.join(__dirname, "..", "evidence", "lead-walkthrough");
const log: string[] = [];
const note = (l: string) => {
    log.push(l);
    console.log(`[blocked] ${l}`);
};

test.describe("Contact Family — why is it blocked?", () => {
    test.skip(!RUN, "set WALKTHROUGH=1");

    test("the operator looks for the block reason and a way to record an outcome", async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1512, height: 982 });

        await page.goto("/workspace/work-unit/new-leads");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(5000);

        // Close BOS so it does not cover the panel.
        const bos = page.getByRole("button", { name: "Close", exact: true });
        if (await bos.count()) await bos.first().click().catch(() => {});
        await page.waitForTimeout(1500);

        const body = () => page.locator("body").innerText().then((t) => t.replace(/\s+/g, " "));

        const before = await body();
        note(`WHAT'S NEXT status chip present: ${/Blocked/.test(before)}`);
        note(`Reason visible on the card: ${
            /because|missing|required|cannot|need/i.test(before.slice(0, 1200)) ? "maybe" : "NO"
        }`);
        note(`Configured outcomes visible on the card: ${
            ["Left Message", "Awaiting Response", "Unable to Reach", "Tour Scheduled", "Reached", "Closed Lost"]
                .filter((o) => before.includes(o)).join(", ") || "(none)"
        }`);

        // Hover the chip — a tooltip is still an explanation.
        const chip = page.getByText("Blocked", { exact: true }).first();
        if (await chip.count()) {
            await chip.hover().catch(() => {});
            await page.waitForTimeout(1200);
            const t = await body();
            const grew = t.length - before.length;
            note(`Hovering "Blocked" revealed ${grew} extra chars`);
            const title = await chip.getAttribute("title").catch(() => null);
            note(`"Blocked" title attribute: ${title ?? "(none)"}`);
        } else {
            note('No "Blocked" chip found to hover');
        }

        // The documented next step on the card.
        const details = page.getByText("View details", { exact: false }).first();
        if (await details.count()) {
            await details.click().catch(() => {});
            await page.waitForTimeout(4000);
            const after = await body();
            note(`AFTER "View details" url=${page.url()}`);
            note(`Reason now stated: ${
                (after.match(/[^.]*\b(blocked|missing|required|cannot be recorded)\b[^.]*\./i) ?? ["(none)"])[0].slice(0, 200)
            }`);
            note(`Outcomes now offered: ${
                ["Left Message", "Awaiting Response", "Unable to Reach", "Tour Scheduled", "Reached", "Closed Lost"]
                    .filter((o) => after.includes(o)).join(", ") || "(none)"
            }`);
            note(`"Record outcome" affordance present: ${/record outcome/i.test(after)}`);
            await page.screenshot({ path: path.join(OUT, "09-view-details.png"), fullPage: true });
        } else {
            note('No "View details" link found');
        }

        fs.writeFileSync(path.join(OUT, "blocked-reason.log"), log.join("\n") + "\n");
        expect(log.length).toBeGreaterThan(0);
    });
});
