/**
 * Operator-safe copy for enrich-attention client + tests — never raw provider payloads.
 */

function pickString(v: unknown): string | null {
    if (typeof v === "string" && v.trim()) return v.trim();
    return null;
}

/**
 * Maps HTTP + JSON envelope from `POST /api/admin/ai/enrich-attention-suggestion` to a calm, non-alarming line.
 * Do not pass vendor stack traces or `error` codes verbatim to UI.
 */
export function userFacingEnrichAttentionError(res: Response, json: Record<string, unknown> | null): string {
    const code = pickString(json?.error);
    const message = pickString(json?.message);

    if (res.status === 403) {
        if (code === "AI_OPENAI_FORBIDDEN") {
            return "Draft enhancement isn’t available with your current permissions. You can still copy the original draft below.";
        }
        if (code === "FEATURE_DISABLED" || message?.includes("AI_ENRICHMENT_STUB_ENABLED")) {
            return "Draft enhancement isn’t turned on in this environment. Your team can still use the original draft.";
        }
        if (code === "OPENAI_NOT_CONFIGURED") {
            return "Live drafting isn’t configured on the server yet. The original draft below is ready to use.";
        }
        if (message && message.length < 200 && !/[{}[\]]/.test(message)) {
            return message;
        }
        return "Your organization’s settings don’t allow draft enhancement right now. The original draft below is unchanged.";
    }
    if (res.status === 503) {
        return "The drafting service isn’t reachable right now. Try again in a few minutes, or use the original draft.";
    }
    if (res.status === 400 || res.status === 422) {
        return "We couldn’t start enhancement. Try again in a moment.";
    }
    if (res.status >= 500) {
        return "Something went wrong on our side. Try again shortly — your original draft is safe.";
    }
    if (res.status === 0 || res.status >= 600) {
        return "We couldn’t reach the server. Check your connection and try again.";
    }
    return "We couldn’t enhance this draft right now. The original draft below is unchanged.";
}
