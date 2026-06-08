import { parseQueueRowGrainContext } from "@/lib/queues/queueRowGrainContext";
import type {
    WorkUnitQueueRecordFilterApplyResult,
    WorkUnitQueueRecordFilterState,
} from "@/lib/workspace/workUnitQueueRecordFilterTypes";

function readString(raw: unknown): string {
    return typeof raw === "string" ? raw.trim() : "";
}

function readMetadata(row: Record<string, unknown>): Record<string, unknown> | null {
    const md = row.metadata;
    return md != null && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null;
}

function parseIsoMs(raw: unknown): number | null {
    const s = readString(raw);
    if (!s) return null;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
}

function parseYmdMs(raw: unknown): number | null {
    const s = readString(raw);
    if (!s) return null;
    const ms = Date.parse(`${s.slice(0, 10)}T12:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
}

function rowUpdatedMs(row: Record<string, unknown>): number | null {
    return parseIsoMs(row.updated_at) ?? parseIsoMs(row.created_at);
}

function rowSearchHaystack(row: Record<string, unknown>): string {
    const parts = [
        row.name,
        row.title,
        row._customer_name,
        row._primary_contact_line,
        row._child_display_name,
        row._primary_phone,
        row._primary_email,
        row._requested_program,
        row._location_label,
        row._status_display,
        row.status_key,
    ];
    const waitlist = row._placement_waitlist_row;
    if (waitlist != null && typeof waitlist === "object" && !Array.isArray(waitlist)) {
        const w = waitlist as Record<string, unknown>;
        parts.push(w.child_display_name, w.family_display_name, w.program_room_group_label);
    }
    return parts
        .map((p) => readString(p).toLowerCase())
        .filter(Boolean)
        .join(" ");
}

function rowStatusKey(row: Record<string, unknown>): string {
    const grain = parseQueueRowGrainContext(row);
    if (grain.rowGrain === "child") {
        return (
            readString(grain.childLifecycleStatus) ||
            readString(row.child_lifecycle_status) ||
            ""
        ).toLowerCase();
    }
    if (grain.rowGrain === "candidate") {
        const waitlist = row._placement_waitlist_row;
        if (waitlist != null && typeof waitlist === "object" && !Array.isArray(waitlist)) {
            return readString((waitlist as Record<string, unknown>).bucket).toLowerCase();
        }
    }
    return readString(row.status_key).toLowerCase();
}

function rowSiteKey(row: Record<string, unknown>): string {
    const id = readString(row.location_id);
    if (id) return id.toLowerCase();
    return readString(row._location_label).toLowerCase();
}

function rowProgramHaystack(row: Record<string, unknown>): string {
    const requested = readString(row._requested_program).toLowerCase();
    if (requested) return requested;
    const waitlist = row._placement_waitlist_row;
    if (waitlist != null && typeof waitlist === "object" && !Array.isArray(waitlist)) {
        return readString((waitlist as Record<string, unknown>).program_room_group_label).toLowerCase();
    }
    const childRow = row._child_lifecycle_grain_row;
    if (childRow != null && typeof childRow === "object" && !Array.isArray(childRow)) {
        return readString((childRow as Record<string, unknown>).program_line).toLowerCase();
    }
    return "";
}

function rowOwnerKey(row: Record<string, unknown>): string {
    const direct = readString(row.assigned_to) || readString(row.assigned_vendor_id);
    if (direct) return direct.toLowerCase();
    const md = readMetadata(row);
    if (!md) return "";
    return (
        readString(md.assigned_to) ||
        readString(md.assigned_owner_id) ||
        readString(md.owner_user_id)
    ).toLowerCase();
}

function rowMatchesAttentionReason(row: Record<string, unknown>, code: string): boolean {
    const want = code.trim();
    if (!want) return true;
    const primary = readString(row._attention_reason);
    if (primary === want) return true;
    const details = row._attention_reasons_detail;
    if (Array.isArray(details)) {
        return details.some(
            (d) =>
                d != null &&
                typeof d === "object" &&
                readString((d as { code?: unknown }).code) === want
        );
    }
    return false;
}

function rowInDateRange(row: Record<string, unknown>, from: string, to: string): boolean {
    const fromMs = parseYmdMs(from);
    const toMs = parseYmdMs(to);
    if (fromMs == null && toMs == null) return true;
    const rowMs = rowUpdatedMs(row);
    if (rowMs == null) return false;
    const dayMs = Date.UTC(
        new Date(rowMs).getUTCFullYear(),
        new Date(rowMs).getUTCMonth(),
        new Date(rowMs).getUTCDate(),
        12,
        0,
        0
    );
    if (fromMs != null && dayMs < fromMs) return false;
    if (toMs != null && dayMs > toMs) return false;
    return true;
}

function readSortTuple(row: Record<string, unknown>): Array<string | number | null> | null {
    const v2 = row.__placement_v2_sort_tuple;
    if (Array.isArray(v2)) return v2 as Array<string | number | null>;
    const v1 = row.__placement_sort_tuple;
    if (Array.isArray(v1)) return v1 as Array<string | number | null>;
    return null;
}

function compareSortTuples(a: Array<string | number | null>, b: Array<string | number | null>): number {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? null;
        const bv = b[i] ?? null;
        if (av === bv) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return av - bv;
        return String(av).localeCompare(String(bv));
    }
    return 0;
}

function sortRows(rows: Record<string, unknown>[], sort: WorkUnitQueueRecordFilterState["sort"]): Record<string, unknown>[] {
    const out = [...rows];
    out.sort((a, b) => {
        switch (sort) {
            case "oldest": {
                const am = rowUpdatedMs(a) ?? 0;
                const bm = rowUpdatedMs(b) ?? 0;
                return am - bm;
            }
            case "follow_up_due": {
                const amd = readMetadata(a);
                const bmd = readMetadata(b);
                const am = parseIsoMs(amd?.next_follow_up_at) ?? Number.MAX_SAFE_INTEGER;
                const bm = parseIsoMs(bmd?.next_follow_up_at) ?? Number.MAX_SAFE_INTEGER;
                return am - bm;
            }
            case "tour_date": {
                const amd = readMetadata(a);
                const bmd = readMetadata(b);
                const am = parseYmdMs(amd?.tour_date) ?? Number.MAX_SAFE_INTEGER;
                const bm = parseYmdMs(bmd?.tour_date) ?? Number.MAX_SAFE_INTEGER;
                return am - bm;
            }
            case "priority_order": {
                const ta = readSortTuple(a);
                const tb = readSortTuple(b);
                if (ta && tb) return compareSortTuples(ta, tb);
                if (ta) return -1;
                if (tb) return 1;
                const am = rowUpdatedMs(a) ?? 0;
                const bm = rowUpdatedMs(b) ?? 0;
                return bm - am;
            }
            case "newest":
            default: {
                const am = rowUpdatedMs(a) ?? 0;
                const bm = rowUpdatedMs(b) ?? 0;
                return bm - am;
            }
        }
    });
    return out;
}

/** Apply client-side record filters + sort on loaded queue previews. Membership unchanged. */
export function applyWorkUnitQueueRecordFilters(
    rows: Record<string, unknown>[],
    filters: WorkUnitQueueRecordFilterState
): WorkUnitQueueRecordFilterApplyResult {
    const totalLoaded = rows.length;
    const search = filters.search.trim().toLowerCase();
    const status = filters.statusKey.trim().toLowerCase();
    const site = filters.siteKey.trim().toLowerCase();
    const program = filters.program.trim().toLowerCase();
    const owner = filters.ownerKey.trim().toLowerCase();
    const attention = filters.attentionReasonCode.trim();

    let items = rows.filter((row) => {
        if (search && !rowSearchHaystack(row).includes(search)) return false;
        if (status && rowStatusKey(row) !== status) return false;
        if (!rowInDateRange(row, filters.dateFrom, filters.dateTo)) return false;
        if (site && rowSiteKey(row) !== site) return false;
        if (program && rowProgramHaystack(row) !== program) return false;
        if (owner && rowOwnerKey(row) !== owner) return false;
        if (attention && !rowMatchesAttentionReason(row, attention)) return false;
        return true;
    });

    items = sortRows(items, filters.sort);

    return { items, filteredCount: items.length, totalLoaded };
}
