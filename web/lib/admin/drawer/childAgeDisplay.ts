import { inquiryChildAgeLabelFromDob } from "@/lib/admin/drawer/inquiryChildrenHydration";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/**
 * Canonical child age display — Person DOB when linked, else member/inquiry DOB fallback.
 * Age is never stored; derived from DOB only.
 */
export function resolveChildAgeDisplayLabel(args: {
    person_id?: string | null;
    person_date_of_birth?: string | null;
    member_dob?: string | null;
    inquiry_dob?: string | null;
}): string | null {
    const personId = trimOrNull(args.person_id);
    const personDob = trimOrNull(args.person_date_of_birth);
    const memberDob = trimOrNull(args.member_dob);
    const inquiryDob = trimOrNull(args.inquiry_dob);

    const dob = personId && personDob ? personDob : memberDob ?? inquiryDob;
    return inquiryChildAgeLabelFromDob(dob)?.label ?? null;
}
