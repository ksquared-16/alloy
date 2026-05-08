/**
 * Queue row placement preview — parses QueueService `_placement_priority` (Card 6) for Admin V2 (Card 7).
 * Pass-through labels only; no domain ranking logic.
 */

import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";

const UNSPECIFIED_PROGRAM_SECTION = "Program / room not specified";

export function parseQueueRowPlacementPriorityVm(raw: unknown): QueueRowPlacementPriorityVm | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;

    const shadowMode = o.shadow_mode === true;

    if (o.evaluate_error === true) {
        const msg = typeof o.message === "string" ? o.message.trim() : "";
        return {
            priorityRuleLabel: "",
            programGroupSectionTitle: UNSPECIFIED_PROGRAM_SECTION,
            reasonLines: [],
            warningLines: [],
            shadowMode,
            evaluateError: true,
            errorMessage: msg || "Placement preview unavailable.",
        };
    }

    const priorityRuleLabel = typeof o.bucket_label === "string" ? o.bucket_label.trim() : "";
    if (!priorityRuleLabel) return undefined;

    const rawPg = o.program_room_group_label;
    const programGroupSectionTitle =
        rawPg != null && typeof rawPg === "string" && rawPg.trim()
            ? rawPg.trim()
            : UNSPECIFIED_PROGRAM_SECTION;

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
        priorityRuleLabel,
        programGroupSectionTitle,
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
        return "Waitlist priority preview — rows group by program / room on this loaded page; list order still follows this queue’s usual sort (not placement ordering). Not the full waitlist.";
    }
    return "Sorted by waitlist priority for records on this page — program / room group first, then priority rules within each group. Not the full waitlist beyond this page.";
}
