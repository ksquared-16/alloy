/**
 * Door / access capture — the NEGATIVE certification.
 *
 * Nothing here builds door infrastructure, and nothing here fakes a door
 * integration. The claim under test is a refusal:
 *
 *     an adult / household / unknown door observation, without sufficient
 *     child-specific identity and policy, IS NOT an Attendance fact
 *
 * A negative is only worth certifying if it can fail, so every scenario runs the
 * REAL external-producer path — the same adapter, registry and mappings a door
 * vendor would arrive through — and each refusal is paired with a positive
 * control proving the refusal was caused by the thing being tested and not by
 * some unrelated obstacle.
 *
 * ── WHY A DOOR CANNOT AUTHOR ATTENDANCE ──
 *
 * Two independent reasons, and either alone is sufficient:
 *
 *   IDENTITY. A door reports that a CREDENTIAL crossed a threshold. In a nursery
 *   the credential belongs to an adult — a parent, a member of staff, a visitor.
 *   The child is not the thing the door observed. Attributing the adult's badge
 *   to a child is not a mapping problem to be solved with a better mapping; it
 *   is a category error that would put a fabricated fact about a child in an
 *   append-only ledger.
 *
 *   CUSTODY. Even a genuinely child-specific credential would only establish
 *   that a door opened. Attendance is a claim about care: that a specific child
 *   was handed into the nursery's custody, in a room, at a time. A threshold
 *   crossing is not a custody transfer, and no amount of provider engineering
 *   makes it one.
 *
 * ── WHERE THE BOUNDARY IS ACTUALLY ENFORCED ──
 *
 * ── THE LAW THIS ESTABLISHES ──
 *
 *   Capture-channel vocabulary represents PROVENANCE POSSIBILITIES. Product
 *   support and authorization determine whether a channel may actually author
 *   Attendance.
 *
 * `child_attendance_events.source_type` already permits `door_access`. That the
 * enum can REPRESENT a door says nothing about whether a door may AUTHOR, and
 * the enum is deliberately left alone: a provenance vocabulary that could only
 * express currently-supported channels would have to be migrated every time
 * support changed, and would quietly lose the ability to describe a fact's real
 * origin. Representability is not authorization.
 *
 * At REGISTRATION, by capability. A door producer is registered without
 * `attendance.record`, and is then refused however well-formed its payload is,
 * however correct its mappings, and whatever its site grants. That is a real
 * enforced boundary rather than a documented intention, and D2 below proves it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceAuthorForPrincipal } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";
import { ingestExternalAttendanceEvent } from "@/lib/childcareOperational/attendance/integration/ingestExternalAttendance";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";

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
const ROOM_A = "00000000-0000-4000-8000-000000000013";
const CHILD = "00000000-0000-4000-8000-000070000050";
const AGREEMENT = "00000000-0000-4000-8000-000070000060";

const PROVIDER = "door_access";
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();

describeLive("door / access capture — negative certification", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let doorApplicationId = "";
    let controlApplicationId = "";
    let doorInstallationId = "";
    let controlInstallationId = "";

    const doorEvent = (over: Record<string, unknown> = {}) => ({
        externalEventId: `door-${run}`,
        eventKind: "check_in" as const,
        // What a door actually knows: a credential crossed a threshold.
        externalChildId: "BADGE-8841",
        externalRoomId: "DOOR-FRONT",
        physicalEventAt: `${TODAY}T07:58:00.000Z`,
        raw: { badge: "8841", direction: "in", door: "front" },
        ...over,
    });

    async function cleanup() {
        for (const id of [doorInstallationId, controlInstallationId].filter(Boolean)) {
            await supabase.from("attendance_integration_events").delete().eq("installation_id", id);
            await supabase.from("integration_resource_refs").delete().eq("installation_id", id);
            await supabase.from("app_installations").delete().eq("id", id);
        }
        await supabase
            .from("attendance_integration_events")
            .delete()
            .is("installation_id", null)
            .like("provider_event_id", `door-${run}%`);
        for (const id of [doorApplicationId, controlApplicationId].filter(Boolean)) {
            await supabase.from("developer_applications").delete().eq("id", id);
        }
    }

    beforeAll(async () => {
        await cleanup();

        // One installation per application per organization (uq_app_installations_app_org),
        // so the door and its positive control are two applications rather than
        // two installations of one.
        const mkApp = async (slug: string) => {
            const app = await supabase.from("developer_applications").insert({
                slug, name: slug, publisher: "alloy-certification",
                ownership_mode: "tenant_private", environment: "production", status: "active",
            }).select("id").single();
            if (app.error) throw new Error(`application fixture failed: ${app.error.message}`);
            return (app.data as { id: string }).id;
        };
        doorApplicationId = await mkApp(`door-cert-${run}`);
        controlApplicationId = await mkApp(`door-cert-${run}-control`);

        const mk = async (applicationId: string, key: string, scopes: string[]) => {
            const { data, error } = await supabase.from("app_installations").insert({
                application_id: applicationId, org_id: ORG, producer_key: key,
                granted_scopes: scopes, boundary_mode: "locations",
                location_boundary: [RIVERSIDE], status: "active",
            }).select("id").single();
            if (error) throw new Error(`installation fixture failed: ${error.message}`);
            const id = (data as { id: string }).id;
            // Complete, correct correlation — including the one a vendor would
            // propose: the adult's badge pointed straight at the child.
            for (const m of [
                { resource_type: "child", external_id: "BADGE-8841", child_customer_member_id: CHILD, location_id: null },
                { resource_type: "location", external_id: "DOOR-FRONT", child_customer_member_id: null, location_id: ROOM_A },
            ]) {
                const r = await supabase.from("integration_resource_refs").insert({ installation_id: id, org_id: ORG, status: "active", ...m });
                if (r.error) throw new Error(`ref fixture failed: ${r.error.message}`);
            }
            return id;
        };

        /*
         * A door installation as it would really be registered: authenticated,
         * site authorized, and WITHOUT the public attendance scope. Everything
         * about it is legitimate except its authority to say a child was present.
         */
        doorInstallationId = await mk(doorApplicationId, `door:cert:${run}`, []);

        /*
         * The positive control. Identical in every respect except that it holds
         * the attendance scope. Without this, D2 would prove only that something
         * refused the event.
         */
        controlInstallationId = await mk(controlApplicationId, `door:cert:${run}-control`, ["attendance.write"]);
    }, 120_000);

    afterAll(cleanup);

    const factsToday = async () =>
        (await listAttendanceEvents(supabase, ORG, { enrollmentAgreementId: AGREEMENT })).filter(
            (e) => e.source_key === `door:cert:${run}`,
        );

    const principalFor = (applicationId: string, installationId: string, producerKey: string, scopes: string[]): ApplicationPrincipal => ({
        kind: "application", applicationId, applicationSlug: `door-cert-${run}`,
        ownershipMode: "tenant_private", environment: "production",
        installationId, orgId: ORG, producerKey,
        credentialId: "cred-door", clientId: `alloy_app_door_${run}`,
        grantedScopes: scopes,
        boundary: { mode: "locations", locationIds: [RIVERSIDE] },
    });

    /** Resolve authority the way the request boundary does, then ingest. */
    async function ingestAs(p: ApplicationPrincipal, event: ReturnType<typeof doorEvent>) {
        const a = await attendanceAuthorForPrincipal(supabase, p);
        if (!a.ok) return { disposition: "denied" as const, attendanceEventId: null, code: a.code };
        return ingestExternalAttendanceEvent({ supabase, providerKey: PROVIDER, event, author: a.author });
    }

    const asDoor = (event: ReturnType<typeof doorEvent>) =>
        ingestAs(principalFor(doorApplicationId, doorInstallationId, `door:cert:${run}`, []), event);
    const asControl = (event: ReturnType<typeof doorEvent>) =>
        ingestAs(principalFor(controlApplicationId, controlInstallationId, `door:cert:${run}-control`, ["attendance.write"]), event);

    // ── D1 — no child identity ─────────────────────────────────────────────

    it("D1 — a badge nobody has mapped to a child produces no Attendance fact", async () => {
        const out = await asDoor(doorEvent({ externalEventId: `door-${run}-unknownbadge`, externalChildId: "BADGE-UNKNOWN" }));
        expect(out.disposition).toBe("unmapped");
        expect(out.attendanceEventId).toBeFalsy();
        expect(await factsToday()).toHaveLength(0);
    });

    it("D1 — a door event carrying no child identity at all is refused, not attributed to the room", async () => {
        const out = await asDoor(doorEvent({ externalEventId: `door-${run}-nochild`, externalChildId: "" }));
        // The tempting failure is to attribute a threshold crossing to whoever is
        // scheduled in that room. There is no child in this event, so there is no
        // child in the ledger.
        expect(out.disposition).toBe("unmapped");
        expect(out.code).toBe("external_id_missing");
        expect(await factsToday()).toHaveLength(0);
    });

    // ── D2 — the enforced boundary ─────────────────────────────────────────

    it("D2 — a fully mapped, authenticated, site-authorized door installation STILL cannot author attendance", async () => {
        const out = await asDoor(doorEvent());
        // Nothing is wrong with the request. The installation simply has no authority
        // to assert that a child was present, and that is the whole boundary.
        expect(out.disposition).toBe("rejected");
        expect(out.code).toBe("capability_not_granted");
        expect(await factsToday()).toHaveLength(0);
    });

    it("D2 — the positive control: the identical event commits when the installation holds the scope", async () => {
        const out = await asControl(doorEvent({ externalEventId: `door-${run}-control` }));
        /*
         * This is what makes D2 mean something: the payload, the mappings, the
         * site and the child are all identical, so the ONLY difference is the
         * scope. It also demonstrates the hazard precisely — grant a door
         * `attendance.write` and the platform will faithfully record an adult's
         * badge as a child's arrival. The refusal is a registration decision, not
         * a thing the schema can infer.
         */
        expect(out.disposition).toBe("applied");
        expect(out.attendanceEventId).toBeTruthy();
    });

    // ── D3 — an external caller with no authority ──────────────────────────

    it("D3 — an installation whose boundary grants no site never becomes an author at all", async () => {
        /*
         * This used to present an unregistered CREDENTIAL and assert the inbox
         * recorded it as `unattributed`. Ingestion no longer accepts a credential
         * — a production census found zero legacy producers, so the path was
         * removed rather than left dormant — and an external caller that cannot
         * be resolved is now refused BEFORE ingestion rather than recorded by it.
         *
         * The boundary being proven is the same one: an external caller without
         * established authority authors nothing, and leaves no attendance fact.
         */
        const stranger = principalFor(doorApplicationId, doorInstallationId, `door:cert:${run}`, ["attendance.write"]);
        const a = await attendanceAuthorForPrincipal(supabase, {
            ...stranger,
            boundary: { mode: "locations", locationIds: [] },
        });
        expect(a.ok).toBe(false);
        if (a.ok) return;
        expect(a.code).toBe("no_sites_in_boundary");
        expect(await factsToday()).toHaveLength(0);
    });
});
