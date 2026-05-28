/** Legacy intake configs used `new`; enrollment pipeline queues expect `new_inquiry`. */
const INTAKE_OPPORTUNITY_STATUS_KEY_ALIASES: Record<string, string> = {
    new: "new_inquiry",
};

/** Normalize opportunity status keys for intake writes and queue visibility. */
export function normalizeIntakeOpportunityStatusKey(
    key: string | null | undefined,
    fallback: string = "new_inquiry"
): string {
    const trimmed = typeof key === "string" ? key.trim() : "";
    if (!trimmed) return fallback;
    return INTAKE_OPPORTUNITY_STATUS_KEY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}
