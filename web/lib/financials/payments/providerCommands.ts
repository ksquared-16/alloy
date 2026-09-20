/**
 * THE ONE EXECUTION PATH, for provider configuration.
 *
 * The three provider acts are registered capabilities, so the surface REQUESTS them through
 * `/api/admin/actions/execute` exactly as every financial command does. It deliberately does not
 * join `FINANCIAL_TRANSACTION_ACTIONS`: that map is about a ledger row's own operations, and folding
 * organisation configuration into it would blur two different kinds of authority in one list.
 *
 * Nothing here decides anything. Authorization, idempotency and the provider call all live on the
 * server; this posts an intent and renders the answer.
 */
export const PROVIDER_COMMANDS = {
    connect: "provider.connect",
    refresh: "provider.refresh_readiness",
    disconnect: "provider.disconnect",
} as const;

export type ProviderCommand = keyof typeof PROVIDER_COMMANDS;

export type ProviderCommandResult =
    | { ok: true; detail: Record<string, unknown> }
    | { ok: false; error: string };

export async function executeProviderCommand(
    command: ProviderCommand,
    payload: Record<string, unknown> = {},
): Promise<ProviderCommandResult> {
    try {
        const res = await fetch("/api/admin/actions/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                action_key: PROVIDER_COMMANDS[command],
                /*
                 * Organisation-grain configuration. The executor honours the action's own
                 * `requiresEntityId: false`, so no record is named — but it still wants a type, and
                 * inventing a subject here would imply this is about one family.
                 */
                entity_type: "opportunity",
                entity_id: "",
                mode: "execute",
                confirmation: { confirmed: true },
                payload,
            }),
        });
        const json = (await res.json()) as {
            ok?: boolean;
            error?: string | { message?: string };
            data?: { execution_result?: { detail?: Record<string, unknown> } };
        };
        if (!res.ok || json.ok === false) {
            const error = typeof json.error === "string" ? json.error : json.error?.message;
            return { ok: false, error: error || "That could not be completed." };
        }
        return { ok: true, detail: json.data?.execution_result?.detail ?? {} };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "That could not be completed." };
    }
}
