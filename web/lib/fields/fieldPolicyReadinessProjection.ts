/**
 * Field-policy requirements, projected into operator readiness.
 *
 * The platform has two required-information systems. `lib/completion/*` evaluates operational
 * requirements and owns everything the operator sees: readiness, preflight, the blocked panel, the
 * "what's missing" explanation. `lib/fields/*` evaluates configured field policies and owns the
 * PATCH gate. Nothing under `lib/completion/` has ever read a `requirement_policy` or a
 * `field_placements_v1` entry.
 *
 * So the second system could block work the first could not explain. The operator clicked Move to
 * Tour and got a raw 400 naming a field no surface had ever mentioned, because readiness was
 * structurally blind to the requirement that was blocking.
 *
 * This module is the bridge. It does NOT merge the two engines or move any storage — it projects
 * unmet field-policy requirements into `ReadinessGap`s so the existing readiness surfaces can
 * present one coherent list.
 *
 * The projection is computed by calling the enforcement evaluator itself, with an empty body, so
 * "what readiness says is missing" and "what the PATCH gate will reject" are the same computation
 * over the same inputs. They cannot drift, because there is only one of them.
 *
 * SURFACE, AND WHY READINESS USES THE AUTHORED ONE
 *
 * Enforcement asks "does this requirement apply to the write in front of me", so it evaluates at
 * the surface the write declared. Readiness asks "what does this record still need", so it
 * evaluates at the surface each requirement was authored against — the superset. A gap therefore
 * appears in readiness while the operator is free to keep working elsewhere, which is the intended
 * shape: a surface-scoped requirement should be visible and resolvable without freezing the record.
 */

import {
    evaluateDrawerFieldPoliciesOnPatch,
    type FieldPolicyPatchViolation,
} from "@/lib/fields/enforceDrawerFieldPoliciesOnPatch";
import { FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW } from "@/lib/fields/fieldPlacementV1";
import type { FieldPolicyWriteSurface } from "@/lib/fields/fieldPolicyWriteContext";
import type { DrawerPolicyEntityType } from "@/lib/fields/drawerFieldPolicyAdapter";
import type { ReadinessGap } from "@/lib/completion/readinessTypes";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

/** Requirement id prefix, so a field-policy gap is attributable to its engine on any surface. */
export const FIELD_POLICY_REQUIREMENT_ID_PREFIX = "field_policy";

export type FieldPolicyReadinessFieldDef = {
    id: string;
    field_key: string;
    field_type?: string;
    label?: string | null;
    is_system: boolean;
    is_required?: boolean;
    requirement_policy?: unknown;
    interaction_policy?: unknown;
};

export type FieldPolicyReadinessInput = {
    entityType: DrawerPolicyEntityType;
    entityId: string;
    defs: FieldPolicyReadinessFieldDef[];
    /** Persisted record snapshot, same shape the PATCH gate reads. */
    record: Record<string, unknown>;
    customValuesByFieldKey?: Record<string, unknown>;
    layoutConfig?: RecordLayoutConfigJson | null;
    /**
     * Surface to evaluate at. Defaults to the authored surface so readiness reports the full set of
     * unmet requirements rather than only those blocking the current write.
     */
    surface?: FieldPolicyWriteSurface;
};

/** Human label for a gap — the configured field label, falling back to a readable key. */
export function fieldPolicyGapLabel(def: FieldPolicyReadinessFieldDef | undefined, fieldKey: string): string {
    const label = def?.label?.trim();
    if (label) return label;
    return fieldKey
        .split(/[_.]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function gapFromViolation(
    violation: FieldPolicyPatchViolation,
    input: FieldPolicyReadinessInput,
    defByKey: Map<string, FieldPolicyReadinessFieldDef>
): ReadinessGap {
    return {
        requirement_id: `${FIELD_POLICY_REQUIREMENT_ID_PREFIX}:${input.entityType}:${violation.field_key}`,
        scope_type: "record",
        // Enforced, because it is: this requirement stops a real write. Presenting it any softer
        // would reproduce the original problem in gentler language.
        level: "enforced",
        label: fieldPolicyGapLabel(defByKey.get(violation.field_key), violation.field_key),
        missing_reason: "Required before this record can be saved.",
        failure_kind: "missing",
        blocking: true,
        entity_type: input.entityType,
        entity_id: input.entityId,
        field_key: violation.field_key,
        // A field gap resolves by setting the field — the canonical field editor, not a bespoke modal.
        resolution: { type: "field" },
    };
}

/**
 * Unmet field-policy requirements for one record, as readiness gaps.
 *
 * Read-only and pure; never throws. Returns `[]` when there is nothing configured, so a caller can
 * always concatenate the result unconditionally.
 */
export function projectFieldPolicyReadinessGaps(input: FieldPolicyReadinessInput): ReadinessGap[] {
    if (!input.defs.length) return [];

    const surface =
        input.surface === undefined ? FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW : input.surface;

    // The empty body is the point: "what does this record still need", evaluated by the same code
    // that decides "may this write proceed".
    const result = evaluateDrawerFieldPoliciesOnPatch({
        entityType: input.entityType,
        defs: input.defs,
        body: {},
        persisted: input.record,
        customValuesByFieldKey: input.customValuesByFieldKey ?? {},
        layoutConfig: input.layoutConfig,
        writeSurface: surface,
    });
    if (result.ok) return [];

    const defByKey = new Map(input.defs.map((d) => [d.field_key, d]));
    return result.violations
        // `read_only` is not a gap the operator can close; it is a lock, and surfacing it as
        // missing information would be a lie about what they are supposed to do.
        .filter((v) => v.code !== "read_only")
        .map((v) => gapFromViolation(v, input, defByKey));
}

/** True when a readiness gap came from the field-policy engine. */
export function isFieldPolicyReadinessGap(gap: ReadinessGap): boolean {
    return gap.requirement_id.startsWith(`${FIELD_POLICY_REQUIREMENT_ID_PREFIX}:`);
}
