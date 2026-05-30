import { inquiryChildAgeLabelFromDob } from "@/lib/admin/drawer/inquiryChildrenHydration";
import { applyPersonPatchToOpportunityHydration } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { applyPersonPatchToOpportunityPersonList } from "@/lib/admin/drawer/primaryPersonCardEdit";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

type InquiryChildRow = {
    person_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    dob?: string | null;
    age?: string | null;
};

/** Merge person identity fields into opportunity `_inquiry_children` rows (display only; person is canonical). */
export function applyPersonPatchToOpportunityInquiryChildren(
    hostRecord: Record<string, unknown>,
    personId: string,
    patch: Record<string, unknown>,
    personJson?: Record<string, unknown> | null
): Record<string, unknown> {
    const pid = trimId(personId);
    if (!pid) return hostRecord;

    const rows = hostRecord._inquiry_children;
    if (!Array.isArray(rows)) return hostRecord;

    const mergedPerson = { ...(personJson ?? {}), ...patch };
    const nextRows = (rows as InquiryChildRow[]).map((row) => {
        if (trimId(row.person_id) !== pid) return row;

        const first =
            mergedPerson.first_name !== undefined
                ? (mergedPerson.first_name == null ? null : String(mergedPerson.first_name).trim() || null)
                : row.first_name;
        const last =
            mergedPerson.last_name !== undefined
                ? (mergedPerson.last_name == null ? null : String(mergedPerson.last_name).trim() || null)
                : row.last_name;

        let dob = row.dob;
        if (mergedPerson.date_of_birth !== undefined || mergedPerson.dob !== undefined) {
            const raw = mergedPerson.date_of_birth ?? mergedPerson.dob;
            dob = raw ? String(raw).slice(0, 10) : null;
        }

        const display =
            [first, last].filter(Boolean).join(" ").trim() ||
            (mergedPerson.full_name != null ? String(mergedPerson.full_name).trim() : null) ||
            row.display_name;

        const age = inquiryChildAgeLabelFromDob(dob)?.label ?? row.age ?? null;

        return {
            ...row,
            first_name: first ?? row.first_name,
            last_name: last ?? row.last_name,
            display_name: display,
            dob,
            age,
        };
    });

    return { ...hostRecord, _inquiry_children: nextRows };
}

function personIdentityScalarsForOpportunityMerge(
    patch: Record<string, unknown>,
    personJson?: Record<string, unknown> | null
): {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    date_of_birth?: string | null;
} {
    const merged = { ...(personJson ?? {}), ...patch };
    const first = merged.first_name;
    const last = merged.last_name;
    const full =
        merged.full_name != null
            ? String(merged.full_name).trim() || null
            : [first, last]
                  .map((p) => (p == null ? "" : String(p).trim()))
                  .filter(Boolean)
                  .join(" ")
                  .trim() || null;
    const email =
        merged.email === undefined
            ? undefined
            : merged.email == null
              ? null
              : String(merged.email).trim() || null;
    const phone =
        merged.phone === undefined
            ? undefined
            : merged.phone == null
              ? null
              : String(merged.phone).trim() || null;
    const date_of_birth =
        merged.date_of_birth !== undefined || merged.dob !== undefined
            ? merged.date_of_birth ?? merged.dob
                ? String(merged.date_of_birth ?? merged.dob).slice(0, 10)
                : null
            : undefined;
    return {
        first_name: first == null ? undefined : String(first).trim() || null,
        last_name: last == null ? undefined : String(last).trim() || null,
        full_name: full,
        email,
        phone,
        date_of_birth,
    };
}

/**
 * Patch person identity mirrors on an open opportunity host (inquiry children + primary person + header mirrors).
 * Person remains canonical; opportunity fields are display-only.
 */
export function applyPersonIdentityPatchToOpportunityHost(
    hostRecord: Record<string, unknown>,
    personId: string,
    patch: Record<string, unknown>,
    personJson?: Record<string, unknown> | null
): Record<string, unknown> {
    const scalars = personIdentityScalarsForOpportunityMerge(patch, personJson);
    let next = applyPersonPatchToOpportunityInquiryChildren(hostRecord, personId, patch, personJson);
    applyPersonPatchToOpportunityPersonList(next, personId, scalars);
    applyPersonPatchToOpportunityHydration(next, scalars);
    return next;
}

/** Merge person identity scalars onto an open person drawer record (DOB + name). */
export function applyPersonIdentityPatchToPersonRecord(
    record: Record<string, unknown>,
    patch: Record<string, unknown>,
    personJson?: Record<string, unknown> | null
): Record<string, unknown> {
    const merged = { ...record, ...(personJson ?? {}), ...patch };
    const dobRaw = merged.date_of_birth ?? merged.dob;
    if (dobRaw !== undefined) {
        const iso = dobRaw ? String(dobRaw).slice(0, 10) : null;
        merged.date_of_birth = iso;
        merged.dob = iso;
    }
    return merged;
}
