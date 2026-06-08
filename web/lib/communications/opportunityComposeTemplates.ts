import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";

export type OpportunityComposeContext = {
    status_key?: string | null;
    /** First name for greeting; falls back to "there". */
    primary_first_name?: string | null;
    tour_date?: string | null;
    tour_time?: string | null;
    /** Viewer IANA for tour line (optional). */
    display_time_zone_iana?: string | null;
};

function firstName(raw: string | null | undefined): string {
    const t = String(raw ?? "").trim();
    if (!t) return "there";
    return t.split(/\s+/)[0] || "there";
}

/**
 * Lightweight outbound starter copy for the drawer composer (no AI).
 * Returns empty string when context is insufficient for a template.
 */
export function opportunityComposeDraftBody(ctx: OpportunityComposeContext | null | undefined): string {
    if (!ctx) return "";
    const sk = String(ctx.status_key ?? "").trim().toLowerCase();
    const fn = firstName(ctx.primary_first_name);
    const tour = formatTourDateTime(ctx.tour_date, ctx.tour_time, {
        displayTimeZoneIana: ctx.display_time_zone_iana ?? undefined,
    });

    if (sk === "new_inquiry") {
        return `Hi ${fn},\n\nThanks for reaching out about enrollment. I would love to learn more about what you are looking for and answer any questions.\n\nBest,`;
    }
    if (sk === "tour_scheduled" && tour.hasDate) {
        return `Hi ${fn},\n\nLooking forward to seeing you${tour.display && tour.display !== "—" ? ` on ${tour.display}` : ""}. If you need to reschedule, just reply to this message.\n\nThanks,`;
    }
    if (sk === "enrolling" || sk === "application_in_progress" || sk === "ready_to_enroll") {
        return `Hi ${fn},\n\nHere are the next steps to complete enrollment. Let me know if you have any questions along the way.\n\nThanks,`;
    }
    if (sk === "tour_completed") {
        return `Hi ${fn},\n\nThanks for visiting. I wanted to follow up and see if you have any questions as you think things over.\n\nBest,`;
    }
    if (sk === "waitlisted") {
        return `Hi ${fn},\n\nI wanted to check in regarding the waitlist and share an update when you have a moment.\n\nThanks,`;
    }
    return `Hi ${fn},\n\nFollowing up on your inquiry. Please let me know how we can help.\n\nBest,`;
}
