import type { KpiSurface, MetricKey } from "@/lib/kpi/types";
import { isKnownMetricKey, validateMetricForSurface } from "@/lib/kpi/registry";

const LABEL_OVERRIDE_MAX = 160;

export type PlacementCreateInput = {
    surface: KpiSurface;
    metric_key: string;
    display_order?: number;
    label_override?: string | null;
    department_id?: string | null;
    work_unit_id?: string | null;
};

export type PlacementPatchInput = {
    id: string;
    is_visible?: boolean;
    display_order?: number;
    label_override?: string | null;
};

export class PlacementValidationError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "PlacementValidationError";
        this.status = status;
    }
}

function normalizeUuid(raw: string | null | undefined): string | null {
    const t = typeof raw === "string" ? raw.trim() : "";
    return t.length ? t : null;
}

function normalizeLabelOverride(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const t = raw.trim();
    if (!t) return null;
    if (t.length > LABEL_OVERRIDE_MAX) {
        throw new PlacementValidationError(400, `label_override exceeds ${LABEL_OVERRIDE_MAX} characters`);
    }
    return t;
}

function assertScope(surface: KpiSurface, departmentId: string | null, workUnitId: string | null): void {
    if (surface === "workspace") {
        if (departmentId != null || workUnitId != null) {
            throw new PlacementValidationError(400, "workspace placements must not set department_id or work_unit_id");
        }
        return;
    }
    if (surface === "department") {
        if (!departmentId) throw new PlacementValidationError(400, "department_id required for surface=department");
        if (workUnitId != null) throw new PlacementValidationError(400, "department placements must not set work_unit_id");
        return;
    }
    if (surface === "work_unit") {
        if (!departmentId || !workUnitId) {
            throw new PlacementValidationError(400, "department_id and work_unit_id required for surface=work_unit");
        }
    }
}

/** Server-side validation for creating a placement row (org membership verified separately). */
export function validatePlacementCreateBody(body: PlacementCreateInput): {
    surface: KpiSurface;
    metric_key: MetricKey;
    display_order: number;
    label_override: string | null;
    department_id: string | null;
    work_unit_id: string | null;
} {
    const surface = body.surface;
    if (surface !== "workspace" && surface !== "department" && surface !== "work_unit") {
        throw new PlacementValidationError(400, "Invalid surface");
    }

    const metricRaw = typeof body.metric_key === "string" ? body.metric_key.trim() : "";
    if (!metricRaw) throw new PlacementValidationError(400, "metric_key required");

    if (!isKnownMetricKey(metricRaw)) {
        throw new PlacementValidationError(400, "Unknown metric_key — must be a registry key");
    }
    const metric_key = metricRaw;
    if (!validateMetricForSurface(metric_key, surface)) {
        throw new PlacementValidationError(400, `metric_key is not allowed on surface ${surface}`);
    }

    const department_id = normalizeUuid(body.department_id ?? null);
    const work_unit_id = normalizeUuid(body.work_unit_id ?? null);
    assertScope(surface, department_id, work_unit_id);

    if (surface === "work_unit") {
        throw new PlacementValidationError(
            400,
            "Work unit KPI placements are not rendered in AdminV2 yet (Card 6 deferred). Remove existing work-unit rows in Settings or wait for a future release."
        );
    }

    const display_order =
        typeof body.display_order === "number" && Number.isFinite(body.display_order)
            ? Math.trunc(body.display_order)
            : 0;

    const label_override = normalizeLabelOverride(body.label_override);

    return { surface, metric_key, display_order, label_override, department_id, work_unit_id };
}

export function validatePlacementPatchBody(body: PlacementPatchInput): {
    id: string;
    is_visible?: boolean;
    display_order?: number;
    label_override?: string | null;
} {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new PlacementValidationError(400, "id required");

    const hasVisible = typeof body.is_visible === "boolean";
    const hasOrder = typeof body.display_order === "number" && Number.isFinite(body.display_order);
    const hasLabel = body.label_override !== undefined;

    if (!hasVisible && !hasOrder && !hasLabel) {
        throw new PlacementValidationError(400, "At least one of is_visible, display_order, label_override required");
    }

    let label_override: string | null | undefined;
    if (hasLabel) {
        label_override = normalizeLabelOverride(body.label_override);
    }

    return {
        id,
        is_visible: hasVisible ? body.is_visible : undefined,
        display_order: hasOrder ? Math.trunc(body.display_order as number) : undefined,
        label_override,
    };
}
