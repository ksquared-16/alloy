/**
 * BP V2 D4 — LIVE: a financial amount the Financials location contract withholds from a site-restricted
 * actor cannot be read through a detail route, the Financials card, or the Focus Panel card producer.
 *
 * REAL: every route handler, `financialReadScope` over the canonical `isFinancialWorkVisible`, the
 * production access chain (portal admission, grant resolver, `resolveAdminAccessCore` reading the
 * actor's `user_access_profiles` / `user_site_access` rows), and Northwind's own records on the local
 * certification stack. MOCKED: only WHO IS SIGNED IN (`cachedAuthSession`) — the cookie a route cannot
 * read under vitest. Four real users are created (admin all-sites; admin restricted to Riverside; admin
 * restricted to Lakeside; a portal-only role without `fin.read`) and removed afterwards. Read-only on
 * every financial table.
 *
 * Gate: BPV2_LIVE_SUPABASE_URL + BPV2_LIVE_SERVICE_KEY. Evidence → BPV2_LIVE_EVIDENCE.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { who } = vi.hoisted(() => ({ who: { userId: null as string | null, email: "", client: null as unknown } }));

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => who.client }));
vi.mock("@/lib/admin/cachedAuthSession", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/cachedAuthSession")>("@/lib/admin/cachedAuthSession");
    return {
        ...actual,
        getCachedAuthUserId: async () => who.userId,
        getCachedAuthUser: async () => (who.userId ? ({ id: who.userId, email: who.email } as never) : null),
    };
});
vi.mock("next/cache", () => ({ revalidateTag: () => undefined, revalidatePath: () => undefined, unstable_cache: (fn: unknown) => fn }));

import { resolveAdminAccessCore } from "@/lib/admin/resolveAdminAccessCore";
import { projectFocusPanelCardProducers } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardProducers";
import { financialItemReadable, financialReadScopeFromAccess, householdFinancialsReadable } from "@/lib/financials/workspace/financialReadScope";
import { GET as CHARGE_GET } from "@/app/api/admin/financials/charge/[id]/route";
import { GET as CARD_GET } from "@/app/api/admin/financials/card/route";
import { GET as PAYMENT_METHODS_GET } from "@/app/api/admin/financials/payment-methods/route";
import { GET as RESPONSIBILITY_POSITIONS_GET } from "@/app/api/admin/financials/responsibility-positions/route";
import { GET as FAMILY_DISCOUNT_GET } from "@/app/api/admin/financials/family-discount-position/route";
import { GET as ELIGIBLE_TARGETS_GET } from "@/app/api/admin/financials/eligible-target-charges/route";
import { GET as COLLECTION_STATE_GET } from "@/app/api/admin/financials/collection-state/route";
import { GET as POSITION_GET } from "@/app/api/admin/financials/position/route";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const live = Boolean(URL_ && KEY);
const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
/** A third Northwind site neither restricted actor holds (where its agreement-sourced payments live). */
const CERT_SITE = "fc500000-0000-4000-8000-00000000f001";
/** Agreements at Riverside (343 charges) and Lakeside, plus 38 household-sourced (org-scoped) charges. */
const H_MIXED = "00000000-0000-4000-8000-000050000001";
/** One Lakeside agreement, one Lakeside charge, no household-sourced money. */
const H_LAKE = "00000000-0000-4000-8000-10000000003b";
const RUN = randomUUID().slice(0, 8);

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { run: RUN, at: new Date().toISOString(), scenarios: {} };
const record = (k: string, v: unknown) => ((evidence.scenarios as Record<string, unknown>)[k] = v);
type P = { userId: string; email: string; personId: string };
const personas: Record<"all" | "river" | "lake" | "nofin", P> = {} as never;
const ids: Record<string, string> = {};

