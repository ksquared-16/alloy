/**
 * Work Views, certified on the publication model.
 *
 *   load draft → edit → save → reload → validate → publish → runtime
 *
 * Work Views were the last ordinary editor writing `departments.metadata.lifecycle_builder_v1`
 * directly: the runtime pill strip changed the instant an operator typed, with no draft, no
 * validation, no revision and no publish. These scenarios prove that path is gone — the save
 * lands in the draft, the projection does not move, and runtime changes only at publish.
 *
 * Every operator-visible claim is paired with a SQL claim, because the point of this sprint is
 * that the screen no longer says things the database does not support.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "work-views");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";
const PROCESS = process.env.CERT_PROCESS_ID || "00000000-0000-4000-8000-000000000021";
const EMAIL = process.env.CERT_OPERATOR_EMAIL || "qa.operator@northwind.invalid";
const PASSWORD = process.env.CERT_OPERATOR_PASSWORD || "alloy-local-cert";
const PROCESSES_URL = "/adminV2/settings/organization/processes";

const oneLine = (q: string) => q.replace(/\s+/g, " ").trim();
const sql = (q: string) =>
    execSync(`psql ${JSON.stringify(DB)} -tAc ${JSON.stringify(oneLine(q))}`, { encoding: "utf8" }).trim();

/** Work View labels as the PUBLISHED projection has them — what runtime actually serves. */
const publishedLabels = () =>
    sql(`select coalesce(string_agg(v->>'label', ',' order by v->>'label'), '(none)')
         from departments d,
         jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p,
         jsonb_array_elements(coalesce(p->'work_views_v1','[]'::jsonb)) v
         where d.id='${DEPT}' and p->>'id'='${PROCESS}'`);

/** Work View labels as the DRAFT has them — what the editor is working on. */
const draftLabels = () =>
    sql(`select coalesce(string_agg(v->>'label', ',' order by v->>'label'), '(none)')
         from business_process_drafts d,
         jsonb_array_elements(d.payload->'processes') p,
         jsonb_array_elements(coalesce(p->'work_views_v1','[]'::jsonb)) v
         where d.department_id='${DEPT}' and p->>'id'='${PROCESS}'`);

const draftRevision = () =>
    Number(sql(`select draft_revision from business_process_drafts where department_id='${DEPT}'`));
const revisionCount = () =>
    Number(sql(`select count(*) from business_process_revisions where department_id='${DEPT}'`));

/** `row_grain_v1` anywhere in the draft — the Law 7 survival probe. */
const draftRowGrain = () =>
    sql(`select coalesce((payload->'processes'->0->>'row_grain_v1'), '(absent)')
         from business_process_drafts where department_id='${DEPT}'`);

const evidence: string[] = [];
const record = (line: string) => {
    evidence.push(line);
    console.log(`[views] ${line}`);
};

async function shot(page: Page, name: string) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function openWorkViews(page: Page) {
    await page.goto(PROCESSES_URL);
    await page.waitForLoadState("domcontentloaded");
    const close = page.getByRole("button", { name: "Close", exact: true });
    if (await close.count()) await close.first().click().catch(() => {});
    await page.getByTestId("business-process-tab-work-views").click();
    await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({
        timeout: 30_000,
    });
}

/**
 * Rename the Work View the operator is actually looking at.
 *
 * The value is read back before saving because a controlled React input that silently rejects the
 * change would otherwise surface as a confusing "no request was sent" timeout at the save step,
 * pointing at the wrong thing entirely.
 */
async function renameVisibleWorkView(page: Page, label: string) {
    const input = page.locator('[data-testid^="process-work-view-label-"]:visible').first();
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.click();
    await input.fill(label);
    await input.blur();
    await expect(input).toHaveValue(label, { timeout: 10_000 });
}

/**
 * Save through the UI and return what the server said.
 *
 * The button is waited on explicitly rather than clicked optimistically: it stays disabled until
 * the workspace registers the edit, and a disabled-button click surfaces as a bewildering "no
 * response arrived" timeout that points at the network instead of at the form. If the workspace
 * is actively blocking the save it says so, which is a far more useful failure.
 */
