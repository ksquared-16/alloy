/**
 * Child focus edit state — pure helpers for inquiry-child save from the Focus Panel.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import {
    buildInquiryChildOcmPatchFromEditorLocal,
    buildPersonIdentityPatch,
    buildCustomerMemberPatch,
    inquiryChildIdentityHasChanges,
    resolveInquiryChildIdentityWriteTarget,
    type InquiryChildIdentityPatch,
    type InquiryChildOcmPatch,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import type {
    ChildFocusEditValueKey,
    ChildFocusEditValues,
} from "@/lib/adminV2/runtime/focusPanel/children/childFocusFieldPolicy";

const VALUE_KEYS: ChildFocusEditValueKey[] = [
    "location_id",
    "program_category_id",
    "program_room_cohort_key",
    "schedule_type",
    "start_date",
    "requested_days_per_week",
    "weekdays",
    "dob",
];

function formatWeekdaysEditValue(raw: unknown): string {
    if (!Array.isArray(raw)) return "";
    return raw
        .map((d) => (typeof d === "number" ? d : Number(d)))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .join(",");
}

function parseWeekdaysEditValue(raw: string): number[] | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/[,\s]+/).filter(Boolean);
    const days = parts
        .map((p) => Number(p))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return days.length ? days : null;
}

function trimStr(value: unknown): string {
    if (value == null) return "";
    return String(value).trim();
}

function identityBaselineForRow(row: InquiryChildRow): InquiryChildIdentityPatch {
    const display = (row.display_name ?? "").trim();
    let first = (row.first_name ?? "").trim();
    let last = (row.last_name ?? "").trim();
    if (!first && !last && display) {
        const parts = display.split(/\s+/).filter(Boolean);
        first = parts[0] ?? "";
        last = parts.length > 1 ? parts.slice(1).join(" ") : "";
    }
    return {
        first_name: first,
        last_name: last,
        dob: row.dob ? String(row.dob).slice(0, 10) : "",
    };
}

export type ChildFocusEditSeed = {
    childId: string;
    row: InquiryChildRow;
    values: ChildFocusEditValues;
    identityBaseline: InquiryChildIdentityPatch;
    /** When true, program/room fields are owned by the Primary Assignment (read-only in edit). */
    hasCommittedPrimaryAssignment?: boolean;
};

export function findInquiryChildRow(
    truth: Record<string, unknown>,
    childId: string,
): InquiryChildRow | null {
    const id = childId.trim();
    if (!id) return null;
    const rows = mapRawInquiryChildrenToDrawerRows((truth._inquiry_children as unknown[]) ?? []);
    return rows.find((r) => r.id === id || (r.person_id ?? "").trim() === id) ?? null;
}

/** Seed editable child focus values from observed inquiry-child truth. */
export function seedChildFocusEditValues(truth: Record<string, unknown>, childId: string): ChildFocusEditSeed | null {
    const row = findInquiryChildRow(truth, childId);
    if (!row?.customer_member_id?.trim()) return null;
    // Effective site for the select: child-owned authority, else lead/opportunity default.
    // Save still writes OCM.location_id only when the operator changes the value.
    const opportunitySiteId =
        trimStr(truth.location_id) || trimStr(truth._location_id) || trimStr(truth["opportunity.location_id"]);
    const ownedSiteId = trimStr(row.location_id);
    const memberId = trimStr(row.customer_member_id);
    const bag = truth._enrollment_participation_by_member;
    const fromBag =
        memberId && bag && typeof bag === "object" && !Array.isArray(bag)
            ? (bag as Record<string, unknown>)[memberId]
            : null;
    const participation =
        fromBag && typeof fromBag === "object" && !Array.isArray(fromBag)
            ? (fromBag as Record<string, unknown>)
            : ({} as Record<string, unknown>);
    const requestedDaysRaw =
        participation.requested_days_per_week
        ?? (row as { requested_days_per_week?: unknown }).requested_days_per_week;
    const weekdaysRaw =
        participation.weekdays ?? (row as { weekdays?: unknown }).weekdays;
    return {
        childId: row.id,
        row,
        identityBaseline: identityBaselineForRow(row),
        values: {
            location_id: ownedSiteId || opportunitySiteId,
            program_category_id: trimStr(row.program_category_id),
            program_room_cohort_key: trimStr(row.program_room_cohort_key),
            schedule_type: trimStr(row.schedule_type),
            start_date: row.start_date ? String(row.start_date).slice(0, 10) : "",
            requested_days_per_week:
                requestedDaysRaw != null && String(requestedDaysRaw).trim()
                    ? String(requestedDaysRaw).trim()
                    : "",
            weekdays: formatWeekdaysEditValue(weekdaysRaw),
            dob: row.dob ? String(row.dob).slice(0, 10) : "",
        },
    };
}

