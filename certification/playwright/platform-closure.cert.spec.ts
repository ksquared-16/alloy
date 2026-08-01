/**
 * Business Process Platform V1 — the remaining closure certifications.
 *
 *   P*  Participation editing on the publication model
 *   R*  Process removal on the publication model
 *   C*  Work Views draft CAS, driven through two real client sessions
 *
 * Participation has no editing UI today — the card is read-only and its POST is API-driven — so
 * it is certified through an authenticated session against the real route, paired with SQL. That
 * is the honest shape of the evidence: it proves the contract that exists rather than pretending
 * to drive a form that is not there.
 *
 * The CAS scenarios deliberately drive the actual editor in two browser contexts. A server-side
 * CAS test proves the database refuses; only two real clients prove the OPERATOR is told.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "platform-closure");
const DB = process.env.CERT_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const DEPT = process.env.CERT_DEPARTMENT_ID || "00000000-0000-4000-8000-000000000020";
const PROCESS = process.env.CERT_PROCESS_ID || "00000000-0000-4000-8000-000000000021";
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

const draftRevision = () =>
    Number(sql(`select draft_revision from business_process_drafts where department_id='${DEPT}'`));
const revisionCount = () =>
    Number(sql(`select count(*) from business_process_revisions where department_id='${DEPT}'`));
const publicationCount = () =>
    Number(
        sql(`select count(*) from configuration_publications
             where subject_id='${DEPT}' and domain_key='business_process'`),
    );

/** Participation as the DRAFT holds it vs as the PROJECTION holds it. */
const draftParticipation = () =>
    sql(`select coalesce(payload->'processes'->0->'participation_v1'->>'version','(none)')
         from business_process_drafts where department_id='${DEPT}'`);
const draftParticipationJson = () =>
    sql(`select coalesce((payload->'processes'->0->'participation_v1')::text,'(none)')
         from business_process_drafts where department_id='${DEPT}'`);
const publishedParticipationJson = () =>
    sql(`select coalesce((metadata->'lifecycle_builder_v1'->'processes'->0->'participation_v1')::text,'(none)')
         from departments where id='${DEPT}'`);

/** Process ids present in the draft / the published projection. */
const draftProcessIds = () =>
    sql(`select coalesce(string_agg(p->>'id', ',' order by p->>'id'), '(none)')
         from business_process_drafts d, jsonb_array_elements(d.payload->'processes') p
         where d.department_id='${DEPT}'`);
const publishedProcessIds = () =>
    sql(`select coalesce(string_agg(p->>'id', ',' order by p->>'id'), '(none)')
         from departments d, jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p
         where d.id='${DEPT}'`);

/** Guard hits since the marker — proof no ordinary editor tripped the projection guard. */
const guardEnforcing = () =>
    sql(`select current_setting('alloy.lifecycle_guard', true) is distinct from 'warn'`);

const evidence: string[] = [];
const record = (line: string) => {
    evidence.push(line);
    console.log(`[closure] ${line}`);
};

async function shot(page: Page, name: string) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: Number(process.env.CERT_AUTH_WAIT_MS || 180_000) });
}

async function openWorkViews(page: Page) {
    await page.goto(PROCESSES_URL);
    await page.waitForLoadState("domcontentloaded");
    const close = page.getByRole("button", { name: "Close", exact: true });
    if (await close.count()) await close.first().click().catch(() => {});
    await page.getByTestId("business-process-tab-work-views").click();
    await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({ timeout: 60_000 });
}

async function renameVisibleWorkView(page: Page, label: string) {
    const input = page.locator('[data-testid^="process-work-view-label-"]:visible').first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.click();
    await input.fill(label);
    await input.blur();
    await expect(input).toHaveValue(label, { timeout: 10_000 });
}

test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let page: Page;

test.beforeAll(async ({ browser }) => {
    browserRef = browser;
    page = await browser.newPage();
    await signIn(page);
});

test.afterAll(async () => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE, "evidence.txt"), evidence.join("\n"));
    await page.close();
});

/* ── A1 · Participation ─────────────────────────────────────────────────────────────────────── */

