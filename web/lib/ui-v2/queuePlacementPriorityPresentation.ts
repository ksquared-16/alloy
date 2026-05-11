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

/** Queue-level helper when placement partial evaluation applies (lane hint). */
export function buildPlacementProjectionQueueHint(
    diagnostics: WorkUnitPlacementQueueDiagnostics | undefined
): string | undefined {
    if (!diagnostics) return undefined;
    if (diagnostics.placement_positions_partial_evaluation !== true) return undefined;
    return "Some records may be outside this loaded page.";
}

/** Section heading for work-unit waitlist groups, e.g. `Infant Waitlist (2)` (emoji optional). */
export function formatPlacementGroupHeaderTitle(params: { emoji?: string; label: string; count: number }): string {
    const e = params.emoji?.trim();
    const prefix = e ? `${e} ` : "";
    return `${prefix}${params.label.trim()} (${params.count})`;
}

export type PlacementWaitlistGroupRowMode = "normal" | "header_only" | "skip_row";

/**
 * When waitlist placement sections are active and a group is collapsed: first row shows header only;
 * following rows in that group are skipped (hidden list items).
 */
export function placementWaitlistGroupRowMode(
    waitlistPlacementSections: boolean,
    sectionKey: string | undefined,
    collapsedKeys: ReadonlySet<string>,
    showGroup: boolean
): PlacementWaitlistGroupRowMode {
    if (!waitlistPlacementSections || !sectionKey?.trim()) return "normal";
    if (!collapsedKeys.has(sectionKey)) return "normal";
    return showGroup ? "header_only" : "skip_row";
}
