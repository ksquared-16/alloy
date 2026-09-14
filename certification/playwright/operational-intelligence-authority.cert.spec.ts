/**
 * OPERATIONAL INTELLIGENCE AUTHORITY CONVERGENCE V1 — ACTIVATING A KEY THAT ALREADY EXISTED.
 *
 * Ten mutation handlers under `organization-calculations/` and `metrics/` asked
 * `ctx.role !== "admin"` while `reports.write` sat in the catalog, named in `canReadAnalytics` as
 * ANALYTICS_MANAGE_PERMISSION, describing exactly those operations — and enforcing nothing. Its only
 * executable effect was satisfying the analytics READ gate as a superset of `reports.read`.
 *
 * So this file proves two things at once, and the second is the one that could have gone wrong:
 *
 *   1. the ten routes now answer to `reports.write`, and to nothing else;
 *   2. removing `reports.write` from the ops default did NOT cost anyone a READ. The key used to
 *      satisfy the read gate, so withholding it is exactly the change that could silently close
 *      Operational Intelligence to ops. PHASE 3 and PHASE 5 exist for that.
 *
 * 403 is the gate refusing; anything else is the gate admitting, since every gate runs before the
 * handler reads its body. A 400, 404 or 409 is therefore a PASS for an authorized persona.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "operational-intelligence-authority");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent ids: the gate runs first, so a refusal is authority and never data. */
const NO_CALC = "99999999-0000-4000-8000-000000000301";
const FOREIGN_CALC = "99999999-0000-4000-8000-0000000003f0";
const NO_MEASUREMENT = "99999999-0000-4000-8000-000000000302";

