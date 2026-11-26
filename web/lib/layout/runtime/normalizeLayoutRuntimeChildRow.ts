/**
 * Normalize inquiry / household / layout-runtime child rows → flat repeater record.
 *
 * Published layouts bind `child.first_name`, `child.name`, `inquiry_child.*`, etc.
 * Source payloads may be flat (child.*), nested (`child: { … }`), or VM inquiry blocks.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { isOpaqueIdValue, pickEntityId, type ProofRuntimeRecord } from "./proofRecordContext";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function nestedChildObject(row: Record<string, unknown>): Record<string, unknown> | null {
    const nested = row.child;
    return nested && typeof nested === "object" ? (nested as Record<string, unknown>) : null;
}

function splitDisplayName(name: string): { first: string; last: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0]!, last: "" };
    return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function ensureChildNameParts(first: string, last: string, name: string): { first: string; last: string; name: string } {
    if (first || last) {
        const composed = [first, last].filter(Boolean).join(" ");
        return { first, last, name: name && name !== "—" ? name : composed || name };
    }
    if (name && name !== "—") {
        const split = splitDisplayName(name);
        return { first: split.first, last: split.last, name };
    }
    return { first, last, name };
}

function readNested(row: Record<string, unknown>, flatKey: string, nestedKey: string): string | null {
    const direct = pickDisplay(row[flatKey]);
    if (direct) return direct;
    const nested = nestedChildObject(row);
    if (!nested) return null;
    return pickDisplay(nested[nestedKey], nested[flatKey.split(".").pop() ?? ""]);
}

/** True when row already has renderable layout-runtime child identity. */
export function isNormalizedLayoutRuntimeChildRow(row: unknown): row is ProofRuntimeRecord {
    if (!row || typeof row !== "object") return false;
    const rec = row as Record<string, unknown>;
    const name = pickDisplay(
        rec["child.name"],
        readNested(rec, "child.name", "name"),
        readNested(rec, "child.name", "display_name"),
        [readNested(rec, "child.first_name", "first_name"), readNested(rec, "child.last_name", "last_name")]
            .filter(Boolean)
            .join(" "),
    );
    return Boolean(name && name !== "—");
}

/** Map one raw inquiry-child VM block to layout-runtime repeater shape. */
export function normalizeInquiryChildBlockToLayoutRuntimeRow(
    row: ReturnType<typeof mapRawInquiryChildrenToDrawerRows>[number],
    index: number,
): ProofRuntimeRecord {
    const firstRaw = pickDisplay(row.first_name) ?? "";
    const lastRaw = pickDisplay(row.last_name) ?? "";
    const nameRaw =
        pickDisplay(row.display_name, [firstRaw, lastRaw].filter(Boolean).join(" ")) ?? "—";
    const { first, last, name } = ensureChildNameParts(firstRaw, lastRaw, nameRaw);
    const dob = pickDisplay(row.dob) ?? "";
    const programLabel = pickDisplay(row.desired_program_label);
    const roomLabel = pickDisplay(row.program_room_cohort_label, row.program_room_cohort_key);
    const scheduleLabel = pickDisplay(row.desired_schedule_label, row.schedule_type);
    const locationLabel = pickDisplay(row.location_label);
    const statusLabel = pickDisplay(row.outcome_status_label, row.outcome_status_key);
    const locationId = row.location_id != null && String(row.location_id).trim() ? String(row.location_id).trim() : "";
    const programCategoryId =
        row.program_category_id != null && String(row.program_category_id).trim() ?
            String(row.program_category_id).trim()
        :   "";
    const roomKey =
        row.program_room_cohort_key != null && String(row.program_room_cohort_key).trim() ?
            String(row.program_room_cohort_key).trim()
        :   "";
    const scheduleKey =
        row.schedule_type != null && String(row.schedule_type).trim() ?
            String(row.schedule_type).trim()
        :   "";
    const statusKey =
        row.outcome_status_key != null && String(row.outcome_status_key).trim() ?
            String(row.outcome_status_key).trim()
        :   "";
    const personId = pickEntityId(row.person_id);
    const memberId = pickEntityId(row.customer_member_id, row.ocm_id);
    const childId = personId ?? "";

    return {
        id: pickEntityId(row.ocm_id, row.id, memberId, personId) ?? `child-row-${index}`,
        ocm_id: pickEntityId(row.ocm_id, row.id) ?? "",
        person_id: childId,
        customer_member_id: memberId ?? "",
        "child.id": childId,
        "child.customer_member_id": memberId ?? "",
        "child.name": name,
        "child.display_name": name,
        "child.first_name": first,
        "child.last_name": last,
        "child.date_of_birth": dob,
        "child.dob_age": [dob, pickDisplay(row.age)].filter(Boolean).join(" · "),
        "child.age": pickDisplay(row.age) ?? "",
        "child.start_date": row.start_date ?? "",
        "child.location": locationLabel ?? "",
        "child.program": programLabel ?? "",
        "child.room": roomLabel ?? "",
        "child.schedule": scheduleLabel ?? "",
        "child.status": statusLabel ?? "",
        "child.age_band": pickDisplay(row.age) ?? "",
        location_id: locationId,
        program_category_id: programCategoryId,
        program_room_cohort_key: roomKey,
        schedule_type: scheduleKey,
        outcome_status_key: statusKey,
        "inquiry_child.program": programLabel ?? "",
        "inquiry_child.program_category_id": programCategoryId,
        "inquiry_child.start_date": row.start_date ?? "",
        "inquiry_child.location_id": locationId,
        "inquiry_child.program_room_cohort_key": roomKey,
        "inquiry_child.schedule_type": scheduleKey,
        "inquiry_child.outcome_status_key": statusKey,
    };
}

