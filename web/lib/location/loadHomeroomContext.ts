/**
 * The reads `deriveHomerooms` needs, done once for a batch: the spaces (kind and configured uses),
 * the org's Homeroom-providing categories, and — when the caller has not already read them — the
 * committed placements of the agreements involved. Every consumer that shows a homeroom builds its
 * input here, so the roster and the Focus Panel cannot read different facts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalUnitRoleFromStorage } from "@/lib/location/canonicalLocationModel";
import type { HomeroomAssignment, HomeroomPlacement, HomeroomSpace } from "@/lib/location/homerooms";
import { readSpaceUses, readSpaceUsesState } from "@/lib/location/spaceUse";
import { readAssignmentTypeBehavior } from "@/lib/operationalAssignments/assignmentTypeBehavior";

export type HomeroomContext = {
    spacesById: Map<string, HomeroomSpace>;
    homeroomCategoryIds: Set<string>;
    placementsByAgreement: Map<string, HomeroomPlacement[]>;
};

const CHUNK = 100;
const chunks = (ids: readonly string[]) => {
    const distinct = [...new Set(ids.filter(Boolean))];
    const out: string[][] = [];
    for (let i = 0; i < distinct.length; i += CHUNK) out.push(distinct.slice(i, i + CHUNK));
    return out;
};

/** A `schedule_assignments` row in the resolver's terms (any read that selected these columns). */
export function homeroomAssignmentFromRow(row: {
    id: string;
    subject_type?: string | null;
    commitment_kind?: string | null;
    status: string;
    start_date: string;
    end_date: string | null;
    room_location_id: string | null;
    operational_assignment_type_id: string | null;
    enrollment_agreement_id: string | null;
}): HomeroomAssignment {
    return {
        id: row.id,
        subjectType: row.subject_type === "staff" ? "staff" : "child",
        commitmentKind: row.commitment_kind === "proposed" ? "proposed" : "committed",
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date ?? null,
        roomLocationId: row.room_location_id ?? null,
        categoryId: row.operational_assignment_type_id ?? null,
        enrollmentAgreementId: row.enrollment_agreement_id ?? null,
    };
}

export function homeroomPlacementFromRow(row: {
    enrollment_agreement_id: string | null;
    room_location_id: string | null;
    status: string;
    start_date: string;
    end_date: string | null;
}): HomeroomPlacement | null {
    if (!row.enrollment_agreement_id) return null;
    return {
        enrollmentAgreementId: row.enrollment_agreement_id,
        roomLocationId: row.room_location_id,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
    };
}

/**
 * The child assignments that can be in effect on a date, for these members: every row whose
 * inclusive window covers the date, whatever its lifecycle status (the resolver drops canceled and
 * proposed rows). A reader that lists only live rows — the roster — uses this so a superseded row
 * covering the gap before a planned move still counts, exactly as in the scheduling projection.
 */
export async function loadHomeroomAssignments(
    supabase: SupabaseClient,
    orgId: string,
    args: { memberIds: readonly string[]; onDate: string },
): Promise<Map<string, HomeroomAssignment[]>> {
    const byMember = new Map<string, HomeroomAssignment[]>();
    for (const chunk of chunks(args.memberIds)) {
        const { data, error } = await supabase
            .from("schedule_assignments")
            .select("id, customer_member_id, subject_type, commitment_kind, status, start_date, end_date, room_location_id, operational_assignment_type_id, enrollment_agreement_id")
            .eq("org_id", orgId)
            .eq("subject_type", "child")
            .in("customer_member_id", chunk)
            .lte("start_date", args.onDate)
            .or(`end_date.is.null,end_date.gte.${args.onDate}`);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<Parameters<typeof homeroomAssignmentFromRow>[0] & { customer_member_id: string }>) {
            (byMember.get(row.customer_member_id) ?? byMember.set(row.customer_member_id, []).get(row.customer_member_id)!).push(homeroomAssignmentFromRow(row));
        }
    }
    return byMember;
}

export async function loadHomeroomContext(
    supabase: SupabaseClient,
    orgId: string,
    args: {
        roomIds: readonly string[];
        /** Agreements whose placements to read; omit when `placements` are supplied. */
        agreementIds?: readonly string[];
        /** Placements the caller already read (skips the placement query). */
        placements?: readonly HomeroomPlacement[];
    },
): Promise<HomeroomContext> {
    const placementsByAgreement = new Map<string, HomeroomPlacement[]>();
    let placements: HomeroomPlacement[] = [...(args.placements ?? [])];
    if (!args.placements && args.agreementIds?.length) {
        for (const chunk of chunks(args.agreementIds)) {
            const { data, error } = await supabase
                .from("child_placements")
                .select("enrollment_agreement_id, room_location_id, status, start_date, end_date")
                .eq("org_id", orgId)
                .in("enrollment_agreement_id", chunk);
            if (error) throw new Error(error.message);
            for (const row of data ?? []) {
                const p = homeroomPlacementFromRow(row as Parameters<typeof homeroomPlacementFromRow>[0]);
                if (p) placements.push(p);
            }
        }
    }
    for (const p of placements) (placementsByAgreement.get(p.enrollmentAgreementId) ?? placementsByAgreement.set(p.enrollmentAgreementId, []).get(p.enrollmentAgreementId)!).push(p);

    const spacesById = new Map<string, HomeroomSpace>();
    const roomIds = [...args.roomIds, ...placements.map((p) => p.roomLocationId ?? "")];
    const spaceReads = chunks(roomIds).map(async (chunk) => {
        const { data, error } = await supabase
            .from("locations")
            .select("id, label, location_type, unit_role, metadata")
            .eq("org_id", orgId)
            .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as Array<{ id: string; label: string | null; location_type: unknown; unit_role: unknown; metadata: Record<string, unknown> | null }>) {
            const unitRole = canonicalUnitRoleFromStorage(r.location_type, r.unit_role);
            if (!unitRole) continue;
            spacesById.set(r.id, {
                id: r.id,
                label: r.label?.trim() || null,
                unitRole,
                spaceUses: readSpaceUses(r.metadata),
                spaceUsesMalformed: readSpaceUsesState(r.metadata).kind === "malformed",
            });
        }
    });
    const homeroomCategoryIds = new Set<string>();
    const categoryRead = (async () => {
        const { data, error } = await supabase
            .from("operational_assignment_types")
            .select("id, default_behavior, subject_types")
            .eq("org_id", orgId);
        if (error) throw new Error(error.message);
        for (const t of (data ?? []) as Array<{ id: string; default_behavior: unknown; subject_types: string[] | null }>) {
            if (!(t.subject_types ?? ["child"]).includes("child")) continue;
            if (readAssignmentTypeBehavior(t.default_behavior).providesHomeroom === true) homeroomCategoryIds.add(t.id);
        }
    })();
    await Promise.all([...spaceReads, categoryRead]);
    return { spacesById, homeroomCategoryIds, placementsByAgreement };
}
