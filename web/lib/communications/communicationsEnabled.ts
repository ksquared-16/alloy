/** Opt-in canonical mirror from workflows → communication_* (+ message_queued). Default off for safe rollout. */
export function isCommunicationCanonicalDualWriteEnabled(): boolean {
    const v = (process.env.COMMUNICATION_DUAL_WRITE ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}
