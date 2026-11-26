/**
 * Boundary resolution at scale, proven against a real organization rather than a stub.
 *
 * ── WHY THIS NEEDED A FIXTURE THIS LARGE ──
 *
 * `resolveBoundarySites` asked `list_external_locations` for one page of 200 and treated it as the
 * whole answer. Every resource on the public API resolves its territory through that function, so
 * an organization with 201 locations would have had its 201st silently dropped from its own
 * boundary — and the symptom would have been "a site's data is missing", not "there is a limit".
 *
 * No existing tenant is near the cap, which is exactly why the defect survived: a test written
 * against real data could not see it. So this suite builds an organization with 250 sites, proves
 * the resolver returns all 250, and takes it away again.
 *
 * The cases below are chosen around the page edge, because off-by-one at a page boundary is the
 * failure this class of bug actually produces: 199 fits in one page, 200 fills it exactly and must
 * still check for a second, 201 needs two, and 250 proves the loop continues rather than doubling.
 *
 * Skips without a certification environment.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveBoundarySites } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

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
const describeLive = env ? describe : describe.skip;

const MAIN_ORG = "00000000-0000-4000-8000-000000000001";
const SITE_COUNT = 250;
const run = Date.now();

/** Only the fields the resolver actually reads. Nothing here grants anything. */
function principal(orgId: string, boundary: ApplicationPrincipal["boundary"]): ApplicationPrincipal {
    return {
        kind: "application",
        applicationId: "00000000-0000-4000-8000-0000000000aa",
        applicationSlug: `boundary-paging-${run}`,
        ownershipMode: "alloy_managed",
        environment: "sandbox",
        installationId: "00000000-0000-4000-8000-0000000000bb",
        orgId,
        producerKey: `boundary-paging:${run}`,
        grantedScopes: ["locations.read"],
        boundary,
        // Through `unknown`: this literal is deliberately only the fields the resolver reads,
        // so it does not structurally overlap the full principal and TypeScript is right to say so.
    } as unknown as ApplicationPrincipal;
}

describeLive("boundary resolution pages to exhaustion", () => {
    let supabase: SupabaseClient;
    let scratchOrg = "";
    let siteIds: string[] = [];

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });

        const org = await supabase.from("orgs").insert({
            name: `Boundary paging certification ${run}`,
            slug: `boundary-paging-cert-${run}`,
        }).select("id").single();
        expect(org.error, `scratch org: ${org.error?.message}`).toBeNull();
        scratchOrg = (org.data as { id: string }).id;

        // 250 sites, inserted in batches so one statement does not carry the whole fixture.
        for (let base = 0; base < SITE_COUNT; base += 50) {
            const batch = Array.from({ length: Math.min(50, SITE_COUNT - base) }, (_, i) => ({
                org_id: scratchOrg,
                location_type: "site",
                label: `Paging site ${String(base + i).padStart(3, "0")}`,
                is_active: true,
            }));
            const inserted = await supabase.from("locations").insert(batch).select("id");
            expect(inserted.error, `sites ${base}: ${inserted.error?.message}`).toBeNull();
            siteIds.push(...(inserted.data as { id: string }[]).map((r) => r.id));
        }
        expect(siteIds).toHaveLength(SITE_COUNT);
    }, 180_000);

    afterAll(async () => {
        if (!supabase || !scratchOrg) return;
        await supabase.from("locations").delete().eq("org_id", scratchOrg);
        await supabase.from("orgs").delete().eq("id", scratchOrg);
    }, 180_000);

    const sitesFor = async (orgId: string, boundary: ApplicationPrincipal["boundary"]) => {
        const result = await resolveBoundarySites(supabase, principal(orgId, boundary));
        expect(result.ok, "resolution must succeed").toBe(true);
        return result.ok ? result.siteIds : [];
    };

    it("resolves an organization larger than one page — the defect this repairs", async () => {
        const resolved = await sitesFor(scratchOrg, { mode: "org_wide" });
        // Before the repair this returned 200 and called it the whole boundary.
        expect(resolved).toHaveLength(SITE_COUNT);
        expect(new Set(resolved).size, "a paged resolver must not repeat a site").toBe(SITE_COUNT);
        expect(new Set(resolved)).toEqual(new Set(siteIds));
    }, 120_000);

    it("resolves a boundary of exactly one full page, and checks for a second", async () => {
        // The dangerous arity: page one is full, so a resolver that stops on a full page would be
        // right by accident here and wrong at 201.
        const resolved = await sitesFor(scratchOrg, { mode: "locations", locationIds: siteIds.slice(0, 200) });
        expect(resolved).toHaveLength(200);
    }, 120_000);

    it("resolves one more than a page", async () => {
        const resolved = await sitesFor(scratchOrg, { mode: "locations", locationIds: siteIds.slice(0, 201) });
        expect(resolved).toHaveLength(201);
    }, 120_000);

    it("resolves one less than a page", async () => {
        const resolved = await sitesFor(scratchOrg, { mode: "locations", locationIds: siteIds.slice(0, 199) });
        expect(resolved).toHaveLength(199);
    }, 120_000);

    it("resolves a small restricted boundary", async () => {
        const resolved = await sitesFor(scratchOrg, { mode: "locations", locationIds: siteIds.slice(0, 5) });
        expect(new Set(resolved)).toEqual(new Set(siteIds.slice(0, 5)));
    }, 120_000);

    it("resolves an empty boundary to nothing, and never to everything", async () => {
        const resolved = await sitesFor(scratchOrg, { mode: "locations", locationIds: [] });
        expect(resolved).toHaveLength(0);
    }, 120_000);

    it("does not leak across organizations in either direction", async () => {
        const scratch = new Set(await sitesFor(scratchOrg, { mode: "org_wide" }));
        const main = new Set(await sitesFor(MAIN_ORG, { mode: "org_wide" }));

        expect(main.size, "the main tenant must still resolve").toBeGreaterThan(0);
        for (const id of scratch) expect(main.has(id), "a scratch site reached the main tenant").toBe(false);
        for (const id of main) expect(scratch.has(id), "a main site reached the scratch tenant").toBe(false);

        // Naming another organization's sites in a boundary resolves to nothing — the boundary is
        // filtered by organization inside the SQL, so a foreign id is not a key to anything.
        const foreign = await sitesFor(MAIN_ORG, { mode: "locations", locationIds: siteIds.slice(0, 10) });
        expect(foreign).toHaveLength(0);
    }, 120_000);

    it("is deterministic across repeated resolutions", async () => {
        const a = await sitesFor(scratchOrg, { mode: "org_wide" });
        const b = await sitesFor(scratchOrg, { mode: "org_wide" });
        expect([...a].sort()).toEqual([...b].sort());
    }, 120_000);

    it("the main tenant is unaffected by the repair", async () => {
        const resolved = await sitesFor(MAIN_ORG, { mode: "org_wide" });
        const sites = await supabase
            .from("locations").select("id").eq("org_id", MAIN_ORG).eq("location_type", "site");
        expect(new Set(resolved)).toEqual(new Set((sites.data as { id: string }[]).map((r) => r.id)));
    }, 120_000);
});
