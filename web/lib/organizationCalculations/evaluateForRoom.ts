/**
 * Evaluate an Organization Calculation against room + effective date.
 * Loads capacity config server-side; never writes Facts/Config/Intent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadChildcareConfigRuleBundle } from "@/lib/childcareOperational/config/childcareConfigRuleService";
import { parseAndValidateOrgCalcExpr, type OrgCalcExpr } from "@/lib/organizationCalculations/ast";
import {
    projectCapacityRoomBindingInputs,
    resolveInputFromCapacityProjection,
} from "@/lib/organizationCalculations/capacityProjection";
import { evaluateOrgCalcExpr, type OrgCalcEvaluationResult } from "@/lib/organizationCalculations/evaluate";
import { formatExplanationLines } from "@/lib/organizationCalculations/explain";
import {
    getOrganizationCalculation,
    type OrganizationCalculationRow,
    type OrganizationCalculationVersionRow,
} from "@/lib/organizationCalculations/persist";

export type OrgCalcEvaluateRequest = {
    orgId: string;
    calculationId: string;
    /** Prefer published; pass versionId to evaluate a specific version; "draft" for current draft. */
    version?: "published" | "draft" | string;
    roomLocationId: string;
    siteLocationId?: string | null;
    programCategoryId?: string | null;
    ageGroupKey?: string | null;
    effectiveAt: string;
};

export type OrgCalcEvaluateResponse = {
    calculation: Pick<OrganizationCalculationRow, "id" | "key" | "name" | "subject_grain" | "lifecycle">;
    version: Pick<
        OrganizationCalculationVersionRow,
        "id" | "version_number" | "immutable" | "dependency_refs" | "published_at"
    >;
    evaluation: OrgCalcEvaluationResult;
    explanationLines: string[];
    scope: { type: "room"; id: string };
    effectiveAt: string;
};

async function assertRoomInOrg(
    supabase: SupabaseClient,
    orgId: string,
    roomLocationId: string,
): Promise<{ id: string; parent_id: string | null; location_type: string | null }> {
    const { data, error } = await supabase
        .from("locations")
        .select("id, parent_location_id, location_type, org_id")
        .eq("org_id", orgId)
        .eq("id", roomLocationId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
        throw new Error("Room not found in organization (inaccessible or cross-org)");
    }
    return {
        id: String(data.id),
        parent_id: data.parent_location_id ? String(data.parent_location_id) : null,
        location_type: data.location_type ? String(data.location_type) : null,
    };
}

async function resolveRoomSiteId(
    supabase: SupabaseClient,
    orgId: string,
    roomLocationId: string,
): Promise<string | null> {
    const room = await assertRoomInOrg(supabase, orgId, roomLocationId);
    return room.parent_id;
}

function pickVersion(
    loaded: NonNullable<Awaited<ReturnType<typeof getOrganizationCalculation>>>,
    versionSpec: OrgCalcEvaluateRequest["version"],
): OrganizationCalculationVersionRow {
    if (versionSpec === "draft") {
        if (!loaded.draftVersion) throw new Error("No draft version");
        return loaded.draftVersion;
    }
    if (versionSpec === "published" || versionSpec == null) {
        if (!loaded.publishedVersion) {
            if (loaded.draftVersion) return loaded.draftVersion;
            throw new Error("No published version");
        }
        return loaded.publishedVersion;
    }
    const found = loaded.versions.find((v) => v.id === versionSpec);
    if (!found) throw new Error("Version not found");
    return found;
}

export async function evaluateOrganizationCalculationForRoom(
    supabase: SupabaseClient,
    request: OrgCalcEvaluateRequest,
): Promise<OrgCalcEvaluateResponse> {
    const loaded = await getOrganizationCalculation(supabase, request.orgId, request.calculationId);
    if (!loaded) throw new Error("Organization calculation not found");
    if (loaded.calculation.lifecycle === "archived") {
        throw new Error("Cannot evaluate an archived organization calculation");
    }

    const version = pickVersion(loaded, request.version);
    const parsed = parseAndValidateOrgCalcExpr(version.expression_ast);
    if (!parsed.ok) {
        throw new Error(`Stored expression invalid: ${parsed.issues.map((i) => i.message).join("; ")}`);
    }

    // Always verify room is in-org before evaluating (rejects cross-org / inaccessible).
    const room = await assertRoomInOrg(supabase, request.orgId, request.roomLocationId);
    const siteLocationId = request.siteLocationId ?? room.parent_id;

    const bundle = await loadChildcareConfigRuleBundle(supabase, request.orgId);
    const projection = projectCapacityRoomBindingInputs({
        config: {
            capacityRules: bundle.capacityRules,
            ratioRules: bundle.ratioRules,
            ratioRuleTiers: bundle.ratioRuleTiers,
        },
        params: {
            orgId: request.orgId,
            locationId: siteLocationId ?? request.roomLocationId,
            siteLocationId,
            roomLocationId: request.roomLocationId,
            programCategoryId: request.programCategoryId ?? null,
            ageGroupKey: request.ageGroupKey ?? null,
            effectiveAt: request.effectiveAt,
        },
        clock: () => new Date(request.effectiveAt),
    });

    const evaluation = evaluateOrgCalcExpr(parsed.expr, {
        resolveInput: (ref) => resolveInputFromCapacityProjection(projection, ref),
    });

    return {
        calculation: {
            id: loaded.calculation.id,
            key: loaded.calculation.key,
            name: loaded.calculation.name,
            subject_grain: loaded.calculation.subject_grain,
            lifecycle: loaded.calculation.lifecycle,
        },
        version: {
            id: version.id,
            version_number: version.version_number,
            immutable: version.immutable,
            dependency_refs: version.dependency_refs,
            published_at: version.published_at,
        },
        evaluation,
        explanationLines: formatExplanationLines(evaluation.explanation),
        scope: { type: "room", id: request.roomLocationId },
        effectiveAt: request.effectiveAt,
    };
}

export function evaluateOrgCalcAstAgainstCapacityProjection(
    expr: OrgCalcExpr,
    projection: ReturnType<typeof projectCapacityRoomBindingInputs>,
): OrgCalcEvaluationResult {
    return evaluateOrgCalcExpr(expr, {
        resolveInput: (ref) => resolveInputFromCapacityProjection(projection, ref),
    });
}
