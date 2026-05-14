/**
 * Client-side feature gate for Task Assist V1 drawer UI (Card 5).
 * Enable with `NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED=true` in the web app env.
 */
export function isTaskAssistV1UiEnabled(): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1";
}
