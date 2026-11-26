/**
 * THE BEHAVIOURAL MATRIX FOR THE ATOMIC TEMPORAL PRIMITIVE.
 *
 * `apply_participation_operational_change` exists because a single operator edit can change
 * placement AND schedule truth together, and the canonical TypeScript services cannot share a
 * transaction. Three of its guarantees are unobservable from source: that a failing assignment
 * rolls back the placement written in the same call, that a stale concurrent edit is refused
 * rather than branching the supersession chain, and that a retry replays instead of chaining a
 * second successor. Those need a live database, which is what this is.
 *
 * WHY A MISSING PRIMITIVE FAILS RATHER THAN SKIPS. A gate that skips when the thing it guards is
 * absent reports the same green as a gate that ran. If the certification stack is unreachable the
 * suite skips, because that is infrastructure absence and every sibling live test treats it so. But
 * if the stack IS reachable and the function is missing, this FAILS: "not measured" must never read
 * as "passed".
 *
 * ISOLATION. `alloy-cert` is shared by every session on this machine. Each test creates its own
 * `child_enrollment_agreements` row and hangs its fixtures off that; teardown deletes the agreement
 * and the FK cascade removes the placements and assignments with it. No pre-existing row is read for
 * mutation and none is written.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const FN = "apply_participation_operational_change";
const OPERATIONAL = ["planned", "active", "ending"];

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

/** Anchors are discovered, not hardcoded: this stack is reseeded and its ids move. */
type Anchors = {
    orgId: string;
    customerId: string;
    siteLocationId: string;
    roomLocationId: string | null;
    programCategoryId: string | null;
    assignmentTypeId: string | null;
    schedulePatternId: string;
};

function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
}
function addDays(base: Date, n: number): Date {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d;
}

