import type { SupabaseClient } from "@supabase/supabase-js";
import {
    EMPTY_PUBLIC_BRAND,
    FORM_BRAND_SNAPSHOT_KEY,
    formBrandLayer,
    readPublicBrandValues,
    resolveEffectivePublicBrand,
    type EffectivePublicBrand,
    type PublicBrandValues,
} from "@/lib/branding/publicBrand";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The organization and location brand layers. Server-only reads, ALWAYS filtered by the org the
 * caller already proved (a link's org, an admin's org): a location id from another tenant resolves
 * to nothing, so no tenant's name, colour or logo can appear on another tenant's page.
 */
export async function loadPublicBrandLayers(
    supabase: SupabaseClient,
    params: { orgId: string; locationId?: string | null }
): Promise<{ organization: PublicBrandValues; location: PublicBrandValues | null }> {
    const { data: org } = await supabase.from("org_settings").select("metadata").eq("org_id", params.orgId).maybeSingle();
    const organization = readPublicBrandValues((org as { metadata?: unknown } | null)?.metadata);
    const locationId = params.locationId && UUID_RE.test(params.locationId) ? params.locationId : null;
    if (!locationId) return { organization, location: null };
    const { data: loc } = await supabase
        .from("locations")
        .select("metadata")
        .eq("id", locationId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    return { organization, location: loc ? readPublicBrandValues((loc as { metadata?: unknown }).metadata) : { ...EMPTY_PUBLIC_BRAND } };
}

/** The effective brand for a tour page (or any location-scoped public surface without a form layer). */
export async function resolveLocationPublicBrand(
    supabase: SupabaseClient,
    params: { orgId: string; locationId?: string | null }
): Promise<EffectivePublicBrand> {
    const layers = await loadPublicBrandLayers(supabase, params);
    return resolveEffectivePublicBrand(layers);
}

/**
 * The form layer of a published form version — the one owner of "what did this form's publish freeze".
 *
 * The form layer comes from the version's publish-time snapshot (`metadata.brand_snapshot_v1`), so a
 * draft edit to the form's branding cannot restyle what families already see — only republishing
 * does. A version published before snapshots existed has none; it falls back to the form's live
 * metadata, which is how it rendered before (backward compatible, and closed by its next publish).
 */
export async function loadPublishedFormBrandLayer(
    supabase: SupabaseClient,
    params: { orgId: string; formDefinitionVersionId: string; formMetadata: unknown }
): Promise<{ form: PublicBrandValues | null; formLayerSource: "published_snapshot" | "live_definition" }> {
    const { data: version } = await supabase
        .from("form_definition_versions")
        .select("metadata")
        .eq("id", params.formDefinitionVersionId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    const versionMeta = (version as { metadata?: Record<string, unknown> } | null)?.metadata ?? null;
    const snapshot = versionMeta?.[FORM_BRAND_SNAPSHOT_KEY];
    const hasSnapshot = snapshot != null && typeof snapshot === "object" && !Array.isArray(snapshot);
    return {
        form: formBrandLayer(hasSnapshot ? snapshot : params.formMetadata),
        formLayerSource: hasSnapshot ? "published_snapshot" : "live_definition",
    };
}

/** The effective brand for a published form version: form override → location → organization → platform. */
export async function resolvePublicFormBrand(
    supabase: SupabaseClient,
    params: { orgId: string; formDefinitionVersionId: string; formMetadata: unknown; locationId?: string | null }
): Promise<EffectivePublicBrand & { formLayerSource: "published_snapshot" | "live_definition" }> {
    const { form, formLayerSource } = await loadPublishedFormBrandLayer(supabase, params);
    const layers = await loadPublicBrandLayers(supabase, { orgId: params.orgId, locationId: params.locationId });
    return { ...resolveEffectivePublicBrand({ form, ...layers }), formLayerSource };
}

/** A public form link's location (location-scoped share links carry it). */
export function publicFormLinkLocationId(linkMetadata: unknown): string | null {
    if (linkMetadata == null || typeof linkMetadata !== "object" || Array.isArray(linkMetadata)) return null;
    const raw = (linkMetadata as Record<string, unknown>).default_location_id;
    return typeof raw === "string" && UUID_RE.test(raw.trim()) ? raw.trim() : null;
}
