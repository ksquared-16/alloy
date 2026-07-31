/**
 * The execution graph, certified end to end (Law 4 + Law 6, editor family 2).
 *
 *   author a transition in the draft → reload → reference it from an outcome → validate
 *   → publish → execute → the family actually moves Lead → Tour
 *
 * plus every negative path that must produce NO durable mutation.
 *
 * The failure this proves closed: an outcome references `lead_to_tour`, the persisted Lead stage
 * declares no such transition, the status write succeeds, the stage move finds nothing, and durable
 * state contradicts itself.
 *
 * Every operator-visible claim is paired with a SQL claim, because the point of this sprint is that
 * the screen used to say things the database did not support.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "execution-graph");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";
const EMAIL = process.env.CERT_OPERATOR_EMAIL || "qa.operator@northwind.invalid";
const PASSWORD = process.env.CERT_OPERATOR_PASSWORD || "alloy-local-cert";
const PROCESSES_URL = "/adminV2/settings/organization/processes";

const oneLine = (q: string) => q.replace(/\s+/g, " ").trim();
const sql = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(oneLine(q))}`, { encoding: "utf8" }).trim();
const sqlExec = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -v ON_ERROR_STOP=1 -q -c ${JSON.stringify(oneLine(q))}`, {
        encoding: "utf8",
    });

const projection = () =>
    sql(`select coalesce(metadata->'lifecycle_builder_v1','null')::text from departments where id='${DEPT}'`);
const draftRevision = () =>
    Number(sql(`select draft_revision from business_process_drafts where department_id='${DEPT}'`));
const revisionCount = () =>
    Number(sql(`select count(*) from business_process_revisions where department_id='${DEPT}'`));
const publicationCount = () =>
    Number(
        sql(`select count(*) from configuration_publications where subject_id='${DEPT}' and domain_key='business_process'`),
    );
/** Transitions the LEAD stage declares, in the DRAFT. */
const draftLeadTransitions = () =>
    sql(
        `select coalesce(string_agg(t->>'transition_ref', ','), '') from business_process_drafts d,
         jsonb_array_elements(d.payload->'processes'->0->'stages') s,
         jsonb_array_elements(coalesce(s->'stage_operating_plan_v1'->'outgoing_transitions','[]'::jsonb)) t
         where d.department_id='${DEPT}' and s->>'key'='lead'`,
    );

const evidence: string[] = [];
const record = (line: string) => {
    evidence.push(line);
    console.log(`[graph] ${line}`);
};

async function shot(page: Page, name: string) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function login(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 60_000 });
}

async function openStage(page: Page, stageKey: string) {
    await page.goto(PROCESSES_URL);
    await page.waitForLoadState("domcontentloaded");
    const close = page.getByRole("button", { name: "Close", exact: true });
    if (await close.count()) await close.first().click().catch(() => {});
    await page.getByTestId("business-process-tab-stages").click();
    await page.getByTestId(`lifecycle-stage-tab-${stageKey}`).click();
    await expect(page.getByTestId("bp-publication-bar")).toBeVisible({ timeout: 30_000 });
}

/** Expand the accordion that owns the operating plan, so its editors are reachable. */
async function openOperatingPlan(page: Page) {
    for (const name of [/Operational Experience/, /Possible Outcomes/]) {
        const button = page.getByRole("button", { name }).first();
        if (await button.count()) await button.click().catch(() => {});
        await page.waitForTimeout(600);
    }
}

async function saveStage(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/stage-runtime-config"), { timeout: 45_000 }),
        page.getByTestId("stage-editor-v2-save").click(),
    ]);
    return { status: response.status(), body: await response.json().catch(() => ({})) };
}

async function waitForBarInSync(page: Page) {
    await expect(page.getByTestId("bp-publication-bar")).toHaveAttribute(
        "data-draft-revision",
        String(draftRevision()),
        { timeout: 20_000 },
    );
}

