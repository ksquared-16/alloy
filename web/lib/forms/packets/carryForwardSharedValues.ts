/**
 * What one finished artifact hands to the next — by IDENTITY, never by position.
 *
 * ## The defect this closes
 *
 * A completed packet step merged its whole submitted payload into `form_packet_sessions.
 * shared_values` keyed by FIELD ID, and the next step's draft was seeded by spreading that map over
 * the new payload. `field_6` is a phone number on the Oregon CIS and a date on the Oregon Nonmedical
 * Exemption; `field_25` is a date on one and a checkbox on the other. So finishing the CIS made the
 * Exemption's draft unopenable — "Expected date string YYYY-MM-DD", "Expected boolean" — and the
 * parent, having signed their first document, was shown an error instead of their second.
 *
 * A field id is an artifact's internal coordinate. It identifies a question only inside the Form
 * that defines it, and carrying it across Forms asserts a sameness that was never established.
 *
 * ## The vocabulary already existed
 *
 * `sharedValuesToFieldIds` has always said it: an unbound field has no canonical identity, so
 * nothing in the shared namespace may claim to be its value. And a process-scoped key
 * (`process:{formDefinitionId}:{fieldId}`) addresses exactly one destination on exactly one Form,
 * which is what an artifact's own answer IS. Both readers were correct; the writer disagreed with
 * them, and the raw spread at draft creation bypassed both.
 *
 * So: a value with canonical identity carries under that identity. Everything else carries under
 * the Form it belongs to, and reaches no other Form. Nothing is lost — it is addressed properly.
 *
 * Pure. No I/O.
 */

import { canonicalKeyFor } from "@/lib/pos/packet/packetFieldPlan";
import { formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import { processScopedAnswerKey } from "@/lib/enrollment/informationNeeds/participantCollectionMode";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * Merge a finished artifact's values into the session's shared namespace.
 *
 * Without a schema to identify against there is nothing to derive identity FROM, so the historical
 * shallow merge stands — this is a widening of the contract, not a silent change of it.
 */
export function carryForwardSharedValues(
    existing: Readonly<Record<string, unknown>>,
    submittedValues: Readonly<Record<string, unknown>>,
    origin?: { schema: Pick<FormSchemaV1, "fields">; formDefinitionId: string },
): Record<string, unknown> {
    if (!origin?.formDefinitionId || !origin.schema) return { ...existing, ...submittedValues };

    const out: Record<string, unknown> = { ...existing };
    const seen = new Set<string>();

    walkScalarFormFields(origin.schema as FormSchemaV1, (field) => {
        seen.add(field.id);
        if (!Object.prototype.hasOwnProperty.call(submittedValues, field.id)) return;
        const value = submittedValues[field.id];

        if (formFieldCollectsValue(field)) {
            const resolved = canonicalKeyFor(field);
            if (resolved.basis !== "unbound") {
                /*
                 * Both spellings of the same fact.
                 *
                 * `canonicalKeyFor` returns the ALIAS as `key` when a form binds by alias, and the
                 * `entity:field` form when it binds by entity. A packet's forms mix the two, so a
                 * value written under only one spelling is invisible to a sibling artifact authored
                 * the other way — and the reader's own comment already promises it finds either.
                 */
                if (resolved.key) out[resolved.key] = value;
                if (resolved.shared_value_key) out[resolved.shared_value_key] = value;
                if (resolved.entity_type && resolved.field_key) {
                    out[`${resolved.entity_type}:${resolved.field_key}`] = value;
                }
                return;
            }
        }
        // No canonical identity: it belongs to this Form and is addressed as such.
        out[processScopedAnswerKey(origin.formDefinitionId, field.id)] = value;
    });

    /*
     * A value with no field on this schema is carried under its own key unchanged.
     *
     * That is where genuinely canonical keys the participant runtime already wrote
     * (`customer_member:dob`, `person:phone`) live, alongside collection and meta entries. They are
     * not field ids, so re-keying them would be the same mistake in the other direction.
     */
    for (const [key, value] of Object.entries(submittedValues)) {
        if (!seen.has(key)) out[key] = value;
    }
    return out;
}
