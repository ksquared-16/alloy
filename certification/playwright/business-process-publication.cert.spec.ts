/**
 * Stage Configuration draft/publish — browser certification (Law 4, editor slice 3).
 *
 * Proves the operator flow end to end against the isolated cert tenant with the lifecycle
 * projection guard at its default `enforce` posture:
 *
 *   load draft -> edit -> save draft -> reload -> validate -> publish -> runtime updates
 *
 * Every UI claim is paired with a DATABASE claim, because the whole point of this sprint is that
 * the screen used to say things the database did not support. `sql()` reads the cert Postgres
 * directly so "runtime did not change" is a fact about `departments.metadata`, not an inference
 * from what the page rendered.
 *
 * Serial by design: the scenarios are one operator session, in order.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "bp-publication");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";
const EMAIL = process.env.CERT_OPERATOR_EMAIL || "qa.operator@northwind.invalid";
const PASSWORD = process.env.CERT_OPERATOR_PASSWORD || "alloy-local-cert";

const PROCESSES_URL = "/adminV2/settings/organization/processes";

/** Collapse to a single line — a newline inside `psql -c` breaks the shell quoting. */
const oneLine = (q: string) => q.replace(/\s+/g, " ").trim();

function sql(query: string): string {
    return execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(oneLine(query))}`, {
        encoding: "utf8",
    }).trim();
}

function sqlExec(statement: string): void {
    execSync(
        `psql ${JSON.stringify(DB)} -v ON_ERROR_STOP=1 -q -c ${JSON.stringify(oneLine(statement))}`,
        { encoding: "utf8" },
    );
}

/** The runtime projection — what the app actually serves. */
const projection = () =>
    sql(`select coalesce(metadata->'lifecycle_builder_v1','null')::text from departments where id='${DEPT}'`);
const projectionChecksum = () =>
    sql(`select md5(coalesce(metadata->>'lifecycle_builder_v1','')) from departments where id='${DEPT}'`);
const draftRow = () =>
    JSON.parse(
        sql(
            `select json_build_object('revision',draft_revision,'base',base_revision_id,'status',draft_status)::text
             from business_process_drafts where department_id='${DEPT}'`,
        ) || "null",
    ) as { revision: number; base: string | null; status: string } | null;
const revisionCount = () =>
    Number(sql(`select count(*) from business_process_revisions where department_id='${DEPT}'`));
const publicationCount = () =>
    Number(
        sql(
            `select count(*) from configuration_publications where subject_id='${DEPT}' and domain_key='business_process'`,
        ),
    );

const evidence: string[] = [];
function record(line: string) {
    evidence.push(line);
    console.log(`[cert] ${line}`);
}

async function login(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 60_000 });
}

/** Navigate to the Stages tab with `stageKey` selected and the publication bar rendered. */
async function openStage(page: Page, stageKey = "lead") {
    await page.goto(PROCESSES_URL);
    await page.waitForLoadState("domcontentloaded");
    // The BOS assistant panel overlays the editor; close it so the bar is visible and clickable.
    const close = page.getByRole("button", { name: "Close", exact: true });
    if (await close.count()) await close.first().click().catch(() => {});
    await page.getByTestId("business-process-tab-stages").click();
    await page.getByTestId(`lifecycle-stage-tab-${stageKey}`).click();
    await expect(page.getByTestId("bp-publication-bar")).toBeVisible({ timeout: 30_000 });
    return page.getByTestId("bp-publication-bar");
}

async function barState(page: Page) {
    const bar = page.getByTestId("bp-publication-bar");
    return {
        status: await bar.getAttribute("data-status"),
        draftRevision: Number(await bar.getAttribute("data-draft-revision")),
        publishedRevision: await bar.getAttribute("data-published-revision"),
        message: (await page.getByTestId("bp-publication-message").innerText()).trim(),
        chip: (await page.getByTestId("bp-publication-status").innerText()).trim(),
    };
}

/**
 * Wait until the bar carries the draft revision the database actually holds.
 *
 * After a save the bar re-reads the publication state asynchronously. Clicking Publish before that
 * lands sends a stale draft token and the server correctly answers 409 — safe, but not what these
 * scenarios are trying to prove.
 */
async function waitForBarInSync(page: Page) {
    const expected = draftRow()!.revision;
    await expect(page.getByTestId("bp-publication-bar")).toHaveAttribute(
        "data-draft-revision",
        String(expected),
        { timeout: 20_000 },
    );
}

async function shot(page: Page, name: string) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

/** Expand the Stage Identity accordion and edit the stage purpose. */
async function editPurpose(page: Page, value: string) {
    const purpose = page.getByTestId("stage-editor-v2-purpose");
    if (!(await purpose.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: /Stage Identity/ }).first().click();
        await expect(purpose).toBeVisible({ timeout: 10_000 });
    }
    await purpose.fill(value);
    await purpose.blur();
}

async function saveStage(page: Page) {
    const [response] = await Promise.all([
        page.waitForResponse(
            (r) => r.url().includes("/api/admin/enrollment-process/stage-runtime-config"),
            { timeout: 45_000 },
        ),
        page.getByTestId("stage-editor-v2-save").click(),
    ]);
    const body = await response.json().catch(() => ({}));
    return { status: response.status(), body };
}

test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let page: Page;

test.beforeAll(async ({ browser }) => {
    browserRef = browser;
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();
    page.on("response", (r) => {
        if (r.url().includes("/api/admin/business-process/") || r.url().includes("stage-runtime-config")) {
            record(`http ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
        }
    });
    await login(page);
});

