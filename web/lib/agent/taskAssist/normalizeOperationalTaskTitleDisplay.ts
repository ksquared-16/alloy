/** Display-only cleanup for operational task titles (does not mutate stored values). */
export function normalizeOperationalTaskTitleDisplay(title: string | null | undefined): string {
    const s = (title ?? "").trim();
    if (!s) return "";
    return s.replace(/^[\u2013\u2014\-–—]+\s*/, "").trim() || s;
}
