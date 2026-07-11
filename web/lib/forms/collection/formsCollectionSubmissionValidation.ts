/**
 * Collection-bound group submission validation — schema contract + org security.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload, FormPayloadGroupRow, NormalizedValidationError } from "@/lib/forms/validateSubmission";
import {
    groupFieldHasCollectionBinding,
    collectionBindingAuthoringEnabledForRef,
    nestedFieldAvailabilityForBinding,
} from "@/lib/fields/formsCollectionRepeatBinding";
import { findFormsCollectionBindingProvider } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

function err(path: string[], message: string): NormalizedValidationError {
    return { path, message, code: "custom" };
}

/** Sync validation: collection metadata matches schema binding. */
export function validateCollectionPayloadContract(
    schema: FormSchemaV1,
    payload: FormPayload,
    mode: "draft" | "submit",
): NormalizedValidationError[] {
    const errors: NormalizedValidationError[] = [];
    const groups = payload.groups ?? {};

    for (const field of schema.fields) {
        if (field.type !== "group" || !groupFieldHasCollectionBinding(field)) continue;
        const binding = field.collection_binding!;
        const rows = groups[field.id] ?? [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            const basePath = ["groups", field.id, String(i)];

            if (row.collection) {
                const meta = row.collection;
                if (meta.provider_ref !== binding.collection_provider_ref) {
                    errors.push(err([...basePath, "collection", "provider_ref"], "Collection provider does not match schema binding."));
                }
                if (meta.iteration_entity_type !== binding.iteration_entity_type) {
                    errors.push(err([...basePath, "collection", "iteration_entity_type"], "Iteration entity does not match schema binding."));
                }
                if (meta.origin === "existing" && !meta.item_id?.trim()) {
                    errors.push(err([...basePath, "collection", "item_id"], "Existing collection item requires item_id."));
                }
                if (meta.origin === "respondent_added" && meta.item_id?.trim() && mode === "submit") {
                    errors.push(err([...basePath, "collection", "item_id"], "Respondent-added instance must not declare an existing item_id."));
                }
            }

            if (mode === "submit") {
                for (const nested of field.fields) {
                    if (nested.type === "group") continue;
                    const val = row.values[nested.id];
                    if (val === undefined || val === null || val === "") continue;
                    const availability = nestedFieldAvailabilityForBinding(nested, binding);
                    if (!availability.available) {
                        errors.push(
                            err(
                                [...basePath, "values", nested.id],
                                availability.message ?? "Nested field is not valid for collection iteration context.",
                            ),
                        );
                    }
                }
            }
        }

        const seenItemIds = new Set<string>();
        for (let i = 0; i < rows.length; i++) {
            const itemId = rows[i]?.collection?.item_id?.trim();
            if (!itemId) continue;
            if (seenItemIds.has(itemId)) {
                errors.push(err(["groups", field.id], `Duplicate collection item_id "${itemId}".`));
            }
            seenItemIds.add(itemId);
        }
    }

    return errors;
}

/** Async validation: existing item_id belongs to org + household scope. */
export async function validateCollectionPayloadOrgSecurity(
    supabase: SupabaseClient,
    orgId: string,
    schema: FormSchemaV1,
    payload: FormPayload,
    launchFks: { customer_id?: string | null },
): Promise<NormalizedValidationError[]> {
    const errors: NormalizedValidationError[] = [];
    const customerId = launchFks.customer_id?.trim() ?? null;
    const groups = payload.groups ?? {};

    for (const field of schema.fields) {
        if (field.type !== "group" || !groupFieldHasCollectionBinding(field)) continue;
        const binding = field.collection_binding!;
        const provider = findFormsCollectionBindingProvider(binding.collection_provider_ref);
        if (!provider || !collectionBindingAuthoringEnabledForRef(binding.collection_provider_ref)) continue;

        const rows = groups[field.id] ?? [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            const itemId = row.collection?.item_id?.trim();
            if (!itemId || row.collection?.origin !== "existing") continue;

            const basePath = ["groups", field.id, String(i), "collection", "item_id"];

            if (binding.iteration_entity_type === "customer_member") {
                const { data } = await supabase
                    .from("customer_members")
                    .select("id, customer_id")
                    .eq("org_id", orgId)
                    .eq("id", itemId)
                    .maybeSingle();
                if (!data) {
                    errors.push(err(basePath, "Collection item is not valid for this organization."));
                    continue;
                }
                if (customerId && (data as { customer_id?: string }).customer_id !== customerId) {
                    errors.push(err(basePath, "Collection item does not belong to this household."));
                }
            } else if (binding.iteration_entity_type === "person") {
                const { data } = await supabase
                    .from("persons")
                    .select("id")
                    .eq("org_id", orgId)
                    .eq("id", itemId)
                    .maybeSingle();
                if (!data) {
                    errors.push(err(basePath, "Collection item is not valid for this organization."));
                }
            }
        }
    }

    return errors;
}

/** Extract collection envelope for Processing preservation (P5 bridge). */
export function extractCollectionSubmissionEnvelope(payload: FormPayload): Record<string, unknown> {
    const envelope: Record<string, unknown> = {};
    const groups = payload.groups ?? {};
    for (const [groupId, rows] of Object.entries(groups)) {
        const collectionRows = rows
            .filter((r) => r.collection)
            .map((r) => ({
                instance_key: r.instance_key,
                origin: r.collection!.origin,
                provider_ref: r.collection!.provider_ref,
                item_id: r.collection!.item_id ?? null,
                iteration_entity_type: r.collection!.iteration_entity_type,
                values: r.values,
            }));
        if (collectionRows.length > 0) envelope[groupId] = collectionRows;
    }
    return envelope;
}
