/**
 * S1 — Tour booking & communication safety, certified against the REAL certification
 * database (the shared local `alloy-cert` stack; `.env.certification.local`).
 *
 * Nothing here is stubbed: the booking service, the communications orchestrator, the
 * workflow runner and the scheduled-send dispatcher run against Postgres through PostgREST,
 * exactly as the routes drive them. Every fixture is created by this suite, at a location
 * that exists only for this run, so other lanes' residue on the shared tenant cannot reach
 * the slots under test — and this run's rows are removed afterwards.
 *
 * Proven:
 *   - a pending (approval-required) booking sends no confirmation, schedules no reminder,
 *     and a workflow on `tour_booking_pending` runs but its messaging action is refused
 *   - staff approval of a pending booking on a capacity-one slot is not refused for
 *     counting itself (D-T3), while another occupant still blocks it
 *   - approval sends the confirmation once; a replay does not send it again
 *   - a reminder for a booking canceled behind the orchestrator's back is withdrawn at
 *     dispatch, never sent (D-T4)
 *   - two simultaneous bookings for the last seat yield exactly one reservation, through
 *     either writer (D-T5) — REQUIRES migration 20261206090000 on this database
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

import { cancelTourBooking, confirmTourBooking, createTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { isTourSlotCapacityConflict } from "@/lib/tours/bookings/tourSlotCapacity";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { orchestrateTourBookingConfirmed } from "@/lib/tours/comms/tourCommsOrchestrator";
import { revalidateTourReminderForDispatch } from "@/lib/tours/comms/tourSchedulingScheduledSends";
import type { CommunicationScheduledSendRow } from "@/lib/communications/communicationScheduledSendsService";
import { buildCommunicationScheduledSendProcessMetadataAugment } from "@/lib/communications/communicationScheduledSendProcessMetadata";
import { executeLegacyCommunicationsSendAdapter } from "@/lib/communications/executeLegacyCommunicationsSendAdapter";

const ORG = "00000000-0000-4000-8000-000000000001"; // Northwind, the synthetic cert tenant
const RUN = `s1-${Date.now().toString(36)}`;
// Monday 2027-03-15 (day_of_week 1). Far enough out that "not before tomorrow" never bites.
const DAY = "2027-03-15";
const CAP1 = { start: `${DAY}T09:00:00.000Z`, end: `${DAY}T10:00:00.000Z` };
const CAP2 = { start: `${DAY}T11:00:00.000Z`, end: `${DAY}T12:00:00.000Z` };

/**
 * The sends this suite made opened communication threads that reference the location; with
 * the opportunities gone, nulling `location_id` would collide on the thread identity key,
 * so the run's own messages and threads go first.
 */
async function removeCertLocation(db: SupabaseClient, locationId: string): Promise<void> {
    const { data: threads } = await db.from("communication_threads").select("id").eq("location_id", locationId);
    const threadIds = (threads ?? []).map((t) => (t as { id: string }).id);
    if (threadIds.length) {
        await db.from("communication_messages").delete().in("thread_id", threadIds);
        await db.from("communication_threads").delete().in("id", threadIds);
    }
    await db.from("tour_availability_rules").delete().eq("location_id", locationId);
    const { error } = await db.from("locations").delete().eq("id", locationId);
    if (error) throw new Error(`cert location ${locationId} not removed: ${error.message}`);
}