async function publish(page: Page) {
    await waitForBarInSync(page);
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/configuration/publish"), { timeout: 45_000 }),
        page.getByTestId("bp-publication-publish").click(),
    ]);
    return { status: response.status(), body: await response.json().catch(() => ({})) };
}

/** Run the publish gate over the current draft without touching the UI. */
async function validateViaApi(page: Page) {
    const res = await page.request.post("/api/admin/business-process/configuration/validate", {
        data: { department_id: DEPT },
    });
    return { status: res.status(), body: (await res.json()) as { errors: { code: string; message: string }[]; can_publish: boolean } };
}

/** Author a draft payload directly, advancing the token the way a real save does. */
function patchDraft(jsonbExpression: string) {
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = ${jsonbExpression}, draft_revision = draft_revision + 1
        WHERE department_id = '${DEPT}'`);
}

test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let page: Page;
/** Every lifecycle-builder PATCH seen during the certified flow. Must stay empty. */
const builderPatches: string[] = [];

test.beforeAll(async ({ browser }) => {
    browserRef = browser;
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    page.on("request", (r) => {
        // The known asymmetry: this route's GET reads the draft but its PATCH still writes the
        // published projection. It must never appear on a certified path.
        if (r.method() === "PATCH" && /\/api\/admin\/departments\/[^/]+\/lifecycle-builder/.test(r.url())) {
            builderPatches.push(r.url());
        }
    });
    await login(page);
});

test.afterAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE, "evidence.log"), evidence.join("\n") + "\n");
});

// ─────────────────────────────────────────────────────────────────────────────

test("G1 the pristine representative seed validates and publishes", async () => {
    expect(publicationCount()).toBe(0);
    await openStage(page, "lead");

    const validation = await validateViaApi(page);
    record(`G1 validate can_publish=${validation.body.can_publish} errors=${validation.body.errors.length}`);
    expect(validation.body.errors).toEqual([]);
    expect(validation.body.can_publish).toBe(true);

    const published = await publish(page);
    record(`G1 publish http=${published.status} revision=${published.body.published?.revision_number}`);
    expect(published.status).toBe(200);
    expect(revisionCount()).toBe(1);
    expect(publicationCount()).toBe(1);
    expect(projection()).toContain("lead_to_tour");
    await shot(page, "G1-seed-published");
});

test("G2 deleting a referenced transition is blocked AT AUTHORING, with the dependency named", async () => {
    // `lead_to_tour` is referenced by the Lead stage's reached_family / interested rules.
    await openStage(page, "lead");
    await openOperatingPlan(page);

    const editor = page.getByTestId("stage-outgoing-transitions-editor");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    const leadToTourRow = editor.locator('[data-transition-ref="lead_to_tour"]');
    await expect(leadToTourRow).toBeVisible();
    const index = (await leadToTourRow.getAttribute("data-testid"))!.replace("stage-transition-row-", "");

    const projectionBefore = projection();
    const draftBefore = draftRevision();

    await page.getByTestId(`stage-transition-remove-${index}`).click();
    await page.waitForTimeout(1500);

    // The editor validates live and names the dependent references. This is decision D3 acting at
    // the point of authoring rather than deferring the news to publish.
    const issues = await page.getByTestId("stage-editor-v2").innerText();
    record(`G2 authoring issues: ${issues.replace(/\s+/g, " ").match(/Selected transition[^.]*\.|Outcome movement[^.]*\./g)?.join(" ") ?? "(none)"}`);
    expect(issues).toContain("Outcome movement must reference a configured transition identity");
    await shot(page, "G2-referenced-transition-removed");

    // The save is refused and NOTHING durable changes. Which layer refuses is an implementation
    // detail — this used to be a client-side throw that never sent the request, which is exactly
    // the silent failure D3 removed. What must hold is that the operator is told and the draft,
    // the projection and the revision history are all untouched.
    let saveStatus: number | null = null;
    const listener = (r: { url: () => string; status: () => number }) => {
        if (r.url().includes("/stage-runtime-config")) saveStatus = r.status();
    };
    page.on("response", listener);
    await page.getByTestId("stage-editor-v2-save").click().catch(() => {});
    await page.waitForTimeout(4000);
    page.off("response", listener);

    const refusedAt = saveStatus === null ? "client (no request sent)" : `server (http ${saveStatus})`;
    record(`G2 refused at: ${refusedAt}; draft ${draftBefore} -> ${draftRevision()}`);
    // If a request went out at all, it must have been refused — never accepted.
    if (saveStatus !== null) expect(saveStatus).toBeGreaterThanOrEqual(400);
    expect(draftRevision()).toBe(draftBefore);
    expect(projection()).toBe(projectionBefore);
    expect(revisionCount()).toBe(1);
    expect(projection()).toContain("lead_to_tour");
});

test("G3 authoring a transition writes the draft only, and survives reload", async () => {
    // Restore the graph, then author a NEW transition through the editor: Lead → Placement/Decision.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = (select payload from business_process_revisions
                       where department_id='${DEPT}' order by revision_number desc limit 1),
            draft_revision = draft_revision + 1
        WHERE department_id='${DEPT}'`);

    const projectionBefore = projection();
    const revisionBefore = draftRevision();

    await openStage(page, "lead");
    await openOperatingPlan(page);
    await expect(page.getByTestId("stage-outgoing-transitions-editor")).toBeVisible({ timeout: 20_000 });

    const before = await page.getByTestId("stage-outgoing-transitions-editor").locator("[data-transition-ref]").count();
    await page.getByTestId("stage-transition-add").click();
    const newIndex = before;
    // Identity is minted internally; the operator authors the LABEL and the destination.
    await page.getByTestId(`stage-transition-label-${newIndex}`).fill("Lead → Placement / Decision");
    await page.getByTestId(`stage-transition-destination-${newIndex}`).selectOption("decision");
    await shot(page, "G3-transition-authored");

    const saved = await saveStage(page);
    record(`G3 save http=${saved.status} publication_required=${saved.body.publication_required}`);
    expect(saved.status).toBe(200);
    expect(saved.body.publication_required).toBe(true);

    // Draft moved; runtime did not.
    record(`G3 draft ${revisionBefore} -> ${draftRevision()}; projection unchanged=${projection() === projectionBefore}`);
    expect(draftRevision()).toBeGreaterThan(revisionBefore);
    expect(projection()).toBe(projectionBefore);
    expect(revisionCount()).toBe(1);

    // Reload: the authored transition is still there — read back from the draft, not from memory.
    await openStage(page, "lead");
    await openOperatingPlan(page);
    const editorAfter = page.getByTestId("stage-outgoing-transitions-editor");
    await expect(editorAfter).toBeVisible({ timeout: 20_000 });
    await expect
        .poll(async () => editorAfter.locator("[data-transition-ref]").count(), { timeout: 20_000 })
        .toBe(before + 1);
    const labels = await editorAfter.locator("[data-transition-ref] input").evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLInputElement).value),
    );
    record(`G3 reload labels: ${labels.filter(Boolean).join(" | ")}`);
    expect(labels).toContain("Lead → Placement / Decision");
    record("G3 reload: authored transition survived");
    await shot(page, "G3-reload-survives");
});

