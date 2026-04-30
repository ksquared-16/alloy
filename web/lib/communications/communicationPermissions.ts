/**
 * Card 12 — Sender permission stub.
 * Route already requires admin/ops via requireAdminOrOps + getAdminContext.
 * Hook: keyed permission `communications.send` for finer org roles once role matrix exists.
 */

export type CommunicationsActor = { userId: string };

/** Returns false when finer-grained org permission table rejects send (stub: always allowed). */
export async function assertCommunicationsSendAllowed(_params: {
    orgId: string;
    actor: CommunicationsActor | null | undefined;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    // TODO(Card 14+): check org role / capability row for communications.send when model exists.
    return { ok: true };
}

export const COMMUNICATIONS_SEND_PERMISSION_KEY = "communications.send" as const;
