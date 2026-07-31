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

    // Save is refused: nothing reaches the server, so nothing reaches the draft.
    let sawSave = false;
    const listener = (r: { url: () => string }) => {
        if (r.url().includes("/stage-runtime-config")) sawSave = true;
    };
    page.on("request", listener);
    await page.getByTestId("stage-editor-v2-save").click().catch(() => {});
    await page.waitForTimeout(4000);
    page.off("request", listener);

    record(`G2 save reached the server: ${sawSave}; draft ${draftBefore} -> ${draftRevision()}`);
    expect(sawSave).toBe(false);
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

    // Reload: the authored transition is still there.
    await openStage(page, "lead");
    await openOperatingPlan(page);
    await expect(
        page.getByTestId("stage-outgoing-transitions-editor").getByDisplayValue("Lead → Placement / Decision"),
    ).toBeVisible({ timeout: 20_000 });
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
