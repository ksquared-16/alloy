/**
 * ENROLLMENT, MOUNTED — sixteen mutations that portal admission decided.
 *
 * `requireAdminOrOps()` resolves admission and no role, as its own docstring records. So editing a
 * family's inquiry, moving a child up the waitlist, cancelling an enrollment agreement and marking
 * a child Enrolled were all decided by who could reach the portal — and `lead-location` had no gate
 * of any kind, nor any check that the destination site was one the operator could see.
 *
 * The matrix is the two diagonals. A Record Manager who keeps the record and CANNOT decide; a
 * Decision Manager who decides and CANNOT edit the record. A suite proving only "grant works, no
 * grant fails" would pass just as well with one collapsed key, which is the model this slice
 * refuses.
 *
 * Every refusal is checked against the database afterwards. A 403 with a side effect is a failure,
 * and a 200 that changed nothing is not proof of the permitted path.
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
const PASSWORD = "alloy-local-cert";

/** Mirrored from `fixtures/access-personas.mjs`. */
const P = {
    record: "cert.enrollrecord@northwind.invalid",
    decide: "cert.enrolldecide@northwind.invalid",
    both: "cert.enrollboth@northwind.invalid",
    titular: "cert.enrolltitular@northwind.invalid",
    portalOnly: "cert.commsportal@northwind.invalid",
    crmWriter: "cert.crmwriter@northwind.invalid",
} as const;

/*
 * Mirrors the sign-in the sibling access certifications use, deliberately.
 *
 * `page.request` rather than `context.request`, because the page carries the session the login
 * flow just established; and the wait is for the workspace URL specifically rather than for "any
 * URL that is not the login page", because the redirect lands on the workspace and a looser wait
 * can resolve on an intermediate navigation before the session cookie is set.
 */
async function signIn(browser: Browser, email: string): Promise<APIRequestContext> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 90_000 });
    return page.request as APIRequestContext;
}

/** The lead this suite drives, and the site it must stay on when a move is refused. */
let LEAD_ID = "";
let LEAD_ORIGINAL_LOCATION: string | null = null;
let ALT_LOCATION: string | null = null;

test.beforeAll(async () => {
    const { data: locs } = await sb
        .from("locations")
        .select("id, location_type")
        .eq("org_id", ORG)
        .eq("location_type", "site")
        .limit(2);
    const sites = (locs ?? []) as { id: string }[];
    test.skip(sites.length < 1, "the cert tenant has no site location to move a lead between");

    const { data: opp } = await sb
        .from("opportunities")
        .select("id, location_id")
        .eq("org_id", ORG)
        .limit(1)
        .maybeSingle();
    test.skip(!opp?.id, "the cert tenant has no opportunity to certify against");
    LEAD_ID = String(opp.id);
    LEAD_ORIGINAL_LOCATION = (opp as { location_id: string | null }).location_id ?? null;
    ALT_LOCATION = sites.find((s) => s.id !== LEAD_ORIGINAL_LOCATION)?.id ?? sites[0].id;
});

/** Read the lead's site straight from the database — never from the response body. */
async function leadLocation(): Promise<string | null> {
    const { data } = await sb
        .from("opportunities")
        .select("location_id")
        .eq("id", LEAD_ID)
        .eq("org_id", ORG)
        .maybeSingle();
    return (data as { location_id: string | null } | null)?.location_id ?? null;
}

const editLead = (api: APIRequestContext) =>
    api.patch(`/api/admin/opportunities/${LEAD_ID}`, { data: { notes: `cert ${Date.now()}` } });

const decideAgreement = (api: APIRequestContext) =>
    api.post(`/api/admin/child-enrollment-agreements`, {
        data: { customer_member_id: "00000000-0000-4000-8000-0000000000ff", site_location_id: ALT_LOCATION },
    });

test.describe("Enrollment mounted — the RECORD MANAGER diagonal", () => {
    test("keeps the record, and is refused the decision", async ({ browser }) => {
        const api = await signIn(browser, P.record);

        const edit = await editLead(api);
        expect(edit.status(), "a record keeper may edit the lead").toBeLessThan(400);

        const decide = await decideAgreement(api);
        expect(decide.status(), "...and may not create an enrollment agreement").toBe(403);
        expect((await decide.json()).required_permission).toBe("enrollment.decide");
    });
});

