/**
 * Session shared values → the form-field ids of ONE artifact.
 *
 * ## The gap this closes
 *
 * `form_packet_sessions.shared_values` is where the packet runtime keeps a fact the participant has
 * settled, keyed canonically so one answer serves every occurrence. Until now the ONLY thing that
 * read it was the submit path, which merges it forward when a step completes.
 *
 * Nothing applied it to the artifact being RENDERED. So a parent who answered a question in the
 * conversation reached the review step and found the field empty — the value existed, in the right
 * place, and no one was reading it. On a single-step packet it never surfaced at all.
 *
 * ## One vocabulary, deliberately
 *
 * The mapping uses `canonicalKeyFor` — the SAME derivation that keys an Enrollment information need
 * and a packet field-plan entry. A second key-derivation here would eventually disagree with the one
 * that decided what to ask, and the failure mode is silent: the parent answers a question and the
 * value lands on no field.
 *
 * Both key shapes are honoured, because a form may bind either way and a tenant's forms mix them:
 *   `field_source.shared_value_key`  →  the alias, e.g. `child_date_of_birth`
 *   `entity_type` + `field_key`      →  `entity:field`, e.g. `customer_member:allergies`
 *
 * Pure. No I/O.
 */

import { canonicalKeyFor } from "@/lib/pos/packet/packetFieldPlan";
import { formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * Which fields of this schema the settled shared values answer.
 *
 * Unbound fields are never filled: they have no canonical identity, so nothing in the shared
 * namespace can legitimately claim to be their value. They remain the artifact's own to collect.
 */
export function sharedValuesToFieldIds(
    schema: Pick<FormSchemaV1, "fields">,
    sharedValues: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!sharedValues || Object.keys(sharedValues).length === 0) return out;

    walkScalarFormFields(schema as FormSchemaV1, (field) => {
        if (!formFieldCollectsValue(field)) return;
        const resolved = canonicalKeyFor(field);
        if (resolved.basis === "unbound") return;

        // The alias first, then the entity form — a form authored either way finds its value, and a
        // form authored BOTH ways resolves to the same fact rather than two.
        for (const key of [resolved.shared_value_key, resolved.key]) {
            if (!key) continue;
            if (!Object.prototype.hasOwnProperty.call(sharedValues, key)) continue;
            out[field.id] = sharedValues[key];
            return;
        }
    });

    return out;
}
