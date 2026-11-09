/**
 * Disconnect → reinstall, against a real database.
 *
 * Found by the Documents D9-H1 hosted rerun (qar_31100f9d04e5): the first run had
 * disconnected its installations, as the product does, and the second run could
 * not connect the same applications again. `uq_app_installations_app_org` counted
 * the revoked rows, so did the chooser's `alreadyInstalled`, and the default
 * producer key `<slug>:<org>` collided on `uq_app_installations_producer_key` too.
 *
 * What only the database can prove: a revoked installation frees its slot and is
 * kept; a live one (active OR suspended) still holds it; a reinstall may reuse its
 * predecessor's producer key; and under a race exactly one install wins.
 *
 * Skips silently without a certification environment, as the other live suites do.
 * It deletes only the rows it created.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listApprovedApplications } from "@/lib/platform/admin/integrationsService";
import { registerDeveloperApplication } from "@/lib/platform/developerPlatform/registerDeveloperApplication";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
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

const ORG = "00000000-0000-4000-8000-000000000001";
const run = Date.now();
const SLUG = `reinstall-cert-${run}`;
const ACTOR = `reinstall-live-${run}`;
const PRODUCER = `${SLUG}:${ORG}`;

describeLive("reinstall after disconnect (live)", () => {
    let supabase: SupabaseClient;
    let applicationId = "";

    async function cleanup() {
        const { data: app } = await supabase.from("developer_applications").select("id").eq("slug", SLUG).maybeSingle();
        if (app) await supabase.from("app_installations").delete().eq("application_id", (app as { id: string }).id);
        await supabase.from("app_security_audit").delete().eq("metadata->>registered_by", ACTOR);
        await supabase.from("developer_applications").delete().eq("slug", SLUG);
    }

    function install() {
        return supabase.from("app_installations")
            .insert({
                application_id: applicationId, org_id: ORG, granted_scopes: ["documents.read"],
                boundary_mode: "org_wide", location_boundary: [], producer_key: PRODUCER, status: "active",
            })
            .select("id")
            .maybeSingle();
    }

    async function setStatus(id: string, status: "active" | "suspended" | "revoked") {
        const now = new Date().toISOString();
        const patch = status === "revoked" ? { status, revoked_at: now }
            : status === "suspended" ? { status, suspended_at: now }
            : { status, suspended_at: null };
        return supabase.from("app_installations").update(patch).eq("id", id);
    }

    async function rows() {
        const { data } = await supabase.from("app_installations")
            .select("id, status, revoked_at, producer_key")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: true });
        return (data ?? []) as { id: string; status: string; revoked_at: string | null; producer_key: string }[];
    }

    async function chooserSaysInstalled() {
        const chooser = await listApprovedApplications(supabase, ORG);
        expect(chooser.ok).toBe(true);
        return chooser.ok ? chooser.applications.find((a) => a.slug === SLUG)?.alreadyInstalled : undefined;
    }

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        await cleanup();
        const reg = await registerDeveloperApplication(supabase, {
            slug: SLUG, name: "Reinstall Cert", publisher: "alloy-certification", registeredBy: ACTOR,
        });
        if (!reg.ok) throw new Error(`registration failed: ${JSON.stringify(reg)}`);
        applicationId = reg.application.id;
    });

    afterAll(async () => {
        await cleanup();
    });

    let first = "";
    let second = "";

    it("a second ACTIVE installation of the same application is refused", async () => {
        const a = await install();
        expect(a.error).toBeNull();
        first = (a.data as { id: string }).id;
        expect(await chooserSaysInstalled()).toBe(true);

        const dup = await install();
        expect(dup.error?.code).toBe("23505");
        // The deployed route maps this message to "already connected".
        expect(dup.error?.message).toMatch(/uq_app_installations_app_org|duplicate key/i);
    });

    it("a SUSPENDED installation still holds the slot", async () => {
        expect((await setStatus(first, "suspended")).error).toBeNull();
        expect(await chooserSaysInstalled()).toBe(true);
        expect((await install()).error?.code).toBe("23505");
        expect((await setStatus(first, "active")).error).toBeNull();
    });

    it("disconnect → reinstall: the revoked row is kept and a new installation reuses its producer key", async () => {
        expect((await setStatus(first, "revoked")).error).toBeNull();
        expect(await chooserSaysInstalled()).toBe(false);

        const b = await install();
        expect(b.error).toBeNull();
        second = (b.data as { id: string }).id;
        expect(second).not.toBe(first);
        expect(await chooserSaysInstalled()).toBe(true);

        const all = await rows();
        expect(all.map((r) => r.id)).toEqual([first, second]);
        expect(all[0].status).toBe("revoked");
        expect(all[0].revoked_at).not.toBeNull();
        expect(all[1].status).toBe("active");
        expect(new Set(all.map((r) => r.producer_key))).toEqual(new Set([PRODUCER]));
    });

    it("the revoked predecessor cannot be resurrected beside its successor (database backstop)", async () => {
        const back = await setStatus(first, "active");
        expect(back.error?.code).toBe("23505");
        expect((await rows())[0].status).toBe("revoked");
    });

    it("concurrent installs after a disconnect: exactly one wins", async () => {
        expect((await setStatus(second, "revoked")).error).toBeNull();
        const results = await Promise.all(Array.from({ length: 6 }, () => install()));
        const won = results.filter((r) => !r.error);
        const lost = results.filter((r) => r.error);
        expect(won).toHaveLength(1);
        expect(lost.map((r) => r.error?.code)).toEqual(Array(5).fill("23505"));

        const all = await rows();
        expect(all.filter((r) => r.status !== "revoked")).toHaveLength(1);
        expect(all.filter((r) => r.status === "revoked").map((r) => r.id)).toEqual([first, second]);
    });
});
