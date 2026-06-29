/**
 * Last-resort display label for a status_key that has no configured status_definitions label.
 *
 * Doctrine: raw status keys are internal; operators see labels. When a key lacks a configured
 * label (e.g. an org missing a `new_inquiry` definition for `opportunity_customer_members`),
 * surfaces must still show a human string — never the raw snake_case key, and never a UUID/id.
 *
 * Pure leaf module (no server imports) so both the server projection and client renderers can
 * use it. Prefer a configured status_definitions label when one exists; this is the fallback.
 */

const STATUS_KEY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Title-case a snake_case / kebab-case status key (`new_inquiry` → `New Inquiry`).
 * Returns `null` for empty/blank input or UUID-like ids, so callers never surface a raw id
 * as operator copy.
 */
export function humanizeStatusKey(statusKey: string | null | undefined): string | null {
    const sk = statusKey != null ? String(statusKey).trim() : "";
    if (!sk) return null;
    if (STATUS_KEY_UUID_RE.test(sk)) return null;
    const words = sk
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return words.length ? words.join(" ") : null;
}
