"use client";

import { ADMIN_V2_SIDEBAR_COLLAPSED_KEY } from "@/lib/adminV2/navigation/adminV2SidebarCollapsed";
import {
    BOS_FLOATING_GEOMETRY_KEY,
    BOS_FLOATING_POSITION_KEY,
    BOS_PRESENTATION_STATE_KEY,
    BOS_PRESENTATION_WIDTH_KEY,
} from "@/lib/bos/bosPresentationPreference";
import { BOS_STARTERS_EXPANDED_KEY } from "@/lib/bos/bosFloatingGeometry";
import { clearAllResumeSessions } from "@/lib/adminV2/runtime/resumeSession";

/**
 * sessionStorage keys preserved across idle logout — durable operator preferences only.
 * Everything else in sessionStorage is treated as volatile runtime / operational-mode state.
 * (localStorage durable prefs such as `configurationModeLastSurface` are never touched here.)
 */
export const DURABLE_SESSION_PREF_KEYS: readonly string[] = [
    ADMIN_V2_SIDEBAR_COLLAPSED_KEY,
    BOS_PRESENTATION_STATE_KEY,
    BOS_PRESENTATION_WIDTH_KEY,
    BOS_FLOATING_GEOMETRY_KEY,
    BOS_FLOATING_POSITION_KEY,
    BOS_STARTERS_EXPANDED_KEY,
];

/**
 * Clear volatile runtime / session-restore / resume state. Used on idle logout (and reusable for
 * org switch / sign-out). Preserves durable preferences; never writes to durable storage.
 */
export function clearVolatileRuntimeSessionState(): void {
    clearAllResumeSessions();

    try {
        if (typeof sessionStorage === "undefined") return;
        const preserve = new Set<string>(DURABLE_SESSION_PREF_KEYS);
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
            const key = sessionStorage.key(i);
            if (key && !preserve.has(key)) toRemove.push(key);
        }
        toRemove.forEach((key) => sessionStorage.removeItem(key));
    } catch {
        /* non-fatal */
    }
}
