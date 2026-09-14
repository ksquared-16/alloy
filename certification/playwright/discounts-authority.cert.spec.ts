/**
 * DISCOUNTS AUTHORITY DISPOSITION V1 — A JOBS CAPABILITY, NOT A FINANCIALS ONE.
 *
 * Three Discount Program mutations asked `ctx.role !== "admin"`. A Discount Program is a reusable
 * benefit/qualifier/commitment definition consumed by job and quote pricing, booking validation and
 * campaigns — so the authority is the Jobs owner's, `ops.jobs.write`.
 *
 * It is deliberately NOT `fin.adjust`. That key's own catalogue text scopes it to "what a family
 * owes", and the Financials program recorded `discount_programs` as a DIFFERENT VERTICAL when it
 * built `financial_reduction_applications`. Certifying that boundary is part of this file's job:
 * PHASE 2 proves a scheduling capability does not open these routes, because "some Jobs-adjacent
 * key" is not the same claim as "the Jobs write key".
 *
 * `ops.jobs.write` is already admin-present and ops-absent — the Schedules + Jobs slice withheld it —
 * so this rehome preserves current behaviour exactly and needed no migration. PHASE 4 measures that
 * rather than asserting it.
 *
 * 403 is the gate refusing; anything else is the gate admitting, since every gate runs before the
 * handler reads its body. A 400 or 404 is therefore a PASS for an authorized persona.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "discounts-authority");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent ids: the gate runs first, so a refusal is authority and never data. */
const NO_PROGRAM = "99999999-0000-4000-8000-000000000401";
const FOREIGN_PROGRAM = "99999999-0000-4000-8000-0000000004f0";

