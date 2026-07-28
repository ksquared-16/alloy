/**
 * BOS-assisted configuration for Future Room Capacity — same APIs as UI wizard.
 * Creates/publishes calculation when needed, then creates measurement with question_key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FUTURE_ROOM_CAPACITY_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";
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
    publishOrganizationCalculation,
} from "@/lib/organizationCalculations/persist";
import { productTypeById, type OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";
import { listOrganizationCalculationsForProduct } from "@/lib/organizationCalculations/persist";
import { findFutureRoomCapacityMeasurement } from "@/lib/operationalQuestions/answerFutureRoomCapacity";

export type ConfigureFutureRoomCapacityArgs = {
    orgId: string;
    userId: string;
    name?: string;
    productTypeId: OrgCalcProductTypeId;
    targetMinSeats?: number | null;
    entryPoint: "ui" | "bos";
    /** Prefer reusing an existing published calculation of this product type */
    reuseExisting?: boolean;
};

export async function configureFutureRoomCapacityMeasurement(
    supabase: SupabaseClient,
    args: ConfigureFutureRoomCapacityArgs,
) {
    const product = productTypeById(args.productTypeId);
    if (!product) throw new Error("Unknown capacity recipe");

    let calculationId: string;
    let versionId: string;
    let versionNumber: number;
    let calculationName: string;

    if (args.reuseExisting !== false) {
        const listed = await listOrganizationCalculationsForProduct(supabase, args.orgId);
        const match = listed.find(
            (c) => c.lifecycle === "published" && c.type_id === args.productTypeId && c.published_version_id,
        );
        if (match?.published_version_id) {
            calculationId = match.id;
            versionId = match.published_version_id;
            const detail = await getOrganizationCalculation(supabase, args.orgId, calculationId);
            const ver = detail?.versions.find((v) => v.id === versionId);
            versionNumber = ver?.version_number ?? 1;
            calculationName = match.name;
        } else {
            const created = await createOrganizationCalculationDraft(supabase, {
                orgId: args.orgId,
                userId: args.userId,
                name: `${args.name?.trim() || "Future Room Capacity"} — ${product.title}`,
                description: product.summary,
                expressionAst: product.buildAst(),
                consumerBindings: {},
            });
            const published = await publishOrganizationCalculation(supabase, {
                orgId: args.orgId,
                userId: args.userId,
                id: created.calculation.id,
            });
            calculationId = published.calculation.id;
            versionId = published.version.id;
            versionNumber = published.version.version_number;
            calculationName = published.calculation.name;
        }
    } else {
        const created = await createOrganizationCalculationDraft(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            name: `${args.name?.trim() || "Future Room Capacity"} — ${product.title}`,
            description: product.summary,
            expressionAst: product.buildAst(),
            consumerBindings: {},
        });
        const published = await publishOrganizationCalculation(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            id: created.calculation.id,
        });
        calculationId = published.calculation.id;
        versionId = published.version.id;
        versionNumber = published.version.version_number;
        calculationName = published.calculation.name;
    }

    const source: OiOrgCalcSourceBinding = {
        type: "organization_calculation",
        calculation_id: calculationId,
        calculation_version_id: versionId,
        calculation_name: calculationName,
        version_number: versionNumber,
    };

    const measurement = createOiOrgCalcMeasurementDraft({
        name: args.name?.trim() || "Future Room Capacity",
        description: `Measure how many seats a room is expected to have on a future date. ${product.summary}`,
        userId: args.userId,
        source,
        target:
            args.targetMinSeats != null && Number.isFinite(args.targetMinSeats) ?
                { kind: "count_min", value: args.targetMinSeats }
            :   null,
        question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
        entry_point: args.entryPoint,
    });

    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const existing = parseOiOrgCalcMeasurements(metadata);
    // Replace prior active FRC measurement for this question (one active proving measurement)
    const withoutPrior = existing.map((m) =>
        m.question_key === FUTURE_ROOM_CAPACITY_QUESTION_KEY && m.status === "active" ?
            { ...m, status: "retired" as const, updated_at: new Date().toISOString() }
        :   m,
    );
    const next = writeOiOrgCalcMeasurements(metadata, [...withoutPrior, measurement]);
    await saveOrgMetadata(supabase, args.orgId, next);

    return {
        measurement,
        bound: findFutureRoomCapacityMeasurement(parseOiOrgCalcMeasurements(next)),
    };
}