describeLive("S1 tour booking & communication safety — live certification database", () => {
    const db = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let locationId = "";
    const personIds: string[] = [];
    const opportunityIds: string[] = [];
    let workflowId = "";

    async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
        const { data, error } = await p;
        if (error) throw new Error(error.message);
        return data;
    }

    async function family(n: number): Promise<{ personId: string; opportunityId: string }> {
        const person = await ok(
            db
                .from("persons")
                .insert({ org_id: ORG, first_name: "Zz", last_name: `${RUN}-${n}`, email: `qa+${RUN}-${n}@example.invalid` })
                .select("id")
                .single()
        );
        const opp = await ok(
            db
                .from("opportunities")
                .insert({
                    org_id: ORG,
                    name: `ZZ ${RUN} family ${n}`,
                    location_id: locationId,
                    primary_person_id: (person as { id: string }).id,
                    status_key: "open",
                    stage_key: "lead",
                })
                .select("id")
                .single()
        );
        personIds.push((person as { id: string }).id);
        opportunityIds.push((opp as { id: string }).id);
        return { personId: (person as { id: string }).id, opportunityId: (opp as { id: string }).id };
    }

    function bookingInput(fam: { personId: string; opportunityId: string }, slot: { start: string; end: string }, approvalRequired: boolean) {
        return {
            orgId: ORG,
            opportunityId: fam.opportunityId,
            locationId,
            startAt: new Date(slot.start),
            endAt: new Date(slot.end),
            timezone: "UTC",
            source: "public_link" as const,
            requestedByUserId: null,
            primaryPersonId: fam.personId,
            approvalRequired,
            // As the public route does: it sends through the orchestrator itself, after minting.
            deferConfirmationComms: true,
        };
    }

    async function outboundFor(bookingId: string) {
        return ok(
            db
                .from("communication_messages")
                .select("id, status, metadata")
                .eq("org_id", ORG)
                .eq("direction", "outbound")
                .filter("metadata->>tour_booking_id", "eq", bookingId)
        ) as Promise<Array<{ id: string; status: string; metadata: Record<string, unknown> }>>;
    }

    async function remindersFor(bookingId: string) {
        return ok(
            db
                .from("communication_scheduled_sends")
                .select("*")
                .eq("org_id", ORG)
                .eq("source", "tour_scheduling")
                .filter("metadata->>tour_booking_id", "eq", bookingId)
        ) as Promise<CommunicationScheduledSendRow[]>;
    }

    beforeAll(async () => {
        const loc = await ok(db.from("locations").insert({ org_id: ORG, label: `ZZ ${RUN} tour campus` }).select("id").single());
        locationId = (loc as { id: string }).id;
        await ok(
            db.from("tour_availability_rules").insert([
                {
                    org_id: ORG, location_id: locationId, day_of_week: 1, start_time: "09:00", end_time: "10:00",
                    timezone: "UTC", slot_duration_minutes: 60, buffer_minutes: 0, max_bookings_per_slot: 1,
                    approval_required: true, is_active: true, metadata: { cert_run: RUN },
                },
                {
                    org_id: ORG, location_id: locationId, day_of_week: 1, start_time: "11:00", end_time: "12:00",
                    timezone: "UTC", slot_duration_minutes: 60, buffer_minutes: 0, max_bookings_per_slot: 2,
                    approval_required: false, is_active: true, metadata: { cert_run: RUN },
                },
            ])
        );
        // An org workflow listening to `tour_booking_pending` that tries to MESSAGE the family
        // and also LOGS. The message must be refused; the log must still run.
        const wf = await ok(
            db
                .from("workflows")
                .insert({
                    org_id: ORG,
                    name: `ZZ ${RUN} pending-tour bypass probe`,
                    description: "S1 certification: messaging on a pending tour must be refused.",
                    event_type: "tour_booking_pending",
                    entity_type: "tour_bookings",
                    enabled: true,
                })
                .select("id")
                .single()
        );
        workflowId = (wf as { id: string }).id;
        await ok(
            db.from("workflow_actions").insert([
                {
                    workflow_id: workflowId, org_id: ORG, action_order: 1, action_type: "create_message", target_entity: null,
                    payload: { channel: "email", to_value: `qa+${RUN}-wf@example.invalid`, body: "Your tour is booked!" },
                },
                {
                    workflow_id: workflowId, org_id: ORG, action_order: 2, action_type: "log", target_entity: null,
                    payload: { message: `S1 ${RUN}: operator work on a pending tour still runs` },
                },
            ])
        );
    });

    afterAll(async () => {
        if (!env) return;
        if (workflowId) {
            await db.from("workflows").update({ enabled: false }).eq("id", workflowId);
            await db.from("workflow_action_runs").delete().eq("workflow_id", workflowId);
            await db.from("workflow_runs").delete().eq("workflow_id", workflowId);
            await db.from("workflow_actions").delete().eq("workflow_id", workflowId);
            await db.from("workflows").delete().eq("id", workflowId);
        }
        if (opportunityIds.length) {
            await db.from("communication_scheduled_sends").delete().eq("org_id", ORG).in("entity_id", opportunityIds);
            await db.from("tour_bookings").delete().eq("org_id", ORG).in("opportunity_id", opportunityIds);
            await db.from("opportunities").delete().in("id", opportunityIds);
        }
        if (personIds.length) await db.from("persons").delete().in("id", personIds);
        if (locationId) {
            await removeCertLocation(db, locationId);
        }
    });

    let pending: TourBookingRow;

    it("a pending booking produces no confirmation and no reminder; a pending-tour workflow cannot message", async () => {
        const fam = await family(1);
        pending = await createTourBooking(db, bookingInput(fam, CAP1, true));
        expect(pending.status_key).toBe("pending_approval");

        // The public route calls the orchestrator after minting — the policy refuses it.
        const comms = await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: pending, actorUserId: null });
        expect(comms.immediate).toEqual([]);
        expect(comms.skippedReasons).toEqual(
            expect.arrayContaining([
                "ineligible:booking_confirmation:awaiting_approval",
                "ineligible:reminder:awaiting_approval",
            ])
        );
        expect(await outboundFor(pending.id)).toEqual([]);
        expect(await remindersFor(pending.id)).toEqual([]);

        // The workflow fired on the pending event: messaging refused, the log still ran.
        const runs = (await ok(
            db.from("workflow_runs").select("id, status").eq("workflow_id", workflowId)
        )) as Array<{ id: string; status: string }>;
        expect(runs.length).toBe(1);
        const actionRuns = (await ok(
            db.from("workflow_action_runs").select("action_type, status, meta").eq("workflow_run_id", runs[0].id)
        )) as Array<{ action_type: string; status: string; meta: Record<string, unknown> }>;
        const byType = Object.fromEntries(actionRuns.map((a) => [a.action_type, a]));
        expect(byType.create_message.status).toBe("skipped");
        expect(String(byType.create_message.meta?.reason)).toBe("outbound_refused:tour_comms_ineligible:awaiting_approval");
        expect(byType.log.status).toBe("completed");
        const legacyMessages = (await ok(
            db.from("messages").select("id").contains("metadata", { workflow_id: workflowId })
        )) as unknown[];
        expect(legacyMessages).toEqual([]);
    });

    it("staff approval on a capacity-one slot is not refused for counting the booking itself (D-T3)", async () => {
        const confirmed = await confirmTourBooking(db, ORG, pending.id, { actorUserId: null });
        expect(confirmed.status_key).toBe("confirmed");
    });

    it("approval sends the confirmation exactly once, schedules reminders, and a replay sends nothing more", async () => {
        const first = await outboundFor(pending.id);
        const confirmations = first.filter((m) => m.metadata?.event_key === "tour_confirmation");
        expect(confirmations).toHaveLength(1);
        expect((await remindersFor(pending.id)).filter((r) => r.status === "pending").length).toBeGreaterThan(0);

        const fresh = (await ok(db.from("tour_bookings").select("*").eq("id", pending.id).single())) as TourBookingRow;
        const replay = await orchestrateTourBookingConfirmed(db, { orgId: ORG, booking: fresh, actorUserId: null });
        expect(replay.immediate.map((i) => i.status)).toEqual(["deduped"]);
        const after = (await outboundFor(pending.id)).filter((m) => m.metadata?.event_key === "tour_confirmation");
        expect(after).toHaveLength(1);
    });

    it("excluding the subject never hides ANOTHER occupant: a second pending booking cannot be approved into a full slot", async () => {
        // Occupy the capacity-two slot with one confirmed booking and one legacy over-capacity
        // pending row written without a declared limit (as rows from before the guard are).
        const famA = await family(2);
        const famB = await family(3);
        const holder = await createTourBooking(db, bookingInput(famA, CAP2, false));
        expect(holder.status_key).toBe("confirmed");
        const second = await createTourBooking(db, bookingInput(famB, CAP2, false));
        expect(second.status_key).toBe("confirmed");
        // Both seats taken. A third, legacy pending row in the same slot:
        const famC = await family(4);
        const legacy = (await ok(
            db
                .from("tour_bookings")
                .insert({
                    org_id: ORG, opportunity_id: famC.opportunityId, location_id: locationId, primary_person_id: famC.personId,
                    start_at: CAP2.start, end_at: CAP2.end, timezone: "UTC", status_key: "pending_approval", source: "admin",
                    metadata: { cert_run: RUN },
                })
                .select("*")
                .single()
        )) as TourBookingRow;
        await expect(confirmTourBooking(db, ORG, legacy.id, { actorUserId: null })).rejects.toThrow(/not available/);
        await db.from("tour_bookings").update({ status_key: "canceled" }).eq("id", legacy.id);
        await cancelTourBooking(db, ORG, second.id, { canceledBy: "s1-cert" });
        await cancelTourBooking(db, ORG, holder.id, { canceledBy: "s1-cert" });
    });

    it("a reminder for a booking canceled behind the orchestrator's back is withdrawn at dispatch (D-T4)", async () => {
        const fam = await family(5);
        const booking = await createTourBooking(db, { ...bookingInput(fam, CAP2, false), deferConfirmationComms: false });
        expect(booking.status_key).toBe("confirmed");
        const scheduled = (await remindersFor(booking.id)).filter((r) => r.status === "pending");
        expect(scheduled.length).toBeGreaterThan(0);

        // While confirmed, the due reminder would go out.
        expect(await revalidateTourReminderForDispatch({ supabase: db, row: scheduled[0], now: new Date() })).toEqual({
            kind: "dispatch",
        });

        // A writer that never ran the comms withdrawal (a SQL fix-up, a failed best-effort step):
        await ok(db.from("tour_bookings").update({ status_key: "canceled" }).eq("id", booking.id).select("id"));
        expect((await remindersFor(booking.id)).filter((r) => r.status === "pending").length).toBe(scheduled.length);

        expect(await revalidateTourReminderForDispatch({ supabase: db, row: scheduled[0], now: new Date() })).toEqual({
            kind: "suppress",
            reason: "booking_canceled",
        });
    });

    it("a confirmed booking's due reminder reaches the canonical gate WITH its recipient — not RECIPIENT_UNRESOLVED", async () => {
        const fam = await family(13);
        const booking = await createTourBooking(db, { ...bookingInput(fam, CAP2, false), deferConfirmationComms: false });
        const [row] = (await remindersFor(booking.id)).filter((r) => r.status === "pending");
        expect(row).toBeTruthy();
        expect(await revalidateTourReminderForDispatch({ supabase: db, row, now: new Date() })).toEqual({ kind: "dispatch" });

        // Exactly the call `processDueCommunicationScheduledSends` makes for a claimed row.
        const exec = await executeLegacyCommunicationsSendAdapter({
            supabase: db,
            orgId: row.org_id,
            quickMessage: false,
            primaryEntityType: "opportunities",
            primaryEntityId: row.entity_id,
            channel: row.channel,
            textRaw: row.body_snapshot,
            subjectRawEmail: row.channel === "email" ? row.subject_snapshot ?? "" : undefined,
            bindingIdOpt: row.communication_provider_binding_id ?? "",
            recipientPersonIdRaw: row.recipient_person_id,
            toRawInput: "",
            sendMetadataAugment: buildCommunicationScheduledSendProcessMetadataAugment(row),
        });
        const blocked = (await ok(
            db
                .from("communication_messages")
                .select("id, status, metadata")
                .eq("org_id", ORG)
                .filter("metadata->>communication_scheduled_send_id", "eq", row.id)
        )) as Array<{ status: string; metadata: Record<string, unknown> }>;
        // Whatever the provider set-up on this tenant, the gate must have evaluated a PERSON.
        const codes = blocked.map((m) => JSON.stringify(m.metadata ?? {}));
        expect(codes.some((c) => c.includes("RECIPIENT_UNRESOLVED")), JSON.stringify({ exec, codes })).toBe(false);
        expect(exec.ok, JSON.stringify(exec)).toBe(true);
        await cancelTourBooking(db, ORG, booking.id, { canceledBy: "s1-cert" });
    });

    describe("atomic capacity — requires migration 20261206090000_tour_booking_slot_capacity_guard", () => {
        it("four simultaneous bookings — public and admin writers — for the last seat yield exactly one reservation", async () => {
            await cancelTourBooking(db, ORG, pending.id, { canceledBy: "s1-cert" });
            const fams = await Promise.all([8, 9, 10, 11].map((n) => family(n)));
            const results = await Promise.allSettled(
                fams.map((f, i) => createTourBooking(db, { ...bookingInput(f, CAP1, i % 2 === 0), source: i % 2 ? "admin" : "public_link" }))
            );
            const live = (await ok(
                db
                    .from("tour_bookings")
                    .select("id")
                    .eq("location_id", locationId)
                    .eq("start_at", CAP1.start)
                    .in("status_key", ["pending_approval", "confirmed", "rescheduled"])
            )) as Array<{ id: string }>;
            expect(live.length, "the capacity-one slot holds more than one booking").toBe(1);
            const won = results.filter((r) => r.status === "fulfilled");
            const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
            expect(won).toHaveLength(1);
            expect(lost).toHaveLength(3);
            // Every loser either lost at the database (the race) or saw the winner already committed.
            for (const r of lost) {
                expect(isTourSlotCapacityConflict(r.reason) || /not available/.test(String(r.reason))).toBe(true);
            }
            expect(lost.some((r) => isTourSlotCapacityConflict(r.reason)), "no writer was stopped by the database guard").toBe(true);
        });

        it("an alternate writer going straight to the table cannot overfill a declared slot", async () => {
            const fam = await family(12);
            const { error } = await db.from("tour_bookings").insert({
                org_id: ORG, opportunity_id: fam.opportunityId, location_id: locationId, primary_person_id: fam.personId,
                start_at: CAP1.start, end_at: CAP1.end, timezone: "UTC", status_key: "confirmed", source: "automation",
                metadata: { slot_capacity: 1, cert_run: RUN },
            });
            expect(error?.code).toBe("23P01");
            expect(error?.message).toBe("tour_slot_capacity_exceeded");
        });
    });
});
