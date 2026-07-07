/**
 * Compact queue row contact field display formatting.
 */

/** Format US phone for queue row display; omit invalid/too-short values. */
export function formatQueueRowPhoneDisplay(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 10) return null;

    const area = digits.slice(-10, -7);
    const mid = digits.slice(-7, -4);
    const last = digits.slice(-4);
    return `(${area}) ${mid}-${last}`;
}
