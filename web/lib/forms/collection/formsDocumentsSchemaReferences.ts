/**
 * Forms / Documents consumer reference discovery for delete-safety.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { groupFieldHasCollectionBinding } from "@/lib/fields/formsCollectionRepeatBinding";

export type FormsDocumentsSchemaReference = {
    kind: "collection_provider" | "nested_field" | "scalar_field";
    ref: string;
    group_id?: string;
    field_id?: string;
};

function walkFields(fields: FormField[], inCollectionGroup: boolean, groupId: string | undefined, out: FormsDocumentsSchemaReference[]) {
    for (const f of fields) {
        if (f.type === "group") {
            if (groupFieldHasCollectionBinding(f)) {
                out.push({
                    kind: "collection_provider",
                    ref: f.collection_binding!.collection_provider_ref,
                    group_id: f.id,
                });
                walkFields(f.fields, true, f.id, out);
            } else {
                walkFields(f.fields, inCollectionGroup, groupId, out);
            }
            continue;
        }
        if (inCollectionGroup && groupId) {
            out.push({
                kind: "nested_field",
                ref: f.field_source ? `${f.field_source.entity_type}.${f.field_source.field_key}` : f.id,
                group_id: groupId,
                field_id: f.id,
            });
        } else if (f.field_source) {
            out.push({
                kind: "scalar_field",
                ref: `${f.field_source.entity_type}.${f.field_source.field_key}`,
                field_id: f.id,
            });
        }
    }
}

export function discoverFormsDocumentsSchemaReferences(schema: Pick<FormSchemaV1, "fields">): FormsDocumentsSchemaReference[] {
    const out: FormsDocumentsSchemaReference[] = [];
    walkFields(schema.fields, false, undefined, out);
    return out;
}

export function schemaReferencesCollectionProvider(schema: Pick<FormSchemaV1, "fields">, providerRef: string): boolean {
    return discoverFormsDocumentsSchemaReferences(schema).some(
        (r) => r.kind === "collection_provider" && r.ref === providerRef.trim(),
    );
}

export function schemaReferencesFieldKey(schema: Pick<FormSchemaV1, "fields">, entityType: string, fieldKey: string): boolean {
    const needle = `${entityType}.${fieldKey}`;
    return discoverFormsDocumentsSchemaReferences(schema).some((r) => r.ref === needle);
}

/** Bounded delete-safety signal — published form references block unsafe provider disable. */
export function formsDocumentsReferencesCollectionProvider(
    schemas: Array<{ form_id: string; schema: Pick<FormSchemaV1, "fields">; published?: boolean }>,
    providerRef: string,
): Array<{ form_id: string; group_id: string; published?: boolean }> {
    const hits: Array<{ form_id: string; group_id: string; published?: boolean }> = [];
    for (const fd of schemas) {
        for (const ref of discoverFormsDocumentsSchemaReferences(fd.schema)) {
            if (ref.kind === "collection_provider" && ref.ref === providerRef.trim()) {
                hits.push({ form_id: fd.form_id, group_id: ref.group_id ?? "", published: fd.published });
            }
        }
    }
    return hits;
}
