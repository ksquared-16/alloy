/**
 * Opportunity location display — child/member locations are canonical; opportunity.location_id is fallback.
 * @see docs/system/entity-model.md § Location semantics
 */

export const OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL = "Multiple locations";

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
          label: typeof OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL;
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

        out.push({
            id,
            name: label ?? id ?? "—",
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
            label: OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL,
            locations: childResolved,
        };
    }

    const opportunityLocationId = trimOrNull(input.opportunityLocationId);
    const opportunityLocationLabel = trimOrNull(input.opportunityLocationLabel);

    if (opportunityLocationId || opportunityLocationLabel) {
        const name = opportunityLocationLabel ?? opportunityLocationId ?? "—";
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

/** Primary operator-facing label for opportunity location surfaces (header, overview). */
export function opportunityDisplayLocationLabel(record: Record<string, unknown>): string | null {
    const resolved = opportunityDisplayLocationFromRecord(record);
    if (resolved.kind === "none") return null;
    return resolved.label;
}