test.afterAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE, "evidence.log"), evidence.join("\n") + "\n");
});

// ─────────────────────────────────────────────────────────────────────────────

test("S1 initial load — the editor shows the draft, and says what runtime is using", async () => {
    // A pre-publication tenant: real configuration in the projection, zero publications. This is
    // the state every existing tenant is in today.
    expect(publicationCount()).toBe(0);

    await openStage(page, "lead");
    const state = await barState(page);
    record(`S1 bar=${JSON.stringify(state)}`);

    // Not "Published" — that would contradict "never published" one line below it.
    expect(state.status).toBe("never_published");
    expect(state.chip).toContain("Not published");
    expect(state.message).toContain("never been published");
    await expect(page.getByTestId("bp-publication-published-revision")).toContainText(
        "never published",
    );

    const draft = draftRow();
    record(`S1 draft=${JSON.stringify(draft)} revisions=${revisionCount()}`);
    expect(draft).not.toBeNull();
    expect(draft!.revision).toBe(1);
    expect(state.draftRevision).toBe(draft!.revision);
    // Materialized from the projection, so no template defaults appeared.
    expect(projectionChecksum()).toBe(
        sql(`select md5(payload::text) from business_process_drafts where department_id='${DEPT}'`),
    );
    await shot(page, "S1-initial-load-not-published");
});

test("S2 save draft — draft moves, runtime does not, reload survives", async () => {
    const projectionBefore = projection();
    const revisionBefore = draftRow()!.revision;

    await editPurpose(page, "Certified purpose — slice 3");
    await expect(page.getByTestId("stage-editor-v2-unsaved")).toBeVisible();
    await shot(page, "S2a-unsaved-changes");

    const saved = await saveStage(page);
    record(`S2 save http=${saved.status} publication_required=${saved.body?.publication_required}`);
    expect(saved.status).toBe(200);
    expect(saved.body.publication_required).toBe(true);

    await expect(page.getByTestId("stage-editor-v2-saved")).toBeVisible({ timeout: 15_000 });
    await shot(page, "S2b-draft-saved");

    // The draft advanced by exactly one; the projection did not move at all.
    const draftAfter = draftRow()!;
    record(`S2 draft ${revisionBefore} -> ${draftAfter.revision}; projection changed=${projection() !== projectionBefore}`);
    expect(draftAfter.revision).toBe(revisionBefore + 1);
    expect(projection()).toBe(projectionBefore);
    expect(revisionCount()).toBe(0);

    // The guard is at `enforce` and never fired, because nothing wrote the projection.
    expect(sql(`select coalesce(nullif(current_setting('alloy.lifecycle_guard', true),''),'enforce')`)).toBe(
        "enforce",
    );

    // THE assertion slice 1 could not make.
    await openStage(page, "lead");
    await page.getByRole("button", { name: /Stage Identity/ }).first().click().catch(() => {});
    await expect(page.getByTestId("stage-editor-v2-purpose")).toHaveValue(
        "Certified purpose — slice 3",
        { timeout: 20_000 },
    );
    record("S2 reload: edited purpose survived");
    await shot(page, "S2c-reload-survives");
});

