/** True when a schedule workflow key represents a canceled visit (UI must not PATCH this; use POST …/cancel). */
export function isScheduleCanceledStatusKey(statusKey: string | null | undefined): boolean {
    const k = String(statusKey ?? "").trim().toLowerCase();
    return k === "canceled" || k === "cancelled";
}
