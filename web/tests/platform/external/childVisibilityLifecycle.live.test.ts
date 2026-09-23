/**
 * The external child visibility LIFECYCLE law, over HTTP against a running server.
 *
 * ── WHY THIS SUITE EXISTS ──
 *
 * Hosted certification found that a child whose enrollment had been CANCELLED was still published
 * by `GET /api/v1/children`, with `status: active`, together with every relationship edge naming
 * their guardians. Visibility followed the EXISTENCE of an agreement and never looked at its
 * status, so a family who signed and then withdrew before their child ever attended stayed on the
 * public API indefinitely.
 *
 * ── THE LAW BEING CERTIFIED ──
 *
 * `canceled` is not a general-purpose terminal state. `cancelAgreementBeforeStart` is its only
 * writer and it refuses anything that is not `pending_start`, so the state carries one provable
 * meaning: service was committed and withdrawn BEFORE IT BEGAN. Nothing was ever served under it.
 *
 * `ended` is the other kind of terminal — service happened and finished, and attendance rows
 * reference that child by id. So the law is neither "currently in service" nor "an agreement
 * exists":
 *
 *     visible ⇔ a service commitment exists at a reachable site that was not withdrawn
 *               before service began
 *
 * Every state is asserted here, including the two that are easy to get wrong by accident:
 * a child whose cancelled agreement sits at one site and whose ACTIVE one sits at another, and
 * the same child seen by an installation scoped only to the cancelled site.
 *
 * Skips without a certification environment and a running server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential } from "@/lib/platform/principal/applicationCredential";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const APP_URL = (process.env.CERT_APP_URL ?? "http://127.0.0.1:3018").replace(/\/+$/, "");
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";

/*
 * This suite creates its OWN two sites rather than borrowing the tenant's Riverside and Lakeside.
 * Sharing them raced `coreResources.live.test.ts`, which compares an unfiltered enrollment count
 * against a site-filtered one: rows this suite inserted landed between those two requests and the
 * narrowed count came back larger than the unnarrowed one. The suites are independent, so their
 * fixtures must be too.
 */
let SITE_A = "";
let SITE_B = "";

/** Every canonical agreement state, and whether it may publish a child. */
const LIFECYCLE: readonly { status: string; visible: boolean; because: string }[] = [
    { status: "pending_start", visible: true, because: "committed; partners need the roster before day one" },
    { status: "active", visible: true, because: "in service" },
    { status: "ending", visible: true, because: "still in service, with a known last day" },
    { status: "ended", visible: true, because: "served and concluded; attendance history still resolves" },
    { status: "canceled", visible: false, because: "withdrawn before service began; never a participant" },
];

const run = Date.now();
type Page = { data: Record<string, unknown>[] };

