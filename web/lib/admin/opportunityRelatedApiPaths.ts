/** Related-list API paths for opportunity drawer tabs. */

export function opportunityRelatedListPath(opportunityId: string): string {
    return `/api/admin/related/opportunity/${encodeURIComponent(opportunityId.trim())}`;
}
