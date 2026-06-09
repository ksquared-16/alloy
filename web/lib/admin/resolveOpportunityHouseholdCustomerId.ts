/** Resolve household/customer id for inquiry-child mutations from drawer VM record. */
export function resolveOpportunityHouseholdCustomerId(
    record: Record<string, unknown> | null | undefined,
): string | null {
    if (!record || typeof record !== "object") return null;
    const direct = record.customer_id;
    if (typeof direct === "string" && direct.trim()) return direct.trim();

    const identity = record._identity;
    if (identity && typeof identity === "object") {
        const household = (identity as Record<string, unknown>).household;
        if (household && typeof household === "object") {
            const id = (household as Record<string, unknown>).id;
            if (typeof id === "string" && id.trim()) return id.trim();
        }
    }
    return null;
}
