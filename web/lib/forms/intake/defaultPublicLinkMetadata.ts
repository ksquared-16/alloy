import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";

/**
 * Server-side defaults merged into `form_public_links.metadata` on POST create.
 * Client `metadata` overrides these keys when both set (spread order: defaults, then client).
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

export async function mergePublicLinkMetadataForCreate(
    supabase: SupabaseClient,
    formKey: string,
    clientMetadata: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const defaults = await intakeDefaultsForFormPublicLink(supabase, formKey);
    return { ...defaults, ...clientMetadata };
}
