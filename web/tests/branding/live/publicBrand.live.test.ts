/**
 * S4 — shared public brand, certified against the REAL certification database (`alloy-cert`,
 * `.env.certification.local`), end to end through the public form resolve payload — the same
 * function the public form endpoint and page use — with a real hashed link token.
 *
 * Two throwaway organizations (removed afterwards), so the shared synthetic tenant's brand is
 * never touched and isolation can be measured across tenants.
 *
 * Proven:
 *   - an organization default applies at every inheriting location; a location override wins there
 *   - a form-specific override, frozen at publish, wins over the location
 *   - a draft branding edit does NOT change the published form; republishing does
 *   - a version published before snapshots existed still renders (live metadata), as before
 *   - another tenant's location id resolves nothing from that tenant
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string } | null {
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

import { dbPublishVersion } from "@/lib/admin/forms/formsAdminDb";
import { resolveLocationPublicBrand } from "@/lib/branding/loadPublicBrand";
import { writeLocationPublicBrand, writeOrganizationPublicBrand } from "@/lib/branding/writePublicBrand";
import { buildPublicFormResolvePayload } from "@/lib/public/forms/buildPublicFormResolvePayload";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

const RUN = `s4-${Date.now().toString(36)}`;
const SCHEMA = { schema_version: 1, title: "Intake", sections: [], fields: [] };
const PUBLISHER = randomUUID();

describeLive("S4 public brand — live certification database", () => {
    const db = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const orgIds: string[] = [];
    let orgA = "";
    let orgB = "";
    let locA1 = "";
    let locA2 = "";
    let locB1 = "";
    let formId = "";
    let tokenAtA1 = "";
    let tokenAtA2 = "";

    async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
        const { data, error } = await p;
        if (error) throw new Error(error.message);
        return data;
    }
    const id = (row: unknown) => (row as { id: string }).id;

    async function link(locationId: string): Promise<string> {
        const token = randomBytes(24).toString("base64url");
        await ok(
            db.from("form_public_links").insert({
                org_id: orgA,
                form_definition_id: formId,
                token_hash: hashFormLinkToken(token),
                metadata: { default_location_id: locationId, cert_run: RUN },
            })
        );
        return token;
    }
    async function brandAt(token: string) {
        const r = await buildPublicFormResolvePayload(db, token, null);
        if (!r.ok) throw new Error(`resolve failed: ${r.status} ${r.message}`);
        return (r.data as { brand: { accentColor: string; brandName: string | null; logoUrl: string | null } }).brand;
    }
    async function draftVersion(n: number): Promise<string> {
        return id(
            await ok(
                db
                    .from("form_definition_versions")
                    .insert({ org_id: orgA, form_definition_id: formId, version_number: n, status: "draft", schema_json: SCHEMA })
                    .select("id")
                    .single()
            )
        );
    }
    async function setFormBrand(meta: Record<string, unknown>) {
        await ok(db.from("form_definitions").update({ metadata: { cert_run: RUN, ...meta } }).eq("id", formId));
    }

    beforeAll(async () => {
        orgA = id(await ok(db.from("orgs").insert({ name: `ZZ ${RUN} A`, slug: `zz-${RUN}-a` }).select("id").single()));
        orgB = id(await ok(db.from("orgs").insert({ name: `ZZ ${RUN} B`, slug: `zz-${RUN}-b` }).select("id").single()));
        orgIds.push(orgA, orgB);
        locA1 = id(await ok(db.from("locations").insert({ org_id: orgA, label: `ZZ ${RUN} A1` }).select("id").single()));
        locA2 = id(await ok(db.from("locations").insert({ org_id: orgA, label: `ZZ ${RUN} A2` }).select("id").single()));
        locB1 = id(await ok(db.from("locations").insert({ org_id: orgB, label: `ZZ ${RUN} B1` }).select("id").single()));
        formId = id(
            await ok(
                db
                    .from("form_definitions")
                    .insert({ org_id: orgA, key: `zz-${RUN}`, name: `ZZ ${RUN}`, kind: "center", metadata: { accent_color: "#00A283" } })
                    .select("id")
                    .single()
            )
        );
        tokenAtA1 = await link(locA1);
        tokenAtA2 = await link(locA2);
    }, 60_000);

    afterAll(async () => {
        for (const org of orgIds) {
            await db.from("form_public_links").delete().eq("org_id", org);
            await db.from("form_definitions").delete().eq("org_id", org);
            await db.from("locations").delete().eq("org_id", org);
            await db.from("org_settings").delete().eq("org_id", org);
            const { error } = await db.from("orgs").delete().eq("id", org);
            if (error) throw new Error(`cert org ${org} not removed: ${error.message}`);
        }
    }, 60_000);

    it("a version published before snapshots existed renders from live metadata, as it always did", async () => {
        // Simulate the pre-S4 publish: no brand snapshot on the version.
        const v1 = await draftVersion(1);
        await ok(
            db
                .from("form_definition_versions")
                .update({ status: "published", published_at: new Date().toISOString(), published_by_user_id: PUBLISHER })
                .eq("id", v1)
        );
        await setFormBrand({ accent_color: "#7C3AED", brand_name: "Legacy Brand" });
        expect(await brandAt(tokenAtA1)).toMatchObject({ accentColor: "#7C3AED", brandName: "Legacy Brand" });
        // Legacy behaviour retained: live metadata, so a draft edit still shows until the next publish.
        await setFormBrand({ accent_color: "#00A283" });
        expect((await brandAt(tokenAtA1)).accentColor).toBe("#00A283");
    });

    it("the organization default applies at every inheriting location", async () => {
        expect((await writeOrganizationPublicBrand(db, orgA, { display_name: "Sunrise", accent_color: "#1F6FEB", logo_url: null })).ok).toBe(true);
        for (const token of [tokenAtA1, tokenAtA2]) {
            expect(await brandAt(token)).toMatchObject({ accentColor: "#1F6FEB", brandName: "Sunrise" });
        }
    });

    it("a location override wins at that location only", async () => {
        expect((await writeLocationPublicBrand(db, orgA, locA1, { display_name: null, accent_color: "#B91C1C", logo_url: null })).ok).toBe(true);
        expect(await brandAt(tokenAtA1)).toMatchObject({ accentColor: "#B91C1C", brandName: "Sunrise" });
        expect(await brandAt(tokenAtA2)).toMatchObject({ accentColor: "#1F6FEB", brandName: "Sunrise" });
    });

    it("a published form override wins; a draft edit does not restyle it; republishing does", async () => {
        await setFormBrand({ brand_source: "form", accent_color: "#7C3AED", brand_name: "Summer Camp" });
        const v2 = await draftVersion(2);
        const pub = await dbPublishVersion(db, orgA, v2, PUBLISHER);
        expect(pub.error).toBeNull();
        const snap = (pub.data as { metadata: Record<string, unknown> }).metadata.brand_snapshot_v1 as Record<string, unknown>;
        expect(snap).toMatchObject({ brand_source: "form", accent_color: "#7C3AED", brand_name: "Summer Camp" });
        expect(await brandAt(tokenAtA1)).toMatchObject({ accentColor: "#7C3AED", brandName: "Summer Camp" });

        // Draft edit: the live definition changes, the published appearance does not.
        await setFormBrand({ brand_source: "form", accent_color: "#0F766E", brand_name: "Draft Name" });
        expect(await brandAt(tokenAtA1)).toMatchObject({ accentColor: "#7C3AED", brandName: "Summer Camp" });

        // Republish: now it does.
        const v3 = await draftVersion(3);
        expect((await dbPublishVersion(db, orgA, v3, PUBLISHER)).error).toBeNull();
        expect(await brandAt(tokenAtA1)).toMatchObject({ accentColor: "#0F766E", brandName: "Draft Name" });

        // "Use the school's branding", published: back to location → organization.
        await setFormBrand({ brand_source: "inherit", accent_color: "#0F766E", brand_name: "Draft Name" });
        const v4 = await draftVersion(4);
        expect((await dbPublishVersion(db, orgA, v4, PUBLISHER)).error).toBeNull();
        expect(await brandAt(tokenAtA1)).toMatchObject({ accentColor: "#B91C1C", brandName: "Sunrise" });
    });

    it("tenant isolation: another org's location contributes nothing", async () => {
        expect((await writeLocationPublicBrand(db, orgB, locB1, { display_name: "Other Tenant", accent_color: "#111111", logo_url: null })).ok).toBe(true);
        // Org A asking about org B's location gets org A's own default, nothing of B's.
        const crossed = await resolveLocationPublicBrand(db, { orgId: orgA, locationId: locB1 });
        expect(crossed).toMatchObject({ displayName: "Sunrise", accentColor: "#1F6FEB" });
        expect(crossed.sources.accentColor).toBe("organization");
        // And a write naming another org's location is refused.
        expect(await writeLocationPublicBrand(db, orgA, locB1, { display_name: "Hijack", accent_color: null, logo_url: null })).toMatchObject({
            ok: false,
            status: 404,
        });
        const b = await resolveLocationPublicBrand(db, { orgId: orgB, locationId: locB1 });
        expect(b.displayName).toBe("Other Tenant");
    });

    it("the tour page brand (same resolver) follows location → organization", async () => {
        expect(await resolveLocationPublicBrand(db, { orgId: orgA, locationId: locA1 })).toMatchObject({ accentColor: "#B91C1C", displayName: "Sunrise" });
        expect(await resolveLocationPublicBrand(db, { orgId: orgA, locationId: locA2 })).toMatchObject({ accentColor: "#1F6FEB", displayName: "Sunrise" });
    });
});
