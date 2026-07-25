/**
 * Field behavior policy for nested drill-in surfaces (Surface Composer V3).
 *
 * editable   — renders and may be submitted when save is supported
 * linked     — renders with a card-link affordance to the owning Focus Panel card
 * read-only  — renders but cannot be edited on save surfaces
 * hidden     — does not render in runtime (still configured)
 */

export type SurfaceFieldVisibility = "editable" | "linked" | "read-only" | "hidden";

/** @deprecated Legacy persisted value — reconciled to read-only at load. */
export type LegacySurfaceFieldVisibility = "displayed" | SurfaceFieldVisibility;

export const SURFACE_FIELD_VISIBILITY_LABELS: Record<SurfaceFieldVisibility, string> = {
    editable: "Editable",
    linked: "Linked",
    "read-only": "Read-only",
    hidden: "Hidden",
};

export function normalizeFieldVisibility(value: string | undefined): SurfaceFieldVisibility {
    if (value === "editable" || value === "linked" || value === "read-only" || value === "hidden") {
        return value;
    }
    if (value === "displayed") return "read-only";
    return "read-only";
}

/** Default visibility when no explicit policy is stored. */
export function defaultFieldVisibility(surfaceId: string, groupKey: string): SurfaceFieldVisibility {
    if (surfaceId === "household_surface" && groupKey === "contact_edit") return "editable";
    if (surfaceId === "children_surface" && groupKey === "child_edit") return "editable";
    return "read-only";
}

export function resolveFieldVisibility(
    policies: Record<string, string> | undefined,
    fieldKey: string,
    fallback: SurfaceFieldVisibility,
): SurfaceFieldVisibility {
    const stored = policies?.[fieldKey];
    if (stored) return normalizeFieldVisibility(stored);
    return fallback;
}

/** True when the field should render in runtime (hidden fields are omitted). */
export function fieldShouldRender(visibility: SurfaceFieldVisibility): boolean {
    return visibility !== "hidden";
}

/** True when a save surface may include this field in the patch. */
export function fieldIsSaveable(visibility: SurfaceFieldVisibility): boolean {
    return visibility === "editable";
}

/** True when the field renders a card-link affordance instead of inline edit. */
export function fieldIsLinked(visibility: SurfaceFieldVisibility): boolean {
    return visibility === "linked";
}

/** True when the field renders but inputs are disabled. */
export function fieldIsReadOnly(visibility: SurfaceFieldVisibility): boolean {
    return visibility === "read-only";
}