describe.skipIf(!env)("the atomic temporal primitive, against a live database", () => {
    let db: SupabaseClient;
    let anchors: Anchors;
    const createdAgreements: string[] = [];
    const createdMembers: string[] = [];

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });

        // The stack is reachable, so an absent function is a real failure, not a skip.
        const probe = await db.rpc(FN, {
            p_org_id: "00000000-0000-0000-0000-000000000000",
            p_enrollment_agreement_id: "00000000-0000-0000-0000-000000000000",
            p_idempotency_key: "probe",
            p_today: iso(new Date()),
        });
        const missing =
            probe.error
            && /could not find the function|does not exist|PGRST202/i.test(
                `${probe.error.code ?? ""} ${probe.error.message ?? ""}`,
            );
        expect(
            missing,
            `${FN} is not installed on the reachable certification stack. The behavioural matrix is `
                + "the gate before any production caller is wired, so an unmeasured gate fails here "
                + "rather than reporting green. Apply "
                + "supabase/migrations/20261108120000_participation_operational_change_atomic.sql "
                + "and 20261109120000_assignment_successor_carries_its_placement_facts.sql.",
        ).toBe(false);

        // Copy a known-consistent (site, program category, room) triple from an existing placement.
        // `trg_validate_child_placements_consistency` requires the program category to belong to the
        // placement's site, so assembling the three independently fails on real seed data; reusing a
        // combination the database already accepted cannot.
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
        if (!shape) throw new Error("no child_placements row to copy a valid site/program shape from");

        const { data: customerRow } = await db
            .from("customers")
            .select("id")
            .eq("org_id", shape.org_id)
            .limit(1);
        const customerId = (customerRow?.[0] as { id: string } | undefined)?.id;
        if (!customerId) throw new Error("no customers row to hang a fixture member off");

        const { data: patternRow } = await db
            .from("schedule_patterns")
            .select("id")
            .eq("org_id", shape.org_id)
            .limit(1);
        const patternId = (patternRow?.[0] as { id: string } | undefined)?.id;

        // Same principle as the placement shape: an assignment type must belong to the org AND support
        // the subject type, so copy the type and pattern off a child primary row the database already
        // accepted rather than picking the first type in the table (which may be staff-only).
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

        anchors = {
            orgId: shape.org_id,
            customerId,
            siteLocationId: shape.site_location_id,
            roomLocationId: shape.room_location_id,
            // Null across this dataset's placements, so scenario 6 leans on site, room and type for
            // its real weight; the column is still asserted so the copy path cannot silently regress.
            programCategoryId: shape.program_category_id,
            assignmentTypeId: asgShape?.operational_assignment_type_id ?? null,
            schedulePatternId: asgShape?.schedule_pattern_id ?? patternId!,
        };
        expect(anchors.schedulePatternId, "no schedule_patterns row to build an assignment on").toBeTruthy();
    });

    afterEach(async () => {
        // Agreements first: the FK cascade takes the placements and assignments with them, which is
        // what frees the members from their ON DELETE RESTRICT references.
        while (createdAgreements.length) {
            const id = createdAgreements.pop()!;
            await db.from("child_enrollment_agreements").delete().eq("id", id);
        }
        while (createdMembers.length) {
            const id = createdMembers.pop()!;
            await db.from("customer_members").delete().eq("id", id);
        }
    });

    /** One isolated agreement, optionally with an operational placement and child primary assignment. */
    async function fixture(opts: { placement?: boolean; assignment?: boolean; start?: string } = {}) {
        const start = opts.start ?? iso(addDays(new Date(), -30));

        // A fresh member per fixture. `ux_child_enrollment_agreements_one_operational_per_member_site`
        // allows only one operational agreement per member and site, so reusing a seeded member
        // collides with the seed rather than testing anything.
        const { data: mem, error: memErr } = await db
            .from("customer_members")
            .insert({
                org_id: anchors.orgId,
                customer_id: anchors.customerId,
                display_name: `temporal matrix fixture ${crypto.randomUUID().slice(0, 8)}`,
            })
            .select("id")
            .single();
        expect(memErr, `fixture member insert failed: ${memErr?.message}`).toBeNull();
        const memberId = (mem as { id: string }).id;
        createdMembers.push(memberId);

        const { data: agr, error: agrErr } = await db
            .from("child_enrollment_agreements")
            .insert({
                org_id: anchors.orgId,
                customer_member_id: memberId,
                site_location_id: anchors.siteLocationId,
                status: "active",
            })
            .select("id")
            .single();
        expect(agrErr, `fixture agreement insert failed: ${agrErr?.message}`).toBeNull();
        const agreementId = (agr as { id: string }).id;
        createdAgreements.push(agreementId);

        let placementId: string | null = null;
        if (opts.placement !== false) {
            const { data, error } = await db
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
            expect(error, `fixture placement insert failed: ${error?.message}`).toBeNull();
            placementId = (data as { id: string }).id;
        }

        let assignmentId: string | null = null;
        if (opts.assignment !== false) {
            const { data, error } = await db
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
            expect(error, `fixture assignment insert failed: ${error?.message}`).toBeNull();
            assignmentId = (data as { id: string }).id;
        }
        return { agreementId, placementId, assignmentId, start };
    }

    const placements = (agreementId: string) =>
        db.from("child_placements")
            .select("id, status, start_date, end_date, supersedes_placement_id, room_location_id")
            .eq("enrollment_agreement_id", agreementId)
            .order("start_date", { ascending: true });

    const assignments = (agreementId: string) =>
        db.from("schedule_assignments")
            .select("id, status, start_date, end_date, supersedes_assignment_id, site_location_id, room_location_id, program_category_id, operational_assignment_type_id, commitment_kind")
            .eq("enrollment_agreement_id", agreementId)
            .order("start_date", { ascending: true });

    function call(args: Record<string, unknown>) {
        return db.rpc(FN, { p_today: iso(new Date()), ...args });
    }

    // ── 1 ─────────────────────────────────────────────────────────────────────────────────────────
    it("1 — a placement-only change closes the prior interval the day before the successor starts", async () => {
        const f = await fixture({ assignment: false });
        const newStart = iso(addDays(new Date(), -5));
        const { data, error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s1-${f.agreementId}`,
            p_placement: { start_date: newStart, reason_key: "room_move" },
        });
        expect(error, `rpc failed: ${error?.message}`).toBeNull();
        expect((data as Record<string, unknown>).ok).toBe(true);

        const { data: rows } = await placements(f.agreementId);
        expect(rows).toHaveLength(2);
        const prior = rows!.find((r) => r.id === f.placementId)!;
        const successor = rows!.find((r) => r.id !== f.placementId)!;
        expect(prior.status).toBe("superseded");
        expect(prior.end_date).toBe(iso(addDays(new Date(newStart), -1)));
        expect(successor.status).toBe("active");
        expect(successor.start_date).toBe(newStart);
        expect(successor.end_date).toBeNull();
        expect(successor.supersedes_placement_id).toBe(f.placementId);
    });

    // ── 2 ─────────────────────────────────────────────────────────────────────────────────────────
    it("2 — an assignment-only change supersedes the child primary row the same way", async () => {
        const f = await fixture({ placement: false });
        const newStart = iso(addDays(new Date(), -5));
        const { data, error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s2-${f.agreementId}`,
            p_assignment: { start_date: newStart },
        });
        expect(error, `rpc failed: ${error?.message}`).toBeNull();
        expect((data as Record<string, unknown>).ok).toBe(true);

        const { data: rows } = await assignments(f.agreementId);
        expect(rows).toHaveLength(2);
        const prior = rows!.find((r) => r.id === f.assignmentId)!;
        const successor = rows!.find((r) => r.id !== f.assignmentId)!;
        expect(prior.status).toBe("superseded");
        expect(prior.end_date).toBe(iso(addDays(new Date(newStart), -1)));
        expect(successor.status).toBe("active");
        expect(successor.supersedes_assignment_id).toBe(f.assignmentId);
    });

    // ── 3 ─────────────────────────────────────────────────────────────────────────────────────────
    it("3 — a combined change persists both tables from one call", async () => {
        const f = await fixture();
        const newStart = iso(addDays(new Date(), -5));
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s3-${f.agreementId}`,
            p_placement: { start_date: newStart },
            p_assignment: { start_date: newStart },
        });
        expect(error, `rpc failed: ${error?.message}`).toBeNull();

        const { data: p } = await placements(f.agreementId);
        const { data: a } = await assignments(f.agreementId);
        expect(p).toHaveLength(2);
        expect(a).toHaveLength(2);
        expect(p!.filter((r) => OPERATIONAL.includes(r.status as string))).toHaveLength(1);
        expect(a!.filter((r) => OPERATIONAL.includes(r.status as string))).toHaveLength(1);
    });

    // ── 4 ─────────────────────────────────────────────────────────────────────────────────────────
    it("4 — a future-dated change yields a planned successor and closes the present row now", async () => {
        const f = await fixture({ assignment: false });
        const future = iso(addDays(new Date(), 21));
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s4-${f.agreementId}`,
            p_placement: { start_date: future },
        });
        expect(error, `rpc failed: ${error?.message}`).toBeNull();

        const { data: rows } = await placements(f.agreementId);
        const successor = rows!.find((r) => r.id !== f.placementId)!;
        const prior = rows!.find((r) => r.id === f.placementId)!;
        expect(successor.status).toBe("planned");
        // The doctrine is explicit: the prior row does NOT stay active until the date arrives.
        expect(prior.status).toBe("superseded");
    });

    // ── 5 ─────────────────────────────────────────────────────────────────────────────────────────
    it("5 — a change effective today yields an active successor, not a planned one", async () => {
        const f = await fixture({ assignment: false });
        const today = iso(new Date());
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s5-${f.agreementId}`,
            p_placement: { start_date: today },
        });
        expect(error, `rpc failed: ${error?.message}`).toBeNull();
        const { data: rows } = await placements(f.agreementId);
        expect(rows!.find((r) => r.id !== f.placementId)!.status).toBe("active");
    });

    // ── 6 ─────────────────────────────────────────────────────────────────────────────────────────
    it("6 — the assignment successor carries the facts the caller did not ask to change", async () => {
        const f = await fixture({ placement: false });
        const newStart = iso(addDays(new Date(), -5));
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s6-${f.agreementId}`,
            p_assignment: { start_date: newStart },
        });
        expect(error, `rpc failed: ${error?.message}`).toBeNull();

        const { data: rows } = await assignments(f.agreementId);
        const prior = rows!.find((r) => r.id === f.assignmentId)!;
        const successor = rows!.find((r) => r.id !== f.assignmentId)!;

        // 20261108120000 omitted all of these from the successor INSERT, so a supersession silently
        // moved the child out of their room. Only what the caller names may change.
        //
        // Compared as one object on purpose: asserting field by field stops at the first mismatch and
        // hides how much else was dropped, which is the difference between "the room moved" and "the
        // successor is a different child's worth of facts".
        const carried = (r: typeof prior) => ({
            site_location_id: r.site_location_id,
            room_location_id: r.room_location_id,
            program_category_id: r.program_category_id,
            operational_assignment_type_id: r.operational_assignment_type_id,
            commitment_kind: r.commitment_kind,
        });
        expect(
            carried(successor),
            "the successor dropped facts the caller never asked to change",
        ).toEqual(carried(prior));
    });

    // ── 7 ─────────────────────────────────────────────────────────────────────────────────────────
    it("7 — a replayed idempotency key returns the stored result and writes no second successor", async () => {
        const f = await fixture({ assignment: false });
        const newStart = iso(addDays(new Date(), -5));
        const args = {
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s7-${f.agreementId}`,
            p_placement: { start_date: newStart },
        };
        const first = await call(args);
        expect(first.error, `first call failed: ${first.error?.message}`).toBeNull();
        expect((first.data as Record<string, unknown>).replayed).toBe(false);

        const second = await call(args);
        expect(second.error, `replay failed: ${second.error?.message}`).toBeNull();
        expect((second.data as Record<string, unknown>).replayed).toBe(true);

        // The point of the gate: `supersedeChildPlacement` was not retry-idempotent and would have
        // superseded its own successor, chaining a spurious third row.
        const { data: rows } = await placements(f.agreementId);
        expect(rows).toHaveLength(2);
    });

    // ── 8 ─────────────────────────────────────────────────────────────────────────────────────────
    it("8 — a stale expected placement id is refused and writes nothing", async () => {
        const f = await fixture({ assignment: false });
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s8-${f.agreementId}`,
            p_placement: { start_date: iso(addDays(new Date(), -5)) },
            p_expected_placement_id: "00000000-0000-4000-8000-0000deadbeef",
        });
        expect(error, "a stale precondition must refuse").not.toBeNull();
        expect(`${error?.message}`).toMatch(/stale_placement/);

        const { data: rows } = await placements(f.agreementId);
        expect(rows).toHaveLength(1);
        expect(rows![0].status).toBe("active");
    });

    // ── 9 ─────────────────────────────────────────────────────────────────────────────────────────
    it("9 — a start on or before the prior start is refused, so no zero-length interval is published", async () => {
        const f = await fixture({ assignment: false });
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s9-${f.agreementId}`,
            p_placement: { start_date: f.start },
        });
        expect(error, "a same-day-as-prior start must refuse").not.toBeNull();
        expect(`${error?.message}`).toMatch(/invalid_placement_start/);
        const { data: rows } = await placements(f.agreementId);
        expect(rows).toHaveLength(1);
    });

    // ── 10 ────────────────────────────────────────────────────────────────────────────────────────
    it("10 — a failing assignment rolls back the placement written in the same call", async () => {
        const f = await fixture();
        // The placement half is valid; the assignment half is not. All-or-nothing is the entire
        // reason this lives in SQL rather than in two TypeScript services.
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s10-${f.agreementId}`,
            p_placement: { start_date: iso(addDays(new Date(), -5)) },
            p_assignment: { start_date: f.start },
        });
        expect(error, "the combined call must fail when one half is invalid").not.toBeNull();
        expect(`${error?.message}`).toMatch(/invalid_assignment_start/);

        const { data: p } = await placements(f.agreementId);
        const { data: a } = await assignments(f.agreementId);
        expect(p, "the placement successor must not survive a failed assignment").toHaveLength(1);
        expect(p![0].status).toBe("active");
        expect(p![0].end_date).toBeNull();
        expect(a).toHaveLength(1);
    });

    // ── 11 ────────────────────────────────────────────────────────────────────────────────────────
    it("11 — supersession refuses when there is no operational row to supersede", async () => {
        const f = await fixture({ placement: false, assignment: false });
        const { error } = await call({
            p_org_id: anchors.orgId,
            p_enrollment_agreement_id: f.agreementId,
            p_idempotency_key: `s11-${f.agreementId}`,
            p_placement: { start_date: iso(new Date()) },
        });
        expect(error, "supersession is not the initial-placement path").not.toBeNull();
        expect(`${error?.message}`).toMatch(/no_operational_placement/);
    });
});
