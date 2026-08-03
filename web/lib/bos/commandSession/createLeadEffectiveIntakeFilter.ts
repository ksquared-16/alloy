/**
 * Project Form / Review / execution onto the effective Create Lead intake only.
 * Parser may still capture transcript evidence for excluded fields, but those
 * must not materialize entity groups absent from the effective contract.
 */

import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { BosCommandDraft } from "@/lib/bos/commandSession/types";
import {
    effectiveCreateLeadEntities,
    effectiveCreateLeadPayloadKeys,
} from "@/lib/bos/commandSession/createLeadFormSectionProjection";
import { CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import { CREATE_LEAD_INTAKE_HOUSEHOLD_KEY } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";

/**
 * Structural envelope keys — they carry the whole multi-member household, not a single intake
 * field. They are never present in the spec's field key set, so gating them on it silently
 * reduced every household to its primary parent + primary child. Entity-level filtering of their
 * contents is `filterCommitSelectionToEffectiveIntake`'s job, not the payload key filter's.
 */
const HOUSEHOLD_ENVELOPE_KEYS = new Set([
    CREATE_LEAD_HOUSEHOLD_COMMIT_PAYLOAD_KEY,
    CREATE_LEAD_INTAKE_HOUSEHOLD_KEY,
    "household_commit",
    "household",
]);

const CHILD_FLAT_KEYS = new Set([
    "child_first_name",
    "child_last_name",
    "child_date_of_birth",
    "child_dob",
    "child_age",
    "child_age_group",
    "child_program",
    "child_program_room_cohort_key",
    "child_schedule_type",
    "child_start_date",
    "child_location_id",
]);

export function filterCommitSelectionToEffectiveIntake(
    selection: CreateLeadCommitSelection,
    spec: ActionIntakeSpec | null | undefined
): CreateLeadCommitSelection {
    const entities = effectiveCreateLeadEntities(spec);
    // When groups are empty (malformed), do not invent child rows from parse.
    if (!entities.has("child")) {
        return { ...selection, children: [] };
    }
    return selection;
}

/** Drop draft values whose payload keys are outside the effective intake. */
export function filterDraftValuesToEffectiveIntake(
    draft: BosCommandDraft,
    spec: ActionIntakeSpec | null | undefined
): BosCommandDraft {
    const keys = effectiveCreateLeadPayloadKeys(spec);
    if (!keys.size) {
        // Floor-only / empty: keep person identity + contact only.
        const floor = new Set(["first_name", "last_name", "email", "phone"]);
        return {
            ...draft,
            values: draft.values.filter((v) => floor.has(v.fieldKey)),
        };
    }
    return {
        ...draft,
        values: draft.values.filter((v) => keys.has(v.fieldKey)),
    };
}

export function filterParsedHouseholdForEffectiveIntake(
    household: unknown,
    spec: ActionIntakeSpec | null | undefined
): unknown {
    if (household == null) return null;
    const entities = effectiveCreateLeadEntities(spec);
    if (entities.has("child")) return household;

    if (typeof household !== "object" || Array.isArray(household)) return household;
    const obj = household as Record<string, unknown>;
    if (Array.isArray(obj.children)) {
        return { ...obj, children: [] };
    }
    return household;
}

/** Strip child flat keys from an execute/preview payload when Child is not effective. */
export function filterPayloadToEffectiveIntake(
    payload: Record<string, unknown>,
    spec: ActionIntakeSpec | null | undefined
): Record<string, unknown> {
    const keys = effectiveCreateLeadPayloadKeys(spec);
    const entities = effectiveCreateLeadEntities(spec);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (HOUSEHOLD_ENVELOPE_KEYS.has(key)) {
            out[key] = value;
            continue;
        }
        if (!entities.has("child") && CHILD_FLAT_KEYS.has(key)) continue;
        if (keys.size > 0 && !keys.has(key)) continue;
        out[key] = value;
    }
    return out;
}
