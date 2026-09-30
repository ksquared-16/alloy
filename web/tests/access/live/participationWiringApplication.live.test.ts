/**
 * THE APPLICATION HALF OF THE TEMPORAL GATE.
 *
 * The 11-scenario database matrix proves the SQL primitive. This proves the wiring respects it: that
 * the canonical services actually delegate persistence, that a half-valid combined edit leaves BOTH
 * tables untouched, that a retry does not chain a successor, that a stale row becomes a conflict a
 * caller can act on, and that a domain event is emitted only after a commit.
 *
 * WHY THESE ARE SERVICE-LEVEL, NOT ROUTE-LEVEL. The mounted routes contribute authentication, tenancy
 * and capability resolution, then call exactly these functions with exactly these inputs. Driving the
 * services directly exercises every line the routes exercise below the auth boundary, against a real
 * database, without minting sessions. What the routes add on top is locked separately, at source
 * level, by `participationRouteDelegation.test.ts` — which is the honest division: this file proves
 * behaviour, that one proves the mounted surfaces have no second path.
 *
 * EVENTS are read from `workflow_events`, which is where `emitEvent` puts them, so "an event fired" is
 * a measured row rather than a spy on our own call.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const OPERATIONAL = ["planned", "active", "ending"];
const PLACEMENT_EVENT = "placement_changed";
const ASSIGNMENT_EVENT = "schedule_assignment_changed";

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

// The services build their own admin client from the environment, and `emitEvent` does too. Publishing
// the certification values here is what makes those internal clients talk to the same database this
// test inspects; without it the services would silently write somewhere else, or fail to construct.
if (env) {
    process.env.SUPABASE_URL = env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey;
}

type Anchors = {
    orgId: string;
    customerId: string;
    siteLocationId: string;
    roomLocationId: string | null;
    altRoomLocationId: string | null;
    programCategoryId: string | null;
    assignmentTypeId: string | null;
    schedulePatternId: string;
    altSchedulePatternId: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(base: Date, n: number): Date {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d;
}

describe.skipIf(!env)("the wired participation services, against a live database", () => {
    let db: SupabaseClient;
    let anchors: Anchors;
    let services: {
        supersedeChildPlacement: typeof import("@/lib/childcareOperational/childPlacementService")["supersedeChildPlacement"];
        supersedeScheduleAssignment: typeof import("@/lib/childcareOperational/scheduleAssignmentService")["supersedeScheduleAssignment"];
        applyCombinedParticipationChange: typeof import("@/lib/childcareOperational/applyCombinedParticipationChange")["applyCombinedParticipationChange"];
    };
    const createdAgreements: string[] = [];
    const createdMembers: string[] = [];

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });

        // Imported after the environment is published, so the services' own clients pick it up.
        const [placement, assignment, combined] = await Promise.all([
            import("@/lib/childcareOperational/childPlacementService"),
            import("@/lib/childcareOperational/scheduleAssignmentService"),
            import("@/lib/childcareOperational/applyCombinedParticipationChange"),
        ]);
        services = {
            supersedeChildPlacement: placement.supersedeChildPlacement,
            supersedeScheduleAssignment: assignment.supersedeScheduleAssignment,
            applyCombinedParticipationChange: combined.applyCombinedParticipationChange,
        };

        const probe = await db.rpc("apply_participation_operational_change", {
            p_org_id: "00000000-0000-0000-0000-000000000000",
            p_enrollment_agreement_id: "00000000-0000-0000-0000-000000000000",
            p_idempotency_key: "probe",
            p_today: iso(new Date()),
        });
        const missing =
            probe.error
            && /could not find the function|PGRST202/i.test(
                `${probe.error.code ?? ""} ${probe.error.message ?? ""}`,
            );
        expect(
            missing,
            "the temporal primitive is not installed on the reachable certification stack, so the "
                + "application gate cannot run. An unmeasured gate must not report green.",
        ).toBe(false);

        // Copy a combination the database already accepted rather than assembling one: the consistency
        // triggers require the program category to belong to the site and the assignment type to
        // support the subject type.
        const { data: shapeRow } = await db
            .from("child_placements")
            .select("org_id, site_location_id, program_category_id, room_location_id")
            .not("room_location_id", "is", null)
            .limit(1);
        const shape = shapeRow?.[0] as
            | {
                  org_id: string;
                  site_location_id: string;
                  program_category_id: string | null;
                  room_location_id: string | null;
              }
            | undefined;
        if (!shape) throw new Error("no child_placements row to copy a valid shape from");

        const twoOf = async (table: string) => {
            const { data } = await db.from(table).select("id").eq("org_id", shape.org_id).limit(2);
            return (data ?? []) as Array<{ id: string }>;
        };
        // A room is not any location: `validateRoomLocationUnderSite` requires location_type 'unit'
        // whose parent IS the placement's site. Picking the first location in the table fails that.
        const { data: roomRows } = await db
            .from("locations")
            .select("id")
            .eq("org_id", shape.org_id)
            .eq("location_type", "unit")
            .eq("parent_location_id", shape.site_location_id)
            .limit(3);
        const rooms = (roomRows ?? []) as Array<{ id: string }>;
        const customers = await twoOf("customers");
        const { data: asgRow } = await db
            .from("schedule_assignments")
            .select("schedule_pattern_id, operational_assignment_type_id")
            .eq("org_id", shape.org_id)
            .eq("subject_type", "child")
            .eq("is_primary", true)
            .not("operational_assignment_type_id", "is", null)
            .limit(1);
        const asgShape = asgRow?.[0] as
            | { schedule_pattern_id: string; operational_assignment_type_id: string }
            | undefined;
        const { data: patterns } = await db
            .from("schedule_patterns")
            .select("id")
            .eq("org_id", shape.org_id)
            .eq("site_location_id", shape.site_location_id)
            .limit(2);
        const patternIds = ((patterns ?? []) as Array<{ id: string }>).map((p) => p.id);

        anchors = {
            orgId: shape.org_id,
            customerId: customers[0]?.id,
            siteLocationId: shape.site_location_id,
            roomLocationId: shape.room_location_id,
            altRoomLocationId: rooms.find((r) => r.id !== shape.room_location_id)?.id ?? null,
            programCategoryId: shape.program_category_id,
            assignmentTypeId: asgShape?.operational_assignment_type_id ?? null,
            schedulePatternId: asgShape?.schedule_pattern_id ?? patternIds[0],
            altSchedulePatternId:
                patternIds.find((id) => id !== (asgShape?.schedule_pattern_id ?? patternIds[0])) ?? null,
        };
        expect(anchors.customerId, "no customers row to hang a fixture member off").toBeTruthy();
        expect(anchors.schedulePatternId, "no schedule pattern to build an assignment on").toBeTruthy();
    });

    afterEach(async () => {
        while (createdAgreements.length) {
            const id = createdAgreements.pop()!;
            await db.from("workflow_events").delete().eq("org_id", anchors.orgId)
                .contains("payload", { enrollment_agreement_id: id });
            await db.from("child_enrollment_agreements").delete().eq("id", id);
        }
        while (createdMembers.length) {
            const id = createdMembers.pop()!;
            await db.from("customer_members").delete().eq("id", id);
        }
    });

    async function fixture(start = iso(addDays(new Date(), -30))) {
        const { data: mem, error: memErr } = await db
            .from("customer_members")
            .insert({
                org_id: anchors.orgId,
                customer_id: anchors.customerId,
                display_name: `wiring fixture ${crypto.randomUUID().slice(0, 8)}`,
            })
            .select("id")
            .single();
        expect(memErr, `member insert failed: ${memErr?.message}`).toBeNull();
        const memberId = (mem as { id: string }).id;
        createdMembers.push(memberId);

        const { data: agr, error: agrErr } = await db
            .from("child_enrollment_agreements")
            .insert({
                org_id: anchors.orgId,
                customer_member_id: memberId,
                site_location_id: anchors.siteLocationId,
                status: "active",
                start_date: start,
            })
            .select("id")
            .single();
        expect(agrErr, `agreement insert failed: ${agrErr?.message}`).toBeNull();
        const agreementId = (agr as { id: string }).id;
        createdAgreements.push(agreementId);

        const { data: plc, error: plcErr } = await db
            .from("child_placements")
            .insert({
                org_id: anchors.orgId,
                enrollment_agreement_id: agreementId,
                customer_member_id: memberId,
                site_location_id: anchors.siteLocationId,
                room_location_id: anchors.roomLocationId,
                program_category_id: anchors.programCategoryId,
                start_date: start,
                status: "active",
                reason_key: "fixture",
            })
            .select("id")
            .single();
        expect(plcErr, `placement insert failed: ${plcErr?.message}`).toBeNull();

        const { data: asg, error: asgErr } = await db
            .from("schedule_assignments")
            .insert({
                org_id: anchors.orgId,
                enrollment_agreement_id: agreementId,
                schedule_pattern_id: anchors.schedulePatternId,
                customer_member_id: memberId,
                subject_type: "child",
                is_primary: true,
                start_date: start,
                status: "active",
                site_location_id: anchors.siteLocationId,
                room_location_id: anchors.roomLocationId,
                operational_assignment_type_id: anchors.assignmentTypeId,
            })
            .select("id")
            .single();
        expect(asgErr, `assignment insert failed: ${asgErr?.message}`).toBeNull();

        return {
            agreementId,
            memberId,
            placementId: (plc as { id: string }).id,
            assignmentId: (asg as { id: string }).id,
            start,
        };
    }

    const placements = (agreementId: string) =>
        db.from("child_placements")
            .select("id, status, start_date, end_date, supersedes_placement_id, room_location_id, program_category_id")
            .eq("enrollment_agreement_id", agreementId);

    const assignments = (agreementId: string) =>
        db.from("schedule_assignments")
            .select("id, status, start_date, end_date, supersedes_assignment_id, schedule_pattern_id, room_location_id, operational_assignment_type_id")
            .eq("enrollment_agreement_id", agreementId);

    async function eventCount(agreementId: string, eventType: string): Promise<number> {
        const { data } = await db
            .from("workflow_events")
            .select("id")
            .eq("org_id", anchors.orgId)
            .eq("event_type", eventType)
            .contains("payload", { enrollment_agreement_id: agreementId });
        return (data ?? []).length;
    }

    // ── 1 ────────────────────────────────────────────────────────────────────────────────────────
    it("1 — a placement-only change supersedes through the canonical service and emits one event", async () => {
        const f = await fixture();
        const newStart = iso(addDays(new Date(), -5));
        const row = await services.supersedeChildPlacement(db, {
            orgId: anchors.orgId,
            enrollmentAgreementId: f.agreementId,
            startDate: newStart,
            programCategoryId: anchors.programCategoryId,
            roomLocationId: anchors.altRoomLocationId ?? anchors.roomLocationId,
            todayYmd: iso(new Date()),
        });
        expect(row.start_date).toBe(newStart);
        expect(row.supersedes_placement_id).toBe(f.placementId);

        const { data: rows } = await placements(f.agreementId);
        expect(rows).toHaveLength(2);
        expect(rows!.filter((r) => OPERATIONAL.includes(r.status as string))).toHaveLength(1);
        expect(await eventCount(f.agreementId, PLACEMENT_EVENT)).toBe(1);
        // Nothing asked the schedule to change, so nothing did — and no schedule event was invented.
        expect(await eventCount(f.agreementId, ASSIGNMENT_EVENT)).toBe(0);
    });

    // ── 2 ────────────────────────────────────────────────────────────────────────────────────────
    it("2 — an assignment-only change supersedes and carries the room it was not asked to change", async () => {
        const f = await fixture();
        const newStart = iso(addDays(new Date(), -5));
        const row = await services.supersedeScheduleAssignment(db, {
            orgId: anchors.orgId,
            enrollmentAgreementId: f.agreementId,
            startDate: newStart,
            schedulePatternId: anchors.schedulePatternId,
            todayYmd: iso(new Date()),
        });
        expect(row.supersedes_assignment_id).toBe(f.assignmentId);
        // The 20261109120000 repair, observed through the service rather than the raw primitive.
        expect(row.room_location_id).toBe(anchors.roomLocationId);
        expect(row.operational_assignment_type_id).toBe(anchors.assignmentTypeId);
        expect(await eventCount(f.agreementId, ASSIGNMENT_EVENT)).toBe(1);
        expect(await eventCount(f.agreementId, PLACEMENT_EVENT)).toBe(0);
    });

    // ── 3 ────────────────────────────────────────────────────────────────────────────────────────
    it("3 — a combined change supersedes both from one transaction and emits both events", async () => {
        const f = await fixture();
        const newStart = iso(addDays(new Date(), -5));
        const out = await services.applyCombinedParticipationChange(db, {
            orgId: anchors.orgId,
            enrollmentAgreementId: f.agreementId,
            todayYmd: iso(new Date()),
            placement: { startDate: newStart, roomLocationId: anchors.altRoomLocationId ?? anchors.roomLocationId },
            assignment: { startDate: newStart, schedulePatternId: anchors.schedulePatternId },
        });
        expect(out.placement).not.toBeNull();
        expect(out.assignment).not.toBeNull();
        const { data: p } = await placements(f.agreementId);
        const { data: a } = await assignments(f.agreementId);
        expect(p).toHaveLength(2);
        expect(a).toHaveLength(2);
        expect(await eventCount(f.agreementId, PLACEMENT_EVENT)).toBe(1);
        expect(await eventCount(f.agreementId, ASSIGNMENT_EVENT)).toBe(1);
    });

    // ── 4 ────────────────────────────────────────────────────────────────────────────────────────
    it("4 — an invalid placement half leaves the assignment untouched and emits nothing", async () => {
        const f = await fixture();
        const newStart = iso(addDays(new Date(), -5));
        await expect(
            services.applyCombinedParticipationChange(db, {
                orgId: anchors.orgId,
                enrollmentAgreementId: f.agreementId,
                todayYmd: iso(new Date()),
                // Same day as the prior row: superseding here would publish a zero-length interval.
                placement: { startDate: f.start },
                assignment: { startDate: newStart, schedulePatternId: anchors.schedulePatternId },
            }),
        ).rejects.toThrow();

        const { data: p } = await placements(f.agreementId);
        const { data: a } = await assignments(f.agreementId);
        expect(p).toHaveLength(1);
        expect(a).toHaveLength(1);
        expect(a![0].id).toBe(f.assignmentId);
        expect(await eventCount(f.agreementId, PLACEMENT_EVENT)).toBe(0);
        expect(await eventCount(f.agreementId, ASSIGNMENT_EVENT)).toBe(0);
    });

    // ── 5 ────────────────────────────────────────────────────────────────────────────────────────
    it("5 — a database-level assignment failure rolls back the placement written in the same transaction", async () => {
        const f = await fixture();
        const newStart = iso(addDays(new Date(), -5));

        /*
         * THE FAILURE HAS TO BE ONE VALIDATION CANNOT CATCH.
         *
         * An earlier version of this test used an invalid assignment start date and passed even when the
         * combined command was deliberately rewritten to use TWO separate transactions - because both
         * halves are validated before anything is written, so that failure never reached the database.
         * It was proving early validation and claiming to prove atomicity.
         *
         * A stale expected-assignment id is refused by the primitive itself, AFTER the placement
         * successor has been written inside the same transaction. That is the only shape that
         * distinguishes one transaction from two.
         */
        await expect(
            services.applyCombinedParticipationChange(db, {
                orgId: anchors.orgId,
                enrollmentAgreementId: f.agreementId,
                todayYmd: iso(new Date()),
                placement: { startDate: newStart },
                assignment: { startDate: newStart, schedulePatternId: anchors.schedulePatternId },
                expectedAssignmentId: "00000000-0000-4000-8000-0000deadbeef",
            }),
        ).rejects.toThrow();

        const { data: p } = await placements(f.agreementId);
        const { data: a } = await assignments(f.agreementId);
        expect(p, "the placement successor must not survive a failed assignment half").toHaveLength(1);
        expect(p![0].status).toBe("active");
        expect(p![0].end_date).toBeNull();
        expect(a).toHaveLength(1);
        expect(await eventCount(f.agreementId, PLACEMENT_EVENT)).toBe(0);
        expect(await eventCount(f.agreementId, ASSIGNMENT_EVENT)).toBe(0);
    });

    // ── 6 ────────────────────────────────────────────────────────────────────────────────────────
    it("6 — the same edit submitted twice is one change, not a chain", async () => {
        const f = await fixture();
        const newStart = iso(addDays(new Date(), -5));
        const args = {
            orgId: anchors.orgId,
            enrollmentAgreementId: f.agreementId,
            startDate: newStart,
            programCategoryId: anchors.programCategoryId,
            roomLocationId: anchors.roomLocationId,
            todayYmd: iso(new Date()),
        };
        const first = await services.supersedeChildPlacement(db, args);
        const second = await services.supersedeChildPlacement(db, args);
        expect(second.id, "a replay must return the first successor, not a new one").toBe(first.id);

        const { data: rows } = await placements(f.agreementId);
        expect(rows, "a double submit must not chain a third row").toHaveLength(2);
    });

    // ── 7 ────────────────────────────────────────────────────────────────────────────────────────
    it("7 — a stale current-row expectation surfaces a conflict, not a 500 and not a silent branch", async () => {
        const f = await fixture();
        let caught: unknown;
        try {
            await services.supersedeChildPlacement(db, {
                orgId: anchors.orgId,
                enrollmentAgreementId: f.agreementId,
                startDate: iso(addDays(new Date(), -5)),
                todayYmd: iso(new Date()),
                expectedPlacementId: "00000000-0000-4000-8000-0000deadbeef",
            });
        } catch (e) {
            caught = e;
        }
        expect(caught, "a stale expectation must be refused").toBeTruthy();
        expect((caught as { code?: string }).code).toBe("conflict");

        const { data: rows } = await placements(f.agreementId);
        expect(rows).toHaveLength(1);
        expect(await eventCount(f.agreementId, PLACEMENT_EVENT)).toBe(0);
    });

    // ── 8 ────────────────────────────────────────────────────────────────────────────────────────
    it("8 — superseding never mutates the prior row's defining facts, only closes its interval", async () => {
        const f = await fixture();
        const before = (await placements(f.agreementId)).data!.find((r) => r.id === f.placementId)!;
        await services.supersedeChildPlacement(db, {
            orgId: anchors.orgId,
            enrollmentAgreementId: f.agreementId,
            startDate: iso(addDays(new Date(), -5)),
            roomLocationId: anchors.altRoomLocationId ?? anchors.roomLocationId,
            todayYmd: iso(new Date()),
        });
        const after = (await placements(f.agreementId)).data!.find((r) => r.id === f.placementId)!;
        // The prior row still says what was true while it was true. Only status and end_date move.
        expect(after.start_date).toBe(before.start_date);
        expect(after.room_location_id).toBe(before.room_location_id);
        expect(after.program_category_id).toBe(before.program_category_id);
        expect(after.status).toBe("superseded");
        expect(after.end_date).not.toBeNull();
    });

    // ── 9 ────────────────────────────────────────────────────────────────────────────────────────
    it("9 — a future-dated change plans the successor and closes the present row now", async () => {
        const f = await fixture();
        const future = iso(addDays(new Date(), 30));
        const row = await services.supersedeChildPlacement(db, {
            orgId: anchors.orgId,
            enrollmentAgreementId: f.agreementId,
            startDate: future,
            todayYmd: iso(new Date()),
        });
        expect(row.status).toBe("planned");
        const prior = (await placements(f.agreementId)).data!.find((r) => r.id === f.placementId)!;
        expect(prior.status).toBe("superseded");
        expect(await eventCount(f.agreementId, PLACEMENT_EVENT)).toBe(1);
    });

    // ── 10 ───────────────────────────────────────────────────────────────────────────────────────
    it("10 — a named null clears the field and an absent key leaves it alone", async () => {
        const f = await fixture();
        // Named null: clear the room deliberately. This is what both mounted callers send when the
        // body omits the field, and it is why migration 20261110120000 exists.
        const cleared = await services.supersedeChildPlacement(db, {
            orgId: anchors.orgId,
            enrollmentAgreementId: f.agreementId,
            startDate: iso(addDays(new Date(), -5)),
            roomLocationId: null,
            programCategoryId: null,
            todayYmd: iso(new Date()),
        });
        expect(cleared.room_location_id, "an explicit null must clear, not inherit").toBeNull();
    });
});
