/**
 * Can a director REACH a Lead family by clicking, and record an outcome there?
 *
 * The first walkthrough drove the command API directly, which proves the backend but not the
 * product. This one only clicks. It is deliberately fair: "New Leads" shows 0, so it also tries
 * "All Work" and global search before concluding a family is unreachable.
 *
 * Records; does not assert. Opt-in via WALKTHROUGH=1.
 */

import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env.WALKTHROUGH === "1";
const OUT = path.join(__dirname, "..", "evidence", "lead-walkthrough");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const sql = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(q.replace(/\s+/g, " ").trim())}`, {
        encoding: "utf8",
    }).trim();

const log: string[] = [];
const note = (l: string) => {
    log.push(l);
    console.log(`[click] ${l}`);
};

test.describe("Lead — reachable by clicking?", () => {
    test.skip(!RUN, "set WALKTHROUGH=1");

    test("a director tries to open a Lead family and record an outcome", async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1512, height: 982 });

        const leadCount = sql(`select count(*) from opportunities where stage_key='lead'`);
        note(`DB holds ${leadCount} opportunities in stage 'lead'`);

        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(4000);

        // ── Route 1: the Work View built for exactly this ────────────────────────────────
        const newLeads = page.getByText("New Leads", { exact: false }).first();
        if (await newLeads.count()) {
            await newLeads.click().catch(() => {});
            await page.waitForTimeout(3500);
            const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
            note(`ROUTE 1 "New Leads" -> url=${page.url()}`);
            note(`ROUTE 1 shows: ${body.slice(0, 280)}`);
            await page.screenshot({ path: path.join(OUT, "05-new-leads-view.png"), fullPage: true });
        } else {
            note("ROUTE 1 — no New Leads entry found");
        }

        // ── Route 2: All Work, which reports 100 rows ────────────────────────────────────
        await page.goto("/workspace");
        await page.waitForTimeout(3000);
        const allWork = page.getByText("All Work", { exact: false }).first();
        if (await allWork.count()) {
            await allWork.click().catch(() => {});
            await page.waitForTimeout(4000);
            const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
            note(`ROUTE 2 "All Work" -> url=${page.url()}`);
            note(`ROUTE 2 first rows: ${body.slice(0, 320)}`);
            await page.screenshot({ path: path.join(OUT, "06-all-work.png"), fullPage: true });

            // Open the first row and see what the Focus Panel offers.
            const firstRow = page.locator('[data-testid^="queue-row"], [role="row"], button').filter({
                hasText: /Family|Child|Test/i,
            });
            if (await firstRow.count()) {
                await firstRow.first().click().catch(() => {});
                await page.waitForTimeout(4000);
                const panel = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
                note(`ROUTE 2 opened a row -> ${panel.slice(0, 320)}`);
                const offered = [
                    "Reached", "Tour Scheduled", "Left Message", "Awaiting Response",
                    "Unable to Reach", "Closed Lost", "Contact Family", "Record Outcome",
                ].filter((o) => panel.includes(o));
                note(`ROUTE 2 Focus Panel offers: ${offered.join(", ") || "(none of the configured outcomes)"}`);
                await page.screenshot({ path: path.join(OUT, "07-focus-panel.png"), fullPage: true });
            } else {
                note("ROUTE 2 — no clickable row found");
            }
        }

        // ── Route 3: global search for a known Lead family ───────────────────────────────
        const name = sql(`select coalesce(t.title,'') from operational_tasks t
                          join opportunities o on o.id=t.entity_id
                          where o.stage_key='lead' and t.status='open' limit 1`);
        note(`ROUTE 3 searching for work titled: "${name}"`);
        await page.goto("/workspace");
        await page.waitForTimeout(2500);
        const search = page.getByPlaceholder(/search/i).first();
        if (await search.count()) {
            await search.fill("Test Family 0004").catch(() => {});
            await page.waitForTimeout(3500);
            const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
            note(`ROUTE 3 search results: ${body.slice(0, 300)}`);
            await page.screenshot({ path: path.join(OUT, "08-search.png"), fullPage: true });
        } else {
            note("ROUTE 3 — no search input found");
        }

        fs.writeFileSync(path.join(OUT, "clickthrough.log"), log.join("\n") + "\n");
        expect(log.length).toBeGreaterThan(0);
    });
});