const PERSONAS = {
    writer: { email: "cert.oiwriter@northwind.invalid" },
    reader: { email: "cert.oireader@northwind.invalid" },
    titular: { email: "cert.oititular@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid" };

type Door =
    | "calcCreate" | "calcEdit" | "calcPublish" | "calcArchive" | "calcRestore" | "calcBindRuntime"
    | "kpiTargets" | "oiConfig" | "measurementCreate" | "measurementEdit";

/** The analytics READ the ops correction must not have broken. */
type ReadDoor = "calcList" | "calcCatalog" | "calcRuntime";

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

async function knock(r: APIRequestContext, door: Door, calcId = NO_CALC): Promise<number> {
    const no = { data: {}, failOnStatusCode: false } as const;
    const C = `/api/admin/organization-calculations/${calcId}`;
    switch (door) {
        case "calcCreate": return (await r.post("/api/admin/organization-calculations", no)).status();
        case "calcEdit": return (await r.patch(C, no)).status();
        case "calcPublish": return (await r.post(`${C}/publish`, no)).status();
        case "calcArchive": return (await r.post(`${C}/archive`, no)).status();
        case "calcRestore": return (await r.post(`${C}/restore`, no)).status();
        case "calcBindRuntime": return (await r.post(`${C}/bind-runtime`, no)).status();
        case "kpiTargets": return (await r.patch("/api/admin/metrics/kpi-targets", no)).status();
        case "oiConfig": return (await r.patch("/api/admin/metrics/oi-config", no)).status();
        case "measurementCreate": return (await r.post("/api/admin/metrics/oi-org-calc-measurements", no)).status();
        case "measurementEdit": return (await r.patch(`/api/admin/metrics/oi-org-calc-measurements/${NO_MEASUREMENT}`, no)).status();
    }
}

async function read(r: APIRequestContext, door: ReadDoor): Promise<number> {
    switch (door) {
        case "calcList": return (await r.get("/api/admin/organization-calculations", { failOnStatusCode: false })).status();
        case "calcCatalog": return (await r.get("/api/admin/organization-calculations/catalog", { failOnStatusCode: false })).status();
        case "calcRuntime": return (await r.get("/api/admin/organization-calculations/runtime", { failOnStatusCode: false })).status();
    }
}

const admitted = (s: number) => s !== 403;
const CALC: Door[] = ["calcCreate", "calcEdit", "calcPublish", "calcArchive", "calcRestore", "calcBindRuntime"];
const METRICS: Door[] = ["kpiTargets", "oiConfig", "measurementCreate", "measurementEdit"];
const ALL: Door[] = [...CALC, ...METRICS];
const READS: ReadDoor[] = ["calcList", "calcCatalog", "calcRuntime"];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Operational Intelligence authority, and an ops default corrected in the same breath", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — reports.write opens all ten, and nothing else does", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            writer: ALL,
            reader: [],
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

    test("PHASE 2 — holding the read key is not holding the write key", async ({ browser }) => {
        /*
         * The separability the ops correction depends on. `reports.write` used to satisfy the READ
         * gate as a superset; nothing ever made the reverse true, and this is where that is proven
         * rather than assumed.
         */
        const s = await signIn(browser, PERSONAS.reader.email);
        for (const door of ALL) {
            expect(await knock(s.request, door), `a reader must not ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 3 — the reader can still READ Operational Intelligence", async ({ browser }) => {
        /*
         * NON-VACUITY FOR PHASE 2. A persona refused at every door might simply be broken. This
         * proves reports.read alone still opens the analytics reads, so the refusals above are about
         * authority and not about a persona who cannot reach anything.
         */
        const s = await signIn(browser, PERSONAS.reader.email);
        for (const door of READS) {
            const status = await read(s.request, door);
            record("reader", door, status);
            expect(status, `a reader must still read ${door}; got ${status}`).not.toBe(403);
        }
        await s.close();
    });

    test("PHASE 4 — the role label carries nothing", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.titular.email);
        expect(s.signedIn, "the titular admin must still reach the portal").toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("titular", door, status);
            expect(status, `a role NAMED Admin must be refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 5 — default ops keeps its READS and gains no authoring", async ({ browser }) => {
        /*
         * THE COMPATIBILITY PROOF THIS SLICE OWES.
         *
         * `reports.write` was seeded to ops and satisfied the read gate as a superset. Withholding
         * it is precisely the change that could close Operational Intelligence to ops by accident.
         * Ops keeps `reports.read`, so every read must still open — and every one of the ten
         * mutations must still refuse, exactly as it did on the role literal.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "ops must still reach the portal").toBe(true);

        for (const door of READS) {
            const status = await read(s.request, door);
            record("defaultOps", door, status);
            expect(status, `ops must still read ${door} after losing reports.write; got ${status}`).not.toBe(403);
        }
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("defaultOps", door, status);
            expect(status, `default ops must remain refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 6 — a foreign organization's calculation is refused even holding the key", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.writer.email);
        for (const door of ["calcEdit", "calcPublish", "calcArchive"] as Door[]) {
            const status = await knock(s.request, door, FOREIGN_CALC);
            record("writerForeign", door, status);
            expect(
                [403, 404].includes(status),
                `a foreign organization's calculation must be refused at ${door}; got ${status}`,
            ).toBe(true);
        }
        await s.close();
    });

    test("PHASE 7 — a grant reaches the holder on the next request, and a revoke removes it at once", async ({ browser, page }) => {
        /*
         * D2 / cache. The operator changes the role in one context; the TARGET observes in their own
         * signed-in session with no wait anywhere. The subject is the READER, so the grant is
         * non-vacuous (it starts refused) and the revoke is too — and the final assertion is the one
         * that matters most here: after the revoke the reader must still READ.
         */
        const ROLE = "mcert_oi_reader";
        const setKeys = async (keys: string[]) => {
            const res = await page.request.patch(`/api/admin/rbac/roles/${ROLE}`, {
                data: { permission_keys: keys },
                failOnStatusCode: false,
            });
            expect(res.status(), await res.text()).toBeLessThan(400);
        };

        const target = await signIn(browser, PERSONAS.reader.email);
        try {
            expect(await knock(target.request, "calcCreate"), "the reader must start refused").toBe(403);

            await setKeys(["portal.access", "reports.read", "reports.write"]);
            const afterGrant = await knock(target.request, "calcCreate");
            record("d2GrantThenProbe", "calcCreate", afterGrant);
            expect(afterGrant, `the grant must reach the holder on their next request; got ${afterGrant}`).not.toBe(403);

            await setKeys(["portal.access", "reports.read"]);
            const afterRevoke = await knock(target.request, "calcCreate");
            record("d2RevokeThenProbe", "calcCreate", afterRevoke);
            expect(afterRevoke, `the revoke must deny immediately; got ${afterRevoke}`).toBe(403);

            // And the read survives the revoke — authoring narrowed, reading did not.
            const readAfter = await read(target.request, "calcList");
            record("d2RevokeThenProbe", "calcList", readAfter);
            expect(readAfter, "the reader must still read after the write key is revoked").not.toBe(403);
        } finally {
            await setKeys(["portal.access", "reports.read"]);
            await target.close();
        }
    });
});
