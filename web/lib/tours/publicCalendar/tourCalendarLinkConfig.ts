/**
 * PUBLIC TOUR CALENDAR — which credential publishes it (S7).
 *
 * A school's public tour calendar is not a new credential. It is a property of a
 * location-specific Processing intake link (`form_public_links`): the same token that
 * opens the lead form opens the calendar in front of it. That one row already carries
 * everything the public journey needs to be safe —
 *
 *   - the tenant (`org_id`), so no request body can name an organization;
 *   - the location (`metadata.default_location_id`), so no request body can name a site;
 *   - activation and expiry (`is_active`, `expires_at`), so a school can withdraw it;
 *   - the embed allowlist (`allowed_embed_origins`), so a school can restrict which of its
 *     websites may frame it;
 *   - the published form, which is step two.
 *
 * The flag lives under one metadata key and is SERVER-CONTROLLED: the link routes strip
 * it from client metadata and set it only through the explicit `tour_calendar` field,
 * which requires `tours.configure`. Forms authority alone can never publish a location's
 * tour availability.
 */

import { findMarketingConsentField } from "@/lib/communications/preferences/intakeMarketingConsentRecord";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";

export const TOUR_CALENDAR_LINK_METADATA_KEY = "tour_calendar_v1" as const;

export type TourCalendarLinkConfig = {
    enabled: boolean;
    enabledAt: string | null;
    enabledByUserId: string | null;
};

export function readTourCalendarLinkConfig(linkMetadata: unknown): TourCalendarLinkConfig {
    const none: TourCalendarLinkConfig = { enabled: false, enabledAt: null, enabledByUserId: null };
    if (!linkMetadata || typeof linkMetadata !== "object" || Array.isArray(linkMetadata)) return none;
    const raw = (linkMetadata as Record<string, unknown>)[TOUR_CALENDAR_LINK_METADATA_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return none;
    const r = raw as Record<string, unknown>;
    return {
        enabled: r.enabled === true,
        enabledAt: typeof r.enabled_at === "string" ? r.enabled_at : null,
        enabledByUserId: typeof r.enabled_by_user_id === "string" ? r.enabled_by_user_id : null,
    };
}

/**
 * Whether this link's form offers the optional marketing-consent control (S7 × C1). Decided by the
 * server from the link and the PUBLISHED schema — never by the browser. Only a lead-capture
 * Processing intake link qualifies (anything else opens no case to hold the evidence), and then
 * either because its tour calendar is published or because the form's author placed a Marketing
 * consent question on it. The submit route refuses a consent answer from any other link.
 */
export function publicLinkOffersMarketingConsent(
    linkMetadata: unknown,
    opts: { packet: boolean; schema?: unknown },
): boolean {
    if (opts.packet) return false;
    if (!linkMetadata || typeof linkMetadata !== "object" || Array.isArray(linkMetadata)) return false;
    if (!linkRequiresLeadCapture(linkMetadata as Record<string, unknown>)) return false;
    return readTourCalendarLinkConfig(linkMetadata).enabled || schemaHasMarketingConsentField(opts.schema);
}

function schemaHasMarketingConsentField(schema: unknown): boolean {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
    return findMarketingConsentField(schema as { fields?: [] }) !== null;
}

/** Client metadata can never carry the flag — only the explicit, authorized field sets it. */
export function stripTourCalendarLinkConfig<T extends Record<string, unknown> | null | undefined>(metadata: T): T {
    if (!metadata || typeof metadata !== "object" || !(TOUR_CALENDAR_LINK_METADATA_KEY in metadata)) return metadata;
    const next: Record<string, unknown> = { ...metadata };
    delete next[TOUR_CALENDAR_LINK_METADATA_KEY];
    return next as T;
}

export function buildTourCalendarLinkConfig(input: { enabled: boolean; actorUserId: string | null; at?: Date }): Record<string, unknown> {
    return {
        enabled: input.enabled,
        enabled_at: input.enabled ? (input.at ?? new Date()).toISOString() : null,
        enabled_by_user_id: input.enabled ? input.actorUserId : null,
    };
}

/** The hosted calendar path for a link token. Step two is the same token's form. */
export function buildPublicTourCalendarPath(plaintextToken: string): string {
    return `/tours/${encodeURIComponent(plaintextToken)}`;
}

/** `/forms/embed/<token>` → `/tours/<token>` (the share path is persisted on the link). */
export function tourCalendarPathFromEmbedPath(embedPath: string | null | undefined): string | null {
    const m = typeof embedPath === "string" ? /^\/forms\/embed\/([^/?#]+)/.exec(embedPath.trim()) : null;
    return m ? `/tours/${m[1]}` : null;
}
