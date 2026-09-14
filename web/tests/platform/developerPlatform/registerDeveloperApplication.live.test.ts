/**
 * Developer application registration, against a real database.
 *
 * The unit contract lives in the toolkit test; what can only be proven here is
 * everything the SQL function owns — the duplicate/retry contract, the audit
 * row, and the fact that registering an identity creates NOTHING else. The last
 * one is the load-bearing claim of the whole slice: if registration quietly
 * created an installation, the mounted certification that follows would be
 * exercising a fixture instead of the product flow.
 *
 * Skips silently without a certification environment, exactly as the other live
 * suites do, so a developer without the local stack is not told they broke it.
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
const ACTIVE = `reg-cert-active-${run}`;
const DISABLED = `reg-cert-disabled-${run}`;
const PROD = `reg-cert-prod-${run}`;
const REFUSED = `reg-cert-refused-${run}`;
const ACTOR = `registration-live-${run}`;

describeLive("developer application registration (live)", () => {
    let supabase: SupabaseClient;
    const slugs = [ACTIVE, DISABLED, PROD, REFUSED];

    async function cleanup() {
        await supabase.from("app_security_audit").delete().eq("metadata->>registered_by", ACTOR);
        for (const slug of slugs) {
            await supabase.from("developer_applications").delete().eq("slug", slug);
        }
    }

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        await cleanup();
    });

    afterAll(async () => {
        await cleanup();
    });

    it("registers one active sandbox application through the canonical authority", async () => {
        const result = await registerDeveloperApplication(supabase, {
            slug: ACTIVE, name: "Registration Cert Active", publisher: "alloy-certification",
            registeredBy: ACTOR,
        });
        expect(result.ok, JSON.stringify(result)).toBe(true);
        if (!result.ok) return;
        expect(result.duplicate).toBe(false);
        expect(result.application.ownership_mode).toBe("alloy_managed");
        expect(result.application.environment).toBe("sandbox");
        expect(result.application.distribution_mode).toBe("private");
        expect(result.application.status).toBe("active");
        expect(result.auditId).toBeTruthy();
    });

    it("writes durable audit provenance naming the application and the actor", async () => {
        const { data } = await supabase.from("app_security_audit")
            .select("event_type, outcome, application_id, metadata")
            .eq("event_type", "application.registered")
            .eq("metadata->>slug", ACTIVE)
            .single();
        expect(data?.outcome).toBe("allowed");
        expect(data?.application_id).toBeTruthy();
        const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
        expect(metadata.registered_by).toBe(ACTOR);
        expect(metadata.ownership_mode).toBe("alloy_managed");
        // Platform scope: a global identity belongs to no organization, and the
        // audit says so rather than borrowing one.
        const { data: row } = await supabase.from("app_security_audit")
            .select("org_id, installation_id").eq("metadata->>slug", ACTIVE).single();
        expect(row?.org_id).toBeNull();
        expect(row?.installation_id).toBeNull();
    });

    it("creates no installation and no credential", async () => {
        const { data: app } = await supabase.from("developer_applications")
            .select("id").eq("slug", ACTIVE).single();
        const installs = await supabase.from("app_installations")
            .select("id", { count: "exact", head: true }).eq("application_id", app!.id);
        expect(installs.count ?? 0).toBe(0);
        // No installation means no credential can exist: credentials hang off an
        // installation, so the count is over the whole table for this run.
        const creds = await supabase.from("app_credentials")
            .select("id", { count: "exact", head: true }).like("label", `%${run}%`);
        expect(creds.count ?? 0).toBe(0);
    });

    it("is idempotent for a retry that asks for the state already on disk", async () => {
        const again = await registerDeveloperApplication(supabase, {
            slug: ACTIVE, name: "Registration Cert Active", publisher: "alloy-certification",
            registeredBy: ACTOR,
        });
        expect(again.ok).toBe(true);
        if (!again.ok) return;
        expect(again.duplicate).toBe(true);
        // A duplicate is not a second registration: no new audit row is written.
        const { count } = await supabase.from("app_security_audit")
            .select("id", { count: "exact", head: true })
            .eq("event_type", "application.registered").eq("metadata->>slug", ACTIVE);
        expect(count).toBe(1);
    });

    it("refuses a different shape under a key that already exists", async () => {
        const conflict = await registerDeveloperApplication(supabase, {
            slug: ACTIVE, name: "Registration Cert Renamed", publisher: "alloy-certification",
            registeredBy: ACTOR,
        });
        expect(conflict.ok).toBe(false);
        if (conflict.ok) return;
        expect(conflict.code).toBe("duplicate_slug_conflict");
        expect(conflict.existing?.name).toBe("Registration Cert Active");
    });

    it("refuses tenant_private and partner_managed by name, and records the attempt", async () => {
        for (const mode of ["tenant_private", "partner_managed"]) {
            const { data } = await supabase.rpc("register_developer_application", {
                p_slug: REFUSED, p_name: "Registration Cert Refused", p_publisher: "alloy-certification",
                p_ownership_mode: mode, p_environment: "sandbox", p_distribution_mode: "private",
                p_status: "active", p_registered_by: ACTOR, p_metadata: {},
            });
            const result = data as Record<string, unknown>;
            expect(result.ok).toBe(false);
            expect(result.code).toBe("unsupported_ownership_mode");
            expect(String(result.detail)).toMatch(/alloy_managed only/);
        }
        const { count } = await supabase.from("developer_applications")
            .select("id", { count: "exact", head: true }).eq("slug", REFUSED);
        expect(count ?? 0).toBe(0);
        // The refusal is provenance: this is the row the ownership debt will be
        // reopened from.
        const { data: denied } = await supabase.from("app_security_audit")
            .select("outcome, reason_code, metadata")
            .eq("event_type", "application.registered")
            .eq("metadata->>requested_slug", REFUSED);
        expect(denied?.length).toBe(2);
        expect(denied?.every((r) => r.outcome === "denied")).toBe(true);
        expect(denied?.every((r) => r.reason_code === "unsupported_ownership_mode")).toBe(true);
    });

    it("registers a production application when one is asked for", async () => {
        const result = await registerDeveloperApplication(supabase, {
            slug: PROD, name: "Registration Cert Production", publisher: "alloy-certification",
            environment: "production", registeredBy: ACTOR,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.application.environment).toBe("production");
    });

    it("shows an active application in the canonical chooser and hides a disabled one", async () => {
        const disabled = await registerDeveloperApplication(supabase, {
            slug: DISABLED, name: "Registration Cert Disabled", publisher: "alloy-certification",
            status: "disabled", registeredBy: ACTOR,
        });
        expect(disabled.ok).toBe(true);

        const chooser = await listApprovedApplications(supabase, ORG);
        expect(chooser.ok).toBe(true);
        if (!chooser.ok) return;
        const slugsOffered = chooser.applications.map((a) => a.slug);
        expect(slugsOffered).toContain(ACTIVE);
        // `status = 'active'` is the whole eligibility rule, so a disabled
        // application must be absent rather than merely marked.
        expect(slugsOffered).not.toContain(DISABLED);

        const offered = chooser.applications.find((a) => a.slug === ACTIVE);
        expect(offered?.status).toBe("active");
        // Nothing was installed, so the chooser must not claim otherwise.
        expect(offered?.alreadyInstalled).toBe(false);
    });
});
