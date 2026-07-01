/**
 * Routing label catalog for operational outcome display (IC-1b).
 * Display-only — does not affect submit/runtime behavior.
 */

import { distributionIsPreviewLink, type DistributionLinkRow } from "@/lib/forms/distributionPresentation";
import { parseIntakeLinkDefaults } from "@/lib/forms/intake/parseIntakeLinkDefaults";
import { locationDisplayLabelFromRow } from "@/lib/admin/locationDisplayLabel";

export type OutcomeRoutingLabelCatalog = {
    locations: Record<string, string>;
    workUnits: Record<string, string>;
    departments: Record<string, string>;
    verticals: Record<string, string>;
    opportunityStatusKeys: Record<string, string>;
};

export const OUTCOME_LABEL_UNRESOLVED = "Configured, label not resolved";

export type OutcomeRoutingUuidSets = {
    locationIds: string[];
    workUnitIds: string[];
    departmentIds: string[];
    verticalIds: string[];
    statusKeys: string[];
};

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

function readUuidSetFromMetadata(metadata: Record<string, unknown> | null | undefined): OutcomeRoutingUuidSets {
    const m = metaObject(metadata);
    const intake = metaObject(m.intake_outcome);
    const merged = { ...intake, ...m };
    const routing = parseIntakeLinkDefaults(merged);
    const statusKey = routing.default_opportunity_status_key?.trim() || null;

    return {
        locationIds: routing.default_location_id ? [routing.default_location_id] : [],
        workUnitIds: routing.default_work_unit_id ? [routing.default_work_unit_id] : [],
        departmentIds: routing.default_department_id ? [routing.default_department_id] : [],
        verticalIds: routing.default_vertical_id ? [routing.default_vertical_id] : [],
        statusKeys: statusKey ? [statusKey] : [],
    };
}

function mergeUuidSets(a: OutcomeRoutingUuidSets, b: OutcomeRoutingUuidSets): OutcomeRoutingUuidSets {
    const uniq = (keys: (keyof OutcomeRoutingUuidSets)[]) => {
        const out: OutcomeRoutingUuidSets = {
            locationIds: [],
            workUnitIds: [],
            departmentIds: [],
            verticalIds: [],
            statusKeys: [],
        };
        for (const key of keys) {
            out[key] = [...new Set([...a[key], ...b[key]])];
        }
        return out;
    };
    return uniq(["locationIds", "workUnitIds", "departmentIds", "verticalIds", "statusKeys"]);
}

/** Collect routing UUIDs/status keys from form defaults + all non-preview public links. */
export function collectOutcomeRoutingUuidSets(params: {
    formMetadata: Record<string, unknown> | null | undefined;
    links: DistributionLinkRow[];
}): OutcomeRoutingUuidSets {
    let sets = readUuidSetFromMetadata(metaObject(metaObject(params.formMetadata).intake_outcome));

    for (const link of params.links) {
        if (distributionIsPreviewLink(link)) continue;
        sets = mergeUuidSets(sets, readUuidSetFromMetadata(link.metadata));
    }

    return sets;
}

export function emptyOutcomeRoutingLabelCatalog(): OutcomeRoutingLabelCatalog {
    return {
        locations: {},
        workUnits: {},
        departments: {},
        verticals: {},
        opportunityStatusKeys: {},
    };
}

export function resolveOutcomeLocationLabel(
    locationId: string | null,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): string | null {
    if (!locationId) return null;
    return catalog?.locations[locationId] ?? null;
}

export function resolveOutcomeWorkUnitLabel(
    workUnitId: string | null,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): string | null {
    if (!workUnitId) return null;
    return catalog?.workUnits[workUnitId] ?? null;
}

export function resolveOutcomeDepartmentLabel(
    departmentId: string | null,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): string | null {
    if (!departmentId) return null;
    return catalog?.departments[departmentId] ?? null;
}

export function resolveOutcomeVerticalLabel(
    verticalId: string | null,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): string | null {
    if (!verticalId) return null;
    return catalog?.verticals[verticalId] ?? null;
}

export function resolveOutcomeStatusLabel(
    statusKey: string | null,
    catalog: OutcomeRoutingLabelCatalog | null | undefined
): string | null {
    if (!statusKey) return null;
    return catalog?.opportunityStatusKeys[statusKey] ?? null;
}

/** Build location id → label map from Supabase rows. */
export function locationLabelsFromRows(
    rows: { id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null }[]
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rows) {
        const label = locationDisplayLabelFromRow(row);
        if (label) out[row.id] = label;
    }
    return out;
}

/** Build work unit id → "Department · Work unit" label. */
export function workUnitLabelsFromRows(
    rows: { id: string; name?: string | null; department_id?: string | null }[],
    departmentNames: Record<string, string>
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rows) {
        const wuName = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
        const deptName =
            row.department_id && departmentNames[row.department_id] ? departmentNames[row.department_id] : null;
        const label = deptName && wuName ? `${deptName} · ${wuName}` : (wuName ?? deptName ?? null);
        if (label) out[row.id] = label;
    }
    return out;
}
