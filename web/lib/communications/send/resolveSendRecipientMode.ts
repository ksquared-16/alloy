/**
 * Which recipient mode a send request is asking for — and whether it may.
 *
 * Two modes exist and they are mutually exclusive:
 *
 *   person — a resolved canonical Person (the long-standing path)
 *   thread — a conversation whose sender Alloy has not identified
 *
 * The thread mode exists so an operator can answer a parent who texted in before
 * anyone knew who they were. Its entire safety property is that the request
 * carries a conversation, never a destination: the server derives the address
 * from an inbound message it actually received on a thread the organization owns.
 *
 * Kept as a pure function so the contract is testable directly. The route
 * handler's own auth chain reaches Next's request scope, which makes handler-level
 * unit testing prove more about mocking than about this contract.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any of these in a thread reply means the caller tried to choose the destination. */
export const ADDRESS_BEARING_FIELDS = [
    "to",
    "to_address",
    "phone",
    "email",
    "recipient_address",
] as const;

export type SendRecipientMode =
    | { mode: "person"; personId: string }
    | { mode: "thread"; threadId: string }
    | { mode: "invalid"; code: string; error: string };

function invalid(code: string, error: string): SendRecipientMode {
    return { mode: "invalid", code, error };
}

export function resolveSendRecipientMode(body: Record<string, unknown>): SendRecipientMode {
    const personId = typeof body.recipient_person_id === "string" ? body.recipient_person_id.trim() : "";
    const threadId = typeof body.thread_id === "string" ? body.thread_id.trim() : "";

    // Both would leave it ambiguous which one decided the destination, and the
    // answer would be whichever branch happened to run first.
    if (personId && threadId) {
        return invalid("ambiguous_recipient_mode", "Provide either recipient_person_id or thread_id, not both.");
    }

    if (threadId) {
        if (!UUID_RE.test(threadId)) {
            return invalid("invalid_thread_id", "thread_id must be a UUID.");
        }
        for (const field of ADDRESS_BEARING_FIELDS) {
            const supplied = body[field];
            if (supplied != null && String(supplied).trim() !== "") {
                // Refused rather than ignored: silently dropping it would let a
                // caller believe they had redirected the message somewhere else.
                return invalid(
                    "thread_recipient_address_not_permitted",
                    "A thread reply derives its destination from the conversation. Remove the address."
                );
            }
        }
        return { mode: "thread", threadId };
    }

    if (personId) {
        if (!UUID_RE.test(personId)) {
            return invalid("typed_recipient_required", "recipient_person_id must be a UUID.");
        }
        return { mode: "person", personId };
    }

    return invalid("typed_recipient_required", "A recipient_person_id or thread_id is required.");
}
