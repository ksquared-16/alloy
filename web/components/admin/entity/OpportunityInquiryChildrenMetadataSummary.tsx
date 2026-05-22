"use client";

/** Read-only children rows from opportunity metadata — no network; fixed geometry for primary reveal. */
export type InquiryChildMetadataRow = {
    display_name: string;
    program_label?: string | null;
    age_group?: string | null;
};

export function parseInquiryChildrenFromOpportunityMetadata(metadata: unknown): InquiryChildMetadataRow[] {
    if (!metadata || typeof metadata !== "object") return [];
    const list = (metadata as { inquiry_children?: unknown }).inquiry_children;
    if (!Array.isArray(list)) return [];
    const out: InquiryChildMetadataRow[] = [];
    for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const name =
            String(r.display_name ?? "").trim() ||
            [r.first_name, r.last_name].filter((x) => String(x ?? "").trim()).join(" ").trim();
        if (!name) continue;
        out.push({
            display_name: name,
            program_label: r.program_label != null ? String(r.program_label) : null,
            age_group: r.age_group != null ? String(r.age_group) : null,
        });
    }
    return out;
}

const ROW_MIN_H = "min-h-[1.75rem]";

/**
 * Stable above-fold children summary from metadata (drawer_primary). Does not resize when full hydrate arrives.
 */
export function OpportunityInquiryChildrenMetadataSummary({ rows }: { rows: InquiryChildMetadataRow[] }) {
    if (!rows.length) return null;
    return (
        <div
            className="min-w-0 space-y-1"
            data-inquiry-children-metadata-summary="true"
            style={{ minHeight: `${Math.max(2, rows.length) * 1.75}rem` }}
        >
            {rows.map((row, i) => (
                <div
                    key={`${row.display_name}-${i}`}
                    className={`${ROW_MIN_H} flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug text-alloy-midnight/85`}
                >
                    <span className="font-medium">{row.display_name}</span>
                    {row.program_label ? (
                        <span className="text-alloy-midnight/55">{row.program_label}</span>
                    ) : null}
                    {row.age_group ? <span className="text-alloy-midnight/45">{row.age_group}</span> : null}
                </div>
            ))}
        </div>
    );
}
