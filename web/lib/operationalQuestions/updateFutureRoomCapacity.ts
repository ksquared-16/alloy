/**
 * Shared Future Room Capacity measurement updates (goal / newer version).
 * Same persistence path as PATCH /api/admin/metrics/oi-org-calc-measurements/[id].
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationCalculation } from "@/lib/organizationCalculations/persist";
import {
    parseOiOrgCalcHistory,
    parseOiOrgCalcMeasurements,
    writeOiOrgCalcMeasurements,
    type OiOrgCalcMeasurement,
} from "@/lib/metrics/oiOrgCalcMeasurements";
import { loadOrgMetadata, saveOrgMetadata } from "@/lib/metrics/oiOrgCalcObserve";
import { findFutureRoomCapacityMeasurement } from "@/lib/operationalQuestions/answerFutureRoomCapacity";

export async function updateFutureRoomCapacityGoal(
    supabase: SupabaseClient,
    args: { orgId: string; targetMinSeats: number | null },
): Promise<OiOrgCalcMeasurement> {
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const measurements = parseOiOrgCalcMeasurements(metadata);
    const current = findFutureRoomCapacityMeasurement(measurements);
    if (!current) throw new Error("Future Room Capacity is not being measured yet.");

    const next: OiOrgCalcMeasurement = {
        ...current,
        target:
            args.targetMinSeats != null && Number.isFinite(args.targetMinSeats) ?
                { kind: "count_min", value: args.targetMinSeats }
            :   null,
        updated_at: new Date().toISOString(),
    };
    const list = measurements.map((m) => (m.id === current.id ? next : m));
    await saveOrgMetadata(supabase, args.orgId, writeOiOrgCalcMeasurements(metadata, list));
    return next;
}

export async function rebindFutureRoomCapacityToNewerPublishedVersion(
    supabase: SupabaseClient,
    args: { orgId: string; calculationVersionId?: string },
): Promise<OiOrgCalcMeasurement> {
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const measurements = parseOiOrgCalcMeasurements(metadata);
    const current = findFutureRoomCapacityMeasurement(measurements);
    if (!current) throw new Error("Future Room Capacity is not being measured yet.");

    const loaded = await getOrganizationCalculation(supabase, args.orgId, current.source.calculation_id);
    if (!loaded) throw new Error("How this is measured could not be loaded.");

    const published = loaded.versions
        .filter((v) => v.immutable)
        .sort((a, b) => b.version_number - a.version_number);
    const targetVersion =
        args.calculationVersionId ?
            published.find((v) => v.id === args.calculationVersionId)
        :   published.find((v) => v.id !== current.source.calculation_version_id);

    if (!targetVersion) {
        throw new Error("No newer definition is available to use.");
    }
    if (!targetVersion.immutable) {
        throw new Error("Only published definitions can be used.");
    }

    const next: OiOrgCalcMeasurement = {
        ...current,
        source: {
            ...current.source,
            calculation_version_id: targetVersion.id,
            version_number: targetVersion.version_number,
            calculation_name: loaded.calculation.name,
        },
        updated_at: new Date().toISOString(),
    };
    const list = measurements.map((m) => (m.id === current.id ? next : m));
    await saveOrgMetadata(supabase, args.orgId, writeOiOrgCalcMeasurements(metadata, list));
    return next;
}

export async function loadFutureRoomCapacityRecentHistory(
    supabase: SupabaseClient,
    args: { orgId: string; limit?: number },
): Promise<{ measurement: OiOrgCalcMeasurement | null; lines: string[] }> {
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const measurement = findFutureRoomCapacityMeasurement(parseOiOrgCalcMeasurements(metadata));
    if (!measurement) {
        return {
            measurement: null,
            lines: ["Future Room Capacity is not being measured yet."],
        };
    }
    const history = parseOiOrgCalcHistory(metadata, measurement.id).slice(0, args.limit ?? 5);
    if (history.length === 0) {
        return {
            measurement,
            lines: ["No recent history yet. Ask for a room and a date to record an answer."],
        };
    }
    const lines = history.map((h) => {
        const when = h.effective_at || h.evaluated_at || "unknown date";
        const value = h.value != null ? `${h.value} seats` : "not available";
        return `${when}: ${value}`;
    });
    return {
        measurement,
        lines: ["Recent Future Room Capacity history:", ...lines],
    };
}
