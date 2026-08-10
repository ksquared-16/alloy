import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";
import { calculateAgeFromDob } from "@/lib/intake/normalize/calculateAgeFromDob";
import type {
    CreateLeadCommitResolution,
    CreateLeadHouseholdResolution,
    CreateLeadLeadResolution,
} from "@/lib/intake/resolve/commitOverlayTypes";
import type { IntakeAddressCandidate, IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";
import { parseAddressLines } from "@/lib/admin/actions/createLeadAddressParse";

export type CreateLeadCommitEntityType = "parent" | "child";

export type { CreateLeadCommitResolution, CreateLeadHouseholdResolution, CreateLeadLeadResolution };

export type CreateLeadCommitRecord = {
    candidate_id: string;
    entity_type: CreateLeadCommitEntityType;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    dob: string | null;
    age_display: string | null;
    program_interest: string | null;
    start_date: string | null;
    program_room_cohort_key: string | null;
    schedule_type: string | null;
    extra_payload_values: Record<string, string>;
    include_in_commit: boolean;
    primary: boolean;
    validation_state: "valid" | "invalid" | "ambiguous" | "unknown";
    commit_blockers: string[];
    source_fact_ids: string[];
    /** Canonical record resolution overlay when resolver has run. */
    resolution?: CreateLeadCommitResolution;
};

export type CreateLeadCommitHouseholdAddress = {
    lines: string[];
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
};

export type CreateLeadCommitSelection = {
    version: 1;
    parents: CreateLeadCommitRecord[];
    children: CreateLeadCommitRecord[];
    household_contacts: {
        email: string | null;
        phone: string | null;
        invalid_phone: boolean;
    };
    /** Parsed household mailing address from intake (not site location). */
    household_address?: CreateLeadCommitHouseholdAddress | null;
    address_review_only: boolean;
    household_resolution?: CreateLeadHouseholdResolution;
    lead_resolution?: CreateLeadLeadResolution;
};

export type CreateLeadCommitSelectionPatch = Partial<
    Pick<
        CreateLeadCommitRecord,
        | "first_name"
        | "last_name"
        | "email"
        | "phone"
        | "role"
        | "dob"
        | "program_interest"
        | "start_date"
        | "program_room_cohort_key"
        | "schedule_type"
        | "extra_payload_values"
        | "include_in_commit"
        | "primary"
    >
>;

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function isoDateOnly(v: unknown): string | null {
    const t = trim(v);
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function personAgeDisplay(person: IntakePersonCandidate): string | null {
    if (person.calculated_age?.display) return person.calculated_age.display;
    if (person.age_years != null) return `~${person.age_years} yrs (approximate)`;
    return null;
}

function parentBlockers(record: Pick<CreateLeadCommitRecord, "first_name" | "last_name" | "email" | "phone">): string[] {
    const blockers: string[] = [];
    if (!trim(record.first_name)) blockers.push("First name is required.");
    if (!trim(record.last_name)) blockers.push("Last name is required.");
    const email = trim(record.email);
    const phone = trim(record.phone);
    if (email && !isValidCreateLeadEmail(email)) blockers.push("Email is invalid.");
    if (phone && !isValidCreateLeadPhone(phone)) blockers.push("Phone is invalid.");
    return blockers;
}

function childBlockers(record: Pick<CreateLeadCommitRecord, "first_name" | "last_name" | "dob">): string[] {
    const blockers: string[] = [];
    if (!trim(record.first_name)) blockers.push("First name is required.");
    if (!trim(record.last_name)) blockers.push("Last name is required.");
    const dob = trim(record.dob);
    if (dob && !isoDateOnly(dob)) blockers.push("Date of birth is invalid.");
    return blockers;
}

function validationStateFromBlockers(blockers: string[]): CreateLeadCommitRecord["validation_state"] {
    if (blockers.length === 0) return "valid";
    return "invalid";
}

function householdContactInfo(household: IntakeHouseholdCandidate): CreateLeadCommitSelection["household_contacts"] {
    const emailContact = household.household_contacts.find((c) => c.kind === "email");
    const phoneContact = household.household_contacts.find((c) => c.kind === "phone");
    return {
        email: emailContact ? trim(emailContact.value) || null : null,
        phone: phoneContact ? trim(phoneContact.value) || null : null,
        invalid_phone: phoneContact?.validation_state === "invalid",
    };
}

function parentRecordFromCandidate(
    person: IntakePersonCandidate,
    index: number,
    householdContacts: CreateLeadCommitSelection["household_contacts"],
): CreateLeadCommitRecord {
    const emails = [...person.emails];
    const phones = [...person.phones];
    if (index === 0) {
        if (!emails.length && householdContacts.email) emails.push(householdContacts.email);
        if (!phones.length && householdContacts.phone) phones.push(householdContacts.phone);
    }
    const record: CreateLeadCommitRecord = {
        candidate_id: person.candidate_id,
        entity_type: "parent",
        role: person.role,
        first_name: trim(person.first_name),
        last_name: trim(person.last_name),
        email: emails[0] ?? "",
        phone: phones[0] ?? "",
        dob: person.dob,
        age_display: personAgeDisplay(person),
        program_interest: person.program_interest,
        start_date: null,
        program_room_cohort_key: null,
        schedule_type: null,
        extra_payload_values: {},
        include_in_commit: false,
        primary: index === 0,
        validation_state: "unknown",
        commit_blockers: [],
        source_fact_ids: [...person.source_fact_ids],
    };
    record.commit_blockers = parentBlockers(record);
    record.validation_state = validationStateFromBlockers(record.commit_blockers);
    record.include_in_commit = record.validation_state === "valid";
    if (index === 0 && record.validation_state === "valid") {
        record.include_in_commit = true;
    }
    return record;
}

function childRecordFromCandidate(
    person: IntakePersonCandidate,
    index: number,
    household: IntakeHouseholdCandidate,
): CreateLeadCommitRecord {
    const record: CreateLeadCommitRecord = {
        candidate_id: person.candidate_id,
        entity_type: "child",
        role: person.role,
        first_name: trim(person.first_name),
        last_name: trim(person.last_name),
        email: "",
        phone: "",
        dob: isoDateOnly(person.dob),
        age_display: personAgeDisplay(person),
        program_interest: person.program_interest ?? household.program_interest,
        start_date: household.start_date,
        program_room_cohort_key: null,
        schedule_type: null,
        extra_payload_values:
            person.gender === "female" || person.gender === "male" ? { gender: person.gender } : {},
        include_in_commit: false,
        primary: index === 0,
        validation_state: "unknown",
        commit_blockers: [],
        source_fact_ids: [...person.source_fact_ids],
    };
    record.commit_blockers = childBlockers(record);
    record.validation_state = validationStateFromBlockers(record.commit_blockers);
    record.include_in_commit = record.validation_state === "valid";
    return record;
}

function householdAddressFromIntake(address: IntakeAddressCandidate | null): CreateLeadCommitHouseholdAddress | null {
    if (!address?.lines?.length) return null;
    const lines = address.lines.map((line) => String(line).trim()).filter(Boolean);
    if (!lines.length) return null;
    const parsed = parseAddressLines(lines);
    if (!parsed) return null;
    return {
        lines,
        address_line1: parsed.address_line1,
        address_line2: parsed.address_line2 ?? null,
        city: parsed.city ?? null,
        state: parsed.state ?? null,
        postal_code: parsed.postal_code ?? null,
    };
}

/** Build default commit selection from grouped household candidates. */
export function buildCreateLeadCommitSelection(
    household: IntakeHouseholdCandidate,
): CreateLeadCommitSelection {
    const contacts = householdContactInfo(household);
    const guardians = household.parents_guardians?.length ? household.parents_guardians : household.parents;
    const parents = guardians.map((p, i) => parentRecordFromCandidate(p, i, contacts));
    const children = household.children.map((c, i) => childRecordFromCandidate(c, i, household));
    const householdAddress = householdAddressFromIntake(household.address);

    if (parents[0] && !parents[0].include_in_commit && parents[0].validation_state === "valid") {
        parents[0].include_in_commit = true;
    }

    return {
        version: 1,
        parents,
        children,
        household_contacts: contacts,
        household_address: householdAddress,
        // Persist parsed address when present — Create Lead already has household/person
        // address writers. Review-only used to drop mailing address silently after confirm.
        address_review_only: false,
    };
}

export function includedCommitRecords(selection: CreateLeadCommitSelection): {
    parents: CreateLeadCommitRecord[];
    children: CreateLeadCommitRecord[];
} {
    return {
        parents: selection.parents.filter((p) => p.include_in_commit),
        children: selection.children.filter((c) => c.include_in_commit),
    };
}

export function primaryIncludedParent(selection: CreateLeadCommitSelection): CreateLeadCommitRecord | null {
    return selection.parents.find((p) => p.include_in_commit && p.primary) ?? null;
}

export function primaryIncludedChild(selection: CreateLeadCommitSelection): CreateLeadCommitRecord | null {
    return selection.children.find((c) => c.include_in_commit && c.primary) ?? null;
}

function childAgeDisplayFromDob(dob: string | null): string | null {
    const iso = isoDateOnly(dob);
    if (!iso) return null;
    return calculateAgeFromDob(iso)?.display ?? null;
}

function recomputeRecord(record: CreateLeadCommitRecord): CreateLeadCommitRecord {
    const blockers = record.entity_type === "parent" ? parentBlockers(record) : childBlockers(record);
    const validation_state = validationStateFromBlockers(blockers);
    const next: CreateLeadCommitRecord = {
        ...record,
        commit_blockers: blockers,
        validation_state,
    };
    if (record.entity_type === "child") {
        next.age_display = childAgeDisplayFromDob(next.dob);
    }
    return next;
}

export function patchCreateLeadCommitRecord(
    selection: CreateLeadCommitSelection,
    candidateId: string,
    patch: CreateLeadCommitSelectionPatch,
): CreateLeadCommitSelection {
    const mapRecord = (records: CreateLeadCommitRecord[]) =>
        records.map((record) => {
            if (record.candidate_id !== candidateId) return record;
            const mergedExtra = {
                ...(record.extra_payload_values ?? {}),
                ...(patch.extra_payload_values ?? {}),
            };
            const { extra_payload_values: _extra, ...scalarPatch } = patch;
            const next = recomputeRecord({
                ...record,
                ...scalarPatch,
                extra_payload_values: mergedExtra,
            });
            // Mid-edit invalidation clears include; becoming valid again must restore it.
            // Without this, Form rows stay excluded after the first incomplete keystroke and
            // flat draft sync (Review readiness) never sees primary first/last/email/phone.
            if (next.validation_state === "valid") {
                if (record.validation_state !== "valid") {
                    next.include_in_commit = true;
                }
            } else if (next.include_in_commit) {
                next.include_in_commit = false;
            }
            return next;
        });

    let parents = mapRecord(selection.parents);
    let children = mapRecord(selection.children);

    if (patch.primary === true) {
        const target = [...parents, ...children].find((r) => r.candidate_id === candidateId);
        if (target?.entity_type === "parent") {
            parents = parents.map((p) => {
                if (p.candidate_id !== candidateId) {
                    return { ...p, primary: false };
                }
                const next = { ...p, primary: true };
                if (next.validation_state === "valid") {
                    next.include_in_commit = true;
                }
                return next;
            });
        }
    }

    return { ...selection, parents, children };
}

export function toggleCreateLeadCommitInclusion(
    selection: CreateLeadCommitSelection,
    candidateId: string,
    include: boolean,
): CreateLeadCommitSelection {
    const mapRecord = (records: CreateLeadCommitRecord[]) =>
        records.map((record) => {
            if (record.candidate_id !== candidateId) return record;
            if (include && record.validation_state !== "valid") return record;
            return { ...record, include_in_commit: include };
        });

    return {
        ...selection,
        parents: mapRecord(selection.parents),
        children: mapRecord(selection.children),
    };
}

/** Primary adult row for Form flat sync — not gated on include_in_commit (mid-edit may exclude). */
function primaryParentForFlatSync(selection: CreateLeadCommitSelection): CreateLeadCommitRecord | null {
    return selection.parents.find((p) => p.primary) ?? selection.parents[0] ?? null;
}

/** Primary child row for Form flat sync — not gated on include_in_commit. */
function primaryChildForFlatSync(selection: CreateLeadCommitSelection): CreateLeadCommitRecord | null {
    return selection.children.find((c) => c.primary) ?? selection.children[0] ?? null;
}

/** Sync flat Create Lead gather values from commit selection (primary members). */
export function syncCreateLeadValuesFromCommitSelection(
    values: Record<string, string>,
    selection: CreateLeadCommitSelection,
): Record<string, string> {
    const next = { ...values };
    // Always mirror the primary Form rows — include_in_commit flips false while a row is
    // incomplete mid-edit; gating flats on include clears first/last/email and blocks Review.
    const parent = primaryParentForFlatSync(selection);
    const child = primaryChildForFlatSync(selection);

    next.first_name = parent?.first_name ?? "";
    next.last_name = parent?.last_name ?? "";
    next.email = parent?.email ?? "";
    next.phone = parent?.phone ?? "";
    if (parent?.extra_payload_values) {
        for (const [payloadKey, value] of Object.entries(parent.extra_payload_values)) {
            if ((value ?? "").trim()) next[payloadKey] = value;
        }
    }
    next.child_first_name = child?.first_name ?? "";
    next.child_last_name = child?.last_name ?? "";
    next.child_date_of_birth = child?.dob ?? "";
    if (child?.program_interest) next.child_program = child.program_interest;
    if (child?.start_date) next.child_start_date = child.start_date;
    if (child?.program_room_cohort_key) next.child_program_room_cohort_key = child.program_room_cohort_key;
    if (child?.schedule_type) next.child_schedule_type = child.schedule_type;
    if (child?.extra_payload_values) {
        for (const [payloadKey, value] of Object.entries(child.extra_payload_values)) {
            if ((value ?? "").trim()) next[payloadKey] = value;
        }
    }

    return next;
}

export function serializeCreateLeadCommitSelection(selection: CreateLeadCommitSelection): string {
    return JSON.stringify(selection);
}

export function parseCreateLeadCommitSelection(raw: unknown): CreateLeadCommitSelection | null {
    if (!raw) return null;
    let parsed: unknown = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as CreateLeadCommitSelection;
    if (obj.version !== 1 || !Array.isArray(obj.parents) || !Array.isArray(obj.children)) return null;
    return obj;
}

function newCandidateId(prefix: string): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `${prefix}:${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    }
    return `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function blankParentRecord(primary: boolean): CreateLeadCommitRecord {
    const record: CreateLeadCommitRecord = {
        candidate_id: newCandidateId("parent"),
        entity_type: "parent",
        role: "parent",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        dob: null,
        age_display: null,
        program_interest: null,
        start_date: null,
        program_room_cohort_key: null,
        schedule_type: null,
        extra_payload_values: {},
        include_in_commit: true,
        primary,
        validation_state: "invalid",
        commit_blockers: parentBlockers({ first_name: "", last_name: "", email: "", phone: "" }),
        source_fact_ids: [],
    };
    return recomputeRecord(record);
}

function blankChildRecord(primary: boolean): CreateLeadCommitRecord {
    const record: CreateLeadCommitRecord = {
        candidate_id: newCandidateId("child"),
        entity_type: "child",
        role: "child",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        dob: null,
        age_display: null,
        program_interest: null,
        start_date: null,
        program_room_cohort_key: null,
        schedule_type: null,
        extra_payload_values: {},
        include_in_commit: true,
        primary,
        validation_state: "invalid",
        commit_blockers: childBlockers({ first_name: "", last_name: "", dob: null }),
        source_fact_ids: [],
    };
    return recomputeRecord(record);
}

/** Empty Form selection — one required adult, no children. */
export function createEmptyCreateLeadCommitSelection(): CreateLeadCommitSelection {
    return {
        version: 1,
        parents: [blankParentRecord(true)],
        children: [],
        household_contacts: { email: null, phone: null, invalid_phone: false },
        address_review_only: false,
    };
}

export function addCreateLeadCommitParent(selection: CreateLeadCommitSelection): CreateLeadCommitSelection {
    return {
        ...selection,
        parents: [...selection.parents, blankParentRecord(selection.parents.length === 0)],
    };
}

export function addCreateLeadCommitChild(selection: CreateLeadCommitSelection): CreateLeadCommitSelection {
    return {
        ...selection,
        children: [...selection.children, blankChildRecord(selection.children.length === 0)],
    };
}

/**
 * Remove an adult or child. Refuses to remove the last remaining adult entry.
 * If the removed row was primary, promotes the first remaining sibling.
 */
export function removeCreateLeadCommitRecord(
    selection: CreateLeadCommitSelection,
    candidateId: string,
): { selection: CreateLeadCommitSelection; removed: boolean; reason?: string } {
    const parent = selection.parents.find((p) => p.candidate_id === candidateId);
    if (parent) {
        if (selection.parents.length <= 1) {
            return {
                selection,
                removed: false,
                reason: "At least one parent or guardian is required.",
            };
        }
        let parents = selection.parents.filter((p) => p.candidate_id !== candidateId);
        if (parent.primary && parents[0]) {
            parents = parents.map((p, i) => ({ ...p, primary: i === 0 }));
        }
        return { selection: { ...selection, parents }, removed: true };
    }
    const child = selection.children.find((c) => c.candidate_id === candidateId);
    if (!child) return { selection, removed: false, reason: "Person not found." };
    let children = selection.children.filter((c) => c.candidate_id !== candidateId);
    if (child.primary && children[0]) {
        children = children.map((c, i) => ({ ...c, primary: i === 0 }));
    }
    return { selection: { ...selection, children }, removed: true };
}

export function isCreateLeadCommitSelection(value: unknown): value is CreateLeadCommitSelection {
    return parseCreateLeadCommitSelection(value) != null;
}
