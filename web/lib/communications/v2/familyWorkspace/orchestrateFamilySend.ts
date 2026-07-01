// UI-5G — PURE family-send orchestration (no direct I/O; deps injected so it is unit-testable).
// Review-first: confirm !== true => preflight (no sends). confirm === true => fan out one send per recipient.
import type { RecipientVM } from "./types";

export type FamilySendChannel = "email" | "sms";
export type FamilySendStatus = "ready" | "sent" | "blocked" | "failed";

export type SendRecipientResult = {
    person_id: string;
    display_name: string;
    status: FamilySendStatus;
    reason: string | null;
    thread_id: string | null;
    communication_message_id: string | null;
};

export type FamilySendResult = {
    mode: "preflight" | "sent";
    results: SendRecipientResult[];
    summary: { requested: number; ready: number; sent: number; blocked: number; failed: number };
};

export type ConsentCheck = { allowed: boolean; reason: string | null } | null; // null = enforcement disabled

export type FamilySendDeps = {
    getRecipient: (personId: string) => RecipientVM | undefined;
    /** null => consent enforcement disabled (comms_v2_compliance off). */
    checkConsent: (personId: string, channel: FamilySendChannel) => Promise<ConsentCheck>;
    runSend: (args: { personId: string; channel: FamilySendChannel; subject: string | null; body: string }) => Promise<{
        ok: boolean;
        thread_id?: string | null;
        communication_message_id?: string | null;
        error?: string;
        code?: string;
    }>;
};

export type FamilySendArgs = {
    recipientPersonIds: string[];
    channel: FamilySendChannel;
    subject: string | null;
    body: string;
    confirm: boolean;
};

export async function orchestrateFamilySend(deps: FamilySendDeps, args: FamilySendArgs): Promise<FamilySendResult> {
    const ids = Array.from(new Set(args.recipientPersonIds.filter(Boolean)));
    const results: SendRecipientResult[] = [];

    for (const personId of ids) {
        const r = deps.getRecipient(personId);
        if (!r) {
            results.push({ person_id: personId, display_name: personId, status: "failed", reason: "Recipient not in family roster", thread_id: null, communication_message_id: null });
            continue;
        }
        const base = { person_id: personId, display_name: r.displayName, thread_id: null as string | null, communication_message_id: null as string | null };
        const channelElig = r.channels[args.channel];
        if (!channelElig.available) {
            results.push({ ...base, status: "blocked", reason: channelElig.unavailableReason ?? "Channel unavailable" });
            continue;
        }
        const consent = await deps.checkConsent(personId, args.channel);
        if (consent && !consent.allowed) {
            results.push({ ...base, status: "blocked", reason: consent.reason ?? "Consent not granted" });
            continue;
        }
        if (!args.confirm) {
            results.push({ ...base, status: "ready", reason: null });
            continue;
        }
        const exec = await deps.runSend({ personId, channel: args.channel, subject: args.subject, body: args.body });
        if (exec.ok) {
            results.push({ ...base, status: "sent", reason: null, thread_id: exec.thread_id ?? null, communication_message_id: exec.communication_message_id ?? null });
        } else {
            results.push({ ...base, status: exec.code === "consent_blocked" ? "blocked" : "failed", reason: exec.error ?? "Send failed", thread_id: exec.thread_id ?? null });
        }
    }

    const summary = {
        requested: ids.length,
        ready: results.filter((x) => x.status === "ready").length,
        sent: results.filter((x) => x.status === "sent").length,
        blocked: results.filter((x) => x.status === "blocked").length,
        failed: results.filter((x) => x.status === "failed").length,
    };
    return { mode: args.confirm ? "sent" : "preflight", results, summary };
}
