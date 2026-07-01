/**
 * Map server / policy errors to operator-friendly copy (never expose raw ai_policy keys in UI).
 */
export function formatTaskAssistClientError(
    message: string | null | undefined,
    errorCode?: string | null
): string {
    const raw = (message ?? "").trim();
    const code = (errorCode ?? "").trim();

    if (
        /task_assist_draft must appear in ai_policy/i.test(raw) ||
        /ai_policy\.allowed_features/i.test(raw) ||
        /metadata\.ai_policy\.enabled/i.test(raw) ||
        /requires ai_policy\.provider/i.test(raw) ||
        code === "AI_POLICY_FEATURE_DENIED" ||
        code === "AI_POLICY_DISABLED"
    ) {
        return "Message drafting is not enabled for this organization yet.";
    }

    if (/draft_enrichment must appear/i.test(raw)) {
        return "Message drafting is not enabled for this organization yet.";
    }

    if (/AI_ENRICHMENT_STUB_ENABLED/i.test(raw) || code === "FEATURE_DISABLED") {
        return "Message drafting is not enabled in this environment yet.";
    }

    if (raw) return raw;
    if (code) return "Something went wrong. Try again or contact your administrator.";
    return "Something went wrong. Try again.";
}
