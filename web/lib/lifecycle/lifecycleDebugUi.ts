/**
 * Lifecycle / workspace debug panels are hidden unless explicitly enabled.
 * Set NEXT_PUBLIC_LIFECYCLE_DEBUG_UI=1 in .env.local for engineering diagnostics.
 */

export function isLifecycleDebugUiEnabled(): boolean {
    return process.env.NEXT_PUBLIC_LIFECYCLE_DEBUG_UI === "1";
}