test("S2b a PRE-EXISTING graph defect blocks publication without blocking the save (D3)", async () => {
    // FINDING, discovered by this certification run: the canonical representative seed
    // (supabase/seed/local_representative_seed.sql) ships two dangling stage references —
    // three transitions target `closed_lost` where the stage is `closed`, and the waitlist stage's
    // `offer_to_enrolling` rule moves to `enrollment` where the stage is `enrolling`.
    // The gate is right and the seed is wrong. Certifying against it is better than certifying
    // against a synthetic graph, because it is exactly the shape a real legacy tenant has.
    const state = await barState(page);
    record(`S2b bar=${JSON.stringify(state)}`);
    expect(state.status).toBe("publication_blocked");

    const blockers = await page.getByTestId("bp-publication-errors").innerText();
    record(`S2b blockers: ${blockers.replace(/\s+/g, " ").slice(0, 400)}`);
    expect(blockers).toContain("closed_lost");
    expect(blockers).toMatch(/not configured/i);
    await expect(page.getByTestId("bp-publication-publish")).toBeDisabled();
    await shot(page, "S2d-publication-blocked-pre-existing");

    // The point of decision D3: the defect is pre-existing, so it must NOT have prevented the save.
    expect(draftRow()!.revision).toBeGreaterThan(1);
    expect(
        sql(`select payload->'processes'->0->'stages'->0->>'purpose' from business_process_drafts where department_id='${DEPT}'`),
    ).toBe("Certified purpose — slice 3");
    record("S2b pre-existing defect blocked publish but the save stood");
});

