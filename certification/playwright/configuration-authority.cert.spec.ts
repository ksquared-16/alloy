/**
 * OPTION SETS, LAYOUTS AND FIELDS — TWO PATHS THAT DISAGREED, AND A SPLIT BY SENSITIVITY.
 *
 * Seventeen handlers asked `ctx.role !== "admin"` while three capabilities over the same domains —
 * `option_sets.manage`, `layouts.manage`, `fields.manage` — were already live, already granted to
 * admin AND ops, and already enforced through Config Layout Assist. So an ops user could change a
 * layout through the assisted path and was refused by the direct route. That contradiction is what
 * this file proves is gone.
 *
 * But only SEVEN routes had an assisted equivalent. The assisted path has no delete operation of any
 * kind and no layout version lifecycle at all, so converging the rest onto the manage keys would
 * have handed ops deletion and publishing it has never had. Hence three new keys, and hence the rows
 * below that matter most: a manage-key holder REFUSED at a delete, and refused at a publish.
 *
 * ── TWO ROUTES ARE DELIBERATELY ABSENT ──
 *
 * `entity-layouts/[id]` DELETE is a MODEL_CONTRACT_DEFECT and `ensure-platform-field` is an
 * unresolved delegability question. Both keep the role gate they already had. PHASE 5 asserts they
 * are NO MORE reachable than before rather than pretending they were migrated.
 *
 * 403 is the gate refusing; anything else is the gate admitting, since every gate runs before the
 * handler reads its body. A 400 or 404 is therefore a PASS for an authorized persona.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OPERATOR_STATE = path.join(__dirname, "..", ".auth", "operator.json");
const EVIDENCE = path.join(__dirname, "..", "evidence", "configuration-authority");
const PASSWORD = "alloy-local-cert";

const NO_SET = "zzz-no-such-option-set";
const NO_ITEM = "99999999-0000-4000-8000-0000000000e1";
const NO_LAYOUT = "99999999-0000-4000-8000-0000000000f1";
const NO_FIELD = "99999999-0000-4000-8000-000000000101";

const PERSONAS = {
    optionManager: { email: "cert.cfgoptmgr@northwind.invalid", role: "mcert_cfg_option_manager" },
    optionDeleter: { email: "cert.cfgoptdel@northwind.invalid", role: "mcert_cfg_option_deleter" },
    layoutManager: { email: "cert.cfglaymgr@northwind.invalid", role: "mcert_cfg_layout_manager" },
    layoutLifecycle: { email: "cert.cfglaylife@northwind.invalid", role: "mcert_cfg_layout_lifecycle" },
    fieldManager: { email: "cert.cfgfldmgr@northwind.invalid", role: "mcert_cfg_field_manager" },
    fieldDeleter: { email: "cert.cfgflddel@northwind.invalid", role: "mcert_cfg_field_deleter" },
    titular: { email: "cert.cfgtitular@northwind.invalid", role: "mcert_cfg_titular" },
    portalOnly: { email: "cert.procportal@northwind.invalid", role: "mcert_proc_portal_only" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid" };

type Door =
    | "os:create" | "os:update" | "os:itemAdd" | "os:itemUpdate" | "os:delete" | "os:itemDelete"
    | "lay:edit" | "lay:create" | "lay:duplicate" | "lay:publish" | "lay:rollback"
    | "fld:create" | "fld:update" | "fld:placement" | "fld:delete";

type Session = { page: Page; request: APIRequestContext; signedIn: boolean; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try {
        await page.waitForURL("**/workspace**", { timeout: 90_000 });
    } catch {
        signedIn = false;
    }
    return { page, request: page.request, signedIn, close: () => context.close() };
}

async function knock(r: APIRequestContext, door: Door): Promise<number> {
    const no = { data: {}, failOnStatusCode: false } as const;
    const OS = `/api/admin/option-sets/${NO_SET}`;
    const LAY = `/api/admin/entity-layouts/${NO_LAYOUT}`;
    const FLD = `/api/admin/field-definitions/${NO_FIELD}`;
    switch (door) {
        case "os:create": return (await r.post("/api/admin/option-sets", no)).status();
        case "os:update": return (await r.patch(OS, no)).status();
        case "os:itemAdd": return (await r.post(`${OS}/items`, no)).status();
        case "os:itemUpdate": return (await r.patch(`${OS}/items/${NO_ITEM}`, no)).status();
        case "os:delete": return (await r.delete(OS, { failOnStatusCode: false })).status();
        case "os:itemDelete": return (await r.delete(`${OS}/items/${NO_ITEM}`, { failOnStatusCode: false })).status();
        case "lay:edit": return (await r.patch(LAY, no)).status();
        case "lay:create": return (await r.post("/api/admin/entity-layouts", no)).status();
        case "lay:duplicate": return (await r.post(`${LAY}/duplicate`, no)).status();
        case "lay:publish": return (await r.post(`${LAY}/publish`, no)).status();
        case "lay:rollback": return (await r.post(`${LAY}/rollback`, no)).status();
        case "fld:create": return (await r.post("/api/admin/field-definitions", no)).status();
        case "fld:update": return (await r.patch(FLD, no)).status();
        case "fld:placement": return (await r.patch("/api/admin/field-definitions/batch-placement", no)).status();
        case "fld:delete": return (await r.delete(FLD, { failOnStatusCode: false })).status();
    }
}

