/**
 * Pick adjacent work-unit queue filter pill keys for background row prefetch.
 * Caps breadth so we do not warm entire queue catalogs.
 */
export function adjacentWorkUnitQueuePillKeys(
    summaries: ReadonlyArray<{ key: string }>,
    selectedKey: string | null,
    cap = 3
): string[] {
    if (!summaries.length || cap <= 0) return [];
    const keys = summaries.map((s) => String(s.key ?? "").trim()).filter(Boolean);
    if (!keys.length) return [];

    const active = selectedKey?.trim() || keys[0];
    const idx = keys.indexOf(active);
    if (idx < 0) {
        return keys.slice(0, cap);
    }

    const out: string[] = [];
    const add = (key: string) => {
        if (!key || key === active || out.includes(key)) return;
        out.push(key);
    };

    for (let d = 1; d < keys.length && out.length < cap; d++) {
        if (idx - d >= 0) add(keys[idx - d]!);
        if (out.length >= cap) break;
        if (idx + d < keys.length) add(keys[idx + d]!);
    }

    return out.slice(0, cap);
}
