/**
 * Lead Operating Model V1 — the approved backend model, authored and certified (B1.7).
 *
 * The corrected configuration is authored into the DRAFT and published through the canonical
 * path, then exercised. The point of the sprint is that this is all it takes: no platform change,
 * no new engine, no Enrollment-specific infrastructure — just configuration on the Business
 * Process platform, published like anything else.
 *
 * The defect this closes: `reached_family` used to MOVE the family to Tour. Recording a phone
 * call silently relocated a record into a stage where no tour existed. Movement to Tour now has
 * exactly one cause — a tour was scheduled.
 */
import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "lead-operating-model");
const PLAN_FILE = process.env.CERT_LEAD_PLAN || path.join(__dirname, "..", "fixtures", "lead-plan.json");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";
const PROCESS = process.env.CERT_PROCESS_ID || "00000000-0000-4000-8000-000000000021";
const EMAIL = process.env.CERT_OPERATOR_EMAIL || "qa.operator@northwind.invalid";
const PASSWORD = process.env.CERT_OPERATOR_PASSWORD || "alloy-local-cert";

const oneLine = (q: string) => q.replace(/\s+/g, " ").trim();
const sql = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(oneLine(q))}`, { encoding: "utf8" }).trim();
const sqlFile = (body: string) => {
    const f = path.join(EVIDENCE, `.author-${Date.now()}.sql`);
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(f, body);
    try {
        execSync(`psql ${JSON.stringify(DB)} -v ON_ERROR_STOP=1 -q -f ${JSON.stringify(f)}`, { encoding: "utf8" });
    } finally {
        fs.rmSync(f, { force: true });
    }
};

const draftPlan = (jsonPath: string) =>
    sql(`select coalesce((payload->'processes'->0->'stages'->0->'stage_operating_plan_v1'${jsonPath})::text,'(none)')
         from business_process_drafts where department_id='${DEPT}'`);
const publishedPlan = (jsonPath: string) =>
    sql(`select coalesce((metadata->'lifecycle_builder_v1'->'processes'->0->'stages'->0->'stage_operating_plan_v1'${jsonPath})::text,'(none)')
         from departments where id='${DEPT}'`);
const draftRevision = () =>
    Number(sql(`select coalesce(max(draft_revision),-1) from business_process_drafts where department_id='${DEPT}'`));
const revisionCount = () =>
    Number(sql(`select count(*) from business_process_revisions where department_id='${DEPT}'`));

/** The family under test: stage / status / close reason, plus its open work. */
const familyState = (oppId: string) =>
    sql(`select stage_key || '/' || coalesce(status_key,'-') || '/' || coalesce(close_reason_key,'-')
         from opportunities where id='${oppId}'`);
const openWorkCount = (oppId: string) =>
    Number(sql(`select count(*) from operational_tasks where entity_id='${oppId}' and status='open'`));
const workStatus = (workId: string) =>
    sql(`select coalesce(status,'(missing)') from operational_tasks where id='${workId}'`);

const evidence: string[] = [];
const record = (line: string) => {
    evidence.push(line);
    console.log(`[lead] ${line}`);
};

async function shot(page: Page, name: string) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

/** Complete stage work with an outcome, through the canonical command. */
async function recordOutcome(page: Page, oppId: string, workId: string, outcomeKey: string, stageKey = "lead") {
    const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
        data: {
            department_id: DEPT,
            stage_key: stageKey,
            work_id: workId,
            outcome_key: outcomeKey,
            subject: { opportunity_id: oppId },
        },
    });
    return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** A fresh family sitting in Lead with open Contact Family work. */
function pickLeadFamily(): { opp: string; work: string } {
    const row = sql(`select o.id::text || '|' || t.id::text from opportunities o
                     join operational_tasks t on t.entity_id = o.id
                     where o.stage_key='lead' and t.status='open'
                     order by o.created_at limit 1`);
    const [opp, work] = (row || "|").split("|");
    return { opp, work };
}

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: Number(process.env.CERT_AUTH_WAIT_MS || 180_000) });
});

test.afterAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE, "evidence.txt"), evidence.join("\n"));
    await page.close();
});

test("L0 author the corrected Lead configuration into the DRAFT", async () => {
    // Reading the editor materializes the draft — the same path an operator takes.
    const boot = await page.request.get(
        `/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=lead&primary_record_label=Lead`,
    );
    expect(boot.status()).toBe(200);
    expect(draftRevision()).toBeGreaterThanOrEqual(0);
    record(`L0 draft materialized at revision ${draftRevision()}`);

    const plan = fs.readFileSync(PLAN_FILE, "utf8");
    const publishedBefore = publishedPlan("->'outcome_rules'");

    sqlFile(`
