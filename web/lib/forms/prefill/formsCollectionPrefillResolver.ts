/**
 * Forms / Documents adapter — canonical collection resolver → repeatable group prefill rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import {
    collectionContextIsValid,
    groupFieldHasCollectionBinding,
    iterationContextFromCollectionBinding,
} from "@/lib/fields/formsCollectionRepeatBinding";
import {
    evaluateFormFieldAvailabilityForIteration,
} from "@/lib/forms/collection/formsProviderAvailability";
import {
    resolveCanonicalCollection,
    verifyCollectionOrgBoundary,
} from "@/lib/fields/relationship/canonicalCollectionResolver";
import { isResolvedCollection } from "@/lib/fields/relationship/canonicalCollectionResolution";
import { resolveRelationshipLeafFromPersonRow } from "@/lib/fields/relationship/resolveRelationshipLeafValue";
import { FORMS_LEGACY_ROLE_BY_COLLECTION_PROVIDER_REF } from "@/lib/fields/formsLegacyContactRoleCompatibility";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { normalizeFormDateInput } from "@/lib/forms/prefill/resolveFormPrefillValues";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";

export type FormsCollectionPrefillResult = {
    groups: Record<string, FormPayloadGroupRow[]>;
    states: Record<string, FormsCollectionGroupPrefillState>;
};

export type FormsCollectionGroupPrefillState =
    | { kind: "resolved"; item_count: number }
    | { kind: "empty"; label: string }
    | { kind: "unavailable"; label: string }
    | { kind: "unsupported"; label: string }
    | { kind: "invalid_context"; label: string };

function stableInstanceKey(providerRef: string, itemId: string): string {
    return `col:${providerRef}:${itemId}`;
}

function memberFieldValue(record: Record<string, unknown>, fieldKey: string): string | null {
    const key = fieldKey.trim().toLowerCase();
    if (key === "child_first_name" || key === "first_name") {
        return String(record.first_name ?? record.display_name ?? "").trim() || null;
    }
    if (key === "child_last_name" || key === "last_name") {
        return String(record.last_name ?? "").trim() || null;
    }
    if (key === "child_dob" || key === "date_of_birth") {
        const raw = record.date_of_birth;
        return raw != null ? normalizeFormDateInput(raw) ?? null : null;
    }
    if (key === "preferred_language" || key === "language") {
        return String(record.preferred_language ?? "").trim() || null;
    }
    return null;
}

function nestedScalarPrefillValue(
    field: FormField,
    itemRecord: Record<string, unknown>,
    binding: NonNullable<FormField & { type: "group" }>["collection_binding"],
): string | number | boolean | undefined {
    if (field.type === "group" || !binding) return undefined;

    const availability = evaluateFormFieldAvailabilityForIteration(
        field,
        iterationContextFromCollectionBinding(binding),
    );
    if (!availability.available) return undefined;

    const source = field.field_source;
    if (!source) return undefined;

    const iterationEntity = binding.iteration_entity_type;

    if (iterationEntity === "customer_member") {
        const v = memberFieldValue(itemRecord, source.field_key ?? "");
        if (v == null) return undefined;
        if (field.type === "date") return normalizeFormDateInput(v);
        if (field.type === "number") {
            const n = Number(v);
            return Number.isFinite(n) ? n : undefined;
        }
        return v;
    }

    if (iterationEntity === "person") {
        // Role comes from the bound collection, never a hardcoded "parents": emergency contacts and
        // authorized pickups are person-grain collections too, and would otherwise prefill through
        // the guardian manifest. Unmapped collections resolve generically, which is correct.
        const raw = resolveRelationshipLeafFromPersonRow(itemRecord, {
            role: FORMS_LEGACY_ROLE_BY_COLLECTION_PROVIDER_REF[binding.collection_provider_ref],
            leafKey: source.field_key?.includes("email") ? "email" : source.field_key?.includes("phone") ? "phone" : "name",
            leafProviderRefKey: source.relationship?.leaf_provider_ref_key,
        });
        if (!raw) return undefined;
        return raw;
    }

    return undefined;
}

function collectCollectionBoundGroups(schema: FormSchemaV1): Array<
    FormField & { type: "group"; collection_binding: NonNullable<FormField & { type: "group" }>["collection_binding"] }
> {
    const out: Array<FormField & { type: "group" }> = [];
    const walk = (fields: FormField[]) => {
        for (const f of fields) {
            if (f.type === "group") {
                if (groupFieldHasCollectionBinding(f)) out.push(f);
                walk(f.fields);
            }
        }
    };
    walk(schema.fields);
    return out as Array<
        FormField & { type: "group"; collection_binding: NonNullable<FormField & { type: "group" }>["collection_binding"] }
    >;
}

export async function resolveFormsCollectionPrefillGroups(
    supabase: SupabaseClient,
    orgId: string,
    schema: FormSchemaV1,
    launchFks: LaunchFkStamp,
): Promise<FormsCollectionPrefillResult> {
    const groups: Record<string, FormPayloadGroupRow[]> = {};
    const states: Record<string, FormsCollectionGroupPrefillState> = {};
    const boundGroups = collectCollectionBoundGroups(schema);
    if (boundGroups.length === 0) return { groups, states };

    for (const groupField of boundGroups) {
        const binding = groupField.collection_binding!;
        const providerRef = binding.collection_provider_ref.trim();

        if (!collectionContextIsValid(providerRef, launchFks)) {
            states[groupField.id] = {
                kind: "invalid_context",
                label: "Form launch context does not provide required collection root.",
            };
            continue;
        }

        const resolution = await resolveCanonicalCollection(supabase, {
            orgId,
            collectionProviderRef: providerRef,
            customerId: launchFks.customer_id ?? null,
            opportunityId: launchFks.opportunity_id,
            customerMemberId: launchFks.customer_member_id,
        });

        if (resolution.status === "empty") {
            states[groupField.id] = { kind: "empty", label: "No existing collection items" };
            continue;
        }
        if (!isResolvedCollection(resolution)) {
            states[groupField.id] = {
                kind: resolution.status,
                label: resolution.reason ?? resolution.status,
            };
            continue;
        }

        const orgOk = await verifyCollectionOrgBoundary(supabase, orgId, resolution);
        if (!orgOk) {
            states[groupField.id] = {
                kind: "invalid_context",
                label: "Collection items are outside organization boundary.",
            };
            continue;
        }

        const nestedScalars: FormField[] = [];
        walkScalarFormFields({ ...schema, fields: groupField.fields }, (f) => nestedScalars.push(f));

        const rows: FormPayloadGroupRow[] = [];
        for (const item of resolution.items) {
            const values: Record<string, unknown> = {};
            for (const nested of nestedScalars) {
                const v = nestedScalarPrefillValue(nested, item.record, binding);
                if (v !== undefined) values[nested.id] = v;
            }
            rows.push({
                instance_key: stableInstanceKey(providerRef, item.item_id),
                values,
                collection: {
                    provider_ref: providerRef,
                    item_id: item.item_id,
                    origin: "existing",
                    iteration_entity_type: binding.iteration_entity_type,
                },
            });
        }

        groups[groupField.id] = rows;
        states[groupField.id] = { kind: "resolved", item_count: rows.length };
    }

    return { groups, states };
}