const PERSONAS = {
    jobWriter: { email: "cert.sjjobber@northwind.invalid" },      // portal.access + ops.jobs.write
    scheduler: { email: "cert.sjscheduler@northwind.invalid" },   // portal.access + scheduling.write
    titular: { email: "cert.sjtitular@northwind.invalid" },       // labelled Admin, holds nothing
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid" };

type Door = "create" | "edit" | "remove";

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

async function knock(r: APIRequestContext, door: Door, id = NO_PROGRAM): Promise<number> {
    const no = { data: {}, failOnStatusCode: false } as const;
    switch (door) {
        case "create": return (await r.post("/api/admin/discounts", no)).status();
        case "edit": return (await r.patch(`/api/admin/discounts/${id}`, no)).status();
        case "remove": return (await r.delete(`/api/admin/discounts/${id}`, { failOnStatusCode: false })).status();
    }
}

/** Reads must not tighten. */
async function readList(r: APIRequestContext): Promise<number> {
    return (await r.get("/api/admin/discounts", { failOnStatusCode: false })).status();
}

const admitted = (s: number) => s !== 403;
const ALL: Door[] = ["create", "edit", "remove"];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Discount Program authority belongs to Jobs", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — ops.jobs.write opens all three, and nothing else does", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            jobWriter: ALL,
            scheduler: [],
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

    test("PHASE 2 — a scheduling capability is not the Jobs write capability", async ({ browser }) => {
        /*
         * The precision this slice turns on. `scheduling.write` sits in the same authority module and
         * the same operational family, and it does NOT open these routes. If it did, the claim
         * "Discount Programs are Jobs authority" would really be "Discount Programs are anything
         * Jobs-adjacent", which is how a capability quietly becomes a folder.
         */
        const s = await signIn(browser, PERSONAS.scheduler.email);
        for (const door of ALL) {
            expect(await knock(s.request, door), `scheduling.write must not ${door} a Discount Program`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 3 — the role label carries nothing", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.titular.email);
        expect(s.signedIn, "the titular admin must still reach the portal").toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("titular", door, status);
            expect(status, `a role NAMED Admin must be refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 4 — default ops is refused, and its READ is untouched", async ({ browser }) => {
        /*
         * `ops.jobs.write` is admin-present and ops-absent because the Schedules + Jobs slice
         * withheld it, so this rehome should preserve behaviour exactly and need no migration. That
         * is measured here rather than asserted. The read is checked in the same breath because this
         * slice tightened no GET, and ops holds `ops.jobs.read`.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "ops must still reach the portal").toBe(true);

        const read = await readList(s.request);
        record("defaultOps", "readList", read);
        expect(read, `ops must still read the Discount Program list; got ${read}`).not.toBe(403);

        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("defaultOps", door, status);
            expect(status, `default ops must remain refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 5 — the capability does not widen the tenant boundary, because there is no boundary to widen", async ({ browser }) => {
        /*
         * A DEFECT RECORDED, NOT A BOUNDARY CERTIFIED.
         *
         * This phase was written to prove a foreign organization's Discount Program is refused. It
         * cannot, because the product does not refuse it. `updateDiscountProgram` and
         * `deleteDiscountProgram` in lib/admin/discountProgramAdmin.ts select, update and delete by
         * `id` ALONE — no `org_id` predicate — on a `createAdminClient()` service-role connection
         * that bypasses RLS. Any holder who knows an id can reach another tenant's program.
         *
         * That is PRE-EXISTING and this slice neither caused nor widened it: the gate was
         * `ctx.role !== "admin"` and is now `ops.jobs.write`, which is admin-present and ops-absent,
         * so the population that can reach these handlers is unchanged.
         *
         * It is not fixed here on purpose. `org_id` on a Discount Program is NULLABLE, so a naive
         * `.eq("org_id", ctx.orgId)` would make platform-scoped programs unreachable — the fix needs
         * a decision about what a null-org program means, which is Jobs product work, not Access
         * authority work. Recorded as DISCOUNT_PROGRAM_TENANT_SCOPE_DEFECT.
         *
         * So what this phase certifies is the honest, narrower claim: the AUTHORITY layer treats a
         * foreign-shaped id exactly as it treats any other — a non-holder is refused before the
         * handler is reached. When the tenancy fix lands, the second assertion here will start
         * failing, and that is the intended alarm.
         */
        const nonHolder = await signIn(browser, PERSONAS.scheduler.email);
        for (const door of ["edit", "remove"] as Door[]) {
            const status = await knock(nonHolder.request, door, FOREIGN_PROGRAM);
            record("nonHolderForeign", door, status);
            expect(status, `a non-holder must be refused at ${door} before any lookup`).toBe(403);
        }
        await nonHolder.close();

        // The defect itself, asserted against source so it cannot rot silently.
        const admin = readFileSync(
            path.join(__dirname, "..", "..", "web", "lib", "admin", "discountProgramAdmin.ts"),
            "utf8",
        );
        const del = admin.slice(admin.indexOf("export async function deleteDiscountProgram"));
        const delBody = del.slice(0, del.indexOf("\n}"));
        expect(
            /org_id/.test(delBody),
            "DISCOUNT_PROGRAM_TENANT_SCOPE_DEFECT resolved — delete now scopes by org; update this phase to certify the boundary",
        ).toBe(false);
    });

    test("PHASE 6 — the writer is ADMITTED, and the handler beneath is broken", async ({ browser }) => {
        /*
         * A DEFECT FOUND BY TRYING TO USE THE ROUTE, WHICH IS WHY THE PHASE WAS WRITTEN.
         *
         * This was meant to create a disposable program, edit it, delete it, and prove the whole
         * lifecycle for a Jobs writer. The create fails — and not for an authority reason:
         *
         *     new row for relation "discount_program_benefits" ... 'sort_order' column not found
         *
         * `buildDiscountProgramBenefitsInsertPayload` writes `sort_order: 0`, the canonical schema
         * defines `discount_program_benefits` WITHOUT that column, and no migration in the tree ever
         * adds it. So creating a Discount Program is broken on current schema, for everyone,
         * regardless of who is asking. Recorded as DISCOUNT_PROGRAM_CREATE_SCHEMA_DEFECT.
         *
         * That is pre-existing and orthogonal to this slice: the gate used to be the admin role and
         * is now `ops.jobs.write`, and neither reaches the schema. It is also consistent with what
         * the product-status census found — two programs, zero applications, nothing written since
         * March — a surface nobody has exercised in months.
         *
         * So this phase certifies the part that is this slice's to certify, and says plainly what it
         * cannot: the AUTHORITY admits the Jobs writer — the request passes the gate and fails in the
         * handler — while a non-holder never gets that far. When the schema defect is fixed the
         * second assertion will start failing, and the lifecycle can be certified properly.
         */
        const writer = await signIn(browser, PERSONAS.jobWriter.email);
        const created = await writer.request.post("/api/admin/discounts", {
            data: {
                name: `cert disposable ${Date.now()}`,
                code: `CERTDISP${Date.now() % 100000}`,
                status: "draft",
                program_type: "code",
                primary_benefit: { benefit_type: "percent_off", applies_to: "order", percent_basis_points: 500 },
            },
            failOnStatusCode: false,
        });
        const body = await created.text();
        record("lifecycle", "create", created.status());

        // AUTHORITY: admitted. This is the claim the slice owns.
        expect(
            created.status(),
            `the Jobs writer must pass the gate; a 403 would mean the rehome denied a holder: ${body}`,
        ).not.toBe(403);

        // THE DEFECT, pinned so it cannot be forgotten. Fixing it flips this and demands the
        // lifecycle be certified for real.
        expect(
            /sort_order/.test(body),
            `DISCOUNT_PROGRAM_CREATE_SCHEMA_DEFECT resolved — create no longer fails on sort_order; restore the full create/edit/delete lifecycle proof here. Body: ${body}`,
        ).toBe(true);

        await writer.close();

        // And a non-holder does not reach the handler at all, which is what separates the two.
        const nonHolder = await signIn(browser, PERSONAS.scheduler.email);
        expect(await knock(nonHolder.request, "create"), "a non-holder must be refused before the handler").toBe(403);
        await nonHolder.close();
    });

    test("PHASE 7 — a grant reaches the holder on the next request, and a revoke removes it at once", async ({ browser, page }) => {
        /*
         * D2 / cache. The operator changes the role in one context; the TARGET observes in their own
         * signed-in session with no wait. The subject is the titular admin, so the grant is
         * non-vacuous (it starts refused) and the revoke is too.
         */
        const ROLE = "mcert_sj_titular";
        const setKeys = async (keys: string[]) => {
            const res = await page.request.patch(`/api/admin/rbac/roles/${ROLE}`, {
                data: { permission_keys: keys },
                failOnStatusCode: false,
            });
            expect(res.status(), await res.text()).toBeLessThan(400);
        };

        const target = await signIn(browser, PERSONAS.titular.email);
        try {
            expect(await knock(target.request, "create"), "the titular admin must start refused").toBe(403);

            await setKeys(["portal.access", "ops.jobs.write"]);
            const afterGrant = await knock(target.request, "create");
            record("d2GrantThenProbe", "create", afterGrant);
            expect(afterGrant, `the grant must reach the holder on their next request; got ${afterGrant}`).not.toBe(403);

            await setKeys(["portal.access"]);
            const afterRevoke = await knock(target.request, "create");
            record("d2RevokeThenProbe", "create", afterRevoke);
            expect(afterRevoke, `the revoke must deny immediately; got ${afterRevoke}`).toBe(403);
        } finally {
            await setKeys(["portal.access"]);
            await target.close();
        }
    });
});
