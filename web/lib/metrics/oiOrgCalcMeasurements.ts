/**
 * Organization-owned OI measurements backed by exact published Organization Calculation versions.
 * Stored at org_settings.metadata.oi_org_calc_measurements (+ capped history).
 *
 * OI does not author calculation math — it binds, observes, targets, and presents.
 */

export type OiOrgCalcSourceType = "organization_calculation";

export type OiOrgCalcMeasurementStatus = "active" | "disabled" | "retired";

export type OiOrgCalcTarget = {
    /** Minimum seats (count_min semantics). */
    kind: "count_min";
    value: number;
};

export type OiOrgCalcSourceBinding = {
    type: OiOrgCalcSourceType;
    calculation_id: string;
    /** Exact published version id — never silently moved on publish. */
    calculation_version_id: string;
    calculation_name: string;
    version_number: number;
};

export type OiOrgCalcMeasurement = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    status: OiOrgCalcMeasurementStatus;
    source: OiOrgCalcSourceBinding;
    subject_grain: "room";
    unit: "seats";
    output_type: "numeric";
    target: OiOrgCalcTarget | null;
    /** Operational Question Platform key when created via question flow (optional for legacy). */
    question_key?: string | null;
    /** Audit only — ui | bos | api; must not affect answer semantics. */
    entry_point?: string | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
};

export type OiOrgCalcAvailability = "resolved" | "not_available" | "error";

export type OiOrgCalcObservation = {
    id: string;
    measurement_id: string;
    room_id: string;
    room_label: string | null;
    effective_at: string;
    evaluated_at: string;
    value: number | null;
    availability: OiOrgCalcAvailability;
    unavailable_reason: string | null;
    calculation_version_id: string;
    version_number: number;
    explanation_summary: string[];
    provenance: {
        source_type: OiOrgCalcSourceType;
        calculation_id: string;
        calculation_name: string;
    };
};

export type OiOrgCalcHealth = "on_goal" | "below_goal" | "not_available" | "no_target";

const META_KEY = "oi_org_calc_measurements";
const HISTORY_KEY = "oi_org_calc_measurement_history";
const HISTORY_CAP = 80;

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function slugifyKey(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    return `org.future_capacity.${slug || "measurement"}`;
}

export function parseOiOrgCalcMeasurements(metadata: unknown): OiOrgCalcMeasurement[] {
    if (!isRecord(metadata) || !Array.isArray(metadata[META_KEY])) return [];
    const out: OiOrgCalcMeasurement[] = [];
    for (const raw of metadata[META_KEY]) {
        if (!isRecord(raw)) continue;
        const source = isRecord(raw.source) ? raw.source : null;
        if (!source) continue;
        if (source.type !== "organization_calculation") continue;
        if (typeof source.calculation_id !== "string" || typeof source.calculation_version_id !== "string") continue;
        if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
        const status = raw.status;
        if (status !== "active" && status !== "disabled" && status !== "retired") continue;
        const target =
            isRecord(raw.target) && raw.target.kind === "count_min" && typeof raw.target.value === "number" ?
                { kind: "count_min" as const, value: raw.target.value }
            :   null;
        out.push({
            id: raw.id,
            key: typeof raw.key === "string" ? raw.key : slugifyKey(raw.name),
            name: raw.name,
            description: typeof raw.description === "string" ? raw.description : null,
            status,
            source: {
                type: "organization_calculation",
                calculation_id: source.calculation_id,
                calculation_version_id: source.calculation_version_id,
                calculation_name: typeof source.calculation_name === "string" ? source.calculation_name : "Calculation",
                version_number: typeof source.version_number === "number" ? source.version_number : 0,
            },
            subject_grain: "room",
            unit: "seats",
            output_type: "numeric",
            target,
            question_key: typeof raw.question_key === "string" ? raw.question_key : null,
            entry_point: typeof raw.entry_point === "string" ? raw.entry_point : null,
            created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
            updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
            created_by: typeof raw.created_by === "string" ? raw.created_by : null,
        });
    }
    return out;
}

export function parseOiOrgCalcHistory(
    metadata: unknown,
    measurementId: string,
): OiOrgCalcObservation[] {
    if (!isRecord(metadata) || !isRecord(metadata[HISTORY_KEY])) return [];
    const bucket = metadata[HISTORY_KEY][measurementId];
    if (!Array.isArray(bucket)) return [];
    const out: OiOrgCalcObservation[] = [];
    for (const raw of bucket) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        if (raw.measurement_id !== measurementId) continue;
        out.push(raw as unknown as OiOrgCalcObservation);
    }
    return out.sort((a, b) => b.evaluated_at.localeCompare(a.evaluated_at));
}

export function writeOiOrgCalcMeasurements(
    metadata: Record<string, unknown>,
    measurements: OiOrgCalcMeasurement[],
): Record<string, unknown> {
    return { ...metadata, [META_KEY]: measurements };
}

export function appendOiOrgCalcObservation(
    metadata: Record<string, unknown>,
    observation: OiOrgCalcObservation,
): Record<string, unknown> {
    const history = isRecord(metadata[HISTORY_KEY]) ? { ...(metadata[HISTORY_KEY] as Record<string, unknown>) } : {};
    const existing = Array.isArray(history[observation.measurement_id]) ?
        [...(history[observation.measurement_id] as OiOrgCalcObservation[])]
    :   [];
    existing.unshift(observation);
    history[observation.measurement_id] = existing.slice(0, HISTORY_CAP);
    return { ...metadata, [HISTORY_KEY]: history };
}

export function createOiOrgCalcMeasurementDraft(args: {
    name: string;
    description?: string | null;
    userId: string | null;
    source: OiOrgCalcSourceBinding;
    target?: OiOrgCalcTarget | null;
    question_key?: string | null;
    entry_point?: string | null;
}): OiOrgCalcMeasurement {
    const now = new Date().toISOString();
    const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto ?
            crypto.randomUUID()
        :   `oi-orgcalc-${Date.now()}`;
    return {
        id,
        key: slugifyKey(args.name),
        name: args.name.trim(),
        description: args.description?.trim() || null,
        status: "active",
        source: args.source,
        subject_grain: "room",
        unit: "seats",
        output_type: "numeric",
        target: args.target ?? null,
        question_key: args.question_key ?? null,
        entry_point: args.entry_point ?? null,
        created_at: now,
        updated_at: now,
        created_by: args.userId,
    };
}

export function evaluateOiOrgCalcHealth(
    observation: OiOrgCalcObservation | null,
    target: OiOrgCalcTarget | null,
): OiOrgCalcHealth {
    if (!observation || observation.availability !== "resolved" || observation.value == null) {
        return "not_available";
    }
    if (!target) return "no_target";
    return observation.value >= target.value ? "on_goal" : "below_goal";
}

export function humanUnavailableReason(evaluationStatus: string, warnings: Array<{ message: string }>): string {
    if (evaluationStatus === "not_configured" || evaluationStatus === "incomplete" || evaluationStatus === "partial") {
        return "Required capacity inputs are not configured for this room.";
    }
    if (warnings.length > 0) {
        return "Required capacity inputs are not configured for this room.";
    }
    return "Not available";
}

export { META_KEY as OI_ORG_CALC_MEASUREMENTS_META_KEY, HISTORY_KEY as OI_ORG_CALC_HISTORY_META_KEY, slugifyKey };