test("G4 the transition selector offers only this stage's outgoing transitions", async () => {
    await openStage(page, "lead");
    await openOperatingPlan(page);

    const leadRefs = draftLeadTransitions().split(",").filter(Boolean);
    record(`G4 lead declares: ${leadRefs.join(", ")}`);

    const selector = page.locator('[data-testid^="stage-outcome-transition-"]').first();
    if (await selector.count()) {
        const offered = await selector.locator("option").allTextContents();
        record(`G4 selector offers: ${offered.filter(Boolean).join(" | ")}`);
        // Never a transition that leaves another stage — that is how an outcome ends up naming one
        // that can never fire from where it lives.
        expect(offered.join(" ")).not.toContain("Tour →");
        expect(offered.join(" ")).not.toContain("Placement / Decision →");
    } else {
        record("G4 no outcome behaviour panel open on this stage — selector not rendered");
    }
    await shot(page, "G4-transition-selector");
});

test("G5 a valid graph publishes: one revision, one publication act, runtime updates", async () => {
    const projectionBefore = projection();
    const validation = await validateViaApi(page);
    record(`G5 validate can_publish=${validation.body.can_publish} errors=${validation.body.errors.length}`);
    expect(validation.body.errors).toEqual([]);

    await openStage(page, "lead");
    const published = await publish(page);
    record(`G5 publish http=${published.status} revision=${published.body.published?.revision_number}`);
    expect(published.status).toBe(200);
    expect(published.body.published.revision_number).toBe(2);

    expect(revisionCount()).toBe(2);
    expect(publicationCount()).toBe(2);
    expect(projection()).not.toBe(projectionBefore);
    expect(projection()).toContain("Lead → Placement / Decision");
    await expect(page.getByTestId("bp-publication-bar")).toHaveAttribute("data-status", "published", {
        timeout: 20_000,
    });
    record(`G5 revisions=${revisionCount()} publications=${publicationCount()}`);
    await shot(page, "G5-published");
});

