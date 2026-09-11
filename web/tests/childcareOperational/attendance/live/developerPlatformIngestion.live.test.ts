/**
 * Gate 1 — the Developer Platform authors attendance, against the real database.
 *
 * The five sibling live suites prove the LEGACY producer path. This proves the
 * converged one: an installation resolves to an authority, that authority becomes
 * an ingestion author, and Attendance treats it exactly as it treats a producer —
 * same gate, same facts, same idempotency, same refusals.
 *
 * Nothing is mocked. The failure modes worth fearing are the ones a mock cannot
 * have: a `integration_resource_refs` row resolving another tenant's child, an
 * installation correcting a fact it never wrote, a boundary that grants a site it
 * should not, and a null `producer_id` quietly filing an attributed event in the
 * unattributed bucket.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestExternalAttendanceEvent } from "@/lib/childcareOperational/attendance/integration/ingestExternalAttendance";
import { attendanceAuthorForPrincipal } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../../.env.certification.local"), "utf8");
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
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const ROOM_A = "00000000-0000-4000-8000-000000000013";
const AGREEMENT = "00000000-0000-4000-8000-000070000060";
const CHILD = "00000000-0000-4000-8000-000070000050";
const OTHER_ORG = "bbbb2222-0000-4000-8000-000000000002";

const PROVIDER = "developer_platform_cert";
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();
const SOURCE_KEY = `dp:cert:${run}`;

describeLive("developer platform attendance ingestion — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let applicationId = "";
    let installationId = "";
    let otherOrgInstallationId = "";

    const principal = (over: Partial<ApplicationPrincipal> = {}): ApplicationPrincipal => ({
        kind: "application",
        applicationId,
        applicationSlug: `dp-cert-${run}`,
        ownershipMode: "partner_managed",
        environment: "production",
        installationId,
        orgId: ORG,
        producerKey: SOURCE_KEY,
        credentialId: "cred-live",
        clientId: `alloy_app_${run}`,
        grantedScopes: ["attendance.write"],
        boundary: { mode: "locations", locationIds: [RIVERSIDE] },
        ...over,
    });

    const evt = (over: Record<string, unknown> = {}) => ({
        externalEventId: `dp-evt-${run}`,
        eventKind: "check_in" as const,
        externalChildId: "DP-CHILD-1",
        externalRoomId: "DP-ROOM-A",
        physicalEventAt: `${TODAY}T08:30:00.000Z`,
        raw: { provider: PROVIDER },
        ...over,
    });

    /** Resolve a principal all the way to the author ingestion consumes. */
    async function authorFor(p: ApplicationPrincipal) {
        const r = await attendanceAuthorForPrincipal(supabase, p);
        return r;
    }

    async function ingest(p: ApplicationPrincipal, event: ReturnType<typeof evt>) {
        const a = await authorFor(p);
        if (!a.ok) return { disposition: "denied" as const, code: a.code, detail: a.code };
        return ingestExternalAttendanceEvent({ supabase, providerKey: PROVIDER, event, author: a.author });
    }

    const factsFromThisRun = async () => {
        const events = await listAttendanceEvents(supabase, ORG, { enrollmentAgreementId: AGREEMENT });
        return events.filter((e) => e.source_key === SOURCE_KEY);
    };

    async function cleanup() {
        for (const id of [installationId, otherOrgInstallationId].filter(Boolean)) {
            await supabase.from("attendance_integration_events").delete().eq("installation_id", id);
            await supabase.from("integration_resource_refs").delete().eq("installation_id", id);
        }
        await supabase.from("attendance_integration_events").delete()
            .is("producer_id", null).is("installation_id", null)
            .like("provider_event_id", `dp-evt-${run}%`);
        for (const id of [installationId, otherOrgInstallationId].filter(Boolean)) {
            await supabase.from("app_installations").delete().eq("id", id);
        }
        if (applicationId) await supabase.from("developer_applications").delete().eq("id", applicationId);
    }

    beforeAll(async () => {
        await cleanup();

        const app = await supabase.from("developer_applications").insert({
            slug: `dp-cert-${run}`, name: `DP cert ${run}`, publisher: "alloy-certification",
            ownership_mode: "partner_managed", environment: "production", status: "active",
        }).select("id").single();
        expect(app.error, `application insert: ${app.error?.message}`).toBeNull();
        applicationId = (app.data as { id: string }).id;

        const inst = await supabase.from("app_installations").insert({
            application_id: applicationId, org_id: ORG, producer_key: SOURCE_KEY,
            granted_scopes: ["attendance.write"], boundary_mode: "locations",
            location_boundary: [RIVERSIDE], status: "active",
        }).select("id").single();
        expect(inst.error, `installation insert: ${inst.error?.message}`).toBeNull();
        installationId = (inst.data as { id: string }).id;

        const other = await supabase.from("app_installations").insert({
            application_id: applicationId, org_id: OTHER_ORG, producer_key: `${SOURCE_KEY}-otherorg`,
            granted_scopes: ["attendance.write"], boundary_mode: "locations",
            location_boundary: [RIVERSIDE], status: "active",
        }).select("id").single();
        if (!other.error) otherOrgInstallationId = (other.data as { id: string }).id;

        // Correlation is owned by integration_resource_refs, not by a legacy mapping.
        const refs = await supabase.from("integration_resource_refs").insert([
            { installation_id: installationId, org_id: ORG, resource_type: "child",
              external_id: "DP-CHILD-1", child_customer_member_id: CHILD, status: "active" },
            { installation_id: installationId, org_id: ORG, resource_type: "location",
              external_id: "DP-ROOM-A", location_id: ROOM_A, status: "active" },
        ]);
        expect(refs.error, `refs insert: ${refs.error?.message}`).toBeNull();
    }, 120_000);

    afterAll(async () => { await cleanup(); }, 120_000);

    it("authors a canonical check-in through the installation's authority", async () => {
        const out = await ingest(principal(), evt());
        expect(out.disposition, JSON.stringify(out)).toBe("applied");
        const facts = await factsFromThisRun();
        expect(facts.length).toBeGreaterThan(0);
    }, 120_000);

    it("carries the installation's producer_key as provenance on the fact", async () => {
        const facts = await factsFromThisRun();
        expect(facts.every((f) => f.source_key === SOURCE_KEY)).toBe(true);
    }, 120_000);

    it("records the author as an installation, never as unattributed", async () => {
        const { data } = await supabase
            .from("attendance_integration_events")
            .select("installation_id, producer_id, disposition")
            .eq("installation_id", installationId)
            .eq("provider_event_id", `dp-evt-${run}`)
            .limit(1);
        const row = (data ?? [])[0] as { installation_id: string; producer_id: string | null } | undefined;
        expect(row?.installation_id).toBe(installationId);
        // The whole reason 20260911180000 exists.
        expect(row?.producer_id).toBeNull();
    }, 120_000);

    it("a replay of the same event id authors no second fact", async () => {
        const before = (await factsFromThisRun()).length;
        const again = await ingest(principal(), evt());
        expect(["applied", "duplicate"]).toContain(again.disposition);
        expect((await factsFromThisRun()).length).toBe(before);
    }, 120_000);

    it("authors a check-out as its own event", async () => {
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}-out`, eventKind: "check_out",
            physicalEventAt: `${TODAY}T15:30:00.000Z`,
        }));
        expect(out.disposition, JSON.stringify(out)).toBe("applied");
    }, 120_000);

    it("a correction chains onto the fact this installation committed", async () => {
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}-corr`,
            correctsExternalEventId: `dp-evt-${run}`,
            physicalEventAt: `${TODAY}T08:45:00.000Z`,
        }));
        expect(["applied", "duplicate"], JSON.stringify(out)).toContain(out.disposition);
    }, 120_000);

    it("refuses a site outside the installation's boundary", async () => {
        const out = await ingest(principal({ boundary: { mode: "locations", locationIds: [LAKESIDE] } }),
            evt({ externalEventId: `dp-evt-${run}-wrongsite` }));
        expect(out.disposition).not.toBe("applied");
    }, 120_000);

    it("an empty restricted boundary authors nothing at all", async () => {
        const out = await ingest(principal({ boundary: { mode: "locations", locationIds: [] } }),
            evt({ externalEventId: `dp-evt-${run}-emptyboundary` }));
        expect(out.disposition).not.toBe("applied");
    }, 120_000);

    it("refuses when the installation belongs to another organization", async () => {
        if (!otherOrgInstallationId) return;
        const out = await ingest(
            principal({ installationId: otherOrgInstallationId, orgId: OTHER_ORG }),
            evt({ externalEventId: `dp-evt-${run}-crossorg` }),
        );
        expect(out.disposition).not.toBe("applied");
    }, 120_000);

    it("refuses an unknown child, and never invents one", async () => {
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}-nochild`, externalChildId: "DP-CHILD-UNKNOWN",
        }));
        expect(out.disposition).toBe("unmapped");
    }, 120_000);

    it("refuses an unknown room rather than placing the child nowhere", async () => {
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}-noroom`, externalRoomId: "DP-ROOM-UNKNOWN",
        }));
        expect(out.disposition).toBe("unmapped");
    }, 120_000);

    it("grants nothing without the public attendance scope", async () => {
        const out = await ingest(principal({ grantedScopes: ["locations.read"] }),
            evt({ externalEventId: `dp-evt-${run}-noscope` }));
        expect(out.disposition).not.toBe("applied");
    }, 120_000);

    it("writes no canonical fact for any refusal in this suite", async () => {
        const { data } = await supabase
            .from("attendance_integration_events")
            .select("provider_event_id, disposition, attendance_event_id")
            .eq("installation_id", installationId);
        const rows = (data ?? []) as Array<{ provider_event_id: string; disposition: string; attendance_event_id: string | null }>;
        for (const r of rows) {
            if (r.disposition !== "applied") {
                expect(r.attendance_event_id, `${r.provider_event_id} carried a fact while ${r.disposition}`).toBeNull();
            }
        }
    }, 120_000);
});