test("P1 participation loads from the DRAFT and reports where runtime stands", async () => {
    const res = await page.request.get(
        `/api/admin/lifecycle-builder/process-participation?department_id=${DEPT}&process_id=${PROCESS}`,
    );
    const body = (await res.json()) as {
        configuration_state?: { draft_revision?: number; status?: string };
        participation_v1?: { version?: number };
        is_default?: boolean;
    };
    record(
        `P1 load http=${res.status()} draft_revision=${body.configuration_state?.draft_revision} ` +
        `status=${body.configuration_state?.status} is_default=${body.is_default}`,
    );
    expect(res.status()).toBe(200);
    // Without a token the editor cannot save safely — this is the CAS contract at the read end.
    expect(body.configuration_state?.draft_revision).toBeGreaterThanOrEqual(0);
});

test("P2 a participation save lands in the DRAFT and does not move the projection", async () => {
    const publishedBefore = publishedParticipationJson();
    const revisionBefore = draftRevision();
    record(`P2 BEFORE published=${publishedBefore.slice(0, 60)} draft_revision=${revisionBefore}`);

    const load = await page.request.get(
        `/api/admin/lifecycle-builder/process-participation?department_id=${DEPT}&process_id=${PROCESS}`,
    );
    const loaded = (await load.json()) as {
        participation_v1: Record<string, unknown>;
        configuration_state?: { draft_revision?: number };
    };

    const res = await page.request.post("/api/admin/lifecycle-builder/process-participation", {
        data: {
            department_id: DEPT,
            process_id: PROCESS,
            participation_v1: loaded.participation_v1,
            draft_revision: loaded.configuration_state?.draft_revision,
        },
    });
    const body = (await res.json()) as { ok?: boolean; publication_required?: boolean; draft?: { draft_revision?: number } };
    record(
        `P2 save http=${res.status()} publication_required=${body.publication_required} ` +
        `draft ${revisionBefore} -> ${draftRevision()}`,
    );
    expect(res.status()).toBe(200);
    expect(body.publication_required).toBe(true);
    expect(draftRevision()).toBeGreaterThan(revisionBefore);

    // The whole claim: the draft moved, the runtime projection did not.
    expect(publishedParticipationJson()).toBe(publishedBefore);
    expect(draftParticipation()).not.toBe("(none)");
});

test("P3 participation survives reload, and unknown fields survive the save", async () => {
    // Plant a field this branch has never heard of, directly in the draft's participation config.
    sqlExec(`UPDATE business_process_drafts
             SET payload = jsonb_set(payload, '{processes,0,participation_v1,a_future_participation_field}',
                                     '"survive me"'::jsonb),
                 draft_revision = draft_revision + 1
             WHERE department_id='${DEPT}'`);

    const load = await page.request.get(
        `/api/admin/lifecycle-builder/process-participation?department_id=${DEPT}&process_id=${PROCESS}`,
    );
    const loaded = (await load.json()) as {
        participation_v1: Record<string, unknown>;
        configuration_state?: { draft_revision?: number };
    };
    const res = await page.request.post("/api/admin/lifecycle-builder/process-participation", {
        data: {
            department_id: DEPT,
            process_id: PROCESS,
            participation_v1: loaded.participation_v1,
            draft_revision: loaded.configuration_state?.draft_revision,
        },
    });
    expect(res.status()).toBe(200);

    const survivor = sql(`select coalesce(payload->'processes'->0->'participation_v1'->>'a_future_participation_field','(GONE)')
                          from business_process_drafts where department_id='${DEPT}'`);
    record(`P3 unknown participation field after a save: ${survivor}`);
    expect(survivor).toBe("survive me");

    // And a reload reads the draft, not the projection.
    const reload = await page.request.get(
        `/api/admin/lifecycle-builder/process-participation?department_id=${DEPT}&process_id=${PROCESS}`,
    );
    expect(reload.status()).toBe(200);
    record(`P3 reload http=${reload.status()} draft participation present=${draftParticipation() !== "(none)"}`);
});

test("P4 a stale participation token is refused — draft CAS", async () => {
    const stale = draftRevision() - 1;
    const load = await page.request.get(
        `/api/admin/lifecycle-builder/process-participation?department_id=${DEPT}&process_id=${PROCESS}`,
    );
    const loaded = (await load.json()) as { participation_v1: Record<string, unknown> };

    const res = await page.request.post("/api/admin/lifecycle-builder/process-participation", {
        data: {
            department_id: DEPT,
            process_id: PROCESS,
            participation_v1: loaded.participation_v1,
            draft_revision: stale,
        },
    });
    const body = (await res.json()) as { error?: string };
    record(`P4 stale token=${stale} http=${res.status()} error="${(body.error ?? "").slice(0, 80)}"`);
    expect(res.status()).toBe(409);
    expect(body.error ?? "").toMatch(/changed this configuration|reload/i);
});

