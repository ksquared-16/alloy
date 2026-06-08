/**
 * Map form intake child hints → opportunity_customer_members placement columns (Card 4).
 * Pure — no Supabase.
 */

import type { FormIntakeChildHint } from "@/lib/forms/intake/formLeadCaptureTypes";

export type IntakeChildPlacementScopeSource =
    | "child_field"
    | "opportunity_fallback"
    | "link_default"
    | "none";

export type ResolvedIntakeChildOcmFields = {
    location_id: string | null;
    program_room_cohort_key: string | null;
    desired_program_type: string | null;
    desired_schedule_type: string | null;
    desired_start_date: string | null;
    placement_scope: {
        location_source: IntakeChildPlacementScopeSource;
        cohort_source: "child_field" | "none";
    };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimUuid(raw: string | null | undefined): string | null {
    const t = (raw ?? "").trim();
    return t && UUID_RE.test(t) ? t : null;
}

function trimKey(raw: string | null | undefined): string | null {
    const t = (raw ?? "").trim();
    return t.length ? t : null;
}

function trimDateOnly(raw: string | null | undefined): string | null {
    const t = (raw ?? "").trim();
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export function resolveIntakeChildOcmFields(params: {
    child: FormIntakeChildHint;
    opportunityLocationId?: string | null;
    linkDefaultLocationId?: string | null;
}): ResolvedIntakeChildOcmFields {
    const childSite = trimUuid(params.child.location_id);
    const oppSite = trimUuid(params.opportunityLocationId);
    const linkSite = trimUuid(params.linkDefaultLocationId);

    let location_id: string | null = null;
    let location_source: IntakeChildPlacementScopeSource = "none";
    if (childSite) {
        location_id = childSite;
        location_source = "child_field";
    } else if (oppSite) {
        location_id = oppSite;
        location_source = "opportunity_fallback";
    } else if (linkSite) {
        location_id = linkSite;
        location_source = "link_default";
    }

    const cohort = trimKey(params.child.program_room_cohort_key);
    const cohort_source: "child_field" | "none" = cohort ? "child_field" : "none";

    return {
        location_id,
        program_room_cohort_key: cohort,
        desired_program_type: trimKey(params.child.desired_program_type),
        desired_schedule_type: trimKey(params.child.desired_schedule_type),
        desired_start_date: trimDateOnly(params.child.desired_start_date),
        placement_scope: {
            location_source,
            cohort_source,
        },
    };
}

export function buildOcmInsertFromIntakeChildFields(
    resolved: ResolvedIntakeChildOcmFields,
    base: {
        org_id: string;
        opportunity_id: string;
        customer_member_id: string;
        metadata: Record<string, unknown>;
    }
): Record<string, unknown> {
    const metadata =
        base.metadata != null && typeof base.metadata === "object" && !Array.isArray(base.metadata)
            ? { ...base.metadata, placement_scope: resolved.placement_scope }
            : { placement_scope: resolved.placement_scope };

    return {
        org_id: base.org_id,
        opportunity_id: base.opportunity_id,
        customer_member_id: base.customer_member_id,
        ...(resolved.location_id ? { location_id: resolved.location_id } : {}),
        ...(resolved.program_room_cohort_key ? { program_room_cohort_key: resolved.program_room_cohort_key } : {}),
        ...(resolved.desired_program_type ? { desired_program_type: resolved.desired_program_type } : {}),
        ...(resolved.desired_schedule_type ? { desired_schedule_type: resolved.desired_schedule_type } : {}),
        ...(resolved.desired_start_date ? { desired_start_date: resolved.desired_start_date } : {}),
        metadata,
    };
}