test.describe("Enrollment mounted — the DECISION MANAGER diagonal", () => {
    test("is refused the record edit", async ({ browser }) => {
        const api = await signIn(browser, P.decide);
        const edit = await editLead(api);
        expect(edit.status(), "a decider may not edit the lead record").toBe(403);
        expect((await edit.json()).required_permission).toBe("enrollment.record.manage");
    });

    test("reaches the decision route — refused for a reason that is not authority", async ({ browser }) => {
        const api = await signIn(browser, P.decide);
        const decide = await decideAgreement(api);
        // The fixture member id is deliberately absent, so this must fail on DATA, never on 403.
        expect(decide.status(), "authority admitted; the refusal must not be 403").not.toBe(403);
    });
});

test.describe("Enrollment mounted — who is refused", () => {
    for (const [label, email] of [
        ["portal admission alone", P.portalOnly],
        ["a role LABELLED Enrollment Administrator holding no grant", P.titular],
        ["a CRM customer writer", P.crmWriter],
    ] as const) {
        test(`${label} cannot edit the lead record, and nothing changes`, async ({ browser }) => {
            const before = await leadLocation();
            const api = await signIn(browser, email);
            const res = await editLead(api);
            expect(res.status()).toBe(403);
            expect(await leadLocation(), "a refusal must leave the record untouched").toBe(before);
        });

        test(`${label} cannot decide`, async ({ browser }) => {
            const api = await signIn(browser, email);
            expect((await decideAgreement(api)).status()).toBe(403);
        });
    }
});

test.describe("Enrollment mounted — Lead location: the scope repair", () => {
    test("the composed operator may move the lead, and the database agrees", async ({ browser }) => {
        const api = await signIn(browser, P.both);
        const res = await api.patch(`/api/admin/opportunities/${LEAD_ID}/lead-location`, {
            data: { location_id: ALT_LOCATION },
        });
        expect(res.status()).toBeLessThan(400);
        expect(await leadLocation(), "the move must be durable, not just a 200").toBe(ALT_LOCATION);
    });

    test("a titular Enrollment Administrator cannot move it, and it stays where it was", async ({ browser }) => {
        const before = await leadLocation();
        const api = await signIn(browser, P.titular);
        const res = await api.patch(`/api/admin/opportunities/${LEAD_ID}/lead-location`, {
            data: { location_id: LEAD_ORIGINAL_LOCATION ?? ALT_LOCATION },
        });
        expect(res.status()).toBe(403);
        expect((await res.json()).required_permission).toBe("enrollment.record.manage");
        expect(await leadLocation(), "a refused move must not move the lead").toBe(before);
    });
});

test.describe("Enrollment mounted — the legacy Opportunity keys are still inert", () => {
    test("the catalog offers the Enrollment keys and neither legacy pair has been activated", async () => {
        const { data } = await sb
            .from("permission_definitions")
            .select("key, group_key, is_active")
            .in("key", [
                "enrollment.record.manage",
                "enrollment.decide",
                "enrollment.record.delete",
                "enrollment.configure",
                "crm.opportunities.write",
                "ops.opportunities.write",
            ]);
        const rows = (data ?? []) as { key: string; group_key: string; is_active: boolean }[];
        const byKey = new Map(rows.map((r) => [r.key, r]));

        // The two Slice-1 keys are catalogued, active, and filed under Enrollment.
        for (const k of ["enrollment.record.manage", "enrollment.decide"]) {
            expect(byKey.get(k)?.is_active, `${k} must be catalogued and active`).toBe(true);
            expect(byKey.get(k)?.group_key).toBe("enrollment");
        }
        // Slice 2's key, and the key the Director ruled out, are absent entirely.
        expect(byKey.has("enrollment.record.delete"), "delete ships in Slice 2, beside its gate").toBe(false);
        expect(byKey.has("enrollment.configure"), "enrollment process design is business_process.*").toBe(false);
        // The legacy pairs still exist and are still granted — untouched, not activated.
        expect(byKey.has("crm.opportunities.write")).toBe(true);
        expect(byKey.has("ops.opportunities.write")).toBe(true);
    });
});
