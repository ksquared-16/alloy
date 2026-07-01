/**
 * Core operational work UX (drawer strip, My Tasks, record create modal).
 * Not gated by Task Assist — manual work is platform functionality.
 *
 * Disable with `NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED=false` if needed.
 */
export function isOperationalWorkV1Enabled(): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED?.trim().toLowerCase();
    if (v === "false" || v === "0") return false;
    return true;
}