export function childFocusEditDirtyForPolicy(
    draft: ChildFocusEditValues,
    baseline: ChildFocusEditValues,
    editableKeys: ReadonlySet<ChildFocusEditValueKey>,
): boolean {
    return VALUE_KEYS.some((key) => editableKeys.has(key) && draft[key].trim() !== baseline[key].trim());
}

export type ChildFocusSavePatch = {
    identityPatch: InquiryChildIdentityPatch;
    ocmPatch: InquiryChildOcmPatch;
    profilePatch?: Record<string, unknown>;
    /**
     * Client-only display labels to merge into Focus Panel truth after OCM/FK writes.
     * Not sent to the participation API — keeps Program/Location from reverting to `—`.
     */
    displayPatch?: {
        desired_program_label?: string | null;
        location_label?: string | null;
    };
};

/** Build identity + OCM patches including only editable, changed fields. Pure. */
export function buildChildFocusSavePatch(args: {
    row: InquiryChildRow;
    draft: ChildFocusEditValues;
    baseline: ChildFocusEditValues;
    identityBaseline: InquiryChildIdentityPatch;
    editableKeys: ReadonlySet<ChildFocusEditValueKey>;
    opportunityStartDate?: string | null;
}): ChildFocusSavePatch {
    const identityDraft: InquiryChildIdentityPatch = {
        ...args.identityBaseline,
        dob: args.editableKeys.has("dob") ? args.draft.dob.trim() : args.identityBaseline.dob,
    };

    let identityPatch: InquiryChildIdentityPatch = {};
    if (args.editableKeys.has("dob") && inquiryChildIdentityHasChanges(identityDraft, args.identityBaseline)) {
        identityPatch = { dob: identityDraft.dob || null };
    }

    const local = {
        location_id: args.draft.location_id,
        program_room_cohort_key: args.draft.program_room_cohort_key,
        program_category_id: args.draft.program_category_id,
        schedule_type: args.draft.schedule_type,
        outcome_status_key: "",
        notes: "",
        desired_start_edit: args.draft.start_date,
        custom: {},
    };
    const editorBaseline = {
        location_id: args.baseline.location_id || null,
        program_category_id: args.baseline.program_category_id || null,
        program_room_cohort_key: args.baseline.program_room_cohort_key || null,
        schedule_type: args.baseline.schedule_type || null,
        start_date: args.baseline.start_date || null,
    };

    const fullOcmPatch = buildInquiryChildOcmPatchFromEditorLocal({
        row: editorBaseline,
        local,
        opportunityStartDate: args.opportunityStartDate,
    });

    const ocmPatch: InquiryChildOcmPatch = {};
    if (args.editableKeys.has("location_id") && fullOcmPatch.location_id !== undefined) {
        ocmPatch.location_id = fullOcmPatch.location_id;
    }
    if (args.editableKeys.has("program_category_id") && fullOcmPatch.program_category_id !== undefined) {
        ocmPatch.program_category_id = fullOcmPatch.program_category_id;
    }
    if (args.editableKeys.has("program_room_cohort_key") && fullOcmPatch.program_room_cohort_key !== undefined) {
        ocmPatch.program_room_cohort_key = fullOcmPatch.program_room_cohort_key;
    }
    if (args.editableKeys.has("schedule_type") && fullOcmPatch.schedule_type !== undefined) {
        ocmPatch.schedule_type = fullOcmPatch.schedule_type;
    }
    if (args.editableKeys.has("start_date") && fullOcmPatch.start_date !== undefined) {
        ocmPatch.start_date = fullOcmPatch.start_date;
    }
    if (args.editableKeys.has("requested_days_per_week")) {
        const next = args.draft.requested_days_per_week.trim();
        const prev = args.baseline.requested_days_per_week.trim();
        if (next !== prev) {
            if (!next) {
                ocmPatch.requested_days_per_week = null;
            } else {
                const n = Number(next);
                ocmPatch.requested_days_per_week = Number.isFinite(n) ? Math.floor(n) : null;
            }
        }
    }
    if (args.editableKeys.has("weekdays")) {
        const next = args.draft.weekdays.trim();
        const prev = args.baseline.weekdays.trim();
        if (next !== prev) {
            ocmPatch.weekdays = parseWeekdaysEditValue(next);
        }
    }

    return { identityPatch, ocmPatch };
}

/** Canonical write target for DOB on this inquiry row (for tests / diagnostics). */
export function childFocusDobWriteTarget(row: InquiryChildRow): "person" | "customer_member" {
    return resolveInquiryChildIdentityWriteTarget(row);
}

/** Normalize identity patch to API body for person vs customer_member writes. */
export function childFocusIdentityApiPatch(
    row: InquiryChildRow,
    identityPatch: InquiryChildIdentityPatch,
    identityBaseline: InquiryChildIdentityPatch,
): Record<string, unknown> {
    const draft = { ...identityBaseline, ...identityPatch };
    if (resolveInquiryChildIdentityWriteTarget(row) === "person") {
        return buildPersonIdentityPatch(draft, identityBaseline);
    }
    return buildCustomerMemberPatch(draft, identityBaseline);
}