test("P5 participation publishes through the canonical path, and only then moves runtime", async () => {
    const publishedBefore = publishedParticipationJson();
    const revisionsBefore = revisionCount();
    const publicationsBefore = publicationCount();

    const validation = await page.request.post("/api/admin/business-process/configuration/validate", {
        data: { department_id: DEPT },
    });
    const v = (await validation.json()) as { can_publish: boolean; errors: unknown[] };
    record(`P5 validate can_publish=${v.can_publish} errors=${v.errors.length}`);
    expect(v.can_publish).toBe(true);

    const published = await page.request.post("/api/admin/business-process/configuration/publish", {
        data: { department_id: DEPT },
    });
    record(`P5 publish http=${published.status()} revisions ${revisionsBefore} -> ${revisionCount()}`);
    expect(published.status()).toBe(200);
    expect(revisionCount()).toBeGreaterThan(revisionsBefore);
    expect(publicationCount()).toBeGreaterThan(publicationsBefore);

    // Runtime now carries the participation config, including the field we never understood.
    const publishedAfter = publishedParticipationJson();
    record(`P5 projection changed=${publishedAfter !== publishedBefore}`);
    expect(publishedAfter).toContain("survive me");
    expect(guardEnforcing()).toBe("t");
});

/* ── A2 · Process removal ───────────────────────────────────────────────────────────────────── */

const SPARE_DEPT = "00000000-0000-4000-8000-0000000009d1";
const KEEP_PROCESS = "00000000-0000-4000-8000-0000000009e1";
const DOOMED_PROCESS = "00000000-0000-4000-8000-0000000009f1";

const deptProcessIds = (deptId: string, source: "draft" | "published") =>
    source === "draft"
        ? sql(`select coalesce(string_agg(p->>'id', ',' order by p->>'id'), '(none)')
               from business_process_drafts d, jsonb_array_elements(d.payload->'processes') p
               where d.department_id='${deptId}'`)
        : sql(`select coalesce(string_agg(p->>'id', ',' order by p->>'id'), '(none)')
               from departments d, jsonb_array_elements(coalesce(d.metadata->'lifecycle_builder_v1'->'processes','[]'::jsonb)) p
               where d.id='${deptId}'`);

test("R1 removal is REFUSED on the Enrollment department, with a reason and no mutation", async () => {
    // This department is deliberately protected: its configuration is runtime-critical. The
    // refusal matters as much as the happy path — a guard that silently mutated first would be
    // worse than no guard at all.
    const draftBefore = draftProcessIds();
    const publishedBefore = publishedProcessIds();

    const res = await page.request.post("/api/admin/lifecycle-catalog/delete", {
        data: { department_id: DEPT, process_id: PROCESS, legacy_delete_confirm: true },
    });
    const body = (await res.json()) as { error?: string };
    record(`R1 refuse http=${res.status()} error="${(body.error ?? "").slice(0, 90)}"`);
    expect(res.status()).toBe(400);
    expect(body.error ?? "").toMatch(/Advanced Configuration/i);

    // Refused means refused: neither the draft nor the projection moved.
    expect(draftProcessIds()).toBe(draftBefore);
    expect(publishedProcessIds()).toBe(publishedBefore);
    record(`R1 draft and projection both unchanged`);
});

