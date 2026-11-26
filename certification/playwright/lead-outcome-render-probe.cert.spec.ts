/**
 * The decisive experiment.
 *
 * The tenant's seeded work rows carry `work_template_key: "first_contact"`; the published Lead
 * plan defines exactly one work template, `contact_family`. So every seeded row belongs to a
 * template that does not exist in the configuration — which is why the panel says "Blocked".
 *
 * That is a seed artifact, not proof the panel cannot render outcomes. This provisions a
 * CORRECTLY-KEYED work item through the platform's own path (recording an outcome creates a
 * `create_next_work` follow-up keyed `contact_family`) and then asks the UI the same question.
 *
 * If the outcomes render here, the product works and the only defect is that the block reason is
 * never shown. If they do not, there is real rendering work. Opt-in via WALKTHROUGH=1.
 */

import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env.WALKTHROUGH === "1";
const OUT = path.join(__dirname, "..", "evidence", "lead-walkthrough");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";
const sql = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(q.replace(/\s+/g, " ").trim())}`, {
        encoding: "utf8",
    }).trim();

const log: string[] = [];
const note = (l: string) => {
    log.push(l);
    console.log(`[render] ${l}`);
};

const OUTCOMES = ["Reached", "Tour Scheduled", "Left Message", "Awaiting Response", "Unable to Reach", "Closed Lost"];

test.describe("Does a correctly-keyed work item render its outcomes?", () => {
    test.skip(!RUN, "set WALKTHROUGH=1 — mutates the tenant");

    test("provision contact_family work, then look", async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1512, height: 982 });

        const opp = sql(`select o.id::text from opportunities o
                         join operational_tasks t on t.entity_id=o.id
                         where o.stage_key='lead' and t.status='open' order by o.created_at limit 1`);
        const seedWork = sql(`select id::text from operational_tasks
                              where entity_id='${opp}' and status='open' order by created_at limit 1`);
        note(`subject=${opp}`);
        note(`seed work keyed: ${sql(`select coalesce(metadata->>'work_template_key','-') from operational_tasks where id='${seedWork}'`)}`);

        // Record Left Message — its configured rule creates follow-up work keyed contact_family.
        const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
            data: {
                department_id: DEPT,
                stage_key: "lead",
                work_id: seedWork,
                outcome_key: "left_message",
                subject: { opportunity_id: opp },
            },
        });
        note(`provisioning call http=${res.status()}`);

        const provisioned = sql(`select coalesce(string_agg(distinct coalesce(metadata->>'operating_plan_template_key',
                                 coalesce(metadata->>'work_template_key','-')),', '),'(none)')
                                 from operational_tasks where entity_id='${opp}' and status='open'`);
        note(`open work now keyed: ${provisioned}`);

        // Now open that family in the UI and ask the same question.
        await page.goto("/workspace/work-unit/new-leads");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(6000);
        const bos = page.getByRole("button", { name: "Close", exact: true });
        if (await bos.count()) await bos.first().click().catch(() => {});
        await page.waitForTimeout(1000);

        // Find this family's row by its inquiry label.
        const label = sql(`select coalesce(name,'') from opportunities where id='${opp}'`);
        note(`looking for row: "${label}"`);
        const row = page.getByText(label, { exact: false }).first();
        if (await row.count()) {
            await row.click().catch(() => {});
            await page.waitForTimeout(4500);
        } else {
            note("row not found in New Leads — using whichever record is selected");
        }

        const body = () => page.locator("body").innerText().then((t) => t.replace(/\s+/g, " "));
        const summary = await body();
        note(`SUMMARY outcomes: ${OUTCOMES.filter((o) => summary.includes(o)).join(", ") || "(none)"}`);
        note(`SUMMARY status chip Blocked: ${/Blocked/.test(summary)}`);

        const drill = page.locator('[data-work-action="open-focused"]');
        if (await drill.count()) {
            await drill.first().click({ timeout: 15_000 }).catch(() => {});
            await page.waitForTimeout(3500);
        }
        const focused = await body();
        note(`FOCUSED outcomes: ${OUTCOMES.filter((o) => focused.includes(o)).join(", ") || "(none)"}`);
        note(`FOCUSED "Record outcome": ${/record outcome/i.test(focused)}`);
        await page.screenshot({ path: path.join(OUT, "11-correctly-keyed.png"), fullPage: true });

        fs.writeFileSync(path.join(OUT, "render-probe.log"), log.join("\n") + "\n");
        expect(log.length).toBeGreaterThan(0);
    });
});
