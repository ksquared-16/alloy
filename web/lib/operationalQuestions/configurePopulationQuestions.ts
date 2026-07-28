/**
 * Configure Room Utilization (FTE) and Equivalent Child Count measurements.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    createOiOrgCalcMeasurementDraft,
    parseOiOrgCalcMeasurements,
    writeOiOrgCalcMeasurements,
    type OiOrgCalcSourceBinding,
} from "@/lib/metrics/oiOrgCalcMeasurements";
import { loadOrgMetadata, saveOrgMetadata } from "@/lib/metrics/oiOrgCalcObserve";
import {
    createOrganizationCalculationDraft,
    getOrganizationCalculation,
    listOrganizationCalculationsForProduct,
    publishOrganizationCalculation,
} from "@/lib/organizationCalculations/persist";
import {
    equivalentChildCountAst,
    roomUtilizationFtePctAst,
} from "@/lib/organizationCalculations/productCatalog";
import { ensureDefaultActiveChildrenPopulation } from "@/lib/organizationPopulations/persist";
import {
    ensureDefaultFteWeighting,
    ensureDefaultUnweightedWeighting,
} from "@/lib/organizationWeightings/persist";

async function publishBoundCalculation(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        userId: string;
        name: string;
        description: string;
        expressionAst: unknown;
        typeHint: string;
        reuseExisting: boolean;
    },
) {
    if (args.reuseExisting) {
        const listed = await listOrganizationCalculationsForProduct(supabase, args.orgId);
        const match = listed.find(
            (c) => c.lifecycle === "published" && c.type_id === args.typeHint && c.published_version_id,
        );
        if (match?.published_version_id) {
            const detail = await getOrganizationCalculation(supabase, args.orgId, match.id);
            const ver = detail?.versions.find((v) => v.id === match.published_version_id);
            return {
                calculationId: match.id,
                versionId: match.published_version_id,
                versionNumber: ver?.version_number ?? 1,
                calculationName: match.name,
            };
        }
    }
    const created = await createOrganizationCalculationDraft(supabase, {
        orgId: args.orgId,
        userId: args.userId,
        name: args.name,
        description: args.description,
        expressionAst: args.expressionAst,
        consumerBindings: {},
    });
    const published = await publishOrganizationCalculation(supabase, {
        orgId: args.orgId,
        userId: args.userId,
        id: created.calculation.id,
    });
    return {
        calculationId: published.calculation.id,
        versionId: published.version.id,
        versionNumber: published.version.version_number,
        calculationName: published.calculation.name,
    };
}

function retirePriorQuestion(
    existing: ReturnType<typeof parseOiOrgCalcMeasurements>,
    questionKey: string,
) {
    return existing.map((m) =>
        m.question_key === questionKey && m.status === "active" ?
            { ...m, status: "retired" as const, updated_at: new Date().toISOString() }
        :   m,
    );
}

export async function configureRoomUtilizationFteMeasurement(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        userId: string;
        name?: string;
        targetMinPct?: number | null;
        targetMaxPct?: number | null;
        entryPoint: "ui" | "bos";
        reuseExisting?: boolean;
    },
) {
    const population = await ensureDefaultActiveChildrenPopulation(supabase, {
        orgId: args.orgId,
        userId: args.userId,
    });
    const weighting = await ensureDefaultFteWeighting(supabase, {
        orgId: args.orgId,
        userId: args.userId,
    });
    const binding = {
        populationVersionId: population.version.id,
        weightingVersionId: weighting.version.id,
    };
    const published = await publishBoundCalculation(supabase, {
        orgId: args.orgId,
        userId: args.userId,
        name: args.name?.trim() || "Room Utilization (FTE)",
        description: "Full-time equivalent children ÷ effective capacity × 100",
        expressionAst: roomUtilizationFtePctAst(binding),
        typeHint: "room_utilization_fte_pct",
        reuseExisting: args.reuseExisting !== false,
    });

    const source: OiOrgCalcSourceBinding = {
        type: "organization_calculation",
        calculation_id: published.calculationId,
        calculation_version_id: published.versionId,
        calculation_name: published.calculationName,
        version_number: published.versionNumber,
    };

    let target: { kind: "rate_range"; min: number; max: number } | null = null;
    const minProvided = args.targetMinPct != null && Number.isFinite(args.targetMinPct);
    const maxProvided = args.targetMaxPct != null && Number.isFinite(args.targetMaxPct);
    if (minProvided || maxProvided) {
        const minPct = minProvided ? (args.targetMinPct as number) : 75;
        const maxPct = maxProvided ? (args.targetMaxPct as number) : 95;
        if (minPct > maxPct) throw new Error("Healthy range minimum cannot exceed maximum");
        target = { kind: "rate_range", min: minPct, max: maxPct };
    }

    const measurement = createOiOrgCalcMeasurementDraft({
        name: args.name?.trim() || "Room Utilization (FTE)",
        description: "How full is this room using full-time equivalent children?",
        userId: args.userId,
        source,
        unit: "percent",
        target,
        question_key: "room_utilization_fte",
        entry_point: args.entryPoint,
    });

    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const existing = parseOiOrgCalcMeasurements(metadata);
    const next = writeOiOrgCalcMeasurements(
        metadata,
        [...retirePriorQuestion(existing, "room_utilization_fte"), measurement],
    );
    await saveOrgMetadata(supabase, args.orgId, next);
    return { measurement, population, weighting };
}

export async function configureEquivalentChildCountMeasurement(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        userId: string;
        name?: string;
        /** When true, use FTE weighting; otherwise unweighted headcount via population+unweighted. */
        useFteWeighting?: boolean;
        targetMin?: number | null;
        entryPoint: "ui" | "bos";
        reuseExisting?: boolean;
    },
) {
    const population = await ensureDefaultActiveChildrenPopulation(supabase, {
        orgId: args.orgId,
        userId: args.userId,
    });
    const weighting =
        args.useFteWeighting !== false ?
            await ensureDefaultFteWeighting(supabase, { orgId: args.orgId, userId: args.userId })
        :   await ensureDefaultUnweightedWeighting(supabase, {
                orgId: args.orgId,
                userId: args.userId,
            });
    const binding = {
        populationVersionId: population.version.id,
        weightingVersionId: weighting.version.id,
    };
    const published = await publishBoundCalculation(supabase, {
        orgId: args.orgId,
        userId: args.userId,
        name: args.name?.trim() || "Equivalent Child Count",
        description: "Weighted count of children expected in the room on the selected date.",
        expressionAst: equivalentChildCountAst(binding),
        typeHint: "equivalent_child_count",
        reuseExisting: args.reuseExisting !== false,
    });

    const source: OiOrgCalcSourceBinding = {
        type: "organization_calculation",
        calculation_id: published.calculationId,
        calculation_version_id: published.versionId,
        calculation_name: published.calculationName,
        version_number: published.versionNumber,
    };

    const measurement = createOiOrgCalcMeasurementDraft({
        name: args.name?.trim() || "Equivalent Child Count",
        description: "Reusable equivalent count of children in the room population.",
        userId: args.userId,
        source,
        unit: "children",
        target:
            args.targetMin != null && Number.isFinite(args.targetMin) ?
                { kind: "count_min", value: args.targetMin }
            :   null,
        question_key: "equivalent_child_count",
        entry_point: args.entryPoint,
    });

    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const existing = parseOiOrgCalcMeasurements(metadata);
    const next = writeOiOrgCalcMeasurements(
        metadata,
        [...retirePriorQuestion(existing, "equivalent_child_count"), measurement],
    );
    await saveOrgMetadata(supabase, args.orgId, next);
    return { measurement, population, weighting };
}
