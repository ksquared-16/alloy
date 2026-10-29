/**
 * Preview & Share for a location's public tour calendar (P1-A).
 *
 * The calendar is published on a location-specific Processing intake link (`tourCalendarLinkConfig`);
 * this turns those link rows into what an operator needs to put it on the school's website — the
 * hosted address, an iframe, and a button — without ever handling a token. The plaintext token is
 * already persisted on the link as its share path (`share_embed_path`), which is exactly what a staff
 * member copies from Forms; nothing here mints, rotates or reveals anything new.
 *
 * Pure. The route owns I/O.
 */

import { SHARE_EMBED_PATH_META_KEY } from "@/lib/admin/forms/distributionLinkReuse";
import { publicFormLinkLocationId } from "@/lib/branding/loadPublicBrand";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import { readTourCalendarLinkConfig, tourCalendarPathFromEmbedPath } from "./tourCalendarLinkConfig";

/** The iframe height that shows a month and a day's times without an inner scrollbar on a laptop. */
export const TOUR_CALENDAR_IFRAME_MIN_HEIGHT_PX = 900;

export type TourCalendarShareLinkRow = {
    id: string;
    form_definition_id: string;
    is_active: boolean;
    expires_at: string | null;
    allowed_embed_origins: string[] | null;
    metadata: Record<string, unknown> | null;
    created_at?: string | null;
};

export type TourCalendarShareLink = {
    linkId: string;
    formId: string;
    formTitle: string;
    linkLabel: string | null;
    /** Withdrawn or expired links cannot serve a calendar, published or not. */
    usable: boolean;
    unusableReason: "inactive" | "expired" | null;
    /** Lead-capture intake links are the only ones that can carry a calendar (server-enforced). */
    leadCapture: boolean;
    calendarPublished: boolean;
    calendarPublishedAt: string | null;
    /** `/tours/<token>`, or null when the link has no recoverable share path. */
    calendarPath: string | null;
    /** Absolute hosted URL, or null when the environment has no public origin configured. */
    calendarUrl: string | null;
    allowedEmbedOrigins: string[];
    /** When the link was created — what tells two links of one form apart. */
    createdAt: string | null;
};

/** A location's intake links, as share rows. Links for other locations are never returned. */
export function projectTourCalendarShareLinks(
    rows: TourCalendarShareLinkRow[],
    opts: { locationId: string; baseUrl: string; formTitles: Record<string, string>; now?: Date }
): TourCalendarShareLink[] {
    const now = (opts.now ?? new Date()).getTime();
    const out: TourCalendarShareLink[] = [];
    for (const row of rows) {
        const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
        if (publicFormLinkLocationId(metadata) !== opts.locationId) continue;
        const expired = row.expires_at != null && Date.parse(row.expires_at) <= now;
        const calendar = readTourCalendarLinkConfig(metadata);
        const sharePath = typeof metadata[SHARE_EMBED_PATH_META_KEY] === "string" ? (metadata[SHARE_EMBED_PATH_META_KEY] as string) : null;
        const calendarPath = tourCalendarPathFromEmbedPath(sharePath);
        const label = typeof metadata.label === "string" && metadata.label.trim() ? metadata.label.trim() : null;
        out.push({
            linkId: row.id,
            formId: row.form_definition_id,
            formTitle: opts.formTitles[row.form_definition_id] ?? "Untitled form",
            linkLabel: label,
            usable: row.is_active && !expired,
            unusableReason: !row.is_active ? "inactive" : expired ? "expired" : null,
            leadCapture: linkRequiresLeadCapture(metadata),
            calendarPublished: calendar.enabled,
            calendarPublishedAt: calendar.enabledAt,
            calendarPath,
            calendarUrl: calendarPath && opts.baseUrl ? `${opts.baseUrl.replace(/\/+$/, "")}${calendarPath}` : null,
            allowedEmbedOrigins: Array.isArray(row.allowed_embed_origins) ? row.allowed_embed_origins.filter(Boolean) : [],
            createdAt: typeof row.created_at === "string" ? row.created_at : null,
        });
    }
    // Published first, then usable lead-capture links, then the rest.
    const rank = (l: TourCalendarShareLink) => (l.calendarPublished && l.usable ? 0 : l.usable && l.leadCapture ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || a.formTitle.localeCompare(b.formTitle));
}

/** One form a location's tour calendar can open into, and the link that attaching it publishes on. */
export type TourCalendarAttachableForm = {
    formId: string;
    formTitle: string;
    /** The newest usable lead-capture link for this form at this location. */
    link: TourCalendarShareLink;
    /** Further usable links for the same form here — the same form, so they are not offered separately. */
    otherLinks: TourCalendarShareLink[];
};

export type TourCalendarAttachOptions = {
    attachable: TourCalendarAttachableForm[];
    /** Links that cannot carry a calendar (turned off, expired, not lead-capture), for the explanation. */
    blocked: TourCalendarShareLink[];
};

/**
 * "Attach a form" (Tours feedback 2026-10-29): the operator chooses WHICH FORM follows the tour, not
 * which of its links — a location often holds several links for one form, and as rows they were
 * indistinguishable. Attaching is still publishing the calendar on one existing link (the guarded
 * link PATCH); this only decides which link that is. Links already carrying the calendar are excluded.
 */
export function tourCalendarAttachOptions(links: TourCalendarShareLink[]): TourCalendarAttachOptions {
    const byForm = new Map<string, TourCalendarShareLink[]>();
    const blocked: TourCalendarShareLink[] = [];
    for (const link of links) {
        if (link.calendarPublished && link.usable) continue;
        if (!link.usable || !link.leadCapture) {
            blocked.push(link);
            continue;
        }
        byForm.set(link.formId, [...(byForm.get(link.formId) ?? []), link]);
    }
    const newestFirst = (a: TourCalendarShareLink, b: TourCalendarShareLink) =>
        (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0);
    const attachable = [...byForm.values()].map((group) => {
        const [link, ...otherLinks] = [...group].sort(newestFirst);
        return { formId: link!.formId, formTitle: link!.formTitle, link: link!, otherLinks };
    });
    attachable.sort((a, b) => a.formTitle.localeCompare(b.formTitle));
    return { attachable, blocked };
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The whole two-step journey (calendar, then the school's form) in one frame on the school's site.
 * Step two opens inside the same frame — the family never leaves the school's page.
 */
export function buildTourCalendarIframeSnippet(input: { url: string; title: string }): string {
    return `<iframe src="${escapeAttr(input.url)}" title="${escapeAttr(input.title)}" style="width:100%;max-width:760px;min-height:${TOUR_CALENDAR_IFRAME_MIN_HEIGHT_PX}px;border:0;" loading="lazy"></iframe>`;
}

/**
 * A button for the school's site that opens the hosted calendar in a new tab — painted with the
 * effective brand pair (`brandButtonColors`), so it holds 4.5:1 like the calendar's own buttons.
 */
export function buildTourCtaButtonSnippet(input: { url: string; label: string; fill: string; ink: string }): string {
    const style = [
        "display:inline-block",
        `background:${input.fill}`,
        `color:${input.ink}`,
        "padding:12px 24px",
        "border-radius:10px",
        "font:600 16px/1.2 system-ui,-apple-system,sans-serif",
        "text-decoration:none",
    ].join(";");
    return `<a href="${escapeAttr(input.url)}" target="_blank" rel="noopener" style="${style}">${escapeText(input.label)}</a>`;
}
