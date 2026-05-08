/**
 * Queue row placement preview — parses QueueService `_placement_priority` (Card 6) for Admin V2 (Card 7).
 * Pass-through labels only; no domain ranking logic.
 */

import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";

export function parseQueueRowPlacementPriorityVm(raw: unknown): QueueRowPlacementPriorityVm | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;

    const shadowMode = o.shadow_mode === true;

    if (o.evaluate_error === true) {
        const msg = typeof o.message === "string" ? o.message.trim() : "";
        return {
            cohortLabel: "",
            reasonLines: [],
            warningLines: [],
            shadowMode,
            evaluateError: true,
            errorMessage: msg || "Placement preview unavailable.",
        };
    }

    const cohortLabel = typeof o.bucket_label === "string" ? o.bucket_label.trim() : "";
    if (!cohortLabel) return undefined;

    const reasonLines: string[] = [];
    const reasons = o.reasons;
    if (Array.isArray(reasons)) {
        for (const r of reasons) {
            if (reasonLines.length >= 2) break;
            if (r != null && typeof r === "object" && !Array.isArray(r)) {
                const lab = typeof (r as { label?: unknown }).label === "string" ? (r as { label: string }).label.trim() : "";
                if (lab) reasonLines.push(lab);
            }
        }
    }

    const warningLines: string[] = [];
    const warnings = o.warnings;
    if (Array.isArray(warnings)) {
        for (const w of warnings) {
            if (warningLines.length >= 2) break;
            if (w != null && typeof w === "object" && !Array.isArray(w)) {
                const msg = typeof (w as { message?: unknown }).message === "string" ? (w as { message: string }).message.trim() : "";
                if (msg) warningLines.push(msg);
            }
        }
    }

    return {
        cohortLabel,
        reasonLines,
        warningLines,
        shadowMode,
    };
}

/** Queue-level helper line when `placement_projection_diagnostics` is present (placement enabled for lane). */
export function buildPlacementProjectionQueueHint(
    diagnostics: WorkUnitPlacementQueueDiagnostics | undefined
): string | undefined {
    if (!diagnostics) return undefined;
    if (diagnostics.shadow_mode) {
        return "Placement priority preview — list order is unchanged; not a full-waitlist sort.";
    }
    return "Sorted by placement priority for the records loaded on this page — not the full waitlist.";
}
