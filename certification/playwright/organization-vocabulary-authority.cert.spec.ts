/**
 * ORGANIZATION VOCABULARY, MOUNTED — one authority over four families, and the fifth left out.
 *
 * `configuration.vocabulary.manage` was created because no adjacent Configuration authority
 * truthfully meant "may define organization-wide operational vocabulary". That argument is only
 * worth anything if the product answers differently for each neighbour, so the matrix is built out
 * of neighbours: a field manager, an option-set manager, a business-process configurer, a CRM
 * writer, and a persona labelled "Configuration Administrator" holding nothing.
 *
 * THE EXCLUSION IS CERTIFIED TOO. Status definitions are owned by `business_process.configure`
 * because editing one can rebind a status to a lifecycle stage. The vocabulary manager is refused
 * there, and the business-process configurer is refused the vocabulary — the separation from both
 * sides, which is the only way to show it is real.
 */
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const webDir = path.join(__dirname, "..", "..", "web");
const require_ = createRequire(path.join(webDir, "package.json"));
const { createClient } = require_("@supabase/supabase-js");
const envText = readFileSync(path.join(webDir, ".env.certification.local"), "utf8");
const readEnv = (k: string) =>
    envText.split("\n").find((l: string) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
const sb = createClient(
    readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
const PASSWORD = "alloy-local-cert";
const TAG = `vocabcert${Date.now()}`;

/*
 * A FRESH TERM PER CALL. Vocabulary keys are unique per organization, so re-using one made the
 * SECOND permitted caller fail 409 — a uniqueness answer wearing the shape of an authority answer.
 * Since this whole file turns on telling 403 apart from "the body was judged", a collision that only
 * ever hits the permitted path is exactly the wrong thing to leave in.
 */
let seq = 0;
const term = () => `${TAG}_${++seq}`;

const P = {
    vocab:      "cert.vocabmgr@northwind.invalid",
    vocabTitle: "cert.vocabtitular@northwind.invalid",
    fields:     "cert.cfgfldmgr@northwind.invalid",
    optionSets: "cert.cfgoptmgr@northwind.invalid",
    bp:         "cert.bpconfig@northwind.invalid",
    crmWriter:  "cert.crmwriter@northwind.invalid",
    portalOnly: "cert.commsportal@northwind.invalid",
    ops:        "cert.ops@northwind.invalid",
} as const;

async function signIn(browser: Browser, email: string) {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 90_000 });
    return { request: page.request as APIRequestContext, close: () => context.close() };
}

/** One representative mutation per included family, plus the excluded one. */
const FAMILY = {
    entityLabels: (r: APIRequestContext) =>
        r.put("/api/admin/entity-labels", { data: { entity_type: term(), singular: "Thing", plural: "Things" } }),
    roleTypes: (r: APIRequestContext) =>
        r.post("/api/admin/customer-person-role-types", { data: { key: term(), label: "Cert role type" } }),
    relationshipTypes: (r: APIRequestContext) =>
        r.post("/api/admin/person-relationship-type-settings", { data: { key: term(), label: "Cert relationship" } }),
    assignmentTypes: (r: APIRequestContext) =>
        r.post("/api/admin/assignment-types", { data: { label: `${term()} type` } }),
} as const;
const FAMILIES = Object.keys(FAMILY) as (keyof typeof FAMILY)[];

const statusDefinition = (r: APIRequestContext) =>
    r.post("/api/admin/status-definitions", { data: { entity_type: "persons", status_key: term(), status_label: "Cert status" } });

