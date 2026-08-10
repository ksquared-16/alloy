/**
 * Human-facing labels for Focus Panel chips, status tokens, and header context.
 * Raw status keys must never render in operator UI.
 */

import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import {
    OPPORTUNITY_DISPLAY_NO_LOCATION_LABEL,
    opportunityDisplayLocationFromRecord,
    opportunityDisplayLocationLabel,
} from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import { effectiveStagesFromInquiryChildren } from "@/lib/process/definitions/enrollment/loadEffectiveEnrollmentStagesByOpportunity";
import { composeLocationRollup } from "@/lib/process/engine/effectiveProcessPosition";

const KNOWN_CHIP_LABELS: Record<string, string> = {
    new_inquiry: "New Lead",
    new: "New Lead",
    inquiry: "Inquiry",
    lead: "Lead",
    open: "Open",
    due: "Due",
    blocked: "Blocked",
    ready: "Ready",
    "at-risk": "At Risk",
    at_risk: "At Risk",
    done: "Done",
    scheduled: "Scheduled",
    enrolling: "Enrolling",
    declined: "Declined",
    active: "Active",
};

function titleCaseWords(value: string): string {
    return value
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

/** Format a chip/status token for operator display (title case). */
export function formatFocusPanelChipLabel(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
    const known = KNOWN_CHIP_LABELS[normalized] ?? KNOWN_CHIP_LABELS[trimmed.toLowerCase()];
    if (known) return known;

    if (/^[a-z0-9_-]+$/.test(trimmed)) {
        return titleCaseWords(trimmed.replace(/_/g, " "));
    }

    return trimmed;
}

/** Title Case chip label for Focus Panel status chips (At Risk, Blocked, Ready). */
export function formatFocusPanelChipLabelDisplay(value: string | null | undefined): string | null {
    return formatFocusPanelChipLabel(value);
}

/** @deprecated Use formatFocusPanelChipLabelDisplay — chips are Title Case, not ALL CAPS. */
export function formatFocusPanelChipLabelUppercase(value: string | null | undefined): string | null {
    return formatFocusPanelChipLabel(value);
}

const DEBUG_MISSION_PATTERNS = [/mission proof/i, /visual review/i, /visual review capture/i];

export function isFocusPanelDebugMissionCopy(text: string | null | undefined): boolean {
    if (!text?.trim()) return false;
    return DEBUG_MISSION_PATTERNS.some((pattern) => pattern.test(text));
}

function formatMissionSentence(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export type FocusPanelMissionDisplay = {
    value: string;
    supporting?: string | null;
};

/** Operator-facing mission — excludes debug/config copy and primary-action duplication upstream. */
export function resolveFocusPanelMissionDisplay(input: {
    perspectiveMission?: string | null;
    stagePurpose?: string | null;
    stageContextPurpose?: string | null;
}): FocusPanelMissionDisplay | null {
    for (const raw of [
        input.perspectiveMission,
        input.stagePurpose,
        input.stageContextPurpose,
    ]) {
        const text = raw?.trim();
        if (!text || isFocusPanelDebugMissionCopy(text)) continue;
        return { value: formatMissionSentence(text) };
    }
    return null;
}

export function normalizeFocusPanelActionLabel(label: string | null | undefined): string {
    return (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when header primary CTA would duplicate the mission line or card mission. */
export function focusPanelHeaderActionDuplicatesMission(
    missionValue: string | null | undefined,
    actionLabel: string | null | undefined,
): boolean {
    const mission = normalizeFocusPanelActionLabel(missionValue);
    const action = normalizeFocusPanelActionLabel(actionLabel);
    if (!mission || !action) return false;
    if (mission === action) return true;
    if (mission.includes(action) || action.includes(mission)) return true;
    const actionStem = action.split(" ").slice(0, 2).join(" ");
    return actionStem.length >= 4 && mission.includes(actionStem);
}

/** Process / business-process label for context row (Enrollment, not entity noun). */
export function resolveFocusPanelProcessLabel(record: Record<string, unknown>): string | null {
    return (
        trimDisplay(record._work_unit_label) ??
        trimDisplay(record._pipeline_name) ??
        null
    );
}

function trimDisplay(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Format general status/display text — preserves already-human labels. */
export function formatFocusPanelDisplayLabel(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (/^[a-z0-9_-]+$/.test(trimmed)) {
        return formatFocusPanelChipLabel(trimmed);
    }
    return trimmed;
}

/** Join context segments with middle dot, skipping exact duplicates. */
export function buildFocusPanelContextLine(labels: Array<string | null | undefined>): string | null {
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const raw of labels) {
        const text = formatFocusPanelDisplayLabel(raw);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        parts.push(text);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}

export type FocusPanelStatusTone = "ready" | "blocked" | "at-risk" | "due" | "done" | "neutral";

export type FocusPanelContextChipKind = "status" | "process" | "location";

export type FocusPanelContextChip = {
    label: string;
    kind: FocusPanelContextChipKind;
    tone?: FocusPanelStatusTone;
};

/** Map raw status keys to System 5 chip tone classes. */
export function resolveFocusPanelStatusTone(statusKey: string | null | undefined): FocusPanelStatusTone {
    const key = (statusKey ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (["ready", "active", "enrolling", "scheduled"].includes(key)) return "ready";
    if (["blocked", "declined"].includes(key)) return "blocked";
    if (["at_risk"].includes(key)) return "at-risk";
    if (["due", "open", "new_inquiry", "new", "inquiry", "lead"].includes(key)) return "due";
    if (["done", "closed", "withdrawn"].includes(key)) return "done";
    return "neutral";
}

/** Location chip when a real site/location is known — skips placeholder copy.
 * Uses child-site aggregate (with lead inherit) so siblings at South + North surface as multi.
 * Prefers Effective Process Position location rollup when participant sites diverge.
 */
export function resolveFocusPanelLocationChip(record: Record<string, unknown>): string | null {
    const fromRow =
        typeof record._effective_location_rollup_label === "string"
            ? record._effective_location_rollup_label.trim()
            : "";
    if (fromRow) return fromRow;

    const fromChildren = effectiveStagesFromInquiryChildren(record);
    const locRollup = composeLocationRollup(fromChildren.locationIds);
    if (locRollup.compactLabel) return locRollup.compactLabel;

    const resolved = opportunityDisplayLocationFromRecord(record);
    if (resolved.kind === "none") return null;
    const label = resolved.label?.trim();
    if (!label || label === OPPORTUNITY_DISPLAY_NO_LOCATION_LABEL) return null;
    return label;
}

/**
 * Operator-facing Effective Process Position stage rollup for the Focus Panel header.
 * Derived from participant stages already on the record — never writes stage.
 */
export function resolveFocusPanelEffectiveStageChip(record: Record<string, unknown>): string | null {
    const attached =
        typeof record._effective_stage_rollup_label === "string"
            ? record._effective_stage_rollup_label.trim()
            : "";
    if (attached) {
        return formatFocusPanelChipLabel(
            attached
                .split(" · ")
                .map((part) => formatFocusPanelChipLabel(part) ?? part)
                .join(" · "),
        );
    }
    const derived = effectiveStagesFromInquiryChildren(record);
    if (!derived.stageRollupLabel) return null;
    const parts = derived.stageRollupLabel.split(" · ");
    if (parts.length >= 3 || derived.stageRollupLabel.endsWith("active stages")) {
        return derived.stageRollupLabel;
    }
    return parts.map((p) => formatFocusPanelChipLabel(p) ?? p).join(" · ");
}

/** Seed-backed header chips for cold Focus Panel open (queue row → panel). */
export function buildFocusPanelContextChipsFromQueuePreviewSeed(
    seed: OpportunityDrawerQueuePreviewSeed | null | undefined,
): FocusPanelContextChip[] {
    if (!seed) return [];
    return buildFocusPanelContextChips({
        statusLabel: formatFocusPanelDisplayLabel(seed.statusLabel) ?? seed.statusLabel ?? null,
        statusKey: seed.statusKey ?? null,
        processLabel: formatFocusPanelDisplayLabel(seed.stageLabel) ?? seed.stageLabel ?? null,
        locationLabel: seed.locationLabel ?? null,
    });
}

/** Header identity summary from queue preview seed — contact, attention, or work context. */
export function resolveQueuePreviewSeedIdentitySummaryLine(
    seed: OpportunityDrawerQueuePreviewSeed | null | undefined,
): string | null {
    if (!seed) return null;
    const headline = seed.operTrustHeadline?.trim();
    if (headline) return headline;
    return seed.subtitle?.trim() || null;
}

/** Build deduplicated context chips for the subject identity block. */
export function buildFocusPanelContextChips(input: {
    statusLabel: string | null;
    statusKey?: string | null;
    processLabel?: string | null;
    locationLabel?: string | null;
}): FocusPanelContextChip[] {
    const chips: FocusPanelContextChip[] = [];
    const seen = new Set<string>();

    const push = (chip: FocusPanelContextChip) => {
        const key = chip.label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        chips.push(chip);
    };

    const status = input.statusLabel?.trim();
    if (status) {
        push({
            label: status,
            kind: "status",
            tone: resolveFocusPanelStatusTone(input.statusKey ?? status),
        });
    }

    const process = input.processLabel?.trim();
    if (process) {
        push({ label: process, kind: "process" });
    }

    const location = input.locationLabel?.trim();
    if (location) {
        push({ label: location, kind: "location" });
    }

    return chips;
}

/** Mission line — readable operator command phrasing. */
export function formatFocusPanelMissionLine(
    mission: string | null | undefined,
    location?: string | null,
): string | null {
    const missionText = mission?.trim();
    const locationText = location?.trim();
    if (!missionText && !locationText) return null;
    if (missionText && locationText) {
        return `Mission: ${missionText} · ${locationText}`;
    }
    if (missionText) return `Mission: ${missionText}`;
    return `Mission: ${locationText}`;
}
