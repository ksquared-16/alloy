/**
 * How a tour time is said to an operator: 12-hour clock, in the SITE's zone.
 *
 * A rule's `start_time` / `end_time` are wall-clock values in the rule's own `timezone` (Postgres
 * `time`, e.g. `08:30:00`) — the slot engine expands them on each calendar day in that zone, so
 * "8:30 AM" on the editor is 8:30 AM on the public page in winter and in summer alike. Formatting
 * them therefore needs NO conversion and must never go through the browser's zone; a booking
 * instant (`timestamptz`) is formatted in the booking's timezone snapshot.
 *
 * Pure. Same output on a server in UTC and a laptop in Sydney.
 */

const WALL_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** `08:30:00` → `8:30 AM`; `14:00` → `2:00 PM`; `00:15` → `12:15 AM`. Null when not a wall time. */
export function formatTourWallTime(value: string | null | undefined): string | null {
    const m = WALL_TIME.exec(String(value ?? "").trim());
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours > 23 || minutes > 59) return null;
    const suffix = hours < 12 ? "AM" : "PM";
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${h12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** `8:30 – 10:30 AM`, `11:30 AM – 1:00 PM`. Falls back to the raw values rather than blanking. */
export function formatTourWallTimeRange(start: string, end: string): string {
    const a = formatTourWallTime(start);
    const b = formatTourWallTime(end);
    if (!a || !b) return `${start}–${end}`;
    const [aTime, aSuffix] = a.split(" ");
    const [, bSuffix] = b.split(" ");
    return aSuffix === bSuffix ? `${aTime} – ${b}` : `${a} – ${b}`;
}

/** `HH:MM` for an `<input type="time">` from a Postgres `time`. */
export function wallTimeToInputValue(value: string): string {
    const m = WALL_TIME.exec(String(value ?? "").trim());
    if (!m) return "";
    return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

/** Minutes after midnight, for ordering and overlap checks. */
export function wallTimeToMinutes(value: string): number | null {
    const m = WALL_TIME.exec(String(value ?? "").trim());
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
}

/** An IANA zone the runtime can format in (`America/Los_Angeles`); free text like `PST` is refused. */
export function isValidTourTimeZone(value: string): boolean {
    const zone = String(value ?? "").trim();
    if (!zone || (!zone.includes("/") && zone !== "UTC")) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date(0));
        return true;
    } catch {
        return false;
    }
}

/** A zone's short name at an instant (`PST` / `PDT`), or the IANA id when the runtime has none. */
export function tourTimeZoneShortName(timeZone: string, at: Date = new Date()): string {
    try {
        const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
            .formatToParts(at)
            .find((p) => p.type === "timeZoneName");
        return part?.value ?? timeZone;
    } catch {
        return timeZone;
    }
}

/**
 * A booking instant for an operator: `Mon, Jun 30, 2026 · 10:00 AM PDT`, in the booking's own zone.
 * The locale is fixed to en-US so a 24-hour browser locale cannot turn it back into military time.
 */
export function formatTourInstantForOperator(iso: string, timeZone: string | null | undefined): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return iso;
    const zone = timeZone && timeZone.trim() ? timeZone.trim() : "UTC";
    try {
        const day = new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: zone,
        }).format(at);
        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: zone,
            timeZoneName: "short",
        }).format(at);
        return `${day} · ${time}`;
    } catch {
        return iso;
    }
}
