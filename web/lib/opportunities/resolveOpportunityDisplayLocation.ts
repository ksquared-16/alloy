import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";

/**
 * Opportunity location display — child/member locations are canonical; opportunity.location_id is fallback.
 * @see docs/archive/2026-06-superseded-system/entity-model.md § Location semantics
 */

export const OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL = "Multiple locations";
export const OPPORTUNITY_DISPLAY_NO_LOCATION_LABEL = "No location";

export function formatOpportunityDisplayMultipleLocationsLabel(count: number): string {
    if (count <= 1) return OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL;
    return `${count} locations`;
}

export type OpportunityDisplayLocationChildInput = {
    locationId?: string | null;
    locationLabel?: string | null;
};

export type OpportunityDisplayLocationInput = {
    opportunityLocationId?: string | null;
    opportunityLocationLabel?: string | null;
    childLocations?: OpportunityDisplayLocationChildInput[];
};

export type OpportunityDisplayLocationResolved =
    | {
          kind: "none";
          label: null;
          locations: [];
      }
    | {
          kind: "single";
          label: string;
          locationId: string | null;
          locations: Array<{ id: string | null; name: string }>;
      }
    | {
          kind: "multiple";
          label: string;
          locations: Array<{ id: string | null; name: string }>;
      };

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const t = String(value).trim();
    return t.length > 0 ? t : null;
}

function normalizeLocationName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeChildLocations(
    childLocations: OpportunityDisplayLocationChildInput[]
): Array<{ id: string | null; name: string }> {
    const seen = new Set<string>();
    const out: Array<{ id: string | null; name: string }> = [];

    for (const child of childLocations) {
        const id = trimOrNull(child.locationId);
        const label = trimOrNull(child.locationLabel);
        if (!id && !label) continue;

        const dedupeKey = id ? `id:${id}` : `name:${normalizeLocationName(label!)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const safeName = label ?? (id && !isUuidLike(id) ? id : null);
        if (!safeName) continue;
        out.push({
            id,
            name: safeName,
        });
    }

    return out;
}

export function resolveOpportunityDisplayLocation(
    input: OpportunityDisplayLocationInput
): OpportunityDisplayLocationResolved {
    const childResolved = dedupeChildLocations(input.childLocations ?? []);

    if (childResolved.length === 1) {
        const only = childResolved[0]!;
        return {
            kind: "single",
            label: only.name,
            locationId: only.id,
            locations: childResolved,
        };
    }

    if (childResolved.length > 1) {
        return {
            kind: "multiple",
            label: formatOpportunityDisplayMultipleLocationsLabel(childResolved.length),
            locations: childResolved,
        };
    }

    const opportunityLocationId = trimOrNull(input.opportunityLocationId);
    const opportunityLocationLabel = trimOrNull(input.opportunityLocationLabel);

    if (opportunityLocationId || opportunityLocationLabel) {
        const name =
            opportunityLocationLabel ??
            (opportunityLocationId && !isUuidLike(opportunityLocationId) ? opportunityLocationId : null);
        if (!name) {
            return { kind: "none", label: null, locations: [] };
        }
        return {
            kind: "single",
            label: name,
            locationId: opportunityLocationId,
            locations: [{ id: opportunityLocationId, name }],
        };
    }

    return { kind: "none", label: null, locations: [] };
}

export function opportunityDisplayLocationFromRecord(
    record: Record<string, unknown>
): OpportunityDisplayLocationResolved {
    const inquiryChildren = Array.isArray(record._inquiry_children) ? record._inquiry_children : [];

    const childLocations: OpportunityDisplayLocationChildInput[] = inquiryChildren
        .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
        .map((row) => ({
            locationId: trimOrNull(row.location_id),
            locationLabel: trimOrNull(row.location_label),
        }));

    return resolveOpportunityDisplayLocation({
        opportunityLocationId: trimOrNull(record.location_id ?? record._location_id),
        opportunityLocationLabel: trimOrNull(record._location_label ?? record._location_name),
        childLocations,
    });
}

/** Native opportunity row location — not child-location aggregate precedence. */
export function resolveOpportunityLeadLocationFields(record: Record<string, unknown>): {
    locationId: string;
    locationLabel: string;
} {
    const locationId = trimOrNull(record.location_id ?? record._location_id ?? record["opportunity.location_id"]) ?? "";
    const locationLabel =
        trimOrNull(record._location_label ?? record._location_name ?? record["opportunity.location"])
        ?? (locationId && !isUuidLike(locationId) ? locationId : "")
        ?? "";
    return { locationId, locationLabel };
}

/** Operator-facing location label for opportunity drawer surfaces (header + layout fields). */
export function resolveOpportunityDrawerLocationLabel(record: Record<string, unknown>): string {
    const lead = resolveOpportunityLeadLocationFields(record);
    if (lead.locationLabel) return lead.locationLabel;

    const resolved = opportunityDisplayLocationFromRecord(record);
    if (resolved.kind === "single") return resolved.label;
    if (resolved.kind === "multiple") return resolved.label;
    return OPPORTUNITY_DISPLAY_NO_LOCATION_LABEL;
}

/** Primary operator-facing label for opportunity location surfaces (header, overview). */
export function opportunityDisplayLocationLabel(record: Record<string, unknown>): string {
    return resolveOpportunityDrawerLocationLabel(record);
}
