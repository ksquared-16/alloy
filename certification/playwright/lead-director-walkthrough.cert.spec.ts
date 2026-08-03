/**
 * The director walkthrough — Lead, operated the way a new hire would operate it.
 *
 * Not a certification. This spec does NOT assert the product is correct; it RECORDS what an
 * operator encounters and what the database holds afterwards, so hesitation can be reported as
 * evidence rather than opinion. Everything it finds is a product observation, not a test failure.
 *
 * It answers the sprint's question: after configuring "Left Message → follow up tomorrow, three
 * attempts then escalate, Tour Scheduled moves to Tour", can the operator WATCH that happen?
 *
 * Opt-in: set WALKTHROUGH=1. It mutates the tenant.
 */

import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env.WALKTHROUGH === "1";
const OUT = path.join(__dirname, "..", "evidence", "lead-walkthrough");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";

const oneLine = (q: string) => q.replace(/\s+/g, " ").trim();
const sql = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(oneLine(q))}`, { encoding: "utf8" }).trim();

const log: string[] = [];
const note = (line: string) => {
    log.push(line);
    console.log(`[walk] ${line}`);
};

/** Everything the operator's action left behind, in one line. */
function stateOf(opp: string) {
    const stage = sql(`select stage_key||'/'||coalesce(status_key,'-') from opportunities where id='${opp}'`);
    const open = sql(`select count(*) from operational_tasks where entity_id='${opp}' and status='open'`);
    const done = sql(`select count(*) from operational_tasks where entity_id='${opp}' and status<>'open'`);
    const due = sql(
        `select coalesce(string_agg(to_char(due_at,'YYYY-MM-DD'),','),'-') from operational_tasks
         where entity_id='${opp}' and status='open'`,
    );
    // Attention lives on the work item, not the opportunity — itself worth noting.
    const attention = sql(
        `select count(*) from operational_tasks where entity_id='${opp}'
         and coalesce(metadata->>'needs_attention','') <> ''`,
    );
    const activity = sql(`select count(*) from activity_log where entity_id='${opp}'`);
    return { stage, open, done, due, attention, activity };
}

const show = (s: ReturnType<typeof stateOf>) =>
    `stage=${s.stage} open_work=${s.open} closed_work=${s.done} due=${s.due} attention=${s.attention} activity_rows=${s.activity}`;

async function shot(page: Page, name: string) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

test.describe("Lead — director walkthrough", () => {
    test.skip(!RUN, "set WALKTHROUGH=1 — this mutates the tenant");
    test.describe.configure({ mode: "serial" });

    test("a director operates a brand new Lead end to end", async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1512, height: 982 });

        // ── The published configuration this walkthrough is checking against ──────────────
        const plan = sql(`select coalesce((metadata->'lifecycle_builder_v1'->'processes'->0->'stages'->0
                          ->'stage_operating_plan_v1')::text,'(none)') from departments where id='${DEPT}'`);
        note(`configured outcomes: ${(plan.match(/"outcome_key": ?"[a-z_]+"/g) ?? []).join(" ")}`);

        // ── Step 1: the operator arrives ─────────────────────────────────────────────────
        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(4000);
        await shot(page, "01-arrival");
        const arrivalText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
        note(`ARRIVAL url=${page.url()}`);
        note(`ARRIVAL first 400 chars: ${arrivalText.slice(0, 400)}`);

        // Can the operator find Lead work at all? Record what is on offer.
        const navLinks = await page
            .getByRole("link")
            .allInnerTexts()
            .catch(() => [] as string[]);
        note(`NAV offers: ${[...new Set(navLinks.map((t) => t.replace(/\s+/g, " ").trim()))].filter(Boolean).slice(0, 25).join(" | ")}`);

        // ── Step 2: find a Lead with open Contact Family work ─────────────────────────────
        const row = sql(`select o.id::text||'|'||t.id::text||'|'||coalesce(t.title,'?')
                         from opportunities o join operational_tasks t on t.entity_id=o.id
                         where o.stage_key='lead' and t.status='open'
                         order by o.created_at limit 1`);
        const [opp, work, workTitle] = row.split("|");
        note(`SUBJECT opportunity=${opp} work="${workTitle}"`);
        note(`BEFORE ${show(stateOf(opp!))}`);

        // ── Step 3: open the family the way an operator would ────────────────────────────
        for (const url of [`/workspace?opportunity=${opp}`, `/adminV2/workspace?opportunity=${opp}`]) {
            await page.goto(url);
            await page.waitForLoadState("domcontentloaded");
            await page.waitForTimeout(3500);
            const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
            note(`OPEN ${url} -> ${body.slice(0, 200)}`);
            if (/contact family/i.test(body)) break;
        }
        await shot(page, "02-family-open");

        const panelText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
        note(`FOCUS PANEL mentions Contact Family: ${/contact family/i.test(panelText)}`);
        note(`FOCUS PANEL offers outcomes: ${
            ["Reached", "Tour Scheduled", "Left Message", "Awaiting Response", "Unable to Reach", "Closed Lost"]
                .filter((o) => panelText.includes(o))
                .join(", ") || "(none visible)"
        }`);

        /**
         * ── Step 4: the configured chain, executed through the canonical command ──────────
         *
         * The walkthrough drives the same endpoint the Focus Panel drives. Where the UI cannot
         * reach an outcome, that is recorded as a finding — the command still runs so the rest of
         * the chain can be observed.
         */
        const record = async (outcomeKey: string, label: string) => {
            const openWork = sql(`select id::text from operational_tasks
                                  where entity_id='${opp}' and status='open' order by created_at limit 1`);
            if (!openWork) {
                note(`${label}: NO OPEN WORK — cannot record this outcome`);
                return null;
            }
            const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
                data: {
                    department_id: DEPT,
                    stage_key: "lead",
                    work_id: openWork,
                    outcome_key: outcomeKey,
                    subject: { opportunity_id: opp },
                },
            });
            const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            const after = stateOf(opp!);
            note(`${label}: http=${res.status()} -> ${show(after)}`);
            if (res.status() !== 200) note(`${label}: error=${JSON.stringify(body).slice(0, 220)}`);
            return after;
        };

        note("--- the configured chain ---");
        await record("left_message", "1. Left Message (expect: work stays open, follow-up due tomorrow)");
        await record("needs_follow_up", "2. Awaiting Response (expect: follow-up due in 3 days)");
        await record("unable_to_reach", "3. Unable to Reach #1 (expect: retry, under 3 attempts)");
        await record("unable_to_reach", "4. Unable to Reach #2");
        await record("unable_to_reach", "5. Unable to Reach #3 (expect: escalate — attention, no retry)");

        await page.goto(`/workspace?opportunity=${opp}`);
        await page.waitForTimeout(3000);
        await shot(page, "03-after-attempts");

        // ── Step 5: does the operator SEE the escalation? ────────────────────────────────
        const afterAttempts = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
        note(`ESCALATION visible to operator: ${/attention|overdue|escalat/i.test(afterAttempts)}`);
        note(`ATTEMPT COUNT visible to operator: ${/attempt/i.test(afterAttempts)}`);

        // ── Step 6: the exit that matters — Tour Scheduled moves the family ──────────────
        const beforeExit = stateOf(opp!);
        await record("tour_scheduled", "6. Tour Scheduled (expect: stage lead -> tour)");
        const afterExit = stateOf(opp!);
        note(`EXIT stage ${beforeExit.stage} -> ${afterExit.stage}`);

        await page.goto(`/workspace?opportunity=${opp}`);
        await page.waitForTimeout(3000);
        await shot(page, "04-after-tour-scheduled");

        // ── Step 7: Close Lost on a second family ────────────────────────────────────────
        const row2 = sql(`select o.id::text from opportunities o join operational_tasks t on t.entity_id=o.id
                          where o.stage_key='lead' and t.status='open' and o.id<>'${opp}'
                          order by o.created_at limit 1`);
        if (row2) {
            const openWork2 = sql(`select id::text from operational_tasks
                                   where entity_id='${row2}' and status='open' order by created_at limit 1`);
            const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
                data: {
                    department_id: DEPT,
                    stage_key: "lead",
                    work_id: openWork2,
                    outcome_key: "not_interested",
                    subject: { opportunity_id: row2 },
                },
            });
            note(`7. Closed Lost: http=${res.status()} -> ${show(stateOf(row2))}`);
        }

        // ── Step 8: did the family's own activity feed record any of this? ───────────────
        const feed = sql(`select coalesce(string_agg(distinct action,', '),'(empty)')
                          from activity_log where entity_id='${opp}'`);
        note(`ACTIVITY FEED for the family: ${feed}`);
        const events = sql(`select coalesce(string_agg(distinct event_type,', '),'(empty)')
                            from workflow_events where coalesce(payload->>'opportunity_id','')='${opp}'`);
        note(`WORKFLOW EVENTS keyed to the family: ${events}`);

        fs.writeFileSync(path.join(OUT, "walkthrough.log"), log.join("\n") + "\n");
        note(`wrote ${log.length} observations to ${OUT}/walkthrough.log`);
        expect(log.length).toBeGreaterThan(0);
    });
});
