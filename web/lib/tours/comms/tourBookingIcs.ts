import { isValidIanaTimeZone } from "@/lib/admin/timezoneContract";

/** RFC 5545 line length limit (octets); folded continuation uses CRLF + space. */
const ICS_MAX_LINE = 75;

export type TourBookingIcsEventStatus = "confirmed" | "cancelled" | "tentative";

export type TourBookingIcsMethod = "PUBLISH" | "CANCEL" | "REQUEST";

export type BuildTourBookingIcsInput = {
    bookingId: string;
    orgId: string;
    opportunityId?: string | null;
    locationId?: string | null;
    /** ISO-8601 instants (scheduling SoT). */
    startAtIso: string;
    endAtIso: string;
    timezone: string;
    summary: string;
    description?: string | null;
    locationLabel?: string | null;
    organizerName?: string | null;
    organizerEmail?: string | null;
    /** Single attendee (legacy). Prefer `attendeeEmails` when multiple. */
    attendeeEmail?: string | null;
    /** Staff attendees (primary host + optional additional). Deduped. */
    attendeeEmails?: readonly string[] | null;
    status?: TourBookingIcsEventStatus;
    /** Monotonic version for reschedule (default 0). */
    sequence?: number;
    method?: TourBookingIcsMethod;
    /** Defaults to now (UTC) when omitted. */
    dtStampIso?: string | null;
    createdIso?: string | null;
    lastModifiedIso?: string | null;
};

const ALLOY_ICS_PRODID = "-//Alloy//Tour Scheduling//EN";

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

/** Format instant as `YYYYMMDDTHHmmssZ` (UTC). */
export function formatIcsUtcDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        throw new RangeError("formatIcsUtcDateTime: invalid ISO instant");
    }
    return (
        `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
        `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
    );
}

/**
 * Stable UID per booking (reschedule updates same UID + SEQUENCE).
 * Org id scopes multi-tenant uniqueness in the local part domain.
 */
export function buildTourBookingIcsUid(bookingId: string, orgId: string): string {
    const bid = String(bookingId ?? "").trim();
    const oid = String(orgId ?? "").trim();
    if (!bid) throw new RangeError("buildTourBookingIcsUid: bookingId required");
    const domain = oid ? `${oid}.alloy.local` : "alloy.app";
    return `tour-booking-${bid}@${domain}`;
}

/** Escape TEXT values per RFC 5545 (backslash, semicolon, comma, newline). */
export function escapeIcsText(value: string): string {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/\r\n/g, "\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}

function icsStatusToken(status: TourBookingIcsEventStatus): string {
    if (status === "cancelled") return "CANCELLED";
    if (status === "tentative") return "TENTATIVE";
    return "CONFIRMED";
}

function resolveMethod(input: BuildTourBookingIcsInput): TourBookingIcsMethod {
    if (input.method) return input.method;
    if (input.status === "cancelled") return "CANCEL";
    return "REQUEST";
}

function foldIcsLine(line: string): string {
    const crlf = "\r\n";
    if (line.length <= ICS_MAX_LINE) return line;
    const parts: string[] = [];
    let rest = line;
    parts.push(rest.slice(0, ICS_MAX_LINE));
    rest = rest.slice(ICS_MAX_LINE);
    while (rest.length > 0) {
        parts.push(` ${rest.slice(0, ICS_MAX_LINE - 1)}`);
        rest = rest.slice(ICS_MAX_LINE - 1);
    }
    return parts.join(crlf);
}

function pushProperty(lines: string[], name: string, value: string): void {
    if (!value.trim()) return;
    lines.push(foldIcsLine(`${name}:${value}`));
}

/**
 * Build a `text/calendar` document for a tour booking (Band A — link/attachment ready).
 * Uses UTC `Z` for DTSTART/DTEND/DTSTAMP for broad client compatibility.
 */
export function buildTourBookingIcs(input: BuildTourBookingIcsInput): string {
    const bookingId = String(input.bookingId ?? "").trim();
    const orgId = String(input.orgId ?? "").trim();
    if (!bookingId || !orgId) {
        throw new RangeError("buildTourBookingIcs: bookingId and orgId are required");
    }

    const tz = String(input.timezone ?? "").trim();
    if (!tz || !isValidIanaTimeZone(tz)) {
        throw new RangeError("buildTourBookingIcs: valid IANA timezone required");
    }

    const startUtc = formatIcsUtcDateTime(input.startAtIso);
    const endUtc = formatIcsUtcDateTime(input.endAtIso);
    const nowIso = input.dtStampIso?.trim() || new Date().toISOString();
    const dtStamp = formatIcsUtcDateTime(nowIso);
    const created = formatIcsUtcDateTime(input.createdIso?.trim() || nowIso);
    const lastMod = formatIcsUtcDateTime(input.lastModifiedIso?.trim() || nowIso);

    const status = input.status ?? "confirmed";
    const sequence = Math.max(0, Math.floor(input.sequence ?? 0));
    const uid = buildTourBookingIcsUid(bookingId, orgId);
    const method = resolveMethod({ ...input, status });

    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:${ALLOY_ICS_PRODID}`,
        "CALSCALE:GREGORIAN",
        `METHOD:${method}`,
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `CREATED:${created}`,
        `LAST-MODIFIED:${lastMod}`,
        `SEQUENCE:${sequence}`,
        `DTSTART:${startUtc}`,
        `DTEND:${endUtc}`,
        `SUMMARY:${escapeIcsText(input.summary)}`,
        `STATUS:${icsStatusToken(status)}`,
    ];

    const desc = String(input.description ?? "").trim();
    if (desc) pushProperty(lines, "DESCRIPTION", escapeIcsText(desc));

    const loc = String(input.locationLabel ?? "").trim();
    if (loc) pushProperty(lines, "LOCATION", escapeIcsText(loc));

    const orgEmail = String(input.organizerEmail ?? "").trim();
    const orgName = String(input.organizerName ?? "").trim();
    if (orgEmail) {
        const cn = orgName ? `;CN=${escapeIcsText(orgName)}` : "";
        lines.push(foldIcsLine(`ORGANIZER${cn}:mailto:${orgEmail}`));
    }

    const attendeeSet = new Set<string>();
    const single = String(input.attendeeEmail ?? "").trim();
    if (single) attendeeSet.add(single.toLowerCase());
    for (const raw of input.attendeeEmails ?? []) {
        const e = String(raw ?? "").trim();
        if (e) attendeeSet.add(e.toLowerCase());
    }
    for (const attendee of attendeeSet) {
        lines.push(
            foldIcsLine(
                `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
            ),
        );
    }

    if (input.opportunityId) {
        pushProperty(lines, "X-ALLOY-OPPORTUNITY-ID", escapeIcsText(String(input.opportunityId).trim()));
    }
    if (input.locationId) {
        pushProperty(lines, "X-ALLOY-LOCATION-ID", escapeIcsText(String(input.locationId).trim()));
    }
    pushProperty(lines, "X-ALLOY-BOOKING-TIMEZONE", escapeIcsText(tz));

    lines.push("END:VEVENT", "END:VCALENDAR");

    return `${lines.join("\r\n")}\r\n`;
}

/** Map booking `status_key` to ICS event status (orchestrator helper). */
export function tourBookingStatusKeyToIcsStatus(statusKey: string): TourBookingIcsEventStatus {
    const sk = String(statusKey ?? "").trim().toLowerCase();
    if (sk === "canceled") return "cancelled";
    if (sk === "requested" || sk === "pending_approval") return "tentative";
    return "confirmed";
}
