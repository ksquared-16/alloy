/**
 * Family Guided Intake — schema-driven plan for multiple children in ONE experience.
 *
 * A family completes a single enrollment, not a packet per child:
 *   household (shared, once) → child section per selected child → signatures (per recipient).
 *
 * Field scope comes from the classifier (config-driven, not a hardcoded process). Child
 * sections render the SAME child-scoped fields once per child; their answers are kept
 * per-child via a payload-key scheme.
 *
 * Storage gap (documented): the underlying `form_submissions` validate against ONE form
 * schema, so the canonical `values` can hold only one set of child-field answers. We put the
 * first selected child's child-field answers in canonical `values` (so required child fields
 * validate + flow to existing prefill/record mapping), and keep EVERY child's child answers
 * in `payload.meta.family.children[]`. True per-child record writes await child-scoped
 * storage; until then sibling answers are preserved in metadata for later mapping.
 *
 * Pure, no I/O.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { partitionFieldsByScope } from "@/lib/forms/fieldScope";

export interface FamilyChildRef {
    customer_member_id: string;
    label?: string;
}

export type FamilyStepKind = "household" | "child" | "signature";

export interface FamilyGuidedStep {
    key: string;
    kind: FamilyStepKind;
    title: string;
    subtitle?: string;
    fieldIds: string[];
    /** Set for child steps — which child this section collects. */
    child?: FamilyChildRef;
}

export interface FamilyGuidedPlan {
    steps: FamilyGuidedStep[];
    scope: { household: string[]; child: string[]; recipient: string[] };
}

/**
 * Build the ordered family steps: one household step (if any household fields), one step per
 * selected child (if any child fields), one signature step (if any). Empty scopes are skipped.
 */
export function buildFamilyGuidedPlan(schema: FormSchemaV1, children: FamilyChildRef[]): FamilyGuidedPlan {
    const scope = partitionFieldsByScope(schema);
    const steps: FamilyGuidedStep[] = [];

    if (scope.household.length > 0) {
        steps.push({ key: "household", kind: "household", title: "Your household", subtitle: "Shared details — we'll ask these once for the whole family.", fieldIds: scope.household });
    }
    if (scope.child.length > 0) {
        children.forEach((child, i) => {
            steps.push({
                key: `child:${child.customer_member_id}`,
                kind: "child",
                title: child.label ? `About ${child.label}` : `Child ${i + 1}`,
                subtitle: "Details specific to this child.",
                fieldIds: scope.child,
                child,
            });
        });
    }
    if (scope.recipient.length > 0) {
        steps.push({ key: "signatures", kind: "signature", title: "Review & sign", subtitle: "Confirm and sign to finish.", fieldIds: scope.recipient });
    }

    return { steps, scope };
}

/* ----------------------------- family context detect ----------------------------- */

/**
 * Detect the family-packet children from a session's launch_context (or link metadata):
 * `selected_customer_member_ids[]` (+ optional `selected_customer_member_labels` map).
 * Returns the ordered child refs (empty when not a family launch).
 */
export function detectFamilyChildren(launchContext: Record<string, unknown> | null | undefined): FamilyChildRef[] {
    const ids = launchContext?.selected_customer_member_ids;
    if (!Array.isArray(ids)) return [];
    const rawLabels = launchContext?.selected_customer_member_labels;
    const labels: Record<string, string> =
        rawLabels && typeof rawLabels === "object" && !Array.isArray(rawLabels) ? (rawLabels as Record<string, string>) : {};
    const seen = new Set<string>();
    const out: FamilyChildRef[] = [];
    for (const id of ids) {
        if (typeof id !== "string" || !id || seen.has(id)) continue;
        seen.add(id);
        out.push({ customer_member_id: id, ...(typeof labels[id] === "string" ? { label: labels[id] } : {}) });
    }
    return out;
}

/** True when the launch is a multi-child family packet AND the form has child-scoped fields. */
export function isFamilyIntake(children: FamilyChildRef[], childFieldIds: string[]): boolean {
    return children.length > 1 && childFieldIds.length > 0;
}

/**
 * Seed per-child value slices: the FIRST child inherits the form's prefilled child-field
 * values (link prefill targets one child); siblings start empty.
 */
export function seedFamilyChildSlices(
    children: FamilyChildRef[],
    childFieldIds: string[],
    initialValues: Record<string, unknown>
): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    const childSet = new Set(childFieldIds);
    children.forEach((c, i) => {
        const slice: Record<string, unknown> = {};
        if (i === 0) for (const fid of childSet) if (fid in initialValues) slice[fid] = initialValues[fid];
        out[c.customer_member_id] = slice;
    });
    return out;
}

/** Base (non-child) values = the payload values minus child-scoped fields. */
export function omitChildFields(values: Record<string, unknown>, childFieldIds: string[]): Record<string, unknown> {
    const childSet = new Set(childFieldIds);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) if (!childSet.has(k)) out[k] = v;
    return out;
}

/* ------------------------------ payload assembly ------------------------------ */

export interface FamilyChildAnswers {
    customer_member_id: string;
    label?: string;
    values: Record<string, unknown>;
}

export interface AssembleFamilyPayloadInput {
    /** Household + recipient/signature values (canonical, validated against the schema). */
    baseValues: Record<string, unknown>;
    /** Per-child child-field answers, keyed by customer_member_id. */
    childAnswers: FamilyChildAnswers[];
    childFieldIds: string[];
    /** Existing payload meta to merge into. */
    meta?: Record<string, unknown>;
}

/**
 * Assemble the final submission payload for a family intake:
 * - canonical `values` = base (household/signature) + the FIRST child's child-field answers
 *   (so required child fields validate and flow to existing record mapping);
 * - `meta.family.children[]` = every child's child-field answers (siblings preserved).
 */
export function assembleFamilySubmissionPayload(input: AssembleFamilyPayloadInput): {
    values: Record<string, unknown>;
    meta: Record<string, unknown>;
} {
    const childFieldSet = new Set(input.childFieldIds);
    const first = input.childAnswers[0];
    const firstChildValues: Record<string, unknown> = {};
    if (first) {
        for (const fid of childFieldSet) if (fid in first.values) firstChildValues[fid] = first.values[fid];
    }

    const values = { ...input.baseValues, ...firstChildValues };
    const meta = {
        ...(input.meta ?? {}),
        family: {
            children: input.childAnswers.map((c) => ({
                customer_member_id: c.customer_member_id,
                ...(c.label ? { label: c.label } : {}),
                values: Object.fromEntries(Object.entries(c.values).filter(([k]) => childFieldSet.has(k))),
            })),
            canonical_child_id: first?.customer_member_id ?? null,
        },
    };
    return { values, meta };
}
