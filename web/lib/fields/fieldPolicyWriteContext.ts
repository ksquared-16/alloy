/**
 * Write context for field-policy enforcement.
 *
 * A layout field placement authors behavior against a SURFACE:
 *
 *     config_json.field_placements_v1[].surfaces.drawer_overview.requirement
 *
 * `resolveEffectiveFieldBehavior` already models that scope — it returns `null` for any surface
 * other than `drawer_overview`. Enforcement dropped it, so a rule authored as "Source is required
 * when an operator edits this record on the drawer overview" became "no write of any kind may touch
 * this record from any origin". One placement froze every opportunity in the tenant against every
 * write, including a no-op resend of the record's own unchanged name.
 *
 * This module carries the missing half: the surface a write is coming FROM, so the authored scope
 * can be honored instead of discarded.
 *
 * The rule is narrow on purpose:
 *
 *     requirement authored on a placement  → enforce only on writes from that surface
 *     requirement authored on the field    → enforce on every write (unchanged)
 *
 * Nothing is weakened. `required` stays `required`, `save` scope stays `save`, field validation
 * still runs, and definition-level requirements — the org-wide ones an admin sets on the field
 * itself — apply from every origin exactly as before. Only the surface-scoped layer learns to
 * respect the scope it was already written with.
 *
 * The surface is DECLARED by the caller, never inferred. Inferring it from a URL, a body shape or a
 * component name would re-introduce the same class of bug one layer up: enforcement guessing at
 * intent instead of reading it.
 */

import {
    FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW,
    type FieldBehaviorSurfaceV1,
} from "@/lib/fields/fieldPlacementV1";
import type { EffectiveFieldBehaviorSource } from "@/lib/fields/resolveEffectiveFieldBehavior";

/**
 * Request header a mutating caller uses to declare which operator surface it is writing from.
 * Follows the existing `x-alloy-*` convention (`x-alloy-queue-caller-surface`).
 */
export const FIELD_POLICY_WRITE_SURFACE_HEADER = "x-alloy-write-surface";

/** Surfaces a write may declare. Mirrors the surfaces a placement can be authored against. */
export const FIELD_POLICY_WRITE_SURFACES: readonly FieldBehaviorSurfaceV1[] = [
    FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW,
];

/**
 * A write's declared surface, or `null` when the caller declares none.
 *
 * `null` is not "unknown, so enforce everything". A placement is scoped to a named surface; a write
 * that does not come from that surface is outside the rule the admin authored. Commands, stage
 * transitions, relationship operations and background mutations legitimately declare nothing.
 */
export type FieldPolicyWriteSurface = FieldBehaviorSurfaceV1 | null;

/** Narrow an arbitrary string to a known write surface. Never throws. */
export function parseFieldPolicyWriteSurface(raw: unknown): FieldPolicyWriteSurface {
    if (typeof raw !== "string") return null;
    const t = raw.trim().toLowerCase();
    if (!t) return null;
    return (FIELD_POLICY_WRITE_SURFACES as readonly string[]).includes(t)
        ? (t as FieldBehaviorSurfaceV1)
        : null;
}

/** Read the declared write surface off an incoming request. Unknown values resolve to `null`. */
export function fieldPolicyWriteSurfaceFromHeaders(headers: {
    get(name: string): string | null;
}): FieldPolicyWriteSurface {
    return parseFieldPolicyWriteSurface(headers.get(FIELD_POLICY_WRITE_SURFACE_HEADER));
}

/** Outgoing header for a client that edits fields on a known surface. */
export function fieldPolicyWriteSurfaceHeader(
    surface: FieldBehaviorSurfaceV1
): Record<string, string> {
    return { [FIELD_POLICY_WRITE_SURFACE_HEADER]: surface };
}

/**
 * Does a resolved requirement apply to this write?
 *
 * Only requirements that came from a placement are surface-scoped. Everything else — the field
 * definition's own policy, and the adapter's preset caps — is unscoped and always applies.
 *
 * @param requirementSource where `resolveEffectiveFieldBehavior` resolved the requirement from
 * @param authoredSurface   the surface the placement was authored against
 * @param writeSurface      the surface this write declared, if any
 */
export function requirementAppliesToWriteSurface(params: {
    requirementSource: EffectiveFieldBehaviorSource | undefined;
    authoredSurface: FieldBehaviorSurfaceV1;
    writeSurface: FieldPolicyWriteSurface;
}): boolean {
    if (params.requirementSource !== "placement") return true;
    return params.writeSurface === params.authoredSurface;
}
