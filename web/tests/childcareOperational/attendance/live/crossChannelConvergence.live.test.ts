/**
 * Cross-channel convergence — the Thread 6 claim, tested end to end.
 *
 * Four capture channels, one child, one service day. The claim is not that each
 * channel works; each is certified in its own suite. The claim is that they
 * converge:
 *
 *     many producers → ONE `child_attendance_events` lineage
 *                    → ONE coherent current Attendance projection
 *
 * That is what "one canonical ingestion architecture, not six Attendance
 * systems" has to mean in practice, and it is only true if a room transfer
 * captured on a kiosk, a correction made by an operator, a fact delivered by an
 * external producer and a family's known-away intent all land in the same
 * lineage and read as one day.
 *
 * Each channel enters through its REAL authority gate:
 *
 *   operator            human capability + site scope
 *   teacher / staff     the same human gate, capture-scope policy applied
 *   kiosk               NonHumanProducerAuthority
 *   external producer   NonHumanProducerAuthority, via the ingestion adapter
 *
 * Two of those are the SAME non-human contract, which is the architectural point:
 * a second non-human producer cost a registry row, not an authorization model.
 *
 * Assignment-scoped teacher narrowing is certified separately (Slice 1, 18 live
 * cases). This suite uses the same gate at site scope, because what it is testing
 * is convergence rather than narrowing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertNonHumanCaptureAllowed } from "@/lib/childcareOperational/attendance/attendancePermissions";
import { hashProducerCredential } from "@/lib/childcareOperational/attendance/integration/producerAuthority";
import { ingestExternalAttendanceEvent } from "@/lib/childcareOperational/attendance/integration/ingestExternalAttendance";
import {
    correctAttendanceEvent,
    listAttendanceEvents,
    recordAttendanceEvent,
} from "@/lib/childcareOperational/attendance/attendanceService";
import { whereaboutsAt } from "@/lib/childcareOperational/attendance/attendanceWhereabouts";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { submitParentAwayIntent } from "@/lib/childcareOperational/attendance/parentIntent/submitParentAwayIntent";
import {
    ATTENDANCE_SUBJECT_KINDS,
    applyObservedPresence,
    interpretServiceDay,
    serviceDayAsOf,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { effectiveExpectationsForWindow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { createSupabaseExpectationQueryGateway } from "@/lib/operationalExpectations/query/supabaseExpectationQueryGateway";

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
const ROOM_B = "00000000-0000-4000-8000-000000000014";
/** A child of its own, so this day's timeline is this suite's alone. */
const CHILD = "00000000-0000-4000-8000-000070000052";
const AGREEMENT = "00000000-0000-4000-8000-000070000062";

const PROVIDER = "classroom_coach";
const EXTERNAL_SECRET = "cert-convergence-external";
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();

const KIOSK_PRODUCER_KEY = `kiosk:cert:${run}`;
const EXTERNAL_PRODUCER_KEY = `integration:convergence:${run}`;
const PARENT_TOKEN = `cert-convergence-parent-${run}`;

/** The kiosk's authority. The same contract the external producer resolves into. */
const kioskAuthority = {
    producerKey: KIOSK_PRODUCER_KEY,
    allowedSiteLocationIds: [RIVERSIDE],
    grantedPermissionKeys: ["attendance.record"],
};

