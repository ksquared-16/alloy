import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    fetchEffectiveStatusDefinitions,
    normalizeEffectiveStatusEntityType,
    parseLifecycleStageFromMetadata,
} from "@/lib/admin/statusDefinitionsResolve";
import {
    filterPersonStatusDefinitionsForDrawerProfile,
    filterPersonStatusDefinitionsForProfile,
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
    resolvePersonStatusLabelForProfile,
    type PersonStatusProfileKey,
} from "@/lib/admin/person/personStatusApplicability";
import { OPPORTUNITY_CASE_STATUS_KEYS } from "@/lib/admin/statusReseed/statusMvpCatalog";
import { parseProcessStageKeyFromStatusMetadata } from "@/lib/businessProcesses/processStageMetadata";

function parsePersonStatusProfileParam(raw: string | null): PersonStatusProfileKey | null {
    const t = String(raw ?? "").trim().toLowerCase();
    if (!t) return null;
    if (t === "child" || t === "children" || t === "child_lifecycle") {
        return PERSON_STATUS_PROFILE_CHILD_LIFECYCLE;
    }
    if (t === "parent" || t === "guardian" || t === "person_generic" || t === "generic") {
        return PERSON_STATUS_PROFILE_GENERIC;
    }
    if (t === PERSON_STATUS_PROFILE_CHILD_LIFECYCLE || t === PERSON_STATUS_PROFILE_GENERIC) return t;
    return null;
}

/**
 * GET: dropdown options for admin status controls — effective status_definitions (org or industry defaults).
 * Persons: optional `status_profile` filters by metadata.applies_to_profiles (child_lifecycle | person_generic).
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const entityType = request.nextUrl.searchParams.get("entity_type")?.trim() ?? "";
    if (!entityType) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    const normalizedEntity = normalizeEffectiveStatusEntityType(entityType);
    const statusProfile = parsePersonStatusProfileParam(
        request.nextUrl.searchParams.get("status_profile")
    );

    const supabase = createAdminClient();
    try {
        const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, entityType, { activeOnly: true });
        const profileFiltered =
            normalizedEntity === "persons" && statusProfile
                ? filterPersonStatusDefinitionsForProfile(defs, statusProfile)
                : defs;
        const filtered =
            normalizedEntity === "persons" && statusProfile
                ? filterPersonStatusDefinitionsForDrawerProfile(profileFiltered, statusProfile)
                : normalizedEntity === "opportunities"
                  ? profileFiltered.filter((d) => d.is_active && OPPORTUNITY_CASE_STATUS_KEYS.has(d.status_key))
                  : profileFiltered.filter((d) => d.is_active);
        const options = filtered.map((r) => ({
            value: r.status_key,
            label:
                normalizedEntity === "persons" && statusProfile
                    ? resolvePersonStatusLabelForProfile(r, statusProfile)
                :   (r.status_label && String(r.status_label).trim()) || r.status_key,
            sort_order: r.sort_order ?? 0,
            lifecycle_stage: parseLifecycleStageFromMetadata(r.metadata),
            // Configured process-stage bucket for this status (status_definitions.metadata.process_stage_key).
            // The operational projection derives a record's Stage from its status via this — Stage Work View
            // predicates (e.g. New Leads = stage "lead") evaluate correctly even though opportunities never
            // store a stage column.
            process_stage_key: parseProcessStageKeyFromStatusMetadata(
                (r.metadata ?? null) as Record<string, unknown> | null,
            ),
            metadata: r.metadata ?? null,
        }));
        return NextResponse.json({ options, status_profile: statusProfile });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