test("S2c repairing the dangling references clears the blocker", async () => {
    // The repair an operator would make in the transitions editor. Done here in SQL because that
    // editor family has not been migrated yet — what is under certification is the GATE and the
    // publish flow, not the transition UI.
    // jsonb renders as `"key": "value"` with a space, so a naive text replace on the second defect
    // silently misses. Repair both by value, not by formatting.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = replace(
                replace(payload::text, '"closed_lost"', '"closed"'),
                '"stage_key": "enrollment"', '"stage_key": "enrolling"'
            )::jsonb,
            draft_revision = draft_revision + 1
        WHERE department_id = '${DEPT}'`);

    await openStage(page, "lead");
    const state = await barState(page);
    record(`S2c after repair bar=${JSON.stringify(state)}`);
    expect(state.status).toBe("unpublished_changes");
    expect(state.message).toContain("Runtime will continue using the currently published");
    await expect(page.getByTestId("bp-publication-publish")).toBeEnabled();
    await shot(page, "S2e-unpublished-changes");
});

test("S3 runtime remains on the published configuration before publish", async () => {
    // A second, independent browser context — a different operator's view of runtime.
    const runtimeContext = await browserRef.newContext({ viewport: { width: 1400, height: 900 } });
    const runtimePage = await runtimeContext.newPage();
    await login(runtimePage);
    await runtimePage.goto("/workspace");
    await runtimePage.waitForLoadState("domcontentloaded");
    await shot(runtimePage, "S3-runtime-before-publish");

    // The decisive claim is about the projection, not about pixels: the draft edit is simply not
    // in what runtime reads.
    const live = projection();
    record(`S3 projection contains draft edit = ${live.includes("Certified purpose — slice 3")}`);
    expect(live).not.toContain("Certified purpose — slice 3");
    expect(revisionCount()).toBe(0);
    await runtimeContext.close();
});

test("S4 validate — issues are reported with object-level paths, in operator language", async () => {
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/configuration/validate"), { timeout: 30_000 }),
        page.getByTestId("bp-publication-validate").click(),
    ]);
    const body = await response.json();
    record(`S4 validate can_publish=${body.can_publish} errors=${body.errors.length} warnings=${body.warnings.length}`);
    expect(response.status()).toBe(200);
    expect(body.can_publish).toBe(true);
    await expect(page.getByTestId("bp-publication-notice")).toContainText("ready to publish");
    await shot(page, "S4-validated");
});

test("S5 publish — one revision, one publication act, runtime updates", async () => {
    const projectionBefore = projection();
    expect(revisionCount()).toBe(0);

    await waitForBarInSync(page);
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/configuration/publish"), { timeout: 45_000 }),
        page.getByTestId("bp-publication-publish").click(),
    ]);
    const body = await response.json();
    record(`S5 publish http=${response.status()} revision=${body.published?.revision_number}`);
    expect(response.status()).toBe(200);
    expect(body.published.revision_number).toBe(1);

    await expect(page.getByTestId("bp-publication-bar")).toHaveAttribute("data-status", "published", {
        timeout: 20_000,
    });
    await expect(page.getByTestId("bp-publication-notice")).toContainText("Runtime is now using it");
    await shot(page, "S5a-published");

    // Exactly one of each, and runtime moved.
    record(`S5 revisions=${revisionCount()} publications=${publicationCount()}`);
    expect(revisionCount()).toBe(1);
    expect(publicationCount()).toBe(1);
    expect(projection()).not.toBe(projectionBefore);
    expect(projection()).toContain("Certified purpose — slice 3");

    // The draft was rebased onto the revision it produced — retained, not closed.
    const draft = draftRow()!;
    record(`S5 draft rebased base=${draft.base ? "set" : "null"}`);
    expect(draft.base).not.toBeNull();
    expect(
        sql(`select id from business_process_revisions where department_id='${DEPT}' order by revision_number desc limit 1`),
    ).toBe(draft.base);

    // Reload is stable and now reads Published.
    await openStage(page, "lead");
    expect((await barState(page)).status).toBe("published");
    await expect(page.getByTestId("bp-publication-published-revision")).toContainText("revision 1");
    await shot(page, "S5b-published-after-reload");
});

test("S6 runtime surface reflects the newly published configuration", async () => {
    const runtimeContext = await browserRef.newContext({ viewport: { width: 1400, height: 900 } });
    const runtimePage = await runtimeContext.newPage();
    await login(runtimePage);
    await runtimePage.goto("/workspace");
    await runtimePage.waitForLoadState("domcontentloaded");
    await shot(runtimePage, "S6-runtime-after-publish");
    expect(projection()).toContain("Certified purpose — slice 3");
    record("S6 runtime projection now serves the published revision");
    await runtimeContext.close();
});

test("S7 blocked publish — a dangling transition reference stops publication and changes nothing", async () => {
    // Author the exact defect that started this sprint, directly in the draft: the Tour stage's
    // `tour_scheduled` outcome moves via `lead_to_tour`, a transition Tour does not declare.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = jsonb_set(
                payload,
                '{processes,0,stages,1,stage_operating_plan_v1,outcome_rules,5}',
                '{"rule_key":"tour_scheduled_to_tour","when_outcome_key":"tour_scheduled","targets":[{"kind":"move_to_stage","transition_ref":"lead_to_tour"}]}'::jsonb,
                true
            ),
            draft_revision = draft_revision + 1
        WHERE department_id = '${DEPT}'`);

    const revisionsBefore = revisionCount();
    const projectionBefore = projection();

    await openStage(page, "tour");
    const state = await barState(page);
    record(`S7 bar=${JSON.stringify(state)}`);
    expect(state.status).toBe("publication_blocked");
    await expect(page.getByTestId("bp-publication-errors")).toBeVisible();

    const errorText = await page.getByTestId("bp-publication-errors").innerText();
    record(`S7 operator message: ${errorText.replace(/\s+/g, " ").slice(0, 220)}`);
    // Operator language naming both ends of the broken reference — not a raw key dump.
    expect(errorText).toContain("tour");
    expect(errorText).toContain("lead_to_tour");
    expect(errorText).toMatch(/does not exist|not configured/i);
    await shot(page, "S7-publication-blocked");

    // The draft is still saved — a pre-existing defect must not freeze editing (decision D3).
    expect(draftRow()!.revision).toBeGreaterThan(1);
    // Publish is refused before it starts.
    await expect(page.getByTestId("bp-publication-publish")).toBeDisabled();
    record(`S7 revisions ${revisionsBefore} -> ${revisionCount()}; projection unchanged=${projection() === projectionBefore}`);
    expect(revisionCount()).toBe(revisionsBefore);
    expect(projection()).toBe(projectionBefore);

    // Clean up so the remaining scenarios start from a publishable draft.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = payload #- '{processes,0,stages,1,stage_operating_plan_v1,outcome_rules,5}',
            draft_revision = draft_revision + 1
        WHERE department_id = '${DEPT}'`);
});

test("S8 draft-edit conflict — a stale editor cannot overwrite a colleague", async () => {
    // Editor B loads first, then Editor A saves underneath it.
    const contextB = await browserRef.newContext({ viewport: { width: 1400, height: 900 } });
    const pageB = await contextB.newPage();
    await login(pageB);
    await openStage(pageB, "lead");
    const loadedRevision = (await barState(pageB)).draftRevision;

    await openStage(page, "lead");
    await editPurpose(page, "Editor A wins");
    const savedA = await saveStage(page);
    expect(savedA.status).toBe(200);
    const afterA = draftRow()!.revision;
    record(`S8 A saved: draft ${loadedRevision} -> ${afterA}`);
    expect(afterA).toBeGreaterThan(loadedRevision);

    await editPurpose(pageB, "Editor B should be refused");
    const savedB = await saveStage(pageB);
    record(`S8 B http=${savedB.status} code=${savedB.body?.code}`);
    expect(savedB.status).toBe(409);
    expect(savedB.body.code).toBe("business_process_draft_edit_conflict");
    expect(savedB.body.error).toMatch(/Reload/i);
    expect(savedB.body.conflict.kind).toBe("draft_edit");
    await shot(pageB, "S8-draft-edit-conflict");

    // A's work is intact and B wrote nothing.
    expect(draftRow()!.revision).toBe(afterA);
    expect(
        sql(`select payload->'processes'->0->'stages'->0->>'purpose' from business_process_drafts where department_id='${DEPT}'`),
    ).toBe("Editor A wins");
    record("S8 A's edit intact; B wrote nothing");
    await contextB.close();
});

test("S9 publication conflict — a stale publish is refused and the draft survives", async () => {
    await openStage(page, "lead");
    const before = await barState(page);
    expect(before.status).toBe("unpublished_changes");

    // Someone else publishes revision 2 out from under this editor. The RPC refuses an
    // unvalidated draft (that is scenario S7's proof), so mark it validated the way the Validate
    // action would before standing in for the other operator.
    sqlExec(`
        UPDATE business_process_drafts
        SET draft_status='validated', validation_errors='[]'::jsonb, validated_at=now()
        WHERE department_id='${DEPT}'`);
    const actor = sql(`select id from auth.users limit 1`);
    sqlExec(`select publish_business_process_revision_v1(
        (select org_id from departments where id='${DEPT}'), '${DEPT}', '${actor}', 'out-of-band')`);
    record(`S9 out-of-band publish -> revisions=${revisionCount()}`);

    // Now make the draft diverge again so this editor has something to publish, and rewind its
    // base token to the revision it was actually opened against.
    const staleBase = sql(
        `select id from business_process_revisions where department_id='${DEPT}' and revision_number=1`,
    );
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = jsonb_set(payload,'{processes,0,stages,0,purpose}','"Editor A stale publish attempt"'),
            draft_revision = draft_revision + 1,
            base_revision_id = '${staleBase}'
        WHERE department_id='${DEPT}'`);

    const revisionsBefore = revisionCount();
    const projectionBefore = projection();

    await openStage(page, "lead");
    const stale = await barState(page);
    record(`S9 bar=${JSON.stringify(stale)}`);
    expect(stale.status).toBe("draft_conflict");
    await expect(page.getByTestId("bp-publication-reload")).toBeVisible();
    await expect(page.getByTestId("bp-publication-publish")).toBeDisabled();
    await expect(page.getByTestId("bp-publication-message")).toContainText("Reload");
    await shot(page, "S9-publication-conflict");

    // Nothing new was created, runtime is still N+1, and the operator's work is preserved.
    record(`S9 revisions ${revisionsBefore} -> ${revisionCount()}; projection unchanged=${projection() === projectionBefore}`);
    expect(revisionCount()).toBe(revisionsBefore);
    expect(projection()).toBe(projectionBefore);
    expect(
        sql(`select payload->'processes'->0->'stages'->0->>'purpose' from business_process_drafts where department_id='${DEPT}'`),
    ).toBe("Editor A stale publish attempt");
    record("S9 stale publish refused; draft work preserved, not silently rebased");
});

