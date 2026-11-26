/**
 * Forms / Documents reference index — queryable by delete-safety and platform consumers.
 *
 * Enforcement: references are discoverable; full cross-consumer blocking remains platform-deferred.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import {
    discoverFormsDocumentsSchemaReferences,
    type FormsDocumentsSchemaReference,
} from "@/lib/forms/collection/formsDocumentsSchemaReferences";

export type FormsDocumentsFormReference = {
    form_id: string;
    form_name?: string;
    published?: boolean;
    references: FormsDocumentsSchemaReference[];
};

export function indexFormsDocumentsSchemaReferences(
    form: { form_id: string; form_name?: string; published?: boolean; schema: Pick<FormSchemaV1, "fields"> },
): FormsDocumentsFormReference {
    return {
        form_id: form.form_id,
        form_name: form.form_name,
        published: form.published,
        references: discoverFormsDocumentsSchemaReferences(form.schema),
    };
}

export function formsDocumentsReferencesForFieldKey(
    forms: FormsDocumentsFormReference[],
    entityType: string,
    fieldKey: string,
): FormsDocumentsFormReference[] {
    const needle = `${entityType.trim().toLowerCase()}.${fieldKey.trim().toLowerCase()}`;
    return forms.filter((f) =>
        f.references.some((r) => r.kind === "nested_field" && r.ref === needle),
    );
}

export function formsDocumentsReferencesForCollectionProvider(
    forms: FormsDocumentsFormReference[],
    providerRef: string,
): FormsDocumentsFormReference[] {
    const ref = providerRef.trim();
    return forms.filter((f) =>
        f.references.some((r) => r.kind === "collection_provider" && r.ref === ref),
    );
}