// ── negative integrity, through the real publish gate ────────────────────────

const NEGATIVES: Array<{ name: string; code: string; patch: string }> = [
    {
        name: "missing destination stage",
        code: "transition_destination_unknown",
        patch: `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outgoing_transitions,0,target_stage_key}', '"ghost_stage"')`,
    },
    {
        name: "transition declared on the wrong source stage",
        code: "transition_not_outgoing_from_source",
        patch: `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outgoing_transitions,0,source_stage_key}', '"tour"')`,
    },
    {
        name: "self-loop",
        code: "transition_self_loop",
        patch: `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outgoing_transitions,0,target_stage_key}', '"lead"')`,
    },
    {
        name: "duplicate transition identity",
        code: "duplicate_transition_identity",
        patch: `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outgoing_transitions,-1}',
                (payload->'processes'->0->'stages'->0->'stage_operating_plan_v1'->'outgoing_transitions'->0), true)`,
    },
    {
        name: "outcome references a transition that does not exist",
        code: "movement_transition_not_found",
        patch: `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outcome_rules,0,targets,0,transition_ref}', '"never_configured"')`,
    },
    {
        name: "outcome references another stage's transition",
        code: "movement_transition_from_another_stage",
        patch: `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outcome_rules,0,targets,0,transition_ref}', '"tour_to_decision"')`,
    },
];

for (const negative of NEGATIVES) {
    test(`G6 blocked publish — ${negative.name}`, async () => {
        // Start from what is published, so only this defect is present.
        sqlExec(`
            UPDATE business_process_drafts
            SET payload = (select payload from business_process_revisions
                           where department_id='${DEPT}' order by revision_number desc limit 1),
                draft_revision = draft_revision + 1
            WHERE department_id='${DEPT}'`);
        patchDraft(negative.patch);

        const revisionsBefore = revisionCount();
        const projectionBefore = projection();

        const validation = await validateViaApi(page);
        const codes = validation.body.errors.map((e) => e.code);
        record(`G6 ${negative.name}: codes=${codes.join(",")}`);
        expect(codes).toContain(negative.code);
        expect(validation.body.can_publish).toBe(false);

        // And the publish endpoint itself refuses, creating nothing.
        const res = await page.request.post("/api/admin/business-process/configuration/publish", {
            data: { department_id: DEPT },
        });
        const body = (await res.json()) as { errors?: { message: string }[] };
        record(`G6 ${negative.name}: publish http=${res.status()} first="${body.errors?.[0]?.message?.slice(0, 120)}"`);
        expect(res.status()).toBe(422);
        expect(revisionCount()).toBe(revisionsBefore);
        expect(projection()).toBe(projectionBefore);
    });
}

