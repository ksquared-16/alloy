import { parseQueueRowGrainContext } from "@/lib/queues/queueRowGrainContext";
import type { WorkUnitQueueRecordFilterFacets } from "@/lib/workspace/workUnitQueueRecordFilterTypes";

function readString(raw: unknown): string {
    return typeof raw === "string" ? raw.trim() : "";
}

function uniqOptions(values: Array<{ value: string; label: string }>): Array<{ value: string; label: string }> {
    const seen = new Set<string>();
    const out: Array<{ value: string; label: string }> = [];
    for (const v of values) {
        const key = v.value.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ value: v.value.trim(), label: v.label.trim() || v.value.trim() });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

function readRowStatusKey(row: Record<string, unknown>): string {
    const grain = parseQueueRowGrainContext(row);
    if (grain.rowGrain === "child") {
        return (
            grain.childLifecycleStatus ??
            readString(row.child_lifecycle_status) ??
            readString((row._child_lifecycle_grain_row as { child_lifecycle_status?: unknown } | undefined)?.child_lifecycle_status)
        );
    }
    if (grain.rowGrain === "candidate") {
        const waitlist = row._placement_waitlist_row;
        if (waitlist != null && typeof waitlist === "object" && !Array.isArray(waitlist)) {
            const bucket = readString((waitlist as Record<string, unknown>).bucket);
            if (bucket) return bucket;
        }
    }
    return readString(row.status_key);
}

function readRowStatusLabel(row: Record<string, unknown>, statusKey: string): string {
    const display = readString(row._status_display);
    if (display) return display;
    return statusKey;
}

function readRowSite(row: Record<string, unknown>): { value: string; label: string } | null {
    const locId = readString(row.location_id);
    const locLabel = readString(row._location_label);
    if (locId) return { value: locId.toLowerCase(), label: locLabel || locId };
    if (locLabel) return { value: locLabel.toLowerCase(), label: locLabel };
    return null;
}

function readRowProgram(row: Record<string, unknown>): string {
    const requested = readString(row._requested_program);
    if (requested) return requested;
    const waitlist = row._placement_waitlist_row;
    if (waitlist != null && typeof waitlist === "object" && !Array.isArray(waitlist)) {
        const cohort = readString((waitlist as Record<string, unknown>).program_room_group_label);
        if (cohort) return cohort;
    }
    const childRow = row._child_lifecycle_grain_row;
    if (childRow != null && typeof childRow === "object" && !Array.isArray(childRow)) {
        const program = readString((childRow as Record<string, unknown>).program_line);
        if (program) return program;
    }
    return "";
}

function readRowOwner(row: Record<string, unknown>): { value: string; label: string } | null {
    const assigned = readString(row.assigned_to) || readString(row.assigned_vendor_id);
    if (assigned) return { value: assigned, label: assigned };
    const md = row.metadata;
    if (md != null && typeof md === "object" && !Array.isArray(md)) {
        const owner =
            readString((md as Record<string, unknown>).assigned_to) ||
            readString((md as Record<string, unknown>).assigned_owner_id) ||
            readString((md as Record<string, unknown>).owner_user_id);
        const ownerLabel = readString((md as Record<string, unknown>).assigned_to_label);
        if (owner) return { value: owner, label: ownerLabel || owner };
    }
    return null;
}

function readAttentionReasonCodes(row: Record<string, unknown>): string[] {
    const codes: string[] = [];
    const primary = readString(row._attention_reason);
    if (primary) codes.push(primary);
    const details = row._attention_reasons_detail;
    if (Array.isArray(details)) {
        for (const d of details) {
            if (d == null || typeof d !== "object") continue;
            const code = readString((d as { code?: unknown }).code);
            if (code) codes.push(code);
        }
    }
    return codes;
}

/** Derive facet options from loaded queue row previews (current page). */
export function extractWorkUnitQueueRecordFilterFacets(
    rows: Record<string, unknown>[]
): Pick<
    WorkUnitQueueRecordFilterFacets,
    "statusOptions" | "siteOptions" | "programOptions" | "ownerOptions" | "attentionReasonOptions"
> {
    const statusOptions: Array<{ value: string; label: string }> = [];
    const siteOptions: Array<{ value: string; label: string }> = [];
    const programOptions: Array<{ value: string; label: string }> = [];
    const ownerOptions: Array<{ value: string; label: string }> = [];
    const attentionReasonOptions: Array<{ value: string; label: string }> = [];

    for (const row of rows) {
        const statusKey = readRowStatusKey(row);
        if (statusKey) {
            statusOptions.push({ value: statusKey, label: readRowStatusLabel(row, statusKey) });
        }
        const site = readRowSite(row);
        if (site) siteOptions.push(site);
        const program = readRowProgram(row);
        if (program) programOptions.push({ value: program.toLowerCase(), label: program });
        const owner = readRowOwner(row);
        if (owner) ownerOptions.push(owner);
        for (const code of readAttentionReasonCodes(row)) {
            const label = readString(row._attention_reason_label) || code;
            attentionReasonOptions.push({ value: code, label });
        }
    }

    return {
        statusOptions: uniqOptions(statusOptions),
        siteOptions: uniqOptions(siteOptions),
        programOptions: uniqOptions(programOptions),
        ownerOptions: uniqOptions(ownerOptions),
        attentionReasonOptions: uniqOptions(attentionReasonOptions),
    };
}