async function persona(label: string, role: string, sites: string[] | "all"): Promise<P> {
    const email = `bpv2-d4-${label}-${RUN}@example.com`;
    const u = await supabase.auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
    if (u.error) throw new Error(`user ${label}: ${u.error.message}`);
    const userId = u.data.user.id;
    const { data: num } = await supabase.from("persons").select("person_number").eq("org_id", ORG).order("person_number", { ascending: false }).limit(1).maybeSingle();
    const person = await supabase
        .from("persons")
        .insert({ org_id: ORG, person_number: Number((num as { person_number?: number } | null)?.person_number ?? 900000) + 1, first_name: "D4", last_name: `${label} ${RUN}` })
        .select("id")
        .single();
    if (person.error) throw new Error(`person ${label}: ${person.error.message}`);
    const steps = [
        supabase.from("user_person_links").insert({ org_id: ORG, user_id: userId, person_id: person.data.id }),
        supabase.from("user_access_profiles").insert({ user_id: userId, org_id: ORG, department_scope: "all", site_scope: sites === "all" ? "all" : "restricted" }),
    ];
    for (const s of steps) {
        const r = await s;
        if (r.error) throw new Error(`${label}: ${r.error.message}`);
    }
    if (sites !== "all") {
        const r = await supabase.from("user_site_access").insert(sites.map((location_id) => ({ user_id: userId, org_id: ORG, location_id })));
        if (r.error) throw new Error(`${label} sites: ${r.error.message}`);
    }
    const r = await supabase.from("user_roles").insert({ user_id: userId, org_id: ORG, role });
    if (r.error) throw new Error(`${label} role: ${r.error.message}`);
    return { userId, email, personId: person.data.id as string };
}
const as = (p: P) => {
    who.userId = p.userId;
    who.email = p.email;
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(handler: (req: NextRequest, ctx: any) => Promise<Response>, path: string, params?: Record<string, string>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await handler(new NextRequest(`http://localhost${path}`), { params: Promise.resolve(params ?? {}) });
    const text = await res.text();
    let json: Json = {};
    try {
        json = JSON.parse(text) as Json;
    } catch {
        /* non-JSON */
    }
    return { status: res.status, json, text };
}
/** A refused body must carry nothing about the record: no id, no amount, no household. */
function expectNoLeak(text: string, secrets: Array<string | number | null | undefined>) {
    for (const s of secrets) if (s !== null && s !== undefined && String(s).length > 2) expect(text).not.toContain(String(s));
}

beforeAll(async () => {
    if (!live) return;
    supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
    who.client = supabase;
    personas.all = await persona("all", "admin", "all");
    personas.river = await persona("river", "admin", [RIVERSIDE]);
    personas.lake = await persona("lake", "admin", [LAKESIDE]);
    personas.nofin = await persona("nofin", "mcert_proc_portal_only", "all");

    const pick = async (q: PromiseLike<{ data: unknown }>, name: string) => {
        const row = ((await q).data as Array<{ id: string }> | null)?.[0];
        if (!row) throw new Error(`fixture missing: ${name}`);
        ids[name] = row.id;
    };
    const agreementsAt = async (customer: string, site: string) =>
        (((await supabase.from("child_enrollment_agreements").select("id").eq("org_id", ORG).eq("customer_id", customer).eq("site_location_id", site)).data ?? []) as Array<{ id: string }>).map((a) => a.id);
    await pick(supabase.from("charges").select("id").eq("org_id", ORG).eq("billable_source_type", "enrollment_agreement").in("billable_source_id", await agreementsAt(H_MIXED, RIVERSIDE)).limit(1), "riverChargeMixed");
    await pick(supabase.from("charges").select("id").eq("org_id", ORG).eq("billable_source_type", "customer").eq("billable_source_id", H_MIXED).limit(1), "householdChargeMixed");
    await pick(supabase.from("charges").select("id").eq("org_id", ORG).eq("billable_source_type", "enrollment_agreement").in("billable_source_id", await agreementsAt(H_LAKE, LAKESIDE)).limit(1), "lakeCharge");
    await pick(supabase.from("charges").select("id").neq("org_id", ORG).limit(1), "otherOrgCharge");
    await pick(supabase.from("customer_members").select("id").eq("org_id", ORG).eq("customer_id", H_LAKE).limit(1), "lakeChild");
    await pick(supabase.from("customer_members").select("id").eq("org_id", ORG).eq("customer_id", H_MIXED).limit(1), "mixedChild");
    // Payments / attempts located at sites by their own agreements, and a household-sourced payment.
    const agreementsAtSite = async (site: string) =>
        (((await supabase.from("child_enrollment_agreements").select("id").eq("org_id", ORG).eq("site_location_id", site).limit(60)).data ?? []) as Array<{ id: string }>).map((a) => a.id);
    await pick(supabase.from("payments").select("id").eq("org_id", ORG).eq("billable_source_type", "enrollment_agreement").in("billable_source_id", await agreementsAtSite(CERT_SITE)).limit(1), "certSitePayment");
    await pick(supabase.from("payments").select("id").eq("org_id", ORG).eq("billable_source_type", "customer").limit(1), "householdPayment");
    await pick(supabase.from("payment_collection_attempts").select("id").eq("org_id", ORG).eq("billable_source_type", "enrollment_agreement").in("billable_source_id", await agreementsAtSite(LAKESIDE)).limit(1), "lakeAttempt");
    const { data: amt } = await supabase.from("charges").select("amount_cents").eq("id", ids.householdChargeMixed).single();
    ids.householdChargeAmount = String((amt as { amount_cents: number }).amount_cents);
    const { data: hh } = await supabase.from("customers").select("name").eq("id", H_MIXED).single();
    ids.mixedHouseholdName = String((hh as { name: string | null }).name ?? "");
    record("fixtures", ids);
}, 180_000);

afterAll(async () => {
    if (!live) return;
    for (const p of Object.values(personas)) {
        if (!p?.userId) continue;
        for (const t of ["user_roles", "user_site_access", "user_access_profiles", "user_person_links"]) await supabase.from(t).delete().eq("user_id", p.userId);
        await supabase.from("persons").delete().eq("id", p.personId);
        await supabase.auth.admin.deleteUser(p.userId).catch(() => null);
    }
    const { count } = await supabase.from("user_roles").select("user_id", { count: "exact", head: true }).in("user_id", Object.values(personas).map((p) => p.userId));
    evidence.persona_rows_remaining = count ?? null;
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

describe.skipIf(!live)("live — D4: financial detail reads enforce the Financials site-visibility policy", () => {
    it("the actors resolve to the scopes they were given (production access chain)", async () => {
        const out: Record<string, unknown> = {};
        for (const [k, p] of Object.entries(personas)) {
            const core = await resolveAdminAccessCore(supabase, p.userId);
            out[k] = { siteScope: core?.siteScope, sites: core?.allowedSiteLocationIds, finRead: core?.permissionKeys?.includes("fin.read") ?? false, portal: core?.portalEligible };
        }
        expect(out.all).toMatchObject({ siteScope: "all", finRead: true, portal: true });
        expect(out.river).toMatchObject({ siteScope: "restricted", sites: [RIVERSIDE], finRead: true, portal: true });
        expect(out.lake).toMatchObject({ siteScope: "restricted", sites: [LAKESIDE], finRead: true, portal: true });
        expect(out.nofin).toMatchObject({ finRead: false, portal: true });
        record("actors", out);
    }, 60_000);

    it("charge detail: unrestricted reads all; a restricted actor reads only charges located at its sites", async () => {
        const r: Record<string, number> = {};
        as(personas.all);
        for (const k of ["riverChargeMixed", "householdChargeMixed", "lakeCharge"]) r[`all:${k}`] = (await call(CHARGE_GET, `/api/admin/financials/charge/${ids[k]}`, { id: ids[k]! })).status;
        as(personas.river);
        const own = await call(CHARGE_GET, `/api/admin/financials/charge/${ids.riverChargeMixed}`, { id: ids.riverChargeMixed! });
        r["river:riverChargeMixed"] = own.status;
        const hh = await call(CHARGE_GET, `/api/admin/financials/charge/${ids.householdChargeMixed}`, { id: ids.householdChargeMixed! });
        r["river:householdChargeMixed"] = hh.status;
        const lake = await call(CHARGE_GET, `/api/admin/financials/charge/${ids.lakeCharge}`, { id: ids.lakeCharge! });
        r["river:lakeCharge"] = lake.status;
        as(personas.lake);
        r["lake:lakeCharge"] = (await call(CHARGE_GET, `/api/admin/financials/charge/${ids.lakeCharge}`, { id: ids.lakeCharge! })).status;
        r["lake:riverChargeMixed"] = (await call(CHARGE_GET, `/api/admin/financials/charge/${ids.riverChargeMixed}`, { id: ids.riverChargeMixed! })).status;

        expect(r).toEqual({
            "all:riverChargeMixed": 200, "all:householdChargeMixed": 200, "all:lakeCharge": 200,
            "river:riverChargeMixed": 200, "river:householdChargeMixed": 404, "river:lakeCharge": 404,
            "lake:lakeCharge": 200, "lake:riverChargeMixed": 404,
        });
        expect(own.json.detail).toBeTruthy();
        // A refusal is the not-found answer, byte for byte, and names nothing.
        expect(hh.json).toEqual({ ok: false, error: "No such charge." });
        expectNoLeak(hh.text, [ids.householdChargeMixed, ids.householdChargeAmount, ids.mixedHouseholdName, H_MIXED]);
        expectNoLeak(lake.text, [ids.lakeCharge, H_LAKE]);
        record("charge_detail", r);
    }, 120_000);

    it("cross-org charge ids, and actors without fin.read, are refused without leakage", async () => {
        as(personas.all);
        const cross = await call(CHARGE_GET, `/api/admin/financials/charge/${ids.otherOrgCharge}`, { id: ids.otherOrgCharge! });
        const unknown = await call(CHARGE_GET, `/api/admin/financials/charge/${randomUUID()}`, { id: randomUUID() });
        expect(cross.status).toBe(404);
        expect(cross.json).toEqual(unknown.json);
        as(personas.nofin);
        const nofinCharge = await call(CHARGE_GET, `/api/admin/financials/charge/${ids.riverChargeMixed}`, { id: ids.riverChargeMixed! });
        const nofinCard = await call(CARD_GET, `/api/admin/financials/card?customer_id=${H_LAKE}`);
        expect(nofinCharge.status).toBe(403);
        expect(nofinCard.status).toBe(403);
        expectNoLeak(nofinCharge.text + nofinCard.text, [ids.householdChargeAmount, ids.mixedHouseholdName]);
        record("cross_org_and_no_fin", { cross: cross.status, nofin_charge: nofinCharge.status, nofin_card: nofinCard.status });
    }, 60_000);

    it("Financials card: same-site household readable; a household with money outside the actor's sites is refused", async () => {
        const r: Record<string, number> = {};
        as(personas.all);
        const allMixed = await call(CARD_GET, `/api/admin/financials/card?customer_id=${H_MIXED}`);
        r["all:mixed"] = allMixed.status;
        as(personas.lake);
        const lakeOwn = await call(CARD_GET, `/api/admin/financials/card?customer_id=${H_LAKE}`);
        r["lake:lake"] = lakeOwn.status;
        r["lake:lake_by_child"] = (await call(CARD_GET, `/api/admin/financials/card?customer_member_id=${ids.lakeChild}`)).status;
        const lakeMixed = await call(CARD_GET, `/api/admin/financials/card?customer_id=${H_MIXED}`);
        r["lake:mixed"] = lakeMixed.status;
        as(personas.river);
        const riverMixed = await call(CARD_GET, `/api/admin/financials/card?customer_id=${H_MIXED}`);
        r["river:mixed"] = riverMixed.status;
        r["river:mixed_by_child"] = (await call(CARD_GET, `/api/admin/financials/card?customer_member_id=${ids.mixedChild}`)).status;
        r["river:lake"] = (await call(CARD_GET, `/api/admin/financials/card?customer_id=${H_LAKE}`)).status;
        // Forged: an in-scope household with a child from a different household cannot widen anything.
        as(personas.lake);
        r["lake:forged_member"] = (await call(CARD_GET, `/api/admin/financials/card?customer_id=${H_LAKE}&customer_member_id=${ids.mixedChild}`)).status;

        expect(r).toEqual({
            "all:mixed": 200, "lake:lake": 200, "lake:lake_by_child": 200, "lake:mixed": 404,
            "river:mixed": 404, "river:mixed_by_child": 404, "river:lake": 404, "lake:forged_member": 404,
        });
        expect(allMixed.json.vm).toBeTruthy();
        expect(lakeOwn.json.vm).toBeTruthy();
        expectNoLeak(riverMixed.text + lakeMixed.text, [ids.householdChargeAmount, ids.mixedHouseholdName, ids.householdChargeMixed]);
        record("card", r);
    }, 180_000);

    it("Focus Panel card producer (the panel's first paint, and Billing's source focus): same decision as /card", async () => {
        const produce = async (p: P, household: string) => {
            const access = await resolveAdminAccessCore(supabase, p.userId);
            const out = await projectFocusPanelCardProducers({
                supabase, orgId: ORG, context: { participantScope: null }, financialSubjectId: household,
                access: Object.assign({ ok: true as const, userId: p.userId }, access) as never,
            });
            return { state: out.financials.state, hasData: out.financials.data != null, text: JSON.stringify(out.financials) };
        };
        const r = {
            all_mixed: await produce(personas.all, H_MIXED),
            river_mixed: await produce(personas.river, H_MIXED),
            lake_lake: await produce(personas.lake, H_LAKE),
            lake_mixed: await produce(personas.lake, H_MIXED),
        };
        expect(r.all_mixed).toMatchObject({ state: "ready", hasData: true });
        expect(r.lake_lake).toMatchObject({ state: "ready", hasData: true });
        expect(r.river_mixed).toMatchObject({ state: "forbidden", hasData: false });
        expect(r.lake_mixed).toMatchObject({ state: "forbidden", hasData: false });
        expectNoLeak(r.river_mixed.text + r.lake_mixed.text, [ids.householdChargeAmount, ids.mixedHouseholdName]);
        record("producer", Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { state: v.state, hasData: v.hasData }])));
    }, 180_000);

    it("household-keyed card reads and item-keyed reads carry the same restriction", async () => {
        const routes: Array<[string, (req: NextRequest, ctx: any) => Promise<Response>, string]> = [ // eslint-disable-line @typescript-eslint/no-explicit-any
            ["payment-methods", PAYMENT_METHODS_GET, `/api/admin/financials/payment-methods?customer_id=${H_MIXED}`],
            ["responsibility-positions", RESPONSIBILITY_POSITIONS_GET, `/api/admin/financials/responsibility-positions?customer_id=${H_MIXED}`],
            ["family-discount-position", FAMILY_DISCOUNT_GET, `/api/admin/financials/family-discount-position?customer_id=${H_MIXED}`],
            ["eligible-target-charges:certSitePayment", ELIGIBLE_TARGETS_GET, `/api/admin/financials/eligible-target-charges?payment_id=${ids.certSitePayment}`],
            ["eligible-target-charges:householdPayment", ELIGIBLE_TARGETS_GET, `/api/admin/financials/eligible-target-charges?payment_id=${ids.householdPayment}`],
            ["collection-state:lakeAttempt", COLLECTION_STATE_GET, `/api/admin/financials/collection-state?attempt_id=${ids.lakeAttempt}`],
        ];
        const r: Record<string, Record<string, number>> = {};
        for (const [name, handler, path] of routes) {
            r[name] = {};
            for (const k of ["all", "river", "lake"] as const) {
                as(personas[k]);
                r[name][k] = (await call(handler, path)).status;
            }
        }
        // Unrestricted: never refused by scope. Restricted: refused exactly where the location is not theirs.
        for (const name of Object.keys(r)) expect(r[name]!.all, name).not.toBe(404);
        expect(r["payment-methods"]).toMatchObject({ river: 404, lake: 404 });
        expect(r["responsibility-positions"]).toMatchObject({ river: 404, lake: 404 });
        expect(r["family-discount-position"]).toMatchObject({ river: 404, lake: 404 });
        expect(r["eligible-target-charges:certSitePayment"]).toMatchObject({ river: 404, lake: 404 });
        expect(r["eligible-target-charges:householdPayment"]).toMatchObject({ river: 404, lake: 404 });
        expect(r["collection-state:lakeAttempt"]!.river).toBe(404);
        expect(r["collection-state:lakeAttempt"]!.lake).not.toBe(404);
        record("household_and_item_routes", r);
    }, 240_000);

    it("the list reader and the detail decision agree for the same records (one policy, two grains)", async () => {
        as(personas.river);
        const position = await call(POSITION_GET, `/api/admin/financials/position`);
        expect(position.status).toBe(200);
        const rows = (position.json.cohort?.rows ?? position.json.rows ?? []) as Array<{ customerId?: string | null; locationScope?: string; siteLocationId?: string | null }>;
        // The list never shows the river actor an org-scoped or Lakeside row ...
        expect(rows.every((x) => x.locationScope === "site" && x.siteLocationId === RIVERSIDE)).toBe(true);
        // ... and the detail decision refuses exactly those, item by item.
        const scope = financialReadScopeFromAccess((await resolveAdminAccessCore(supabase, personas.river.userId)) as never);
        expect(await financialItemReadable(supabase, { orgId: ORG, scope, table: "charges", id: ids.householdChargeMixed! })).toBe("out_of_scope");
        expect(await financialItemReadable(supabase, { orgId: ORG, scope, table: "charges", id: ids.riverChargeMixed! })).toBe("readable");
        expect(await householdFinancialsReadable(supabase, { orgId: ORG, scope, customerId: H_MIXED })).toBe("out_of_scope");
        record("list_detail_parity", { river_position_rows: rows.length, all_site_riverside: true });
    }, 120_000);
});