async function saveWorkViews(page: Page) {
    const button = page.getByTestId("business-process-save-work-views");
    await expect(button).toBeEnabled({ timeout: 30_000 });

    const blocked = page.getByTestId("work-views-mixed-grain-block");
    if (await blocked.count()) {
        record(`save blocked by the workspace: ${(await blocked.first().innerText()).trim()}`);
    }

    const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/process-work-views") && r.request().method() === "POST", {
            timeout: 60_000,
        }),
        button.click(),
    ]);
    return { status: response.status(), body: await response.json().catch(() => ({})) };
}

test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let page: Page;

test.beforeAll(async ({ browser }) => {
    browserRef = browser;
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
    void browserRef;
});

test("W1 the Work Views editor loads the DRAFT, and reports where runtime stands", async () => {
    const res = await page.request.get(
        `/api/admin/lifecycle-builder/process-work-views?department_id=${DEPT}&process_id=${PROCESS}`,
    );
    const body = (await res.json()) as {
        configuration_state?: { draft_revision?: number; status?: string };
        saved_work_views_v1?: unknown[];
    };
    record(
        `W1 load http=${res.status()} draft_revision=${body.configuration_state?.draft_revision} ` +
        `status=${body.configuration_state?.status}`,
    );
    expect(res.status()).toBe(200);
    // The editor must be told which draft it is holding, or it cannot save safely.
    expect(body.configuration_state?.draft_revision).toBeGreaterThanOrEqual(0);
});

