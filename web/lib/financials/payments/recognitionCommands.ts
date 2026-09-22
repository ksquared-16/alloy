/**
 * THE ONE EXECUTION PATH, for recognizing a collection.
 *
 * `payment.recognize` is a registered capability, so the surface REQUESTS it through
 * `/api/admin/actions/execute` exactly as every other financial command does. Nothing here decides
 * anything: authorization, the provider re-read and the canonical posting all live on the server.
 */

import { executeDetailFrom } from "@/lib/adminV2/actions/executeEnvelope";
export type RecognizeCommandResult =
    | { ok: true; detail: Record<string, unknown> }
    | { ok: false; error: string };

export async function executeRecognizePayment(collectionAttemptId: string): Promise<RecognizeCommandResult> {
    try {
        const res = await fetch("/api/admin/actions/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                action_key: "payment.recognize",
                entity_type: "opportunity",
                entity_id: "",
                mode: "execute",
                confirmation: { confirmed: true },
                payload: { collection_attempt_id: collectionAttemptId },
            }),
        });
        const json = (await res.json()) as {
            ok?: boolean;
            error?: string | { message?: string };
            data?: { execution_result?: Record<string, unknown> };
        };
        if (!res.ok || json.ok === false) {
            const error = typeof json.error === "string" ? json.error : json.error?.message;
            return { ok: false, error: error || "That payment could not be recognized." };
        }
        return { ok: true, detail: executeDetailFrom(json) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "That payment could not be recognized." };
    }
}
