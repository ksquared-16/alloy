const MIN_LEN = 2;
const MAX_LEN = 64;

/** Slug for option set / option item keys: lowercase, `_`, 2–64 chars. */
export function slugifyAdminKey(label: string): string {
    let s = label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    if (s.length < MIN_LEN) s = "option";
    if (s.length > MAX_LEN) {
        s = s.slice(0, MAX_LEN).replace(/_+$/g, "");
        if (s.length < MIN_LEN) s = "option";
    }
    return s;
}

/**
 * First tries `base` (after slugifying). If reserved, uses `base_2`, `base_3`, …
 * Stays within 64 characters by shortening the stem when needed.
 */
export function uniqueAdminKey(base: string, reserved: Set<string>): string {
    const b0 = slugifyAdminKey(base);
    const ok = (k: string) => k.length >= MIN_LEN && k.length <= MAX_LEN && !reserved.has(k);

    if (ok(b0)) return b0;

    for (let n = 2; n < 10000; n++) {
        const suffix = `_${n}`;
        let stem = b0;
        if (stem.length + suffix.length > MAX_LEN) {
            stem = stem.slice(0, MAX_LEN - suffix.length).replace(/_+$/g, "");
            if (stem.length < MIN_LEN) stem = "op";
        }
        const cand = stem + suffix;
        if (ok(cand)) return cand;
    }

    return b0;
}
