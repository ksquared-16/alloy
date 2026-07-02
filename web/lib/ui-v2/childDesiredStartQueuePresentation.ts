/**
 * Child-level desired start display for work-unit / queue CRM compact rows.
 * Opportunity-level `desired_start_date` (unrenamed legacy metadata field) is placement legacy; queue UI uses OCM dates only.
 */

export function normalizeIsoDateOnly(value: string | null | undefined): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1]! : null;
}

/** Compact operator summary for one or more child desired start dates on an inquiry. */
export function summarizeChildStartDates(dates: (string | null | undefined)[]): string | null {
    const unique = new Set<string>();
    for (const raw of dates) {
        const d = normalizeIsoDateOnly(raw);
        if (d) unique.add(d);
    }
    if (unique.size === 0) return null;
    if (unique.size === 1) return [...unique][0]!;
    return `${unique.size} dates`;
}

export function childDesiredStartSummaryFromOcmRows(
    rows: { start_date?: string | null }[]
): string | null {
    return summarizeChildStartDates(rows.map((r) => r.start_date ?? null));
}
