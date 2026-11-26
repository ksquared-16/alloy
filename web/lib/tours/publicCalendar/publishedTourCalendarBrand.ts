import type { SupabaseClient } from "@supabase/supabase-js";

import { SHARE_EMBED_PATH_META_KEY } from "@/lib/admin/forms/distributionLinkReuse";
import { loadPublishedFormBrandLayer, publicFormLinkLocationId } from "@/lib/branding/loadPublicBrand";
import type { PublicBrandValues } from "@/lib/branding/publicBrand";
import { resolvePublicFormEmbedContext } from "@/lib/public/forms/resolvePublicFormEmbedContext";
import { readTourCalendarLinkConfig } from "@/lib/tours/publicCalendar/tourCalendarLinkConfig";

/**
 * The published form a location's tour calendar opens into, and that form's brand layer (P1-close, D1).
 *
 * The public tour page paints its header from the form → location → organization → platform brand of
 * the link it was opened through. Booking experience used to resolve only location → organization, so
 * "Shown to families" was wrong whenever the published form set its own name, colour or logo. This
 * reads the SAME link the family's page reads, through the SAME resolver (`resolvePublicFormEmbedContext`
 * picks the version — pinned or latest published — and `loadPublishedFormBrandLayer` reads its
 * publish-time snapshot), so the settings screen and the public page cannot disagree about precedence.
 *
 * Read-only. Server-only: the token is recovered from the link's stored share path and never leaves.
 */
export type PublishedTourCalendarForm = {
    linkId: string;
    formId: string;
    formTitle: string;
    /** What the published form itself sets; null fields inherit from the location / organization. */
    formLayer: PublicBrandValues | null;
    formLayerSource: "published_snapshot" | "live_definition";
};

type LinkRow = {
    id: string;
    form_definition_id: string;
    is_active: boolean;
    expires_at: string | null;
    metadata: Record<string, unknown> | null;
};

/** The usable link carrying this location's published calendar (newest first), or null. */
export function pickPublishedTourCalendarLink(rows: LinkRow[], locationId: string, now: Date = new Date()): LinkRow | null {
    for (const row of rows) {
        const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
        if (publicFormLinkLocationId(metadata) !== locationId) continue;
        if (!row.is_active) continue;
        if (row.expires_at != null && Date.parse(row.expires_at) <= now.getTime()) continue;
        if (!readTourCalendarLinkConfig(metadata).enabled) continue;
        return row;
    }
    return null;
}

/** `/forms/embed/<token>` → `<token>`. */
export function tokenFromShareEmbedPath(path: unknown): string | null {
    const m = typeof path === "string" ? /^\/forms\/embed\/([^/?#]+)/.exec(path.trim()) : null;
    return m ? decodeURIComponent(m[1]!) : null;
}

export async function loadPublishedTourCalendarForm(
    supabase: SupabaseClient,
    params: { orgId: string; locationId: string }
): Promise<PublishedTourCalendarForm | null> {
    const { data: rows } = await supabase
        .from("form_public_links")
        .select("id, form_definition_id, is_active, expires_at, metadata")
        .eq("org_id", params.orgId)
        .eq("metadata->>default_location_id", params.locationId)
        .order("created_at", { ascending: false });
    const link = pickPublishedTourCalendarLink((rows ?? []) as LinkRow[], params.locationId);
    if (!link) return null;
    const token = tokenFromShareEmbedPath(link.metadata?.[SHARE_EMBED_PATH_META_KEY]);
    if (!token) return null;
    const resolved = await resolvePublicFormEmbedContext(supabase, token);
    if (!resolved.ok || resolved.value.orgId !== params.orgId) return null;
    const { form, formLayerSource } = await loadPublishedFormBrandLayer(supabase, {
        orgId: params.orgId,
        formDefinitionVersionId: resolved.value.formDefinitionVersionId,
        formMetadata: resolved.value.formMetadata,
    });
    return {
        linkId: link.id,
        formId: link.form_definition_id,
        formTitle: resolved.value.formName || "Untitled form",
        formLayer: form,
        formLayerSource,
    };
}
