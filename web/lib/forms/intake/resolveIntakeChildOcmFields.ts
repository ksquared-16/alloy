/**
 * Map form intake child hints → opportunity_customer_members placement columns (Card 4).
 * Resolves the captured program key to the canonical `program_category_id` FK.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormIntakeChildHint } from "@/lib/forms/intake/formLeadCaptureTypes";
import { resolveProgramCategoryId } from "@/lib/locations/resolveOcmProgramCategoryFields";

export type IntakeChildPlacementScopeSource =
    | "child_field"
    | "opportunity_fallback"
    | "link_default"
    | "none";

export type ResolvedIntakeChildOcmFields = {
    location_id: string | null;
    program_room_cohort_key: string | null;
    program_category_id: string | null;
    schedule_type: string | null;
    start_date: string | null;
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

export async function resolveIntakeChildOcmFields(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        child: FormIntakeChildHint;
        opportunityLocationId?: string | null;
        linkDefaultLocationId?: string | null;
    }
): Promise<ResolvedIntakeChildOcmFields> {
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

    // Forms capture the stable program key; resolve it to the category FK by
    // org + location + key (mirrors the canonical-fields migration backfill).
    // A value that is already a category uuid passes through unchanged.
    const programKey = trimKey(params.child.program_key);
    let program_category_id: string | null = null;
    if (programKey) {
        program_category_id = UUID_RE.test(programKey)
            ? programKey
            : await resolveProgramCategoryId(supabase, {
                  orgId: params.orgId,
                  locationId: location_id,
                  programKey,
              });
    }

    return {
        location_id,
        program_room_cohort_key: cohort,
        program_category_id,
        schedule_type: trimKey(params.child.schedule_type),
        start_date: trimDateOnly(params.child.start_date),
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
        ...(resolved.program_category_id ? { program_category_id: resolved.program_category_id } : {}),
        ...(resolved.schedule_type ? { schedule_type: resolved.schedule_type } : {}),
        ...(resolved.start_date ? { start_date: resolved.start_date } : {}),
        metadata,
    };
}