/** Counts read with service credentials — the API that wrote them cannot vouch for itself. */
async function counts() {
    const one = async (table: string, col: string) => {
        const { count } = await sb.from(table).select("id", { count: "exact", head: true })
            .eq("org_id", ORG).like(col, `${TAG}%`);
        return count ?? 0;
    };
    return {
        entityLabels: await one("entity_labels", "entity_type"),
        roleTypes: await one("customer_person_role_types", "key"),
        relationshipTypes: await one("person_relationship_type_settings", "key"),
        assignmentTypes: await one("operational_assignment_types", "label"),
        statusDefinitions: await one("status_definitions", "status_key"),
    };
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
    /*
     * The W-17 test grants a role to a persona. A failure between grant and revoke would leave it
     * attached, and the next run's neighbour tests would then read as "crm.customers.write confers
     * vocabulary" — a fixture leak wearing the shape of a real defect. Cleaned unconditionally.
     *
     * NOTE FOR WHOEVER DEBUGS THIS NEXT: deleting the row here does NOT invalidate
     * `readAdminShellContextCache`, whose entries live 120s. After a run that failed mid-grant, the
     * persona can still present the capability until the TTL lapses or the server restarts. The
     * W-17 test itself revokes through the canonical route, which does invalidate; this is only the
     * safety net.
     */
    await sb.from("user_roles")
        .delete()
        .eq("user_id", "c0000000-0000-4000-8000-00000000d064")
        .eq("role", "mcert_vocab_manager");
    await sb.from("entity_labels").delete().eq("org_id", ORG).like("entity_type", `${TAG}%`);
    await sb.from("customer_person_role_types").delete().eq("org_id", ORG).like("key", `${TAG}%`);
    await sb.from("person_relationship_type_settings").delete().eq("org_id", ORG).like("key", `${TAG}%`);
    await sb.from("operational_assignment_types").delete().eq("org_id", ORG).like("label", `${TAG}%`);
    await sb.from("status_definitions").delete().eq("org_id", ORG).like("status_key", `${TAG}%`);
});

