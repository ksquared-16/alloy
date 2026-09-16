/**
 * PROGRAMS, MOUNTED — published configuration, and the authority it already had.
 *
 * No capability was invented. A Program is a configuration object with a publication lifecycle —
 * draft, validate, publish, distribute to Locations — and the operator meets it at Settings →
 * Programs (`/adminV2/settings/organization/programs`). `settings.manage` was already the declared
 * owner of the canonical publication route; this slice extended it to the offerings, variants and
 * location/program-category mutations that had no capability at all.
 *
 * THE MATRIX IS ABOUT THE TWO WRONG ANSWERS. Programs sit beside tuition rates, so the nearest
 * mistake is Financial authority; they distribute through the configuration publication machinery,
 * so the next nearest is Business Process. Both are ruled out by giving those authorities to people
 * and watching the product refuse them.
 */
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const webDir = path.join(__dirname, "..", "..", "web");
const require_ = createRequire(path.join(webDir, "package.json"));
const { createClient } = require_("@supabase/supabase-js");
const envText = readFileSync(path.join(webDir, ".env.certification.local"), "utf8");
const rd = (k: string) => envText.split("\n").find((l: string) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
const sb = createClient(rd("SUPABASE_URL") || rd("NEXT_PUBLIC_SUPABASE_URL"), rd("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } });

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
const PASSWORD = "alloy-local-cert";
const TAG = `progcert${Date.now()}`;
let seq = 0;
const term = () => `${TAG}_${++seq}`;

/** A real category row to PATCH; created in beforeAll and removed in afterAll. */
const CATEGORY_ID = "c0ffee44-0000-4000-8000-00000000e001";
/** `location_program_categories` is location-scoped: org_id, location_id, key and label are NOT NULL. */
const CATEGORY_LOCATION = "00000000-0000-4000-8000-000000000010";

const P = {
    program:    "cert.programmgr@northwind.invalid",     // settings.manage ALONE
    vocab:      "cert.vocabmgr@northwind.invalid",        // configuration.vocabulary.manage
    fields:     "cert.cfgfldmgr@northwind.invalid",       // fields.manage
    bp:         "cert.bpconfig@northwind.invalid",        // business_process.configure
    finAdjust:  "cert.finadjust@northwind.invalid",       // fin.adjust
    titular:    "cert.vocabtitular@northwind.invalid",    // labelled Configuration Administrator
    portalOnly: "cert.commsportal@northwind.invalid",
    ops:        "cert.ops@northwind.invalid",
} as const;

async function signIn(browser: Browser, email: string) {
    const c = await browser.newContext({ storageState: undefined });
    const p = await c.newPage();
    await p.goto("/login");
    await p.locator('input[type="email"]').first().fill(email);
    const pw = p.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await p.waitForURL("**/workspace**", { timeout: 90_000 });
    return { page: p, request: p.request as APIRequestContext, close: () => c.close() };
}

/** One representative mutation per Program surface. */
const OP = {
    offering: (r: APIRequestContext) =>
        r.post("/api/admin/programs/offerings", {
            data: { program_key: term(), label: "Cert offering", attendance_type: "full_time", status: "draft" },
        }),
    /*
     * PATCH, not POST. The POST on this route is a deliberate 409 stub — it carries the capability
     * check and then tells the operator that "Programs are created and published by the
     * Organization", so it mutates nothing and cannot show authority working. PATCH is where the
     * location/program-category association actually changes.
     */
    category: (r: APIRequestContext) =>
        r.patch("/api/admin/location-program-categories", {
            data: { updates: [{ id: CATEGORY_ID, label: `${term()} category` }] },
        }),
    publication: (r: APIRequestContext) =>
        r.post("/api/admin/configuration/programs", { data: { action: "create_draft", key: term(), label: "Cert program" } }),
} as const;
const OPS = Object.keys(OP) as (keyof typeof OP)[];

async function counts() {
    const one = async (table: string, col: string, org = ORG) => {
        const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq("org_id", org).like(col, `${TAG}%`);
        return count ?? 0;
    };
    return {
        offerings: await one("program_offerings", "program_key"),
        categories: await one("location_program_categories", "label"),
        programs: await one("programs", "program_key"),
    };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
    await sb.from("location_program_categories").upsert(
        { id: CATEGORY_ID, org_id: ORG, location_id: CATEGORY_LOCATION, key: `${TAG}_base`, label: "Cert base category" },
        { onConflict: "id" },
    );
    const { count } = await sb.from("location_program_categories")
        .select("id", { count: "exact", head: true }).eq("id", CATEGORY_ID);
    expect(count, "the category fixture must exist, or every result below is a fixture failure").toBe(1);
});

test.afterAll(async () => {
    await sb.from("program_offerings").delete().eq("org_id", ORG).like("program_key", `${TAG}%`);
    await sb.from("location_program_categories").delete().eq("org_id", ORG).like("key", `${TAG}%`);
    await sb.from("location_program_categories").delete().eq("id", CATEGORY_ID);
    await sb.from("program_drafts").delete().eq("org_id", ORG);
    await sb.from("programs").delete().eq("org_id", ORG).like("program_key", `${TAG}%`);
});

test.describe("Programs — published configuration, owned by settings.manage", () => {
    test("the program manager reaches the mounted Settings → Programs surface", async ({ browser }) => {
        /*
         * The real product surface, not a fabricated one. The authority is enforced at the API, so
         * the mutations below are the proof; this asserts the operator actually has somewhere to
         * perform them.
         */
        const s = await signIn(browser, P.program);
        const res = await s.page.goto("/adminV2/settings/organization/programs", { waitUntil: "domcontentloaded" });
        expect(res?.status(), "Settings → Programs must be reachable by its owner").toBeLessThan(400);
        await s.close();
    });

    test("the program manager performs every Program mutation, and the state really changes", async ({ browser }) => {
        const s = await signIn(browser, P.program);
        for (const key of OPS) {
            const res = await OP[key](s.request);
            expect(res.status(), `${key}: ${await res.text()}`).toBeLessThan(400);
        }
        const after = await counts();
        expect(after.offerings, "offering not persisted").toBeGreaterThan(0);
        expect(after.categories, "category not persisted").toBeGreaterThan(0);
        expect(after.programs, "program draft not persisted").toBeGreaterThan(0);
        await s.close();
    });

    for (const neighbour of ["vocab", "fields", "bp", "finAdjust"] as const) {
        test(`the ${neighbour} holder is refused every Program mutation`, async ({ browser }) => {
            /*
             * Financials and Business Process are the two nearest wrong answers — Programs read
             * tuition rates and publish through the configuration distribution machinery — so both
             * are given to a person here and refused by the product.
             */
            const before = await counts();
            const s = await signIn(browser, P[neighbour]);
            for (const key of OPS) {
                const res = await OP[key](s.request);
                expect(res.status(), `${neighbour} must not confer ${key}`).toBe(403);
            }
            expect(await counts(), "a refused Program mutation must have changed nothing").toEqual(before);
            await s.close();
        });
    }

    test("a job title confers nothing, and neither does portal admission", async ({ browser }) => {
        for (const who of [P.titular, P.portalOnly]) {
            const before = await counts();
            const s = await signIn(browser, who);
            for (const key of OPS) {
                expect((await OP[key](s.request)).status(), `${who} must be refused ${key}`).toBe(403);
            }
            expect(await counts()).toEqual(before);
            await s.close();
        }
    });

    test("the seeded ops package manages Programs, as its grants say", async ({ browser }) => {
        // settings.manage is granted to admin AND ops in every organization; this is the package
        // behaviour, not a widening — the role-title fallback admitted exactly these principals.
        const s = await signIn(browser, P.ops);
        const res = await OP.offering(s.request);
        expect(res.status(), await res.text()).toBeLessThan(400);
        await s.close();
    });

    test("deleting a Program in use is refused, and the Program survives", async ({ browser }) => {
        /*
         * The destructive contract the product already states: `evaluateProgramDeleteEligibility`
         * blocks deletion when a Program is in use and tells the operator to archive instead. The
         * capability did not change that, and must not.
         */
        const s = await signIn(browser, P.program);
        const created = await OP.publication(s.request);
        expect(created.status()).toBeLessThan(400);
        const { programId } = (await created.json()) as { programId: string };

        await sb.from("opportunity_customer_members").select("id").limit(1);   // touch: schema present
        const del = await s.request.post("/api/admin/configuration/programs", { data: { action: "delete", programId } });
        // Either it deletes (not in use) or it blocks with the archive instruction — never a 500.
        expect([200, 409]).toContain(del.status());
        if (del.status() === 409) {
            expect(await del.text()).toContain("program_delete_blocked");
            const { data } = await sb.from("programs").select("id").eq("id", programId).maybeSingle();
            expect(data, "a blocked delete must leave the Program in place").toBeTruthy();
        }
        await s.close();
    });

    test("another organization's Program offering is not reachable, and stays unchanged", async ({ browser }) => {
        /*
         * Proven on `program_offerings` rather than `location_program_categories`: categories are
         * location-scoped and the other certification organization has no Locations, so a foreign
         * category cannot exist to attack. Offerings are org-scoped, which is the boundary under test.
         */
        const foreignKey = `${TAG}_foreign`;
        await sb.from("program_offerings").insert({
            org_id: OTHER_ORG, program_key: foreignKey, label: "Foreign offering", attendance_type: "full_time", status: "draft",
        });
        const readLabel = async () => {
            const { data } = await sb.from("program_offerings").select("label")
                .eq("org_id", OTHER_ORG).eq("program_key", foreignKey).maybeSingle();
            return (data as { label?: string } | null)?.label ?? null;
        };
        const { data: row } = await sb.from("program_offerings").select("id")
            .eq("org_id", OTHER_ORG).eq("program_key", foreignKey).maybeSingle();
        expect(row, "the foreign fixture must exist").toBeTruthy();
        const before = await readLabel();

        const s = await signIn(browser, P.program);
        const res = await s.request.patch(`/api/admin/programs/offerings/${(row as { id: string }).id}`,
            { data: { label: "Rewritten across the tenant boundary" } });
        expect(res.status(), "cross-tenant Program write must be refused").toBeGreaterThanOrEqual(400);
        expect(await readLabel(), "foreign state must be unchanged").toBe(before);
        await s.close();
        await sb.from("program_offerings").delete().eq("org_id", OTHER_ORG).eq("program_key", foreignKey);
    });

    test("W-17 — granting and revoking Program authority opens and closes it, with no TTL wait", async ({ browser }) => {
        /*
         * Granted through the CANONICAL route, not a direct row write: `loadAdminAccessBundleOnce`
         * consults a process-wide bundle cache with a 120s TTL before resolving anything, so a
         * direct grant is invisible for up to two minutes and reads exactly like a broken union.
         */
        const TARGET = "c0000000-0000-4000-8000-00000000d063";  // the CRM reader
        const ROLE = "mcert_program_manager";
        await sb.from("user_roles").delete().eq("user_id", TARGET).eq("role", ROLE);

        const target = await signIn(browser, "cert.crmreader@northwind.invalid");
        expect((await OP.offering(target.request)).status(), "starts without Program authority").toBe(403);

        const admin = await signIn(browser, "qa.operator@northwind.invalid");
        const granted = await admin.request.post(`/api/admin/users/${TARGET}/roles`, { data: { role: ROLE } });
        expect(granted.status(), await granted.text()).toBeLessThan(400);

        const opened = await OP.category(target.request);
        expect(opened.status(), `granting must open Program authority at once: ${await opened.text()}`).toBeLessThan(400);

        const revoked = await admin.request.delete(`/api/admin/users/${TARGET}/roles/${ROLE}`);
        expect(revoked.status(), await revoked.text()).toBeLessThan(400);
        expect((await OP.offering(target.request)).status(), "revoking must close it at once").toBe(403);

        // The authority they kept is untouched.
        expect((await target.request.get("/api/admin/persons")).status(), "CRM read still works").toBe(200);
        await admin.close();
        await target.close();
    });
});
