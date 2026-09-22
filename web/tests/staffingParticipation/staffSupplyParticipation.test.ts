/**
 * STAFFING PARTICIPATION AS THE STAFF-SUPPLY AUTHORITY.
 *
 * The hazard this slice exists to remove is specific and was measured, not imagined:
 * `staffing_participation` had never been read, so every eligible Staff Assignment
 * counted as supply regardless of its value — while every Staff-capable type in
 * staging sat at `none`. Reading the field without classifying first would have
 * deleted all Staff supply.
 *
 * These drive a real database because the invariants are about rows: which
 * Assignments the builder counts, and what the migration gate reports.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

import { buildStaffSupply } from "@/lib/scheduling/supply/buildStaffSupply";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;
const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

const TAG = "qa_participation";
let orgId = "";
let siteId = "";
let personId = "";
let patternId = "";
let startDate = "";
const madeTypes: string[] = [];
const madeAssignments: string[] = [];

async function makeType(participation: string, subjects: string[] = ["staff"]): Promise<string> {
    const { data, error } = await db
        .from("operational_assignment_types")
        .insert({
            org_id: orgId, key: `${TAG}_${randomUUID().slice(0, 8)}`, label: TAG,
            subject_types: subjects, staffing_participation: participation,
        })
        .select("id").single();
    if (error) throw new Error(`makeType: ${error.message}`);
    const id = (data as { id: string }).id;
    madeTypes.push(id);
    return id;
}

async function makeStaffAssignment(typeId: string | null): Promise<string> {
    const { data, error } = await db
        .from("schedule_assignments")
        .insert({
            org_id: orgId, subject_type: "staff", subject_person_id: personId,
            site_location_id: siteId, schedule_pattern_id: patternId,
            operational_assignment_type_id: typeId,
            start_date: startDate, end_date: null, status: "active",
            commitment_kind: "committed", source_key: TAG,
        })
        .select("id").single();
    if (error) throw new Error(`makeStaffAssignment: ${error.message}`);
    const id = (data as { id: string }).id;
    madeAssignments.push(id);
    return id;
}

function plusDays(ymd: string, n: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
}

/**
 * Supply across a full week, so the pattern's weekdays are certainly represented.
 * A single-day window would make the assertion depend on which weekday the fixture
 * happened to start on.
 */
async function supplyFor(): Promise<{ count: number; unresolved: number }> {
    const model = await buildStaffSupply(db, {
        orgId, siteLocationId: siteId, dateStart: startDate, dateEnd: plusDays(startDate, 6),
    });
    const ours = model.members.filter((m) => madeAssignments.includes(m.assignmentId));
    const counted = new Set(
        model.cells.flatMap((c) => c.scheduledStaff.map((s) => s.assignmentId))
    );
    return {
        count: ours.filter((m) => counted.has(m.assignmentId)).length,
        unresolved: model.unresolved.filter((u) => madeAssignments.includes(u.assignmentId)).length,
    };
}

describe.runIf(LIVE)("staff supply participation", () => {
    beforeEach(async () => {
        const { data } = await db
            .from("schedule_assignments")
            .select("org_id, site_location_id, subject_person_id, schedule_pattern_id, start_date")
            .eq("subject_type", "staff").not("subject_person_id", "is", null).limit(1).single();
        const r = data as Record<string, string>;
        orgId = r.org_id; siteId = r.site_location_id; personId = r.subject_person_id;
        patternId = r.schedule_pattern_id; startDate = r.start_date;
    });

    afterEach(async () => {
        for (const id of madeAssignments.splice(0)) await db.from("schedule_assignments").delete().eq("id", id);
        for (const id of madeTypes.splice(0)) await db.from("operational_assignment_types").delete().eq("id", id);
    });

    it("a supply type contributes baseline Staff supply", async () => {
        await makeStaffAssignment(await makeType("supply"));
        const s = await supplyFor();
        expect(s.count).toBe(1);
        expect(s.unresolved).toBe(0);
    });

    it("an intentional none type does NOT contribute supply — and that is legitimate", async () => {
        await makeStaffAssignment(await makeType("none"));
        const s = await supplyFor();
        expect(s.count).toBe(0);
        // Not unresolved: the operator decided. Unresolved and excluded are different answers.
        expect(s.unresolved).toBe(0);
    });

    it("a demand type does not accidentally contribute Staff supply", async () => {
        await makeStaffAssignment(await makeType("demand", ["child", "staff"]));
        expect((await supplyFor()).count).toBe(0);
    });

    it("a Staff Assignment with NO type fails honestly rather than reading as a clean zero", async () => {
        await makeStaffAssignment(null);
        const s = await supplyFor();
        expect(s.count).toBe(0);
        // The distinction that matters: reported as unclassified, not silently dropped.
        expect(s.unresolved).toBe(1);
    });

    it("participation does not replace the other eligibility rules", async () => {
        // A `supply` type on an ENDED assignment must still not count. Participation is
        // an additional classification, not a replacement for status, dates,
        // commitment kind or employment coverage.
        const typeId = await makeType("supply");
        const id = await makeStaffAssignment(typeId);
        expect((await supplyFor()).count).toBe(1);

        await db.from("schedule_assignments").update({ status: "ended" }).eq("id", id);
        expect((await supplyFor()).count).toBe(0);
    });

    it("the migration gate reports a legacy Staff type that still carries live supply", async () => {
        const typeId = await makeType("none");
        await makeStaffAssignment(typeId);
        const { data } = await db.rpc("staff_supply_participation_unresolved");
        const rows = (data ?? []) as { assignment_type_id: string; live_supply_assignments: number }[];
        const mine = rows.find((r) => r.assignment_type_id === typeId);
        expect(mine, "gate must name the unclassified type").toBeDefined();
        expect(Number(mine!.live_supply_assignments)).toBeGreaterThan(0);
    });

    it("the gate clears once that type is classified supply", async () => {
        const typeId = await makeType("none");
        await makeStaffAssignment(typeId);
        await db.from("operational_assignment_types").update({ staffing_participation: "supply" }).eq("id", typeId);
        const { data } = await db.rpc("staff_supply_participation_unresolved");
        const rows = (data ?? []) as { assignment_type_id: string }[];
        expect(rows.find((r) => r.assignment_type_id === typeId)).toBeUndefined();
    });

    it("a Staff-capable type with no live supply may stay none, and the gate stays quiet", async () => {
        const typeId = await makeType("none"); // no assignments attached
        const { data } = await db.rpc("staff_supply_participation_unresolved");
        const rows = (data ?? []) as { assignment_type_id: string }[];
        expect(rows.find((r) => r.assignment_type_id === typeId)).toBeUndefined();
    });

    it("the untyped-supply reporter names untyped Staff assignments", async () => {
        const id = await makeStaffAssignment(null);
        const { data } = await db.rpc("staff_supply_untyped_assignments");
        const rows = (data ?? []) as { assignment_id: string }[];
        expect(rows.some((r) => r.assignment_id === id)).toBe(true);
    });
});
