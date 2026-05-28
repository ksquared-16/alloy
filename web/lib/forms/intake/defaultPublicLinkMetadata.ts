import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";
import {
    buildOperationalIntentLinkMetadataPatch,
    readStoredOperationalIntent,
} from "@/lib/forms/operationalIntentTemplates";
import {
    mergeRoutingDefaultsIntoMetadata,
    resolveOrgIntakeRoutingDefaults,
} from "@/lib/forms/intake/resolveOrgIntakeRoutingDefaults";

export type MergePublicLinkMetadataParams = {
    orgId: string;
    formKey: string;
    formMetadata?: Record<string, unknown> | null;
    clientMetadata: Record<string, unknown>;
};

/**
 * Server-side defaults merged into `form_public_links.metadata` on POST create.
 * Spread order: form-key demo defaults → stored operational intent → org routing → client overrides.
 */
export async function intakeDefaultsForFormPublicLink(
    supabase: SupabaseClient,
    formKey: string
): Promise<Record<string, unknown>> {
    if (formKey !== MEDICATION_AUTHORIZATION_DEMO_FORM_KEY) {
        return {};
    }

    const { data: verticalRow } = await supabase
        .from("verticals")
        .select("id")
        .eq("slug", "cleaning")
        .eq("is_active", true)
        .maybeSingle();

    if (!verticalRow?.id || typeof verticalRow.id !== "string") {
        return {};
    }

    return {
        lead_capture: true,
        default_vertical_id: verticalRow.id,
        auto_create_person: true,
        auto_create_customer: true,
        auto_create_customer_member: true,
        auto_create_opportunity: true,
    };
}

/** Apply stored form intent + org routing onto link metadata (create or PATCH). */
export async function applyOperationalIntentToLinkMetadata(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        formMetadata: Record<string, unknown> | null | undefined;
        linkMetadata: Record<string, unknown>;
    }
): Promise<Record<string, unknown>> {
    const storedIntent = readStoredOperationalIntent(params.formMetadata);
    if (!storedIntent || storedIntent === "custom") {
        return params.linkMetadata;
    }

    const intentPatch = buildOperationalIntentLinkMetadataPatch(storedIntent);
    const routing = await resolveOrgIntakeRoutingDefaults(supabase, params.orgId, storedIntent);
    const merged = { ...params.linkMetadata, ...intentPatch };
    return mergeRoutingDefaultsIntoMetadata(merged, routing);
}

export async function mergePublicLinkMetadataForCreate(
    supabase: SupabaseClient,
    params: MergePublicLinkMetadataParams
): Promise<Record<string, unknown>> {
    const formDefaults = await intakeDefaultsForFormPublicLink(supabase, params.formKey);
    const withIntent = await applyOperationalIntentToLinkMetadata(supabase, {
        orgId: params.orgId,
        formMetadata: params.formMetadata,
        linkMetadata: formDefaults,
    });
    return { ...withIntent, ...params.clientMetadata };
}