test("G7 a legacy bare stage_key move warns, and is never preferred over a transition_ref", async () => {
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = (select payload from business_process_revisions
                       where department_id='${DEPT}' order by revision_number desc limit 1),
            draft_revision = draft_revision + 1
        WHERE department_id='${DEPT}'`);
    patchDraft(
        `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outcome_rules,0,targets,0}',
         '{"kind":"move_to_stage","stage_key":"tour"}'::jsonb)`,
    );

    const validation = await validateViaApi(page);
    record(`G7 errors=${validation.body.errors.map((e) => e.code).join(",")} can_publish=${validation.body.can_publish}`);
    // A bare stage_key to a REAL stage is legal-but-unchecked: a warning, not a blocker. Blocking
    // it would freeze legacy tenants out of publishing anything at all.
    expect(validation.body.errors).toEqual([]);
    expect(validation.body.can_publish).toBe(true);
});

test("G8 the certified path never used the projection-writing lifecycle-builder PATCH", async () => {
    // The known asymmetry: that route's GET reads the draft while its PATCH still writes
    // `departments.metadata` directly. Certifying a flow that used it would certify a bypass.
    record(`G8 lifecycle-builder PATCHes observed: ${builderPatches.length}`);
    expect(builderPatches).toEqual([]);
});

/* ── D3 drafting half + positive execution ─────────────────────────────────────────────────── */

/** The rules a stage's outcome resolves through, straight out of the PUBLISHED projection. */
const publishedLeadMovement = () =>
    sql(`select coalesce(string_agg(t->>'transition_ref', ','), '') from departments d,
         jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes'->0->'stages') s,
         jsonb_array_elements(coalesce(s->'stage_operating_plan_v1'->'outcome_rules','[]'::jsonb)) r,
         jsonb_array_elements(coalesce(r->'targets','[]'::jsonb)) t
         where d.id='${DEPT}' and s->>'key'='lead' and t->>'kind'='move_to_stage'`);

test("G9 a stage carrying a PRE-EXISTING defect can still be saved — the D3 drafting half", async () => {
    // Before this slice the editor threw while assembling the request, so the POST never happened
    // and the operator saw a dead button. An inherited defect must not freeze editing; it must be
    // reported and carried.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = (select payload from business_process_revisions
                       where department_id='${DEPT}' order by revision_number desc limit 1),
            draft_revision = draft_revision + 1
        WHERE department_id='${DEPT}'`);
    // Plant a defect the operator did NOT introduce: an outcome pointing at a transition that
    // this stage does not declare.
    patchDraft(
        `jsonb_set(payload, '{processes,0,stages,0,stage_operating_plan_v1,outcome_rules,0,targets,0}',
         '{"kind":"move_to_stage","transition_ref":"lead_to_nowhere"}'::jsonb)`,
    );

    const revisionBefore = draftRevision();
    await openStage(page, "lead");
    await openOperatingPlan(page);

    // Edit something unrelated to the planted defect.
    const purpose = page.getByTestId("stage-operating-plan-purpose");
    await expect(purpose).toBeVisible({ timeout: 20_000 });
    await purpose.fill(`Reach the family and determine next steps. (D3 ${revisionBefore})`);

    const saved = await saveStage(page);
    record(`G9 save http=${saved.status} — the request was actually sent`);
    // The whole point: a request happened at all.
    expect(saved.status).toBe(200);
    expect(draftRevision()).toBeGreaterThan(revisionBefore);

    // And the operator is told what the graph still owes, rather than a bare "Saved".
    const notice = page.getByTestId("stage-editor-v2-remaining-issues");
    if (await notice.count()) {
        const text = (await notice.first().innerText()).replace(/\s+/g, " ");
        record(`G9 operator notice: "${text}"`);
        expect(text).toMatch(/must be repaired before publication/);
    } else {
        record("G9 no remaining-issues notice rendered");
    }
    await shot(page, "G9-saved-with-preexisting-defect");

    // Drafting forgave it; publication must not.
    const validation = await validateViaApi(page);
    record(`G9 publish gate still refuses: can_publish=${validation.body.can_publish}`);
    expect(validation.body.can_publish).toBe(false);
});

