/**
 * The AUTHORED control a turn is asking about — resolved from the PINNED schema.
 *
 * ## Why this small function matters
 *
 * The participant turn route passed `field: null`. That single null meant the conversation never
 * reached Forms' own validator (`validateScalarValue`), so a field's authored `validate.min`,
 * `validate.max` and `validate.pattern` were not enforced while the parent was answering — only
 * later, at submission, against an artifact they had already been told was fine.
 *
 * Everything needed was already in hand: the turn's need names its occurrence's `form_field_id`,
 * and the needs context carries each requirement's pinned schema. This just walks the one to the
 * other.
 *
 * ## Pinned, never latest
 *
 * The schemas here are `PinnedRequirementForm.schema` — the D-94 pinned version's `schema_json`.
 * A form republished mid-session cannot change what the parent is being validated against.
 *
 * Pure. No I/O.
 */

import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import type { FormField } from "@/lib/forms/schema";
import type { EnrollmentNeedsContext } from "@/lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

/**
 * Find the authored field for the turn's current need, or null.
 *
 * Null is a legitimate answer — a turn with no need, or a session item whose pinned version is no
 * longer resolvable. Callers fall back to the narrow type gate, never to "anything goes".
 */
export function resolveAuthoredFieldForTurn(
    turn: ParticipantTurn,
    context: Pick<EnrollmentNeedsContext, "forms">,
): FormField | null {
    const occurrence = turn.need?.occurrences?.[0] ?? null;
    if (!occurrence) return null;

    /**
     * Matched by session ITEM and version, not by form definition alone.
     *
     * The same form definition can appear more than once in a packet, and the occurrence names the
     * exact realized item. Matching loosely would validate against a sibling's schema.
     */
    const form =
        context.forms.find(
            (f) =>
                f.session_item_id === occurrence.session_item_id &&
                f.form_definition_version_id === occurrence.form_definition_version_id,
        ) ??
        context.forms.find((f) => f.form_definition_version_id === occurrence.form_definition_version_id) ??
        null;
    if (!form) return null;

    let found: FormField | null = null;
    walkScalarFormFields(form.schema, (field) => {
        if (found) return;
        if (field.id === occurrence.form_field_id) found = field;
    });
    return found;
}