/** Normalize any raw repeater row (flat, nested, or inquiry VM shape). */
export function normalizeLayoutRuntimeChildRow(row: unknown, index: number): ProofRuntimeRecord | null {
    if (!row || typeof row !== "object") return null;
    const rec = row as Record<string, unknown>;

    const nested = nestedChildObject(rec);
    if (nested) {
        const first = pickDisplay(nested.first_name, rec["child.first_name"]) ?? "";
        const last = pickDisplay(nested.last_name, rec["child.last_name"]) ?? "";
        const name =
            pickDisplay(
                nested.display_name,
                nested.name,
                rec["child.name"],
                rec["child.display_name"],
                [first, last].filter(Boolean).join(" "),
            ) ?? null;
        if (name) {
            const parts = ensureChildNameParts(first, last, name);
            const personId = pickEntityId(nested.id, nested.person_id, rec["child.id"], rec.person_id);
            const memberId = pickEntityId(rec.customer_member_id, nested.customer_member_id, rec["child.customer_member_id"]);
            return {
                id: pickEntityId(rec.id, rec.ocm_id, memberId, personId) ?? `child-row-${index}`,
                ocm_id: pickEntityId(rec.ocm_id, rec.id) ?? "",
                person_id: personId ?? "",
                customer_member_id: memberId ?? "",
                "child.id": personId ?? "",
                "child.customer_member_id": memberId ?? "",
                "child.name": parts.name,
                "child.display_name": parts.name,
                "child.first_name": parts.first,
                "child.last_name": parts.last,
                "child.date_of_birth": pickDisplay(nested.dob, nested.date_of_birth, rec["child.date_of_birth"]) ?? "",
                "child.program": pickDisplay(rec["child.program"], nested.program) ?? "",
                "child.status": pickDisplay(rec["child.status"], nested.status) ?? "",
                "child.age_band": pickDisplay(rec["child.age_band"], nested.age) ?? "",
                "child.age": pickDisplay(rec["child.age"], nested.age, rec["child.age_band"]) ?? "",
                "inquiry_child.program": pickDisplay(rec["inquiry_child.program"], rec["child.program"], nested.program) ?? "",
                "inquiry_child.program_category_id":
                    pickEntityId(rec["inquiry_child.program_category_id"], rec.program_category_id) ?? "",
                "inquiry_child.start_date":
                    pickDisplay(rec["inquiry_child.start_date"], rec.start_date) ?? "",
                "inquiry_child.outcome_status_key":
                    pickDisplay(rec["inquiry_child.outcome_status_key"], rec.outcome_status_key) ?? "",
            };
        }
    }

    const flatFirstRaw = pickDisplay(rec["child.first_name"]) ?? "";
    const flatLastRaw = pickDisplay(rec["child.last_name"]) ?? "";
    const flatNameRaw = pickDisplay(
        rec["child.name"],
        rec["child.display_name"],
        rec.primary,
        rec.line,
        [flatFirstRaw, flatLastRaw].filter(Boolean).join(" "),
    );
    if (flatNameRaw) {
        const { first, last, name } = ensureChildNameParts(flatFirstRaw, flatLastRaw, flatNameRaw);
        const personId = pickEntityId(rec.person_id, rec["child.id"]) ?? "";
        const memberId = pickEntityId(rec.customer_member_id, rec["child.customer_member_id"]) ?? "";
        const ocmId = pickEntityId(rec.ocm_id) ?? "";
        const hasEntityId = Boolean(personId || memberId || ocmId);
        return {
            id: pickEntityId(rec.id, ocmId, memberId, personId) ?? `child-row-${index}`,
            ocm_id: ocmId,
            person_id: personId,
            customer_member_id: memberId,
            "child.id": personId,
            "child.customer_member_id": memberId,
            "child.name": name,
            "child.display_name": name,
            "child.first_name": first,
            "child.last_name": last,
            "child.date_of_birth": pickDisplay(rec["child.date_of_birth"]) ?? "",
            "child.program": pickDisplay(rec["child.program"]) ?? "",
            "child.status": pickDisplay(rec["child.status"]) ?? "",
            "child.age_band": pickDisplay(rec["child.age_band"]) ?? "",
            "child.age": pickDisplay(rec["child.age"], rec["child.age_band"]) ?? "",
            "inquiry_child.program": pickDisplay(rec["inquiry_child.program"], rec["child.program"]) ?? "",
            "inquiry_child.program_category_id": pickEntityId(rec["inquiry_child.program_category_id"]) ?? "",
            "inquiry_child.start_date": pickDisplay(rec["inquiry_child.start_date"]) ?? "",
            "inquiry_child.outcome_status_key": pickDisplay(rec["inquiry_child.outcome_status_key"]) ?? "",
            ...(hasEntityId
                ? {}
                :   {
                        _layout_runtime_child_id_source: "name_only_pending_enrichment",
                    }),
        };
    }

    const drawerRows = mapRawInquiryChildrenToDrawerRows([rec]);
    if (drawerRows.length > 0) {
        return normalizeInquiryChildBlockToLayoutRuntimeRow(drawerRows[0]!, index);
    }

    const first = pickDisplay(rec.first_name, nested?.first_name, readNested(rec, "child.first_name", "first_name"), rec.primary) ?? "";
    const last = pickDisplay(rec.last_name, nested?.last_name, readNested(rec, "child.last_name", "last_name")) ?? "";
    const name =
        pickDisplay(
            rec["child.name"],
            rec.display_name,
            rec.name,
            nested?.display_name,
            nested?.name,
            [first, last].filter(Boolean).join(" "),
        ) ?? null;
    if (!name) return null;

    const personId = pickEntityId(rec.person_id, nested?.person_id, rec["child.id"], nested?.id);
    const memberId = pickEntityId(rec.customer_member_id, nested?.customer_member_id);

    return {
        id: pickEntityId(rec.id, memberId, personId, rec.ocm_id) ?? `child-row-${index}`,
        ocm_id: pickEntityId(rec.ocm_id) ?? "",
        person_id: personId ?? "",
        customer_member_id: memberId ?? "",
        "child.id": personId ?? "",
        "child.customer_member_id": memberId ?? "",
        "child.name": name,
        "child.display_name": name,
        "child.first_name": first,
        "child.last_name": last,
        "child.date_of_birth": pickDisplay(rec.dob, rec.date_of_birth, nested?.dob, rec["child.date_of_birth"]) ?? "",
        "child.program": pickDisplay(rec["child.program"], rec.desired_program_label, rec.program_label) ?? "",
        "child.status": pickDisplay(rec["child.status"], rec.status_label, rec.status_key) ?? "",
        "child.age_band": pickDisplay(rec["child.age_band"], rec.age) ?? "",
        "child.age": pickDisplay(rec["child.age"], rec.age, rec["child.age_band"]) ?? "",
        "inquiry_child.program":
            pickDisplay(rec["inquiry_child.program"], rec["child.program"], rec.desired_program_label, rec.program_label) ?? "",
        "inquiry_child.program_category_id":
            pickEntityId(rec["inquiry_child.program_category_id"], rec.program_category_id) ?? "",
        "inquiry_child.start_date":
            pickDisplay(rec["inquiry_child.start_date"], rec.start_date) ?? "",
        "inquiry_child.outcome_status_key":
            pickDisplay(rec["inquiry_child.outcome_status_key"], rec.outcome_status_key) ?? "",
    };
}

export function normalizeLayoutRuntimeChildRows(raw: unknown[]): ProofRuntimeRecord[] {
    const out: ProofRuntimeRecord[] = [];
    raw.forEach((row, index) => {
        const normalized = normalizeLayoutRuntimeChildRow(row, index);
        if (normalized) out.push(normalized);
    });
    return out;
}

export type LayoutRuntimeChildrenSourceCounts = Record<string, number>;

/** Count raw collection lengths for staging diagnostics. */
export function countLayoutRuntimeChildrenBySource(record: Record<string, unknown>): LayoutRuntimeChildrenSourceCounts {
    const keys = [
        "children",
        "enrollment_children",
        "inquiry_children",
        "_inquiry_children",
        "household_children",
        "_household_children",
        "_children",
    ] as const;
    const counts: LayoutRuntimeChildrenSourceCounts = {};
    for (const key of keys) {
        const raw = record[key];
        counts[key] = Array.isArray(raw) ? raw.length : 0;
    }
    return counts;
}
