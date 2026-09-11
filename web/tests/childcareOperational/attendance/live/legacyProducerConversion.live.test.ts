/**
 * Gate 1 Steps 10–11 — a real producer converts, and the converted installation
 * authors attendance that keeps the original provenance.
 *
 * This is the claim the conversion exists to support: a producer becomes an
 * installation, and the facts it authored BEFORE the conversion and AFTER it
 * carry the same `source_key`. If that were not true, converting would silently
 * fork one integration's history into two.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyConversion, planConversion } from "@/lib/platform/admin/convertLegacyProducer";
import { hashProducerCredential } from "@/lib/childcareOperational/attendance/integration/producerAuthority";
import { ingestExternalAttendanceEvent } from "@/lib/childcareOperational/attendance/integration/ingestExternalAttendance";
import { attendanceAuthorForPrincipal } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../../.env.certification.local"), "utf8");
        const read = (k: string) => file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch { return null; }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const ROOM_A = "00000000-0000-4000-8000-000000000013";
const AGREEMENT = "00000000-0000-4000-8000-000070000060";
const CHILD = "00000000-0000-4000-8000-000070000050";

const run = Date.now();
const PROVIDER = `conv_cert_${run}`;
const PRODUCER_KEY = `integration:conv:${run}`;
const SECRET = `conv-secret-${run}`;
const TODAY = new Date().toISOString().slice(0, 10);

describeLive("legacy producer conversion — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let producerId = "";
    let installationId = "";
    let applicationId = "";

    async function cleanup() {
        if (installationId) {
            await supabase.from("attendance_integration_events").delete().eq("installation_id", installationId);
            await supabase.from("integration_resource_refs").delete().eq("installation_id", installationId);
            await supabase.from("app_installations").delete().eq("id", installationId);
        }
        if (producerId) {
            await supabase.from("attendance_integration_events").delete().eq("producer_id", producerId);
            await supabase.from("attendance_integration_mappings").delete().eq("producer_id", producerId);
            await supabase.from("attendance_integration_producer_sites").delete().eq("producer_id", producerId);
            await supabase.from("attendance_integration_producers").delete().eq("id", producerId);
        }
        await supabase.from("developer_applications").delete().eq("slug", `legacy-conv-cert-${run}`);
    }

    beforeAll(async () => {
        await cleanup();
        const p = await supabase.from("attendance_integration_producers").insert({
            org_id: ORG, provider_key: PROVIDER, producer_key: PRODUCER_KEY, label: "Conversion cert",
            capabilities: ["attendance.record"], credential_hash: hashProducerCredential(SECRET),
            credential_last_four: SECRET.slice(-4), status: "active",
        }).select("id").single();
        expect(p.error, `producer insert: ${p.error?.message}`).toBeNull();
        producerId = (p.data as { id: string }).id;

        const s = await supabase.from("attendance_integration_producer_sites")
            .insert({ org_id: ORG, producer_id: producerId, site_location_id: RIVERSIDE });
        expect(s.error, `site insert: ${s.error?.message}`).toBeNull();

        const m = await supabase.from("attendance_integration_mappings").insert([
            { org_id: ORG, producer_id: producerId, external_entity_type: "child", external_id: "CONV-CHILD-1", child_customer_member_id: CHILD, status: "active" },
            { org_id: ORG, producer_id: producerId, external_entity_type: "location", external_id: "CONV-ROOM-A", location_id: ROOM_A, status: "active" },
        ]);
        expect(m.error, `mapping insert: ${m.error?.message}`).toBeNull();
    }, 120_000);

    afterAll(async () => { await cleanup(); }, 120_000);

    /** The fact the producer authors BEFORE conversion. */
    it("the legacy producer authors a fact under its producer key", async () => {
        const out = await ingestExternalAttendanceEvent({
            supabase, providerKey: PROVIDER, presentedCredential: SECRET,
            event: {
                externalEventId: `conv-evt-${run}-pre`, eventKind: "check_in",
                externalChildId: "CONV-CHILD-1", externalRoomId: "CONV-ROOM-A",
                physicalEventAt: `${TODAY}T08:00:00.000Z`, raw: {},
            },
        });
        expect(out.disposition, JSON.stringify(out)).toBe("applied");
    }, 120_000);

    it("converts into exactly one installation, carrying the same producer key", async () => {
        const [prod, sites, maps] = await Promise.all([
            supabase.from("attendance_integration_producers").select("*").eq("id", producerId).single(),
            supabase.from("attendance_integration_producer_sites").select("producer_id, site_location_id").eq("producer_id", producerId),
            supabase.from("attendance_integration_mappings").select("producer_id, external_entity_type, external_id, child_customer_member_id, location_id, status").eq("producer_id", producerId),
        ]);
        const decision = planConversion({
            producer: prod.data as never,
            sites: (sites.data ?? []) as never,
            mappings: (maps.data ?? []) as never,
        });
        expect(decision.ok, JSON.stringify(decision)).toBe(true);
        if (!decision.ok) return;
        expect(decision.plan.locationBoundary).toEqual([RIVERSIDE]);
        expect(decision.plan.carriesCredential).toBe(false);

        const applied = await applyConversion(supabase, decision.plan);
        expect(applied.ok, JSON.stringify(applied)).toBe(true);
        if (!applied.ok) return;
        expect(applied.created).toBe(true);
        installationId = applied.installationId;

        const inst = await supabase.from("app_installations").select("producer_key, application_id, location_boundary").eq("id", installationId).single();
        expect((inst.data as { producer_key: string }).producer_key).toBe(PRODUCER_KEY);
        applicationId = (inst.data as { application_id: string }).application_id;
    }, 120_000);

    it("re-running the conversion creates no second installation", async () => {
        const [prod, sites, maps] = await Promise.all([
            supabase.from("attendance_integration_producers").select("*").eq("id", producerId).single(),
            supabase.from("attendance_integration_producer_sites").select("producer_id, site_location_id").eq("producer_id", producerId),
            supabase.from("attendance_integration_mappings").select("producer_id, external_entity_type, external_id, child_customer_member_id, location_id, status").eq("producer_id", producerId),
        ]);
        const decision = planConversion({ producer: prod.data as never, sites: (sites.data ?? []) as never, mappings: (maps.data ?? []) as never });
        if (!decision.ok) return;
        const again = await applyConversion(supabase, decision.plan);
        expect(again.ok).toBe(true);
        if (!again.ok) return;
        expect(again.created).toBe(false);
        expect(again.installationId).toBe(installationId);
        // And no duplicate refs either.
        expect(again.refsWritten).toBe(0);

        const all = await supabase.from("app_installations").select("id").eq("org_id", ORG).eq("producer_key", PRODUCER_KEY);
        expect((all.data ?? []).length).toBe(1);
    }, 120_000);

    it("the mappings became resource refs, one per external id", async () => {
        const refs = await supabase.from("integration_resource_refs").select("resource_type, external_id").eq("installation_id", installationId);
        const got = (refs.data ?? []) as Array<{ resource_type: string; external_id: string }>;
        expect(got.map((r) => r.external_id).sort()).toEqual(["CONV-CHILD-1", "CONV-ROOM-A"]);
    }, 120_000);

    it("the converted installation authors a fact with the SAME provenance", async () => {
        const principal: ApplicationPrincipal = {
            kind: "application", applicationId, applicationSlug: `legacy-${PROVIDER.replace(/_/g, "-")}`,
            ownershipMode: "tenant_private", environment: "production",
            installationId, orgId: ORG, producerKey: PRODUCER_KEY,
            credentialId: "cred-conv", clientId: `alloy_app_conv_${run}`,
            grantedScopes: ["attendance.write"],
            boundary: { mode: "locations", locationIds: [RIVERSIDE] },
        };
        const a = await attendanceAuthorForPrincipal(supabase, principal);
        expect(a.ok, JSON.stringify(a)).toBe(true);
        if (!a.ok) return;

        const out = await ingestExternalAttendanceEvent({
            supabase, providerKey: PROVIDER, author: a.author,
            event: {
                externalEventId: `conv-evt-${run}-post`, eventKind: "check_out",
                externalChildId: "CONV-CHILD-1", externalRoomId: "CONV-ROOM-A",
                physicalEventAt: `${TODAY}T15:00:00.000Z`, raw: {},
            },
        });
        expect(out.disposition, JSON.stringify(out)).toBe("applied");

        // THE POINT: before and after the conversion, one author.
        const events = await listAttendanceEvents(supabase, ORG, { enrollmentAgreementId: AGREEMENT });
        const mine = events.filter((e) => e.source_key === PRODUCER_KEY);
        expect(mine.length).toBeGreaterThanOrEqual(2);
    }, 120_000);

    it("the converted installation holds no credential it did not earn", async () => {
        const creds = await supabase.from("app_credentials").select("id").eq("installation_id", installationId);
        expect((creds.data ?? []).length).toBe(0);
    }, 120_000);
});
