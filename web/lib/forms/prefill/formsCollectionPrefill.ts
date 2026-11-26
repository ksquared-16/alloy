/**
 * Collection-bound repeatable section prefill — step-local in packets.
 *
 * Repeatable collection values do not participate in packet shared_values dedupe.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { groupFieldHasCollectionBinding } from "@/lib/fields/formsCollectionRepeatBinding";

/** P4: collection repeaters hydrate from canonical resolver; values remain step-local in packets. */
export function collectionRepeaterPrefillIsStepLocal(_schema: FormSchemaV1, groupField: FormField): boolean {
    return groupFieldHasCollectionBinding(groupField);
}

/** Whether packet shared-value planner should skip fields inside collection-bound groups. */
export function fieldIsInsideCollectionBoundGroup(schema: FormSchemaV1, fieldId: string): boolean {
    let inside = false;
    const walk = (fields: FormField[], inCollectionGroup: boolean) => {
        for (const f of fields) {
            if (f.type === "group") {
                const bound = groupFieldHasCollectionBinding(f);
                walk(f.fields, inCollectionGroup || bound);
                continue;
            }
            if (inCollectionGroup && f.id === fieldId) inside = true;
        }
    };
    walk(schema.fields, false);
    return inside;
}

/** Walk group fields that bind to a canonical collection provider. */
export function collectCollectionBoundGroupFields(schema: FormSchemaV1): FormField[] {
    const out: FormField[] = [];
    const walk = (fields: FormField[]) => {
        for (const f of fields) {
            if (f.type === "group") {
                if (groupFieldHasCollectionBinding(f)) out.push(f);
                walk(f.fields);
            }
        }
    };
    walk(schema.fields);
    return out;
}
