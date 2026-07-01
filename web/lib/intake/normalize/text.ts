/** Normalize unicode punctuation to ASCII for consistent regex matching. */
export function normalizeIntakeText(raw: string): string {
    return raw
        .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
        .replace(/\u2013|\u2014/g, "-");
}