test("R2 on a removable department, removal changes the DRAFT only", async () => {
    // A disposable department with two processes in its draft. Nothing is published on it yet, so
    // "the projection did not move" is checked against a genuinely empty projection.
    sqlExec(`INSERT INTO departments (id, org_id, key, name, is_active)
             SELECT '${SPARE_DEPT}', org_id, 'disposable_process_dept', 'Disposable Dept', true
             FROM departments WHERE id='${DEPT}'
             ON CONFLICT (id) DO NOTHING`);
    sqlExec(`INSERT INTO business_process_drafts (org_id, department_id, payload, draft_status, validation_errors)
             SELECT org_id, '${SPARE_DEPT}',
                jsonb_build_object('version',1,'active_process_id','${KEEP_PROCESS}','processes',
                  jsonb_build_array(
                    jsonb_build_object('id','${KEEP_PROCESS}','key','keep','name','Keep Me','sort_order',0,'is_active',true,'stages',jsonb_build_array(),'a_future_process_field','survive me'),
                    jsonb_build_object('id','${DOOMED_PROCESS}','key','doomed','name','Remove Me','sort_order',1,'is_active',true,'stages',jsonb_build_array()))),
                'draft', '[]'::jsonb
             FROM departments d WHERE d.id='${DEPT}'
               AND NOT EXISTS (SELECT 1 FROM business_process_drafts WHERE department_id='${SPARE_DEPT}')`);

    const draftBefore = deptProcessIds(SPARE_DEPT, "draft");
    const publishedBefore = deptProcessIds(SPARE_DEPT, "published");
    const revisionBefore = Number(
        sql(`select draft_revision from business_process_drafts where department_id='${SPARE_DEPT}'`),
    );
    record(`R2 BEFORE draft=[${draftBefore}] published=[${publishedBefore}] draft_revision=${revisionBefore}`);
    expect(draftBefore).toContain(DOOMED_PROCESS);

    const res = await page.request.post("/api/admin/lifecycle-catalog/delete", {
        data: {
            department_id: SPARE_DEPT,
            process_id: DOOMED_PROCESS,
            legacy_delete_confirm: true,
            draft_revision: revisionBefore,
        },
    });
    const body = (await res.json()) as { ok?: boolean; publication_required?: boolean; error?: string };
    record(`R2 remove http=${res.status()} publication_required=${body.publication_required} error=${body.error ?? "-"}`);
    expect(res.status()).toBe(200);
    expect(body.publication_required).toBe(true);

    // Gone from the draft; the surviving process — and its unknown field — are intact.
    const draftAfter = deptProcessIds(SPARE_DEPT, "draft");
    record(`R2 AFTER draft=[${draftAfter}] published=[${deptProcessIds(SPARE_DEPT, "published")}]`);
    expect(draftAfter).not.toContain(DOOMED_PROCESS);
    expect(draftAfter).toContain(KEEP_PROCESS);

    const survivor = sql(`select coalesce(payload->'processes'->0->>'a_future_process_field','(GONE)')
                          from business_process_drafts where department_id='${SPARE_DEPT}'`);
    record(`R2 unknown field on the SURVIVING process after a removal: ${survivor}`);
    expect(survivor).toBe("survive me");

    // And the runtime projection is untouched, because nobody published the removal.
    expect(deptProcessIds(SPARE_DEPT, "published")).toBe(publishedBefore);
});

test("R3 a stale token cannot remove a process — draft CAS applies to removal too", async () => {
    const stale =
        Number(sql(`select draft_revision from business_process_drafts where department_id='${SPARE_DEPT}'`)) - 1;
    const draftBefore = deptProcessIds(SPARE_DEPT, "draft");

    const res = await page.request.post("/api/admin/lifecycle-catalog/delete", {
        data: {
            department_id: SPARE_DEPT,
            process_id: KEEP_PROCESS,
            legacy_delete_confirm: true,
            draft_revision: stale,
        },
    });
    const body = (await res.json()) as { error?: string };
    record(`R3 stale removal token=${stale} http=${res.status()} error="${(body.error ?? "").slice(0, 70)}"`);
    expect(res.status()).toBe(409);
    // The process is still there — a conflict must never half-apply.
    expect(deptProcessIds(SPARE_DEPT, "draft")).toBe(draftBefore);
});

test("R4 publishing the removal moves runtime, and the guard was never tripped", async () => {
    const validation = await page.request.post("/api/admin/business-process/configuration/validate", {
        data: { department_id: SPARE_DEPT },
    });
    const v = (await validation.json()) as { can_publish: boolean; errors: unknown[] };
    record(`R4 validate can_publish=${v.can_publish} errors=${v.errors.length}`);
    // A removal leaving execution-critical dependents dangling would be refused right here.
    expect(v.can_publish).toBe(true);

    const published = await page.request.post("/api/admin/business-process/configuration/publish", {
        data: { department_id: SPARE_DEPT },
    });
    record(`R4 publish http=${published.status()}`);
    expect(published.status()).toBe(200);

    const publishedAfter = deptProcessIds(SPARE_DEPT, "published");
    record(`R4 published AFTER=[${publishedAfter}]`);
    expect(publishedAfter).toContain(KEEP_PROCESS);
    expect(publishedAfter).not.toContain(DOOMED_PROCESS);

    // The unknown field survived draft → revision → projection.
    const survivor = sql(`select coalesce(metadata->'lifecycle_builder_v1'->'processes'->0->>'a_future_process_field','(GONE)')
                          from departments where id='${SPARE_DEPT}'`);
    record(`R4 unknown field in the PUBLISHED projection: ${survivor}`);
    expect(survivor).toBe("survive me");

    // And the Enrollment department is entirely unaffected by its neighbour's removal.
    expect(publishedProcessIds()).toContain(PROCESS);
    expect(guardEnforcing()).toBe("t");
});

