/**
 * Observe an org-calc-backed OI measurement via the existing Organization Calculation evaluator.
 * Exact-version binding is preserved — never silently follows published pointer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateOrganizationCalculationForRoom } from "@/lib/organizationCalculations/evaluateForRoom";
import {
    appendOiOrgCalcObservation,
    evaluateOiOrgCalcHealth,
    humanUnavailableReason,
    parseOiOrgCalcMeasurements,
    writeOiOrgCalcMeasurements,
    type OiOrgCalcMeasurement,
    type OiOrgCalcObservation,
} from "@/lib/metrics/oiOrgCalcMeasurements";

export type ObserveOiOrgCalcArgs = {
    orgId: string;
    measurementId: string;
    roomId: string;
    roomLabel?: string | null;
    effectiveAt: string;
    /** When true, append to capped history in org_settings.metadata */
    persistHistory?: boolean;
};

export type ObserveOiOrgCalcResult = {
    measurement: OiOrgCalcMeasurement;
    observation: OiOrgCalcObservation;
    health: ReturnType<typeof evaluateOiOrgCalcHealth>;
};

async function loadOrgMetadata(
    supabase: SupabaseClient,
    orgId: string,
): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error) throw new Error(error.message);
    const meta = data?.metadata;
    return meta != null && typeof meta === "object" && !Array.isArray(meta) ?
            { ...(meta as Record<string, unknown>) }
        :   {};
}

async function saveOrgMetadata(
    supabase: SupabaseClient,
    orgId: string,
    metadata: Record<string, unknown>,
): Promise<void> {
    const { error } = await supabase.from("org_settings").upsert(
        { org_id: orgId, metadata },
        { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
}

export async function observeOiOrgCalcMeasurement(
    supabase: SupabaseClient,
    args: ObserveOiOrgCalcArgs,
): Promise<ObserveOiOrgCalcResult> {
    let metadata = await loadOrgMetadata(supabase, args.orgId);
    const measurements = parseOiOrgCalcMeasurements(metadata);
    const measurement = measurements.find((m) => m.id === args.measurementId);
    if (!measurement) throw new Error("Measurement not found");
    if (measurement.status === "retired") throw new Error("Retired measurements cannot be observed");

    const evaluated = await evaluateOrganizationCalculationForRoom(supabase, {
        orgId: args.orgId,
        calculationId: measurement.source.calculation_id,
        version: measurement.source.calculation_version_id,
        roomLocationId: args.roomId,
        effectiveAt: args.effectiveAt,
    });

    // Guard: exact version must match binding (never silently evaluate another version).
    if (evaluated.version.id !== measurement.source.calculation_version_id) {
        throw new Error("Bound calculation version does not match evaluation result");
    }

    const resolved = evaluated.evaluation.status === "resolved" && evaluated.evaluation.value != null;
    const observation: OiOrgCalcObservation = {
        id:
            typeof crypto !== "undefined" && "randomUUID" in crypto ?
                crypto.randomUUID()
            :   `obs-${Date.now()}`,
        measurement_id: measurement.id,
        room_id: args.roomId,
        room_label: args.roomLabel ?? null,
        effective_at: args.effectiveAt,
        evaluated_at: new Date().toISOString(),
        value: resolved ? evaluated.evaluation.value : null,
        availability: resolved ? "resolved" : "not_available",
        unavailable_reason:
            resolved ? null : (
                humanUnavailableReason(evaluated.evaluation.status, evaluated.evaluation.warnings)
            ),
        calculation_version_id: evaluated.version.id,
        version_number: evaluated.version.version_number,
        explanation_summary: evaluated.explanationLines.slice(-6).map((line) =>
            line.replace(/capacity\.room_binding\.?/g, "").replace(/\s+from\s+$/g, ""),
        ),
        provenance: {
            source_type: "organization_calculation",
            calculation_id: measurement.source.calculation_id,
            calculation_name: measurement.source.calculation_name,
        },
    };

    if (args.persistHistory !== false) {
        metadata = appendOiOrgCalcObservation(metadata, observation);
        // Touch measurement updated_at
        const nextMeasurements = measurements.map((m) =>
            m.id === measurement.id ? { ...m, updated_at: new Date().toISOString() } : m,
        );
        metadata = writeOiOrgCalcMeasurements(metadata, nextMeasurements);
        await saveOrgMetadata(supabase, args.orgId, metadata);
    }

    return {
        measurement,
        observation,
        health: evaluateOiOrgCalcHealth(observation, measurement.target),
    };
}

export async function listOiOrgCalcMeasurementsForOrg(
    supabase: SupabaseClient,
    orgId: string,
): Promise<OiOrgCalcMeasurement[]> {
    const metadata = await loadOrgMetadata(supabase, orgId);
    return parseOiOrgCalcMeasurements(metadata);
}

export { loadOrgMetadata, saveOrgMetadata };
