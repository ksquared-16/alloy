/**
 * Gate 1 — the Developer Platform authors attendance, against the real database.
 *
 * This proves the converged path: an installation resolves to an authority, that
 * authority becomes an ingestion author, and Attendance treats it exactly as it
 * treated a producer — same gate, same facts, same idempotency, same refusals.
 *
 * It also carries the subject-validity guard outright. That invariant used to be
 * proved by `externalProducerIngestion.live.test.ts`, which this slice deleted
 * along with the credential path it exercised. The guard itself did not go
 * anywhere — `resolveChildMemberEligibility` still runs on every ingestion — so
 * the proof had to move here rather than lapse. A retired model is a reason to
 * restate an invariant on the new path, never a reason to stop proving it.
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
    /** A real ADULT household member, for the subject-validity guard. */
    let guardianMemberId = "";

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
        // The guardian is a household member this suite created; no fact may
        // reference it, which is exactly what the M-scenarios below assert.
        if (guardianMemberId) await supabase.from("customer_members").delete().eq("id", guardianMemberId);
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
        /*
         * A guardian in the same household as the certified child. Created here
         * rather than assumed, because the guard being tested is precisely that
         * an ADULT canonical member cannot become a child's attendance — and a
         * tenant whose members all happen to be children would prove nothing.
         */
        const { data: childRow } = await supabase
            .from("customer_members").select("customer_id").eq("org_id", ORG).eq("id", CHILD).single();
        const guardian = await supabase
            .from("customer_members")
            .insert({
                org_id: ORG,
                customer_id: (childRow as { customer_id: string }).customer_id,
                relationship: "guardian",
                first_name: "DP Cert",
                last_name: `Guardian ${run}`,
                display_name: `DP Cert Guardian ${run}`,
                is_active: true,
            })
            .select("id")
            .single();
        expect(guardian.error, `guardian fixture: ${guardian.error?.message}`).toBeNull();
        guardianMemberId = (guardian.data as { id: string }).id;

        // Correlation is owned by integration_resource_refs, not by a legacy mapping.
        const refs = await supabase.from("integration_resource_refs").insert([
            { installation_id: installationId, org_id: ORG, resource_type: "child",
              external_id: "DP-CHILD-1", child_customer_member_id: CHILD, status: "active" },
            { installation_id: installationId, org_id: ORG, resource_type: "location",
              external_id: "DP-ROOM-A", location_id: ROOM_A, status: "active" },
            /*
             * A reference the installation is fully entitled to: active, this
             * org's, this installation's, and declared `child`. Everything the
             * correlation layer can check passes. It points at an adult.
             */
            { installation_id: installationId, org_id: ORG, resource_type: "child",
              external_id: "DP-ADULT-BADGE", child_customer_member_id: guardianMemberId, status: "active" },
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
        const { data, error } = await supabase
            .from("attendance_integration_events")
            .select("installation_id, disposition")
            .eq("installation_id", installationId)
            .eq("provider_event_id", `dp-evt-${run}`)
            .limit(1);
        expect(error, `select failed: ${error?.message}`).toBeNull();
        const row = (data ?? [])[0] as { installation_id: string } | undefined;
        expect(row?.installation_id).toBe(installationId);
    }, 120_000);

    it("the event ledger has no producer author column left to write", async () => {
        /*
         * This replaces an assertion that `producer_id` came back NULL. Selecting
         * a dropped column does not return null — PostgREST refuses the whole
         * request, which made the original test fail for a reason that had
         * nothing to do with authorship. `20260913160000` dropped the column, so
         * the invariant to hold is that asking for it is now an error.
         */
        const { error } = await supabase
            .from("attendance_integration_events")
            .select("producer_id")
            .limit(1);
        expect(error, "producer_id is still selectable on the event ledger").not.toBeNull();
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

    // ── Replay is not conflict, and lineage must name something real ───────
    //
    // Also ported from the deleted suite. Both invariants are Attendance's, not
    // the identity model's, so retiring the producer path does not retire them.

    it("the same event id carrying different meaning conflicts, and authors nothing", async () => {
        /*
         * A redelivery whose payload fingerprint moved is not a replay. The
         * committed fact stays standing — demoting it would orphan every
         * correction that already named this provider event — so the conflict is
         * reported to the caller while the evidence row keeps its outcome.
         */
        const before = (await factsFromThisRun()).length;
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}`, physicalEventAt: `${TODAY}T09:59:00.000Z`,
        }));
        expect(out.disposition, JSON.stringify(out)).toBe("conflicted");
        expect(out.code).toBe("payload_conflict");
        expect((await factsFromThisRun()).length).toBe(before);

        const { data } = await supabase
            .from("attendance_integration_events")
            .select("disposition, failure_code")
            .eq("installation_id", installationId)
            .eq("provider_event_id", `dp-evt-${run}`)
            .single();
        // The durable OUTCOME is unchanged; the note records the last processing.
        expect(data).toMatchObject({ disposition: "applied", failure_code: "payload_conflict" });
    }, 120_000);

    it("a correction naming an original this installation never committed is refused", async () => {
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}-orphan`,
            correctsExternalEventId: `dp-evt-${run}-never-existed`,
        }));
        expect(out.disposition, JSON.stringify(out)).toBe("rejected");
        expect(out.code).toBe("unknown_correction_target");
        expect("attendanceEventId" in out ? out.attendanceEventId : null).toBeFalsy();
    }, 120_000);

    // ── M — the correlated subject must be a CHILD, not merely a row ───────
    //
    // Ported from the deleted `externalProducerIngestion.live.test.ts`. The
    // scenarios there resolved through `attendance_integration_mappings`; these
    // resolve through `integration_resource_refs`. The invariant is identical
    // and belongs to Attendance, not to whichever identity model is current.

    it("M1 — a reference to a legitimate child still commits", async () => {
        // The positive control for the guard below: without it, M2 would only
        // prove that something refused the event.
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}-m1`, physicalEventAt: `${TODAY}T08:05:00.000Z`,
        }));
        expect(out.disposition, JSON.stringify(out)).toBe("applied");
    }, 120_000);

    it("M2 — a reference that resolves to an ADULT authors no attendance", async () => {
        const out = await ingest(principal(), evt({
            externalEventId: `dp-evt-${run}-m2`, externalChildId: "DP-ADULT-BADGE",
        }));
        /*
         * The reference RESOLVED — active, this installation's, this org's, and
         * pointing at a real row. Everything the correlation layer can check
         * passed. The refusal comes from the canonical subject resolver, which is
         * the only thing that knows the row is a guardian.
         */
        expect(out.disposition, JSON.stringify(out)).toBe("rejected");
        expect(out.code).toBe("member_not_a_child");
        // `denied` is a different shape and carries no fact id at all.
        expect("attendanceEventId" in out ? out.attendanceEventId : null).toBeFalsy();

        // And nothing was written anywhere in the Attendance ledger for them.
        const { data } = await supabase
            .from("child_attendance_events")
            .select("id")
            .eq("org_id", ORG)
            .eq("customer_member_id", guardianMemberId);
        expect(data ?? []).toHaveLength(0);
    }, 120_000);

    it("M2 — the installation's own claim that the identifier is a child changes nothing", async () => {
        // `resource_type = 'child'` is what the INSTALLATION believes its
        // identifier means. The whole boundary exists because an installation
        // does not get to describe Alloy's subjects.
        const { data } = await supabase
            .from("integration_resource_refs")
            .select("resource_type, status")
            .eq("installation_id", installationId)
            .eq("external_id", "DP-ADULT-BADGE")
            .single();
        expect(data).toMatchObject({ resource_type: "child", status: "active" });
    }, 120_000);

    it("M5 — a reference REPOINTED at an adult stops working, ref changes and all", async () => {
        /*
         * A guard applied only when the reference is created would miss this;
         * the check runs on every ingestion, so it does not.
         *
         * `uq_resource_ref_child_target` allows one reference per child target,
         * so the adult badge is retired before the good reference is repointed
         * at the same member — the constraint is doing its job, and working
         * around it by pointing two references at one member would test nothing.
         */
        const retire = await supabase
            .from("integration_resource_refs")
            .delete()
            .eq("installation_id", installationId)
            .eq("external_id", "DP-ADULT-BADGE");
        expect(retire.error, `retire adult ref: ${retire.error?.message}`).toBeNull();
        const repoint = await supabase
            .from("integration_resource_refs")
            .update({ child_customer_member_id: guardianMemberId })
            .eq("installation_id", installationId)
            .eq("external_id", "DP-CHILD-1");
        expect(repoint.error, `repoint: ${repoint.error?.message}`).toBeNull();
        try {
            const out = await ingest(principal(), evt({ externalEventId: `dp-evt-${run}-m5` }));
            expect(out.disposition, JSON.stringify(out)).toBe("rejected");
            expect(out.code).toBe("member_not_a_child");
        } finally {
            // Restore both, so this scenario cannot decide the outcome of any other.
            await supabase
                .from("integration_resource_refs")
                .update({ child_customer_member_id: CHILD })
                .eq("installation_id", installationId)
                .eq("external_id", "DP-CHILD-1");
            await supabase.from("integration_resource_refs").insert({
                installation_id: installationId, org_id: ORG, resource_type: "child",
                external_id: "DP-ADULT-BADGE", child_customer_member_id: guardianMemberId, status: "active",
            });
        }
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
