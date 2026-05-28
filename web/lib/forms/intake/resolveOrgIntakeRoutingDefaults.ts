import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";

export type OrgIntakeRoutingDefaults = {
    default_vertical_id: string | null;
    default_location_id: string | null;
    default_work_unit_id: string | null;
    default_department_id: string | null;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

function readUuid(val: unknown): string | null {
    return typeof val === "string" && UUID_RE.test(val.trim()) ? val.trim() : null;
}

const EMPTY: OrgIntakeRoutingDefaults = {
    default_vertical_id: null,
    default_location_id: null,
    default_work_unit_id: null,
    default_department_id: null,
};

/** Best-effort org routing for intake public links — fills only when platform rows exist. */
export async function resolveOrgIntakeRoutingDefaults(
    supabase: SupabaseClient,
    orgId: string,
    intent: OperationalIntentKey | null
): Promise<OrgIntakeRoutingDefaults> {
    if (!intent || intent === "custom" || intent === "existing_family" || intent === "packet_step") {
        return EMPTY;
    }

    const verticalSlugs =
        intent === "enrollment_lead" || intent === "waitlist" || intent === "operational_document"
            ? ["childcare", "cleaning"]
            : [];

    let verticalId: string | null = null;
    for (const slug of verticalSlugs) {
        const { data } = await supabase
            .from("verticals")
            .select("id")
            .eq("slug", slug)
            .eq("is_active", true)
            .maybeSingle();
        verticalId = readUuid(data?.id);
        if (verticalId) break;
    }
    if (!verticalId) {
        const { data } = await supabase
            .from("verticals")
            .select("id")
            .eq("is_active", true)
            .order("name")
            .limit(1)
            .maybeSingle();
        verticalId = readUuid(data?.id);
    }

    const { data: locRow } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .eq("location_type", "site")
        .order("created_at")
        .limit(1)
        .maybeSingle();
    const locationId = readUuid(locRow?.id);

    const { data: enrollDept } = await supabase
        .from("departments")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .eq("key", "enrollment")
        .maybeSingle();
    let departmentId = readUuid(enrollDept?.id);

    if (!departmentId) {
        const { data: deptRow } = await supabase
            .from("departments")
            .select("id")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .order("name")
            .limit(1)
            .maybeSingle();
        departmentId = readUuid(deptRow?.id);
    }

    let workUnitId: string | null = null;
    if (departmentId) {
        const { data: wuRow } = await supabase
            .from("work_units")
            .select("id")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .eq("department_id", departmentId)
            .order("name")
            .limit(1)
            .maybeSingle();
        workUnitId = readUuid(wuRow?.id);
    }

    return {
        default_vertical_id: verticalId,
        default_location_id: locationId,
        default_work_unit_id: workUnitId,
        default_department_id: departmentId,
    };
}

export function mergeRoutingDefaultsIntoMetadata(
    metadata: Record<string, unknown>,
    routing: OrgIntakeRoutingDefaults
): Record<string, unknown> {
    const next = { ...metadata };
    if (!readUuid(next.default_vertical_id) && routing.default_vertical_id) {
        next.default_vertical_id = routing.default_vertical_id;
    }
    if (!readUuid(next.default_location_id) && routing.default_location_id) {
        next.default_location_id = routing.default_location_id;
    }
    if (!readUuid(next.default_work_unit_id) && routing.default_work_unit_id) {
        next.default_work_unit_id = routing.default_work_unit_id;
    }
    if (!readUuid(next.default_department_id) && routing.default_department_id) {
        next.default_department_id = routing.default_department_id;
    }
    return next;
}