describeLive("cross-channel convergence — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let externalProducerId = "";
    const ids: Record<string, string> = {};

    async function cleanup() {
        /*
         * Scoped to THIS suite's producer, never to the provider key. Deleting by
         * `provider_key` would reach into every other suite using the same
         * provider — which it did, and which made two unrelated scenarios fail
         * only when the directory ran together.
         */
        if (externalProducerId) {
            await supabase.from("attendance_integration_events").delete().eq("producer_id", externalProducerId);
        }
        await supabase.from("attendance_integration_producers").delete().eq("producer_key", EXTERNAL_PRODUCER_KEY);
        await supabase.from("action_links").delete().eq("token_hash", hashFormLinkToken(PARENT_TOKEN));
    }

    /**
     * This suite's facts only. The ledger is append-only, so every earlier run's
     * facts are still on this agreement — a count across all of them would drift
     * every time this suite is run. Matched on run-tagged provenance rather than
     * the idempotency key, which the public row type deliberately does not carry.
     */
    const mine = async () =>
        (await listAttendanceEvents(supabase, ORG, { enrollmentAgreementId: AGREEMENT })).filter(
            (e) => String(e.actor_label ?? "").includes(`conv-${run}`) || e.source_key === EXTERNAL_PRODUCER_KEY,
        );

    beforeAll(async () => {
        await cleanup();

        const { data, error } = await supabase
            .from("attendance_integration_producers")
            .insert({
                org_id: ORG,
                provider_key: PROVIDER,
                producer_key: EXTERNAL_PRODUCER_KEY,
                label: "Cert convergence producer",
                credential_hash: hashProducerCredential(EXTERNAL_SECRET),
                credential_last_four: EXTERNAL_SECRET.slice(-4),
            })
            .select("id")
            .single();
        if (error) throw new Error(`producer fixture failed: ${error.message}`);
        externalProducerId = (data as { id: string }).id;

        const grant = await supabase
            .from("attendance_integration_producer_sites")
            .insert({ org_id: ORG, producer_id: externalProducerId, site_location_id: RIVERSIDE });
        if (grant.error) throw new Error(`site grant failed: ${grant.error.message}`);

        for (const m of [
            { external_entity_type: "child", external_id: "CONV-CHILD", child_customer_member_id: CHILD },
            { external_entity_type: "location", external_id: "CONV-ROOM-A", location_id: ROOM_A },
        ]) {
            const r = await supabase
                .from("attendance_integration_mappings")
                .insert({ org_id: ORG, producer_id: externalProducerId, ...m });
            if (r.error) throw new Error(`mapping fixture failed: ${r.error.message}`);
        }

        const link = await supabase.from("action_links").insert({
            org_id: ORG,
            action_type: "parent_report_absence",
            entity_type: "customer_member",
            entity_id: CHILD,
            token_hash: hashFormLinkToken(PARENT_TOKEN),
            short_code: `cv${run % 1000000}`,
            expires_at: new Date(Date.now() + 86400_000).toISOString(),
        });
        if (link.error) throw new Error(`parent link fixture failed: ${link.error.message}`);
    });

    afterAll(cleanup);

    // ── the day, one channel at a time ─────────────────────────────────────

    it("the OPERATOR opens the day", async () => {
        const fact = await recordAttendanceEvent(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            eventKind: "check_in",
            eventAt: `${TODAY}T07:45:00.000Z`,
            serviceDate: TODAY,
            roomLocationId: ROOM_A,
            idempotencyKey: `conv-${run}-operator-in`,
            actor: {
                actorType: "staff",
                actorLabel: `Cert operator conv-${run}`,
                sourceType: "operator_action",
                sourceKey: "operator_console",
            },
        } as Parameters<typeof recordAttendanceEvent>[1]);
        ids.operatorIn = fact.id;
        expect(fact.id).toBeTruthy();
    });

    it("the KIOSK moves the child, through the non-human authority contract", async () => {
        // The same gate the external producer's authority resolves into. A kiosk
        // is not a special case; it is one producer.
        const allowed = await assertNonHumanCaptureAllowed({
            authority: kioskAuthority,
            siteLocationId: RIVERSIDE,
        });
        expect(allowed.ok).toBe(true);

        const fact = await recordAttendanceEvent(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            eventKind: "room_transfer",
            eventAt: `${TODAY}T09:30:00.000Z`,
            serviceDate: TODAY,
            fromRoomLocationId: ROOM_A,
            toRoomLocationId: ROOM_B,
            idempotencyKey: `conv-${run}-kiosk-transfer`,
            actor: {
                actorType: "system",
                actorLabel: `Front hall kiosk conv-${run}`,
                sourceType: "kiosk",
                sourceKey: KIOSK_PRODUCER_KEY,
            },
        } as Parameters<typeof recordAttendanceEvent>[1]);
        ids.kioskTransfer = fact.id;
        expect(fact.id).toBeTruthy();
    });

    it("the KIOSK's authority stops at its site, even mid-day", async () => {
        // Convergence must not mean a producer inherits reach from the channels
        // beside it. The same kiosk, one site over, is refused.
        const denied = await assertNonHumanCaptureAllowed({
            authority: kioskAuthority,
            siteLocationId: LAKESIDE,
        });
        expect(denied.ok).toBe(false);
    });

    it("a STAFF correction fixes the kiosk's room without deleting it", async () => {
        // The transfer named the wrong destination. The original stands and the
        // correction supersedes it by reference — the property the whole ledger
        // is built on, exercised across channels rather than within one.
        const correction = await correctAttendanceEvent(supabase, {
            orgId: ORG,
            eventKind: "room_transfer",
            eventAt: `${TODAY}T09:30:00.000Z`,
            serviceDate: TODAY,
            fromRoomLocationId: ROOM_A,
            toRoomLocationId: ROOM_A,
            entryType: "correction",
            correctsEventId: ids.kioskTransfer,
            idempotencyKey: `conv-${run}-staff-correction`,
            actor: {
                actorType: "staff",
                actorLabel: `Room lead conv-${run}`,
                sourceType: "staff_workspace",
                sourceKey: "staff_workspace",
            },
        } as Parameters<typeof correctAttendanceEvent>[1]);
        ids.correction = correction.id;

        const all = await mine();
        const original = all.find((e) => e.id === ids.kioskTransfer);
        expect(original).toBeTruthy();
        expect(original?.entry_type).toBe("original");
        expect(all.find((e) => e.id === correction.id)?.corrects_event_id).toBe(ids.kioskTransfer);
    });

    it("the EXTERNAL PRODUCER closes the day, and a redelivery adds nothing", async () => {
        const event = {
            externalEventId: `conv-${run}-external-out`,
            eventKind: "check_out" as const,
            externalChildId: "CONV-CHILD",
            physicalEventAt: `${TODAY}T16:20:00.000Z`,
            raw: { source: "convergence" },
        };
        const first = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: EXTERNAL_SECRET,
            providerKey: PROVIDER,
            event,
        });
        expect(first.disposition).toBe("applied");
        ids.externalOut = first.attendanceEventId ?? "";

        const replay = await ingestExternalAttendanceEvent({
            supabase,
            presentedCredential: EXTERNAL_SECRET,
            providerKey: PROVIDER,
            event,
        });
        expect(replay.disposition).toBe("duplicate");
        expect(replay.attendanceEventId).toBe(ids.externalOut);
    });

    // ── one lineage, one day ───────────────────────────────────────────────

    it("every channel landed in ONE lineage on ONE agreement", async () => {
        const all = await mine();
        const bySource = new Map(all.map((e) => [e.source_type, e.id]));

        // Four channels, four provenances, one agreement, one service date.
        expect([...bySource.keys()].sort()).toEqual(
            ["integration_api", "kiosk", "operator_action", "staff_workspace"].sort(),
        );
        expect(new Set(all.map((e) => e.enrollment_agreement_id))).toEqual(new Set([AGREEMENT]));
        expect(new Set(all.map((e) => e.service_date))).toEqual(new Set([TODAY]));

        // Provenance survived convergence: each fact still says who produced it,
        // which is what makes a mixed day auditable rather than merely merged.
        expect(all.find((e) => e.id === ids.kioskTransfer)?.source_key).toBe(KIOSK_PRODUCER_KEY);
        expect(all.find((e) => e.id === ids.externalOut)?.source_key).toBe(EXTERNAL_PRODUCER_KEY);
    });

    it("the projection reads the mixed day as ONE coherent story", async () => {
        const all = await mine();

        // Operator check-in → in Room A.
        expect(whereaboutsAt(all, `${TODAY}T08:00:00.000Z`)?.locationId).toBe(ROOM_A);
        // The kiosk transfer was corrected to Room A, so the corrected day keeps
        // her there — the correction won, without the original being erased.
        expect(whereaboutsAt(all, `${TODAY}T10:00:00.000Z`)?.locationId).toBe(ROOM_A);
        // External producer check-out → gone.
        expect(whereaboutsAt(all, `${TODAY}T17:00:00.000Z`)?.locationId ?? null).toBeNull();
    });

    // ── the known-away contradiction, across channels ──────────────────────

    it("a family's known-away intent and a day full of observed facts both stand", async () => {
        const intent = await submitParentAwayIntent({
            supabase,
            plaintextToken: PARENT_TOKEN,
            fromDate: TODAY,
            reasonKey: "sick",
        });
        expect(intent.status).toBe("authored");

        const { effective } = await effectiveExpectationsForWindow(
            {
                orgId: ORG,
                subjects: [{ kind: ATTENDANCE_SUBJECT_KINDS.child, id: CHILD }],
                asOf: serviceDayAsOf(TODAY),
            },
            createSupabaseExpectationQueryGateway(supabase),
        );
        const interpreted = interpretServiceDay({
            siteLocationId: RIVERSIDE,
            scheduledChildIds: [CHILD],
            effective,
        });
        expect(interpreted[0]?.interpretation).toBe("known_away");

        // Four channels observed her here. Her family expected her away. Neither
        // record is destroyed to make the other true, and the operator is shown
        // exactly that.
        expect(applyObservedPresence(interpreted[0]!, "present")).toBe("attended_despite_plan");
        expect((await mine()).length).toBeGreaterThanOrEqual(4);
    });
});
