import { resolveChildAgeDisplayLabel } from "@/lib/admin/drawer/childAgeDisplay";
import {
    resolveInquiryChildProgramCategoryLabel,
    resolveInquiryChildRoomCohortLabel,
    resolveInquiryChildScheduleLabel,
    type InquiryChildOcmPlacementSource,
} from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import { formatPhoneUS } from "@/lib/adminFormatters";

/** Display-only queue row patch — not authoritative; mirrors entity/OCM saves for live VM updates. */
export type OpportunityQueueChildDisplayPatch = {
    person_id?: string | null;
    customer_member_id?: string | null;
    display_name?: string | null;
    /** CRM compact `primary` (may include age suffix). */
    primary?: string | null;
    program_label?: string | null;
    schedule_label?: string | null;
    room_cohort_label?: string | null;
    location_label?: string | null;
};

export type OpportunityQueueRowDisplayPatch = {
    customer_name?: string | null;
    primary_contact_line?: string | null;
    primary_phone?: string | null;
    primary_email?: string | null;
    location_label?: string | null;
    requested_program?: string | null;
    child_display_name?: string | null;
    child?: OpportunityQueueChildDisplayPatch | null;
};

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function personDisplayName(person: Record<string, unknown>): string | null {
    const full = trimOrNull(person.full_name);
    if (full) return full;
    const joined = [person.first_name, person.last_name]
        .map((p) => trimOrNull(p))
        .filter(Boolean)
        .join(" ");
    return joined || null;
}

/** Build queue display patch after a person identity save (parent contact and/or linked child). */
export function buildQueueRowDisplayPatchFromPersonSave(args: {
    personId: string;
    patch: Record<string, unknown>;
    person?: Record<string, unknown> | null;
}): OpportunityQueueRowDisplayPatch {
    const merged = { ...(args.person ?? {}), ...args.patch };
    const name = personDisplayName(merged);
    const phoneRaw = merged.phone;
    const emailRaw = merged.email;
    const dob =
        merged.date_of_birth !== undefined || merged.dob !== undefined
            ? trimOrNull(merged.date_of_birth ?? merged.dob)
            : undefined;
    const age =
        dob !== undefined
            ? resolveChildAgeDisplayLabel({
                  person_id: args.personId,
                  person_date_of_birth: dob,
              })
            : null;
    const childPrimary = name ? (age ? `${name} (${age})` : name) : null;

    const out: OpportunityQueueRowDisplayPatch = {};
    if (name) {
        out.primary_contact_line = name;
        out.child = {
            person_id: args.personId,
            display_name: name,
            primary: childPrimary,
        };
    }
    if (phoneRaw !== undefined) {
        out.primary_phone = phoneRaw == null ? null : formatPhoneUS(String(phoneRaw)) || null;
    }
    if (emailRaw !== undefined) {
        out.primary_email = emailRaw == null ? null : String(emailRaw).trim() || null;
    }
    return out;
}

/** Build queue display patch from inquiry child row after OCM placement edit. */
export function buildQueueRowDisplayPatchFromInquiryChildRow(
    row: InquiryChildOcmPlacementSource & {
        person_id?: string | null;
        customer_member_id?: string | null;
        display_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        dob?: string | null;
        location_label?: string | null;
    },
    optionLabelLookup?: Map<string, string> | ReadonlyMap<string, string>
): OpportunityQueueRowDisplayPatch {
    const program = resolveInquiryChildProgramCategoryLabel({
        program_category_id: row.program_category_id,
        program_key: row.program_key,
        desired_program_label: row.desired_program_label,
        optionLabelLookup,
    });
    const schedule = resolveInquiryChildScheduleLabel({
        schedule_type: row.schedule_type,
        desired_schedule_label: row.desired_schedule_label,
        optionLabelLookup,
    });
    const room = resolveInquiryChildRoomCohortLabel({
        program_room_cohort_key: row.program_room_cohort_key,
        program_room_cohort_label: row.program_room_cohort_label,
        optionLabelLookup,
    });
    const display =
        trimOrNull(row.display_name) ||
        [row.first_name, row.last_name].map((p) => trimOrNull(p)).filter(Boolean).join(" ").trim() ||
        null;
    const age = resolveChildAgeDisplayLabel({
        person_id: row.person_id,
        person_date_of_birth: null,
        member_dob: row.dob,
        inquiry_dob: row.dob,
    });
    const primary = display ? (age ? `${display} (${age})` : display) : null;

    return {
        location_label: trimOrNull(row.location_label),
        requested_program: program,
        child_display_name: display,
        child: {
            person_id: row.person_id,
            customer_member_id: row.customer_member_id,
            display_name: display,
            primary,
            program_label: program,
            schedule_label: schedule,
            room_cohort_label: room,
            location_label: trimOrNull(row.location_label),
        },
    };
}

export function opportunityQueueRowDisplayPatchHasFields(
    patch: OpportunityQueueRowDisplayPatch | null | undefined
): boolean {
    if (!patch) return false;
    if (
        patch.customer_name !== undefined ||
        patch.primary_contact_line !== undefined ||
        patch.primary_phone !== undefined ||
        patch.primary_email !== undefined ||
        patch.location_label !== undefined ||
        patch.requested_program !== undefined ||
        patch.child_display_name !== undefined
    ) {
        return true;
    }
    const c = patch.child;
    if (!c) return false;
    return (
        c.person_id !== undefined ||
        c.customer_member_id !== undefined ||
        c.display_name !== undefined ||
        c.primary !== undefined ||
        c.program_label !== undefined ||
        c.schedule_label !== undefined ||
        c.room_cohort_label !== undefined ||
        c.location_label !== undefined
    );
}
