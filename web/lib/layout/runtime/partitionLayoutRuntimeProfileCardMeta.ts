import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";

const PRIMARY_META_REF_PATTERN = /^(child\.(age|status|program|desired_start)|inquiry_child\.(outcome_status|desired_program))/i;

/** Split related-list meta columns into a headline row vs stacked detail lines. */
export function partitionLayoutRuntimeProfileCardMeta(columns: LayoutCollectionColumn[]): {
    headline: LayoutCollectionColumn[];
    details: LayoutCollectionColumn[];
} {
    if (columns.length <= 2) {
        return { headline: columns, details: [] };
    }
    const headline: LayoutCollectionColumn[] = [];
    const details: LayoutCollectionColumn[] = [];
    for (const col of columns) {
        const ref = col.refKey.trim();
        if (
            PRIMARY_META_REF_PATTERN.test(ref)
            || col.renderHint === "status"
            || ref.endsWith(".age_band")
            || ref.endsWith(".dob_age")
        ) {
            headline.push(col);
        } else {
            details.push(col);
        }
    }
    if (headline.length === 0 && details.length > 0) {
        return { headline: details.slice(0, 2), details: details.slice(2) };
    }
    return { headline, details };
}
