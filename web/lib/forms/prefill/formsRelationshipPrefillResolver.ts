/**
 * Forms / Documents adapter — canonical relationship resolver → prefill values.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import { formFieldSourceHasRelationshipLineage } from "@/lib/fields/formsRelationshipFieldSourceBinding";
import { formsRelationshipRoleFromSource } from "@/lib/fields/formsLegacyContactRoleCompatibility";
import { formsRelationshipContextFromLaunch } from "@/lib/fields/relationship/canonicalRelationshipContext";
import {
    loadRelationshipResolutionDataBag,
    resolveCanonicalRelationship,
    resolveCanonicalRelationshipFromDataBag,
    verifyResolvedPersonOrgBoundary,
} from "@/lib/fields/relationship/canonicalRelationshipResolver";
import { isResolvedRelationship } from "@/lib/fields/relationship/canonicalRelationshipResolution";
import {
    resolveRelationshipLeafFromContactRow,
    resolveRelationshipLeafFromPersonRow,
} from "@/lib/fields/relationship/resolveRelationshipLeafValue";
import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import { normalizeFormDateInput } from "@/lib/forms/prefill/resolveFormPrefillValues";
import {
    formsRelationshipPrefillStateFromResolution,
    type FormsRelationshipPrefillState,
} from "@/lib/forms/prefill/formsRelationshipPrefillState";

export type FormsRelationshipPrefillResult = {
    values: Record<string, string | number | boolean>;
    states: Record<string, FormsRelationshipPrefillState>;
};

function trim(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function collectRelationshipFields(schema: FormSchemaV1): FormField[] {
    const fields: FormField[] = [];
    walkScalarFormFields(schema, (field) => {
        if (field.field_source && formFieldSourceHasRelationshipLineage(field.field_source)) {
            fields.push(field);
        }
    });
    return fields;
}

export async function resolveFormsRelationshipPrefillValues(
    supabase: SupabaseClient,
    orgId: string,
    schema: FormSchemaV1,
    launchFks: LaunchFkStamp,
): Promise<FormsRelationshipPrefillResult> {
    const values: Record<string, string | number | boolean> = {};
    const states: Record<string, FormsRelationshipPrefillState> = {};
    const fields = collectRelationshipFields(schema);
    if (fields.length === 0) return { values, states };

    const customerId = launchFks.customer_id ?? null;
    let sharedDataBag: Awaited<ReturnType<typeof loadRelationshipResolutionDataBag>> | null = null;

    for (const field of fields) {
        const rel = field.field_source!.relationship!;
        const relationshipId = rel.relationship_id?.trim();
        if (!relationshipId) continue;

        const role = formsRelationshipRoleFromSource(rel, rel.provider_ref_key) as FormsRelationshipRoleKey | null;
        if (!role) continue;

        const context = formsRelationshipContextFromLaunch({
            orgId,
            relationshipId,
            customerId,
            opportunityId: launchFks.opportunity_id,
            customerMemberId: launchFks.customer_member_id,
        });

        if (!context) {
            states[field.id] = formsRelationshipPrefillStateFromResolution({
                status: "invalid_context",
                role,
                reason: "Form launch context does not provide a relationship root.",
            });
            continue;
        }

        if (!sharedDataBag) {
            sharedDataBag = await loadRelationshipResolutionDataBag(
                supabase,
                orgId,
                context,
                customerId,
            );
        }

        const resolution = resolveCanonicalRelationshipFromDataBag(context, sharedDataBag, customerId);

        if (!isResolvedRelationship(resolution)) {
            states[field.id] = formsRelationshipPrefillStateFromResolution({
                status: resolution.status,
                role,
                reason: resolution.reason,
            });
            continue;
        }

        const orgOk = await verifyResolvedPersonOrgBoundary(supabase, orgId, resolution.target_record_id);
        if (!orgOk) {
            states[field.id] = formsRelationshipPrefillStateFromResolution({
                status: "invalid_context",
                role,
                reason: "Resolved contact is outside organization boundary.",
            });
            continue;
        }

        let rawValue: string | null = null;
        if (role === "primary" && sharedDataBag.contactRow) {
            rawValue = resolveRelationshipLeafFromContactRow(sharedDataBag.contactRow, rel.leaf_key ?? "email");
        }

        if (!rawValue) {
            const { data: personRow } = await supabase
                .from("persons")
                .select("id, first_name, last_name, full_name, display_name, email, phone")
                .eq("org_id", orgId)
                .eq("id", resolution.target_record_id)
                .maybeSingle();
            rawValue = resolveRelationshipLeafFromPersonRow(
                (personRow as Record<string, unknown>) ?? null,
                {
                    role,
                    leafKey: rel.leaf_key ?? "value",
                    leafProviderRefKey: rel.leaf_provider_ref_key,
                },
            );
        }

        const state = formsRelationshipPrefillStateFromResolution({
            status: "resolved",
            role,
            value: rawValue,
            diagnostics: resolution.diagnostics,
        });
        states[field.id] = state;

        if (state.kind !== "resolved") continue;

        if (field.type === "date") {
            const d = normalizeFormDateInput(state.value);
            if (d !== undefined) values[field.id] = d;
            continue;
        }
        if (field.type === "number") {
            const n = Number(state.value);
            if (Number.isFinite(n)) values[field.id] = n;
            continue;
        }
        values[field.id] = state.value;
    }

    return { values, states };
}

/** Whether canonical resolver should handle this field instead of legacy contact.* map. */
export function fieldUsesCanonicalRelationshipPrefill(field: FormField): boolean {
    return Boolean(field.field_source && formFieldSourceHasRelationshipLineage(field.field_source));
}
