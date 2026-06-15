// UI-5B — pure adapter: derive the family (customer) id from a queue/workspace entry.
// Priority: explicit customerId -> thread primaryEntity of type customer -> opportunity.customer_id.
export function resolveCustomerIdFromWorkspaceEntry(input: {
    customerId?: string | null;
    threadPrimaryEntity?: { type?: string | null; id?: string | null } | null;
    opportunityCustomerId?: string | null;
}): string | null {
    const explicit = (input.customerId ?? "").trim();
    if (explicit) return explicit;
    const pe = input.threadPrimaryEntity;
    if (pe && (pe.type ?? "").toLowerCase() === "customer" && (pe.id ?? "").trim()) return (pe.id as string).trim();
    const oppCust = (input.opportunityCustomerId ?? "").trim();
    if (oppCust) return oppCust;
    return null;
}
