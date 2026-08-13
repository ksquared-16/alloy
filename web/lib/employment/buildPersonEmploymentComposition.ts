/**
 * Person → Employment composition.
 *
 * Meaning first: this answers "does this person currently work here, in what
 * capacity, where, and since when" — it is not a field dump of the employments
 * row. Fields that carry no operational meaning for the operator (source_key,
 * supersedes_employment_id, audit columns) are deliberately absent.
 *
 * Composed onto the existing canonical Person record payload. There is no Staff
 * entity, no Staff drawer and no Staff view model.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    loadEmploymentConfiguredFacts,
    type EmploymentConfiguredFact,
} from "@/lib/employment/employmentConfiguredFacts";
import { listEmploymentsForPerson } from "@/lib/employment/employmentService";
import { isOpenEmploymentStatus, type EmploymentRow } from "@/lib/employment/employmentTypes";

export type PersonEmploymentPeriod = {
    id: string;
    status: string;
    /** "Active" / "Ending 30 Sep 2026" / "Ended" — operator language, not enum. */
    state_label: string;
    is_open: boolean;
    position_label: string | null;
    employment_type: string | null;
    employment_type_label: string | null;
    primary_location_id: string | null;
    primary_location_label: string | null;
    external_employee_id: string | null;
    start_date: string;
    end_date: string | null;
    end_reason_key: string | null;
};

export type PersonEmploymentComposition = {
    /** True when this person holds an open employment relationship in this org. */
    is_staff: boolean;
    /** The open period, when there is one. */
    current: PersonEmploymentPeriod | null;
    /** Every period including history, newest first. */
    periods: PersonEmploymentPeriod[];
    /** Configured tenant facts for the current period only. */
    configured_facts: EmploymentConfiguredFact[];
    /**
     * True when this person has never held employment here. The surface shows an
     * Add Staff affordance rather than an empty "Staff" card — an empty card would
     * assert a relationship that does not exist.
     */
    never_employed: boolean;
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
    full_time: "Full time",
    part_time: "Part time",
    temporary: "Temporary",
    contract: "Contract",
    volunteer: "Volunteer",
};

function formatYmd(ymd: string | null): string | null {
    if (!ymd) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = Number(m[2]) - 1;
    const month = months[monthIndex] ?? m[2];
    return `${month} ${Number(m[3])}, ${m[1]}`;
}

function stateLabel(row: EmploymentRow): string {
    switch (row.employment_status) {
        case "active":
            return "Active";
        case "pending_start":
            return `Starts ${formatYmd(row.start_date) ?? row.start_date}`;
        case "ending":
            return row.end_date ? `Ending ${formatYmd(row.end_date)}` : "Ending";
        case "ended":
            return row.end_date ? `Ended ${formatYmd(row.end_date)}` : "Ended";
        case "canceled":
            return "Canceled";
        default:
            return row.employment_status;
    }
}

function toPeriod(
    row: EmploymentRow,
    positionLabels: Map<string, string>,
    locationLabels: Map<string, string>
): PersonEmploymentPeriod {
    return {
        id: row.id,
        status: row.employment_status,
        state_label: stateLabel(row),
        is_open: isOpenEmploymentStatus(row.employment_status),
        position_label: row.position_id ? (positionLabels.get(row.position_id) ?? null) : null,
        employment_type: row.employment_type,
        employment_type_label: row.employment_type
            ? (EMPLOYMENT_TYPE_LABELS[row.employment_type] ?? row.employment_type)
            : null,
        primary_location_id: row.primary_location_id,
        primary_location_label: row.primary_location_id
            ? (locationLabels.get(row.primary_location_id) ?? null)
            : null,
        external_employee_id: row.external_employee_id,
        start_date: row.start_date,
        end_date: row.end_date,
        end_reason_key: row.end_reason_key,
    };
}

export async function buildPersonEmploymentComposition(
    supabase: SupabaseClient,
    orgId: string,
    personId: string
): Promise<PersonEmploymentComposition> {
    const rows = await listEmploymentsForPerson(supabase, orgId, personId);

    if (rows.length === 0) {
        return {
            is_staff: false,
            current: null,
            periods: [],
            configured_facts: [],
            never_employed: true,
        };
    }

    const positionIds = [...new Set(rows.map((r) => r.position_id).filter((v): v is string => Boolean(v)))];
    const locationIds = [
        ...new Set(rows.map((r) => r.primary_location_id).filter((v): v is string => Boolean(v))),
    ];

    const [positionsRes, locationsRes] = await Promise.all([
        positionIds.length > 0
            ? supabase
                  .from("employment_positions")
                  .select("id, label")
                  .eq("org_id", orgId)
                  .in("id", positionIds)
            : Promise.resolve({ data: [] as { id: string; label: string }[] }),
        locationIds.length > 0
            ? supabase.from("locations").select("id, label").eq("org_id", orgId).in("id", locationIds)
            : Promise.resolve({ data: [] as { id: string; label: string | null }[] }),
    ]);

    const positionLabels = new Map(
        ((positionsRes.data ?? []) as { id: string; label: string }[]).map((r) => [r.id, r.label])
    );
    const locationLabels = new Map(
        ((locationsRes.data ?? []) as { id: string; label: string | null }[]).map((r) => [
            r.id,
            r.label ?? "",
        ])
    );

    const periods = rows.map((r) => toPeriod(r, positionLabels, locationLabels));
    const currentRow = rows.find((r) => isOpenEmploymentStatus(r.employment_status)) ?? null;
    const current = currentRow ? (periods.find((p) => p.id === currentRow.id) ?? null) : null;

    const configured_facts = currentRow
        ? await loadEmploymentConfiguredFacts(supabase, orgId, currentRow.id)
        : [];

    return {
        is_staff: Boolean(currentRow),
        current,
        periods,
        configured_facts,
        never_employed: false,
    };
}
