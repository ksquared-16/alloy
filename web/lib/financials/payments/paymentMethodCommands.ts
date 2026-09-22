/**
 * THE ONE EXECUTION PATH, for payment method administration.
 *
 * The three acts are registered capabilities, so the surface REQUESTS them through
 * `/api/admin/actions/execute` exactly as W1's provider acts do. Nothing here decides anything:
 * authorization, the account check and every provider call live on the server. This posts an intent
 * and renders the answer.
 */

import { executeDetailFrom } from "@/lib/adminV2/actions/executeEnvelope";
export const PAYMENT_METHOD_COMMANDS = {
    add: "payment_method.add",
    setDefault: "payment_method.set_default",
    revoke: "payment_method.revoke",
} as const;

export type PaymentMethodCommand = keyof typeof PAYMENT_METHOD_COMMANDS;

export type PaymentMethodCommandResult =
    | { ok: true; detail: Record<string, unknown> }
    | { ok: false; error: string };

export async function executePaymentMethodCommand(
    command: PaymentMethodCommand,
    payload: Record<string, unknown> = {},
): Promise<PaymentMethodCommandResult> {
    try {
        const res = await fetch("/api/admin/actions/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                action_key: PAYMENT_METHOD_COMMANDS[command],
                /*
                 * The action is account-grain and declares `requiresEntityId: false`; the ACCOUNT
                 * travels in the payload, where the executor checks it against the session's
                 * organisation. Naming a record here would imply this is about one child.
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
            data?: { execution_result?: Record<string, unknown> };
        };
        if (!res.ok || json.ok === false) {
            const error = typeof json.error === "string" ? json.error : json.error?.message;
            return { ok: false, error: error || "That could not be completed." };
        }
        return { ok: true, detail: executeDetailFrom(json) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "That could not be completed." };
    }
}
