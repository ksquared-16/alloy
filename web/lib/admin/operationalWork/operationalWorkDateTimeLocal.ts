function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

/** Earliest selectable datetime-local value (~1 minute from now). */
export function minOperationalWorkDatetimeLocalValue(): string {
    const d = new Date(Date.now() + 60_000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Default due for new record work — tomorrow 9:00 local. */
export function defaultOperationalWorkDueLocal(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Convert ISO-8601 timestamp to datetime-local input value (local timezone). */
export function operationalWorkIsoToDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return defaultOperationalWorkDueLocal();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
