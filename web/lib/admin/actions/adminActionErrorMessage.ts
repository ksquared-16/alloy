/**
 * The operator-facing sentence inside a refusal from `/api/admin/actions/execute`.
 *
 * ## Why this is a shared function and not two readings
 *
 * The route answers `{ok: false, error: {code, message}, correlation_id}` — an OBJECT. One caller
 * knew that and coerced correctly; the enrolment-paperwork composer typed the same field as a
 * string and passed it straight into JSX:
 *
 *     message: body.error ?? "The enrollment paperwork could not be prepared."
 *
 * React refuses to render an object as a child, so a refusal the operator should simply have READ —
 * "This journey is not pinned to a published Business Process revision" — threw, the Focus Panel's
 * boundary caught it, and the WHOLE Process Card was replaced by "This card could not be
 * displayed." The one screen that could have explained the problem was the one destroyed by it.
 *
 * The refusal itself is the message. Restating it in a second place would hide an eligibility
 * reason the operator can act on, so the fallback is used only when the envelope carries no words
 * at all.
 */
export function adminActionErrorMessage(body: { error?: unknown }, fallback: string): string {
    const error = body?.error;
    if (typeof error === "string" && error.trim()) return error;
    if (error && typeof error === "object" && "message" in error) {
        const message = String((error as { message: unknown }).message ?? "").trim();
        if (message) return message;
    }
    return fallback;
}
