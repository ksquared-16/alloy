/**
 * Configuration parity helpers — UI vs BOS created measurements must match semantically.
 */

import { expect } from "vitest";
import type { OiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcMeasurements";
import { FUTURE_ROOM_CAPACITY_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";

export type MeasurementParitySnapshot = {
    question_key: string | null | undefined;
    calculation_id: string;
    calculation_version_id: string;
    version_number: number;
    subject_grain: string;
    unit: string;
    goal_value: number | null;
    status: string;
};

export function snapshotMeasurementParity(m: OiOrgCalcMeasurement): MeasurementParitySnapshot {
    return {
        question_key: m.question_key ?? FUTURE_ROOM_CAPACITY_QUESTION_KEY,
        calculation_id: m.source.calculation_id,
        calculation_version_id: m.source.calculation_version_id,
        version_number: m.source.version_number,
        subject_grain: m.subject_grain,
        unit: m.unit,
        goal_value: m.target?.kind === "count_min" ? m.target.value : null,
        status: m.status,
    };
}

/** entry_point may differ; all semantic fields must match. */
export function assertMeasurementSemanticParity(
    a: MeasurementParitySnapshot,
    b: MeasurementParitySnapshot,
): void {
    expect(a.question_key).toBe(b.question_key);
    expect(a.calculation_id).toBe(b.calculation_id);
    expect(a.calculation_version_id).toBe(b.calculation_version_id);
    expect(a.version_number).toBe(b.version_number);
    expect(a.subject_grain).toBe(b.subject_grain);
    expect(a.unit).toBe(b.unit);
    expect(a.goal_value).toBe(b.goal_value);
    expect(a.status).toBe(b.status);
}