test("G10 a family actually moves Lead → Tour through the published transition", async () => {
    // Restore a valid graph and publish it, so execution runs against real published config.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = (select payload from business_process_revisions
                       where department_id='${DEPT}' order by revision_number desc limit 1),
            draft_revision = draft_revision + 1
        WHERE department_id='${DEPT}'`);

    const validation = await validateViaApi(page);
    record(`G10 draft is publishable: can_publish=${validation.body.can_publish} errors=${validation.body.errors.length}`);
    expect(validation.body.can_publish).toBe(true);

    // G5 already published this graph. Re-publishing an identical draft is a no-op the UI
    // correctly refuses, so execution runs against the projection that publish produced.
    // The runtime resolves movement from the PROJECTION, so that is what must name the transition.
    const movement = publishedLeadMovement();
    record(`G10 published Lead movement targets: ${movement}`);
    expect(movement).toContain("lead_to_tour");

    // A real family sitting in Lead, with the stage work an operator would actually complete.
    const [opp, work] = (
        sql(`select o.id::text || '|' || t.id::text from opportunities o
             join operational_tasks t on t.entity_id = o.id
             where o.stage_key='lead' and t.status='open' order by o.created_at limit 1`) || "|"
    ).split("|");
    record(`G10 subject opportunity=${opp || "(none)"} work=${work || "(none)"}`);
    expect(opp).not.toBe("");
    expect(work).not.toBe("");

    const stageBefore = sql(`select stage_key from opportunities where id='${opp}'`);
    const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
        data: {
            department_id: DEPT,
            stage_key: "lead",
            work_id: work,
            outcome_key: "reached_family",
            subject: { opportunity_id: opp },
        },
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    record(`G10 execute http=${res.status()} ok=${body.ok} message=${body.message ?? ""}`);

    const stageAfter = sql(`select stage_key from opportunities where id='${opp}'`);
    record(`G10 opportunity stage ${stageBefore} -> ${stageAfter}`);
    await shot(page, "G10-positive-execution");
    expect(stageAfter).toBe("tour");
});

/** The configuration ledger as G11 found it, so G11b can prove execution did not move it. */
let g11LedgerBefore = { revisions: -1, publications: -1 };

/** Every piece of durable state this execution could possibly touch, as one comparable string. */
function durableState(oppId: string, workId: string): string {
    return sql(`
        select
          coalesce((select stage_key || '/' || coalesce(status_key,'-') || '/' || coalesce(close_reason_key,'-')
                    from opportunities where id='${oppId}'), 'missing')
          || ' work=' || coalesce((select status || '/' || coalesce(metadata->>'outcome_key','-')
                    || '/' || updated_at::text
                    from operational_tasks where id='${workId}'), 'missing')
          || ' activity=' || (select count(*) from activity_log where entity_id='${oppId}')
          || ' members=' || coalesce((select string_agg(coalesce(outcome_status_key,'-') || ':' || coalesce(stage_key,'-'), ',' order by id)
                    from opportunity_customer_members where opportunity_id='${oppId}'), '-')`);
}

test("G11 an unresolvable outcome refuses BEFORE the first durable write — no torn state", async () => {
    // Law 6, the negative case. Plan-then-mutate: if any reference cannot resolve, NOTHING is
    // written. The Firefly failure was the exact opposite — the status write landed, the stage
    // move then found no transition, and durable state contradicted itself while the runtime
    // reported no change.
    //
    // Install the invalid graph on LEAD, the stage where that failure actually happened.
    //
    // This shape cannot be produced through the product any more: authoring refuses it (G2) and
    // the publish gate refuses it (G6). So the only route to it is a direct projection write
    // through the guard's own capability token — a deliberate, named simulation of drift that
    // predates the guard. The guard staying on for every other path is the whole point.
    sqlExec(`
        BEGIN;
        SELECT set_config('alloy.lifecycle_write', 'on', true);
        UPDATE departments SET metadata = jsonb_set(metadata,
          '{lifecycle_builder_v1,processes,0,stages,0,stage_operating_plan_v1,outcome_rules,0,targets,0}',
          '{"kind":"move_to_stage","transition_ref":"lead_to_nowhere"}'::jsonb)
        WHERE id='${DEPT}';
        COMMIT;`);
    const projectedRule = sql(`select jsonb_extract_path_text(metadata,
        'lifecycle_builder_v1','processes','0','stages','0','stage_operating_plan_v1','outcome_rules','0','targets','0','transition_ref')
        from departments where id='${DEPT}'`);
    record(`G11 published Lead rule now points at: ${projectedRule}`);
    expect(projectedRule).toBe("lead_to_nowhere");

    // A real family still sitting in Lead, with the open stage work an operator would complete.
    const [opp, work] = (
        sql(`select o.id::text || '|' || t.id::text from opportunities o
             join operational_tasks t on t.entity_id = o.id
             where o.stage_key='lead' and t.status='open' order by o.created_at limit 1`) || "|"
    ).split("|");
    record(`G11 subject opportunity=${opp || "(none)"} work=${work || "(none)"}`);
    expect(opp).not.toBe("");
    expect(work).not.toBe("");

    const before = durableState(opp, work);
    g11LedgerBefore = { revisions: revisionCount(), publications: publicationCount() };
    record(`G11 BEFORE ${before} ledger=${g11LedgerBefore.revisions}/${g11LedgerBefore.publications}`);

    const res = await page.request.post("/api/admin/lifecycle-builder/complete-stage-work", {
        data: {
            department_id: DEPT,
            stage_key: "lead",
            work_id: work,
            outcome_key: "reached_family",
            subject: { opportunity_id: opp },
        },
    });
    const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        changed?: boolean;
        integrity_breach?: unknown;
        transaction?: { outcome?: string };
    };
    record(
        `G11 execute http=${res.status()} ok=${body.ok} changed=${body.changed} `
        + `transaction=${body.transaction?.outcome ?? "-"} error="${(body.error ?? "").slice(0, 160)}"`,
    );

    const after = durableState(opp, work);
    record(`G11 AFTER  ${after}`);
    await shot(page, "G11-refused-before-write");

    // 1. It refused.
    expect(body.ok).not.toBe(true);
    expect(res.status()).toBeGreaterThanOrEqual(400);

    // 2. Nothing durable moved — stage, canonical status, close reason, work state, activity
    //    trace and per-child rows are all byte-identical.
    expect(after).toBe(before);

    // 3. No misleading completion event: the work is still open, with no completion stamp.
    expect(after).toContain("work=open/-");

    // 4. The refusal names the unresolved reference, in the operator's terms rather than a stack
    //    trace, so the repair is obvious.
    expect(body.error ?? "").toMatch(/cannot run/i);
    expect(body.error ?? "").toContain("lead_to_nowhere");

    // 5. And it does not claim a partial commit it did not make. `changed:false` is only honest
    //    here BECAUSE nothing was written — assertion 2 is what earns it.
    expect(body.changed).not.toBe(true);
    expect(body.integrity_breach).toBeFalsy();
});

test("G11b the refusal disturbed no configuration revision or publication", async () => {
    // A refusal that wrote and then reverted leaves the same RECORD state as one that never wrote.
    // The configuration ledger is a second, independent witness: execution must not mint a
    // revision or a publication, and the simulated drift above was not a publication act either.
    record(`G11b after refusal: revisions=${revisionCount()} publications=${publicationCount()}`);
    expect(revisionCount()).toBe(g11LedgerBefore.revisions);
    expect(publicationCount()).toBe(g11LedgerBefore.publications);
});
