/**
 * Inquiry drawer children: merge OCM-linked rows with active household child members
 * so drawer parity matches work-unit queue (all active `relationship=child` members).
 */

import { optionLabelFromBatchMap, type batchOptionItemLabelsForOrg } from "@/lib/admin/optionItemLabelForOrg";
import {
    formatAgeFromDateOfBirthIso,
    formatAgePartsDisplay,
} from "@/lib/fields/derived/ageFromDateOfBirth";

export type HouseholdChildMemberRow = {
    id: string;
    display_name?: string | null;
    relationship?: string | null;
    dob?: string | null;
    person_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    metadata?: Record<string, unknown> | null;
    is_active?: boolean | null;
};

export type InquiryChildHydrateRow = {
    id: string;
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    age: string | null;
    program_category_id: string | null;
    /** Stable program key derived from the category FK (or opportunity default) — display only. */
    program_key: string | null;
    desired_program_label: string | null;
    schedule_type: string | null;
    desired_schedule_label: string | null;
    outcome_status_key: string | null;
    /** The child's own canonical process stage key, when the participation row carries one. */
    stage_key?: string | null;
    outcome_status_label: string | null;
    fit_status: string | null;
    notes: string | null;
    start_date: string | null;
    location_id?: string | null;
    location_label?: string | null;
    program_room_cohort_key?: string | null;
    program_room_cohort_label?: string | null;
    custom_fields: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
    linked_on_inquiry: boolean;
    ocm_id: string | null;
};