test("S10 unknown fields and row_grain_v1 survive save, reload and publication", async () => {
    // Seed the residue a newer branch would have authored.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = jsonb_set(
                jsonb_set(payload, '{forward_compat_marker_v9}', '{"authored_by":"a newer branch"}'::jsonb, true),
                '{processes,0,stages,0,row_grain_v1}', '{"grain":"child"}'::jsonb, true
            ),
            draft_revision = draft_revision + 1,
            base_revision_id = (select id from business_process_revisions where department_id='${DEPT}' order by revision_number desc limit 1)
        WHERE department_id='${DEPT}'`);

    // A save through the editor round-trips the whole payload through parse/serialize.
    await openStage(page, "lead");
    await editPurpose(page, "Purpose that survives publication");
    const saved = await saveStage(page);
    expect(saved.status).toBe(200);

    const afterSave = sql(
        `select json_build_object('marker',payload->'forward_compat_marker_v9','grain',payload->'processes'->0->'stages'->0->'row_grain_v1')::text
         from business_process_drafts where department_id='${DEPT}'`,
    );
    record(`S10 after save: ${afterSave}`);
    expect(afterSave).toContain("a newer branch");
    expect(afterSave).toContain("child");

    await expect(page.getByTestId("bp-publication-bar")).toHaveAttribute(
        "data-status",
        "unpublished_changes",
        { timeout: 20_000 },
    );
    await waitForBarInSync(page);
    const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/configuration/publish"), { timeout: 45_000 }),
        page.getByTestId("bp-publication-publish").click(),
    ]);
    expect(response.status()).toBe(200);

    const live = projection();
    record(`S10 projection keeps marker=${live.includes("a newer branch")} row_grain_v1=${live.includes('"row_grain_v1"')}`);
    expect(live).toContain("a newer branch");
    expect(live).toContain("row_grain_v1");
    expect(live).toContain("Purpose that survives publication");
    await shot(page, "S10-unknown-fields-survive-publication");
});

test("S11 template seed law — the draft is never re-seeded, and removed values stay removed", async () => {
    const draftId = sql(`select id from business_process_drafts where department_id='${DEPT}'`);

    // Remove a value that the enrollment template would happily supply, then reload twice.
    sqlExec(`
        UPDATE business_process_drafts
        SET payload = payload #- '{processes,0,stages,0,queue_membership_v1}',
            draft_revision = draft_revision + 1
        WHERE department_id='${DEPT}'`);

    await openStage(page, "lead");
    await openStage(page, "lead");

    const membership = sql(
        `select coalesce((payload->'processes'->0->'stages'->0->'queue_membership_v1')::text,'ABSENT')
         from business_process_drafts where department_id='${DEPT}'`,
    );
    record(`S11 queue_membership_v1 after two reloads: ${membership}`);
    expect(membership).toBe("ABSENT");

    // Same draft row throughout — reload never creates a second one.
    expect(sql(`select count(*) from business_process_drafts where department_id='${DEPT}'`)).toBe("1");
    expect(sql(`select id from business_process_drafts where department_id='${DEPT}'`)).toBe(draftId);
    record("S11 one draft row, never re-seeded");
    await shot(page, "S11-template-seed-law");
});