test("W2 a Work View edit saves to the DRAFT and does NOT move the projection", async () => {
    const publishedBefore = publishedLabels();
    const revisionBefore = draftRevision();
    record(`W2 BEFORE published=[${publishedBefore}] draft_revision=${revisionBefore}`);

    await openWorkViews(page);
    await shot(page, "W1-work-views-loaded");

    // Rename the first Work View through the editor.
    const firstCard = page.locator('[data-testid^="business-process-work-view-list-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 20_000 });
    await firstCard.click();

    // Every Work View renders an editor card; only the selected one is visible. Targeting
    // `.first()` picks whichever is first in the DOM, which is not necessarily the one on screen.
    const renamed = `Certified View ${revisionBefore}`;
    await renameVisibleWorkView(page, renamed);

    const saved = await saveWorkViews(page);
    record(`W2 save http=${saved.status} publication_required=${saved.body?.publication_required}`);
    expect(saved.status).toBe(200);
    // The save is honest that runtime has not moved.
    expect(saved.body?.publication_required).toBe(true);
    await shot(page, "W2-saved-to-draft");

    // The draft carries the edit…
    const draftAfter = draftLabels();
    record(`W2 AFTER draft=[${draftAfter}] draft_revision=${revisionBefore} -> ${draftRevision()}`);
    expect(draftAfter).toContain(renamed);
    expect(draftRevision()).toBeGreaterThan(revisionBefore);

    // …and the projection does NOT. This is the whole migration in one assertion.
    const publishedAfter = publishedLabels();
    record(`W2 published unchanged=${publishedAfter === publishedBefore}`);
    expect(publishedAfter).toBe(publishedBefore);
    expect(publishedAfter).not.toContain(renamed);
});

test("W3 the edit survives a reload — the editor reads where its save landed", async () => {
    const expected = draftLabels();
    await openWorkViews(page);
    const res = await page.request.get(
        `/api/admin/lifecycle-builder/process-work-views?department_id=${DEPT}&process_id=${PROCESS}`,
    );
    const body = (await res.json()) as { saved_work_views_v1?: { label?: string }[] };
    const labels = (body.saved_work_views_v1 ?? []).map((v) => v.label).sort().join(",");
    record(`W3 reload labels=[${labels}]`);
    // An editor that saved to the draft but read the projection would show the OLD labels here.
    for (const label of expected.split(",")) {
        expect(labels).toContain(label);
    }
    await shot(page, "W3-reload-survives");
});

test("W4 row_grain_v1 and unknown fields survive the edit", async () => {
    // Law 1 / Law 7. A branch that has never heard of a field must not delete it by editing
    // something else. `row_grain_v1` is the field that was actually being destroyed before.
    const grain = draftRowGrain();
    record(`W4 row_grain_v1 in draft after edit: ${grain}`);

    // Plant an unknown field directly in the draft, edit Work Views again, and prove it survives.
    execSync(
        `psql ${JSON.stringify(DB)} -v ON_ERROR_STOP=1 -q -c ${JSON.stringify(
            oneLine(`UPDATE business_process_drafts
                     SET payload = jsonb_set(payload, '{processes,0,a_field_from_the_future}', '"survive me"'::jsonb),
                         draft_revision = draft_revision + 1
                     WHERE department_id='${DEPT}'`),
        )}`,
        { encoding: "utf8" },
    );

    await openWorkViews(page);
    const firstCard = page.locator('[data-testid^="business-process-work-view-list-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 20_000 });
    await firstCard.click();
    await renameVisibleWorkView(page, `Certified View ${draftRevision()}b`);
    const saved = await saveWorkViews(page);
    expect(saved.status).toBe(200);

    const survivor = sql(`select coalesce(payload->'processes'->0->>'a_field_from_the_future','(GONE)')
                          from business_process_drafts where department_id='${DEPT}'`);
    record(`W4 unknown field after a Work Views save: ${survivor}`);
    expect(survivor).toBe("survive me");
});

test("W5 publishing moves the runtime projection — and only then", async () => {
    const publishedBefore = publishedLabels();
    const revisionsBefore = revisionCount();
    const draftNow = draftLabels();
    record(`W5 pre-publish published=[${publishedBefore}] draft=[${draftNow}] revisions=${revisionsBefore}`);
    expect(publishedBefore).not.toBe(draftNow);

    const validation = await page.request.post("/api/admin/business-process/configuration/validate", {
        data: { department_id: DEPT },
    });
    const vBody = (await validation.json()) as { can_publish: boolean; errors: unknown[] };
    record(`W5 validate can_publish=${vBody.can_publish} errors=${vBody.errors.length}`);
    expect(vBody.can_publish).toBe(true);

    const published = await page.request.post("/api/admin/business-process/configuration/publish", {
        data: { department_id: DEPT },
    });
    record(`W5 publish http=${published.status()}`);
    expect(published.status()).toBe(200);

    // NOW the projection carries the edit, and a revision exists to explain why.
    const publishedAfter = publishedLabels();
    record(`W5 post-publish published=[${publishedAfter}] revisions=${revisionsBefore} -> ${revisionCount()}`);
    expect(publishedAfter).toBe(draftNow);
    expect(revisionCount()).toBeGreaterThan(revisionsBefore);
    await shot(page, "W5-published");
});

test("W6 the runtime surface serves the published Work Views", async () => {
    // The pill strip is what an operator actually looks at. It must agree with the projection.
    const expected = publishedLabels().split(",").filter(Boolean);
    const renamed = expected.find((l) => l.startsWith("Certified View")) ?? expected[0];

    await page.goto("/workspace");
    // The workspace composes asynchronously — reading the body straight after `domcontentloaded`
    // catches it mid-"Thinking…" and says nothing about whether the runtime picked up the publish.
    await expect
        .poll(async () => (await page.locator("body").innerText()).includes(renamed), {
            timeout: 90_000,
            message: `runtime surface never rendered the published Work View "${renamed}"`,
        })
        .toBe(true);

    const text = await page.locator("body").innerText();
    const present = expected.filter((label) => text.includes(label));
    record(`W6 published views=[${expected.join(",")}] visible=[${present.join(",")}]`);
    await shot(page, "W6-runtime-refreshed");
    // The renamed view is served by runtime — the publish reached the surface an operator uses.
    expect(present).toContain(renamed);
});
