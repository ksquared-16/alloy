/**
 * THE COMMAND SURFACE HOST — run a registered operational command against the subject already in hand.
 *
 * ── WHY A HOST WAS MISSING ──
 *
 * The four interaction hosts each describe a place the operator goes to supply something:
 * `inline_form` collects fields, `communications_composer` composes a message, `form_delivery` picks
 * a form, `header_delegate` hands the command to the record header. None of them describes the case
 * where there is nothing left to collect.
 *
 * `stage_work.start` is that case. The Focus Panel already knows the subject — a specific child, at a
 * specific stage — and configuration already named the work to start. The command has a resolved
 * subject and resolved inputs, and the only thing left to do is run it. Routed through
 * `header_delegate` it reached an opportunity-scoped host that carries no child-subject command, and
 * the operator was told to "use drawer header actions" for an action the drawer header does not have.
 *
 * ── WHAT THIS IS NOT ──
 *
 * Not a new mutation path. It POSTs the same `/api/admin/actions/execute` every other registered
 * command uses — the route that owns eligibility, confirmation, audit and the invariants. Nothing
 * here decides whether the command may run: the server does, and a refusal comes back as a refusal.
 *
 * Not a `stage_work.start` component either. It names no action, no work template and no process. It
 * forwards an identity, a subject and whatever inputs configuration bound, which is why the next
 * command with resolved inputs needs no second host.
 */

export type CommandSurfaceExecuteRequest = {
    /** Canonical registered action identity. */
    actionKey: string;
    /** The operational subject the Focus Panel already resolved. */
    entityType: string;
    entityId: string;
    /** Inputs configuration already bound. Never collected from the operator here. */
    payload?: Record<string, unknown>;
    /** Where the operator is acting from, for audit. */
    surface?: string;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export type CommandSurfaceExecuteResult =
    | { ok: true; data: unknown }
    | { ok: false; error: string };

/**
 * Execute through the one registered-action runtime.
 *
 * `confirmed: true` reflects that the operator has already pressed the control. It does not weaken
 * the action's own confirmation policy: a command that needs a preview or a second decision declares
 * that, and the caller renders it BEFORE reaching here. This host must never be the thing that
 * decides a business confirmation question.
 */
export async function executeCommandSurfaceAction(
    request: CommandSurfaceExecuteRequest,
    fetchImpl: typeof fetch = fetch,
): Promise<CommandSurfaceExecuteResult> {
    const actionKey = request.actionKey?.trim();
    const entityType = request.entityType?.trim();
    const entityId = request.entityId?.trim();

    /*
     * FAIL CLOSED. A command with no identity or no subject must not reach the route and must not
     * present as having run — that is the no-op this surface exists to prevent, and guessing a
     * subject would be worse than refusing.
     */
    if (!actionKey) return { ok: false, error: "This command has no registered action to run." };
    if (!entityType || !entityId) {
        return { ok: false, error: "This command has no resolved subject to run against." };
    }

    try {
        const res = await fetchImpl("/api/admin/actions/execute", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action_key: actionKey,
                entity_type: entityType,
                entity_id: entityId,
                context: {
                    surface: request.surface ?? "focus_panel",
                    origin: "operator",
                    ...(request.departmentId ? { department_id: request.departmentId } : {}),
                    ...(request.workUnitId ? { work_unit_id: request.workUnitId } : {}),
                },
                ...(request.payload && Object.keys(request.payload).length ? { payload: request.payload } : {}),
                confirmation: { confirmed: true },
            }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: unknown; error?: unknown };
        if (!res.ok || json.ok === false) {
            // The route's refusal IS the message. Restating it would put a second explanation of the
            // same rule in a second place, and would hide an eligibility reason the operator can act on.
            const error =
                typeof json.error === "string" ? json.error
                : json.error && typeof json.error === "object" && "message" in json.error ?
                    String((json.error as { message: unknown }).message)
                :   "This command could not be run.";
            return { ok: false, error };
        }
        return { ok: true, data: json.data ?? null };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "This command could not be run." };
    }
}
