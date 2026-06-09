/** Row identity for `_inquiry_children` reconcile after Add Child. */
function inquiryChildRowIdentity(row: unknown): { ocmId: string; cmId: string } {
    if (!row || typeof row !== "object") return { ocmId: "", cmId: "" };
    const rec = row as Record<string, unknown>;
    return {
        ocmId: String(rec.id ?? rec.ocm_id ?? "").trim(),
        cmId: String(rec.customer_member_id ?? "").trim(),
    };
}

/**
 * Merge server inquiry children with optimistic rows not yet visible on drawer_visible.
 * Prevents refresh from wiping a just-added child before OCM hydration completes.
 */
export function mergeInquiryChildrenPreservingOptimistic(
    previous: unknown[],
    server: unknown[],
): unknown[] {
    if (!previous.length) return server;
    if (!server.length) return previous;

    const serverOcmIds = new Set<string>();
    const serverCmIds = new Set<string>();
    for (const row of server) {
        const { ocmId, cmId } = inquiryChildRowIdentity(row);
        if (ocmId) serverOcmIds.add(ocmId);
        if (cmId) serverCmIds.add(cmId);
    }

    const pendingOptimistic = previous.filter((row) => {
        const { ocmId, cmId } = inquiryChildRowIdentity(row);
        if (ocmId && serverOcmIds.has(ocmId)) return false;
        if (cmId && serverCmIds.has(cmId)) return false;
        return Boolean(ocmId || cmId);
    });

    if (!pendingOptimistic.length) return server;
    return [...server, ...pendingOptimistic];
}