describeLive("External child visibility lifecycle", () => {
    let supabase: SupabaseClient;
    const applicationIds: string[] = [];
    const installationIds: string[] = [];
    const customerIds: string[] = [];
    const memberIds: string[] = [];
    const personIds: string[] = [];
    const locationIds: string[] = [];
    const creds = new Map<string, { clientId: string; secret: string }>();
    const tokens = new Map<string, string>();
    /** status -> the child created in that state. */
    const childByStatus = new Map<string, string>();
    let mixedChild = "";
    let householdByStatus = new Map<string, string>();

    async function makeInstallation(
        key: string,
        boundary: { mode: "org_wide" | "locations"; ids: string[] },
    ): Promise<void> {
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `vis-lifecycle-${key}-${run}`,
            p_name: `Visibility lifecycle ${key} ${run}`,
            p_publisher: "alloy-certification",
            p_ownership_mode: "alloy_managed",
            p_environment: "sandbox",
            p_distribution_mode: "private",
            p_status: "active",
            p_registered_by: "visibility-lifecycle-cert",
            p_metadata: {},
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        const applicationId = result.application!.id;
        applicationIds.push(applicationId);

        const inst = await supabase.from("app_installations").insert({
            application_id: applicationId,
            org_id: ORG,
            producer_key: `vis-lifecycle:${key}:${run}`,
            granted_scopes: ["children.read", "households.read", "relationships.read", "enrollment.read"],
            boundary_mode: boundary.mode,
            location_boundary: boundary.ids,
            status: "active",
        }).select("id").single();
        expect(inst.error, `installation insert: ${inst.error?.message}`).toBeNull();
        installationIds.push((inst.data as { id: string }).id);

        const issued = await issueCredential(supabase, { installationId: (inst.data as { id: string }).id, label: `vis ${key}` });
        expect(issued.ok, "credential issue").toBe(true);
        if (!issued.ok) throw new Error("credential issue failed");
        creds.set(key, { clientId: issued.issued.clientId, secret: issued.issued.clientSecret });
    }

    async function bearer(key: string): Promise<string> {
        const cached = tokens.get(key);
        if (cached) return cached;
        const c = creds.get(key)!;
        const res = await fetch(`${APP_URL}/api/v1/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.secret }),
        });
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token, `token exchange for ${key} (status ${res.status})`).toBeTruthy();
        tokens.set(key, body.access_token!);
        return body.access_token!;
    }

    async function get(key: string, path: string): Promise<Page> {
        const res = await fetch(`${APP_URL}${path}`, { headers: { authorization: `Bearer ${await bearer(key)}` } });
        const text = await res.text();
        expect(res.status, `${path} -> ${text.slice(0, 300)}`).toBe(200);
        return JSON.parse(text) as Page;
    }

    /** One household, one child, one person, one agreement in `status`. */
    async function makeChild(label: string, agreements: { site: string; status: string }[]): Promise<string> {
        const { data: maxC } = await supabase
            .from("customers").select("customer_number").eq("org_id", ORG)
            .order("customer_number", { ascending: false }).limit(1).maybeSingle();
        const nextCustomer = Number((maxC as { customer_number: number } | null)?.customer_number ?? 0) + 1;

        const cust = await supabase.from("customers")
            .insert({ org_id: ORG, name: `VIS-${label}-${run}`, customer_number: nextCustomer })
            .select("id").single();
        expect(cust.error, `customer insert: ${cust.error?.message}`).toBeNull();
        const customerId = (cust.data as { id: string }).id;
        customerIds.push(customerId);

        const member = await supabase.from("customer_members")
            .insert({ org_id: ORG, customer_id: customerId, display_name: `Vis ${label}`, is_active: true })
            .select("id").single();
        expect(member.error, `member insert: ${member.error?.message}`).toBeNull();
        const memberId = (member.data as { id: string }).id;
        memberIds.push(memberId);
        householdByStatus.set(label, customerId);

        const { data: maxP } = await supabase
            .from("persons").select("person_number").eq("org_id", ORG)
            .order("person_number", { ascending: false }).limit(1).maybeSingle();
        const person = await supabase.from("persons")
            .insert({
                org_id: ORG,
                person_number: Number((maxP as { person_number: number } | null)?.person_number ?? 0) + 1,
                first_name: "Vis", last_name: label,
            })
            .select("id").single();
        expect(person.error, `person insert: ${person.error?.message}`).toBeNull();
        const personId = (person.data as { id: string }).id;
        personIds.push(personId);

        await supabase.from("person_child_relationships").insert({
            org_id: ORG, customer_id: customerId, customer_member_id: memberId,
            person_id: personId, status: "active",
        });
        for (const a of agreements) {
            const ins = await supabase.from("child_enrollment_agreements").insert({
                org_id: ORG, customer_member_id: memberId, site_location_id: a.site, status: a.status,
            });
            expect(ins.error, `agreement insert (${a.status}): ${ins.error?.message}`).toBeNull();
        }
        return memberId;
    }

    async function makeSite(label: string): Promise<string> {
        const { data: maxL } = await supabase
            .from("locations").select("location_number").eq("org_id", ORG)
            .order("location_number", { ascending: false }).limit(1).maybeSingle();
        const inserted = await supabase.from("locations").insert({
            org_id: ORG,
            location_number: Number((maxL as { location_number: number } | null)?.location_number ?? 0) + 1,
            label: `VIS-${label}-${run}`,
            location_type: "site",
            is_active: true,
        }).select("id").single();
        expect(inserted.error, `site insert: ${inserted.error?.message}`).toBeNull();
        const id = (inserted.data as { id: string }).id;
        locationIds.push(id);
        return id;
    }

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        SITE_A = await makeSite("siteA");
        SITE_B = await makeSite("siteB");
        await makeInstallation("orgwide", { mode: "org_wide", ids: [] });
        await makeInstallation("siteAOnly", { mode: "locations", ids: [SITE_A] });

        for (const state of LIFECYCLE) {
            childByStatus.set(state.status, await makeChild(state.status, [{ site: SITE_A, status: state.status }]));
        }
        // Cancelled at Riverside, ACTIVE at Lakeside. Two independent commitments on one child.
        mixedChild = await makeChild("mixed", [
            { site: SITE_A, status: "canceled" },
            { site: SITE_B, status: "active" },
        ]);
    }, 180_000);

    afterAll(async () => {
        if (!supabase) return;
        for (const id of memberIds) {
            await supabase.from("child_enrollment_agreements").delete().eq("customer_member_id", id);
            await supabase.from("person_child_relationships").delete().eq("customer_member_id", id);
        }
        await supabase.from("customer_members").delete().in("id", memberIds.length ? memberIds : ["_"]);
        await supabase.from("persons").delete().in("id", personIds.length ? personIds : ["_"]);
        await supabase.from("customers").delete().in("id", customerIds.length ? customerIds : ["_"]);
        for (const id of installationIds) await supabase.from("app_installations").delete().eq("id", id);
        for (const id of applicationIds) await supabase.from("developer_applications").delete().eq("id", id);
        for (const id of locationIds) await supabase.from("locations").delete().eq("id", id);
    }, 120_000);

    for (const state of LIFECYCLE) {
        it(`publishes a child in '${state.status}': ${state.visible} — ${state.because}`, async () => {
            const child = childByStatus.get(state.status)!;
            const page = await get("orgwide", `/api/v1/children?child_id=${child}`);
            expect(page.data.length, `children in '${state.status}'`).toBe(state.visible ? 1 : 0);
        });

        it(`publishes the RELATIONSHIPS of a '${state.status}' child: ${state.visible}`, async () => {
            const child = childByStatus.get(state.status)!;
            const page = await get("orgwide", `/api/v1/relationships?child_id=${child}`);
            // The edge is visible exactly when its child is — never on a rule of its own.
            expect(page.data.length, `relationships in '${state.status}'`).toBe(state.visible ? 1 : 0);
        });

        it(`publishes the HOUSEHOLD of a '${state.status}' child: ${state.visible}`, async () => {
            const household = householdByStatus.get(state.status)!;
            const page = await get("orgwide", `/api/v1/households?household_id=${household}`);
            expect(page.data.length, `households in '${state.status}'`).toBe(state.visible ? 1 : 0);
        });
    }

    it("a cancellation at one site never hides a child who is in service at another", async () => {
        const page = await get("orgwide", `/api/v1/children?child_id=${mixedChild}`);
        expect(page.data.length).toBe(1);
    });

    it("a cancelled agreement grants no boundary reach of its own", async () => {
        // Site A holds ONLY the cancelled agreement; the active one is at site B. An
        // installation scoped to site A must not reach this child through the withdrawn one.
        const page = await get("siteAOnly", `/api/v1/children?child_id=${mixedChild}`);
        expect(page.data.length).toBe(0);
    });

    it("a child leaving visibility is observable on the enrollment lifecycle, not silent", async () => {
        // The one path by which visibility can END: a pending_start agreement is cancelled. A
        // partner must be able to learn that from a normal sync pass rather than notice a record
        // has quietly stopped appearing.
        const child = await makeChild("sync", [{ site: SITE_A, status: "pending_start" }]);
        expect((await get("orgwide", `/api/v1/children?child_id=${child}`)).data.length).toBe(1);

        const before = new Date(Date.now() - 1000).toISOString();
        const { error } = await supabase.from("child_enrollment_agreements")
            .update({ status: "canceled" }).eq("customer_member_id", child);
        expect(error, `cancel: ${error?.message}`).toBeNull();

        expect((await get("orgwide", `/api/v1/children?child_id=${child}`)).data.length).toBe(0);

        const enrollments = await get("orgwide", `/api/v1/enrollments?child_id=${child}&updated_since=${encodeURIComponent(before)}`);
        expect(enrollments.data.length, "the cancellation must arrive on a sync pass").toBe(1);
        expect(enrollments.data[0]?.status).toBe("canceled");
    }, 60_000);
});
