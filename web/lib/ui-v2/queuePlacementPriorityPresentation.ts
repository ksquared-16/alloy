/**
 * Queue row placement preview — parses QueueService `_placement_priority` (Card 6) for Admin V2 (Card 7).
 * Pass-through labels only; no domain ranking logic.
 */

import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";

export const UNSPECIFIED_PROGRAM_SECTION = "Program / room not specified";

const MAX_REASON_LEN = 120;

/** Section header text, e.g. `Toddler Waitlist`. */
export function formatPlacementWaitlistSectionLabel(programGroupSectionTitle: string): string {
    const t = programGroupSectionTitle.trim();
    if (!t || t === UNSPECIFIED_PROGRAM_SECTION) return "Program waitlist";
    return `${t} Waitlist`;
}

/** Compact subtitle next to `#n`, e.g. `Toddler waitlist`. */
export function formatPlacementWaitlistProgramShortLabel(programGroupSectionTitle: string): string {
    const t = programGroupSectionTitle.trim();
    if (!t || t === UNSPECIFIED_PROGRAM_SECTION) return "Program waitlist";
    return `${t} waitlist`;
}

function truncateReason(s: string): string {
    const t = s.trim();
    if (t.length <= MAX_REASON_LEN) return t;
    return `${t.slice(0, MAX_REASON_LEN - 1)}…`;
}

export function parseQueueRowPlacementPriorityVm(raw: unknown): QueueRowPlacementPriorityVm | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;

    const shadowMode = o.shadow_mode === true;

    if (o.evaluate_error === true) {
        const msg = typeof o.message === "string" ? o.message.trim() : "";
        return {
            priorityRuleLabel: "",
            programGroupSectionTitle: UNSPECIFIED_PROGRAM_SECTION,
            waitlistProgramShortLabel: "Program waitlist",
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

    const waitlistProgramShortLabel = formatPlacementWaitlistProgramShortLabel(programGroupSectionTitle);

    let priorityReasonShort: string | undefined;
    const reasons = o.reasons;
    if (Array.isArray(reasons)) {
        for (const r of reasons) {
            if (r != null && typeof r === "object" && !Array.isArray(r)) {
                const lab = typeof (r as { label?: unknown }).label === "string" ? (r as { label: string }).label.trim() : "";
                if (lab) {
                    priorityReasonShort = truncateReason(lab);
                    break;
                }
            }
        }
    }

    const warningLines: string[] = [];
    const warnings = o.warnings;
    if (Array.isArray(warnings)) {
        for (const w of warnings) {
            if (warningLines.length >= 1) break;
            if (w != null && typeof w === "object" && !Array.isArray(w)) {
                const msg = typeof (w as { message?: unknown }).message === "string" ? (w as { message: string }).message.trim() : "";
                if (msg) warningLines.push(msg);
            }
        }
    }

    let scopedWaitlistPosition: number | undefined;
    let scopedWaitlistPositionLabel: string | undefined;
    if (!shadowMode) {
        const pos = o.scoped_waitlist_position;
        if (typeof pos === "number" && Number.isFinite(pos) && Number.isInteger(pos) && pos >= 1) {
            scopedWaitlistPosition = pos;
            const sl =
                typeof o.scoped_waitlist_position_label === "string" ? o.scoped_waitlist_position_label.trim() : "";
            if (sl) scopedWaitlistPositionLabel = sl;
        }
    }

    return {
        priorityRuleLabel,
        programGroupSectionTitle,
        waitlistProgramShortLabel,
        ...(priorityReasonShort ? { priorityReasonShort } : {}),
        reasonLines: priorityReasonShort ? [priorityReasonShort] : [],
        warningLines,
        shadowMode,
        ...(scopedWaitlistPosition != null ? { scopedWaitlistPosition } : {}),
        ...(scopedWaitlistPositionLabel ? { scopedWaitlistPositionLabel } : {}),
    };
}

/** Queue-level helper line when `placement_projection_diagnostics` is present (placement enabled for lane). */
export function buildPlacementProjectionQueueHint(
    diagnostics: WorkUnitPlacementQueueDiagnostics | undefined
): string | undefined {
    if (!diagnostics) return undefined;

    const partial = diagnostics.placement_positions_partial_evaluation === true;

    if (diagnostics.shadow_mode) {
        let s =
            "Waitlist priority is grouped by program for these loaded records. Row order follows the queue sort until placement sort is enabled.";
        if (partial) s += " Some records may be outside this loaded page.";
        return s;
    }

    let s = "Waitlist positions are grouped by program and shown for loaded records.";
    if (partial) s += " Some records may be outside this loaded page.";
    return s;
}
