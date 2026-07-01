/**
 * Resolve human labels for id/key-backed layout runtime fields in display mode.
 */

import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import { resolveOpportunityLeadLocationFields } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RefKeys that prefer hydrated label columns over aliased id reads. */
export const LAYOUT_RUNTIME_DISPLAY_PREFERRED_REF_KEYS = new Set([
    "child.location",
    "child.program",
    "child.room",
    "child.schedule",
    "child.status",
    "opportunity.location",
]);

const ID_TO_LABEL_COMPANION: Readonly<Record<string, string>> = {
    "inquiry_child.location_id": "child.location",
    "inquiry_child.desired_program_type": "child.program",
    "inquiry_child.program_room_cohort_key": "child.room",
    "inquiry_child.desired_schedule_type": "child.schedule",
    "inquiry_child.outcome_status_key": "child.status",
    "opportunity.location_id": "opportunity.location",
};

export function isLayoutRuntimeOpaqueIdValue(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (UUID_RE.test(trimmed)) return true;
    return /^[a-z][a-z0-9_]*$/i.test(trimmed) && trimmed.includes("_") && trimmed.length > 6;
}

function readRecordLabel(record: ProofRuntimeRecord | undefined, key: string): string | null {
    if (!record) return null;
    const raw = record[key];
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text || text === "—" || isLayoutRuntimeOpaqueIdValue(text)) return null;
    return text;
}

function resolveOpportunityLocationDisplayLabel(record: ProofRuntimeRecord | undefined): string | null {
    if (!record) return null;
    return (
        readRecordLabel(record, "opportunity.location")
        ?? readRecordLabel(record, "_location_label")
        ?? readRecordLabel(record, "_location_name")
        ?? (() => {
            const lead = resolveOpportunityLeadLocationFields(record);
            return lead.locationLabel.trim() ? lead.locationLabel : null;
        })()
    );
}

function resolveChildLocationDisplayLabel(
    row: ProofRuntimeRecord | undefined,
    anchorRecord: ProofRuntimeRecord | undefined,
): string | null {
    const fromRow =
        readRecordLabel(row, "child.location")
        ?? readRecordLabel(row, "inquiry_child.location_id");
    if (fromRow) return fromRow;
    return resolveOpportunityLocationDisplayLabel(anchorRecord ?? row);
}

/** Resolve display text for one field value — prefer labels over raw ids/keys. */
export function resolveLayoutRuntimeFieldDisplayLabel(input: {
    refKey: string;
    rawValue: string;
    record?: ProofRuntimeRecord;
    row?: ProofRuntimeRecord;
    anchorRecord?: ProofRuntimeRecord;
    renderHint?: string | null;
}): string {
    const trimmed = input.rawValue.trim();
    const record = input.row ?? input.record;
    const normalized = normalizeRefKeyOnRead(input.refKey.trim());

    if (normalized === "opportunity.location_id" || normalized === "opportunity.location") {
        const fromOpp = resolveOpportunityLocationDisplayLabel(record);
        if (fromOpp) return fromOpp;
    }

    if (normalized === "inquiry_child.location_id" || input.refKey.trim() === "child.location") {
        const fromChild = resolveChildLocationDisplayLabel(record, input.anchorRecord ?? input.record);
        if (fromChild) return fromChild;
    }

    if (!trimmed || trimmed === "—") {
        if (normalized === "opportunity.location_id" || normalized === "opportunity.location") {
            const fromOpp = resolveOpportunityLocationDisplayLabel(record);
            if (fromOpp) return fromOpp;
        }
        if (normalized === "inquiry_child.location_id" || input.refKey.trim() === "child.location") {
            const fromChild = resolveChildLocationDisplayLabel(record, input.anchorRecord ?? input.record);
            if (fromChild) return fromChild;
        }
        return input.rawValue;
    }

    const statusLabel = formatLayoutRuntimeStatusLabel(trimmed, {
        refKey: normalized,
        renderHint: input.renderHint,
    });
    if (statusLabel && statusLabel !== trimmed) return statusLabel;

    const companion = ID_TO_LABEL_COMPANION[normalized];
    if (companion) {
        const fromCompanion = readRecordLabel(record, companion);
        if (fromCompanion) return fromCompanion;
    }

    if (normalized === "opportunity.location_id" || normalized === "opportunity.location") {
        const fromOpp = resolveOpportunityLocationDisplayLabel(record);
        if (fromOpp) return fromOpp;
    }

    if (normalized === "inquiry_child.location_id" || input.refKey.trim() === "child.location") {
        const fromChild = resolveChildLocationDisplayLabel(record, input.anchorRecord ?? input.record);
        if (fromChild) return fromChild;
    }

    const control = resolveLayoutRuntimeFieldControl(normalized);
    if (control.controlType === "select" && isLayoutRuntimeOpaqueIdValue(trimmed)) {
        return trimmed;
    }

    return input.rawValue;
}

export type LayoutRuntimeSelectOption = { value: string; label: string };

/** Resolve label from a select option catalog when raw value is an opaque id/key. */
export function resolveLayoutRuntimeSelectOptionLabel(
    rawValue: string,
    options: LayoutRuntimeSelectOption[],
): string {
    const trimmed = rawValue.trim();
    if (!trimmed) return rawValue;
    const match = options.find((opt) => opt.value === trimmed);
    return match?.label?.trim() || rawValue;
}
