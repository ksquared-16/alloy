/**
 * Configure Room Utilization — creates/reuses room_utilization_pct calculation,
 * then binds an exact published version to a measurement with a healthy range goal.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ROOM_UTILIZATION_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";
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
import { productTypeById } from "@/lib/organizationCalculations/productCatalog";
import { findRoomUtilizationMeasurement } from "@/lib/operationalQuestions/answerRoomUtilization";

export type ConfigureRoomUtilizationArgs = {
    orgId: string;
    userId: string;
    name?: string;
    /** Inclusive healthy range defaults: 75–95 */
    targetMinPct?: number | null;
    targetMaxPct?: number | null;
    entryPoint: "ui" | "bos";
    reuseExisting?: boolean;
};

const PRODUCT_TYPE_ID = "room_utilization_pct" as const;

export async function configureRoomUtilizationMeasurement(
    supabase: SupabaseClient,
    args: ConfigureRoomUtilizationArgs,
) {
    const product = productTypeById(PRODUCT_TYPE_ID);
    if (!product) throw new Error("Room utilization recipe is not available");

    let calculationId: string;
    let versionId: string;
    let versionNumber: number;
    let calculationName: string;

    if (args.reuseExisting !== false) {
        const listed = await listOrganizationCalculationsForProduct(supabase, args.orgId);
        const match = listed.find(
            (c) => c.lifecycle === "published" && c.type_id === PRODUCT_TYPE_ID && c.published_version_id,
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
                name: args.name?.trim() || "Room Utilization",
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
            name: args.name?.trim() || "Room Utilization",
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

    const minProvided = args.targetMinPct != null && Number.isFinite(args.targetMinPct);
    const maxProvided = args.targetMaxPct != null && Number.isFinite(args.targetMaxPct);
    let target: { kind: "rate_range"; min: number; max: number } | null = null;
    if (minProvided || maxProvided) {
        const minPct = minProvided ? (args.targetMinPct as number) : 75;
        const maxPct = maxProvided ? (args.targetMaxPct as number) : 95;
        if (minPct > maxPct) throw new Error("Healthy range minimum cannot exceed maximum");
        target = { kind: "rate_range", min: minPct, max: maxPct };
    }

    const measurement = createOiOrgCalcMeasurementDraft({
        name: args.name?.trim() || "Room Utilization",
        description: `How full is this room compared with usable seats. ${product.summary}`,
        userId: args.userId,
        source,
        unit: "percent",
        target,
        question_key: ROOM_UTILIZATION_QUESTION_KEY,
        entry_point: args.entryPoint,
    });

    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const existing = parseOiOrgCalcMeasurements(metadata);
    const withoutPrior = existing.map((m) =>
        m.question_key === ROOM_UTILIZATION_QUESTION_KEY && m.status === "active" ?
            { ...m, status: "retired" as const, updated_at: new Date().toISOString() }
        :   m,
    );
    const next = writeOiOrgCalcMeasurements(metadata, [...withoutPrior, measurement]);
    await saveOrgMetadata(supabase, args.orgId, next);

    return {
        measurement,
        bound: findRoomUtilizationMeasurement(parseOiOrgCalcMeasurements(next)),
    };
}
