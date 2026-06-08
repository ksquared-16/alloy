/**
 * Card 11 — Structured, grep-friendly logs for canonical dual-write / mirror skips.
 * Search logs for prefix `[COMM_DUAL_WRITE]`.
 */

export const COMM_DUAL_WRITE_LOG_PREFIX = "[COMM_DUAL_WRITE]";

export function logCommDualWrite(details: Record<string, unknown>): void {
    console.log(
        COMM_DUAL_WRITE_LOG_PREFIX,
        JSON.stringify({ ts: new Date().toISOString(), ...details })
    );
}

export function orgIdTail(orgId: string | null | undefined): string | null {
    const s = (orgId ?? "").trim();
    if (!s) return null;
    if (s.length <= 8) return s;
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
