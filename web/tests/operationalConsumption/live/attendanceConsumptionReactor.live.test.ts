/**
 * D12b — the Attendance → Operational Consumption seam, against the real database.
 *
 * Slice 1 proves one thing and refuses to overclaim: a canonical attendance fact
 * that lands in `child_attendance_events` now reaches the consumption path that
 * has always existed, producing a real `consumption_events` row and a real
 * resolved obligation — and reprocessing it produces no second one.
 *
 * It runs against the certification database rather than the mock store the older
 * consumption tests use. The failure this seam can actually have is duplicate
 * money under replay, and a mock that returns whatever it was handed cannot fail
 * that way.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";
import { reactToAttendanceFact } from "@/lib/operationalConsumption/attendanceConsumptionReactor";

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
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const ROOM_A = "00000000-0000-4000-8000-000000000013";
const AGREEMENT = "00000000-0000-4000-8000-000070000060";
const CHILD = "00000000-0000-4000-8000-000070000050";
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();

describeLive("D12b attendance → consumption reactor — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let templateId = "";
    const factIds: string[] = [];

    async function cleanup() {
        const { data: evs } = await supabase
            .from("consumption_events")
            .select("id")
            .eq("org_id", ORG)
            .eq("source_entity_type", "child_attendance_events")
            .in("source_entity_id", factIds.length ? factIds : ["00000000-0000-0000-0000-000000000000"]);
        const ids = ((evs ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (ids.length) {
            await supabase.from("resolved_obligations").delete().in("consumption_event_id", ids);
            await supabase.from("consumption_events").delete().in("id", ids);
        }
        if (templateId) await supabase.from("financial_charge_templates").delete().eq("id", templateId);
    }

    beforeAll(async () => {
        /*
         * A late-pickup template for this org. The GLOBAL `consumption_event_types`
         * registry already maps `attendance.late_pickup → late_pickup`; what a
         * tenant supplies is the template that key resolves to. Seeded here rather
         * than assumed — an org that has authored none is a legitimate state, and
         * the reactor must not depend on this org happening to have one.
         */
        await supabase.from("financial_charge_templates").delete().eq("org_id", ORG).eq("template_key", "late_pickup");
        const { data, error } = await supabase
            .from("financial_charge_templates")
            .insert({
                org_id: ORG,
                template_key: "late_pickup",
                label: "Late pickup",
                charge_category: "late_pickup",
                amount_strategy: "fixed",
                amount_cents: 2500,
                currency_code: "USD",
                trigger_type: "attendance",
                occurs_on_strategy: "event_date",
                billable_on_strategy: "immediate",
                default_responsibility_key: "household",
                review_required: false,
                is_active: true,
                effective_start: "2026-01-01",
            })
            .select("id")
            .single();
        if (error) throw new Error(`charge template fixture failed: ${error.message}`);
        templateId = (data as { id: string }).id;
    });

    afterAll(cleanup);

    const record = async (kind: "check_in" | "check_out", at: string, key: string) => {
        const fact = await recordAttendanceEvent(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            eventKind: kind,
            eventAt: at,
            serviceDate: TODAY,
            roomLocationId: kind === "check_in" ? ROOM_A : null,
            idempotencyKey: key,
            actor: { actorType: "staff", actorLabel: "Cert operator", sourceType: "operator_action", sourceKey: "cert" },
        } as Parameters<typeof recordAttendanceEvent>[1]);
        factIds.push(fact.id);
        return fact;
    };

    it("a canonical attendance fact reaches consumption and produces a real obligation", async () => {
        const fact = await record("check_out", `${TODAY}T18:10:00.000Z`, `t7-late-${run}`);

        const outcome = await reactToAttendanceFact(supabase, {
            orgId: ORG,
            attendanceEventId: fact.id,
            today: TODAY,
            lateThresholdTime: "18:00",
        });
        expect(outcome.status).toBe("consumed");
        if (outcome.status !== "consumed") return;

        const { data: ev } = await supabase
            .from("consumption_events")
            .select("id, source_family, source_entity_type, source_entity_id, event_key, subject_id, occurs_on")
            .eq("id", outcome.consumptionEventId!)
            .single();
        expect(ev).toMatchObject({
            source_family: "attendance",
            source_entity_type: "child_attendance_events",
            source_entity_id: fact.id,
            event_key: "attendance.late_pickup",
            subject_id: CHILD,
            occurs_on: TODAY,
        });

        const { data: obs } = await supabase
            .from("resolved_obligations")
            .select("id, obligation_kind, amount_cents, status")
            .eq("consumption_event_id", outcome.consumptionEventId!);
        expect((obs ?? []).length).toBeGreaterThan(0);
        expect((obs ?? [])[0]).toMatchObject({ obligation_kind: "late_pickup" });
    });

    it("reprocessing the same fact converges — no second event, no second obligation", async () => {
        const { data: before } = await supabase
            .from("consumption_events")
            .select("id")
            .eq("org_id", ORG)
            .eq("source_entity_type", "child_attendance_events")
            .in("source_entity_id", factIds);
        const firstCount = (before ?? []).length;
        const firstId = ((before ?? [])[0] as { id: string }).id;

        for (let i = 0; i < 3; i++) {
            const again = await reactToAttendanceFact(supabase, {
                orgId: ORG,
                attendanceEventId: factIds[0],
                today: TODAY,
                lateThresholdTime: "18:00",
            });
            expect(again.status).toBe("consumed");
            if (again.status === "consumed") expect(again.consumptionEventId).toBe(firstId);
        }

        const { data: after } = await supabase
            .from("consumption_events")
            .select("id")
            .eq("org_id", ORG)
            .eq("source_entity_type", "child_attendance_events")
            .in("source_entity_id", factIds);
        expect((after ?? []).length).toBe(firstCount);

        const { data: obs } = await supabase
            .from("resolved_obligations")
            .select("id")
            .eq("consumption_event_id", firstId);
        expect((obs ?? []).length).toBe(1);
    });

    it("an ordinary attendance fact is recorded operationally and produces NO money", async () => {
        /*
         * SCENARIO A, and the reason it is asserted here rather than filtered at
         * the seam: the INTERPRETER owns commercial meaning, and it already
         * answers this correctly — "Check-in alone carries no commercial meaning;
         * billing follows from the schedule/duration." So the fact is recorded as
         * operational truth for interpretation and yields zero obligations.
         *
         * An earlier draft of this test expected the reactor to drop the fact
         * before interpretation. That would have put commercial judgement in the
         * seam — a second interpreter, deciding what is financially interesting —
         * which is exactly what this thread is forbidden to add. The distinction
         * that matters is not "did a consumption row appear" but "did money
         * appear", and the answer must come from the interpreter.
         */
        const fact = await record("check_in", `${TODAY}T08:05:00.000Z`, `t7-plain-${run}`);
        const outcome = await reactToAttendanceFact(supabase, {
            orgId: ORG,
            attendanceEventId: fact.id,
            today: TODAY,
        });
        expect(outcome.status).toBe("consumed");
        if (outcome.status !== "consumed") return;

        // Operational truth: recorded.
        expect(outcome.consumptionEventId).toBeTruthy();
        // Financial consequence: none. No obligation, and therefore no charge.
        expect(outcome.obligationIds).toHaveLength(0);
        const { data: obs } = await supabase
            .from("resolved_obligations")
            .select("id")
            .eq("consumption_event_id", outcome.consumptionEventId!);
        expect(obs ?? []).toHaveLength(0);
        expect(outcome.result.persisted?.draftChargeId ?? null).toBeNull();
    });

    it("a fact this reactor cannot read is refused, never guessed at", async () => {
        const outcome = await reactToAttendanceFact(supabase, {
            orgId: ORG,
            attendanceEventId: "00000000-0000-4000-8000-0000000000ff",
            today: TODAY,
        });
        expect(outcome.status).toBe("skipped");
        if (outcome.status === "skipped") expect(outcome.reason).toBe("fact_not_found");
    });
});