test.describe("Organization vocabulary — one authority, four families", () => {
    test("the vocabulary manager defines every included family, and the words are really there", async ({ browser }) => {
        const s = await signIn(browser, P.vocab);
        for (const key of FAMILIES) {
            const res = await FAMILY[key](s.request);
            expect(res.status(), `${key}: ${await res.text()}`).toBeLessThan(400);
        }
        const after = await counts();
        // A 2xx is not an effect. Each family must actually hold the new term.
        expect(after.entityLabels, "entity label not persisted").toBeGreaterThan(0);
        expect(after.roleTypes, "role type not persisted").toBeGreaterThan(0);
        expect(after.relationshipTypes, "relationship type not persisted").toBeGreaterThan(0);
        expect(after.assignmentTypes, "assignment type not persisted").toBeGreaterThan(0);
        await s.close();
    });

    test("the vocabulary manager is refused status definitions — the excluded family", async ({ browser }) => {
        /*
         * The exclusion, as a product answer. Editing a status definition can rebind a lifecycle
         * stage, so it belongs to business_process.configure. If this ever returns 2xx, whoever may
         * rename a label can move a process.
         */
        const before = (await counts()).statusDefinitions;
        const s = await signIn(browser, P.vocab);
        const res = await statusDefinition(s.request);
        expect(res.status()).toBe(403);
        expect((await counts()).statusDefinitions, "a refused status create must not have created one").toBe(before);
        await s.close();
    });

    test("the business-process configurer owns status definitions and is refused the vocabulary", async ({ browser }) => {
        const s = await signIn(browser, P.bp);
        const sd = await statusDefinition(s.request);
        expect(sd.status(), await sd.text()).toBeLessThan(400);
        expect((await counts()).statusDefinitions, "the status definition must exist").toBeGreaterThan(0);

        const before = await counts();
        for (const key of FAMILIES) {
            const res = await FAMILY[key](s.request);
            expect(res.status(), `business_process.configure must not confer ${key}`).toBe(403);
            expect(await res.text()).toContain("configuration.vocabulary.manage");
        }
        expect(await counts(), "refused vocabulary writes must have changed nothing").toEqual(before);
        await s.close();
    });

    for (const neighbour of ["fields", "optionSets", "crmWriter"] as const) {
        test(`the ${neighbour} holder is refused organization vocabulary`, async ({ browser }) => {
            /*
             * The reason this key exists. fields.manage, option_sets.manage and crm.customers.write
             * each have an established, narrower meaning; none of them is "may define the
             * organization's vocabulary", and the product must say so.
             */
            const before = await counts();
            const s = await signIn(browser, P[neighbour]);
            for (const key of FAMILIES) {
                const res = await FAMILY[key](s.request);
                expect(res.status(), `${neighbour} must not confer ${key}`).toBe(403);
            }
            expect(await counts(), "a refused write must have changed nothing").toEqual(before);
            await s.close();
        });
    }

    test("a job title confers nothing, and neither does portal admission", async ({ browser }) => {
        for (const who of [P.vocabTitle, P.portalOnly]) {
            const before = await counts();
            const s = await signIn(browser, who);
            for (const key of FAMILIES) {
                const res = await FAMILY[key](s.request);
                expect(res.status(), `${who} must be refused ${key}`).toBe(403);
            }
            expect(await counts()).toEqual(before);
            await s.close();
        }
    });

    test("the seeded ops package does NOT define the organization's vocabulary", async ({ browser }) => {
        /*
         * The approved default. Three families denied ops by role title already; assignment types
         * were reachable by any portal principal, which was accidental reach rather than policy and
         * is deliberately not preserved.
         */
        const before = await counts();
        const s = await signIn(browser, P.ops);
        for (const key of FAMILIES) {
            const res = await FAMILY[key](s.request);
            expect(res.status(), `ops must be refused ${key}`).toBe(403);
        }
        expect(await counts()).toEqual(before);
        await s.close();
    });

    test("the vocabulary manager may not assign anything", async ({ browser }) => {
        /*
         * MANDATORY NON-IMPLICATION. Assignments Authority Model V1 put each assignment under its own
         * business surface. Managing the words available for assignment is configuration; assigning
         * is execution.
         */
        const s = await signIn(browser, P.vocab);
        const probes: [string, Record<string, unknown>][] = [
            ["/api/admin/schedules/00000000-0000-4000-8000-0000000000ff/assign", { vendor_id: "x" }],
            ["/api/admin/communications/conversations/00000000-0000-4000-8000-0000000000ff/assign", { action: "claim" }],
        ];
        for (const [url, data] of probes) {
            const res = await s.request.post(url, { data });
            expect(res.status(), `${url} must refuse the vocabulary manager`).toBe(403);
        }
        await s.close();
    });

    test("W-17 — granting and revoking the role opens and closes authority, with no TTL wait", async ({ browser }) => {
        /*
         * GRANTED THROUGH THE CANONICAL ROUTE, NOT A DIRECT ROW WRITE, and the difference is the
         * point. `loadAdminAccessBundleOnce` consults `readAdminShellContextCache` — a process-wide
         * bundle cache with a 120s TTL — BEFORE resolving anything, and its own header says not to
         * rely on it for authorization and to invalidate it on change. A capability granted by
         * writing `user_roles` directly is therefore invisible for up to two minutes, which reads
         * exactly like a broken union. Granting the way the product grants invalidates the entry, so
         * authority opens on the next request with nothing to wait for.
         */
        const TARGET = "c0000000-0000-4000-8000-00000000d064";   // the CRM writer
        const VOCAB_ROLE = "mcert_vocab_manager";

        const target = await signIn(browser, P.crmWriter);
        expect((await FAMILY.roleTypes(target.request)).status(), "starts without vocabulary").toBe(403);

        const admin = await signIn(browser, "qa.operator@northwind.invalid");
        const granted = await admin.request.post(`/api/admin/users/${TARGET}/roles`, { data: { role: VOCAB_ROLE } });
        expect(granted.status(), await granted.text()).toBeLessThan(400);

        const opened = await FAMILY.relationshipTypes(target.request);
        expect(opened.status(), `granting must open vocabulary at once: ${await opened.text()}`).toBeLessThan(400);

        const revoked = await admin.request.delete(`/api/admin/users/${TARGET}/roles/${VOCAB_ROLE}`);
        expect(revoked.status(), await revoked.text()).toBeLessThan(400);

        expect((await FAMILY.roleTypes(target.request)).status(), "revoking must close it at once").toBe(403);
        // And the role they kept still works.
        expect((await target.request.get("/api/admin/persons")).status(), "CRM authority untouched").toBe(200);
        await admin.close();
        await target.close();
    });

    test("another organization's vocabulary is not reachable, and stays unchanged", async ({ browser }) => {
        const foreign = `${TAG}_foreign`;
        await sb.from("customer_person_role_types").insert({ org_id: OTHER_ORG, key: foreign, label: "Foreign" });
        const read = async () => {
            const { data } = await sb.from("customer_person_role_types").select("label")
                .eq("org_id", OTHER_ORG).eq("key", foreign).maybeSingle();
            return (data as { label?: string } | null)?.label ?? null;
        };
        const before = await read();
        const { data: row } = await sb.from("customer_person_role_types").select("id")
            .eq("org_id", OTHER_ORG).eq("key", foreign).maybeSingle();

        const s = await signIn(browser, P.vocab);
        const res = await s.request.patch(`/api/admin/customer-person-role-types/${(row as { id: string }).id}`,
            { data: { label: "Rewritten across the tenant boundary" } });
        expect(res.status(), "cross-tenant vocabulary write must be refused").toBeGreaterThanOrEqual(400);
        expect(await read(), "foreign vocabulary must be unchanged").toBe(before);
        await s.close();
        await sb.from("customer_person_role_types").delete().eq("org_id", OTHER_ORG).eq("key", foreign);
    });
});
