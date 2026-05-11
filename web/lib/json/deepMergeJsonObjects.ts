/** Deep-merge plain JSON objects (non-array). Later keys replace earlier scalars and shallow-merge nested objects. */
export function deepMergeJsonObjects(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...a };
    for (const [k, bv] of Object.entries(b)) {
        const av = a[k];
        if (
            bv !== null &&
            typeof bv === "object" &&
            !Array.isArray(bv) &&
            av !== null &&
            typeof av === "object" &&
            !Array.isArray(av)
        ) {
            out[k] = deepMergeJsonObjects(av as Record<string, unknown>, bv as Record<string, unknown>);
        } else {
            out[k] = bv;
        }
    }
    return out;
}