const admitted = (s: number) => s !== 403;
const OS_MANAGE: Door[] = ["os:create", "os:update", "os:itemAdd", "os:itemUpdate"];
const OS_DELETE: Door[] = ["os:delete", "os:itemDelete"];
const LAY_MANAGE: Door[] = ["lay:edit"];
const LAY_LIFE: Door[] = ["lay:create", "lay:duplicate", "lay:publish", "lay:rollback"];
const FLD_MANAGE: Door[] = ["fld:create", "fld:update", "fld:placement"];
const FLD_DELETE: Door[] = ["fld:delete"];
const ALL: Door[] = [...OS_MANAGE, ...OS_DELETE, ...LAY_MANAGE, ...LAY_LIFE, ...FLD_MANAGE, ...FLD_DELETE];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Configuration authority, split by sensitivity", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — each capability opens its own family and no other", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            optionManager: OS_MANAGE,
            optionDeleter: OS_DELETE,
            layoutManager: LAY_MANAGE,
            layoutLifecycle: LAY_LIFE,
            fieldManager: FLD_MANAGE,
            fieldDeleter: FLD_DELETE,
            titular: [],
            portalOnly: [],
        };
        for (const [name, p] of Object.entries(PERSONAS) as [keyof typeof PERSONAS, { email: string }][]) {
            const s = await signIn(browser, p.email);
            expect(s.signedIn, `${name} could not sign in`).toBe(true);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(name, door, status);
                const expected = owns[name].includes(door);
                expect(
                    admitted(status),
                    `${name} at ${door}: expected ${expected ? "ADMITTED" : "REFUSED (403)"}, got ${status}`,
                ).toBe(expected);
            }
            await s.close();
        }
    });

    test("PHASE 2 — manage never implies delete, and never implies publish", async ({ browser }) => {
        /*
         * The whole reason three keys were minted. If any of these opened, the sensitivity split
         * would be decorative and a grant of "Manage" would carry deletion with it.
         */
        const cases: [keyof typeof PERSONAS, Door, string][] = [
            ["optionManager", "os:delete", "option_sets.manage must not delete an option set"],
            ["optionManager", "os:itemDelete", "option_sets.manage must not delete an item"],
            ["layoutManager", "lay:publish", "layouts.manage must not publish"],
            ["layoutManager", "lay:rollback", "layouts.manage must not roll back"],
            ["layoutManager", "lay:create", "layouts.manage must not create a layout"],
            ["fieldManager", "fld:delete", "fields.manage must not delete a field"],
        ];
        for (const [who, door, why] of cases) {
            const s = await signIn(browser, PERSONAS[who].email);
            expect(await knock(s.request, door), why).toBe(403);
            await s.close();
        }
    });

    test("PHASE 3 — admin keeps everything; ops converges on ordinary and is refused the sensitive", async ({ browser }) => {
        const adminCtx = await browser.newContext({ storageState: OPERATOR_STATE });
        for (const door of ALL) {
            const status = await knock(adminCtx.request, door);
            record("admin", door, status);
            expect(admitted(status), `admin lost ${door} (${status})`).toBe(true);
        }
        await adminCtx.close();

        /*
         * THE CONVERGENCE, AND ITS LIMIT. Ops holds the three manage keys and already produced
         * equivalent effects through Config Layout Assist, so gaining the ordinary routes is the two
         * paths agreeing at last — AUTHORITY_PATH_CONVERGENCE, not a package expansion. It must NOT
         * have gained deletion or lifecycle, which it has never had by any path.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "cert.ops could not sign in").toBe(true);
        for (const door of [...OS_MANAGE, ...LAY_MANAGE, ...FLD_MANAGE]) {
            const status = await knock(s.request, door);
            record("ops", door, status);
            expect(admitted(status), `ops should have converged on ${door} (got ${status})`).toBe(true);
        }
        for (const door of [...OS_DELETE, ...LAY_LIFE, ...FLD_DELETE]) {
            const status = await knock(s.request, door);
            record("ops", door, status);
            expect(status, `ops gained ${door} — the sensitivity split failed`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 4 — reads are untouched", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.portalOnly.email);
        for (const url of ["/api/admin/option-sets", "/api/admin/entity-layouts", "/api/admin/field-definitions"]) {
            const res = await s.request.get(url, { failOnStatusCode: false });
            record("portalOnly", `GET ${url}`, res.status());
            expect(res.status(), `${url} was open before this slice and must stay open`).not.toBe(403);
        }
        await s.close();
    });

    test("PHASE 5 — the two excluded routes are NO MORE reachable than before", async ({ browser }) => {
        /*
         * `entity-layouts/[id]` DELETE is a MODEL_CONTRACT_DEFECT and `ensure-platform-field` is an
         * unresolved delegability question. Neither was given a capability, precisely because a key
         * can be granted to a custom role while a role literal cannot. This asserts the consequence:
         * holding the domain's capabilities buys neither of them.
         */
        for (const who of ["layoutLifecycle", "layoutManager"] as const) {
            const s = await signIn(browser, PERSONAS[who].email);
            const r = await s.request.delete(`/api/admin/entity-layouts/${NO_LAYOUT}`, { failOnStatusCode: false });
            record(who, "EXCLUDED lay:delete", r.status());
            expect(r.status(), `${who} must not reach the model-defect layout DELETE`).toBe(403);
            await s.close();
        }
        for (const who of ["fieldManager", "fieldDeleter"] as const) {
            const s = await signIn(browser, PERSONAS[who].email);
            const r = await s.request.post("/api/admin/field-definitions/ensure-platform-field", { data: {}, failOnStatusCode: false });
            record(who, "EXCLUDED fld:ensurePlatform", r.status());
            expect(r.status(), `${who} must not reach the unresolved platform-field route`).toBe(403);
            await s.close();
        }
    });

    test("PHASE 6 — composition: a second role opens deletion, and removing it closes only that", async ({ browser }) => {
        const subjectId = "c0000000-0000-4000-8000-00000000d033";
        const admin = await browser.newContext({ storageState: OPERATOR_STATE });
        const subject = await signIn(browser, PERSONAS.fieldManager.email);

        expect(admitted(await knock(subject.request, "fld:update")), "precondition: ordinary open").toBe(true);
        expect(await knock(subject.request, "fld:delete"), "precondition: delete shut").toBe(403);

        const add = await admin.request.post(`/api/admin/users/${subjectId}/roles`, {
            data: { role: PERSONAS.fieldDeleter.role }, failOnStatusCode: false,
        });
        expect(add.status(), `assignment failed: ${await add.text()}`).toBeLessThan(400);

        const opened = await knock(subject.request, "fld:delete");
        record("fieldManager+deleter", "fld:delete", opened);
        expect(admitted(opened), `the union must take effect immediately (got ${opened})`).toBe(true);

        const remove = await admin.request.delete(`/api/admin/users/${subjectId}/roles/${PERSONAS.fieldDeleter.role}`, { failOnStatusCode: false });
        expect(remove.status(), `removal failed: ${await remove.text()}`).toBeLessThan(400);

        expect(await knock(subject.request, "fld:delete"), "delete must close again").toBe(403);
        expect(admitted(await knock(subject.request, "fld:update")), "ordinary management must survive").toBe(true);

        await subject.close();
        await admin.close();
    });

    test("PHASE 7 — cross-organization", async ({ browser }) => {
        const s = await signIn(browser, "cert.otherorg@adapter.invalid");
        expect(s.signedIn, "cert.otherorg could not sign in").toBe(true);
        for (const door of ["os:update", "fld:delete"] as Door[]) {
            const status = await knock(s.request, door);
            record("otherorg", door, status);
            expect(status, `another organization's administrator must not act here (${door})`).toBeGreaterThanOrEqual(400);
        }
        await s.close();
    });

    test("PHASE 8 — the recorded matrix is complete and non-vacuous", async () => {
        const statuses = Object.values(MATRIX).flatMap((d) => Object.values(d));
        expect(statuses.some((s) => s === 403), "no refusal recorded — the gates are not gating").toBe(true);
        expect(statuses.some((s) => s !== 403), "no admission recorded — nothing can be done at all").toBe(true);
        for (const who of [...Object.keys(PERSONAS), "admin", "ops"]) {
            expect(MATRIX[who], `${who} is missing from the matrix`).toBeTruthy();
        }
    });
});