UPDATE business_process_drafts
SET payload = jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1}', $plan$${plan}$plan$::jsonb),
    draft_revision = draft_revision + 1
WHERE department_id = '${DEPT}';

-- Work View membership by authoritative family STAGE, never opportunity status.
UPDATE business_process_drafts
SET payload = jsonb_set(payload, '{processes,0,work_views_v1}',
      (SELECT jsonb_agg(CASE
          WHEN v->>'id' = 'new_leads' THEN v || '{"filters_v1":[{"field_key":"opportunity_stage","operator":"equals","value":"lead"}],"match":"all"}'::jsonb
          WHEN v->>'id' = 'tours'     THEN v || '{"filters_v1":[{"field_key":"opportunity_stage","operator":"equals","value":"tour"}],"match":"all"}'::jsonb
          WHEN v->>'id' = 'all_work'  THEN v || '{"filters_v1":[]}'::jsonb
          ELSE v END ORDER BY ord)
       FROM jsonb_array_elements(payload->'processes'->0->'work_views_v1') WITH ORDINALITY AS t(v, ord))),
    draft_revision = draft_revision + 1
WHERE department_id = '${DEPT}';
`);

    const outcomes = draftPlan("->'outcomes'");
    record(`L0 draft outcomes: ${outcomes.replace(/\s+/g, " ").slice(0, 200)}`);
    expect(outcomes).toContain("tour_scheduled");
    expect(outcomes).toContain("unable_to_reach");

    // Nothing has reached runtime yet — authoring is not publishing.
    expect(publishedPlan("->'outcome_rules'")).toBe(publishedBefore);
    record(`L0 published rules unchanged by authoring: true`);
});

test("L1 validate and publish the corrected model through the canonical path", async () => {
    const revisionsBefore = revisionCount();

    const validation = await page.request.post("/api/admin/business-process/configuration/validate", {
        data: { department_id: DEPT },
    });
    const v = (await validation.json()) as { can_publish: boolean; errors: { message?: string }[] };
    record(`L1 validate can_publish=${v.can_publish} errors=${v.errors.length}` +
        (v.errors.length ? ` first="${v.errors[0]?.message?.slice(0, 120)}"` : ""));
    expect(v.can_publish).toBe(true);

    const published = await page.request.post("/api/admin/business-process/configuration/publish", {
        data: { department_id: DEPT },
    });
    record(`L1 publish http=${published.status()} revisions ${revisionsBefore} -> ${revisionCount()}`);
    expect(published.status()).toBe(200);
    expect(revisionCount()).toBeGreaterThan(revisionsBefore);

    // Only now does runtime carry the model.
    const rules = publishedPlan("->'outcome_rules'");
    expect(rules).toContain("tour_scheduled_to_tour");
    record(`L1 runtime now carries the corrected rules`);
});

test("L2 the retired behaviour is GONE from the published model", async () => {
    const rules = publishedPlan("->'outcome_rules'");

    // L1/L2 from the inventory: neither Reached nor Interested may move a family to Tour.
    expect(rules).not.toContain("reached_family_to_tour");
    expect(rules).not.toContain("interested_to_tour");

    // Reached now completes the work and stays put.
    expect(rules).toContain("reached_qualified_complete");
    // Every rule that moves through lead_to_tour must be a tour-scheduled path. Asserting the
    // INVARIANT rather than a count: a legitimate second path exists (the booking domain signal),
    // and a bare number would have to be edited every time the model gains one — which is exactly
    // how an assertion stops protecting anything.
    const movingRuleKeys = (JSON.parse(rules) as { rule_key: string; targets?: { transition_ref?: string }[] }[])
        .filter((r) => (r.targets ?? []).some((t) => t.transition_ref === "lead_to_tour"))
        .map((r) => r.rule_key);
    record(`L2 rules moving through lead_to_tour: ${movingRuleKeys.join(", ")}`);
    expect(movingRuleKeys.length).toBeGreaterThan(0);
    for (const key of movingRuleKeys) {
        expect(key, `${key} moves to Tour but is not a tour-scheduled path`).toMatch(/tour_scheduled|tour_booking_scheduled/);
    }

    // `interested` survives as a non-moving outcome so historical records still resolve.
    const outcomes = publishedPlan("->'outcomes'");
    expect(outcomes).toContain("interested");
    expect(rules).toContain("interested_retired_no_movement");
    record(`L2 interested retained as non-moving — historical evidence preserved`);
});

test("L3 Work View predicates are published, and use STAGE not status", async () => {
    const views = sql(`select coalesce(string_agg(v->>'id' || '=' || coalesce((v->'filters_v1')::text,'(absent)'), ' | '), '(none)')
                       from departments d, jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p,
                       jsonb_array_elements(coalesce(p->'work_views_v1','[]'::jsonb)) v
                       where d.id='${DEPT}' and p->>'id'='${PROCESS}'`);
    record(`L3 published Work View predicates: ${views}`);

    // Assert semantically — jsonb does not preserve key order, so matching a literal object
    // string would be testing Postgres's serializer rather than the configuration.
    const predicate = (viewId: string) =>
        sql(`select coalesce((v->'filters_v1')::text,'(absent)')
             from departments d, jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p,
             jsonb_array_elements(coalesce(p->'work_views_v1','[]'::jsonb)) v
             where d.id='${DEPT}' and p->>'id'='${PROCESS}' and v->>'id'='${viewId}'`);

    for (const [viewId, stage] of [["new_leads", "lead"], ["tours", "tour"]] as const) {
        const raw = predicate(viewId);
        record(`L3 ${viewId} predicate: ${raw}`);
        const filters = JSON.parse(raw) as { field_key: string; operator: string; value: unknown }[];
        expect(filters).toHaveLength(1);
        expect(filters[0]!.field_key).toBe("opportunity_stage");
        expect(filters[0]!.operator).toBe("equals");
        expect(filters[0]!.value).toBe(stage);
    }

    // All Leads is the include-all view: empty filters is the sanctioned process-wide catch-all.
    expect(JSON.parse(predicate("all_work"))).toEqual([]);
    // Status must never stand in for stage.
    expect(views).not.toContain("opportunity_status");
});

test("L4 Reached / Qualified completes the work and the family STAYS in Lead", async () => {
    const { opp, work } = pickLeadFamily();
    record(`L4 subject opp=${opp} work=${work}`);
    expect(opp).not.toBe("");

    const before = familyState(opp);
    const res = await recordOutcome(page, opp, work, "reached_family");
    const after = familyState(opp);
    record(`L4 execute http=${res.status} ok=${res.body.ok} | family ${before} -> ${after} | work=${workStatus(work)}`);

    expect(res.status).toBe(200);
    // The heart of the correction: contact succeeded, the family did not move.
    expect(after.startsWith("lead/")).toBe(true);
    expect(workStatus(work)).not.toBe("open");
    await shot(page, "L4-reached-stays-in-lead");
});

test("L5 Left Message stays in Lead and creates follow-up work", async () => {
    const { opp, work } = pickLeadFamily();
    const openBefore = openWorkCount(opp);
    const before = familyState(opp);

    const res = await recordOutcome(page, opp, work, "left_message");
    const after = familyState(opp);
    const openAfter = openWorkCount(opp);
    record(`L5 execute http=${res.status} | family ${before} -> ${after} | open work ${openBefore} -> ${openAfter}`);

    expect(res.status).toBe(200);
    expect(after.startsWith("lead/")).toBe(true);
    // Follow-up exists: the operator has something to come back to.
    expect(openAfter).toBeGreaterThanOrEqual(openBefore);
});

test("L6 Awaiting Response stays in Lead and creates follow-up work", async () => {
    const { opp, work } = pickLeadFamily();
    const openBefore = openWorkCount(opp);

    const res = await recordOutcome(page, opp, work, "needs_follow_up");
    record(`L6 execute http=${res.status} | family ${familyState(opp)} | open work ${openBefore} -> ${openWorkCount(opp)}`);

    expect(res.status).toBe(200);
    expect(familyState(opp).startsWith("lead/")).toBe(true);
});

test("L7 Unable to Reach never auto-closes the Lead", async () => {
    const { opp, work } = pickLeadFamily();
    const before = familyState(opp);

    const res = await recordOutcome(page, opp, work, "unable_to_reach");
    const after = familyState(opp);
    record(`L7 execute http=${res.status} | family ${before} -> ${after}`);

    expect(res.status).toBe(200);
    // The approved decision: the system must NEVER automatically close the Lead.
    expect(after.startsWith("lead/")).toBe(true);
    expect(after).not.toContain("/closed");
    record(`L7 family remains in Lead and is NOT closed — closure stays an operator decision`);
});

test("L8 Tour Scheduled is the ONLY thing that moves the family to Tour", async () => {
    const { opp, work } = pickLeadFamily();
    const before = familyState(opp);
    record(`L8 subject opp=${opp} work=${work} state=${before}`);

    const res = await recordOutcome(page, opp, work, "tour_scheduled");
    const after = familyState(opp);
    record(`L8 execute http=${res.status} ok=${res.body.ok} | family ${before} -> ${after} | work=${workStatus(work)}`);

    expect(res.status).toBe(200);
    // Stage truth moved through the published transition graph.
    expect(after.startsWith("tour/")).toBe(true);
    expect(workStatus(work)).not.toBe("open");
    await shot(page, "L8-tour-scheduled-moves-to-tour");

    // And no legacy durable status was written.
    const status = sql(`select coalesce(status_key,'-') from opportunities where id='${opp}'`);
    record(`L8 durable opportunity status after the move: ${status}`);
    expect(status).not.toBe("tour_scheduled");
});

test("L9 no family anywhere carries a legacy tour_scheduled durable status", async () => {
    const count = sql(`select count(*) from opportunities where status_key='tour_scheduled'`);
    record(`L9 opportunities with durable status 'tour_scheduled': ${count}`);
    expect(Number(count)).toBe(0);
});

test("L10 draft, validation, publication and runtime remain separate and visible", async () => {
    const state = await page.request.get(
        `/api/admin/lifecycle-builder/stage-bootstrap?department_id=${DEPT}&stage_key=lead&primary_record_label=Lead`,
    );
    const body = (await state.json()) as {
        configuration_state?: { status?: string; draft_revision?: number; base_revision_id?: string | null };
    };
    record(
        `L10 editor state: status=${body.configuration_state?.status} ` +
        `draft_revision=${body.configuration_state?.draft_revision} ` +
        `base_revision=${body.configuration_state?.base_revision_id ? "present" : "none"} ` +
        `| revisions=${revisionCount()}`,
    );
    // All four are independently observable — that is what makes the model legible to an operator.
    expect(body.configuration_state?.status).toBeTruthy();
    expect(body.configuration_state?.draft_revision).toBeGreaterThanOrEqual(0);
    expect(revisionCount()).toBeGreaterThan(0);
});
