/**
 * Staff directory — who works here, read-only.
 *
 * Composed from `employments` joined to canonical `persons`. There is no staff
 * table and no staff search index; this is a projection over the employment
 * edge, exactly like every other roster read model in the platform.
 */

import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isOpenEmploymentStatus } from "@/lib/employment/employmentTypes";

export type StaffDirectoryEntry = {
    employmentId: string;
    personId: string;
    displayName: string;
    email: string | null;
    positionLabel: string | null;
    employmentType: string | null;
    primaryLocationLabel: string | null;
    employmentStatus: string;
    isOpen: boolean;
    startDate: string;
    endDate: string | null;
};

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const includeEnded = new URL(request.url).searchParams.get("include_ended") === "true";

    const supabase = createAdminClient();
    const { data: employmentData, error } = await supabase
        .from("employments")
        .select(
            "id, person_id, employment_status, employment_type, position_id, primary_location_id, start_date, end_date"
        )
        .eq("org_id", ctx.orgId)
        .order("start_date", { ascending: false });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (employmentData ?? []) as {
        id: string;
        person_id: string;
        employment_status: string;
        employment_type: string | null;
        position_id: string | null;
        primary_location_id: string | null;
        start_date: string;
        end_date: string | null;
    }[];

    const visible = includeEnded ? rows : rows.filter((r) => isOpenEmploymentStatus(r.employment_status));
    if (visible.length === 0) {
        return NextResponse.json({ staff: [] as StaffDirectoryEntry[] });
    }

    const personIds = [...new Set(visible.map((r) => r.person_id))];
    const positionIds = [...new Set(visible.map((r) => r.position_id).filter((v): v is string => Boolean(v)))];
    const locationIds = [
        ...new Set(visible.map((r) => r.primary_location_id).filter((v): v is string => Boolean(v))),
    ];

    const [personsRes, positionsRes, locationsRes] = await Promise.all([
        supabase
            .from("persons")
            .select("id, full_name, first_name, last_name, email")
            .eq("org_id", ctx.orgId)
            .in("id", personIds),
        positionIds.length > 0
            ? supabase
                  .from("employment_positions")
                  .select("id, label")
                  .eq("org_id", ctx.orgId)
                  .in("id", positionIds)
            : Promise.resolve({ data: [] as { id: string; label: string }[] }),
        locationIds.length > 0
            ? supabase.from("locations").select("id, label").eq("org_id", ctx.orgId).in("id", locationIds)
            : Promise.resolve({ data: [] as { id: string; label: string | null }[] }),
    ]);

    const personById = new Map(
        ((personsRes.data ?? []) as {
            id: string;
            full_name: string | null;
            first_name: string | null;
            last_name: string | null;
            email: string | null;
        }[]).map((p) => [p.id, p])
    );
    const positionLabelById = new Map(
        ((positionsRes.data ?? []) as { id: string; label: string }[]).map((p) => [p.id, p.label])
    );
    const locationLabelById = new Map(
        ((locationsRes.data ?? []) as { id: string; label: string | null }[]).map((l) => [l.id, l.label])
    );

    const staff: StaffDirectoryEntry[] = visible.map((r) => {
        const person = personById.get(r.person_id);
        const composed = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
        return {
            employmentId: r.id,
            personId: r.person_id,
            displayName: (person?.full_name ?? "").trim() || composed || "Unnamed person",
            email: person?.email ?? null,
            positionLabel: r.position_id ? (positionLabelById.get(r.position_id) ?? null) : null,
            employmentType: r.employment_type,
            primaryLocationLabel: r.primary_location_id
                ? (locationLabelById.get(r.primary_location_id) ?? null)
                : null,
            employmentStatus: r.employment_status,
            isOpen: isOpenEmploymentStatus(r.employment_status),
            startDate: r.start_date,
            endDate: r.end_date,
        };
    });

    staff.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json({ staff });
}