type WarmPersonRow = {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    date_of_birth?: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function warmPersonDisplayName(p: WarmPersonRow | null): string | null {
    if (!p) return null;
    const full = trimOrNull(p.full_name);
    if (full) return full;
    const fn = trimOrNull(p.first_name);
    const ln = trimOrNull(p.last_name);
    const joined = [fn, ln].filter(Boolean).join(" ").trim();
    return joined || null;
}

export type InquiryChildIdentityMemberSource = {
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    display_name?: string | null;
};

export type InquiryChildIdentityPersonSource = {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    date_of_birth?: string | null;
};

/**
 * Resolve inquiry child identity for display/edit.
 * When `customer_members.person_id` is set, `persons` is canonical for name + DOB.
 */
export function resolveInquiryChildIdentityFields(args: {
    personId: string | null;
    person: InquiryChildIdentityPersonSource | null;
    member: InquiryChildIdentityMemberSource | null;
}): {
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    display_name: string | null;
} {
    const pid = trimOrNull(args.personId);
    const p = args.person;
    const m = args.member;

    if (pid && p) {
        return {
            first_name: trimOrNull(p.first_name) ?? trimOrNull(m?.first_name),
            last_name: trimOrNull(p.last_name) ?? trimOrNull(m?.last_name),
            dob: p.date_of_birth ? String(p.date_of_birth) : m?.dob ? String(m.dob) : null,
            display_name: warmPersonDisplayName(p as WarmPersonRow) ?? trimOrNull(m?.display_name),
        };
    }

    return {
        first_name: trimOrNull(m?.first_name),
        last_name: trimOrNull(m?.last_name),
        dob: m?.dob ? String(m.dob) : null,
        display_name: trimOrNull(m?.display_name),
    };
}

export function inquiryChildAgeLabelFromDob(
    dobIso: string | null | undefined,
    asOfDate: Date = new Date(),
): { label: string } | null {
    const raw = String(dobIso ?? "").trim();
    if (!raw) return null;

    // Prefer canonical ISO derivation (years + months compact: `2y2m`, `6m`).
    const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
    if (iso) {
        const label = formatAgeFromDateOfBirthIso(iso, "years_months", asOfDate);
        return label ? { label } : null;
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    let years = asOfDate.getFullYear() - d.getFullYear();
    let months = asOfDate.getMonth() - d.getMonth();
    if (asOfDate.getDate() - d.getDate() < 0) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0) return null;
    return { label: formatAgePartsDisplay(years, months, "years_months") };
}

/** Compact age label from inquiry-child row payload (queue row / header surfaces). */
export function resolveInquiryChildAgeLabelFromRaw(raw: Record<string, unknown>): string | null {
    const age = trimOrNull(raw.age);
    if (age) {
        const compact = age.replace(/\s+/g, "").replace(/years?/i, "y").replace(/months?/i, "m");
        return compact.includes("y") || compact.includes("m") ? compact : age;
    }
    return inquiryChildAgeLabelFromDob(trimOrNull(raw.dob) ?? trimOrNull(raw.date_of_birth))?.label ?? null;
}

export function resolveInquiryChildDobFromRaw(raw: Record<string, unknown>): string | null {
    return trimOrNull(raw.dob) ?? trimOrNull(raw.date_of_birth);
}

export function resolveInquiryChildGenderLabelFromRaw(raw: Record<string, unknown>): string | null {
    const direct = trimOrNull(raw.gender);
    if (direct) return direct;
    const customFields = raw.custom_fields;
    if (customFields != null && typeof customFields === "object" && !Array.isArray(customFields)) {
        const fromCustom = trimOrNull((customFields as Record<string, unknown>).gender);
        if (fromCustom) return fromCustom;
    }
    return null;
}

export function inquiryChildProfileFieldsFromRaw(raw: Record<string, unknown>): {
    date_of_birth: string | null;
    age_label: string | null;
    gender_label: string | null;
} {
    const date_of_birth = resolveInquiryChildDobFromRaw(raw);
    return {
        date_of_birth,
        age_label: resolveInquiryChildAgeLabelFromRaw(raw),
        gender_label: resolveInquiryChildGenderLabelFromRaw(raw),
    };
}

/**
 * Matches work-unit queue child membership filter (`QueueService.isActiveChildCustomerMemberRow`).
 * Drawer bootstrap queries use `.eq("is_active", true)` but historically omitted `is_active` from SELECT;
 * treat omitted/null as active for `relationship=child` so merge matches queue row counts.
 */
export function isActiveChildCustomerMemberForInquiry(row: Record<string, unknown>): boolean {
    const rel = String(row.relationship ?? "").trim().toLowerCase();
    if (rel !== "child") return false;
    if (row.is_active === false) return false;
    return row.is_active === true || row.is_active === undefined || row.is_active === null;
}

export const UNLINKED_INQUIRY_CHILD_ID_PREFIX = "unlinked:";

export function isUnlinkedInquiryChildRowId(id: string): boolean {
    return id.startsWith(UNLINKED_INQUIRY_CHILD_ID_PREFIX);
}

/**
 * Append household active child members not already represented in OCM-linked inquiry rows.
 */
export function mergeHouseholdActiveChildrenIntoInquiryChildren(
    linkedRows: InquiryChildHydrateRow[],
    householdMembers: HouseholdChildMemberRow[],
    pmap: Map<string, WarmPersonRow>,
    oppDefaultProgramType: string | null,
    oppDefaultScheduleType: string | null,
    optionLabelMap: Awaited<ReturnType<typeof batchOptionItemLabelsForOrg>>
): InquiryChildHydrateRow[] {
    const byMemberId = new Map<string, InquiryChildHydrateRow>();
    for (const row of linkedRows) {
        const cmId = trimOrNull(row.customer_member_id);
        if (cmId) byMemberId.set(cmId, { ...row, linked_on_inquiry: true, ocm_id: row.ocm_id ?? row.id });
    }

    for (const m of householdMembers) {
        if (!isActiveChildCustomerMemberForInquiry(m as Record<string, unknown>)) continue;
        const cmId = trimOrNull(m.id);
        if (!cmId || byMemberId.has(cmId)) continue;

        const pid = trimOrNull(m.person_id);
        const p = pid ? (pmap.get(pid) ?? null) : null;
        const identity = resolveInquiryChildIdentityFields({
            personId: pid,
            person: p,
            member: m,
        });
        const dob = identity.dob;
        const age = inquiryChildAgeLabelFromDob(dob);
        const first_name = identity.first_name;
        const last_name = identity.last_name;
        const display_name = identity.display_name ?? `${cmId.slice(0, 8)}…`;

        const defaultProgramKey = oppDefaultProgramType;
        const scheduleType = oppDefaultScheduleType;
        const memMeta = (m.metadata ?? null) as Record<string, unknown> | null;
        const demoProgramLabel =
            memMeta && typeof memMeta.demo_program_label === "string"
                ? trimOrNull(memMeta.demo_program_label)
                : null;

        byMemberId.set(cmId, {
            id: `${UNLINKED_INQUIRY_CHILD_ID_PREFIX}${cmId}`,
            customer_member_id: cmId,
            person_id: pid,
            display_name,
            first_name,
            last_name,
            dob,
            age: age ? age.label : null,
            program_category_id: null,
            program_key: defaultProgramKey,
            desired_program_label:
                optionLabelFromBatchMap(optionLabelMap, "childcare_program_type", defaultProgramKey) ??
                demoProgramLabel,
            schedule_type: scheduleType,
            desired_schedule_label: optionLabelFromBatchMap(
                optionLabelMap,
                "childcare_schedule_type",
                scheduleType
            ),
            outcome_status_key: null,
            stage_key: null,
            outcome_status_label: null,
            fit_status: null,
            notes: null,
            start_date: null,
            custom_fields: {},
            metadata: (m.metadata as Record<string, unknown>) ?? null,
            created_at: null,
            updated_at: null,
            linked_on_inquiry: false,
            ocm_id: null,
        });
    }

    const linkedOrder = linkedRows.map((r) => trimOrNull(r.customer_member_id)).filter(Boolean) as string[];
    const extraIds = [...byMemberId.keys()].filter((id) => !linkedOrder.includes(id));
    const ordered = [
        ...linkedOrder.map((cmId) => byMemberId.get(cmId)).filter(Boolean),
        ...extraIds.map((cmId) => byMemberId.get(cmId)).filter(Boolean),
    ] as InquiryChildHydrateRow[];

    return ordered;
}
