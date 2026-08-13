import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";

/**
 * How a tour's WHEN and its STATE are said to an operator. One vocabulary, two consumers.
 *
 * Both facts were being answered twice and differently. `buildWhatsNextCardPresentation` had a
 * correct, timezone-aware start formatter; the Tour card had its own, which documented itself as
 * producing `"Jun 30 · 10:00 AM"` while actually being `iso.slice(0, 16).replace("T", " · ")` — so
 * the card showed `2026-06-30 · 10:00`, an ISO fragment, in the operator's primary answer line.
 *
 * The status was worse: `OperationalTourSignal.statusLabel` is
 * `trimOrNull(nextBooking.status_key)` — the RAW KEY. The card rendered it verbatim, so the chip
 * read `pending_approval` and `no_show`. The deleted tour lifecycle bar carried a label map, which
 * is the one thing it had that the card did not; rather than remount the bar for it, the vocabulary
 * moves here.
 *
 * No hardcoded map: `humanizeSnakeCaseToken` is the platform's generic resolver, so a status the
 * tour system adds later reads correctly without an edit here.
 */

/** `"Mon, Jun 30, 10:00 AM"` in the viewer's zone — null when the value is not a usable instant. */
export function formatTourStartLabel(iso: string | null | undefined, timeZone?: string | null): string | null {
    const raw = (iso ?? "").trim();
    if (!raw) return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return null;
    try {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            ...(timeZone ? { timeZone } : {}),
        }).format(at);
    } catch {
        // An invalid configured zone must not blank the operator's answer line.
        return null;
    }
}

/** `pending_approval` → `Pending approval`. Already-humanized labels pass through unchanged. */
export function formatTourStatusLabel(statusKey: string | null | undefined): string | null {
    const raw = (statusKey ?? "").trim();
    if (!raw) return null;
    return humanizeSnakeCaseToken(raw) || raw;
}

/**
 * Terminal states — the tour has happened (or provably has not), so scheduling actions are over.
 *
 * Kept next to the labels because both answer "what does this status MEAN to an operator", and a
 * card that offers Reschedule on a completed tour is the same defect as one that prints a raw key.
 */
const TOUR_TERMINAL_STATUS_KEYS = new Set(["completed", "no_show", "canceled", "cancelled"]);

export function isTourTerminalStatus(statusKey: string | null | undefined): boolean {
    return TOUR_TERMINAL_STATUS_KEYS.has((statusKey ?? "").trim().toLowerCase());
}
