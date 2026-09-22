/**
 * READING A REGISTERED ACTION'S DETAIL OFF THE EXECUTE ENVELOPE.
 *
 * `/api/admin/actions/execute` serialises a registered action's result as
 *
 *     apiOk({ execution_result: result.actionResult.result.detail, affected_id })
 *
 * so the action's `detail` IS the `execution_result`. Three Payments command modules each wrote
 * `json.data?.execution_result?.detail ?? {}` — one level too deep — and so each received `{}` from
 * a route that had returned everything they asked for.
 *
 * ── WHY THIS WAS EXPENSIVE TO FIND ──
 *
 * Both halves are individually correct and disagree only about DEPTH, so nothing throws, no status
 * is unusual and no error is logged. The caller simply behaves as though the server said nothing.
 * On deployed staging that turned "Continue setup" into a button that reads "Opening…" and never
 * opens the provider, and it is the same reason W2's add-method flow never received the
 * `client_secret` its browser step needs.
 *
 * ── WHY THIS TOLERATES BOTH SHAPES ──
 *
 * Some routes genuinely nest a `detail` inside `execution_result`, which is why
 * `tourInvitationDetailFromExecutePayload` already reads both. Preferring a nested `detail` when one
 * is present, and otherwise treating `execution_result` as the detail, is that same rule in one
 * place — so a caller cannot be broken by which route it happens to be talking to.
 */
export function executeDetailFrom(json: unknown): Record<string, unknown> {
    if (!json || typeof json !== "object") return {};
    const data = (json as { data?: unknown }).data;
    if (!data || typeof data !== "object") return {};
    const execution = (data as { execution_result?: unknown }).execution_result;
    if (!execution || typeof execution !== "object") return {};

    const nested = (execution as { detail?: unknown }).detail;
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
    return execution as Record<string, unknown>;
}