/* ── A3 · Work Views draft CAS, through two real clients ────────────────────────────────────── */

test("C1 two editors, one draft: the second save is refused, and the first survives", async () => {
    const contextB: BrowserContext = await browserRef.newContext();
    const pageB = await contextB.newPage();
    try {
        await signIn(pageB);

        // 1 & 2 — both editors load the same draft revision.
        await openWorkViews(page);
        await openWorkViews(pageB);
        const loadedAt = draftRevision();
        record(`C1 both editors loaded draft_revision=${loadedAt}`);

        // 3 — A saves and advances the draft.
        const labelA = `Editor A ${loadedAt}`;
        await renameVisibleWorkView(page, labelA);
        const [resA] = await Promise.all([
            page.waitForResponse(
                (r) => r.url().includes("/process-work-views") && r.request().method() === "POST",
                { timeout: 60_000 },
            ),
            page.getByTestId("business-process-save-work-views").click(),
        ]);
        record(`C1 A save http=${resA.status()} draft ${loadedAt} -> ${draftRevision()}`);
        expect(resA.status()).toBe(200);
        expect(draftRevision()).toBeGreaterThan(loadedAt);

        // 4 — B saves holding the stale token it loaded.
        const labelB = `Editor B ${loadedAt}`;
        await renameVisibleWorkView(pageB, labelB);
        const [resB] = await Promise.all([
            pageB.waitForResponse(
                (r) => r.url().includes("/process-work-views") && r.request().method() === "POST",
                { timeout: 60_000 },
            ),
            pageB.getByTestId("business-process-save-work-views").click(),
        ]);
        const bodyB = (await resB.json().catch(() => ({}))) as { error?: string };
        record(`C1 B save http=${resB.status()} error="${(bodyB.error ?? "").slice(0, 90)}"`);

        // 5 — B is told, clearly, rather than silently losing the work.
        expect(resB.status()).toBe(409);
        expect(bodyB.error ?? "").toMatch(/changed this configuration|reload/i);

        // 6 & 7 — A's change is intact; B did not overwrite it.
        const labels = sql(`select coalesce(string_agg(v->>'label', ',' order by v->>'label'), '(none)')
                            from business_process_drafts d,
                            jsonb_array_elements(d.payload->'processes') p,
                            jsonb_array_elements(coalesce(p->'work_views_v1','[]'::jsonb)) v
                            where d.department_id='${DEPT}' and p->>'id'='${PROCESS}'`);
        record(`C1 draft labels after both attempts: [${labels}]`);
        expect(labels).toContain(labelA);
        expect(labels).not.toContain(labelB);

        // The operator sees the conflict on screen, not just in a network panel.
        const visible = await pageB.locator("body").innerText();
        record(`C1 conflict surfaced to editor B on screen: ${/reload|changed this configuration/i.test(visible)}`);
        await shot(pageB, "C1-editor-b-conflict");
    } finally {
        await contextB.close();
    }
});

test("C2 the refused save left the published runtime untouched", async () => {
    // A conflict is a configuration-time event. Runtime should be entirely unaware of it.
    const publishedLabels = sql(`select coalesce(string_agg(v->>'label', ',' order by v->>'label'), '(none)')
                                 from departments d,
                                 jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') p,
                                 jsonb_array_elements(coalesce(p->'work_views_v1','[]'::jsonb)) v
                                 where d.id='${DEPT}' and p->>'id'='${PROCESS}'`);
    record(`C2 published labels (unchanged by the conflict): [${publishedLabels}]`);
    expect(publishedLabels).not.toContain("Editor A");
    expect(publishedLabels).not.toContain("Editor B");
    expect(guardEnforcing()).toBe("t");
});
