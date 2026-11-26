/**
 * Resolve default lead/opportunity location for Create Lead and child enrollment inheritance.
 *
 * Priority:
 * 1. Active workspace/site location
 * 2. Lead form location_id already set
 * 3. User's single permitted site (when unambiguous)
 */

export type ResolveCreateLeadDefaultLocationInput = {
    workspaceSiteId?: string | null;
    formLocationId?: string | null;
    permittedSiteIds?: readonly string[] | null;
};

export type ResolveCreateLeadDefaultLocationResult = {
    location_id: string | null;
    source: "workspace_site" | "form_value" | "single_permitted_site" | "none";
};

/** Evidence note stamped when Create Lead seeds location from the workspace site filter. */
export const CREATE_LEAD_WORKSPACE_LOCATION_NOTE = "From your location";

function trimUuid(v: unknown): string | null {
    const t = v != null ? String(v).trim() : "";
    return t || null;
}

export function resolveCreateLeadDefaultLocation(
    input: ResolveCreateLeadDefaultLocationInput
): ResolveCreateLeadDefaultLocationResult {
    const form = trimUuid(input.formLocationId);
    if (form) {
        return { location_id: form, source: "form_value" };
    }

    const workspace = trimUuid(input.workspaceSiteId);
    if (workspace) {
        return { location_id: workspace, source: "workspace_site" };
    }

    const permitted = (input.permittedSiteIds ?? [])
        .map((id) => trimUuid(id))
        .filter((id): id is string => Boolean(id));
    if (permitted.length === 1) {
        return { location_id: permitted[0]!, source: "single_permitted_site" };
    }

    return { location_id: null, source: "none" };
}

/** Apply resolved default to gather values when location_id is still empty. */
export function applyCreateLeadDefaultLocationToValues(
    values: Record<string, string>,
    resolved: ResolveCreateLeadDefaultLocationResult
): Record<string, string> {
    if (!resolved.location_id || trimUuid(values.location_id)) return values;
    return { ...values, location_id: resolved.location_id };
}

/**
 * Whether Create Lead should write the implied workspace/single-site location into the draft.
 * Re-applies when empty (e.g. after analyze wiped it) or when a prior system-implied value
 * should track a newly selected campus. Never clobbers operator-entered / parsed locations.
 */
export function shouldApplyImpliedCreateLeadLocation(args: {
    currentLocationId?: string | null;
    impliedLocationId?: string | null;
    currentIsWorkspaceImplied?: boolean;
}): boolean {
    const implied = trimUuid(args.impliedLocationId);
    if (!implied) return false;
    const current = trimUuid(args.currentLocationId);
    if (!current) return true;
    return Boolean(args.currentIsWorkspaceImplied) && current !== implied;
}
