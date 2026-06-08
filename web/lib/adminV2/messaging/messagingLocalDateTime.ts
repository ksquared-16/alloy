import { formatDateTimeLocal } from "@/lib/adminFormatters";

/** Message/inbox timestamps in the viewer's browser-local timezone. */
export function formatMessagingDateTimeLocal(value: string | number | Date | null | undefined): string {
    return formatDateTimeLocal(value);
}

export function defaultScheduleDateAndTime(): { date: string; time: string } {
    const d = new Date(Date.now() + 60 * 60_000);
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
}

export function combineLocalDateAndTime(date: string, time: string): Date | null {
    const datePart = date.trim();
    const timePart = time.trim();
    if (!datePart || !timePart) return null;
    const ms = Date.parse(`${datePart}T${timePart}`);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms);
}
