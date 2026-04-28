export function formatTourDateTime(
    tourDateRaw: unknown,
    tourTimeRaw: unknown
): { display: string; hasDate: boolean; hasTime: boolean } {
    const tourDate = typeof tourDateRaw === "string" ? tourDateRaw.trim() : "";
    const tourTime = typeof tourTimeRaw === "string" ? tourTimeRaw.trim() : "";

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tourDate);
    const mmddyyyy = dateMatch ? `${dateMatch[2]}/${dateMatch[3]}/${dateMatch[1]}` : "";

    // Accept HTML <input type="time"> output: "HH:MM"
    const timeMatch24 = /^(\d{1,2}):(\d{2})$/.exec(tourTime);
    let hmAmPm = "";
    if (timeMatch24) {
        const hh = Math.min(23, Math.max(0, Number(timeMatch24[1])));
        const mm = Math.min(59, Math.max(0, Number(timeMatch24[2])));
        const ampm = hh >= 12 ? "PM" : "AM";
        const h12 = hh % 12 === 0 ? 12 : hh % 12;
        hmAmPm = `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
    } else if (tourTime) {
        // Light normalization for "9:30AM" / "9:30 am" etc.
        const m = /^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]$/.exec(tourTime.replace(/\s+/g, ""));
        if (m) hmAmPm = `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}M`;
    }

    const hasDate = Boolean(mmddyyyy);
    const hasTime = Boolean(hmAmPm);
    if (!hasDate) return { display: "—", hasDate: false, hasTime: false };
    if (!hasTime) return { display: mmddyyyy, hasDate: true, hasTime: false };
    return { display: `${mmddyyyy} ${hmAmPm}`, hasDate: true, hasTime: true };
}

