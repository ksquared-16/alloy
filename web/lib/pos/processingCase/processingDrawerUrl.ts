/**
 * POS-FP4 — thin, processing-specific drawer URL-sync.
 *
 * Deliberately NOT a universal drawer framework (per FP4 guidance — generalize only
 * if a second consumer appears). Shallow URL sync on the `/admin/processing` route:
 * opening a case adds `/:caseId`, closing removes it, via `history.replaceState`
 * (no route transition, no queue remount). Pure build/parse helpers are testable.
 */

import { CANONICAL_ADMIN_BASE } from "@/lib/admin/canonicalAdminRoutes";

const PROCESSING_BASE = `${CANONICAL_ADMIN_BASE}/processing`;

export function processingQueueHref(): string {
    return PROCESSING_BASE;
}

export function processingCaseDrawerHref(caseId: string): string {
    return `${PROCESSING_BASE}/${caseId}`;
}

/** Extract a `:caseId` from `/admin/processing/:caseId` (also accepts the transitional `/adminV2` alias path). */
export function parseProcessingCaseIdFromPath(pathname: string): string | null {
    const trimmed = pathname.trim().replace(/\/+$/, "");
    const normalized = trimmed.replace(/^\/adminV2\b/, CANONICAL_ADMIN_BASE);
    const prefix = `${PROCESSING_BASE}/`;
    if (!normalized.startsWith(prefix)) return null;
    const rest = normalized.slice(prefix.length);
    if (!rest || rest.includes("/")) return null;
    return rest;
}

/** Browser-only: open the drawer by shallow URL sync (no route transition / remount). */
export function openProcessingCaseDrawerUrl(caseId: string): void {
    if (typeof window === "undefined") return;
    window.history.replaceState(window.history.state, "", processingCaseDrawerHref(caseId));
}

/** Browser-only: close the drawer, returning the URL to the queue. */
export function closeProcessingCaseDrawerUrl(): void {
    if (typeof window === "undefined") return;
    window.history.replaceState(window.history.state, "", processingQueueHref());
}
